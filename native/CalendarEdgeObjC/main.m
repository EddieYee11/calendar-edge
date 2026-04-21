#import <AppKit/AppKit.h>
#import <EventKit/EventKit.h>

static NSString * const CECalendarAppPath = @"/System/Applications/Calendar.app";

@interface CEPanelWindow : NSPanel
@end

@implementation CEPanelWindow

- (BOOL)canBecomeKey {
    return YES;
}

- (BOOL)canBecomeMain {
    return YES;
}

@end

@interface CEEventSummary : NSObject
@property (nonatomic, copy) NSString *title;
@property (nonatomic, copy, nullable) NSString *location;
@property (nonatomic, strong) NSDate *startDate;
@property (nonatomic, strong) NSDate *endDate;
@property (nonatomic, assign) BOOL allDay;
@property (nonatomic, copy) NSString *calendarTitle;
@end

@implementation CEEventSummary
@end

typedef void (^CECalendarAccessHandler)(BOOL granted, NSString * _Nullable message);

@interface CECalendarStore : NSObject
@property (nonatomic, strong) EKEventStore *eventStore;
@property (nonatomic, strong) NSCalendar *calendar;
- (void)requestAccess:(CECalendarAccessHandler)completion;
- (NSArray<CEEventSummary *> *)upcomingEventsWithLimit:(NSInteger)limit daysAhead:(NSInteger)daysAhead;
@end

@implementation CECalendarStore

- (instancetype)init {
    self = [super init];
    if (self) {
        _eventStore = [[EKEventStore alloc] init];
        _calendar = [NSCalendar currentCalendar];
    }
    return self;
}

- (void)requestAccess:(CECalendarAccessHandler)completion {
    EKAuthorizationStatus status = [EKEventStore authorizationStatusForEntityType:EKEntityTypeEvent];
    switch (status) {
#if __MAC_OS_X_VERSION_MAX_ALLOWED >= 140000
        case EKAuthorizationStatusFullAccess:
            completion(YES, nil);
            return;
        case EKAuthorizationStatusWriteOnly:
            completion(NO, @"App only has write-only access to Calendar events.");
            return;
#else
        case EKAuthorizationStatusAuthorized:
            completion(YES, nil);
            return;
#endif
        case EKAuthorizationStatusRestricted:
            completion(NO, @"Calendar access is restricted by system policy.");
            return;
        case EKAuthorizationStatusDenied:
            completion(NO, @"Calendar access was denied. Enable it in System Settings > Privacy & Security > Calendars.");
            return;
        case EKAuthorizationStatusNotDetermined:
            [self requestSystemAccess:completion];
            return;
    }

    completion(NO, @"Calendar permission state is unknown.");
}

- (NSArray<CEEventSummary *> *)upcomingEventsWithLimit:(NSInteger)limit daysAhead:(NSInteger)daysAhead {
    NSDate *start = [NSDate date];
    NSDate *end = [self.calendar dateByAddingUnit:NSCalendarUnitDay value:daysAhead toDate:start options:0];
    if (!end) {
        return @[];
    }

    NSPredicate *predicate = [self.eventStore predicateForEventsWithStartDate:start
                                                                      endDate:end
                                                                    calendars:[self.eventStore calendarsForEntityType:EKEntityTypeEvent]];
    NSArray<EKEvent *> *events = [[self.eventStore eventsMatchingPredicate:predicate]
        sortedArrayUsingComparator:^NSComparisonResult(EKEvent *lhs, EKEvent *rhs) {
            return [lhs.startDate compare:rhs.startDate];
        }];

    NSMutableArray<CEEventSummary *> *result = [NSMutableArray array];
    NSInteger count = 0;
    for (EKEvent *event in events) {
        if (count >= limit) {
            break;
        }

        CEEventSummary *summary = [[CEEventSummary alloc] init];
        summary.title = event.title.length > 0 ? event.title : @"Untitled Event";
        summary.location = event.location;
        summary.startDate = event.startDate;
        summary.endDate = event.endDate;
        summary.allDay = event.isAllDay;
        summary.calendarTitle = event.calendar.title ?: @"Calendar";
        [result addObject:summary];
        count += 1;
    }

    return result;
}

- (void)requestSystemAccess:(CECalendarAccessHandler)completion {
    if (@available(macOS 14.0, *)) {
        [self.eventStore requestFullAccessToEventsWithCompletion:^(BOOL granted, NSError * _Nullable error) {
            dispatch_async(dispatch_get_main_queue(), ^{
                completion(granted, granted ? nil : (error.localizedDescription ?: @"Calendar access was not granted."));
            });
        }];
        return;
    }

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    [self.eventStore requestAccessToEntityType:EKEntityTypeEvent completion:^(BOOL granted, NSError * _Nullable error) {
        dispatch_async(dispatch_get_main_queue(), ^{
            completion(granted, granted ? nil : (error.localizedDescription ?: @"Calendar access was not granted."));
        });
    }];
#pragma clang diagnostic pop
}

@end

@interface CEPanelContentView : NSVisualEffectView
@property (nonatomic, copy, nullable) dispatch_block_t onRefresh;
@property (nonatomic, copy, nullable) dispatch_block_t onOpenCalendar;
@property (nonatomic, copy, nullable) dispatch_block_t onClose;
@property (nonatomic, copy, nullable) dispatch_block_t onQuit;
- (void)renderLoading:(NSString *)message;
- (void)renderAccessDenied:(NSString *)message;
- (void)renderEvents:(NSArray<CEEventSummary *> *)events;
@end

@interface CEPanelContentView ()
@property (nonatomic, strong) NSTextField *titleLabel;
@property (nonatomic, strong) NSTextField *subtitleLabel;
@property (nonatomic, strong) NSTextField *statusLabel;
@property (nonatomic, strong) NSTextView *textView;
@property (nonatomic, strong) NSDateFormatter *dateFormatter;
@property (nonatomic, strong) NSDateFormatter *allDayFormatter;
@end

@implementation CEPanelContentView

- (instancetype)initWithFrame:(NSRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        self.material = NSVisualEffectMaterialHUDWindow;
        self.blendingMode = NSVisualEffectBlendingModeWithinWindow;
        self.state = NSVisualEffectStateActive;
        self.wantsLayer = YES;
        self.layer.cornerRadius = 22.0;

        _dateFormatter = [[NSDateFormatter alloc] init];
        _dateFormatter.dateStyle = NSDateFormatterMediumStyle;
        _dateFormatter.timeStyle = NSDateFormatterShortStyle;

        _allDayFormatter = [[NSDateFormatter alloc] init];
        _allDayFormatter.dateStyle = NSDateFormatterMediumStyle;
        _allDayFormatter.timeStyle = NSDateFormatterNoStyle;

        [self setupLayout];
    }
    return self;
}

- (void)setupLayout {
    self.titleLabel = [NSTextField labelWithString:@"Calendar Edge"];
    self.titleLabel.font = [NSFont systemFontOfSize:26 weight:NSFontWeightSemibold];

    self.subtitleLabel = [NSTextField labelWithString:@"Upcoming events from your Apple Calendar"];
    self.subtitleLabel.font = [NSFont systemFontOfSize:13 weight:NSFontWeightRegular];
    self.subtitleLabel.textColor = NSColor.secondaryLabelColor;

    self.statusLabel = [NSTextField labelWithString:@"Waiting for Calendar access..."];
    self.statusLabel.font = [NSFont systemFontOfSize:12 weight:NSFontWeightMedium];
    self.statusLabel.textColor = NSColor.tertiaryLabelColor;

    NSButton *refreshButton = [self buttonWithTitle:@"Refresh" action:@selector(refreshTapped)];
    NSButton *openButton = [self buttonWithTitle:@"Open Calendar" action:@selector(openCalendarTapped)];
    NSButton *closeButton = [self buttonWithTitle:@"Close" action:@selector(closeTapped)];
    NSButton *quitButton = [self buttonWithTitle:@"Quit" action:@selector(quitTapped)];

    NSStackView *buttonRow = [NSStackView stackViewWithViews:@[refreshButton, openButton, closeButton, quitButton]];
    buttonRow.orientation = NSUserInterfaceLayoutOrientationHorizontal;
    buttonRow.spacing = 8.0;
    buttonRow.translatesAutoresizingMaskIntoConstraints = NO;

    self.textView = [[NSTextView alloc] initWithFrame:NSZeroRect];
    self.textView.editable = NO;
    self.textView.selectable = YES;
    self.textView.drawsBackground = NO;
    self.textView.font = [NSFont monospacedSystemFontOfSize:12 weight:NSFontWeightRegular];
    self.textView.textColor = NSColor.labelColor;

    NSScrollView *scrollView = [[NSScrollView alloc] initWithFrame:NSZeroRect];
    scrollView.drawsBackground = NO;
    scrollView.borderType = NSNoBorder;
    scrollView.hasVerticalScroller = YES;
    scrollView.translatesAutoresizingMaskIntoConstraints = NO;
    scrollView.documentView = self.textView;

    for (NSView *view in @[self.titleLabel, self.subtitleLabel, buttonRow, self.statusLabel, scrollView]) {
        view.translatesAutoresizingMaskIntoConstraints = NO;
        [self addSubview:view];
    }

    [NSLayoutConstraint activateConstraints:@[
        [self.titleLabel.topAnchor constraintEqualToAnchor:self.topAnchor constant:20],
        [self.titleLabel.leadingAnchor constraintEqualToAnchor:self.leadingAnchor constant:20],
        [self.titleLabel.trailingAnchor constraintEqualToAnchor:self.trailingAnchor constant:-20],

        [self.subtitleLabel.topAnchor constraintEqualToAnchor:self.titleLabel.bottomAnchor constant:6],
        [self.subtitleLabel.leadingAnchor constraintEqualToAnchor:self.leadingAnchor constant:20],
        [self.subtitleLabel.trailingAnchor constraintEqualToAnchor:self.trailingAnchor constant:-20],

        [buttonRow.topAnchor constraintEqualToAnchor:self.subtitleLabel.bottomAnchor constant:14],
        [buttonRow.leadingAnchor constraintEqualToAnchor:self.leadingAnchor constant:20],
        [buttonRow.trailingAnchor constraintLessThanOrEqualToAnchor:self.trailingAnchor constant:-20],

        [self.statusLabel.topAnchor constraintEqualToAnchor:buttonRow.bottomAnchor constant:14],
        [self.statusLabel.leadingAnchor constraintEqualToAnchor:self.leadingAnchor constant:20],
        [self.statusLabel.trailingAnchor constraintEqualToAnchor:self.trailingAnchor constant:-20],

        [scrollView.topAnchor constraintEqualToAnchor:self.statusLabel.bottomAnchor constant:12],
        [scrollView.leadingAnchor constraintEqualToAnchor:self.leadingAnchor constant:20],
        [scrollView.trailingAnchor constraintEqualToAnchor:self.trailingAnchor constant:-20],
        [scrollView.bottomAnchor constraintEqualToAnchor:self.bottomAnchor constant:-20]
    ]];
}

- (NSButton *)buttonWithTitle:(NSString *)title action:(SEL)action {
    NSButton *button = [NSButton buttonWithTitle:title target:self action:action];
    button.bezelStyle = NSBezelStyleRounded;
    return button;
}

- (void)renderLoading:(NSString *)message {
    self.statusLabel.stringValue = message;
    self.textView.string = @"";
}

- (void)renderAccessDenied:(NSString *)message {
    self.statusLabel.stringValue = @"Calendar permission is required";
    self.textView.string = [NSString stringWithFormat:@"%@\n\nOpen System Settings > Privacy & Security > Calendars and allow access for CalendarEdge.", message];
}

- (void)renderEvents:(NSArray<CEEventSummary *> *)events {
    if (events.count == 0) {
        self.statusLabel.stringValue = @"No upcoming events in the next 14 days.";
        self.textView.string = @"Nothing scheduled.";
        return;
    }

    self.statusLabel.stringValue = [NSString stringWithFormat:@"Showing %lu upcoming events", (unsigned long)events.count];

    NSMutableArray<NSString *> *lines = [NSMutableArray array];
    for (CEEventSummary *event in events) {
        [lines addObject:[self formatEvent:event]];
    }
    self.textView.string = [lines componentsJoinedByString:@"\n\n"];
}

- (NSString *)formatEvent:(CEEventSummary *)event {
    NSString *schedule;
    if (event.allDay) {
        schedule = [NSString stringWithFormat:@"All day on %@", [self.allDayFormatter stringFromDate:event.startDate]];
    } else {
        NSString *start = [self.dateFormatter stringFromDate:event.startDate];
        NSString *end = [self.dateFormatter stringFromDate:event.endDate];
        schedule = [NSString stringWithFormat:@"%@ -> %@", start, end];
    }

    if (event.location.length > 0) {
        return [NSString stringWithFormat:@"%@\n%@\n%@\n%@", event.title, event.calendarTitle, schedule, event.location];
    }

    return [NSString stringWithFormat:@"%@\n%@\n%@", event.title, event.calendarTitle, schedule];
}

- (void)refreshTapped {
    if (self.onRefresh) {
        self.onRefresh();
    }
}

- (void)openCalendarTapped {
    if (self.onOpenCalendar) {
        self.onOpenCalendar();
    }
}

- (void)closeTapped {
    if (self.onClose) {
        self.onClose();
    }
}

- (void)quitTapped {
    if (self.onQuit) {
        self.onQuit();
    }
}

@end

@interface CESlidePanelController : NSObject
@property (nonatomic, strong) CECalendarStore *calendarStore;
@property (nonatomic, strong) CEPanelWindow *panel;
@property (nonatomic, strong) CEPanelContentView *contentView;
@property (nonatomic, assign) BOOL visible;
@property (nonatomic, strong, nullable) id globalMonitor;
- (instancetype)initWithCalendarStore:(CECalendarStore *)calendarStore;
- (void)toggleForScreen:(NSScreen *)screen;
- (void)showOnScreen:(NSScreen *)screen;
- (void)hide;
@end

@implementation CESlidePanelController

- (instancetype)initWithCalendarStore:(CECalendarStore *)calendarStore {
    self = [super init];
    if (self) {
        _calendarStore = calendarStore;
        _contentView = [[CEPanelContentView alloc] initWithFrame:NSMakeRect(0, 0, 360, 620)];
        _panel = [[CEPanelWindow alloc] initWithContentRect:NSMakeRect(0, 0, 360, 620)
                                                  styleMask:NSWindowStyleMaskBorderless
                                                    backing:NSBackingStoreBuffered
                                                      defer:NO];
        _panel.releasedWhenClosed = NO;
        _panel.floatingPanel = YES;
        _panel.level = NSFloatingWindowLevel;
        _panel.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary;
        _panel.opaque = NO;
        _panel.backgroundColor = NSColor.clearColor;
        _panel.hasShadow = YES;
        _panel.hidesOnDeactivate = NO;
        _panel.contentView = _contentView;

        __weak typeof(self) weakSelf = self;
        _contentView.onRefresh = ^{
            [weakSelf refreshEvents];
        };
        _contentView.onOpenCalendar = ^{
            [[NSWorkspace sharedWorkspace] openApplicationAtURL:[NSURL fileURLWithPath:CECalendarAppPath]
                                                   configuration:[NSWorkspaceOpenConfiguration configuration]
                                               completionHandler:nil];
        };
        _contentView.onClose = ^{
            [weakSelf hide];
        };
        _contentView.onQuit = ^{
            [NSApp terminate:nil];
        };
    }
    return self;
}

- (void)toggleForScreen:(NSScreen *)screen {
    self.visible ? [self hide] : [self showOnScreen:screen];
}

- (void)showOnScreen:(NSScreen *)screen {
    if (self.visible) {
        return;
    }

    NSRect finalFrame = [self panelFrameForScreen:screen offscreen:NO];
    NSRect startFrame = [self panelFrameForScreen:screen offscreen:YES];

    [self.panel setFrame:startFrame display:NO];
    [self.panel makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];

    [NSAnimationContext runAnimationGroup:^(NSAnimationContext *context) {
        context.duration = 0.18;
        [[self.panel animator] setFrame:finalFrame display:YES];
    } completionHandler:nil];

    self.visible = YES;
    [self installGlobalMonitor];
    [self refreshEvents];
}

- (void)hide {
    if (!self.visible) {
        return;
    }

    NSScreen *screen = self.panel.screen ?: NSScreen.mainScreen ?: NSScreen.screens.firstObject;
    if (!screen) {
        [self.panel orderOut:nil];
        self.visible = NO;
        [self removeGlobalMonitor];
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
    [self removeGlobalMonitor];
}

- (void)refreshEvents {
    [self.contentView renderLoading:@"Syncing your upcoming events..."];
    __weak typeof(self) weakSelf = self;
    [self.calendarStore requestAccess:^(BOOL granted, NSString * _Nullable message) {
        if (!weakSelf) {
            return;
        }
        if (granted) {
            NSArray<CEEventSummary *> *events = [weakSelf.calendarStore upcomingEventsWithLimit:16 daysAhead:14];
            [weakSelf.contentView renderEvents:events];
        } else {
            [weakSelf.contentView renderAccessDenied:(message ?: @"Calendar access was not granted.")];
        }
    }];
}

- (NSRect)panelFrameForScreen:(NSScreen *)screen offscreen:(BOOL)offscreen {
    NSRect visibleFrame = screen.visibleFrame;
    CGFloat width = 360.0;
    CGFloat height = MIN(620.0, visibleFrame.size.height - 40.0);
    CGFloat y = NSMidY(visibleFrame) - (height / 2.0);
    CGFloat x = offscreen ? NSMaxX(visibleFrame) + 8.0 : NSMaxX(visibleFrame) - width - 16.0;
    return NSMakeRect(x, y, width, height);
}

- (void)installGlobalMonitor {
    [self removeGlobalMonitor];

    __weak typeof(self) weakSelf = self;
    self.globalMonitor = [NSEvent addGlobalMonitorForEventsMatchingMask:(NSEventMaskLeftMouseDown | NSEventMaskRightMouseDown | NSEventMaskKeyDown)
                                                                handler:^(NSEvent *event) {
        if (!weakSelf.visible) {
            return;
        }

        if (event.type == NSEventTypeKeyDown && event.keyCode == 53) {
            [weakSelf hide];
            return;
        }

        NSPoint location = NSEvent.mouseLocation;
        if (!NSPointInRect(location, weakSelf.panel.frame)) {
            [weakSelf hide];
        }
    }];
}

- (void)removeGlobalMonitor {
    if (self.globalMonitor) {
        [NSEvent removeMonitor:self.globalMonitor];
        self.globalMonitor = nil;
    }
}

@end

@interface CEHotspotView : NSView
@property (nonatomic, copy) dispatch_block_t onActivate;
@property (nonatomic, strong, nullable) NSTrackingArea *trackingAreaRef;
- (instancetype)initWithFrame:(NSRect)frame onActivate:(dispatch_block_t)onActivate;
@end

@implementation CEHotspotView

- (instancetype)initWithFrame:(NSRect)frame onActivate:(dispatch_block_t)onActivate {
    self = [super initWithFrame:frame];
    if (self) {
        _onActivate = [onActivate copy];
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

    NSTrackingArea *trackingArea = [[NSTrackingArea alloc] initWithRect:self.bounds
                                                                options:NSTrackingMouseEnteredAndExited | NSTrackingActiveAlways | NSTrackingInVisibleRect
                                                                  owner:self
                                                               userInfo:nil];
    [self addTrackingArea:trackingArea];
    self.trackingAreaRef = trackingArea;
}

- (void)mouseEntered:(NSEvent *)event {
    if (self.onActivate) {
        self.onActivate();
    }
}

- (void)mouseUp:(NSEvent *)event {
    if (self.onActivate) {
        self.onActivate();
    }
}

@end

@interface CEEdgeHotspotWindow : NSWindow
- (instancetype)initWithScreen:(NSScreen *)screen onActivate:(dispatch_block_t)onActivate;
@end

@implementation CEEdgeHotspotWindow

- (instancetype)initWithScreen:(NSScreen *)screen onActivate:(dispatch_block_t)onActivate {
    NSRect visibleFrame = screen.visibleFrame;
    CGFloat width = 6.0;
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
        self.contentView = [[CEHotspotView alloc] initWithFrame:NSMakeRect(0, 0, width, visibleFrame.size.height) onActivate:onActivate];
    }
    return self;
}

@end

@interface CEAppDelegate : NSObject <NSApplicationDelegate>
@property (nonatomic, strong) CECalendarStore *calendarStore;
@property (nonatomic, strong) CESlidePanelController *panelController;
@property (nonatomic, strong, nullable) CEEdgeHotspotWindow *hotspotWindow;
@end

@implementation CEAppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    self.calendarStore = [[CECalendarStore alloc] init];
    self.panelController = [[CESlidePanelController alloc] initWithCalendarStore:self.calendarStore];
    [self installHotspot];

    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(handleScreenChange)
                                                 name:NSApplicationDidChangeScreenParametersNotification
                                               object:nil];
}

- (void)handleScreenChange {
    [self installHotspot];
}

- (void)installHotspot {
    [self.hotspotWindow close];

    NSScreen *screen = NSScreen.mainScreen ?: NSScreen.screens.firstObject;
    if (!screen) {
        return;
    }

    __weak typeof(self) weakSelf = self;
    self.hotspotWindow = [[CEEdgeHotspotWindow alloc] initWithScreen:screen onActivate:^{
        [weakSelf.panelController toggleForScreen:screen];
    }];
    [self.hotspotWindow orderFrontRegardless];
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
