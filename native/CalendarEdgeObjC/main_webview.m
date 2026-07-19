#import <AppKit/AppKit.h>
#import <EventKit/EventKit.h>
#import <QuartzCore/QuartzCore.h>
#import <UserNotifications/UserNotifications.h>
#import <WebKit/WebKit.h>

static NSString * const CECalendarAppPath = @"/System/Applications/Calendar.app";
static NSString * const CERemindersAppPath = @"/System/Applications/Reminders.app";
static NSString * const CEBridgeName = @"calendarEdge";
static NSString * const CEHermesShortcutName = @"Send to Hermes";
static NSString * const CEPomodoroNotificationIdentifier = @"local.codex.calendaredge.pomodoro";
static CGFloat const CECompactPanelWidth = 440.0;
static CGFloat const CECompactPanelHeight = 620.0;
static CGFloat const CEExpandedPanelWidth = 1240.0;
static CGFloat const CEExpandedPanelHeight = 800.0;
static CGFloat const CECompactCornerRadius = 18.0;
static CGFloat const CEExpandedCornerRadius = 24.0;
static NSString * const CEPanelModeDefaultsKey = @"CEPanelMode";
static CGFloat const CEPanelScreenInset = 10.0;
static CGFloat const CETriggerZoneWidth = 40.0;
static CGFloat const CETriggerZoneHeight = 40.0;

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

// HIG:用户开启「减弱动态效果」时跳过面板动画
static BOOL CEReduceMotion(void) {
    return NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion;
}

// 系统强调色 → #rrggbb,注入 snapshot 供前端可选主题使用
static NSString *CESystemAccentHexString(void) {
    NSColor *accent = [NSColor.controlAccentColor colorUsingColorSpace:NSColorSpace.sRGBColorSpace];
    if (!accent) {
        return @"";
    }
    return [NSString stringWithFormat:@"#%02x%02x%02x",
            (int)lround(accent.redComponent * 255),
            (int)lround(accent.greenComponent * 255),
            (int)lround(accent.blueComponent * 255)];
}

static NSString *CETrimmedString(NSString *value) {
    return [value stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
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

static NSDate *CEStartOfMonth(NSCalendar *calendar, NSDate *date) {
    NSDateComponents *components = [calendar components:NSCalendarUnitYear | NSCalendarUnitMonth fromDate:date ?: [NSDate date]];
    components.day = 1;
    return [calendar dateFromComponents:components];
}

static NSDate *CEAddDays(NSCalendar *calendar, NSDate *date, NSInteger days) {
    NSDateComponents *components = [[NSDateComponents alloc] init];
    components.day = days;
    return [calendar dateByAddingComponents:components toDate:date options:0];
}

static NSDate *CEAddMonths(NSCalendar *calendar, NSDate *date, NSInteger months) {
    NSDateComponents *components = [[NSDateComponents alloc] init];
    components.month = months;
    return [calendar dateByAddingComponents:components toDate:date options:0];
}

static NSDate *CEVisibleMonthGridStart(NSCalendar *calendar, NSDate *anchorDate) {
    NSDate *monthStart = CEStartOfMonth(calendar, anchorDate);
    NSInteger weekday = [calendar component:NSCalendarUnitWeekday fromDate:monthStart];
    NSInteger mondayOffset = (weekday + 5) % 7;
    return CEAddDays(calendar, monthStart, -mondayOffset);
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

static NSDate *CEDateFromISO8601String(NSString *value) {
    if (![value isKindOfClass:NSString.class] || value.length == 0) {
        return nil;
    }

    static NSISO8601DateFormatter *formatter = nil;
    static NSISO8601DateFormatter *fractionalFormatter = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        formatter = [[NSISO8601DateFormatter alloc] init];
        formatter.formatOptions = NSISO8601DateFormatWithInternetDateTime;
        fractionalFormatter = [[NSISO8601DateFormatter alloc] init];
        fractionalFormatter.formatOptions = NSISO8601DateFormatWithInternetDateTime | NSISO8601DateFormatWithFractionalSeconds;
    });

    return [formatter dateFromString:value] ?: [fractionalFormatter dateFromString:value];
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
@property (nonatomic, strong, nullable) NSMenu *calendarEdgeContextMenu;
- (void)setContextMenu:(NSMenu *)menu;
@end

@implementation CEPanelWindow

- (void)setContextMenu:(NSMenu *)menu {
    self.calendarEdgeContextMenu = menu;
    self.contentView.menu = menu;
}

- (BOOL)canBecomeKey {
    return YES;
}

- (BOOL)canBecomeKeyWindow {
    return YES;
}

- (BOOL)canBecomeMain {
    return YES;
}

- (void)showContextMenuForEvent:(NSEvent *)event {
    if (!self.calendarEdgeContextMenu || !self.contentView) {
        return;
    }

    [NSMenu popUpContextMenu:self.calendarEdgeContextMenu withEvent:event forView:self.contentView];
}

- (void)rightMouseUp:(NSEvent *)event {
    if (self.calendarEdgeContextMenu) {
        [self showContextMenuForEvent:event];
        return;
    }

    [super rightMouseUp:event];
}

- (void)sendEvent:(NSEvent *)event {
    if (event.type == NSEventTypeRightMouseUp && self.calendarEdgeContextMenu) {
        [self showContextMenuForEvent:event];
        return;
    }

    [super sendEvent:event];
}

@end

#pragma mark - Data Provider

typedef void (^CEPermissionHandler)(NSDictionary *permissions);
typedef void (^CESnapshotHandler)(NSDictionary *snapshot);

@interface CEDataProvider : NSObject
@property (nonatomic, strong) EKEventStore *eventStore;
@property (nonatomic, strong) NSCalendar *calendar;
@property (nonatomic, strong) dispatch_queue_t workerQueue;
@property (nonatomic, strong) NSDate *calendarAnchorDate;
@property (nonatomic, copy, nullable) void (^onStoreChanged)(void);
- (void)loadSnapshotWithCompletion:(CESnapshotHandler)completion;
- (void)setCalendarAnchorDateFromString:(NSString *)anchorDate;
- (void)toggleReminderWithIdentifier:(NSString *)identifier completed:(BOOL)completed completion:(dispatch_block_t)completion;
- (void)createEventWithPayload:(NSDictionary *)payload completion:(void (^)(NSDictionary *result))completion;
- (void)updateEventDatesWithPayload:(NSDictionary *)payload completion:(void (^)(NSDictionary *result))completion;
- (void)updateEventWithPayload:(NSDictionary *)payload completion:(void (^)(NSDictionary *result))completion;
- (void)deleteEventWithPayload:(NSDictionary *)payload completion:(void (^)(NSDictionary *result))completion;
- (void)createReminderWithPayload:(NSDictionary *)payload completion:(void (^)(NSDictionary *result))completion;
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
        _calendarAnchorDate = [NSDate date];
        // Calendar.app 里的外部改动会触发此通知，此时 store 缓存已失效——自动重新抓取，
        // 无需用户手动 Reload 或等 60s 定时刷新。
        [[NSNotificationCenter defaultCenter] addObserver:self
                                                 selector:@selector(handleStoreChanged:)
                                                     name:EKEventStoreChangedNotification
                                                   object:nil];
    }
    return self;
}

- (void)dealloc {
    [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (void)handleStoreChanged:(NSNotification *)notification {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (self.onStoreChanged) {
            self.onStoreChanged();
        }
    });
}

- (void)loadSnapshotWithCompletion:(CESnapshotHandler)completion {
    [self requestPermissionsWithCompletion:^(NSDictionary *permissions) {
        dispatch_async(self.workerQueue, ^{
            // 长期持有的 EKEventStore 会缓存查询结果，外部（Calendar.app）的新增/移动/删除
            // 不刷新就读不到。先同步远程源进本地库，再 reset 内存缓存，保证下面的 predicate
            // 读到最新本地状态（refreshSourcesIfNecessary 只同步远程，不刷新 store 缓存）。
            [self.eventStore refreshSourcesIfNecessary];
            [self.eventStore reset];

            NSMutableDictionary *snapshot = [@{
                @"fetchedAt": CEISO8601String([NSDate date]),
                @"permissions": permissions,
                @"calendarRange": [self calendarRange],
                @"systemAccentColor": CESystemAccentHexString(),
                @"events": @[],
                @"reminders": @[]
            } mutableCopy];

            BOOL calendarGranted = [permissions[@"calendar"][@"granted"] boolValue];
            BOOL remindersGranted = [permissions[@"reminders"][@"granted"] boolValue];

            if (calendarGranted) {
                snapshot[@"events"] = [self fetchEvents];
                snapshot[@"calendars"] = [self fetchEventCalendars];
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

- (void)setCalendarAnchorDateFromString:(NSString *)anchorDate {
    NSDate *parsedDate = CEDateFromISO8601String(anchorDate);
    if (!parsedDate) {
        return;
    }

    dispatch_async(self.workerQueue, ^{
        self.calendarAnchorDate = CEStartOfMonth(self.calendar, parsedDate);
    });
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

// 重复规则:{frequency:'daily'|'weekdays'|'weekly'|'monthly'|'yearly', interval>=1, end?:{type:'count'|'until', count, untilAt}}
static EKRecurrenceRule *CERecurrenceRuleFromDictionary(NSDictionary *spec) {
    if (![spec isKindOfClass:NSDictionary.class]) {
        return nil;
    }
    NSString *frequency = spec[@"frequency"];
    if (![frequency isKindOfClass:NSString.class] || [frequency isEqualToString:@"none"]) {
        return nil;
    }

    NSInteger interval = MAX(1, [spec[@"interval"] integerValue]);
    EKRecurrenceFrequency mapped;
    NSArray<EKRecurrenceDayOfWeek *> *daysOfWeek = nil;
    if ([frequency isEqualToString:@"daily"]) {
        mapped = EKRecurrenceFrequencyDaily;
    } else if ([frequency isEqualToString:@"weekdays"]) {
        mapped = EKRecurrenceFrequencyWeekly;
        daysOfWeek = @[[EKRecurrenceDayOfWeek dayOfWeek:EKWeekdayMonday],
                       [EKRecurrenceDayOfWeek dayOfWeek:EKWeekdayTuesday],
                       [EKRecurrenceDayOfWeek dayOfWeek:EKWeekdayWednesday],
                       [EKRecurrenceDayOfWeek dayOfWeek:EKWeekdayThursday],
                       [EKRecurrenceDayOfWeek dayOfWeek:EKWeekdayFriday]];
    } else if ([frequency isEqualToString:@"weekly"]) {
        mapped = EKRecurrenceFrequencyWeekly;
    } else if ([frequency isEqualToString:@"monthly"]) {
        mapped = EKRecurrenceFrequencyMonthly;
    } else if ([frequency isEqualToString:@"yearly"]) {
        mapped = EKRecurrenceFrequencyYearly;
    } else {
        return nil;
    }

    EKRecurrenceEnd *ruleEnd = nil;
    NSDictionary *end = spec[@"end"];
    if ([end isKindOfClass:NSDictionary.class]) {
        if ([end[@"type"] isEqual:@"count"] && [end[@"count"] integerValue] > 0) {
            ruleEnd = [EKRecurrenceEnd recurrenceEndWithOccurrenceCount:[end[@"count"] integerValue]];
        } else if ([end[@"type"] isEqual:@"until"]) {
            NSDate *until = CEDateFromISO8601String(end[@"untilAt"]);
            if (until) {
                ruleEnd = [EKRecurrenceEnd recurrenceEndWithEndDate:until];
            }
        }
    }

    return [[EKRecurrenceRule alloc] initRecurrenceWithFrequency:mapped
                                                        interval:interval
                                                   daysOfTheWeek:daysOfWeek
                                                    daysOfTheMonth:nil
                                                   monthsOfTheYear:nil
                                                    weeksOfTheYear:nil
                                                     daysOfTheYear:nil
                                                      setPositions:nil
                                                               end:ruleEnd];
}

// eventWithIdentifier: 对重复系列只返回首个 occurrence;按 occurrenceStartAt 精确定位目标 occurrence
- (EKEvent *)eventWithIdentifier:(NSString *)identifier occurrenceStartAt:(NSString *)occurrenceStartAt {
    EKEvent *base = identifier.length > 0 ? [self.eventStore eventWithIdentifier:identifier] : nil;
    NSDate *occurrence = CEDateFromISO8601String(occurrenceStartAt);
    if (!base || !occurrence) {
        return base;
    }
    if (fabs([base.startDate timeIntervalSinceDate:occurrence]) < 1.0) {
        return base;
    }

    NSPredicate *predicate = [self.eventStore predicateForEventsWithStartDate:[occurrence dateByAddingTimeInterval:-86400]
                                                                      endDate:[occurrence dateByAddingTimeInterval:2 * 86400]
                                                                    calendars:nil];
    for (EKEvent *candidate in [self.eventStore eventsMatchingPredicate:predicate]) {
        if ([candidate.eventIdentifier isEqualToString:identifier] &&
            fabs([candidate.startDate timeIntervalSinceDate:occurrence]) < 1.0) {
            return candidate;
        }
    }
    return base;
}

- (void)createEventWithPayload:(NSDictionary *)payload completion:(void (^)(NSDictionary *result))completion {
    dispatch_async(self.workerQueue, ^{
        NSString *title = CETrimmedString(payload[@"title"] ?: @"");
        NSDate *start = CEDateFromISO8601String(payload[@"startAt"]);
        NSDate *end = CEDateFromISO8601String(payload[@"endAt"]);

        NSDictionary *result = nil;
        if (title.length == 0 || !start || !end) {
            result = @{@"action": @"createEvent", @"status": @"error", @"message": @"日程标题或时间无效。"};
        } else {
            EKCalendar *target = nil;
            NSString *calendarIdentifier = payload[@"calendarIdentifier"];
            if ([calendarIdentifier isKindOfClass:NSString.class] && calendarIdentifier.length > 0) {
                target = [self.eventStore calendarWithIdentifier:calendarIdentifier];
            }
            if (!target || !target.allowsContentModifications) {
                target = [self.eventStore defaultCalendarForNewEvents];
            }
            if (!target || !target.allowsContentModifications) {
                for (EKCalendar *candidate in [self.eventStore calendarsForEntityType:EKEntityTypeEvent]) {
                    if (candidate.allowsContentModifications) {
                        target = candidate;
                        break;
                    }
                }
            }

            if (!target) {
                result = @{@"action": @"createEvent", @"status": @"error", @"message": @"没有可写入的日历。"};
            } else {
                EKEvent *event = [EKEvent eventWithEventStore:self.eventStore];
                event.title = title;
                event.startDate = start;
                event.endDate = end;
                event.calendar = target;
                if ([payload[@"notes"] isKindOfClass:NSString.class] && [payload[@"notes"] length] > 0) {
                    event.notes = payload[@"notes"];
                }
                EKRecurrenceRule *rule = CERecurrenceRuleFromDictionary(payload[@"recurrence"]);
                if (rule) {
                    event.recurrenceRules = @[rule];
                }

                NSError *error = nil;
                [self.eventStore saveEvent:event span:EKSpanThisEvent commit:YES error:&error];
                if (error) {
                    NSLog(@"[CalendarEdge] Failed to create event: %@", error);
                    result = @{@"action": @"createEvent", @"status": @"error", @"message": error.localizedDescription ?: @"创建日程失败。"};
                } else {
                    result = @{@"action": @"createEvent", @"status": @"success", @"message": @""};
                }
            }
        }

        dispatch_async(dispatch_get_main_queue(), ^{
            if (completion) {
                completion(result);
            }
        });
    });
}

- (void)updateEventDatesWithPayload:(NSDictionary *)payload completion:(void (^)(NSDictionary *result))completion {
    dispatch_async(self.workerQueue, ^{
        NSString *identifier = payload[@"identifier"];
        NSDate *start = CEDateFromISO8601String(payload[@"startAt"]);
        NSDate *end = CEDateFromISO8601String(payload[@"endAt"]);
        EKSpan span = [payload[@"span"] isEqual:@"future"] ? EKSpanFutureEvents : EKSpanThisEvent;

        NSDictionary *result = nil;
        EKEvent *event = [self eventWithIdentifier:identifier occurrenceStartAt:payload[@"occurrenceStartAt"]];
        if (!event || !start || !end) {
            result = @{@"action": @"updateEventDates", @"status": @"error", @"message": @"找不到该日程，或时间无效。"};
        } else if (!event.calendar.allowsContentModifications) {
            result = @{@"action": @"updateEventDates", @"status": @"error", @"message": @"该日程所在日历是只读的，无法移动。"};
        } else {
            event.startDate = start;
            event.endDate = end;

            NSError *error = nil;
            [self.eventStore saveEvent:event span:span commit:YES error:&error];
            if (error) {
                NSLog(@"[CalendarEdge] Failed to update event dates: %@", error);
                result = @{@"action": @"updateEventDates", @"status": @"error", @"message": error.localizedDescription ?: @"调整日程失败。"};
            } else {
                result = @{@"action": @"updateEventDates", @"status": @"success", @"message": @""};
            }
        }

        dispatch_async(dispatch_get_main_queue(), ^{
            if (completion) {
                completion(result);
            }
        });
    });
}

- (void)updateEventWithPayload:(NSDictionary *)payload completion:(void (^)(NSDictionary *result))completion {
    dispatch_async(self.workerQueue, ^{
        NSString *identifier = payload[@"identifier"];
        BOOL wantsRecurrence = [payload[@"recurrence"] isKindOfClass:NSDictionary.class];
        // EKSpanThisEvent 不能修改重复规则,含 recurrence 时强制 future
        EKSpan span = (wantsRecurrence || [payload[@"span"] isEqual:@"future"]) ? EKSpanFutureEvents : EKSpanThisEvent;

        NSDictionary *result = nil;
        EKEvent *event = [self eventWithIdentifier:identifier occurrenceStartAt:payload[@"occurrenceStartAt"]];
        if (!event) {
            result = @{@"action": @"updateEvent", @"status": @"error", @"message": @"找不到该日程。"};
        } else if (!event.calendar.allowsContentModifications) {
            result = @{@"action": @"updateEvent", @"status": @"error", @"message": @"该日程所在日历是只读的，无法修改。"};
        } else {
            if ([payload[@"title"] isKindOfClass:NSString.class]) {
                NSString *title = CETrimmedString(payload[@"title"]);
                if (title.length > 0) {
                    event.title = title;
                }
            }
            NSDate *start = CEDateFromISO8601String(payload[@"startAt"]);
            NSDate *end = CEDateFromISO8601String(payload[@"endAt"]);
            if (start) {
                event.startDate = start;
            }
            if (end) {
                event.endDate = end;
            }
            if ([payload[@"notes"] isKindOfClass:NSString.class]) {
                event.notes = [payload[@"notes"] length] > 0 ? payload[@"notes"] : nil;
            }
            NSString *targetCalendarIdentifier = payload[@"calendarIdentifier"];
            if ([targetCalendarIdentifier isKindOfClass:NSString.class] && targetCalendarIdentifier.length > 0 &&
                ![targetCalendarIdentifier isEqualToString:event.calendar.calendarIdentifier]) {
                EKCalendar *targetCalendar = [self.eventStore calendarWithIdentifier:targetCalendarIdentifier];
                if (targetCalendar && targetCalendar.allowsContentModifications) {
                    event.calendar = targetCalendar;
                }
            }
            if (wantsRecurrence) {
                EKRecurrenceRule *rule = CERecurrenceRuleFromDictionary(payload[@"recurrence"]);
                event.recurrenceRules = rule ? @[rule] : @[];
            }

            NSError *error = nil;
            [self.eventStore saveEvent:event span:span commit:YES error:&error];
            if (error) {
                NSLog(@"[CalendarEdge] Failed to update event: %@", error);
                result = @{@"action": @"updateEvent", @"status": @"error", @"message": error.localizedDescription ?: @"保存日程失败。"};
            } else {
                result = @{@"action": @"updateEvent", @"status": @"success", @"message": @""};
            }
        }

        dispatch_async(dispatch_get_main_queue(), ^{
            if (completion) {
                completion(result);
            }
        });
    });
}

- (void)deleteEventWithPayload:(NSDictionary *)payload completion:(void (^)(NSDictionary *result))completion {
    dispatch_async(self.workerQueue, ^{
        NSString *identifier = payload[@"identifier"];
        EKSpan span = [payload[@"span"] isEqual:@"future"] ? EKSpanFutureEvents : EKSpanThisEvent;

        NSDictionary *result = nil;
        EKEvent *event = [self eventWithIdentifier:identifier occurrenceStartAt:payload[@"occurrenceStartAt"]];
        if (!event) {
            result = @{@"action": @"deleteEvent", @"status": @"error", @"message": @"找不到该日程。"};
        } else if (!event.calendar.allowsContentModifications) {
            result = @{@"action": @"deleteEvent", @"status": @"error", @"message": @"该日程所在日历是只读的，无法删除。"};
        } else {
            NSError *error = nil;
            [self.eventStore removeEvent:event span:span commit:YES error:&error];
            if (error) {
                NSLog(@"[CalendarEdge] Failed to delete event: %@", error);
                result = @{@"action": @"deleteEvent", @"status": @"error", @"message": error.localizedDescription ?: @"删除日程失败。"};
            } else {
                result = @{@"action": @"deleteEvent", @"status": @"success", @"message": @""};
            }
        }

        dispatch_async(dispatch_get_main_queue(), ^{
            if (completion) {
                completion(result);
            }
        });
    });
}

- (void)createReminderWithPayload:(NSDictionary *)payload completion:(void (^)(NSDictionary *result))completion {
    dispatch_async(self.workerQueue, ^{
        NSString *title = CETrimmedString(payload[@"title"] ?: @"");

        NSDictionary *result = nil;
        EKCalendar *target = [self.eventStore defaultCalendarForNewReminders];
        if (title.length == 0) {
            result = @{@"action": @"createReminder", @"status": @"error", @"message": @"待办内容不能为空。"};
        } else if (!target) {
            result = @{@"action": @"createReminder", @"status": @"error", @"message": @"没有可写入的提醒事项列表。"};
        } else {
            EKReminder *reminder = [EKReminder reminderWithEventStore:self.eventStore];
            reminder.title = title;
            reminder.calendar = target;

            NSDate *due = CEDateFromISO8601String(payload[@"dueAt"]);
            if (due) {
                reminder.dueDateComponents = [self.calendar components:(NSCalendarUnitYear | NSCalendarUnitMonth | NSCalendarUnitDay | NSCalendarUnitHour | NSCalendarUnitMinute)
                                                              fromDate:due];
            }
            if ([payload[@"priority"] isEqual:@"high"]) {
                reminder.priority = 1;
            }

            NSError *error = nil;
            [self.eventStore saveReminder:reminder commit:YES error:&error];
            if (error) {
                NSLog(@"[CalendarEdge] Failed to create reminder: %@", error);
                result = @{@"action": @"createReminder", @"status": @"error", @"message": error.localizedDescription ?: @"添加待办失败。"};
            } else {
                result = @{@"action": @"createReminder", @"status": @"success", @"message": @""};
            }
        }

        dispatch_async(dispatch_get_main_queue(), ^{
            if (completion) {
                completion(result);
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
            completion(@{@"granted": @NO, @"message": @"你已拒绝日历访问。请到「系统设置 > 隐私与安全性 > 日历」里打开 Edgee。"});
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
            completion(@{@"granted": @NO, @"message": @"你已拒绝提醒事项访问。请到「系统设置 > 隐私与安全性 > 提醒事项」里打开 Edgee。"});
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

- (NSDictionary *)calendarRange {
    NSDate *anchorMonth = CEStartOfMonth(self.calendar, self.calendarAnchorDate ?: [NSDate date]);
    NSDate *visibleStart = CEVisibleMonthGridStart(self.calendar, anchorMonth);
    NSDate *visibleEnd = CEAddDays(self.calendar, visibleStart, 42);

    return @{
        @"anchorMonth": CEISO8601String(anchorMonth),
        @"startsAt": CEISO8601String(visibleStart),
        @"endsAt": CEISO8601String(visibleEnd)
    };
}

- (NSArray<NSDictionary *> *)fetchEvents {
    NSDate *today = [NSDate date];
    NSDate *todayStart = CEStartOfDay(self.calendar, today);
    NSDate *minimumFocusEnd = CEAddDays(self.calendar, todayStart, 15);
    NSDate *anchorMonth = CEStartOfMonth(self.calendar, self.calendarAnchorDate ?: today);
    NSDate *monthGridStart = CEVisibleMonthGridStart(self.calendar, anchorMonth);
    NSDate *monthGridEnd = CEAddDays(self.calendar, monthGridStart, 42);
    NSDate *start = [monthGridStart compare:todayStart] == NSOrderedAscending ? monthGridStart : todayStart;
    // 网格窗口按周一起算；前端支持周日作为每周第一天，往前多取 1 天避免首格漏事件
    start = CEAddDays(self.calendar, start, -1);
    NSDate *end = [monthGridEnd compare:minimumFocusEnd] == NSOrderedDescending ? monthGridEnd : minimumFocusEnd;

    NSArray<EKCalendar *> *allCalendars = [self.eventStore calendarsForEntityType:EKEntityTypeEvent];
    NSPredicate *predicate = [self.eventStore predicateForEventsWithStartDate:start
                                                                      endDate:end
                                                                    calendars:allCalendars];
    NSArray<EKEvent *> *events = [[self.eventStore eventsMatchingPredicate:predicate]
        sortedArrayUsingComparator:^NSComparisonResult(EKEvent *lhs, EKEvent *rhs) {
            return [lhs.startDate compare:rhs.startDate];
        }];

    NSMutableString *diag = [NSMutableString string];
    [diag appendFormat:@"fetchedAt=%@\nwindow %@ -> %@\n\n== CALENDARS (%lu) ==\n",
          [NSDate date], start, end, (unsigned long)allCalendars.count];
    for (EKCalendar *cal in allCalendars) {
        [diag appendFormat:@"  title='%@' type=%ld editable=%d source='%@' sourceType=%ld id=%@\n",
              cal.title, (long)cal.type, cal.allowsContentModifications,
              cal.source.title, (long)cal.source.sourceType, cal.calendarIdentifier];
    }
    [diag appendFormat:@"\n== MATCHED EVENTS (%lu) ==\n", (unsigned long)events.count];
    for (EKEvent *event in events) {
        [diag appendFormat:@"  '%@' start=%@ end=%@ allDay=%d calendar='%@'\n",
              event.title, event.startDate, event.endDate, event.isAllDay, event.calendar.title];
    }
    [diag writeToFile:@"/tmp/calendaredge-diag.log" atomically:YES encoding:NSUTF8StringEncoding error:nil];

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
            @"isAllDay": @(event.isAllDay),
            @"notes": event.notes ?: [NSNull null],
            @"hasRecurrence": @(event.hasRecurrenceRules),
            @"calendarIdentifier": event.calendar.calendarIdentifier ?: @""
        };
        [result addObject:entry];
    }

    return result;
}

- (NSArray<NSDictionary *> *)fetchEventCalendars {
    EKCalendar *defaultCalendar = [self.eventStore defaultCalendarForNewEvents];
    NSMutableArray<NSDictionary *> *result = [NSMutableArray array];

    for (EKCalendar *calendar in [self.eventStore calendarsForEntityType:EKEntityTypeEvent]) {
        [result addObject:@{
            @"identifier": calendar.calendarIdentifier ?: @"",
            @"title": calendar.title ?: @"日历",
            @"color": CEHexStringFromColor(calendar.CGColor),
            @"isDefault": @([calendar.calendarIdentifier isEqualToString:defaultCalendar.calendarIdentifier]),
            @"allowsModifications": @(calendar.allowsContentModifications)
        }];
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
@property (nonatomic, strong, nullable) NSMenu *contextMenu;
@property (nonatomic, strong, nullable) NSTrackingArea *trackingAreaRef;
- (instancetype)initWithFrame:(NSRect)frame onEnter:(dispatch_block_t)onEnter onExit:(dispatch_block_t)onExit onClick:(dispatch_block_t)onClick;
- (void)setContextMenu:(NSMenu *)menu;
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

- (void)setContextMenu:(NSMenu *)menu {
    self.contextMenu = menu;
    self.menu = menu;
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

- (void)rightMouseUp:(NSEvent *)event {
    if (self.contextMenu) {
        [NSMenu popUpContextMenu:self.contextMenu withEvent:event forView:self];
        return;
    }

    [super rightMouseUp:event];
}

@end

@interface CEEdgeHotspotWindow : NSWindow
@property (nonatomic, strong) CEHotspotView *hotspotView;
- (instancetype)initWithScreen:(NSScreen *)screen onEnter:(dispatch_block_t)onEnter onExit:(dispatch_block_t)onExit onClick:(dispatch_block_t)onClick;
- (void)setContextMenu:(NSMenu *)menu;
@end

@implementation CEEdgeHotspotWindow

- (instancetype)initWithScreen:(NSScreen *)screen onEnter:(dispatch_block_t)onEnter onExit:(dispatch_block_t)onExit onClick:(dispatch_block_t)onClick {
    NSRect screenFrame = screen.frame;
    NSRect frame = NSMakeRect(NSMinX(screenFrame), NSMinY(screenFrame), CETriggerZoneWidth, CETriggerZoneHeight);
    self = [super initWithContentRect:frame styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:NO];
    if (self) {
        self.releasedWhenClosed = NO;
        self.level = NSStatusWindowLevel;
        self.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary;
        self.opaque = NO;
        self.backgroundColor = NSColor.clearColor;
        self.hasShadow = NO;
        self.ignoresMouseEvents = NO;
        self.hotspotView = [[CEHotspotView alloc] initWithFrame:NSMakeRect(0, 0, CETriggerZoneWidth, CETriggerZoneHeight)
                                                        onEnter:onEnter
                                                         onExit:onExit
                                                        onClick:onClick];
        self.contentView = self.hotspotView;
    }
    return self;
}

- (void)setContextMenu:(NSMenu *)menu {
    [self.hotspotView setContextMenu:menu];
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
@property (nonatomic, strong) dispatch_queue_t actionQueue;
@property (nonatomic, copy) NSString *panelMode;
- (instancetype)initWithDataProvider:(CEDataProvider *)dataProvider;
- (CGSize)panelSizeForMode:(NSString *)mode;
- (CGFloat)cornerRadiusForMode:(NSString *)mode;
- (void)setPanelModeString:(NSString *)mode animated:(BOOL)animated;
- (NSRect)safeHoverFrameForScreen:(NSScreen *)screen;
- (void)updateSafeHoverFrame:(NSRect)frame;
- (void)toggleForScreen:(NSScreen *)screen;
- (void)showOnScreen:(NSScreen *)screen;
- (void)hide;
- (void)setContextMenu:(NSMenu *)menu;
- (void)refreshSnapshot;
- (void)pushActionResult:(NSDictionary *)result;
- (void)toggleThemeFromMenu;
- (void)schedulePomodoroNotificationWithPayload:(NSDictionary *)payload;
- (void)cancelPomodoroNotification;
@end

@implementation CESlidePanelController

- (instancetype)initWithDataProvider:(CEDataProvider *)dataProvider {
    self = [super init];
    if (self) {
        _dataProvider = dataProvider;
        _actionQueue = dispatch_queue_create("local.codex.calendaredge.actions", DISPATCH_QUEUE_SERIAL);

        // 从 NSUserDefaults 恢复上次的面板模式，保证 webview 就绪前面板尺寸即正确
        NSString *storedMode = [[NSUserDefaults standardUserDefaults] stringForKey:CEPanelModeDefaultsKey];
        _panelMode = [storedMode isEqualToString:@"expanded"] ? @"expanded" : @"compact";
        CGSize initialSize = [self panelSizeForMode:_panelMode];

        WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
        // 注册自定义 scheme，使 ES 模块在 WKWebView 中正常加载（file:// 静默阻止模块脚本）
        [configuration setURLSchemeHandler:[CEBundleSchemeHandler new] forURLScheme:@"app"];
        WKUserContentController *userContentController = [[WKUserContentController alloc] init];
        [userContentController addScriptMessageHandler:self name:CEBridgeName];
        configuration.userContentController = userContentController;

        _webView = [[WKWebView alloc] initWithFrame:NSMakeRect(0, 0, initialSize.width, initialSize.height) configuration:configuration];
        _webView.navigationDelegate = self;
        _webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
        _webView.wantsLayer = YES;
        _webView.layer.cornerRadius = [self cornerRadiusForMode:_panelMode];
        _webView.layer.masksToBounds = YES;
        _webView.layer.backgroundColor = NSColor.clearColor.CGColor;
        // 透明 WebView：让 CSS backdrop-filter 透出桌面背景，实现毛玻璃效果
        [_webView setValue:@NO forKey:@"drawsBackground"];

        _panel = [[CEPanelWindow alloc] initWithContentRect:NSMakeRect(0, 0, initialSize.width, initialSize.height)
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
        context.duration = CEReduceMotion() ? 0.0 : 0.22;
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
        context.duration = CEReduceMotion() ? 0.0 : 0.18;
        [[self.panel animator] setFrame:targetFrame display:NO];
    } completionHandler:^{
        [self.panel orderOut:nil];
    }];

    self.visible = NO;
    [self stopMouseWatcher];
    [self stopRefreshTimer];
}

- (void)setContextMenu:(NSMenu *)menu {
    [self.panel setContextMenu:menu];
    self.webView.menu = menu;
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

- (void)pushActionResult:(NSDictionary *)result {
    if (!self.webReady) {
        return;
    }

    NSString *json = CEJSONStringFromObject(result);
    NSString *script = [NSString stringWithFormat:@"window.CalendarEdgeNative && window.CalendarEdgeNative.receiveActionResult && window.CalendarEdgeNative.receiveActionResult(%@);", json];
    [self.webView evaluateJavaScript:script completionHandler:^(id _Nullable evaluated, NSError * _Nullable error) {
        if (error) {
            NSLog(@"[CalendarEdge] Failed to push action result: %@", error);
        }
    }];
}

- (void)toggleThemeFromMenu {
    if (!self.webReady) {
        return;
    }

    NSString *script = @"window.CalendarEdgeNative && window.CalendarEdgeNative.toggleThemeFromMenu && window.CalendarEdgeNative.toggleThemeFromMenu();";
    [self.webView evaluateJavaScript:script completionHandler:^(id _Nullable result, NSError * _Nullable error) {
        if (error) {
            NSLog(@"[CalendarEdge] Failed to toggle theme from menu: %@", error);
        }
    }];
}

- (void)schedulePomodoroNotificationWithPayload:(NSDictionary *)payload {
    NSNumber *fireInSecondsValue = payload[@"fireInSeconds"];
    NSTimeInterval fireInSeconds = MAX(1.0, fireInSecondsValue.doubleValue);
    NSString *title = CETrimmedString(payload[@"title"] ?: @"");
    NSString *body = CETrimmedString(payload[@"body"] ?: @"");
    if (title.length == 0) {
        title = @"专注时间到了";
    }
    if (body.length == 0) {
        body = @"25 分钟专注已完成。";
    }

    UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
    [center requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound)
                          completionHandler:^(BOOL granted, NSError * _Nullable error) {
        if (!granted || error) {
            NSString *message = error.localizedDescription ?: @"系统通知未授权，时间到可能无法提醒。";
            dispatch_async(dispatch_get_main_queue(), ^{
                [self pushActionResult:@{
                    @"action": @"pomodoroNotification",
                    @"status": @"error",
                    @"message": message
                }];
            });
            return;
        }

        [center removePendingNotificationRequestsWithIdentifiers:@[CEPomodoroNotificationIdentifier]];

        UNMutableNotificationContent *content = [[UNMutableNotificationContent alloc] init];
        content.title = title;
        content.body = body;
        content.sound = [UNNotificationSound defaultSound];

        UNTimeIntervalNotificationTrigger *trigger = [UNTimeIntervalNotificationTrigger triggerWithTimeInterval:fireInSeconds repeats:NO];
        UNNotificationRequest *request = [UNNotificationRequest requestWithIdentifier:CEPomodoroNotificationIdentifier content:content trigger:trigger];

        [center addNotificationRequest:request withCompletionHandler:^(NSError * _Nullable scheduleError) {
            dispatch_async(dispatch_get_main_queue(), ^{
                if (scheduleError) {
                    [self pushActionResult:@{
                        @"action": @"pomodoroNotification",
                        @"status": @"error",
                        @"message": scheduleError.localizedDescription ?: @"番茄钟通知设置失败。"
                    }];
                    return;
                }

                [self pushActionResult:@{
                    @"action": @"pomodoroNotification",
                    @"status": @"success",
                    @"message": @"番茄钟通知已准备。"
                }];
            });
        }];
    }];
}

- (void)cancelPomodoroNotification {
    [[UNUserNotificationCenter currentNotificationCenter] removePendingNotificationRequestsWithIdentifiers:@[CEPomodoroNotificationIdentifier]];
}

- (void)sendHermesPromptText:(NSString *)text {
    NSString *trimmedText = CETrimmedString(text ?: @"");
    if (trimmedText.length == 0) {
        [self pushActionResult:@{
            @"action": @"sendHermesPrompt",
            @"status": @"error",
            @"message": @"请输入要发送给 Hermes 的内容。"
        }];
        return;
    }

    [self pushActionResult:@{
        @"action": @"sendHermesPrompt",
        @"status": @"pending",
        @"message": @"发送中…"
    }];

    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        NSTask *task = [[NSTask alloc] init];
        task.executableURL = [NSURL fileURLWithPath:@"/usr/bin/shortcuts"];
        task.arguments = @[@"run", CEHermesShortcutName, @"--input-path", @"-"];

        NSPipe *inputPipe = [NSPipe pipe];
        NSPipe *errorPipe = [NSPipe pipe];
        task.standardInput = inputPipe;
        task.standardOutput = [NSPipe pipe];
        task.standardError = errorPipe;

        NSError *launchError = nil;
        BOOL launched = [task launchAndReturnError:&launchError];
        if (launched) {
            NSData *inputData = [trimmedText dataUsingEncoding:NSUTF8StringEncoding];
            [[inputPipe fileHandleForWriting] writeData:inputData];
            [[inputPipe fileHandleForWriting] closeFile];
            [task waitUntilExit];
        }

        NSString *message = nil;
        NSString *status = @"success";
        if (!launched) {
            status = @"error";
            message = launchError.localizedDescription ?: @"无法启动系统快捷指令。";
        } else if (task.terminationStatus != 0) {
            status = @"error";
            NSData *errorData = [[errorPipe fileHandleForReading] readDataToEndOfFile];
            NSString *errorText = [[NSString alloc] initWithData:errorData encoding:NSUTF8StringEncoding];
            message = CETrimmedString(errorText ?: @"");
            if (message.length == 0) {
                message = @"运行 Send to Hermes 快捷指令失败，请确认它已创建。";
            }
        } else {
            message = @"已交给 Send to Hermes 快捷指令。";
        }

        dispatch_async(dispatch_get_main_queue(), ^{
            [self pushActionResult:@{
                @"action": @"sendHermesPrompt",
                @"status": status,
                @"message": message
            }];
        });
    });
}

- (NSRect)safeHoverFrameForScreen:(NSScreen *)screen {
    NSScreen *targetScreen = screen ?: NSScreen.mainScreen ?: NSScreen.screens.firstObject;
    if (!targetScreen) {
        return NSZeroRect;
    }

    NSRect screenFrame = targetScreen.frame;
    return NSMakeRect(NSMinX(screenFrame), NSMinY(screenFrame), CETriggerZoneWidth, CETriggerZoneHeight);
}

- (NSRect)panelFrameForScreen:(NSScreen *)screen offscreen:(BOOL)offscreen {
    NSRect visibleFrame = screen.visibleFrame;
    CGSize targetSize = [self panelSizeForMode:self.panelMode];
    CGFloat width = MIN(targetSize.width, visibleFrame.size.width - CEPanelScreenInset * 2.0);
    CGFloat height = MIN(targetSize.height, visibleFrame.size.height - 26.0);
    CGFloat y = NSMinY(visibleFrame) + CEPanelScreenInset;
    CGFloat x = offscreen ? NSMinX(visibleFrame) - width - CEPanelScreenInset : NSMinX(visibleFrame) + CEPanelScreenInset;
    return NSMakeRect(x, y, width, height);
}

- (CGSize)panelSizeForMode:(NSString *)mode {
    if ([mode isEqualToString:@"expanded"]) {
        return CGSizeMake(CEExpandedPanelWidth, CEExpandedPanelHeight);
    }
    return CGSizeMake(CECompactPanelWidth, CECompactPanelHeight);
}

- (CGFloat)cornerRadiusForMode:(NSString *)mode {
    return [mode isEqualToString:@"expanded"] ? CEExpandedCornerRadius : CECompactCornerRadius;
}

- (void)setPanelModeString:(NSString *)mode animated:(BOOL)animated {
    NSString *normalizedMode = [mode isEqualToString:@"expanded"] ? @"expanded" : @"compact";
    BOOL changed = ![normalizedMode isEqualToString:self.panelMode];
    self.panelMode = normalizedMode;
    [[NSUserDefaults standardUserDefaults] setObject:normalizedMode forKey:CEPanelModeDefaultsKey];

    if (!changed || !self.visible) {
        return;
    }

    NSScreen *screen = self.panel.screen ?: NSScreen.mainScreen ?: NSScreen.screens.firstObject;
    if (!screen) {
        return;
    }

    NSRect endFrame = [self panelFrameForScreen:screen offscreen:NO];
    CGFloat cornerRadius = [self cornerRadiusForMode:normalizedMode];

    // 缩放期间光标可能落在过渡 frame 之外，先停 mouseWatcher 避免误收起
    [self stopMouseWatcher];

    if (!animated) {
        [self.panel setFrame:endFrame display:YES];
        self.webView.layer.cornerRadius = cornerRadius;
        [self restartMouseWatcherAfterResize];
        return;
    }

    [NSAnimationContext runAnimationGroup:^(NSAnimationContext *context) {
        context.duration = CEReduceMotion() ? 0.0 : 0.22;
        context.timingFunction = [CAMediaTimingFunction functionWithName:kCAMediaTimingFunctionEaseInEaseOut];
        [[self.panel animator] setFrame:endFrame display:YES];
    } completionHandler:^{
        self.webView.layer.cornerRadius = cornerRadius;
        [self restartMouseWatcherAfterResize];
    }];
}

- (void)restartMouseWatcherAfterResize {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.3 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        if (self.visible) {
            [self startMouseWatcher];
        }
    });
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

    if ([type isEqualToString:@"setCalendarMonth"]) {
        [self.dataProvider setCalendarAnchorDateFromString:payload[@"anchorDate"]];
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

    if ([type isEqualToString:@"createEvent"]) {
        [self.dataProvider createEventWithPayload:payload completion:^(NSDictionary *result) {
            [self pushActionResult:result];
            [self refreshSnapshot];
        }];
        return;
    }

    if ([type isEqualToString:@"updateEventDates"]) {
        [self.dataProvider updateEventDatesWithPayload:payload completion:^(NSDictionary *result) {
            [self pushActionResult:result];
            [self refreshSnapshot];
        }];
        return;
    }

    if ([type isEqualToString:@"updateEvent"]) {
        [self.dataProvider updateEventWithPayload:payload completion:^(NSDictionary *result) {
            [self pushActionResult:result];
            [self refreshSnapshot];
        }];
        return;
    }

    if ([type isEqualToString:@"deleteEvent"]) {
        [self.dataProvider deleteEventWithPayload:payload completion:^(NSDictionary *result) {
            [self pushActionResult:result];
            [self refreshSnapshot];
        }];
        return;
    }

    if ([type isEqualToString:@"createReminder"]) {
        [self.dataProvider createReminderWithPayload:payload completion:^(NSDictionary *result) {
            [self pushActionResult:result];
            [self refreshSnapshot];
        }];
        return;
    }

    if ([type isEqualToString:@"playSound"]) {
        NSString *soundName = [payload[@"name"] isKindOfClass:NSString.class] && [payload[@"name"] length] > 0
            ? payload[@"name"] : @"Tink";
        [[NSSound soundNamed:soundName] play];
        return;
    }

    if ([type isEqualToString:@"sendHermesPrompt"]) {
        [self sendHermesPromptText:payload[@"text"]];
        return;
    }

    if ([type isEqualToString:@"schedulePomodoroNotification"]) {
        [self schedulePomodoroNotificationWithPayload:payload];
        return;
    }

    if ([type isEqualToString:@"cancelPomodoroNotification"]) {
        [self cancelPomodoroNotification];
        return;
    }

    if ([type isEqualToString:@"setPanelMode"]) {
        NSNumber *animatedValue = payload[@"animated"];
        BOOL animated = animatedValue ? animatedValue.boolValue : YES;
        [self setPanelModeString:payload[@"mode"] animated:animated];
        return;
    }
}

@end

#pragma mark - App Delegate

@interface CEAppDelegate : NSObject <NSApplicationDelegate, UNUserNotificationCenterDelegate>
@property (nonatomic, strong) CEDataProvider *dataProvider;
@property (nonatomic, strong) CESlidePanelController *panelController;
@property (nonatomic, strong, nullable) id globalMouseMonitor;
@property (nonatomic, strong, nullable) id localMouseMonitor;
@property (nonatomic, strong, nullable) NSTimer *hoverTimer;
@property (nonatomic, strong, nullable) NSScreen *pendingHoverScreen;
@property (nonatomic, strong, nullable) NSTimer *edgePollTimer;
@property (nonatomic, strong, nullable) NSMenu *contextMenu;
@property (nonatomic, strong, nullable) NSStatusItem *statusItem;
- (NSMenu *)calendarEdgeContextMenu;
- (void)refreshCalendarEdge:(id)sender;
- (void)toggleCalendarEdgeTheme:(id)sender;
- (void)openCalendarApp:(id)sender;
- (void)openRemindersApp:(id)sender;
- (void)restartCalendarEdge:(id)sender;
- (void)quitCalendarEdge:(id)sender;
@end

@implementation CEAppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [UNUserNotificationCenter currentNotificationCenter].delegate = self;
    self.dataProvider = [[CEDataProvider alloc] init];
    self.panelController = [[CESlidePanelController alloc] initWithDataProvider:self.dataProvider];
    [self.panelController setContextMenu:[self calendarEdgeContextMenu]];
    __weak typeof(self) weakSelf = self;
    self.dataProvider.onStoreChanged = ^{
        [weakSelf.panelController refreshSnapshot];
    };
    [self startEdgeMonitoring];
    [self installStatusItem];

    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(handleScreenChange)
                                                 name:NSApplicationDidChangeScreenParametersNotification
                                               object:nil];
}

// HIG:工具型 app 提供菜单栏常驻入口。左键切换面板,右键弹上下文菜单
- (void)installStatusItem {
    self.statusItem = [[NSStatusBar systemStatusBar] statusItemWithLength:NSSquareStatusItemLength];
    NSImage *icon = [NSImage imageWithSystemSymbolName:@"calendar" accessibilityDescription:@"Edgee"];
    icon.template = YES;
    self.statusItem.button.image = icon;
    self.statusItem.button.target = self;
    self.statusItem.button.action = @selector(statusItemClicked:);
    [self.statusItem.button sendActionOn:NSEventMaskLeftMouseUp | NSEventMaskRightMouseUp];
}

- (void)statusItemClicked:(id)sender {
    NSEvent *event = NSApp.currentEvent;
    if (event.type == NSEventTypeRightMouseUp || (event.modifierFlags & NSEventModifierFlagControl)) {
        NSMenu *menu = [self calendarEdgeContextMenu];
        [menu popUpMenuPositioningItem:nil
                            atLocation:NSMakePoint(0, self.statusItem.button.bounds.size.height + 4)
                                inView:self.statusItem.button];
        return;
    }
    NSScreen *screen = NSScreen.mainScreen ?: NSScreen.screens.firstObject;
    if (screen) {
        [self.panelController toggleForScreen:screen];
    }
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

- (NSMenu *)calendarEdgeContextMenu {
    if (self.contextMenu) {
        return self.contextMenu;
    }

    NSMenu *menu = [[NSMenu alloc] initWithTitle:@"Edgee"];

    NSMenuItem *refreshItem = [[NSMenuItem alloc] initWithTitle:@"Refresh"
                                                         action:@selector(refreshCalendarEdge:)
                                                  keyEquivalent:@""];
    refreshItem.target = self;
    [menu addItem:refreshItem];

    NSMenuItem *themeItem = [[NSMenuItem alloc] initWithTitle:@"Toggle Theme"
                                                       action:@selector(toggleCalendarEdgeTheme:)
                                                keyEquivalent:@""];
    themeItem.target = self;
    [menu addItem:themeItem];

    [menu addItem:[NSMenuItem separatorItem]];

    NSMenuItem *calendarItem = [[NSMenuItem alloc] initWithTitle:@"Open Calendar"
                                                          action:@selector(openCalendarApp:)
                                                   keyEquivalent:@""];
    calendarItem.target = self;
    [menu addItem:calendarItem];

    NSMenuItem *remindersItem = [[NSMenuItem alloc] initWithTitle:@"Open Reminders"
                                                           action:@selector(openRemindersApp:)
                                                    keyEquivalent:@""];
    remindersItem.target = self;
    [menu addItem:remindersItem];

    [menu addItem:[NSMenuItem separatorItem]];

    NSMenuItem *restartItem = [[NSMenuItem alloc] initWithTitle:@"Restart Edgee"
                                                         action:@selector(restartCalendarEdge:)
                                                  keyEquivalent:@""];
    restartItem.target = self;
    [menu addItem:restartItem];

    [menu addItem:[NSMenuItem separatorItem]];

    NSMenuItem *quitItem = [[NSMenuItem alloc] initWithTitle:@"Quit Edgee"
                                                      action:@selector(quitCalendarEdge:)
                                               keyEquivalent:@""];
    quitItem.target = self;
    [menu addItem:quitItem];

    self.contextMenu = menu;
    return menu;
}

- (void)refreshCalendarEdge:(id)sender {
    [self.panelController refreshSnapshot];
}

- (void)toggleCalendarEdgeTheme:(id)sender {
    [self.panelController toggleThemeFromMenu];
}

- (void)openCalendarApp:(id)sender {
    CEOpenApplication(CECalendarAppPath);
}

- (void)openRemindersApp:(id)sender {
    CEOpenApplication(CERemindersAppPath);
}

- (void)restartCalendarEdge:(id)sender {
    NSURL *bundleURL = NSBundle.mainBundle.bundleURL;
    NSWorkspaceOpenConfiguration *configuration = [NSWorkspaceOpenConfiguration configuration];
    configuration.createsNewApplicationInstance = YES;

    [[NSWorkspace sharedWorkspace] openApplicationAtURL:bundleURL
                                          configuration:configuration
                                      completionHandler:^(NSRunningApplication * _Nullable app, NSError * _Nullable error) {
        if (error) {
            NSLog(@"[CalendarEdge] Restart failed to launch new instance: %@", error);
            return;
        }

        [NSApp terminate:nil];
    }];
}

- (void)quitCalendarEdge:(id)sender {
    [NSApp terminate:nil];
}

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions options))completionHandler {
    if (@available(macOS 11.0, *)) {
        completionHandler(UNNotificationPresentationOptionBanner | UNNotificationPresentationOptionList | UNNotificationPresentationOptionSound);
        return;
    }

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    completionHandler(UNNotificationPresentationOptionAlert | UNNotificationPresentationOptionSound);
#pragma clang diagnostic pop
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

    NSRect triggerZone = [self.panelController safeHoverFrameForScreen:screen];
    if (NSPointInRect(location, triggerZone)) {
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
        NSRect triggerZone = [weakSelf.panelController safeHoverFrameForScreen:screen];
        if (NSPointInRect(location, triggerZone)) {
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
