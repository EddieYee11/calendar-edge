import React, { useEffect, useMemo, useState } from 'react';
import { createMockSnapshot } from './mockSnapshot';
import { parseQuickEntry } from './lib/parseQuickEntry';
import Workbench from './Workbench';

const POLL_INTERVAL_MS = 30_000;
const POMODORO_DURATION_SECONDS = 25 * 60;
const PANEL_MODE_STORAGE_KEY = 'calendar-edge-panel-mode';
const FOCUS_LOG_STORAGE_KEY = 'xuri-focus-log';
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const CAPTURE_REFRESH_DELAYS_MS = [15_000, 45_000];
const MUTATION_ACTIONS = ['createEvent', 'updateEventDates', 'createReminder', 'updateEvent', 'deleteEvent'];

function getInitialPanelMode() {
  if (typeof window === 'undefined') {
    return 'compact';
  }

  try {
    const paramMode = new URLSearchParams(window.location.search).get('mode');
    if (paramMode === 'expanded' || paramMode === 'compact') {
      return paramMode;
    }

    const storedMode = window.localStorage.getItem(PANEL_MODE_STORAGE_KEY);
    return storedMode === 'expanded' || storedMode === 'compact' ? storedMode : 'compact';
  } catch {
    return 'compact';
  }
}

function postNativeMessage(type, payload = {}) {
  if (window.webkit?.messageHandlers?.calendarEdge) {
    window.webkit.messageHandlers.calendarEdge.postMessage({ type, ...payload });
    return true;
  }

  return false;
}

function interactiveProps(onActivate) {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onActivate();
      }
    }
  };
}

function formatChineseDate(date) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  }).format(date);
}

function formatClock(date) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

function formatTime(date) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric'
  }).format(date);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isSameDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, offset) {
  const next = new Date(date);
  next.setDate(next.getDate() + offset);
  return next;
}

function formatEventChipTime(event) {
  if (event.isAllDay) {
    return '全天';
  }

  const start = toDate(event.startAt);
  return start ? formatTime(start) : '';
}

function sortDayEvents(events) {
  return [...events].sort((left, right) => {
    if (left.isAllDay !== right.isAllDay) {
      return left.isAllDay ? -1 : 1;
    }

    const leftStart = toDate(left.startAt)?.getTime() ?? 0;
    const rightStart = toDate(right.startAt)?.getTime() ?? 0;
    if (leftStart !== rightStart) {
      return leftStart - rightStart;
    }

    return left.title.localeCompare(right.title, 'zh-CN');
  });
}

function minutesBetween(from, to) {
  return Math.round((to.getTime() - from.getTime()) / 60000);
}

function toDate(value) {
  return value ? new Date(value) : null;
}

function sortEvents(events) {
  return [...events].sort((left, right) => {
    const leftStart = toDate(left.startAt)?.getTime() ?? 0;
    const rightStart = toDate(right.startAt)?.getTime() ?? 0;
    return leftStart - rightStart;
  });
}

function sortReminders(reminders) {
  return [...reminders].sort((left, right) => {
    const leftOverdue = left.isOverdue ? 0 : 1;
    const rightOverdue = right.isOverdue ? 0 : 1;

    if (leftOverdue !== rightOverdue) {
      return leftOverdue - rightOverdue;
    }

    const leftDue = toDate(left.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightDue = toDate(right.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;

    if (leftDue !== rightDue) {
      return leftDue - rightDue;
    }

    return left.title.localeCompare(right.title, 'zh-CN');
  });
}

function parseEventMeta(title) {
  const raw = title || '';
  let cleanTitle = raw;
  let priority = null;
  let isDeadline = false;

  if (/【\s*deadline\s*】/i.test(cleanTitle)) {
    isDeadline = true;
    priority = 'high';
    cleanTitle = cleanTitle.replace(/【\s*deadline\s*】/gi, ' ');
  }

  if (/\bDDL\b/i.test(cleanTitle)) {
    isDeadline = true;
    priority = 'high';
    cleanTitle = cleanTitle.replace(/\bDDL\b/gi, ' ');
  }

  if (/[!！]高/.test(cleanTitle)) {
    priority = 'high';
    cleanTitle = cleanTitle.replace(/[!！]高/g, ' ');
  } else if (/[!！]中/.test(cleanTitle)) {
    priority = priority === 'high' ? priority : 'med';
    cleanTitle = cleanTitle.replace(/[!！]中/g, ' ');
  } else if (/[!！]低/.test(cleanTitle)) {
    priority = priority === 'high' ? priority : 'low';
    cleanTitle = cleanTitle.replace(/[!！]低/g, ' ');
  }

  if (!priority) {
    priority = /提醒|订阅/.test(cleanTitle) ? 'low' : 'med';
  }

  cleanTitle = cleanTitle.replace(/\s{2,}/g, ' ').trim() || raw.trim();

  return { priority, isDeadline, cleanTitle };
}

function decorateEvents(events) {
  return events.map((event) => ({ ...event, ...parseEventMeta(event.title), hasConflict: false }));
}

function detectConflicts(events) {
  const conflictDayKeys = new Set();
  const timedByDay = {};

  events.forEach((event) => {
    if (event.isAllDay) {
      return;
    }

    const start = toDate(event.startAt);
    const end = toDate(event.endAt);
    if (!start || !end) {
      return;
    }

    const key = dateKey(start);
    if (!timedByDay[key]) {
      timedByDay[key] = [];
    }
    timedByDay[key].push({ event, start, end });
  });

  Object.entries(timedByDay).forEach(([key, items]) => {
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        if (items[j].start < items[i].end && items[i].start < items[j].end) {
          items[i].event.hasConflict = true;
          items[j].event.hasConflict = true;
          conflictDayKeys.add(key);
        }
      }
    }
  });

  return conflictDayKeys;
}

function humanCountdown(now, target) {
  const mins = minutesBetween(now, target);

  if (mins <= 0) {
    return { countdownLabel: '已逾期', urgency: 'overdue' };
  }

  if (mins < 48 * 60) {
    return { countdownLabel: `${Math.max(1, Math.round(mins / 60))}h后`, urgency: 'soon' };
  }

  return { countdownLabel: `${Math.round(mins / (24 * 60))}天后`, urgency: 'later' };
}

const DEADLINE_HORIZON_DAYS = 14;

function buildDeadlines(events, reminders, now) {
  const horizon = addDays(startOfDay(now), DEADLINE_HORIZON_DAYS + 1);
  const items = [];

  events.forEach((event) => {
    if (!event.isDeadline && event.priority !== 'high') {
      return;
    }

    const target = toDate(event.startAt);
    if (!target || target < now || target > horizon) {
      return;
    }

    items.push({
      id: `deadline-event-${event.identifier}-${event.startAt}`,
      kind: 'event',
      title: event.cleanTitle,
      target,
      ...humanCountdown(now, target)
    });
  });

  reminders.forEach((item) => {
    const due = toDate(item.dueAt);
    if (!due) {
      return;
    }

    if (!item.isOverdue && (due < now || due > horizon)) {
      return;
    }

    items.push({
      id: `deadline-reminder-${item.identifier}`,
      kind: 'reminder',
      title: item.title,
      target: due,
      ...humanCountdown(now, due)
    });
  });

  return items.sort((left, right) => left.target - right.target);
}

function nowDividerIndex(events, now) {
  return events.findIndex((event) => {
    const start = toDate(event.startAt);
    return start && start > now;
  });
}

function buildViewModel(snapshot, now) {
  const events = decorateEvents(sortEvents(snapshot.events || []));
  const reminders = sortReminders((snapshot.reminders || []).filter((item) => !item.completed));
  const conflictDayKeys = detectConflicts(events);

  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const nextWeekEnd = new Date(todayStart);
  nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);

  const todayEvents = events.filter((event) => {
    const start = toDate(event.startAt);
    return start && isSameDay(start, now);
  });

  const nowEvent =
    todayEvents.find((event) => {
      const start = toDate(event.startAt);
      const end = toDate(event.endAt);

      if (!start || !end) {
        return false;
      }

      return start <= now && now <= end;
    }) || null;

  const nextEvent =
    events.find((event) => {
      const start = toDate(event.startAt);
      return start && start > now;
    }) || null;

  const pastEvents = todayEvents.filter((event) => {
    const end = toDate(event.endAt);
    return end && end < now;
  });

  const remainingEvents = todayEvents.filter((event) => {
    const end = toDate(event.endAt);
    return end && end >= now;
  });

  const todayReminders = reminders.filter((item) => {
    const due = toDate(item.dueAt);
    if (!due) {
      return false;
    }

    return item.isOverdue || (due >= todayStart && due <= todayEnd);
  });

  const groupedTasks = Object.values(
    reminders.reduce((groups, item) => {
      const key = item.listIdentifier || item.listTitle || '默认';

      if (!groups[key]) {
        groups[key] = {
          id: key,
          title: item.listTitle || '默认',
          color: item.listColor || '#e59373',
          items: []
        };
      }

      groups[key].items.push(item);
      return groups;
    }, {})
  )
    .map((group) => ({
      ...group,
      items: sortReminders(group.items)
    }))
    .sort((left, right) => right.items.length - left.items.length);

  const nextDays = [];
  for (let offset = 1; offset <= 7; offset += 1) {
    const day = new Date(todayStart);
    day.setDate(day.getDate() + offset);

    const items = events.filter((event) => {
      const start = toDate(event.startAt);
      return start && isSameDay(start, day);
    });

    if (!items.length) {
      continue;
    }

    nextDays.push({
      id: day.toISOString(),
      anchorDate: day.toISOString(),
      title: offset === 1 ? '明天' : new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(day),
      subtitle: formatShortDate(day),
      items
    });
  }

  const hasAnyTodayContent = Boolean(nowEvent || nextEvent || remainingEvents.length || todayReminders.length || pastEvents.length);

  const deadlines = buildDeadlines(events, reminders, now);

  const timedTodayEvents = todayEvents.filter((event) => !event.isAllDay);
  const progress = {
    done: timedTodayEvents.filter((event) => {
      const end = toDate(event.endAt);
      return end && end < now;
    }).length,
    total: timedTodayEvents.length
  };

  return {
    events,
    reminders,
    todayEvents,
    nowEvent,
    nextEvent,
    pastEvents,
    remainingEvents,
    todayReminders,
    groupedTasks,
    nextDays,
    hasAnyTodayContent,
    deadlines,
    conflictDayKeys,
    progress
  };
}

function humanUntil(now, targetDate) {
  const mins = minutesBetween(now, targetDate);

  if (mins <= 0) {
    return '马上开始';
  }

  if (mins < 60) {
    return `${mins} 分钟后开始`;
  }

  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest === 0 ? `${hours} 小时后开始` : `${hours} 小时 ${rest} 分钟后开始`;
}

function humanTimeLeft(now, targetDate) {
  const mins = minutesBetween(now, targetDate);
  if (mins <= 0) {
    return '即将结束';
  }

  if (mins < 60) {
    return `还剩 ${mins} 分钟`;
  }

  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest === 0 ? `还剩 ${hours} 小时` : `还剩 ${hours} 小时 ${rest} 分钟`;
}

function progressOf(event, now) {
  const start = toDate(event.startAt);
  const end = toDate(event.endAt);

  if (!start || !end) {
    return 0;
  }

  if (now <= start) {
    return 0;
  }

  if (now >= end) {
    return 1;
  }

  return (now.getTime() - start.getTime()) / (end.getTime() - start.getTime());
}

function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${`${seconds}`.padStart(2, '0')}`;
}

function extractHero(snapshotModel, now) {
  if (snapshotModel.nowEvent) {
    return {
      type: 'now',
      event: snapshotModel.nowEvent,
      eyebrow: humanTimeLeft(now, toDate(snapshotModel.nowEvent.endAt)),
      progress: progressOf(snapshotModel.nowEvent, now)
    };
  }

  if (snapshotModel.nextEvent) {
    return {
      type: 'next',
      event: snapshotModel.nextEvent,
      eyebrow: humanUntil(now, toDate(snapshotModel.nextEvent.startAt)),
      progress: 0
    };
  }

  return null;
}

function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [snapshotTimedOut, setSnapshotTimedOut] = useState(false);
  const [now, setNow] = useState(new Date());
  const [pendingReminderIds, setPendingReminderIds] = useState({});
  const [panelMode, setPanelMode] = useState(getInitialPanelMode);
  const [hermesDraft, setHermesDraft] = useState('');
  const [hermesActionState, setHermesActionState] = useState(null);
  const [pendingCaptures, setPendingCaptures] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [mutationResult, setMutationResult] = useState(null);
  const [focusLogVersion, setFocusLogVersion] = useState(0);
  const [pomodoroStatus, setPomodoroStatus] = useState('idle');
  const [pomodoroRemainingSeconds, setPomodoroRemainingSeconds] = useState(POMODORO_DURATION_SECONDS);
  const [pomodoroEndsAt, setPomodoroEndsAt] = useState(null);
  const [pomodoroNotificationState, setPomodoroNotificationState] = useState(null);
  const [pomodoroBoundTitle, setPomodoroBoundTitle] = useState(null);
  const captureRefreshTimers = React.useRef([]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  // 桥接卡死保护:9s 无 snapshot 转为错误卡,可手动重试
  useEffect(() => {
    if (snapshot) {
      return undefined;
    }
    const timer = window.setTimeout(() => setSnapshotTimedOut(true), 9000);
    return () => window.clearTimeout(timer);
  }, [snapshot, snapshotTimedOut]);

  useEffect(() => {
    const onKeyDown = (event) => {
      // 快速创建浮层等局部 UI 会 preventDefault 掉自己的 Esc，此时不收起面板
      if (event.key === 'Escape' && !event.defaultPrevented) {
        postNativeMessage('close');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PANEL_MODE_STORAGE_KEY, panelMode);
    } catch {
      // Ignore storage failures so the panel still works in restricted contexts.
    }

    postNativeMessage('setPanelMode', { mode: panelMode });
  }, [panelMode]);

  useEffect(() => {
    postNativeMessage('setCalendarMonth', {
      anchorDate: startOfMonth(calendarMonth).toISOString()
    });
  }, [calendarMonth]);

  useEffect(() => {
    if (pomodoroStatus !== 'running' || !pomodoroEndsAt) {
      return undefined;
    }

    const tick = () => {
      const nextRemaining = Math.max(0, Math.ceil((pomodoroEndsAt - Date.now()) / 1000));
      setPomodoroRemainingSeconds(nextRemaining);
      if (nextRemaining <= 0) {
        setPomodoroStatus('completed');
        setPomodoroEndsAt(null);
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [pomodoroStatus, pomodoroEndsAt]);

  useEffect(() => {
    window.CalendarEdgeNative = {
      receiveSnapshot(nextSnapshot) {
        setSnapshot(nextSnapshot);
        setPendingReminderIds({});
      },
      receiveActionResult(nextResult) {
        if (nextResult?.action === 'pomodoroNotification') {
          setPomodoroNotificationState(nextResult);
          return;
        }

        if (MUTATION_ACTIONS.includes(nextResult?.action)) {
          setMutationResult(nextResult);
          return;
        }

        if (nextResult?.action !== 'sendHermesPrompt') {
          return;
        }

        setHermesActionState(nextResult);
        if (nextResult.status === 'error') {
          setPendingCaptures([]);
        }
        if (nextResult.status === 'success') {
          setHermesDraft('');
          captureRefreshTimers.current.forEach((timerId) => window.clearTimeout(timerId));
          captureRefreshTimers.current = CAPTURE_REFRESH_DELAYS_MS.map((delay) =>
            window.setTimeout(() => postNativeMessage('refresh'), delay)
          );
        }
      },
      toggleThemeFromMenu() {
        // 新版采用固定混合配色；保留空实现以兼容原生右键菜单的 Toggle Theme 项。
      }
    };

    const bridged = postNativeMessage('ready');
    if (!bridged) {
      setSnapshot(createMockSnapshot());
    }

    return () => {
      captureRefreshTimers.current.forEach((timerId) => window.clearTimeout(timerId));
      captureRefreshTimers.current = [];
      if (window.CalendarEdgeNative?.receiveSnapshot) {
        delete window.CalendarEdgeNative;
      }
    };
  }, []);

  // 每完成一轮 25 分钟专注，写入本机专注日志，供「专注统计」视图汇总
  useEffect(() => {
    if (pomodoroStatus !== 'completed') {
      return;
    }

    try {
      const log = JSON.parse(window.localStorage.getItem(FOCUS_LOG_STORAGE_KEY) || '[]');
      log.push({ date: dateKey(new Date()), minutes: POMODORO_DURATION_SECONDS / 60 });
      window.localStorage.setItem(FOCUS_LOG_STORAGE_KEY, JSON.stringify(log));
    } catch {
      // 存储失败不影响主流程
    }
    setFocusLogVersion((version) => version + 1);
  }, [pomodoroStatus]);

  const model = useMemo(() => {
    if (!snapshot) {
      return null;
    }
    return buildViewModel(snapshot, now);
  }, [snapshot, now]);

  const hero = useMemo(() => {
    if (!model) {
      return null;
    }
    return extractHero(model, now);
  }, [model, now]);

  // 排入中的行与 snapshot 对账:真实事件出现即移除;60s(两轮盲刷新)未出现则放弃
  useEffect(() => {
    if (!model) {
      return;
    }
    setPendingCaptures((list) => {
      if (!list.length) {
        return list;
      }
      const next = list.filter((c) => {
        if (Date.now() - c.createdAt > 60_000) {
          return false;
        }
        return !model.events.some((e) => {
          const start = toDate(e.startAt);
          if (!start || dateKey(start) !== c.dateKey) {
            return false;
          }
          if (!(e.cleanTitle || e.title || '').includes(c.title)) {
            return false;
          }
          return !c.time || formatTime(start) === c.time;
        });
      });
      return next.length === list.length ? list : next;
    });
  }, [model]);

  const calendarPermission = snapshot?.permissions?.calendar || { granted: false, message: '正在检查日历权限…' };
  const remindersPermission = snapshot?.permissions?.reminders || { granted: false, message: '正在检查提醒事项权限…' };

  function handleHermesDraftChange(event) {
    setHermesDraft(event.target.value);
    setHermesActionState((currentState) => (currentState?.status === 'pending' ? currentState : null));
  }

  function handleHermesSubmit(event) {
    event.preventDefault();

    const trimmedDraft = hermesDraft.trim();
    if (!trimmedDraft || hermesActionState?.status === 'pending') {
      return;
    }

    const bridged = postNativeMessage('sendHermesPrompt', { text: trimmedDraft });
    if (!bridged) {
      setHermesActionState({
        action: 'sendHermesPrompt',
        status: 'error',
        message: 'Hermes 快捷发送仅在原生应用中可用。'
      });
      return;
    }

    setHermesActionState({
      action: 'sendHermesPrompt',
      status: 'pending',
      message: '正在运行 Send to Hermes 快捷指令…'
    });

    // 乐观显示:本地预解析出标题/时间,先插一条排入中的行,等 snapshot 出现真实事件后移除
    const parsed = parseQuickEntry(trimmedDraft, dateKey(new Date()));
    setPendingCaptures((list) => [
      ...list,
      {
        id: Date.now(),
        title: parsed.title || trimmedDraft,
        time: parsed.time,
        dateKey: parsed.dateKey || dateKey(new Date()),
        createdAt: Date.now()
      }
    ]);
  }

  function handleEventOpen(event) {
    postNativeMessage('revealEvent', {
      identifier: event.identifier,
      externalIdentifier: event.externalIdentifier,
      title: event.title,
      startAt: event.startAt,
      calendarTitle: event.calendarTitle
    });
  }

  function handleJoin(url) {
    if (!url) {
      return;
    }

    postNativeMessage('openJoinURL', { url });
  }

  function handleReminderToggle(item) {
    setPendingReminderIds((current) => ({
      ...current,
      [item.identifier]: true
    }));

    postNativeMessage('toggleReminder', {
      identifier: item.identifier,
      completed: !item.completed
    });
  }

  function handleReminderOpen(item) {
    postNativeMessage('revealReminder', {
      identifier: item.identifier,
      externalIdentifier: item.externalIdentifier,
      title: item.title,
      listTitle: item.listTitle
    });
  }

  function handleCreateEvent(payload) {
    return postNativeMessage('createEvent', payload);
  }

  function handleUpdateEventDates(payload) {
    return postNativeMessage('updateEventDates', payload);
  }

  function handleCreateReminder(payload) {
    return postNativeMessage('createReminder', payload);
  }

  function handleUpdateEvent(payload) {
    return postNativeMessage('updateEvent', payload);
  }

  function handleDeleteEvent(payload) {
    return postNativeMessage('deleteEvent', payload);
  }

  function schedulePomodoroNotification(seconds, boundTitle = pomodoroBoundTitle) {
    const bridged = postNativeMessage('schedulePomodoroNotification', {
      fireInSeconds: seconds,
      title: boundTitle ? `专注完成：${boundTitle}` : '专注时间到了',
      body: boundTitle ? `「${boundTitle}」的 25 分钟专注已完成。` : '25 分钟专注已完成。'
    });

    if (!bridged) {
      setPomodoroNotificationState({
        action: 'pomodoroNotification',
        status: 'error',
        message: '系统通知仅在原生应用中可用。'
      });
    }
  }

  function cancelPomodoroNotification() {
    postNativeMessage('cancelPomodoroNotification');
  }

  function handlePomodoroStart(boundTitle = null) {
    const endsAt = Date.now() + POMODORO_DURATION_SECONDS * 1000;
    setPomodoroBoundTitle(boundTitle);
    setPomodoroStatus('running');
    setPomodoroRemainingSeconds(POMODORO_DURATION_SECONDS);
    setPomodoroEndsAt(endsAt);
    setPomodoroNotificationState(null);
    schedulePomodoroNotification(POMODORO_DURATION_SECONDS, boundTitle);
  }

  function handlePomodoroStartForEvent(event) {
    handlePomodoroStart(event?.cleanTitle || event?.title || null);
  }

  function handlePomodoroPause() {
    if (pomodoroStatus !== 'running') {
      return;
    }

    const nextRemaining = Math.max(1, Math.ceil(((pomodoroEndsAt || Date.now()) - Date.now()) / 1000));
    setPomodoroStatus('paused');
    setPomodoroRemainingSeconds(nextRemaining);
    setPomodoroEndsAt(null);
    cancelPomodoroNotification();
  }

  function handlePomodoroResume() {
    const nextRemaining = Math.max(1, pomodoroRemainingSeconds);
    setPomodoroStatus('running');
    setPomodoroEndsAt(Date.now() + nextRemaining * 1000);
    setPomodoroNotificationState(null);
    schedulePomodoroNotification(nextRemaining);
  }

  function handlePomodoroStop() {
    setPomodoroStatus('idle');
    setPomodoroRemainingSeconds(POMODORO_DURATION_SECONDS);
    setPomodoroEndsAt(null);
    setPomodoroNotificationState(null);
    setPomodoroBoundTitle(null);
    cancelPomodoroNotification();
  }

  function handleCalendarMonthChange(nextMonth) {
    setCalendarMonth(startOfMonth(nextMonth));
  }

  const pomodoro = {
    status: pomodoroStatus,
    remainingSeconds: pomodoroRemainingSeconds,
    notificationState: pomodoroNotificationState,
    boundTitle: pomodoroBoundTitle,
    onStart: () => handlePomodoroStart(pomodoroBoundTitle),
    onPause: handlePomodoroPause,
    onResume: handlePomodoroResume,
    onStop: handlePomodoroStop
  };

  const capture = {
    value: hermesDraft,
    actionState: hermesActionState,
    onChange: handleHermesDraftChange,
    onSubmit: handleHermesSubmit
  };

  if (!snapshot || !model) {
    return (
      <div className="app-shell" data-panel-mode={panelMode}>
        {snapshotTimedOut ? (
          <div className="loading-card">
            <div className="loading-title">连接日历超时</div>
            <div className="loading-subtitle">未收到日历数据，可能是权限或桥接问题。</div>
            <button
              className="ghost-button"
              onClick={() => {
                setSnapshotTimedOut(false);
                postNativeMessage('refresh');
              }}
            >
              重试
            </button>
          </div>
        ) : (
          <div className="loading-card">
            <div className="loading-title">正在载入你的扫视面板</div>
            <div className="loading-subtitle">正在连接日历与提醒事项…</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-shell" data-panel-mode={panelMode}>
      {panelMode === 'compact' ? (
        <CompactPanel
          model={model}
          hero={hero}
          now={now}
          calendarPermission={calendarPermission}
          capture={capture}
          pomodoro={pomodoro}
          pendingCaptures={pendingCaptures}
          onFocusStart={handlePomodoroStartForEvent}
          onEventOpen={handleEventOpen}
          onExpand={() => setPanelMode('expanded')}
        />
      ) : (
        <Workbench
          model={model}
          snapshot={snapshot}
          now={now}
          calendarMonth={calendarMonth}
          onMonthChange={handleCalendarMonthChange}
          pomodoro={pomodoro}
          onFocusStart={handlePomodoroStartForEvent}
          onEventOpen={handleEventOpen}
          onJoin={handleJoin}
          onReminderToggle={handleReminderToggle}
          onReminderOpen={handleReminderOpen}
          pendingReminderIds={pendingReminderIds}
          onCreateEvent={handleCreateEvent}
          onUpdateEventDates={handleUpdateEventDates}
          onCreateReminder={handleCreateReminder}
          onUpdateEvent={handleUpdateEvent}
          onDeleteEvent={handleDeleteEvent}
          mutationResult={mutationResult}
          focusLogVersion={focusLogVersion}
          onCollapse={() => setPanelMode('compact')}
        />
      )}
    </div>
  );
}

function QuickCaptureInput({ capture, autoFocus = false }) {
  const isSending = capture.actionState?.status === 'pending';
  const statusText =
    capture.actionState?.status === 'success'
      ? '已发送，稍后出现在日历'
      : capture.actionState?.message || null;

  return (
    <div className="quick-capture">
      <form className="quick-capture__form" onSubmit={capture.onSubmit}>
        <span className="quick-capture__plus">＋</span>
        <input
          className="quick-capture__input"
          type="text"
          value={capture.value}
          onChange={capture.onChange}
          placeholder="快速记一条… (!高 设优先级)"
          disabled={isSending}
          autoFocus={autoFocus}
        />
        <span className="quick-capture__key">↵</span>
      </form>
      {statusText ? (
        <div className={`quick-capture__status is-${capture.actionState.status}`} aria-live="polite">
          {statusText}
        </div>
      ) : null}
    </div>
  );
}

function NextUpCard({ hero, compact = false, onFocusStart, onEventOpen }) {
  const event = hero.event;
  const eyebrow =
    hero.type === 'now' ? `当前进行中 · ${hero.eyebrow}` : `下一项 · ${hero.eyebrow}`;

  return (
    <section className={`next-up-card is-${hero.type}`} {...interactiveProps(() => onEventOpen(event))}>
      <div className="next-up-card__body">
        <div className="next-up-card__eyebrow">{eyebrow}</div>
        <div className="next-up-card__title">
          {formatEventChipTime(event)} {event.cleanTitle || event.title}
        </div>
      </div>
      <button
        className="next-up-card__focus"
        onClick={(nativeEvent) => {
          nativeEvent.stopPropagation();
          onFocusStart(event);
        }}
      >
        {compact ? '▶ 开始专注' : '▶ 专注 25 分'}
      </button>
    </section>
  );
}

function NowDivider({ now }) {
  return (
    <div className="now-divider" role="presentation">
      <span className="now-divider__dot" />
      <span className="now-divider__line" />
      <span className="now-divider__label">{formatClock(now)}</span>
    </div>
  );
}

function TodayRemainingList({ events, pending = [], now, progress, onEventOpen }) {
  const dividerIndex = nowDividerIndex(events, now);

  return (
    <section className="today-remaining">
      <div className="today-remaining__header">
        <span className="today-remaining__title">今日剩余</span>
        <span className="today-remaining__meta">已完成 {progress.done} / {progress.total}</span>
      </div>
      <div className="today-remaining__list">
        {events.length === 0 && pending.length === 0 ? (
          <EmptyInlineCard title="今天没有日程" subtitle="可以安排深度工作或休息。" />
        ) : (
          events.map((event, index) => {
            const end = toDate(event.endAt);
            const isPast = Boolean(end && end < now);

            return (
              <React.Fragment key={`${event.identifier}-${event.startAt}`}>
                {index === dividerIndex ? <NowDivider now={now} /> : null}
                <div
                  className={`today-remaining__row${isPast ? ' is-past' : ''}`}
                  {...interactiveProps(() => onEventOpen(event))}
                >
                  <span className="today-remaining__dot" data-priority={event.priority} />
                  <span className="today-remaining__time">{formatEventChipTime(event)}</span>
                  <span className="today-remaining__name">{event.cleanTitle}</span>
                  {event.hasConflict ? <span className="conflict-badge">冲突</span> : null}
                </div>
              </React.Fragment>
            );
          })
        )}
        {events.length > 0 && dividerIndex === -1 ? <NowDivider now={now} /> : null}
        {pending.map((c) => (
          <div key={c.id} className="today-remaining__row is-pending">
            <span className="today-remaining__dot" />
            <span className="today-remaining__time">{c.time || '待定'}</span>
            <span className="today-remaining__name">{c.title}</span>
            <span className="pending-badge">排入中</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DeadlineStrip({ deadlines, limit = 0 }) {
  const visible = limit > 0 ? deadlines.slice(0, limit) : deadlines;

  if (!visible.length) {
    return null;
  }

  return (
    <div className="deadline-strip">
      <span className="deadline-strip__label">DEADLINE</span>
      <div className="deadline-strip__items">
        {visible.map((item) => (
          <span key={item.id} className="deadline-capsule" data-urgency={item.urgency}>
            <i className="deadline-capsule__dot" />
            <span className="deadline-capsule__title">{item.title}</span>
            <span className="deadline-capsule__when">{item.countdownLabel}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function MiniWeekStrip({ now, events }) {
  const monday = addDays(startOfDay(now), -((now.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, index) => addDays(monday, index));

  return (
    <div className="mini-week-strip">
      {days.map((day, index) => {
        const hasEvents = events.some((event) => {
          const start = toDate(event.startAt);
          return start && isSameDay(start, day);
        });
        const isToday = isSameDay(day, now);

        return (
          <div key={dateKey(day)} className={`mini-week-strip__day${isToday ? ' is-today' : ''}`}>
            <span className="mini-week-strip__weekday">{WEEKDAY_LABELS[index]}</span>
            <span className="mini-week-strip__number">{day.getDate()}</span>
            <span className={`mini-week-strip__marker${hasEvents ? ' has-events' : ''}`} />
          </div>
        );
      })}
    </div>
  );
}

function CompactPanel({
  model,
  hero,
  now,
  calendarPermission,
  capture,
  pomodoro,
  pendingCaptures = [],
  onFocusStart,
  onEventOpen,
  onExpand
}) {
  const todayList = sortDayEvents(model.todayEvents);
  const todayPending = pendingCaptures.filter((c) => c.dateKey === dateKey(now));

  return (
    <div className="compact-panel">
      <QuickCaptureInput capture={capture} autoFocus />

      {!calendarPermission.granted ? (
        <PermissionCard title="无法读取日历" message={calendarPermission.message} />
      ) : (
        <>
          {pomodoro.status !== 'idle' ? (
            <PomodoroCard {...pomodoro} />
          ) : hero ? (
            <NextUpCard hero={hero} compact onFocusStart={onFocusStart} onEventOpen={onEventOpen} />
          ) : (
            <EmptyCard title="现在很空" subtitle="没有正在进行或即将开始的日程。" />
          )}

          <TodayRemainingList events={todayList} pending={todayPending} now={now} progress={model.progress} onEventOpen={onEventOpen} />
          <DeadlineStrip deadlines={model.deadlines} limit={3} />
          <MiniWeekStrip now={now} events={model.events} />
        </>
      )}

      <div className="compact-footer">
        <button className="compact-footer__expand" onClick={onExpand}>打开完整日历 ↗</button>
        <span className="compact-footer__hint">ESC 收起</span>
      </div>
    </div>
  );
}

function PomodoroCard({ status, remainingSeconds, notificationState, boundTitle = null, onStart, onPause, onResume, onStop }) {
  const progress = 1 - remainingSeconds / POMODORO_DURATION_SECONDS;
  const ringStyle = {
    '--pomodoro-progress': `${Math.max(0, Math.min(1, progress)) * 360}deg`
  };
  const title =
    status === 'completed'
      ? '本轮专注完成'
      : status === 'running'
        ? boundTitle ? `专注中 · ${boundTitle}` : '专注进行中'
        : status === 'paused'
          ? '专注暂停'
          : '25 分钟专注';
  const subtitle =
    status === 'completed'
      ? '通知已送达，可以收尾或重开一轮。'
      : status === 'running'
        ? boundTitle ? '专注绑定当前日程，结束后系统提醒。' : '只保留当前任务，倒计时结束后系统提醒。'
        : status === 'paused'
          ? '计时已暂停，系统通知也同步取消。'
          : '从行动中心直接启动，不切换上下文。';

  return (
    <section className={`pomodoro-card is-${status}`}>
      <div className="pomodoro-card__label">专注计时</div>
      <div className="pomodoro-ring" style={ringStyle}>
        <div className="pomodoro-ring__inner">
          {status === 'completed' ? (
            <svg
              className="pomodoro-check"
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="none"
              stroke="var(--live)"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-label="本轮专注完成"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          ) : (
            formatDuration(remainingSeconds)
          )}
        </div>
      </div>

      <div className="pomodoro-content">
        <div className="pomodoro-title">{title}</div>
        <div className="pomodoro-subtitle">{subtitle}</div>
        {notificationState?.status === 'error' ? (
          <div className="pomodoro-notice">{notificationState.message}</div>
        ) : null}
      </div>

      <div className="pomodoro-actions">
        {status === 'idle' || status === 'completed' ? (
          <button className="pomodoro-button is-primary" onClick={() => onStart()}>
            开始
          </button>
        ) : null}
        {status === 'running' ? (
          <button className="pomodoro-button" onClick={onPause}>
            暂停
          </button>
        ) : null}
        {status === 'paused' ? (
          <button className="pomodoro-button is-primary" onClick={onResume}>
            继续
          </button>
        ) : null}
        {status === 'running' || status === 'paused' || status === 'completed' ? (
          <button className="pomodoro-button" onClick={onStop}>
            停止
          </button>
        ) : null}
      </div>
    </section>
  );
}

function PermissionCard({ title, message }) {
  return (
    <div className="panel-section">
      <div className="empty-card">
        <div className="empty-card__title">{title}</div>
        <div className="empty-card__subtitle">{message}</div>
      </div>
    </div>
  );
}

function EmptyCard({ title, subtitle }) {
  return (
    <div className="empty-card">
      <div className="empty-card__title">{title}</div>
      <div className="empty-card__subtitle">{subtitle}</div>
    </div>
  );
}

function EmptyInlineCard({ title, subtitle }) {
  return (
    <div className="empty-inline">
      <div className="empty-inline__title">{title}</div>
      <div className="empty-inline__subtitle">{subtitle}</div>
    </div>
  );
}

export default App;
