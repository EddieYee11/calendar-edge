import React, { useEffect, useMemo, useRef, useState } from 'react';
import { parseQuickEntry } from './lib/parseQuickEntry';
import './workbench.css';

// Edgee · 完整版工作台。视觉与交互对齐 claude.ai/design「日历App · 优化版」，
// 数据源为原生 EventKit snapshot（events / reminders / calendars）。

const WD_FULL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WD_SHORT = ['日', '一', '二', '三', '四', '五', '六'];
const SETTINGS_KEY = 'xuri-settings';
const DONE_KEY = 'xuri-done-events';
const FOCUS_LOG_KEY = 'xuri-focus-log';
const HIDDEN_CALS_KEY = 'edgee-hidden-calendars';
const RED = '#c1492e';

const DEFAULT_SETTINGS = {
  weekStartMon: true,
  dimWeekend: false,
  sound: true,
  dense: false,
  density: 'standard',
  bufferMin: 0,
  systemAccent: false
};

function readJSON(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

const REDUCED_MOTION = typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const EXIT_MS = REDUCED_MOTION ? 0 : 160;

// 关闭时保留 DOM 一个退出动画的时长再卸载;返回 [渲染值, 是否退出中]
function useDelayedUnmount(value, ms = EXIT_MS) {
  const [rendered, setRendered] = useState(value);
  const timer = useRef(null);
  useEffect(() => {
    if (value != null) {
      window.clearTimeout(timer.current);
      setRendered(value);
      return undefined;
    }
    timer.current = window.setTimeout(() => setRendered(null), ms);
    return () => window.clearTimeout(timer.current);
  }, [value, ms]);
  return [value != null ? value : rendered, value == null && rendered != null];
}

function writeJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储失败不影响主流程
  }
}

const pad2 = (n) => String(n).padStart(2, '0');

function fmtKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDaysKey(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return fmtKey(d);
}

function toMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function fromMin(m) {
  const clamped = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
}

function hexToRgb(hex) {
  const value = (hex || '').replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) {
    return { r: 194, g: 137, b: 46 };
  }
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function tint(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// 事件块文字:事件色与基色混合;基色随外观切换(浅色加深、深色提亮)
function eventInk(hex) {
  return `color-mix(in srgb, ${hex} 52%, var(--xr-event-ink-mix))`;
}

function weekStartKeyOf(key, mondayFirst) {
  const d = parseKey(key);
  const dow = d.getDay();
  const offset = mondayFirst ? (dow === 0 ? -6 : 1 - dow) : -dow;
  return addDaysKey(key, offset);
}

function playDing() {
  if (window.webkit?.messageHandlers?.calendarEdge) {
    window.webkit.messageHandlers.calendarEdge.postMessage({ type: 'playSound', name: 'Tink' });
    return;
  }
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
    osc.onended = () => ctx.close();
  } catch {
    // 无音频环境时静默
  }
}

// 把跨天/全天事件铺开成「每天一条」的实例，便于按天渲染
function spreadInstances(events, doneMap) {
  const instances = [];

  events.forEach((event) => {
    const start = event.startAt ? new Date(event.startAt) : null;
    if (!start) {
      return;
    }
    const rawEnd = event.endAt ? new Date(event.endAt) : start;
    // 全天事件 endDate 常为排他的次日 00:00，回退 1 秒取整天
    const endForDays = event.isAllDay ? new Date(Math.max(rawEnd.getTime() - 1000, start.getTime())) : rawEnd;

    const startKey = fmtKey(start);
    const endKey = fmtKey(endForDays >= start ? endForDays : start);
    const startMin = start.getHours() * 60 + start.getMinutes();
    const durMin = Math.max(15, Math.round((rawEnd.getTime() - start.getTime()) / 60000));
    const pri = event.priority === 'high';
    const color = pri ? RED : (event.calendarColor || '#c2892e');

    let cursor = startKey;
    let guard = 0;
    while (cursor <= endKey && guard < 62) {
      instances.push({
        uid: `${event.identifier}|${event.startAt}|${cursor}`,
        identifier: event.identifier,
        event,
        dateKey: cursor,
        isAllDay: Boolean(event.isAllDay),
        timeLabel: event.isAllDay ? '全天' : fromMin(startMin),
        startMin: event.isAllDay ? -1 : startMin,
        durMin,
        title: event.cleanTitle || event.title,
        pri,
        color,
        joinURL: event.joinURL || null,
        // 非重复事件按 identifier 记完成(改期不丢);重复事件按 identifier|日期 逐次记
        done: Boolean(doneMap[event.identifier] || doneMap[`${event.identifier}|${cursor}`])
      });
      cursor = addDaysKey(cursor, 1);
      guard += 1;
    }
  });

  const byDay = {};
  instances.forEach((it) => {
    (byDay[it.dateKey] = byDay[it.dateKey] || []).push(it);
  });
  Object.values(byDay).forEach((list) => {
    list.sort((a, b) => (a.isAllDay !== b.isAllDay ? (a.isAllDay ? -1 : 1) : a.startMin - b.startMin));
  });
  return byDay;
}

// 周视图重叠布局:重叠簇 → 贪心分配列 → 每块得到 { col, cols }
function layoutDayColumns(timed) {
  const sorted = [...timed].sort((a, b) => a.startMin - b.startMin || b.durMin - a.durMin);
  const pos = {};
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    if (!cluster.length) {
      return;
    }
    const colEnds = [];
    const colOf = new Map();
    cluster.forEach((it) => {
      let c = colEnds.findIndex((end) => end <= it.startMin);
      if (c < 0) {
        c = colEnds.length;
        colEnds.push(0);
      }
      colEnds[c] = it.startMin + it.durMin;
      colOf.set(it.uid, c);
    });
    cluster.forEach((it) => {
      pos[it.uid] = { col: colOf.get(it.uid), cols: colEnds.length };
    });
    cluster = [];
  };
  sorted.forEach((it) => {
    if (it.startMin >= clusterEnd) {
      flush();
    }
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.startMin + it.durMin);
  });
  flush();
  return pos;
}

// 从 fromMin 起找第一个能放下 durMin 的空档;带地点的邻居按 bufferMin 外扩(通勤)
function nextFreeSlot(dayList, fromMin, durMin, bufferMin = 0, excludeUid = null) {
  const intervals = (dayList || [])
    .filter((it) => !it.isAllDay && it.uid !== excludeUid)
    .map((it) => {
      const gap = bufferMin && it.event.location ? bufferMin : 0;
      return [it.startMin - gap, it.startMin + it.durMin + gap];
    })
    .sort((a, b) => a[0] - b[0]);

  let cand = Math.ceil(fromMin / 15) * 15;
  for (const [s, e] of intervals) {
    if (cand + durMin <= s) {
      break;
    }
    cand = Math.max(cand, Math.ceil(e / 15) * 15);
  }
  return cand + durMin <= 24 * 60 ? cand : null;
}

// 无重叠但与带地点日程的间隔小于 bufferMin → 通勤提醒
function commuteConflict(dayList, fromMin, durMin, bufferMin, excludeUid = null) {
  if (!bufferMin) {
    return null;
  }
  for (const it of (dayList || [])) {
    if (it.isAllDay || it.uid === excludeUid || !it.event.location) {
      continue;
    }
    const gapBefore = fromMin - (it.startMin + it.durMin);
    const gapAfter = it.startMin - (fromMin + durMin);
    if (gapBefore >= 0 && gapBefore < bufferMin) {
      return { title: it.title, gap: gapBefore };
    }
    if (gapAfter >= 0 && gapAfter < bufferMin) {
      return { title: it.title, gap: gapAfter };
    }
  }
  return null;
}

function conflictPairsOn(dayList) {
  const timed = (dayList || []).filter((it) => !it.isAllDay);
  const pairs = [];
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const a = timed[i];
      const b = timed[j];
      if (a.startMin < b.startMin + b.durMin && b.startMin < a.startMin + a.durMin) {
        pairs.push([a, b]);
      }
    }
  }
  return pairs;
}

function reminderDueLabel(item, todayKey) {
  if (!item.dueAt) {
    return '无日期';
  }
  if (item.isOverdue) {
    return '已逾期';
  }
  const due = new Date(item.dueAt);
  const key = fmtKey(due);
  if (key === todayKey) {
    return '今天';
  }
  if (key === addDaysKey(todayKey, 1)) {
    return '明天';
  }
  return `${due.getMonth() + 1}/${due.getDate()}`;
}

// 创建浮层标题里的自然语言 → 覆写日期/时间/时长/优先级字段
function applyQuickParse(creating, todayKey) {
  const parsed = parseQuickEntry(creating.title, todayKey);
  if (!parsed.tokens.length || !parsed.title) {
    return creating;
  }
  return {
    ...creating,
    title: parsed.title,
    date: parsed.dateKey || creating.date,
    time: parsed.time || creating.time,
    dur: parsed.durMin || creating.dur,
    pri: parsed.pri === 'high' ? true : creating.pri
  };
}

// 「明天交周报 !高」→ 共享解析器,优先级 + 日期 + 时刻
function parseTodoInput(raw, todayKey) {
  const parsed = parseQuickEntry(raw, todayKey);
  const dueKey = parsed.dateKey || (parsed.time ? todayKey : null);
  return {
    title: parsed.title,
    pri: parsed.pri === 'high',
    dueAt: dueKey ? new Date(`${dueKey}T${parsed.time || '09:00'}:00`).toISOString() : null
  };
}

// 数值变化时 240ms ease-out 计数过渡(尊重「减弱动态效果」)
function AnimatedNumber({ value, decimals = 0 }) {
  const [shown, setShown] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = value;
    if (from === value || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      return undefined;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / 240);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(from + (value - from) * eased);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return shown.toFixed(decimals);
}

// SF Symbols 风格的行内小图标(替代 emoji,与侧栏描边图标同语言)
const MI = (paths, { fill = false, size = 12 } = {}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill ? 'currentColor' : 'none'}
    stroke={fill ? 'none' : 'currentColor'}
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flex: 'none', verticalAlign: '-1px' }}
  >
    {paths}
  </svg>
);

const MINI_ICONS = {
  warn: MI(<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>),
  check: MI(<polyline points="20 6 9 17 4 12" />),
  lock: MI(<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>, { size: 9 }),
  spark: MI(<path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" />, { fill: true, size: 11 }),
  arrowOut: MI(<><line x1="7" y1="17" x2="17" y2="7" /><polyline points="8 7 17 7 17 16" /></>, { size: 11 })
};

const NAV_ICONS = {
  cal: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="17" rx="3" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  week: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="3" /><line x1="9" y1="4" x2="9" y2="20" /><line x1="15" y1="4" x2="15" y2="20" />
    </svg>
  ),
  todo: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11.5 12 14.5 22 4.5" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  stats: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  set: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  )
};

function Workbench({
  model,
  snapshot,
  now,
  calendarMonth,
  onMonthChange,
  pomodoro,
  onFocusStart,
  onEventOpen,
  onJoin,
  onReminderToggle,
  onReminderOpen,
  pendingReminderIds,
  onCreateEvent,
  onUpdateEventDates,
  onCreateReminder,
  onUpdateEvent,
  onDeleteEvent,
  mutationResult,
  focusLogVersion,
  onCollapse
}) {
  const todayKey = fmtKey(now);
  const [view, setView] = useState('cal');
  const [sbOpen, setSbOpen] = useState(true);
  const [selected, setSelected] = useState(todayKey);
  const [weekAnchor, setWeekAnchor] = useState(todayKey);
  const [dragUid, setDragUid] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [creating, setCreating] = useState(null);
  const [editing, setEditing] = useState(null);
  const [spanAsk, setSpanAsk] = useState(null);
  const [activeEventUid, setActiveEventUid] = useState(null);
  const [conflictPreview, setConflictPreview] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [todoInput, setTodoInput] = useState('');
  const [settings, setSettings] = useState(() => {
    const saved = readJSON(SETTINGS_KEY, {});
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      density: saved.density || (saved.dense ? 'compact' : 'standard')
    };
  });
  const [doneMap, setDoneMap] = useState(() => readJSON(DONE_KEY, {}));
  const [hiddenCals, setHiddenCals] = useState(() => readJSON(HIDDEN_CALS_KEY, []));
  const [localDoneReminders, setLocalDoneReminders] = useState({});
  // 拖拽/移动后的乐观位置覆盖:uid → 新位置,等 snapshot 回传确认后清除
  const [pendingMoves, setPendingMoves] = useState({});

  const [creatingR, creatingLeaving] = useDelayedUnmount(creating);
  const [editingR, editingLeaving] = useDelayedUnmount(editing);
  const [spanAskR, spanAskLeaving] = useDelayedUnmount(spanAsk);
  const [conflictR, conflictLeaving] = useDelayedUnmount(conflictPreview);

  const mainRef = useRef(null);
  const toastSeq = useRef(0);

  const calendarGranted = Boolean(snapshot?.permissions?.calendar?.granted);
  const remindersGranted = Boolean(snapshot?.permissions?.reminders?.granted);
  const allCalendars = snapshot?.calendars || [];
  const writableCalendars = allCalendars.filter((c) => c.allowsModifications !== false);

  const ymY = calendarMonth.getFullYear();
  const ymM = calendarMonth.getMonth();

  // 日历图层:隐藏的日历在所有视图中过滤掉
  const visibleEvents = useMemo(() => {
    if (!hiddenCals.length) {
      return model.events;
    }
    const hidden = new Set(hiddenCals);
    return model.events.filter((e) => !e.calendarIdentifier || !hidden.has(e.calendarIdentifier));
  }, [model.events, hiddenCals]);

  const byDay = useMemo(() => {
    const base = spreadInstances(visibleEvents, doneMap);
    Object.entries(pendingMoves).forEach(([uid, m]) => {
      const list = base[m.fromKey];
      if (!list) {
        return;
      }
      const idx = list.findIndex((it) => it.uid === uid);
      if (idx < 0) {
        return;
      }
      const [it] = list.splice(idx, 1);
      const moved = {
        ...it,
        dateKey: m.dateKey,
        startMin: m.startMin ?? it.startMin,
        durMin: m.durMin ?? it.durMin,
        timeLabel: it.isAllDay ? it.timeLabel : fromMin(m.startMin ?? it.startMin)
      };
      (base[m.dateKey] = base[m.dateKey] || []).push(moved);
      base[m.dateKey].sort((a, b) => (a.isAllDay !== b.isAllDay ? (a.isAllDay ? -1 : 1) : a.startMin - b.startMin));
    });
    return base;
  }, [visibleEvents, doneMap, pendingMoves]);

  // 乐观移动与 snapshot 对账:事件已到达期望时间即确认;10s 未确认放弃(诚实回弹)
  useEffect(() => {
    setPendingMoves((prev) => {
      const keys = Object.keys(prev);
      if (!keys.length) {
        return prev;
      }
      const entries = Object.entries(prev).filter(([, m]) =>
        Date.now() - m.at < 10000 &&
        !model.events.some((e) => e.identifier === m.identifier && e.startAt
          && Math.abs(new Date(e.startAt).getTime() - m.expectStartMs) < 60000));
      return entries.length === keys.length ? prev : Object.fromEntries(entries);
    });
  }, [model.events]);

  // 一次性迁移:非重复事件的完成键从 identifier|日期 收敛为 identifier(改期不再丢勾)
  useEffect(() => {
    if (readJSON(`${DONE_KEY}-v`, 1) >= 2 || !model.events.length) {
      return;
    }
    const recurring = new Set(model.events.filter((e) => e.hasRecurrence).map((e) => e.identifier));
    const known = new Set(model.events.map((e) => e.identifier));
    setDoneMap((prev) => {
      const next = {};
      Object.keys(prev).forEach((key) => {
        const id = key.split('|')[0];
        // 快照窗口外的事件无法判断是否重复,保留旧键(读取端兼容两种键)
        next[recurring.has(id) || !known.has(id) ? key : id] = true;
      });
      writeJSON(DONE_KEY, next);
      return next;
    });
    writeJSON(`${DONE_KEY}-v`, 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.events]);

  const remindersByDay = useMemo(() => {
    const grouped = {};
    model.reminders.forEach((item) => {
      if (!item.dueAt || localDoneReminders[item.identifier]?.done) {
        return;
      }
      const key = fmtKey(new Date(item.dueAt));
      (grouped[key] = grouped[key] || []).push(item);
    });
    Object.values(grouped).forEach((items) => {
      items.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
    });
    return grouped;
  }, [model.reminders, localDoneReminders]);

  const remindersForSelectedDay = useMemo(() => {
    const exact = remindersByDay[selected] || [];
    if (selected !== todayKey) {
      return exact;
    }
    const overdue = model.reminders.filter((item) => {
      if (!item.dueAt || !item.isOverdue || localDoneReminders[item.identifier]?.done) {
        return false;
      }
      return fmtKey(new Date(item.dueAt)) !== selected;
    });
    return [...overdue, ...exact];
  }, [remindersByDay, selected, todayKey, model.reminders, localDoneReminders]);

  function selectDate(key) {
    setSelected(key);
    setActiveEventUid(null);
  }

  function selectEvent(key, uid) {
    setSelected(key);
    setActiveEventUid(uid);
  }

  useEffect(() => {
    const selectedDate = parseKey(selected);
    if (selectedDate.getFullYear() === ymY && selectedDate.getMonth() === ymM) {
      return;
    }
    setSelected(fmtKey(new Date(ymY, ymM, 1)));
    setActiveEventUid(null);
  }, [selected, ymY, ymM]);

  useEffect(() => {
    if (activeEventUid && !(byDay[selected] || []).some((item) => item.uid === activeEventUid)) {
      setActiveEventUid(null);
    }
  }, [activeEventUid, byDay, selected]);

  function toggleCalendarVisible(identifier) {
    setHiddenCals((prev) => {
      const next = prev.includes(identifier) ? prev.filter((id) => id !== identifier) : [...prev, identifier];
      writeJSON(HIDDEN_CALS_KEY, next);
      return next;
    });
  }

  // ---------- 通用行为 ----------

  function dismissToast(id) {
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 200);
  }

  function toast(icon, iconBg, text) {
    toastSeq.current += 1;
    const item = { id: toastSeq.current, icon, iconBg, text, leaving: false };
    setToasts((list) => {
      const next = [...list, item];
      const alive = next.filter((t) => !t.leaving);
      // 超过 3 条时把最旧一条标记退出(纯映射,StrictMode 双调用安全)
      return alive.length > 3 ? next.map((t) => (t.id === alive[0].id ? { ...t, leaving: true } : t)) : next;
    });
    window.setTimeout(() => dismissToast(item.id), 2600);
  }

  useEffect(() => {
    if (!mutationResult || mutationResult.status === 'success') {
      return;
    }
    toast('⚠', '#f0a08a', mutationResult.message || '操作失败');
    // 变更失败时撤销乐观位置,块回弹到真实位置
    setPendingMoves({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutationResult]);

  function switchView(next) {
    if (next === view) {
      return;
    }
    setView(next);
    setCreating(null);
  }

  function updateSetting(id, value) {
    setSettings((prev) => {
      const next = { ...prev, [id]: value };
      writeJSON(SETTINGS_KEY, next);
      return next;
    });
  }

  function markEventDone(instance, nextDone) {
    setDoneMap((prev) => {
      const key = instance.event.hasRecurrence
        ? `${instance.identifier}|${instance.dateKey}`
        : instance.identifier;
      const next = { ...prev };
      if (nextDone) {
        next[key] = true;
      } else {
        delete next[key];
        delete next[`${instance.identifier}|${instance.dateKey}`];
        delete next[instance.identifier];
      }
      writeJSON(DONE_KEY, next);
      return next;
    });
    if (nextDone && settings.sound) {
      playDing();
    }
  }

  // ---------- 月份 / 周导航 ----------

  function shiftMonth(n) {
    const nextMonth = new Date(ymY, ymM + n, 1);
    const nextKey = fmtKey(nextMonth);
    onMonthChange(nextMonth);
    setSelected(nextKey);
    setWeekAnchor(nextKey);
    setActiveEventUid(null);
    setCreating(null);
  }

  function shiftWeek(n) {
    const nextAnchor = addDaysKey(weekAnchor, n * 7);
    setWeekAnchor(nextAnchor);
    const d = parseKey(nextAnchor);
    if (d.getFullYear() !== ymY || d.getMonth() !== ymM) {
      onMonthChange(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }

  function goToday() {
    onMonthChange(new Date(now.getFullYear(), now.getMonth(), 1));
    setWeekAnchor(todayKey);
    setSelected(todayKey);
    setActiveEventUid(null);
  }

  // ---------- 浮层定位 ----------

  function popoverPos(rect, estW = 282, estH = 340) {
    const main = mainRef.current;
    const W = main ? main.clientWidth : 900;
    const H = main ? main.clientHeight : 700;
    let x = Math.max(8, W / 2 - estW / 2);
    let y = Math.max(8, H / 2 - estH / 2);
    let side = null;
    if (rect && main) {
      const mr = main.getBoundingClientRect();
      x = rect.right - mr.left + 10;
      side = 'right';
      if (x + estW > W) {
        x = rect.left - mr.left - estW - 10;
        side = 'left';
      }
      if (x < 8) {
        x = 8;
        side = null;
      }
      y = Math.max(8, Math.min(rect.top - mr.top, H - estH));
    }
    return { x, y, side };
  }

  // ---------- 新建日程 ----------

  function openCreate(dateKey, opts = {}) {
    const { x, y, side } = popoverPos(opts.rect || null);
    const defaultCal = writableCalendars.find((c) => c.isDefault) || writableCalendars[0] || null;
    setCreating({
      date: dateKey,
      time: opts.time || '09:00',
      dur: 60,
      calendarIdentifier: defaultCal ? defaultCal.identifier : null,
      pri: Boolean(opts.pri),
      recur: 'none',
      title: opts.title || '',
      fromReminder: opts.fromReminder || null,
      completeReminder: Boolean(opts.fromReminder),
      x,
      y,
      side,
      err: false
    });
  }

  function saveCreate() {
    if (!creating) {
      return;
    }
    // 保存前自动应用标题里未应用的自然语言解析
    const draft = applyQuickParse(creating, todayKey);
    const title = draft.title.trim();
    if (!title) {
      setCreating((c) => ({ ...c, err: true }));
      return;
    }

    const start = new Date(`${draft.date}T${draft.time}:00`);
    const end = new Date(start.getTime() + draft.dur * 60000);
    const probe = { startMin: toMin(draft.time), durMin: draft.dur, isAllDay: false };
    const conflictWith = (byDay[draft.date] || []).find(
      (it) => !it.isAllDay && it.startMin < probe.startMin + probe.durMin && probe.startMin < it.startMin + it.durMin
    );

    const payload = {
      title: draft.pri ? `${title} !高` : title,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      calendarIdentifier: draft.calendarIdentifier || ''
    };
    if (draft.recur && draft.recur !== 'none') {
      payload.recurrence = { frequency: draft.recur, interval: 1 };
    }
    const bridged = onCreateEvent(payload);

    if (!bridged) {
      toast('⚠', '#f0a08a', '创建日程仅在原生应用中可用');
      return;
    }

    // 待办排期:保存成功后顺手完成源待办
    if (draft.fromReminder && draft.completeReminder) {
      const sourceReminder = model.reminders.find((r) => r.identifier === draft.fromReminder);
      if (sourceReminder && !localDoneReminders[sourceReminder.identifier]?.done) {
        toggleReminder(sourceReminder);
      }
    }

    setCreating(null);
    setSelected(draft.date);
    setActiveEventUid(null);
    const d = parseKey(draft.date);
    if (conflictWith) {
      toast('⚠', '#f0a08a', `已保存，但与「${conflictWith.title}」时间重叠`);
    } else if (draft.fromReminder && draft.completeReminder) {
      toast('✓', '#8fa383', `已排期并完成待办「${title}」`);
    } else {
      toast('✓', '#8fa383', `已保存 · ${d.getMonth() + 1}月${d.getDate()}日 ${draft.time}「${title}」`);
    }
  }

  // 待办 → 日程:预填创建浮层
  function scheduleTodo(row) {
    let dateKey = todayKey;
    if (row.item.dueAt) {
      const dueKey = fmtKey(new Date(row.item.dueAt));
      if (dueKey > todayKey) {
        dateKey = dueKey;
      }
    }
    openCreate(dateKey, { title: row.title, pri: row.pri, fromReminder: row.item.identifier });
  }

  // ---------- 拖拽改期 / 冲突顺延 ----------

  function moveInstance(uid, targetKey) {
    const source = Object.values(byDay).flat().find((it) => it.uid === uid);
    setDragUid(null);
    setDropTarget(null);
    if (!source || source.dateKey === targetKey) {
      return;
    }

    const deltaMs = parseKey(targetKey).getTime() - parseKey(source.dateKey).getTime();
    const newStart = new Date(new Date(source.event.startAt).getTime() + deltaMs);
    const newEnd = new Date(new Date(source.event.endAt || source.event.startAt).getTime() + deltaMs);

    const bridged = onUpdateEventDates({
      identifier: source.identifier,
      occurrenceStartAt: source.event.startAt,
      startAt: newStart.toISOString(),
      endAt: newEnd.toISOString()
    });

    if (!bridged) {
      toast('⚠', '#f0a08a', '移动日程仅在原生应用中可用');
      return;
    }

    setPendingMoves((prev) => ({
      ...prev,
      [uid]: {
        fromKey: source.dateKey,
        dateKey: targetKey,
        startMin: null,
        durMin: null,
        identifier: source.identifier,
        expectStartMs: newStart.getTime(),
        at: Date.now()
      }
    }));
    setSelected(targetKey);
    setActiveEventUid(null);
    const d = parseKey(targetKey);
    toast('✓', '#8fa383', `「${source.title}」已移动到 ${d.getMonth() + 1}月${d.getDate()}日`);
  }

  function proposeConflictResolution(dateKey) {
    const pairs = conflictPairsOn(byDay[dateKey]);
    if (!pairs.length) {
      return;
    }
    const [a, b] = pairs[0];
    const later = a.startMin >= b.startMin ? a : b;
    const earlier = later === a ? b : a;
    const earliestStart = earlier.startMin + earlier.durMin;
    const newStartMin = nextFreeSlot(byDay[dateKey], earliestStart, later.durMin, settings.bufferMin || 0, later.uid);
    if (newStartMin == null) {
      toast('⚠', '#f0a08a', '当天没有足够的连续空档，请在周视图中手动调整');
      return;
    }
    setConflictPreview({
      dateKey,
      earlier,
      later,
      oldStartMin: later.startMin,
      newStartMin,
      shiftMin: newStartMin - later.startMin
    });
  }

  function applyConflictResolution() {
    if (!conflictPreview) {
      return;
    }
    const plan = conflictPreview;
    setConflictPreview(null);
    const newStart = new Date(`${plan.dateKey}T${fromMin(plan.newStartMin)}:00`);
    const newEnd = new Date(newStart.getTime() + plan.later.durMin * 60000);

    askSpanIfRecurring(plan.later, '调整', (span) => {
      const bridged = onUpdateEventDates({
        identifier: plan.later.identifier,
        occurrenceStartAt: plan.later.event.startAt,
        startAt: newStart.toISOString(),
        endAt: newEnd.toISOString(),
        span
      });

      if (!bridged) {
        toast('⚠', '#f0a08a', '调整日程仅在原生应用中可用');
        return;
      }
      toast('✓', '#8fa383', `「${plan.later.title}」已顺延 ${plan.shiftMin} 分钟至 ${fromMin(plan.newStartMin)}`);
    });
  }

  // 周视图拖拽落点:移动(可跨天)或改时长
  function moveResizeWeek(instance, { dateKey, startMin, durMin }) {
    const ev = instance.event;
    askSpanIfRecurring(instance, '调整', (span) => {
      let startAt;
      let endAt;
      if (startMin == null) {
        // 全天事件仅换日
        const deltaMs = parseKey(dateKey).getTime() - parseKey(instance.dateKey).getTime();
        if (!deltaMs) {
          return;
        }
        startAt = new Date(new Date(ev.startAt).getTime() + deltaMs).toISOString();
        endAt = new Date(new Date(ev.endAt || ev.startAt).getTime() + deltaMs).toISOString();
      } else {
        const start = new Date(`${dateKey}T${fromMin(startMin)}:00`);
        startAt = start.toISOString();
        endAt = new Date(start.getTime() + durMin * 60000).toISOString();
      }

      const bridged = onUpdateEventDates({
        identifier: instance.identifier,
        occurrenceStartAt: ev.startAt,
        startAt,
        endAt,
        span
      });
      if (!bridged) {
        toast('⚠', '#f0a08a', '调整日程仅在原生应用中可用');
        return;
      }
      setPendingMoves((prev) => ({
        ...prev,
        [instance.uid]: {
          fromKey: instance.dateKey,
          dateKey,
          startMin: startMin == null ? null : startMin,
          durMin: durMin == null ? null : durMin,
          identifier: instance.identifier,
          expectStartMs: new Date(startAt).getTime(),
          at: Date.now()
        }
      }));
      const d = parseKey(dateKey);
      toast('✓', '#8fa383', `「${instance.title}」→ ${d.getMonth() + 1}/${d.getDate()} ${startMin == null ? '全天' : `${fromMin(startMin)} – ${fromMin(startMin + durMin)}`}`);
    });
  }

  // ---------- 编辑 / 删除 / 转待办 ----------

  function openEdit(instance, rect) {
    setCreating(null);
    const ev = instance.event;
    const start = new Date(ev.startAt);
    const cal = allCalendars.find((c) => c.identifier === ev.calendarIdentifier) || null;
    const { x, y, side } = popoverPos(rect || null, 300, 430);
    setEditing({
      instance,
      readOnly: cal ? cal.allowsModifications === false : false,
      x,
      y,
      side,
      draft: {
        title: instance.title,
        date: fmtKey(start),
        time: `${pad2(start.getHours())}:${pad2(start.getMinutes())}`,
        dur: instance.isAllDay ? instance.durMin : Math.max(15, Math.round((new Date(ev.endAt || ev.startAt).getTime() - start.getTime()) / 60000)),
        notes: ev.notes || '',
        calendarIdentifier: ev.calendarIdentifier || '',
        pri: instance.pri,
        recurrence: 'keep'
      }
    });
  }

  // 重复日程的变更先询问作用范围;onDone(span|null)
  function askSpanIfRecurring(instance, actionLabel, onPick) {
    if (!instance.event.hasRecurrence) {
      onPick('this');
      return;
    }
    setSpanAsk({
      message: `「${instance.title}」是重复日程,${actionLabel}应用于:`,
      onPick: (span) => {
        setSpanAsk(null);
        if (span) {
          onPick(span);
        }
      }
    });
  }

  function saveEdit() {
    if (!editing) {
      return;
    }
    const { instance, draft } = editing;
    const ev = instance.event;
    const payload = { identifier: instance.identifier, occurrenceStartAt: ev.startAt };

    const nextTitle = draft.title.trim();
    if (nextTitle && (nextTitle !== instance.title || draft.pri !== instance.pri)) {
      payload.title = draft.pri ? `${nextTitle} !高` : nextTitle;
    }

    if (instance.isAllDay) {
      const origKey = fmtKey(new Date(ev.startAt));
      if (draft.date !== origKey) {
        const deltaMs = parseKey(draft.date).getTime() - parseKey(origKey).getTime();
        payload.startAt = new Date(new Date(ev.startAt).getTime() + deltaMs).toISOString();
        payload.endAt = new Date(new Date(ev.endAt || ev.startAt).getTime() + deltaMs).toISOString();
      }
    } else {
      const start = new Date(`${draft.date}T${draft.time}:00`);
      const origStart = new Date(ev.startAt);
      const origDur = Math.max(15, Math.round((new Date(ev.endAt || ev.startAt).getTime() - origStart.getTime()) / 60000));
      if (start.getTime() !== origStart.getTime() || draft.dur !== origDur) {
        payload.startAt = start.toISOString();
        payload.endAt = new Date(start.getTime() + draft.dur * 60000).toISOString();
      }
    }

    if ((draft.notes || '') !== (ev.notes || '')) {
      payload.notes = draft.notes || '';
    }
    if (draft.calendarIdentifier && draft.calendarIdentifier !== ev.calendarIdentifier) {
      payload.calendarIdentifier = draft.calendarIdentifier;
    }
    if (draft.recurrence !== 'keep') {
      payload.recurrence = draft.recurrence === 'none' ? { frequency: 'none' } : draft.recurrence;
    }

    if (Object.keys(payload).length <= 2) {
      setEditing(null);
      return;
    }

    const commit = (span) => {
      const bridged = onUpdateEvent({ ...payload, span });
      if (!bridged) {
        toast('⚠', '#f0a08a', '编辑日程仅在原生应用中可用');
        return;
      }
      setEditing(null);
      toast('✓', '#8fa383', `已保存「${nextTitle || instance.title}」`);
    };

    if (payload.recurrence !== undefined) {
      // 改重复规则只能作用于此日程及以后
      commit('future');
    } else {
      askSpanIfRecurring(instance, '修改', commit);
    }
  }

  function deleteEditingEvent() {
    if (!editing) {
      return;
    }
    const { instance } = editing;
    askSpanIfRecurring(instance, '删除', (span) => {
      const bridged = onDeleteEvent({
        identifier: instance.identifier,
        occurrenceStartAt: instance.event.startAt,
        span
      });
      if (!bridged) {
        toast('⚠', '#f0a08a', '删除日程仅在原生应用中可用');
        return;
      }
      setEditing(null);
      toast('✓', '#8fa383', `已删除「${instance.title}」`);
    });
  }

  function convertEditingToTodo() {
    if (!editing) {
      return;
    }
    const { instance } = editing;
    const bridged = onCreateReminder({
      title: instance.pri ? `${instance.title} !高` : instance.title,
      dueAt: instance.event.startAt,
      priority: instance.pri ? 'high' : ''
    });
    if (!bridged) {
      toast('⚠', '#f0a08a', '转待办仅在原生应用中可用');
      return;
    }
    setEditing(null);
    toast('✓', '#8fa383', `已转为待办「${instance.title}」`);
  }

  // ---------- 待办 ----------

  function submitTodo() {
    const raw = todoInput.trim();
    if (!raw) {
      return;
    }
    const parsed = parseTodoInput(raw, todayKey);
    if (!parsed.title) {
      return;
    }
    const bridged = onCreateReminder({
      title: parsed.pri ? `${parsed.title} !高` : parsed.title,
      dueAt: parsed.dueAt || '',
      priority: parsed.pri ? 'high' : ''
    });
    if (!bridged) {
      toast('⚠', '#f0a08a', '添加待办仅在原生应用中可用');
      return;
    }
    setTodoInput('');
    toast('✓', '#8fa383', `已加入待办「${parsed.title}」`);
  }

  function toggleReminder(item) {
    const nextDone = !localDoneReminders[item.identifier]?.done;
    setLocalDoneReminders((prev) => ({ ...prev, [item.identifier]: { done: nextDone, at: Date.now() } }));
    // App 侧发送 completed: !item.completed，这里传入取反前的状态即可
    onReminderToggle({ ...item, completed: !nextDone });
    if (nextDone && settings.sound) {
      playDing();
    }
  }

  // 与 snapshot 对账:完成→从列表消失即确认;取消→重新出现即确认;15s 未确认则回滚(如实反映失败)
  useEffect(() => {
    setLocalDoneReminders((prev) => {
      const listed = new Set(model.reminders.map((r) => r.identifier));
      const next = {};
      let changed = false;
      Object.entries(prev).forEach(([id, s]) => {
        const confirmed = s.done ? !listed.has(id) : listed.has(id);
        if (!confirmed && Date.now() - s.at < 15000) {
          next[id] = s;
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [model.reminders]);

  // ---------- 派生数据 ----------

  const weekStartMon = settings.weekStartMon;

  const monthGridStart = weekStartKeyOf(fmtKey(new Date(ymY, ymM, 1)), weekStartMon);
  const monthGridLastWeek = weekStartKeyOf(fmtKey(new Date(ymY, ymM + 1, 0)), weekStartMon);
  const weekRowCount = Math.max(4, Math.min(6, Math.round((parseKey(monthGridLastWeek) - parseKey(monthGridStart)) / (7 * 24 * 60 * 60 * 1000)) + 1));
  const weeks = useMemo(() => {
    const rows = [];
    let cursor = monthGridStart;
    for (let w = 0; w < weekRowCount; w += 1) {
      const row = [];
      for (let i = 0; i < 7; i += 1) {
        row.push(cursor);
        cursor = addDaysKey(cursor, 1);
      }
      rows.push(row);
    }
    return rows;
  }, [monthGridStart, weekRowCount]);

  const baseVisibleCount = weeks.length <= 4 ? 5 : weeks.length === 5 ? 4 : 3;
  const densityOffset = settings.density === 'compact' ? 1 : settings.density === 'simple' ? -1 : 0;
  const visCount = Math.max(2, baseVisibleCount + densityOffset);

  const monthInstances = useMemo(() => {
    return Object.entries(byDay)
      .filter(([key]) => {
        const d = parseKey(key);
        return d.getFullYear() === ymY && d.getMonth() === ymM;
      })
      .flatMap(([, list]) => list);
  }, [byDay, ymY, ymM]);

  const wkStart = weekStartKeyOf(weekAnchor, weekStartMon);
  const wkEnd = addDaysKey(wkStart, 6);
  const weekInstanceCount = useMemo(() => {
    let count = 0;
    for (let i = 0; i < 7; i += 1) {
      count += (byDay[addDaysKey(wkStart, i)] || []).length;
    }
    return count;
  }, [byDay, wkStart]);

  const undoneReminders = model.reminders.filter((r) => !localDoneReminders[r.identifier]?.done);

  const focusLog = useMemo(() => readJSON(FOCUS_LOG_KEY, []), [focusLogVersion]);

  const fmtMD = (key) => {
    const d = parseKey(key);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const headers = {
    cal: {
      title: `${ymY}年${ymM + 1}月`,
      sub: `${monthInstances.length} 条日程 · ${monthInstances.filter((it) => it.pri).length} 项高优先级`,
      arrows: true
    },
    week: { title: `本周 · ${fmtMD(wkStart)} – ${fmtMD(wkEnd)}`, sub: `${weekInstanceCount} 条日程`, arrows: true },
    todo: { title: '待办清单', sub: `${undoneReminders.length} 项进行中`, arrows: false },
    stats: { title: '专注统计', sub: '保持专注，聚沙成塔', arrows: false },
    set: { title: '设置', sub: '偏好即刻生效', arrows: false }
  };
  const header = headers[view];

  const nowMin = now.getHours() * 60 + now.getMinutes();

  // ---------- 渲染 ----------

  // 可选:主题色跟随 macOS 系统强调色(snapshot 注入)
  const accentOverride = settings.systemAccent && snapshot?.systemAccentColor ? snapshot.systemAccentColor : null;

  return (
    <div className="xr-root" style={accentOverride ? { '--xr-accent': accentOverride } : undefined}>
      <nav className="xr-sidebar" data-open={sbOpen} style={{ width: sbOpen ? 184 : 66 }}>
        <button className="xr-logo-row" onClick={onCollapse} title="收起为快捷面板">
          <span className="xr-logo-badge">E</span>
          <span className="xr-label xr-logo-label">Edgee</span>
        </button>

        <button className="xr-newbtn" title="新建日程" onClick={() => openCreate(selected || todayKey)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" style={{ flex: 'none' }}>
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="xr-label">新建日程</span>
        </button>

        {[
          { id: 'cal', label: '月历' },
          { id: 'week', label: '周视图' },
          { id: 'todo', label: '待办清单', count: undoneReminders.length },
          { id: 'stats', label: '专注统计' }
        ].map((nav) => (
          <button
            key={nav.id}
            className={`xr-navbtn${view === nav.id ? ' is-active' : ''}`}
            title={nav.label}
            onClick={() => switchView(nav.id)}
          >
            {NAV_ICONS[nav.id]}
            <span className="xr-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {nav.label}
              {nav.count !== undefined ? <i className="xr-navcount">{nav.count}</i> : null}
            </span>
          </button>
        ))}

        {allCalendars.length ? (
          <div className="xr-cal-layers">
            <div className="xr-cal-layers-head xr-label">日历图层</div>
            {allCalendars.map((cal) => {
              const hidden = hiddenCals.includes(cal.identifier);
              return (
                <button
                  key={cal.identifier}
                  className="xr-cal-layer"
                  data-hidden={hidden}
                  title={`${cal.title}${cal.allowsModifications === false ? '(只读)' : ''} · 点击${hidden ? '显示' : '隐藏'}`}
                  onClick={() => toggleCalendarVisible(cal.identifier)}
                >
                  <i className="xr-cal-dot" style={{ background: hidden ? 'transparent' : cal.color, borderColor: cal.color }} />
                  <span className="xr-label xr-cal-name">{cal.title}</span>
                  {cal.allowsModifications === false ? <span className="xr-label xr-cal-lock">{MINI_ICONS.lock}</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button className={`xr-navbtn${view === 'set' ? ' is-active' : ''}`} title="设置" onClick={() => switchView('set')}>
            {NAV_ICONS.set}
            <span className="xr-label">设置</span>
          </button>
          <button className="xr-collapsebtn" title={sbOpen ? '收起侧栏' : '展开侧栏'} onClick={() => setSbOpen((v) => !v)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: sbOpen ? 'none' : 'scaleX(-1)' }}>
              <polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" />
            </svg>
            <span className="xr-label">收起侧栏</span>
          </button>
        </div>
      </nav>

      <div className="xr-main" ref={mainRef}>
        <header className="xr-header">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
            <div className="xr-title">{header.title}</div>
            <div className="xr-sub">{header.sub}</div>
          </div>
          {header.arrows ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className="xr-pagebtn" title="上一页" onClick={() => (view === 'week' ? shiftWeek(-1) : shiftMonth(-1))}>‹</button>
              <button className="xr-todaybtn" onClick={goToday}>今天</button>
              <button className="xr-pagebtn" title="下一页" onClick={() => (view === 'week' ? shiftWeek(1) : shiftMonth(1))}>›</button>
            </div>
          ) : null}
        </header>

        {view === 'cal' ? (
          <MonthView
            key={`${ymY}-${ymM}`}
            weeks={weeks}
            byDay={byDay}
            remindersByDay={remindersByDay}
            reminders={remindersForSelectedDay}
            ymM={ymM}
            todayKey={todayKey}
            selected={selected}
            activeEventUid={activeEventUid}
            dropTarget={dropTarget}
            dragUid={dragUid}
            visCount={visCount}
            dimWeekend={settings.dimWeekend}
            calendarGranted={calendarGranted}
            remindersGranted={remindersGranted}
            permissionMessage={snapshot?.permissions?.calendar?.message}
            calendars={writableCalendars}
            nowMin={nowMin}
            todayIsSelected={selected === todayKey}
            onSelect={selectDate}
            onSelectEvent={selectEvent}
            onOpenCreate={openCreate}
            onDragStart={setDragUid}
            onDragEndReset={() => { setDragUid(null); setDropTarget(null); }}
            onDropTarget={setDropTarget}
            onDrop={moveInstance}
            onResolve={proposeConflictResolution}
            onToggleDone={markEventDone}
            onEventOpen={onEventOpen}
            onEditOpen={openEdit}
            onJoin={onJoin}
            onFocusStart={onFocusStart}
            onReminderToggle={toggleReminder}
            onReminderOpen={onReminderOpen}
            pendingReminderIds={pendingReminderIds}
            pomodoro={pomodoro}
          />
        ) : null}

        {view === 'week' ? (
          <WeekView
            wkStart={wkStart}
            byDay={byDay}
            todayKey={todayKey}
            nowMin={nowMin}
            onCreateAt={(key, time) => openCreate(key, { time })}
            onEditOpen={openEdit}
            onMoveResize={moveResizeWeek}
          />
        ) : null}

        {view === 'todo' ? (
          <TodoView
            reminders={model.reminders}
            localDone={localDoneReminders}
            pendingIds={pendingReminderIds}
            todayKey={todayKey}
            granted={remindersGranted}
            permissionMessage={snapshot?.permissions?.reminders?.message}
            input={todoInput}
            onInput={setTodoInput}
            onSubmit={submitTodo}
            onToggle={toggleReminder}
            onSchedule={scheduleTodo}
          />
        ) : null}

        {view === 'stats' ? (
          <StatsView focusLog={focusLog} byDay={byDay} todayKey={todayKey} weekStartMon={weekStartMon} />
        ) : null}

        {view === 'set' ? (
          <SettingsView settings={settings} onChange={updateSetting} />
        ) : null}

        {creatingR ? (
          <>
            {creating ? <div style={{ position: 'absolute', inset: 0, zIndex: 8 }} onClick={() => setCreating(null)} /> : null}
            <CreatePopover
              creating={creatingR}
              leaving={creatingLeaving}
              calendars={writableCalendars}
              byDay={byDay}
              todayKey={todayKey}
              bufferMin={settings.bufferMin || 0}
              onChange={setCreating}
              onSave={saveCreate}
              onCancel={() => setCreating(null)}
            />
          </>
        ) : null}

        {editingR ? (
          <>
            {editing ? <div style={{ position: 'absolute', inset: 0, zIndex: 8 }} onClick={() => setEditing(null)} /> : null}
            <EventEditor
              editing={editingR}
              leaving={editingLeaving}
              calendars={writableCalendars}
              byDay={byDay}
              bufferMin={settings.bufferMin || 0}
              onChange={setEditing}
              onSave={saveEdit}
              onDelete={deleteEditingEvent}
              onConvertTodo={convertEditingToTodo}
              onReveal={() => onEventOpen(editingR.instance.event)}
              onCancel={() => setEditing(null)}
            />
          </>
        ) : null}

        {spanAskR ? <SpanDialog message={spanAskR.message} onPick={spanAskR.onPick} leaving={spanAskLeaving} /> : null}
        {conflictR ? (
          <ConflictResolutionDialog
            plan={conflictR}
            leaving={conflictLeaving}
            onCancel={() => setConflictPreview(null)}
            onConfirm={applyConflictResolution}
          />
        ) : null}

        <div className="xr-toasts">
          {toasts.map((t) => (
            <div key={t.id} className="xr-toast" data-leaving={t.leaving || undefined}>
              <span className="xr-toast-icon" style={{ background: t.iconBg }}>
                {t.icon === '⚠' ? MINI_ICONS.warn : t.icon === '✓' ? MINI_ICONS.check : t.icon}
              </span>
              <span className="xr-toast-text">{t.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- 月历视图 ----------

function MonthView({
  weeks, byDay, remindersByDay, reminders, ymM, todayKey, selected, activeEventUid, dropTarget, dragUid, visCount, dimWeekend,
  calendarGranted, remindersGranted, permissionMessage, calendars, nowMin, todayIsSelected,
  onSelect, onSelectEvent, onOpenCreate, onEditOpen, onDragStart, onDragEndReset, onDropTarget, onDrop,
  onResolve, onToggleDone, onEventOpen, onJoin, onFocusStart, onReminderToggle, onReminderOpen,
  pendingReminderIds, pomodoro
}) {
  const dayNames = weeks.length ? weeks[0].map((key) => WD_SHORT[parseKey(key).getDay()]) : [];

  const cellRect = (evt) => {
    const cell = evt.currentTarget.closest('[data-daykey]');
    return cell ? cell.getBoundingClientRect() : null;
  };

  return (
    <div className="xr-view" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
      <main style={{ flex: 1, minWidth: 0, padding: '14px 22px 20px 24px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {!calendarGranted ? (
          <div className="xr-todo-empty" style={{ marginTop: 20 }}>
            <div style={{ font: "700 15px var(--xr-sans)", color: 'var(--xr-ink-2)' }}>无法读取日历</div>
            <div style={{ font: "400 12px var(--xr-sans)", color: 'var(--xr-muted)', textAlign: 'center', lineHeight: 1.6 }}>{permissionMessage || '请在系统设置中授予日历权限'}</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
              {dayNames.map((dn, i) => (
                <span key={i} className="xr-dayname">{dn}</span>
              ))}
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {weeks.map((row, wi) => (
                <div key={wi} style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
                  {row.map((key) => {
                    const d = parseKey(key);
                    const inMonth = d.getMonth() === ymM;
                    const isToday = key === todayKey;
                    const isSel = key === selected;
                    const dow = d.getDay();
                    const isWknd = dow === 0 || dow === 6;
                    const list = byDay[key] || [];
                    const dayReminders = remindersByDay[key] || [];
                    const conflicts = conflictPairsOn(list);
                    const vis = list.slice(0, visCount);

                    return (
                      <div
                        key={key}
                        data-daykey={key}
                        data-out={!inMonth}
                        data-dim={inMonth && dimWeekend && isWknd}
                        data-selected={isSel}
                        data-drop={dropTarget === key}
                        className="xr-daycell"
                        onClick={() => onSelect(key)}
                        onDoubleClick={(evt) => { evt.stopPropagation(); onSelect(key); onOpenCreate(key, { rect: cellRect(evt), time: '09:00' }); }}
                        onDragOver={(evt) => { evt.preventDefault(); evt.dataTransfer.dropEffect = 'move'; onDropTarget(key); }}
                        onDragLeave={() => { if (dropTarget === key) onDropTarget(null); }}
                        onDrop={(evt) => { evt.preventDefault(); onDrop(dragUid, key); }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 20, flex: 'none' }}>
                          <div
                            className="xr-daynum"
                            style={{
                              background: isToday ? RED : (isSel ? 'var(--xr-ink)' : 'transparent'),
                              color: isToday ? '#fff' : (isSel ? 'var(--xr-bg)' : (inMonth ? 'var(--xr-ink-2)' : 'var(--xr-faint-2)'))
                            }}
                          >
                            {d.getDate()}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {conflicts.length ? <span className="xr-conflict-badge" title="该日存在时间重叠的日程">冲突</span> : null}
                            {dayReminders.length ? <span className="xr-day-todo-badge" title={`${dayReminders.length} 项待办`}>✓{dayReminders.length}</span> : null}
                            {isToday ? <span className="xr-today-badge">今天</span> : null}
                            <button
                              className="xr-plus"
                              title="在这一天新建日程"
                              onClick={(evt) => { evt.stopPropagation(); onSelect(key); onOpenCreate(key, { rect: cellRect(evt), time: '09:00' }); }}
                            >
                              ＋
                            </button>
                          </div>
                        </div>
                        {vis.map((it) => (
                          <div
                            key={it.uid}
                            className="xr-chip"
                            data-active={activeEventUid === it.uid}
                            draggable
                            title={`${it.title} · ${it.isAllDay ? '全天' : `${it.timeLabel}–${fromMin(it.startMin + it.durMin)}`} · 单击查看，双击编辑`}
                            style={{
                              background: tint(it.color, 0.13),
                              borderColor: tint(it.color, 0.32),
                              opacity: dragUid === it.uid ? 0.32 : 1
                            }}
                            onClick={(evt) => {
                              evt.stopPropagation();
                              onSelectEvent(key, it.uid);
                            }}
                            onDoubleClick={(evt) => {
                              evt.stopPropagation();
                              onEditOpen(it, evt.currentTarget.getBoundingClientRect());
                            }}
                            onDragStart={(evt) => {
                              evt.dataTransfer.effectAllowed = 'move';
                              try { evt.dataTransfer.setData('text/plain', it.uid); } catch { /* Safari 兼容 */ }
                              onDragStart(it.uid);
                            }}
                            onDragEnd={onDragEndReset}
                          >
                            <span className="xr-chip-dot" style={{ background: it.color }} />
                            <span className="xr-chip-title" style={{ color: eventInk(it.color) }}>{it.title}</span>
                          </div>
                        ))}
                        {list.length > visCount ? (
                          <button
                            type="button"
                            className="xr-more"
                            title={`查看当天全部 ${list.length} 项日程`}
                            onClick={(evt) => { evt.stopPropagation(); onSelect(key); }}
                          >
                            +{list.length - visCount} 更多
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="xr-legend">
              {calendars.slice(0, 3).map((cal) => (
                <span key={cal.identifier}><i style={{ background: cal.color }} />{cal.title}</span>
              ))}
              <span><i style={{ background: RED }} />重要</span>
              <span style={{ marginLeft: 'auto' }}>单击日程查看 · 双击编辑 · 双击空白新建 · 拖拽改期</span>
            </div>
          </>
        )}
      </main>

      <DayPanel
        dateKey={selected}
        list={byDay[selected] || []}
        reminders={reminders}
        remindersGranted={remindersGranted}
        pendingReminderIds={pendingReminderIds}
        isToday={todayIsSelected}
        activeEventUid={activeEventUid}
        nowMin={nowMin}
        onResolve={onResolve}
        onOpenCreate={onOpenCreate}
        onToggleDone={onToggleDone}
        onSelectEvent={(uid) => onSelectEvent(selected, uid)}
        onEventOpen={onEventOpen}
        onEditOpen={onEditOpen}
        onJoin={onJoin}
        onFocusStart={onFocusStart}
        onReminderToggle={onReminderToggle}
        onReminderOpen={onReminderOpen}
        pomodoro={pomodoro}
      />
    </div>
  );
}

function DaySection({ label, count, children }) {
  if (!count) {
    return null;
  }
  return (
    <section className="xr-day-section">
      <div className="xr-day-section__title"><span>{label}</span><span>{count}</span></div>
      <div className="xr-day-section__list">{children}</div>
    </section>
  );
}

function DayEventRow({ item, active, onSelect, onToggleDone, onEventOpen, onEditOpen, onJoin, onFocusStart }) {
  const note = (item.event.notes || '').replace(/\s+/g, ' ').trim();
  const context = [item.event.location ? `地点 · ${item.event.location}` : '', note].filter(Boolean).join(' · ');

  return (
    <div className="xr-item" data-active={active} onClick={() => onSelect(item.uid)}>
      <button
        className="xr-check"
        data-done={item.done}
        title="仅在 Edgee 中标记完成，不修改 Apple Calendar"
        onClick={(evt) => { evt.stopPropagation(); onToggleDone(item, !item.done); }}
      >
        {item.done ? <span className="xr-checkglyph">✓</span> : ''}
      </button>
      <span className="xr-item-bar" style={{ background: item.color }} />
      <div className="xr-item-content">
        <div className="xr-item-title" data-done={item.done}>{item.title}</div>
        <div className="xr-item-time">
          {item.isAllDay ? '全天' : `${item.timeLabel} – ${fromMin(item.startMin + item.durMin)}`} · {item.event.calendarTitle}
        </div>
        {context ? <div className="xr-item-context" title={context}>{context}</div> : null}
      </div>
      <div className="xr-item-actions">
        {active ? <button className="xr-item-action" onClick={(evt) => { evt.stopPropagation(); onFocusStart(item.event); }}>专注</button> : null}
        {item.joinURL ? <button className="xr-item-action is-accent" onClick={(evt) => { evt.stopPropagation(); onJoin(item.joinURL); }}>加入</button> : null}
        <button
          className="xr-item-action"
          onClick={(evt) => { evt.stopPropagation(); onEditOpen(item, evt.currentTarget.closest('.xr-item').getBoundingClientRect()); }}
        >
          编辑
        </button>
        <button className="xr-item-reveal" title="在 Apple Calendar 中查看" onClick={(evt) => { evt.stopPropagation(); onEventOpen(item.event); }}>{MINI_ICONS.arrowOut}</button>
      </div>
    </div>
  );
}

function DayReminderRow({ item, pending, onToggle, onOpen }) {
  const due = item.dueAt ? new Date(item.dueAt) : null;
  const dueTime = due ? `${pad2(due.getHours())}:${pad2(due.getMinutes())}` : '无时间';
  const title = item.title.replace(/[!！]高/g, ' ').replace(/\s{2,}/g, ' ').trim() || item.title;
  const high = /[!！]高/.test(item.title);

  return (
    <div className="xr-item xr-reminder-item" data-overdue={item.isOverdue}>
      <button className="xr-check" title="在 Apple 提醒事项中完成" disabled={pending} onClick={() => onToggle(item)}>
        {pending ? '…' : ''}
      </button>
      <span className="xr-item-bar" />
      <div className="xr-item-content">
        <div className="xr-item-title">{title}</div>
        <div className="xr-item-time">{item.isOverdue ? '已逾期 · ' : ''}{dueTime} · {item.listTitle || '提醒事项'}</div>
      </div>
      {high ? <span className="xr-item-tag">高优先级</span> : null}
      <button className="xr-item-reveal" title="在 Apple 提醒事项中查看" onClick={() => onOpen(item)}>{MINI_ICONS.arrowOut}</button>
    </div>
  );
}

function DayPanel({
  dateKey, list, reminders, remindersGranted, pendingReminderIds, isToday, activeEventUid, nowMin,
  onResolve, onOpenCreate, onToggleDone, onSelectEvent, onEventOpen, onEditOpen, onJoin, onFocusStart,
  onReminderToggle, onReminderOpen, pomodoro
}) {
  const d = parseKey(dateKey);
  const conflicts = conflictPairsOn(list);
  const doneCount = list.filter((it) => it.done).length;
  const allDayEvents = list.filter((it) => it.isAllDay);
  const timedEvents = list.filter((it) => !it.isAllDay);
  const overdueReminders = reminders.filter((item) => item.isOverdue && item.dueAt && fmtKey(new Date(item.dueAt)) !== dateKey);
  const datedReminders = reminders.filter((item) => !overdueReminders.includes(item));
  const next = isToday ? timedEvents.find((it) => !it.done && it.startMin >= nowMin) || null : null;
  const pomodoroActive = pomodoro.status !== 'idle';
  const hasContent = list.length > 0 || reminders.length > 0;

  const remainingLabel = `${Math.floor(pomodoro.remainingSeconds / 60)}:${pad2(pomodoro.remainingSeconds % 60)}`;
  const nextLabel = next
    ? (next.startMin - nowMin < 60
      ? `下一项 · ${Math.max(0, next.startMin - nowMin)} 分钟后`
      : `下一项 · ${Math.floor((next.startMin - nowMin) / 60)} 小时 ${(next.startMin - nowMin) % 60} 分后`)
    : '';

  const renderEvent = (item) => (
    <DayEventRow
      key={item.uid}
      item={item}
      active={activeEventUid === item.uid}
      onSelect={onSelectEvent}
      onToggleDone={onToggleDone}
      onEventOpen={onEventOpen}
      onEditOpen={onEditOpen}
      onJoin={onJoin}
      onFocusStart={onFocusStart}
    />
  );

  const renderReminder = (item) => (
    <DayReminderRow
      key={item.identifier}
      item={item}
      pending={Boolean(pendingReminderIds[item.identifier])}
      onToggle={onReminderToggle}
      onOpen={onReminderOpen}
    />
  );

  return (
    <aside className="xr-aside">
      <div>
        <div className="xr-aside-eyebrow">当日行动中心</div>
        <div className="xr-aside-title">{d.getMonth() + 1}月{d.getDate()}日 {WD_FULL[d.getDay()]}</div>
        <div className="xr-aside-meta">
          {hasContent
            ? `${list.length} 项日程 · ${reminders.length} 项待办${list.some((it) => it.pri) ? ` · ${list.filter((it) => it.pri).length} 项高优先级` : ''}${isToday ? ' · 今天' : ''}`
            : (isToday ? '今天 · 暂无安排' : '暂无安排')}
        </div>
      </div>

      {conflicts.length ? (
        <div className="xr-conflictcard">
          <div className="xr-conflictcard-head">{MINI_ICONS.warn}时间冲突</div>
          <div className="xr-conflictcard-text">
            「{conflicts[0][0].title}」({conflicts[0][0].timeLabel}) 与「{conflicts[0][1].title}」({conflicts[0][1].timeLabel}) 时间重叠
          </div>
          <button className="xr-resolvebtn" onClick={() => onResolve(dateKey)}>预览解决方案</button>
        </div>
      ) : null}

      <div className="xr-day-scroll">
        {!remindersGranted ? <div className="xr-aside-permission">提醒事项权限未开启，当前仅显示日历事件。</div> : null}
        {!hasContent ? (
          <div className="xr-aside-empty">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--xr-ink-3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="17" rx="3" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="12" y1="14" x2="12" y2="18" /><line x1="10" y1="16" x2="14" y2="16" />
            </svg>
            <div className="xr-aside-empty-title">这一天还没有安排</div>
            <div className="xr-aside-empty-sub">点击左侧日历任意格子的 ＋<br />或双击格子即可快速创建</div>
            <button className="xr-createbtn" onClick={() => onOpenCreate(dateKey, {})}>＋ 创建日程</button>
          </div>
        ) : (
          <>
            <DaySection label="逾期待办" count={overdueReminders.length}>{overdueReminders.map(renderReminder)}</DaySection>
            <DaySection label="全天" count={allDayEvents.length}>{allDayEvents.map(renderEvent)}</DaySection>
            <DaySection label="按时间" count={timedEvents.length}>{timedEvents.map(renderEvent)}</DaySection>
            <DaySection label="待办" count={datedReminders.length}>{datedReminders.map(renderReminder)}</DaySection>
          </>
        )}
      </div>

      {list.length ? (
        <div>
          <div className="xr-progress-head"><span>Edgee 日程完成</span><span style={{ color: '#e9e3d7' }}>{doneCount} / {list.length}</span></div>
          <div className="xr-progress-track">
            <div className="xr-progress-fill" style={{ width: `${Math.round((doneCount / list.length) * 100)}%` }} />
          </div>
          <div className="xr-local-completion-note">仅保存在本机，不修改 Apple Calendar</div>
        </div>
      ) : null}

      {pomodoroActive ? (
        <div className="xr-nextcard">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="xr-nextcard-label">
              {pomodoro.status === 'completed' ? '专注完成' : pomodoro.status === 'paused' ? '专注暂停' : '专注进行中'}
              {pomodoro.boundTitle ? ` · ${pomodoro.boundTitle}` : ''}
            </div>
            <div className="xr-nextcard-title" style={{ fontFamily: 'var(--xr-mono)' }}>{remainingLabel}</div>
          </div>
          {pomodoro.status === 'running' ? <button className="xr-minibtn" onClick={pomodoro.onPause}>暂停</button> : null}
          {pomodoro.status === 'paused' ? <button className="xr-minibtn" onClick={pomodoro.onResume}>继续</button> : null}
          <button className="xr-minibtn" onClick={pomodoro.onStop}>停止</button>
        </div>
      ) : next ? (
        <div className="xr-nextcard">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="xr-nextcard-label">{nextLabel}</div>
            <div className="xr-nextcard-title">{next.timeLabel} {next.title}</div>
          </div>
          <button className="xr-focusbtn" onClick={() => onFocusStart(next.event)}>▶ 专注 25 分</button>
        </div>
      ) : null}
    </aside>
  );
}

// ---------- 周视图 ----------

function WeekView({ wkStart, byDay, todayKey, nowMin, onCreateAt, onEditOpen, onMoveResize }) {
  // 默认 8:00–22:00,本周有更早/更晚的事件时按整点外扩,避免视觉截断
  let minStart = 8 * 60;
  let maxEnd = 22 * 60;
  for (let i = 0; i < 7; i += 1) {
    (byDay[addDaysKey(wkStart, i)] || []).forEach((it) => {
      if (it.isAllDay) {
        return;
      }
      minStart = Math.min(minStart, it.startMin);
      maxEnd = Math.max(maxEnd, it.startMin + it.durMin);
    });
  }
  const H0 = Math.max(0, Math.floor(minStart / 60) * 60);
  const H1 = Math.min(24 * 60, Math.ceil(maxEnd / 60) * 60);
  const RANGE = H1 - H0;
  const SNAP = 15;

  const gridRef = useRef(null);
  const justDraggedRef = useRef(false);
  const dragRef = useRef(null);
  const detachRef = useRef(null);
  const [drag, setDrag] = useState(null);

  // StrictMode 下 setState updater 可能被双调用,副作用一律走 dragRef
  const updateDrag = (next) => {
    dragRef.current = next;
    setDrag(next);
  };

  const cols = Array.from({ length: 7 }, (_, i) => {
    const key = addDaysKey(wkStart, i);
    const d = parseKey(key);
    const list = byDay[key] || [];
    return {
      key,
      date: d.getDate(),
      label: WD_SHORT[d.getDay()],
      isToday: key === todayKey,
      allDay: list.filter((it) => it.isAllDay),
      timed: list.filter((it) => !it.isAllDay)
    };
  });

  const detachListeners = () => {
    if (detachRef.current) {
      detachRef.current();
      detachRef.current = null;
    }
  };

  useEffect(() => detachListeners, []);

  function onDragMove(evt) {
    const d = dragRef.current;
    if (!d) {
      return;
    }
    const moved = d.moved || Math.abs(evt.clientX - d.startX) + Math.abs(evt.clientY - d.startY) > 4;
    if (!moved) {
      return;
    }
    const pm = H0 + ((evt.clientY - d.gridRect.top) / d.gridRect.height) * RANGE;
    if (d.mode === 'resize') {
      let dur = Math.round((pm - d.startMin) / SNAP) * SNAP;
      dur = Math.max(15, Math.min(dur, H1 - d.startMin));
      updateDrag({ ...d, moved, durMin: dur });
      return;
    }
    let dayIdx = d.colRects.findIndex((r) => evt.clientX >= r.left && evt.clientX < r.right);
    if (dayIdx < 0) {
      dayIdx = evt.clientX < d.colRects[0].left ? 0 : 6;
    }
    if (d.allDay) {
      updateDrag({ ...d, moved, dayIdx });
      return;
    }
    let start = Math.round((pm - d.grabOffsetMin) / SNAP) * SNAP;
    start = Math.max(H0, Math.min(start, H1 - d.durMin));
    updateDrag({ ...d, moved, dayIdx, startMin: start });
  }

  function finishDrag(commit) {
    detachListeners();
    const d = dragRef.current;
    if (!d) {
      return;
    }
    updateDrag(null);
    if (!d.moved) {
      onEditOpen(d.it, d.sourceRect);
      return;
    }
    justDraggedRef.current = true;
    window.setTimeout(() => { justDraggedRef.current = false; }, 120);
    if (commit) {
      const targetKey = addDaysKey(wkStart, d.dayIdx);
      const changed = targetKey !== d.it.dateKey || d.startMin !== d.it.startMin || d.durMin !== d.it.durMin;
      if (changed) {
        onMoveResize(d.it, {
          dateKey: targetKey,
          startMin: d.allDay ? null : d.startMin,
          durMin: d.allDay ? null : d.durMin
        });
      }
    }
  }

  function beginDrag(evt, it, colIdx, mode) {
    if (evt.button !== 0 || !gridRef.current) {
      return;
    }
    evt.stopPropagation();
    evt.preventDefault();
    detachListeners();
    const gridRect = gridRef.current.getBoundingClientRect();
    // 第一个子元素是时间轴,列从第二个开始
    const colRects = Array.from(gridRef.current.children).slice(1).map((el) => el.getBoundingClientRect());
    const pm = H0 + ((evt.clientY - gridRect.top) / gridRect.height) * RANGE;
    updateDrag({
      it,
      mode,
      moved: false,
      startX: evt.clientX,
      startY: evt.clientY,
      sourceRect: evt.currentTarget.closest('.xr-wkev')?.getBoundingClientRect() || evt.currentTarget.getBoundingClientRect(),
      dayIdx: colIdx,
      startMin: it.startMin,
      durMin: it.durMin,
      grabOffsetMin: pm - it.startMin,
      gridRect,
      colRects,
      allDay: it.isAllDay
    });

    // 同步挂监听:快速点击时 pointerup 可能先于 React effect 触发
    const onUp = () => finishDrag(true);
    const onCancel = () => finishDrag(false);
    const onKey = (keyEvt) => {
      if (keyEvt.key === 'Escape') {
        keyEvt.preventDefault();
        finishDrag(false);
      }
    };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
    detachRef.current = () => {
      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
    };
  }

  const hours = [];
  for (let h = H0 / 60; h <= H1 / 60; h += 2) {
    hours.push({ top: `${((h * 60 - H0) / RANGE) * 100}%`, label: `${pad2(h)}:00` });
  }

  const layByDay = cols.map((col) => layoutDayColumns(col.timed));

  const dragging = drag && drag.moved;
  const ghostLabel = dragging && !drag.allDay ? `${fromMin(drag.startMin)} – ${fromMin(drag.startMin + drag.durMin)}` : '';

  return (
    <div className="xr-view" data-dragging={Boolean(dragging)} style={{ flex: 1, minHeight: 0, padding: '14px 24px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '46px repeat(7,1fr)', gap: 5, flex: 'none' }}>
        <span />
        {cols.map((col) => (
          <div key={col.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '4px 0' }}>
            <span style={{ font: "600 11px var(--xr-sans)", color: col.isToday ? RED : 'var(--xr-muted)' }}>{col.label}</span>
            <span className="xr-week-daynum" style={{ background: col.isToday ? RED : 'transparent', color: col.isToday ? '#fff' : 'var(--xr-ink-2)' }}>{col.date}</span>
          </div>
        ))}
      </div>
      <div ref={gridRef} style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '46px repeat(7,1fr)', gap: 5 }}>
        <div style={{ position: 'relative' }}>
          {hours.map((h) => (
            <span key={h.label} style={{ position: 'absolute', top: h.top, right: 8, transform: 'translateY(-50%)', font: "500 11px var(--xr-mono)", color: 'var(--xr-muted)' }}>{h.label}</span>
          ))}
        </div>
        {cols.map((col, colIdx) => (
          <div
            key={col.key}
            className="xr-weekcol"
            title="点击空白处在该时刻新建"
            style={{ backgroundColor: col.isToday ? 'var(--xr-surface-today)' : 'var(--xr-surface)', '--xr-2h': `${(120 / RANGE) * 100}%` }}
            onClick={(evt) => {
              if (justDraggedRef.current) {
                return;
              }
              const rect = evt.currentTarget.getBoundingClientRect();
              const frac = (evt.clientY - rect.top) / rect.height;
              const min = Math.round((H0 + frac * RANGE) / 30) * 30;
              onCreateAt(col.key, fromMin(min));
            }}
          >
            {col.allDay.map((it, idx) => (
              <div
                key={it.uid}
                className="xr-wkev"
                data-dragging={dragging && drag.it.uid === it.uid}
                style={{ top: idx * 18 + 2, height: 16, background: tint(it.color, 0.2), borderLeft: `3px solid ${it.color}`, zIndex: 3, padding: '1px 7px' }}
                onClick={(evt) => evt.stopPropagation()}
                onPointerDown={(evt) => beginDrag(evt, it, colIdx, 'move')}
              >
                <div className="xr-wkev-title" style={{ color: eventInk(it.color), fontSize: 11 }}>全天 · {it.title}</div>
              </div>
            ))}
            {col.timed.map((it) => {
              // 起止越出网格的部分做视觉截断,避免块飘出列外
              const topPct = Math.max(0, ((it.startMin - H0) / RANGE) * 100);
              const endPct = Math.min(100, ((it.startMin + it.durMin - H0) / RANGE) * 100);
              const pos = layByDay[colIdx][it.uid];
              return (
              <div
                key={it.uid}
                className="xr-wkev"
                data-dragging={dragging && drag.it.uid === it.uid}
                style={{
                  top: `${topPct}%`,
                  height: `${Math.max(4.2, endPct - topPct)}%`,
                  background: tint(it.color, 0.13),
                  borderLeft: `3px solid ${it.color}`,
                  ...(pos && pos.cols > 1
                    ? {
                        left: `calc(${(pos.col / pos.cols) * 100}% + 3px)`,
                        width: `calc(${100 / pos.cols}% - 5px)`,
                        right: 'auto'
                      }
                    : null)
                }}
                onClick={(evt) => evt.stopPropagation()}
                onPointerDown={(evt) => beginDrag(evt, it, colIdx, 'move')}
              >
                <div className="xr-wkev-title" style={{ color: eventInk(it.color) }}>{it.title}</div>
                <div className="xr-wkev-time" style={{ color: eventInk(it.color) }}>{it.timeLabel} – {fromMin(it.startMin + it.durMin)}</div>
                <div className="xr-wkev-resize" onPointerDown={(evt) => beginDrag(evt, it, colIdx, 'resize')} />
              </div>
              );
            })}
            {dragging && drag.dayIdx === colIdx && !drag.allDay ? (
              <div
                className="xr-wkev xr-wkev-ghost"
                style={{
                  top: `${((drag.startMin - H0) / RANGE) * 100}%`,
                  height: `${Math.max(4.2, (drag.durMin / RANGE) * 100)}%`,
                  borderColor: drag.it.color,
                  background: tint(drag.it.color, 0.1)
                }}
              >
                <div className="xr-wkev-title" style={{ color: eventInk(drag.it.color) }}>{drag.it.title}</div>
                <div className="xr-wkev-time" style={{ color: eventInk(drag.it.color) }}>{ghostLabel}</div>
              </div>
            ) : null}
            {dragging && drag.dayIdx === colIdx && drag.allDay ? (
              <div className="xr-wkev xr-wkev-ghost" style={{ top: 2, height: 16, borderColor: drag.it.color, background: tint(drag.it.color, 0.1), padding: '1px 7px' }}>
                <div className="xr-wkev-title" style={{ color: eventInk(drag.it.color), fontSize: 11 }}>全天 · {drag.it.title}</div>
              </div>
            ) : null}
            {col.isToday && nowMin >= H0 && nowMin <= H1 ? (
              <div className="xr-nowline" style={{ top: `${((nowMin - H0) / RANGE) * 100}%` }}><i /></div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="xr-hint">拖动日程块改时间/日期 · 拖动块下缘改时长 · 点击块打开编辑 · 点击空白时段快速创建</div>
    </div>
  );
}

// ---------- 待办清单 ----------

function TodoView({ reminders, localDone, pendingIds, todayKey, granted, permissionMessage, input, onInput, onSubmit, onToggle, onSchedule }) {
  const rows = reminders.map((item) => {
    const priMatch = /[!！]高/.test(item.title);
    return {
      item,
      title: item.title.replace(/[!！]高/g, ' ').replace(/\s{2,}/g, ' ').trim() || item.title,
      pri: priMatch,
      due: reminderDueLabel(item, todayKey),
      done: Boolean(localDone[item.identifier]?.done),
      pending: Boolean(pendingIds[item.identifier])
    };
  });
  const undone = rows.filter((r) => !r.done);

  return (
    <div className="xr-view" style={{ flex: 1, minHeight: 0, padding: '14px 24px 20px', display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 760 }}>
      <div className="xr-todoinput">
        <span style={{ font: "700 16px var(--xr-sans)", color: 'var(--xr-accent)', flex: 'none' }}>＋</span>
        <input
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
          placeholder="添加待办，回车确认 · 试试「周四交周报 !高」"
        />
        <span style={{ font: "500 11px var(--xr-sans)", color: 'var(--xr-faint)', flex: 'none' }}>回车创建</span>
      </div>

      {!granted ? (
        <div className="xr-todo-empty">
          <div style={{ font: "700 15px var(--xr-sans)", color: 'var(--xr-ink-2)' }}>无法读取提醒事项</div>
          <div style={{ font: "400 12px var(--xr-sans)", color: 'var(--xr-muted)', textAlign: 'center', lineHeight: 1.6 }}>{permissionMessage || '请在系统设置中授予提醒事项权限'}</div>
        </div>
      ) : rows.length === 0 ? (
        <div className="xr-todo-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--xr-faint-2)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 11.5 12 14.5 22 4.5" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <div style={{ font: "700 15px var(--xr-sans)", color: 'var(--xr-ink-2)' }}>全部搞定，清单空空</div>
          <div style={{ font: "400 12px var(--xr-sans)", color: 'var(--xr-muted)', textAlign: 'center', lineHeight: 1.6 }}>
            在上方输入框记下一件事，回车即可加入清单<br />加「!高」自动标为高优先级
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {rows.map((row) => (
            <div key={row.item.identifier} className="xr-todorow">
              <button
                className="xr-todocheck"
                data-done={row.done}
                title="标记完成"
                disabled={row.pending}
                onClick={() => onToggle(row.item)}
              >
                {row.pending ? '…' : row.done ? <span className="xr-checkglyph">✓</span> : ''}
              </button>
              <span className="xr-todotitle" data-done={row.done}>{row.title}</span>
              {row.pri && !row.done ? <span className="xr-pri-badge">!高</span> : null}
              {!row.done ? (
                <button className="xr-todoschedule" title="转为日程(排期)" onClick={() => onSchedule(row)}>排期</button>
              ) : null}
              <span className="xr-tododue" style={row.due === '已逾期' ? { color: RED, fontWeight: 700 } : undefined}>{row.due}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ font: "500 11px var(--xr-sans)", color: 'var(--xr-muted)', flex: 'none' }}>
        {undone.length} 项进行中 · 数据来自 Apple 提醒事项
      </div>
    </div>
  );
}

// ---------- 专注统计 ----------

function StatsView({ focusLog, byDay, todayKey, weekStartMon }) {
  const minutesByDate = {};
  focusLog.forEach((entry) => {
    if (entry && entry.date) {
      minutesByDate[entry.date] = (minutesByDate[entry.date] || 0) + (Number(entry.minutes) || 0);
    }
  });

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const key = addDaysKey(todayKey, i - 6);
    return { key, minutes: minutesByDate[key] || 0 };
  });
  const maxMinutes = Math.max(1, ...last7.map((d) => d.minutes));

  const thisWeekStart = weekStartKeyOf(todayKey, weekStartMon);
  let thisWeekMinutes = 0;
  let lastWeekMinutes = 0;
  for (let i = 0; i < 7; i += 1) {
    thisWeekMinutes += minutesByDate[addDaysKey(thisWeekStart, i)] || 0;
    lastWeekMinutes += minutesByDate[addDaysKey(thisWeekStart, i - 7)] || 0;
  }

  let streak = 0;
  let cursor = todayKey;
  while (minutesByDate[cursor] > 0) {
    streak += 1;
    cursor = addDaysKey(cursor, -1);
  }

  const todayList = byDay[todayKey] || [];
  const todayDone = todayList.filter((it) => it.done).length;

  // 本周周报:完成率 / 专注 vs 排期 / 最投入日历
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysKey(thisWeekStart, i));
  let weekTotal = 0;
  let weekDone = 0;
  let weekSchedMin = 0;
  const calMinutes = {};
  const weekBars = weekDays.map((key) => {
    const timedList = (byDay[key] || []).filter((it) => !it.isAllDay);
    const doneCount = timedList.filter((it) => it.done).length;
    weekTotal += timedList.length;
    weekDone += doneCount;
    timedList.forEach((it) => {
      weekSchedMin += it.durMin;
      const calTitle = it.event.calendarTitle || '其它';
      calMinutes[calTitle] = (calMinutes[calTitle] || 0) + it.durMin;
    });
    return { key, total: timedList.length, done: doneCount, isToday: key === todayKey };
  });
  const topCal = Object.entries(calMinutes).sort((a, b) => b[1] - a[1])[0];
  const weekBarMax = Math.max(1, ...weekBars.map((b) => b.total));

  const weekDeltaLabel = lastWeekMinutes > 0
    ? `较上周 ${thisWeekMinutes >= lastWeekMinutes ? '+' : ''}${Math.round(((thisWeekMinutes - lastWeekMinutes) / lastWeekMinutes) * 100)}%`
    : '上周暂无记录';

  const cards = [
    { label: '本周专注', value: `${(thisWeekMinutes / 60).toFixed(1)}h`, delta: weekDeltaLabel, deltaColor: thisWeekMinutes >= lastWeekMinutes ? '#5c7a52' : RED },
    { label: '连续专注天数', value: `${streak} 天`, delta: streak > 0 ? '保持住这股势头' : '今天完成一轮专注即可起算', deltaColor: '#8a8175' },
    { label: '今日日程完成', value: todayList.length ? `${todayDone}/${todayList.length}` : '—', delta: todayList.length ? `完成率 ${Math.round((todayDone / todayList.length) * 100)}%` : '今天没有日程', deltaColor: '#5c7a52' }
  ];

  return (
    <div className="xr-view" style={{ flex: 1, minHeight: 0, padding: '14px 24px 20px', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 860 }}>
      <div className="xr-weekreport">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="xr-weekreport-label">本周周报 · {(() => { const d = parseKey(thisWeekStart); return `${d.getMonth() + 1}/${d.getDate()}`; })()} 起</div>
          <div className="xr-weekreport-line">
            完成 <b><AnimatedNumber value={weekDone} />/{weekTotal}</b> 项日程 ·
            专注 <b><AnimatedNumber value={thisWeekMinutes / 60} decimals={1} />h</b> /
            排期 <b><AnimatedNumber value={weekSchedMin / 60} decimals={1} />h</b>
            {topCal ? <> · 最投入:<b>{topCal[0]}</b></> : null}
          </div>
          <div className="xr-weekreport-foot">完成状态与专注记录保存在本机</div>
        </div>
        <div className="xr-weekreport-bars">
          {weekBars.map((bar) => (
            <div key={bar.key} className="xr-weekreport-barcol" title={`${bar.done}/${bar.total}`}>
              <div className="xr-weekreport-bartrack">
                <div className="xr-weekreport-bartotal" style={{ height: `${(bar.total / weekBarMax) * 100}%` }}>
                  <div className="xr-weekreport-bardone" style={{ height: bar.total ? `${(bar.done / bar.total) * 100}%` : 0 }} />
                </div>
              </div>
              <span style={{ color: bar.isToday ? 'var(--xr-accent)' : '#8f877b' }}>{WD_SHORT[parseKey(bar.key).getDay()]}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, flex: 'none' }}>
        {cards.map((card) => (
          <div key={card.label} className="xr-statcard">
            <div className="xr-statcard-label">{card.label}</div>
            <div className="xr-statcard-value">{card.value}</div>
            <div className="xr-statcard-delta" style={{ color: card.deltaColor }}>{card.delta}</div>
          </div>
        ))}
      </div>
      <div className="xr-chart">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ font: "700 14px var(--xr-sans)", color: '#f4efe4' }}>近 7 天专注时长</div>
          <div style={{ font: "500 11px var(--xr-mono)", color: '#8f877b' }}>单位 · 分钟</div>
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 14, alignItems: 'end', minHeight: 0 }}>
          {last7.map((day, i) => {
            const isToday = i === 6;
            return (
              <div key={day.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
                <span style={{ font: "600 11px var(--xr-mono)", color: '#c9c2b4' }}>{day.minutes || '—'}</span>
                <div
                  className="xr-chart-bar"
                  title={`${day.minutes} 分钟`}
                  style={{
                    height: `${Math.max(4, (day.minutes / maxMinutes) * 100)}%`,
                    background: isToday ? 'var(--xr-accent)' : (day.minutes ? 'rgba(224,146,95,0.35)' : 'rgba(255,255,255,0.07)')
                  }}
                />
                <span style={{ font: "600 11px var(--xr-sans)", color: isToday ? 'var(--xr-accent)' : '#8f877b' }}>
                  {isToday ? '今天' : `周${WD_SHORT[parseKey(day.key).getDay()]}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="xr-hint">完成一轮 25 分钟专注后自动计入统计（数据保存在本机）</div>
    </div>
  );
}

// ---------- 设置 ----------

function SettingsView({ settings, onChange }) {
  const rows = [
    { id: 'weekStartMon', title: '每周从周一开始', desc: '关闭后以周日作为每周第一天' },
    { id: 'dimWeekend', title: '周末列置灰', desc: '月历中弱化周六、周日' },
    { id: 'density', type: 'options', title: '月历信息密度', desc: '在留白与单格可见日程数量之间切换', options: [['simple', '精简'], ['standard', '标准'], ['compact', '紧凑']] },
    { id: 'sound', title: '完成音效', desc: '勾选完成时播放提示音' },
    { id: 'bufferMin', type: 'options', title: '通勤缓冲', desc: '与带地点的日程间隔不足时,创建前给出顺延提醒', options: [[0, '关'], [10, '10分'], [15, '15分'], [30, '30分']] },
    { id: 'systemAccent', title: '跟随系统强调色', desc: '主题色使用 macOS 系统强调色(关闭则用 Edgee 品牌橙)' }
  ];

  return (
    <div className="xr-view" style={{ flex: 1, minHeight: 0, padding: '14px 24px 20px', display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 620 }}>
      {rows.map((row) => (
        <div key={row.id} className="xr-setrow">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="xr-setrow-title">{row.title}</div>
            <div className="xr-setrow-desc">{row.desc}</div>
          </div>
          {row.type === 'options' ? (
            <div style={{ display: 'flex', gap: 4 }}>
              {row.options.map(([value, label]) => (
                <button
                  key={value}
                  className="xr-opt-light"
                  data-on={(settings[row.id] || 0) === value}
                  onClick={() => onChange(row.id, value)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <button className="xr-switch" data-on={Boolean(settings[row.id])} onClick={() => onChange(row.id, !settings[row.id])}>
              <i />
            </button>
          )}
        </div>
      ))}
      <div style={{ font: "500 11px var(--xr-sans)", color: 'var(--xr-muted)', marginTop: 8 }}>
        「每周从周一开始」开关会实时改变月历与周视图的排列
      </div>
    </div>
  );
}

// ---------- 快速创建浮层 ----------

function CreatePopover({ creating, leaving, calendars, byDay, todayKey, bufferMin, onChange, onSave, onCancel }) {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const d = parseKey(creating.date);
  const durOpts = [
    { label: '30分', value: 30 },
    { label: '1时', value: 60 },
    { label: '2时', value: 120 }
  ];

  const parsed = useMemo(() => parseQuickEntry(creating.title, todayKey), [creating.title, todayKey]);
  const parseHit = parsed.tokens.length > 0 && parsed.title;

  const probeStart = toMin(creating.time);
  const dayList = byDay[creating.date] || [];
  const conflictWith = dayList.find(
    (it) => !it.isAllDay && it.startMin < probeStart + creating.dur && probeStart < it.startMin + it.durMin
  );
  const commute = conflictWith ? null : commuteConflict(dayList, probeStart, creating.dur, bufferMin);
  const deferSlot = (conflictWith || commute)
    ? nextFreeSlot(dayList, probeStart, creating.dur, bufferMin)
    : null;

  return (
    <div className="xr-pop" data-side={creating.side || undefined} data-leaving={leaving || undefined} style={{ left: creating.x, top: creating.y }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="xr-pop-eyebrow">新建日程</span>
        <span className="xr-pop-date">{d.getMonth() + 1}/{d.getDate()} {WD_FULL[d.getDay()]}</span>
      </div>
      <input
        ref={inputRef}
        className="xr-pop-title"
        data-err={creating.err}
        value={creating.title}
        placeholder="做什么？回车保存"
        onChange={(e) => onChange({ ...creating, title: e.target.value, err: false })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onSave();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      {parseHit ? (
        <div className="xr-pop-parse">
          <span className="xr-pop-parse-text">
            {MINI_ICONS.spark} {parsed.tokens.map((t) => t.label).join(' · ')} ·「{parsed.title}」
          </span>
          <button className="xr-pop-parse-apply" onClick={() => onChange(applyQuickParse(creating, todayKey))}>
            应用
          </button>
        </div>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="time"
          className="xr-pop-time"
          value={creating.time}
          onChange={(e) => onChange({ ...creating, time: e.target.value || creating.time })}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {durOpts.map((opt) => (
            <button key={opt.value} className="xr-pop-opt" data-on={creating.dur === opt.value} onClick={() => onChange({ ...creating, dur: opt.value })}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      {calendars.length ? (
        <div style={{ display: 'flex', gap: 5 }}>
          {calendars.slice(0, 3).map((cal) => (
            <button
              key={cal.identifier}
              className="xr-pop-cat"
              data-on={creating.calendarIdentifier === cal.identifier}
              onClick={() => onChange({ ...creating, calendarIdentifier: cal.identifier })}
            >
              <i style={{ background: cal.color }} />{cal.title}
            </button>
          ))}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {[['none', '不重复'], ['daily', '每天'], ['weekdays', '工作日'], ['weekly', '每周'], ['monthly', '每月'], ['yearly', '每年']].map(([key, label]) => (
          <button
            key={key}
            className="xr-pop-opt"
            style={{ height: 24, padding: '0 7px', fontSize: 10 }}
            data-on={(creating.recur || 'none') === key}
            onClick={() => onChange({ ...creating, recur: key })}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 5 }}>
        <button className="xr-pop-cat" data-on={creating.pri} onClick={() => onChange({ ...creating, pri: !creating.pri })}>
          <i style={{ background: RED }} />标为高优先级（!高）
        </button>
      </div>
      {creating.fromReminder ? (
        <div style={{ display: 'flex', gap: 5 }}>
          <button
            className="xr-pop-cat"
            data-on={creating.completeReminder}
            onClick={() => onChange({ ...creating, completeReminder: !creating.completeReminder })}
          >
            <i style={{ background: '#8fa383' }} />保存后完成该待办
          </button>
        </div>
      ) : null}
      {conflictWith || commute ? (
        <div className="xr-pop-warn xr-pop-warn-row">
          <span style={{ flex: 1, minWidth: 0 }}>
            {MINI_ICONS.warn}{' '}
            {conflictWith
              ? `与「${conflictWith.title}」重叠`
              : `与「${commute.title}」间隔仅 ${commute.gap} 分钟，注意通勤`}
          </span>
          {deferSlot != null && deferSlot !== probeStart ? (
            <button className="xr-pop-defer" onClick={() => onChange({ ...creating, time: fromMin(deferSlot) })}>
              顺延到 {fromMin(deferSlot)}
            </button>
          ) : null}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
        <button className="xr-pop-cancel" onClick={onCancel}>取消 Esc</button>
        <button className="xr-pop-save" onClick={onSave}>保存 ⏎</button>
      </div>
    </div>
  );
}

// ---------- 事件编辑浮层 ----------

function EventEditor({ editing, leaving, calendars, byDay, bufferMin, onChange, onSave, onDelete, onConvertTodo, onReveal, onCancel }) {
  const { instance, draft, readOnly } = editing;
  const ev = instance.event;
  const inputRef = useRef(null);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (!readOnly) {
      inputRef.current?.focus();
    }
  }, [readOnly]);

  useEffect(() => {
    if (!confirmDel) {
      return undefined;
    }
    const t = window.setTimeout(() => setConfirmDel(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmDel]);

  const set = (patch) => onChange({ ...editing, draft: { ...draft, ...patch } });

  const durOpts = [
    { label: '30分', value: 30 },
    { label: '1时', value: 60 },
    { label: '2时', value: 120 }
  ];

  const recurKey = draft.recurrence === 'keep' || draft.recurrence === 'none'
    ? draft.recurrence
    : draft.recurrence.frequency;
  const recurOpts = ev.hasRecurrence
    ? [['keep', '保持不变'], ['none', '移除重复'], ['daily', '每天'], ['weekdays', '工作日'], ['weekly', '每周'], ['monthly', '每月'], ['yearly', '每年']]
    : [['keep', '不重复'], ['daily', '每天'], ['weekdays', '工作日'], ['weekly', '每周'], ['monthly', '每月'], ['yearly', '每年']];
  const pickRecur = (key) => {
    if (key === 'keep' || key === 'none') {
      set({ recurrence: key });
    } else {
      set({ recurrence: { frequency: key, interval: 1 } });
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };

  // 冲突/通勤检查(排除自身)
  const probeStart = instance.isAllDay ? null : toMin(draft.time);
  const dayList = (byDay && byDay[draft.date]) || [];
  const conflictWith = probeStart == null ? null : dayList.find(
    (it) => !it.isAllDay && it.uid !== instance.uid && it.startMin < probeStart + draft.dur && probeStart < it.startMin + it.durMin
  );
  const commute = probeStart == null || conflictWith ? null : commuteConflict(dayList, probeStart, draft.dur, bufferMin, instance.uid);
  const deferSlot = (conflictWith || commute)
    ? nextFreeSlot(dayList, probeStart, draft.dur, bufferMin, instance.uid)
    : null;

  return (
    <div className="xr-pop" data-side={editing.side || undefined} data-leaving={leaving || undefined} style={{ left: editing.x, top: editing.y, width: 300 }} onKeyDown={handleKey}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="xr-pop-eyebrow">{readOnly ? '日程详情' : '编辑日程'}</span>
        <span className="xr-pop-date">{ev.calendarTitle}{instance.isAllDay ? ' · 全天' : ''}</span>
      </div>
      <input
        ref={inputRef}
        className="xr-pop-title"
        value={draft.title}
        disabled={readOnly}
        placeholder="日程标题"
        onChange={(e) => set({ title: e.target.value })}
        onKeyDown={(e) => { if (e.key === 'Enter') onSave(); }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="date"
          className="xr-pop-time"
          style={{ flex: 1 }}
          value={draft.date}
          disabled={readOnly}
          onChange={(e) => set({ date: e.target.value || draft.date })}
        />
        {!instance.isAllDay ? (
          <input
            type="time"
            className="xr-pop-time"
            value={draft.time}
            disabled={readOnly}
            onChange={(e) => set({ time: e.target.value || draft.time })}
          />
        ) : null}
      </div>
      {!instance.isAllDay ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {durOpts.map((opt) => (
            <button key={opt.value} className="xr-pop-opt" disabled={readOnly} data-on={draft.dur === opt.value} onClick={() => set({ dur: opt.value })}>
              {opt.label}
            </button>
          ))}
          <input
            type="number"
            className="xr-pop-time"
            style={{ width: 58, padding: '0 6px' }}
            min={15}
            step={15}
            value={draft.dur}
            disabled={readOnly}
            onChange={(e) => set({ dur: Math.max(15, Number(e.target.value) || 15) })}
          />
          <span style={{ font: '500 11px var(--xr-sans)', color: '#a89f90' }}>分钟</span>
        </div>
      ) : null}
      {!readOnly && calendars.length ? (
        calendars.length > 3 ? (
          <select
            className="xr-pop-time xr-pop-select"
            value={draft.calendarIdentifier}
            onChange={(e) => set({ calendarIdentifier: e.target.value })}
          >
            {calendars.map((cal) => (
              <option key={cal.identifier} value={cal.identifier}>{cal.title}</option>
            ))}
          </select>
        ) : (
          <div style={{ display: 'flex', gap: 5 }}>
            {calendars.map((cal) => (
              <button
                key={cal.identifier}
                className="xr-pop-cat"
                data-on={draft.calendarIdentifier === cal.identifier}
                onClick={() => set({ calendarIdentifier: cal.identifier })}
              >
                <i style={{ background: cal.color }} />{cal.title}
              </button>
            ))}
          </div>
        )
      ) : null}
      <textarea
        className="xr-pop-notes"
        value={draft.notes}
        disabled={readOnly}
        placeholder="备注…"
        rows={2}
        onChange={(e) => set({ notes: e.target.value })}
      />
      {!readOnly ? (
        <>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {recurOpts.map(([key, label]) => (
              <button key={key} className="xr-pop-opt" style={{ height: 24, padding: '0 7px', fontSize: 10 }} data-on={recurKey === key} onClick={() => pickRecur(key)}>
                {label}
              </button>
            ))}
          </div>
          {recurKey !== 'keep' && recurKey !== 'none' ? (
            <div className="xr-pop-warn" style={{ background: 'rgba(224,146,95,0.14)', color: '#ecbf9a' }}>
              重复规则将应用于此日程及以后
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 5 }}>
            <button className="xr-pop-cat" data-on={draft.pri} onClick={() => set({ pri: !draft.pri })}>
              <i style={{ background: RED }} />高优先级（!高）
            </button>
          </div>
        </>
      ) : (
        <div className="xr-pop-warn" style={{ background: 'rgba(255,255,255,0.06)', color: '#a89f90' }}>
          订阅日历只读，仅可查看或转为待办
        </div>
      )}
      {!readOnly && (conflictWith || commute) ? (
        <div className="xr-pop-warn xr-pop-warn-row">
          <span style={{ flex: 1, minWidth: 0 }}>
            {MINI_ICONS.warn}{' '}
            {conflictWith
              ? `与「${conflictWith.title}」重叠`
              : `与「${commute.title}」间隔仅 ${commute.gap} 分钟，注意通勤`}
          </span>
          {deferSlot != null && deferSlot !== probeStart ? (
            <button className="xr-pop-defer" onClick={() => set({ time: fromMin(deferSlot) })}>
              顺延到 {fromMin(deferSlot)}
            </button>
          ) : null}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        {!readOnly ? (
          <button
            className="xr-pop-cancel xr-pop-danger"
            data-armed={confirmDel}
            style={{ flex: 'none', padding: '0 10px' }}
            onClick={() => (confirmDel ? onDelete() : setConfirmDel(true))}
          >
            {confirmDel ? '确认删除?' : '删除'}
          </button>
        ) : null}
        <button className="xr-pop-cancel" style={{ flex: 'none', padding: '0 10px' }} onClick={onConvertTodo}>转待办</button>
        <button className="xr-pop-cancel" style={{ flex: 'none', padding: '0 10px' }} title="在 Apple Calendar 中查看" onClick={onReveal}>{MINI_ICONS.arrowOut}</button>
        <button className="xr-pop-cancel" style={{ flex: 1 }} onClick={onCancel}>取消</button>
        {!readOnly ? <button className="xr-pop-save" onClick={onSave}>保存</button> : null}
      </div>
    </div>
  );
}

function ConflictResolutionDialog({ plan, leaving, onCancel, onConfirm }) {
  const date = parseKey(plan.dateKey);
  return (
    <>
      <div className="xr-span-backdrop" data-leaving={leaving || undefined} onClick={onCancel} />
      <div className="xr-pop xr-span-dialog xr-conflict-dialog" data-leaving={leaving || undefined}>
        <div className="xr-pop-eyebrow">冲突调整预览</div>
        <div className="xr-conflict-dialog__date">{date.getMonth() + 1}月{date.getDate()}日 · 顺延 {plan.shiftMin} 分钟</div>
        <div className="xr-conflict-dialog__pair">
          <span>保持</span>
          <strong>{plan.earlier.title}</strong>
          <small>{fromMin(plan.earlier.startMin)} – {fromMin(plan.earlier.startMin + plan.earlier.durMin)}</small>
        </div>
        <div className="xr-conflict-dialog__pair is-move">
          <span>调整</span>
          <strong>{plan.later.title}</strong>
          <small>
            {fromMin(plan.oldStartMin)} – {fromMin(plan.oldStartMin + plan.later.durMin)}
            {' → '}
            {fromMin(plan.newStartMin)} – {fromMin(plan.newStartMin + plan.later.durMin)}
          </small>
        </div>
        <div className="xr-conflict-dialog__note">确认后才会写入 Apple Calendar；重复日程仍会询问作用范围。</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
          <button className="xr-pop-cancel" onClick={onCancel}>取消</button>
          <button className="xr-pop-save" onClick={onConfirm}>确认调整</button>
        </div>
      </div>
    </>
  );
}

// 重复日程变更范围确认
function SpanDialog({ message, leaving, onPick }) {
  return (
    <>
      <div className="xr-span-backdrop" data-leaving={leaving || undefined} onClick={() => onPick(null)} />
      <div className="xr-pop xr-span-dialog" data-leaving={leaving || undefined}>
        <div className="xr-pop-eyebrow">重复日程</div>
        <div className="xr-span-msg">{message}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
          <button className="xr-pop-cancel" onClick={() => onPick(null)}>取消</button>
          <button className="xr-pop-cancel" style={{ borderColor: 'var(--xr-accent)', color: '#ecbf9a' }} onClick={() => onPick('this')}>仅此日程</button>
          <button className="xr-pop-save" onClick={() => onPick('future')}>此日程及以后</button>
        </div>
      </div>
    </>
  );
}

export default Workbench;
