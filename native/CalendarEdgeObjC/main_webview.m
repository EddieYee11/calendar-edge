#import <AppKit/AppKit.h>
#import <EventKit/EventKit.h>
#import <QuartzCore/QuartzCore.h>
#import <WebKit/WebKit.h>

static NSString * const CECalendarAppPath = @"/System/Applications/Calendar.app";
static NSString * const CERemindersAppPath = @"/System/Applications/Reminders.app";
static NSString * const CEBridgeName = @"calendarEdge";

#pragma mark - Helpers

static NSString *CEJSONStringFromObject(id object) {
    NSError *error = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:object options:0 error:&error];
    if (!data || error) {
        return @"{}";
    }

    NSString *string = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    return string ?: @"{}";
}

static NSString *CEEscapedURLComponent(NSString *value) {
    return [value stringByAddingPercentEncodingWithAllowedCharacters:NSCharacterSet.URLPathAllowedCharacterSet] ?: value;
}

static NSString *CEHexStringFromColor(CGColorRef colorRef) {
    if (!colorRef) {
        return @"#e59373";
    }

    NSColor *color = [[NSColor colorWithCGColor:colorRef] colorUsingColorSpace:NSColorSpace.sRGBColorSpace];
    if (!color) {
        return @"#e59373";
    }

    NSInteger red = (NSInteger)round(color.redComponent * 255.0);
    NSInteger green = (NSInteger)round(color.greenComponent * 255.0);
    NSInteger blue = (NSInteger)round(color.blueComponent * 255.0);
    return [NSString stringWithFormat:@"#%02lx%02lx%02lx", (long)red, (long)green, (long)blue];
}

static NSDate *CEStartOfDay(NSCalendar *calendar, NSDate *date) {
    return [calendar startOfDayForDate:date];
}

static NSDate *CEEndOfDay(NSCalendar *calendar, NSDate *date) {
    NSDate *start = [calendar startOfDayForDate:date];
    NSDateComponents *components = [[NSDateComponents alloc] init];
    components.day = 1;
    NSDate *next = [calendar dateByAddingComponents:components toDate:start options:0];
    return [next dateByAddingTimeInterval:-1];
}

static NSString *CEISO8601String(NSDate *date) {
    static NSISO8601DateFormatter *formatter = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        formatter = [[NSISO8601DateFormatter alloc] init];
        formatter.formatOptions = NSISO8601DateFormatWithInternetDateTime;
    });

    return [formatter stringFromDate:date];
}

static NSDate *CEDateFromDateComponents(NSDateComponents *components, NSCalendar *calendar) {
    if (!components) {
        return nil;
    }

    NSDateComponents *normalized = [components copy];
    normalized.calendar = normalized.calendar ?: calendar;
    normalized.timeZone = normalized.timeZone ?: NSTimeZone.localTimeZone;
    return [calendar dateFromComponents:normalized];
}

static NSURL *CEApplicationURL(NSString *path) {
    return [NSURL fileURLWithPath:path];
}

static NSString *CEFirstURLMatch(NSString *text) {
    if (text.length == 0) {
        return nil;
    }

    NSError *error = nil;
    NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:@"https?://[^\\s<>\"']+"
                                                                           options:NSRegularExpressionCaseInsensitive
                                                                             error:&error];
    if (error) {
        return nil;
    }

    NSArray<NSTextCheckingResult *> *matches = [regex matchesInString:text options:0 range:NSMakeRange(0, text.length)];
    if (matches.count == 0) {
        return nil;
    }

    NSArray<NSString *> *preferredHosts = @[@"zoom", @"feishu", @"tencent", @"meet.google", @"teams", @"webex"];

    for (NSTextCheckingResult *match in matches) {
        NSString *candidate = [text substringWithRange:match.range];
        for (NSString *host in preferredHosts) {
            if ([candidate localizedCaseInsensitiveContainsString:host]) {
                return candidate;
            }
        }
    }

    NSTextCheckingResult *first = matches.firstObject;
    return [text substringWithRange:first.range];
}

static NSString *CEJoinURLForEvent(EKEvent *event) {
    if (event.URL.absoluteString.length > 0) {
        return event.URL.absoluteString;
    }

    NSString *fromLocation = CEFirstURLMatch(event.location ?: @"");
    if (fromLocation.length > 0) {
        return fromLocation;
    }

    NSString *fromNotes = CEFirstURLMatch(event.notes ?: @"");
    if (fromNotes.length > 0) {
        return fromNotes;
    }

    return nil;
}

static void CEOpenApplication(NSString *path) {
    [[NSWorkspace sharedWorkspace] openApplicationAtURL:CEApplicationURL(path)
                                           configuration:[NSWorkspaceOpenConfiguration configuration]
                                       completionHandler:nil];
}

#pragma mark - Panel Window

@interface CEPanelWindow : NSPanel
@end

@implementation CEPanelWindow

- (BOOL)canBecomeKey {
    return YES;
}

- (BOOL)canBecomeKeyWindow {
    return YES;
}

- (BOOL)canBecomeMain {
    return YES;
}

@end

#pragma mark - Data Provider

typedef void (^CEPermissionHandler)(NSDictionary *permissions);
typedef void (^CESnapshotHandler)(NSDictionary *snapshot);

@interface CEDataProvider : NSObject
@property (nonatomic, strong) EKEventStore *eventStore;
@property (nonatomic, strong) NSCalendar *calendar;
@property (nonatomic, strong) dispatch_queue_t workerQueue;
- (void)loadSnapshotWithCompletion:(CESnapshotHandler)completion;
- (void)toggleReminderWithIdentifier:(NSString *)identifier completed:(BOOL)completed completion:(dispatch_block_t)completion;
- (void)openCalendarEvent:(NSDictionary *)payload;
- (void)openReminderItem:(NSDictionary *)payload;
@end

@implementation CEDataProvider

- (instancetype)init {
    self = [super init];
    if (self) {
        _eventStore = [[EKEventStore alloc] init];
        _calendar = [NSCalendar currentCalendar];
        _workerQueue = dispatch_queue_create("local.codex.calendaredge.data", DISPATCH_QUEUE_SERIAL);
    }
    return self;
}

- (void)loadSnapshotWithCompletion:(CESnapshotHandler)completion {
    [self requestPermissionsWithCompletion:^(NSDictionary *permissions) {
        dispatch_async(self.workerQueue, ^{
            NSMutableDictionary *snapshot = [@{
                @"fetchedAt": CEISO8601String([NSDate date]),
                @"permissions": permissions,
                @"events": @[],
                @"reminders": @[]
            } mutableCopy];

            BOOL calendarGranted = [permissions[@"calendar"][@"granted"] boolValue];
            BOOL remindersGranted = [permissions[@"reminders"][@"granted"] boolValue];

            if (calendarGranted) {
                snapshot[@"events"] = [self fetchEvents];
            }

            if (remindersGranted) {
                snapshot[@"reminders"] = [self fetchReminders];
            }

            dispatch_async(dispatch_get_main_queue(), ^{
                completion(snapshot);
            });
        });
    }];
}

- (void)toggleReminderWithIdentifier:(NSString *)identifier completed:(BOOL)completed completion:(dispatch_block_t)completion {
    if (identifier.length == 0) {
        if (completion) {
            completion();
        }
        return;
    }

    dispatch_async(self.workerQueue, ^{
        EKReminder *reminder = (EKReminder *)[self.eventStore calendarItemWithIdentifier:identifier];
        if ([reminder isKindOfClass:EKReminder.class]) {
            reminder.completed = completed;
            reminder.completionDate = completed ? [NSDate date] : nil;

            NSError *error = nil;
            [self.eventStore saveReminder:reminder commit:YES error:&error];
            if (error) {
                NSLog(@"[CalendarEdge] Failed to toggle reminder: %@", error);
            }
        }

        dispatch_async(dispatch_get_main_queue(), ^{
            if (completion) {
                completion();
            }
        });
    });
}

- (void)openCalendarEvent:(NSDictionary *)payload {
    NSString *externalIdentifier = payload[@"externalIdentifier"];
    if (externalIdentifier.length == 0) {
        CEOpenApplication(CECalendarAppPath);
        return;
    }

    NSString *escapedID = [externalIdentifier stringByReplacingOccurrencesOfString:@"\"" withString:@"\\\""];
    NSString *scriptSource =
        [NSString stringWithFormat:
            @"tell application \"Calendar\"\n"
             "activate\n"
             "set targetEvent to missing value\n"
             "repeat with theCalendar in calendars\n"
             "set matches to (every event of theCalendar whose uid is \"%@\")\n"
             "if (count of matches) > 0 then\n"
             "set targetEvent to item 1 of matches\n"
             "exit repeat\n"
             "end if\n"
             "end repeat\n"
             "if targetEvent is not missing value then\n"
             "show targetEvent\n"
             "end if\n"
             "end tell",
            escapedID];

    NSAppleScript *script = [[NSAppleScript alloc] initWithSource:scriptSource];
    NSDictionary *errorInfo = nil;
    [script executeAndReturnError:&errorInfo];
    if (errorInfo) {
        NSLog(@"[CalendarEdge] AppleScript show event failed: %@", errorInfo);
        CEOpenApplication(CECalendarAppPath);
    }
}

- (void)openReminderItem:(NSDictionary *)payload {
    NSString *externalIdentifier = payload[@"externalIdentifier"];
    NSString *identifier = payload[@"identifier"];

    NSArray<NSString *> *candidates = @[
        externalIdentifier.length > 0 ? [NSString stringWithFormat:@"x-apple-reminderkit://REMCDReminder/%@", CEEscapedURLComponent(externalIdentifier)] : @"",
        identifier.length > 0 ? [NSString stringWithFormat:@"x-apple-reminderkit://REMCDReminder/%@", CEEscapedURLComponent(identifier)] : @"",
        @"x-apple-reminderkit://"
    ];

    for (NSString *candidate in candidates) {
        if (candidate.length == 0) {
            continue;
        }

        NSURL *url = [NSURL URLWithString:candidate];
        if (url && [[NSWorkspace sharedWorkspace] openURL:url]) {
            return;
        }
    }

    CEOpenApplication(CERemindersAppPath);
}

- (void)requestPermissionsWithCompletion:(CEPermissionHandler)completion {
    [self resolveCalendarPermission:^(NSDictionary *calendarPermission) {
        [self resolveRemindersPermission:^(NSDictionary *remindersPermission) {
            completion(@{
                @"calendar": calendarPermission,
                @"reminders": remindersPermission
            });
        }];
    }];
}

- (void)resolveCalendarPermission:(void (^)(NSDictionary *permission))completion {
    EKAuthorizationStatus status = [EKEventStore authorizationStatusForEntityType:EKEntityTypeEvent];
    switch (status) {
#if __MAC_OS_X_VERSION_MAX_ALLOWED >= 140000
        case EKAuthorizationStatusFullAccess:
            completion(@{@"granted": @YES, @"message": @""});
            return;
        case EKAuthorizationStatusWriteOnly:
            completion(@{@"granted": @NO, @"message": @"当前只有写入权限，无法读取日历内容。请在系统设置里授予完整访问权限。"});
            return;
#else
        case EKAuthorizationStatusAuthorized:
            completion(@{@"granted": @YES, @"message": @""});
            return;
#endif
        case EKAuthorizationStatusRestricted:
            completion(@{@"granted": @NO, @"message": @"系统策略限制了日历访问。"});
            return;
        case EKAuthorizationStatusDenied:
            completion(@{@"granted": @NO, @"message": @"你已拒绝日历访问。请到“系统设置 > 隐私与安全性 > 日历”里打开 CalendarEdge。"});
            return;
        case EKAuthorizationStatusNotDetermined:
            [self requestCalendarPermission:completion];
            return;
    }

    completion(@{@"granted": @NO, @"message": @"无法确认日历权限状态。"});
}

- (void)resolveRemindersPermission:(void (^)(NSDictionary *permission))completion {
    EKAuthorizationStatus status = [EKEventStore authorizationStatusForEntityType:EKEntityTypeReminder];
    switch (status) {
#if __MAC_OS_X_VERSION_MAX_ALLOWED >= 140000
        case EKAuthorizationStatusFullAccess:
            completion(@{@"granted": @YES, @"message": @""});
            return;
        case EKAuthorizationStatusWriteOnly:
            completion(@{@"granted": @NO, @"message": @"当前只有写入权限，无法读取提醒事项。请在系统设置里授予完整访问权限。"});
            return;
#else
        case EKAuthorizationStatusAuthorized:
            completion(@{@"granted": @YES, @"message": @""});
            return;
#endif
        case EKAuthorizationStatusRestricted:
            completion(@{@"granted": @NO, @"message": @"系统策略限制了提醒事项访问。"});
            return;
        case EKAuthorizationStatusDenied:
            completion(@{@"granted": @NO, @"message": @"你已拒绝提醒事项访问。请到“系统设置 > 隐私与安全性 > 提醒事项”里打开 CalendarEdge。"});
            return;
        case EKAuthorizationStatusNotDetermined:
            [self requestRemindersPermission:completion];
            return;
    }

    completion(@{@"granted": @NO, @"message": @"无法确认提醒事项权限状态。"});
}

- (void)requestCalendarPermission:(void (^)(NSDictionary *permission))completion {
    if (@available(macOS 14.0, *)) {
        [self.eventStore requestFullAccessToEventsWithCompletion:^(BOOL granted, NSError * _Nullable error) {
            dispatch_async(dispatch_get_main_queue(), ^{
                completion(@{
                    @"granted": @(granted),
                    @"message": granted ? @"" : (error.localizedDescription ?: @"未获得日历访问权限。")
                });
            });
        }];
        return;
    }

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    [self.eventStore requestAccessToEntityType:EKEntityTypeEvent completion:^(BOOL granted, NSError * _Nullable error) {
        dispatch_async(dispatch_get_main_queue(), ^{
            completion(@{
                @"granted": @(granted),
                @"message": granted ? @"" : (error.localizedDescription ?: @"未获得日历访问权限。")
            });
        });
    }];
#pragma clang diagnostic pop
}

- (void)requestRemindersPermission:(void (^)(NSDictionary *permission))completion {
    if (@available(macOS 14.0, *)) {
        [self.eventStore requestFullAccessToRemindersWithCompletion:^(BOOL granted, NSError * _Nullable error) {
            dispatch_async(dispatch_get_main_queue(), ^{
                completion(@{
                    @"granted": @(granted),
                    @"message": granted ? @"" : (error.localizedDescription ?: @"未获得提醒事项访问权限。")
                });
            });
        }];
        return;
    }

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    [self.eventStore requestAccessToEntityType:EKEntityTypeReminder completion:^(BOOL granted, NSError * _Nullable error) {
        dispatch_async(dispatch_get_main_queue(), ^{
            completion(@{
                @"granted": @(granted),
                @"message": granted ? @"" : (error.localizedDescription ?: @"未获得提醒事项访问权限。")
            });
        });
    }];
#pragma clang diagnostic pop
}

- (NSArray<NSDictionary *> *)fetchEvents {
    NSDate *today = [NSDate date];
    NSDate *start = CEStartOfDay(self.calendar, today);
    NSDateComponents *components = [[NSDateComponents alloc] init];
    components.day = 8;
    NSDate *end = [self.calendar dateByAddingComponents:components toDate:start options:0];

    NSPredicate *predicate = [self.eventStore predicateForEventsWithStartDate:start
                                                                      endDate:end
                                                                    calendars:[self.eventStore calendarsForEntityType:EKEntityTypeEvent]];
    NSArray<EKEvent *> *events = [[self.eventStore eventsMatchingPredicate:predicate]
        sortedArrayUsingComparator:^NSComparisonResult(EKEvent *lhs, EKEvent *rhs) {
            return [lhs.startDate compare:rhs.startDate];
        }];

    NSMutableArray<NSDictionary *> *result = [NSMutableArray array];
    for (EKEvent *event in events) {
        NSString *joinURL = CEJoinURLForEvent(event);
        NSDictionary *entry = @{
            @"identifier": event.eventIdentifier ?: @"",
            @"externalIdentifier": event.calendarItemExternalIdentifier ?: @"",
            @"title": event.title.length > 0 ? event.title : @"未命名日程",
            @"calendarTitle": event.calendar.title ?: @"日历",
            @"calendarColor": CEHexStringFromColor(event.calendar.CGColor),
            @"startAt": CEISO8601String(event.startDate),
            @"endAt": CEISO8601String(event.endDate),
            @"location": event.location ?: [NSNull null],
            @"joinURL": joinURL ?: [NSNull null],
            @"isAllDay": @(event.isAllDay)
        };
        [result addObject:entry];
    }

    return result;
}

- (NSArray<NSDictionary *> *)fetchReminders {
    NSPredicate *predicate = [self.eventStore predicateForIncompleteRemindersWithDueDateStarting:nil ending:nil calendars:nil];
    dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
    __block NSArray<EKReminder *> *fetched = @[];

    [self.eventStore fetchRemindersMatchingPredicate:predicate completion:^(NSArray<EKReminder *> * _Nullable reminders) {
        fetched = reminders ?: @[];
        dispatch_semaphore_signal(semaphore);
    }];

    dispatch_semaphore_wait(semaphore, DISPATCH_TIME_FOREVER);

    NSDate *today = [NSDate date];
    NSDate *todayStart = CEStartOfDay(self.calendar, today);
    NSMutableArray<NSDictionary *> *result = [NSMutableArray array];

    NSArray<EKReminder *> *sorted = [fetched sortedArrayUsingComparator:^NSComparisonResult(EKReminder *lhs, EKReminder *rhs) {
        NSDate *left = CEDateFromDateComponents(lhs.dueDateComponents, self.calendar) ?: [NSDate distantFuture];
        NSDate *right = CEDateFromDateComponents(rhs.dueDateComponents, self.calendar) ?: [NSDate distantFuture];
        return [left compare:right];
    }];

    for (EKReminder *reminder in sorted) {
        NSDate *dueDate = CEDateFromDateComponents(reminder.dueDateComponents, self.calendar);
        BOOL overdue = NO;
        if (dueDate) {
            overdue = [CEStartOfDay(self.calendar, dueDate) compare:todayStart] == NSOrderedAscending;
        }

        NSDictionary *entry = @{
            @"identifier": reminder.calendarItemIdentifier ?: @"",
            @"externalIdentifier": reminder.calendarItemExternalIdentifier ?: @"",
            @"title": reminder.title.length > 0 ? reminder.title : @"未命名提醒",
            @"listIdentifier": reminder.calendar.calendarIdentifier ?: @"",
            @"listTitle": reminder.calendar.title ?: @"提醒事项",
            @"listColor": CEHexStringFromColor(reminder.calendar.CGColor),
            @"dueAt": dueDate ? CEISO8601String(dueDate) : [NSNull null],
            @"completed": @(reminder.completed),
            @"isOverdue": @(overdue)
        };
        [result addObject:entry];
    }

    return result;
}

@end

#pragma mark - Hotspot

@interface CEHotspotView : NSView
@property (nonatomic, copy) dispatch_block_t onEnter;
@property (nonatomic, copy) dispatch_block_t onExit;
@property (nonatomic, copy) dispatch_block_t onClick;
@property (nonatomic, strong, nullable) NSTrackingArea *trackingAreaRef;
- (instancetype)initWithFrame:(NSRect)frame onEnter:(dispatch_block_t)onEnter onExit:(dispatch_block_t)onExit onClick:(dispatch_block_t)onClick;
@end

@implementation CEHotspotView

- (instancetype)initWithFrame:(NSRect)frame onEnter:(dispatch_block_t)onEnter onExit:(dispatch_block_t)onExit onClick:(dispatch_block_t)onClick {
    self = [super initWithFrame:frame];
    if (self) {
        _onEnter = [onEnter copy];
        _onExit = [onExit copy];
        _onClick = [onClick copy];
        self.wantsLayer = YES;
        self.layer.backgroundColor = NSColor.clearColor.CGColor;
    }
    return self;
}

- (void)updateTrackingAreas {
    [super updateTrackingAreas];
    if (self.trackingAreaRef) {
        [self removeTrackingArea:self.trackingAreaRef];
    }

    NSTrackingArea *tracking = [[NSTrackingArea alloc] initWithRect:self.bounds
                                                            options:NSTrackingMouseEnteredAndExited | NSTrackingActiveAlways | NSTrackingInVisibleRect
                                                              owner:self
                                                           userInfo:nil];
    self.trackingAreaRef = tracking;
    [self addTrackingArea:tracking];
}

- (void)mouseEntered:(NSEvent *)event {
    if (self.onEnter) {
        self.onEnter();
    }
}

- (void)mouseExited:(NSEvent *)event {
    if (self.onExit) {
        self.onExit();
    }
}

- (void)mouseUp:(NSEvent *)event {
    if (self.onClick) {
        self.onClick();
    }
}

@end

@interface CEEdgeHotspotWindow : NSWindow
- (instancetype)initWithScreen:(NSScreen *)screen onEnter:(dispatch_block_t)onEnter onExit:(dispatch_block_t)onExit onClick:(dispatch_block_t)onClick;
@end

@implementation CEEdgeHotspotWindow

- (instancetype)initWithScreen:(NSScreen *)screen onEnter:(dispatch_block_t)onEnter onExit:(dispatch_block_t)onExit onClick:(dispatch_block_t)onClick {
    NSRect visibleFrame = screen.visibleFrame;
    CGFloat width = 8.0;
    NSRect frame = NSMakeRect(NSMaxX(visibleFrame) - width, NSMinY(visibleFrame), width, visibleFrame.size.height);
    self = [super initWithContentRect:frame styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:NO];
    if (self) {
        self.releasedWhenClosed = NO;
        self.level = NSStatusWindowLevel;
        self.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary;
        self.opaque = NO;
        self.backgroundColor = NSColor.clearColor;
        self.hasShadow = NO;
        self.ignoresMouseEvents = NO;
        self.contentView = [[CEHotspotView alloc] initWithFrame:NSMakeRect(0, 0, width, visibleFrame.size.height)
                                                       onEnter:onEnter
                                                        onExit:onExit
                                                       onClick:onClick];
    }
    return self;
}

@end

#pragma mark - Bundle URL Scheme Handler

// 通过 app:// scheme 提供 WebUI 资源，避免 file:// 对 <script type="module"> 的静默限制

static NSDictionary<NSString *, NSString *> *CEMIMETypes(void) {
    static NSDictionary *types = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        types = @{
            @"html":  @"text/html; charset=utf-8",
            @"js":    @"text/javascript; charset=utf-8",
            @"css":   @"text/css; charset=utf-8",
            @"json":  @"application/json",
            @"png":   @"image/png",
            @"jpg":   @"image/jpeg",
            @"jpeg":  @"image/jpeg",
            @"svg":   @"image/svg+xml",
            @"ico":   @"image/x-icon",
            @"woff2": @"font/woff2",
            @"woff":  @"font/woff",
        };
    });
    return types;
}

@interface CEBundleSchemeHandler : NSObject <WKURLSchemeHandler>
@end

@implementation CEBundleSchemeHandler

- (void)webView:(WKWebView *)webView startURLSchemeTask:(id<WKURLSchemeTask>)urlSchemeTask {
    NSURL *url = urlSchemeTask.request.URL;
    NSString *path = url.path;

    NSString *relativePath = [path hasPrefix:@"/"] ? [path substringFromIndex:1] : path;
    NSString *webUIDir = [[NSBundle mainBundle] pathForResource:@"WebUI" ofType:nil];
    NSString *filePath = [webUIDir stringByAppendingPathComponent:relativePath];

    NSData *data = [NSData dataWithContentsOfFile:filePath];
    if (!data) {
        NSHTTPURLResponse *notFound = [[NSHTTPURLResponse alloc] initWithURL:url statusCode:404
                                                                 HTTPVersion:@"HTTP/1.1" headerFields:nil];
        [urlSchemeTask didReceiveResponse:notFound];
        [urlSchemeTask didFinish];
        return;
    }

    NSString *ext = url.pathExtension.lowercaseString;
    NSString *mimeType = CEMIMETypes()[ext] ?: @"application/octet-stream";

    NSHTTPURLResponse *response = [[NSHTTPURLResponse alloc] initWithURL:url statusCode:200
                                                             HTTPVersion:@"HTTP/1.1"
                                                            headerFields:@{
        @"Content-Type":   mimeType,
        @"Content-Length": @(data.length).stringValue,
        @"Cache-Control":  @"no-cache",
    }];
    [urlSchemeTask didReceiveResponse:response];
    [urlSchemeTask didReceiveData:data];
    [urlSchemeTask didFinish];
}

- (void)webView:(WKWebView *)webView stopURLSchemeTask:(id<WKURLSchemeTask>)urlSchemeTask {
    // 同步文件读取，无需取消逻辑
}

@end

#pragma mark - Slide Panel Controller

@interface CESlidePanelController : NSObject <WKScriptMessageHandler, WKNavigationDelegate>
@property (nonatomic, strong) CEDataProvider *dataProvider;
@property (nonatomic, strong) CEPanelWindow *panel;
@property (nonatomic, strong) WKWebView *webView;
@property (nonatomic, assign) BOOL visible;
@property (nonatomic, assign) BOOL webReady;
@property (nonatomic, assign) NSRect safeHoverFrame;
@property (nonatomic, strong, nullable) NSTimer *mouseWatchTimer;
@property (nonatomic, strong, nullable) NSTimer *refreshTimer;
@property (nonatomic, strong, nullable) id localKeyMonitor;
- (instancetype)initWithDataProvider:(CEDataProvider *)dataProvider;
- (NSRect)safeHoverFrameForScreen:(NSScreen *)screen;
- (void)updateSafeHoverFrame:(NSRect)frame;
- (void)toggleForScreen:(NSScreen *)screen;
- (void)showOnScreen:(NSScreen *)screen;
- (void)hide;
- (void)refreshSnapshot;
@end

@implementation CESlidePanelController

- (instancetype)initWithDataProvider:(CEDataProvider *)dataProvider {
    self = [super init];
    if (self) {
        _dataProvider = dataProvider;

        WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
        // 注册自定义 scheme，使 ES 模块在 WKWebView 中正常加载（file:// 静默阻止模块脚本）
        [configuration setURLSchemeHandler:[CEBundleSchemeHandler new] forURLScheme:@"app"];
        WKUserContentController *userContentController = [[WKUserContentController alloc] init];
        [userContentController addScriptMessageHandler:self name:CEBridgeName];
        configuration.userContentController = userContentController;

        _webView = [[WKWebView alloc] initWithFrame:NSMakeRect(0, 0, 420, 760) configuration:configuration];
        _webView.navigationDelegate = self;
        _webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
        // 透明 WebView：让 CSS backdrop-filter 透出桌面背景，实现毛玻璃效果
        [_webView setValue:@NO forKey:@"drawsBackground"];

        _panel = [[CEPanelWindow alloc] initWithContentRect:NSMakeRect(0, 0, 420, 760)
                                                  styleMask:NSWindowStyleMaskBorderless
                                                    backing:NSBackingStoreBuffered
                                                      defer:NO];
        _panel.releasedWhenClosed = NO;
        _panel.floatingPanel = YES;
        _panel.level = NSStatusWindowLevel;
        _panel.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces
                                  | NSWindowCollectionBehaviorFullScreenAuxiliary
                                  | NSWindowCollectionBehaviorStationary;
        _panel.opaque = NO;
        _panel.backgroundColor = [NSColor clearColor];
        _panel.hasShadow = YES;
        _panel.hidesOnDeactivate = NO;
        _panel.contentView = _webView;

        [self loadWebUI];
    }
    return self;
}

- (void)dealloc {
    [self.webView.configuration.userContentController removeScriptMessageHandlerForName:CEBridgeName];
    if (self.localKeyMonitor) {
        [NSEvent removeMonitor:self.localKeyMonitor];
    }
}

- (void)loadWebUI {
    // 使用自定义 app:// scheme 加载，绕过 file:// 对 ES 模块的限制
    NSURL *url = [NSURL URLWithString:@"app://app/index.html"];
    [self.webView loadRequest:[NSURLRequest requestWithURL:url]];
}

- (void)updateSafeHoverFrame:(NSRect)frame {
    self.safeHoverFrame = frame;
}

- (void)toggleForScreen:(NSScreen *)screen {
    self.visible ? [self hide] : [self showOnScreen:screen];
}

- (void)showOnScreen:(NSScreen *)screen {
    screen = screen ?: NSScreen.mainScreen ?: NSScreen.screens.firstObject;
    if (!screen) {
        return;
    }

    if (self.visible) {
        return;
    }

    self.safeHoverFrame = [self safeHoverFrameForScreen:screen];
    NSRect startFrame = [self panelFrameForScreen:screen offscreen:YES];
    NSRect endFrame = [self panelFrameForScreen:screen offscreen:NO];

    [self.panel setFrame:startFrame display:NO];
    [self.panel orderFrontRegardless];  // 改用 orderFrontRegardless 确保强制置顶
    [NSApp activateIgnoringOtherApps:YES];

    [NSAnimationContext runAnimationGroup:^(NSAnimationContext *context) {
        context.duration = 0.22;
        context.timingFunction = [CAMediaTimingFunction functionWithName:kCAMediaTimingFunctionEaseInEaseOut];
        [[self.panel animator] setFrame:endFrame display:YES];
    } completionHandler:nil];

    self.visible = YES;
    [self installLocalKeyMonitor];
    // 延迟 0.8s 再启动 mouseWatcher：让用户有时间从边缘移入面板，避免动画期间误关闭
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.8 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        if (self.visible) {
            [self startMouseWatcher];
        }
    });
    [self startRefreshTimer];
    [self refreshSnapshot];
}

- (void)hide {
    if (!self.visible) {
        return;
    }

    NSScreen *screen = self.panel.screen ?: NSScreen.mainScreen ?: NSScreen.screens.firstObject;
    if (!screen) {
        [self.panel orderOut:nil];
        self.visible = NO;
        [self stopMouseWatcher];
        [self stopRefreshTimer];
        return;
    }

    NSRect targetFrame = [self panelFrameForScreen:screen offscreen:YES];
    [NSAnimationContext runAnimationGroup:^(NSAnimationContext *context) {
        context.duration = 0.18;
        [[self.panel animator] setFrame:targetFrame display:NO];
    } completionHandler:^{
        [self.panel orderOut:nil];
    }];

    self.visible = NO;
    [self stopMouseWatcher];
    [self stopRefreshTimer];
}

- (void)refreshSnapshot {
    [self.dataProvider loadSnapshotWithCompletion:^(NSDictionary *snapshot) {
        if (self.webReady) {
            [self pushSnapshot:snapshot];
        }
    }];
}

- (void)pushSnapshot:(NSDictionary *)snapshot {
    NSString *json = CEJSONStringFromObject(snapshot);
    NSString *script = [NSString stringWithFormat:@"window.CalendarEdgeNative && window.CalendarEdgeNative.receiveSnapshot(%@);", json];
    [self.webView evaluateJavaScript:script completionHandler:^(id _Nullable result, NSError * _Nullable error) {
        if (error) {
            NSLog(@"[CalendarEdge] Failed to push snapshot: %@", error);
        }
    }];
}

- (NSRect)safeHoverFrameForScreen:(NSScreen *)screen {
    NSScreen *targetScreen = screen ?: NSScreen.mainScreen ?: NSScreen.screens.firstObject;
    if (!targetScreen) {
        return NSZeroRect;
    }

    NSRect visibleFrame = targetScreen.visibleFrame;
    CGFloat width = 18.0;
    return NSMakeRect(NSMaxX(visibleFrame) - width, NSMinY(visibleFrame), width, visibleFrame.size.height);
}

- (NSRect)panelFrameForScreen:(NSScreen *)screen offscreen:(BOOL)offscreen {
    NSRect visibleFrame = screen.visibleFrame;
    CGFloat width = 420.0;
    CGFloat height = MIN(760.0, visibleFrame.size.height - 26.0);
    CGFloat y = NSMidY(visibleFrame) - height / 2.0;
    CGFloat x = offscreen ? NSMaxX(visibleFrame) + 10.0 : NSMaxX(visibleFrame) - width - 10.0;
    return NSMakeRect(x, y, width, height);
}

- (void)startMouseWatcher {
    [self stopMouseWatcher];
    self.mouseWatchTimer = [NSTimer scheduledTimerWithTimeInterval:0.12 target:self selector:@selector(handleMouseWatchTick) userInfo:nil repeats:YES];
}

- (void)stopMouseWatcher {
    [self.mouseWatchTimer invalidate];
    self.mouseWatchTimer = nil;
}

- (void)startRefreshTimer {
    [self stopRefreshTimer];
    self.refreshTimer = [NSTimer scheduledTimerWithTimeInterval:60.0 target:self selector:@selector(refreshSnapshot) userInfo:nil repeats:YES];
}

- (void)stopRefreshTimer {
    [self.refreshTimer invalidate];
    self.refreshTimer = nil;
}

- (void)handleMouseWatchTick {
    if (!self.visible) {
        return;
    }

    NSPoint location = [NSEvent mouseLocation];
    if (!NSPointInRect(location, self.panel.frame) && !NSPointInRect(location, self.safeHoverFrame)) {
        [self hide];
    }
}

- (void)installLocalKeyMonitor {
    if (self.localKeyMonitor) {
        return;
    }

    __weak typeof(self) weakSelf = self;
    self.localKeyMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown handler:^NSEvent * _Nullable(NSEvent * _Nonnull event) {
        if (event.keyCode == 53) {
            [weakSelf hide];
            return nil;
        }

        return event;
    }];
}

#pragma mark WKNavigationDelegate

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    self.webReady = NO;
}

#pragma mark WKScriptMessageHandler

- (void)userContentController:(WKUserContentController *)userContentController didReceiveScriptMessage:(WKScriptMessage *)message {
    if (![message.body isKindOfClass:NSDictionary.class]) {
        return;
    }

    NSDictionary *payload = (NSDictionary *)message.body;
    NSString *type = payload[@"type"];

    if ([type isEqualToString:@"ready"]) {
        self.webReady = YES;
        [self refreshSnapshot];
        return;
    }

    if ([type isEqualToString:@"refresh"]) {
        [self refreshSnapshot];
        return;
    }

    if ([type isEqualToString:@"close"]) {
        [self hide];
        return;
    }

    if ([type isEqualToString:@"openJoinURL"]) {
        NSString *urlString = payload[@"url"];
        NSURL *url = [NSURL URLWithString:urlString];
        if (url) {
            [[NSWorkspace sharedWorkspace] openURL:url];
        }
        return;
    }

    if ([type isEqualToString:@"openCalendarApp"]) {
        CEOpenApplication(CECalendarAppPath);
        return;
    }

    if ([type isEqualToString:@"openRemindersApp"]) {
        CEOpenApplication(CERemindersAppPath);
        return;
    }

    if ([type isEqualToString:@"revealEvent"]) {
        [self.dataProvider openCalendarEvent:payload];
        return;
    }

    if ([type isEqualToString:@"revealReminder"]) {
        [self.dataProvider openReminderItem:payload];
        return;
    }

    if ([type isEqualToString:@"toggleReminder"]) {
        NSString *identifier = payload[@"identifier"];
        BOOL completed = [payload[@"completed"] boolValue];
        [self.dataProvider toggleReminderWithIdentifier:identifier completed:completed completion:^{
            [self refreshSnapshot];
        }];
        return;
    }
}

@end

#pragma mark - App Delegate

@interface CEAppDelegate : NSObject <NSApplicationDelegate>
@property (nonatomic, strong) CEDataProvider *dataProvider;
@property (nonatomic, strong) CESlidePanelController *panelController;
@property (nonatomic, strong, nullable) id globalMouseMonitor;
@property (nonatomic, strong, nullable) id localMouseMonitor;
@property (nonatomic, strong, nullable) NSTimer *hoverTimer;
@property (nonatomic, strong, nullable) NSScreen *pendingHoverScreen;
@property (nonatomic, strong, nullable) NSTimer *edgePollTimer;
@end

@implementation CEAppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    self.dataProvider = [[CEDataProvider alloc] init];
    self.panelController = [[CESlidePanelController alloc] initWithDataProvider:self.dataProvider];
    [self startEdgeMonitoring];

    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(handleScreenChange)
                                                 name:NSApplicationDidChangeScreenParametersNotification
                                               object:nil];
}

- (void)dealloc {
    if (self.globalMouseMonitor) {
        [NSEvent removeMonitor:self.globalMouseMonitor];
    }
    if (self.localMouseMonitor) {
        [NSEvent removeMonitor:self.localMouseMonitor];
    }
    [self.edgePollTimer invalidate];
}

- (void)handleScreenChange {
    [self cancelScheduledOpen];
}

- (void)startEdgeMonitoring {
    if (self.globalMouseMonitor || self.localMouseMonitor) {
        return;
    }

    NSEventMask mask = NSEventMaskMouseMoved | NSEventMaskLeftMouseDragged | NSEventMaskRightMouseDragged | NSEventMaskOtherMouseDragged;
    __weak typeof(self) weakSelf = self;

    self.globalMouseMonitor = [NSEvent addGlobalMonitorForEventsMatchingMask:mask handler:^(NSEvent * _Nonnull event) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [weakSelf handlePointerLocation:[NSEvent mouseLocation]];
        });
    }];

    self.localMouseMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:mask handler:^NSEvent * _Nullable(NSEvent * _Nonnull event) {
        [weakSelf handlePointerLocation:[NSEvent mouseLocation]];
        return event;
    }];

    // 兜底：定时轮询鼠标位置（无需权限，最可靠）
    if (!self.edgePollTimer) {
        self.edgePollTimer = [NSTimer scheduledTimerWithTimeInterval:0.05
                                                             repeats:YES
                                                               block:^(NSTimer * _Nonnull t) {
            [weakSelf handlePointerLocation:[NSEvent mouseLocation]];
        }];
    }
}

- (void)handlePointerLocation:(NSPoint)location {
    if (self.panelController.visible) {
        [self cancelScheduledOpen];
        return;
    }

    NSScreen *screen = [self screenContainingPoint:location];
    if (!screen) {
        [self cancelScheduledOpen];
        return;
    }

    NSRect edgeStrip = [self.panelController safeHoverFrameForScreen:screen];
    if (location.x > NSMaxX(screen.frame) - 200) {
    }
    if (NSPointInRect(location, edgeStrip)) {
        [self scheduleOpenForScreen:screen];
        return;
    }

    [self cancelScheduledOpen];
}

- (NSScreen *)screenContainingPoint:(NSPoint)point {
    for (NSScreen *screen in NSScreen.screens) {
        if (NSPointInRect(point, screen.frame)) {
            return screen;
        }
    }
    return nil;
}

- (void)scheduleOpenForScreen:(NSScreen *)screen {
    if (self.hoverTimer && self.pendingHoverScreen == screen) {
        return;
    }

    [self cancelScheduledOpen];
    self.pendingHoverScreen = screen;
    __weak typeof(self) weakSelf = self;
    self.hoverTimer = [NSTimer scheduledTimerWithTimeInterval:0.18 repeats:NO block:^(NSTimer * _Nonnull timer) {
        NSPoint location = [NSEvent mouseLocation];
        NSRect edgeStrip = [weakSelf.panelController safeHoverFrameForScreen:screen];
        if (NSPointInRect(location, edgeStrip)) {
            [weakSelf.panelController showOnScreen:screen];
        }
        [weakSelf cancelScheduledOpen];
    }];
}

- (void)cancelScheduledOpen {
    [self.hoverTimer invalidate];
    self.hoverTimer = nil;
    self.pendingHoverScreen = nil;
}

- (BOOL)applicationShouldHandleReopen:(NSApplication *)sender hasVisibleWindows:(BOOL)flag {
    NSScreen *screen = NSScreen.mainScreen ?: NSScreen.screens.firstObject;
    if (screen) {
        [self.panelController showOnScreen:screen];
    }
    return YES;
}

@end

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        NSApplication *application = NSApplication.sharedApplication;
        CEAppDelegate *delegate = [[CEAppDelegate alloc] init];
        [application setActivationPolicy:NSApplicationActivationPolicyAccessory];
        application.delegate = delegate;
        [application run];
    }
    return 0;
}
