import React, { useEffect, useMemo, useState } from 'react';
import { createMockSnapshot } from './mockSnapshot';

const POLL_INTERVAL_MS = 30_000;

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

function isSameDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
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

function buildViewModel(snapshot, now) {
  const events = sortEvents(snapshot.events || []);
  const reminders = sortReminders((snapshot.reminders || []).filter((item) => !item.completed));

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
    hasAnyTodayContent
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

function getMeetingActionLabel(url) {
  if (!url) {
    return '加入';
  }

  if (url.includes('zoom')) {
    return '加入 Zoom';
  }

  if (url.includes('feishu')) {
    return '加入飞书会议';
  }

  if (url.includes('tencent')) {
    return '加入腾讯会议';
  }

  if (url.includes('meet.google')) {
    return '加入 Meet';
  }

  return '加入会议';
}

function App() {
  const [tab, setTab] = useState('today');
  const [snapshot, setSnapshot] = useState(null);
  const [now, setNow] = useState(new Date());
  const [expandedPast, setExpandedPast] = useState(false);
  const [pendingReminderIds, setPendingReminderIds] = useState({});

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        postNativeMessage('close');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    window.CalendarEdgeNative = {
      receiveSnapshot(nextSnapshot) {
        setSnapshot(nextSnapshot);
        setPendingReminderIds({});
      }
    };

    const bridged = postNativeMessage('ready');
    if (!bridged) {
      setSnapshot(createMockSnapshot());
    }

    return () => {
      if (window.CalendarEdgeNative?.receiveSnapshot) {
        delete window.CalendarEdgeNative;
      }
    };
  }, []);

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

  const calendarPermission = snapshot?.permissions?.calendar || { granted: false, message: '正在检查日历权限…' };
  const remindersPermission = snapshot?.permissions?.reminders || { granted: false, message: '正在检查提醒事项权限…' };

  function handleRefresh() {
    postNativeMessage('refresh');
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

  if (!snapshot || !model) {
    return (
      <div className="app-shell">
        <div className="loading-card">
          <div className="loading-title">正在载入你的扫视面板</div>
          <div className="loading-subtitle">正在连接日历与提醒事项…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="header-title">{formatChineseDate(now)}</div>
          <div className="header-subtitle">{formatClock(now)} · 只回答一个问题：我现在和接下来该做什么</div>
        </div>
        <div className="header-actions">
          <button className="ghost-button" onClick={handleRefresh}>刷新</button>
          <button className="ghost-button" onClick={() => postNativeMessage('openCalendarApp')}>打开日历</button>
          <button className="ghost-button" onClick={() => postNativeMessage('openRemindersApp')}>打开提醒事项</button>
        </div>
      </header>

      <div className="tabs">
        {[
          { id: 'today', label: '今天' },
          { id: 'next', label: '接下来' },
          { id: 'tasks', label: '待办全貌' }
        ].map((item) => (
          <button
            key={item.id}
            className={`tab-button ${tab === item.id ? 'is-active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <main className="view-scroll">
        {tab === 'today' && (
          <section className="view-stack">
            {hero ? (
              <HeroCard hero={hero} now={now} onOpen={handleEventOpen} onJoin={handleJoin} />
            ) : (
              <EmptyCard
                title="今天空了"
                subtitle="现在没有正在进行或即将开始的日程，安心把注意力留给手头的事情。"
              />
            )}

            <SectionHeader
              title="今天剩余的日程"
              meta={model.remainingEvents.length ? `${model.remainingEvents.length} 项待关注` : '今天没有后续日程'}
            />

            {!calendarPermission.granted ? (
              <PermissionCard title="无法读取日历" message={calendarPermission.message} />
            ) : (
              <div className="panel-section">
                {model.pastEvents.length > 0 && (
                  <button className="history-toggle" onClick={() => setExpandedPast((value) => !value)}>
                    {expandedPast ? '收起已过去事项' : `查看已过去 ${model.pastEvents.length} 项`}
                  </button>
                )}

                {expandedPast &&
                  model.pastEvents.map((event) => (
                    <TimelineRow key={event.identifier} event={event} muted onOpen={handleEventOpen} onJoin={handleJoin} />
                  ))}

                {model.remainingEvents.length === 0 ? (
                  <EmptyInlineCard title="今天后面没有新的日程了" subtitle="这是一段很稀缺的空档，尽量留给深度工作或休息。" />
                ) : (
                  model.remainingEvents.map((event) => (
                    <TimelineRow
                      key={event.identifier}
                      event={event}
                      active={hero?.event?.identifier === event.identifier && hero.type === 'now'}
                      onOpen={handleEventOpen}
                      onJoin={handleJoin}
                    />
                  ))
                )}
              </div>
            )}

            <SectionHeader
              title="今天的提醒事项"
              meta={model.todayReminders.length ? `${model.todayReminders.length} 项待处理` : '今天的提醒已经清空'}
            />

            {!remindersPermission.granted ? (
              <PermissionCard title="无法读取提醒事项" message={remindersPermission.message} />
            ) : (
              <div className="panel-section">
                {model.todayReminders.length === 0 ? (
                  <EmptyInlineCard title="今天的提醒已经清空了" subtitle="没有逾期项，也没有今天到期的任务。" />
                ) : (
                  model.todayReminders.map((item) => (
                    <ReminderRow
                      key={item.identifier}
                      item={item}
                      pending={Boolean(pendingReminderIds[item.identifier])}
                      onToggle={handleReminderToggle}
                      onOpen={handleReminderOpen}
                    />
                  ))
                )}
              </div>
            )}
          </section>
        )}

        {tab === 'next' && (
          <section className="view-stack">
            <SectionHeader title="未来几天" meta={model.nextDays.length ? '未来 7 天概览' : '未来一周很安静'} />

            {!calendarPermission.granted ? (
              <PermissionCard title="无法读取日历" message={calendarPermission.message} />
            ) : model.nextDays.length === 0 ? (
              <EmptyCard title="接下来很空" subtitle="未来 7 天里没有新的日程安排。" />
            ) : (
              model.nextDays.map((group) => (
                <div key={group.id} className="day-group">
                  <div className="day-group__header">
                    <div className="day-group__title">{group.title}</div>
                    <div className="day-group__subtitle">{group.subtitle}</div>
                  </div>
                  <div className="day-group__items">
                    {group.items.map((event) => (
                      <NextRow key={event.identifier} event={event} onOpen={handleEventOpen} onJoin={handleJoin} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        {tab === 'tasks' && (
          <section className="view-stack">
            <SectionHeader title="待办全貌" meta={model.groupedTasks.length ? '按提醒列表分组' : '暂无未完成任务'} />

            {!remindersPermission.granted ? (
              <PermissionCard title="无法读取提醒事项" message={remindersPermission.message} />
            ) : model.groupedTasks.length === 0 ? (
              <EmptyCard title="任务池很干净" subtitle="当前没有未完成的提醒事项。" />
            ) : (
              model.groupedTasks.map((group) => (
                <div key={group.id} className="task-group">
                  <div className="task-group__header">
                    <div className="task-group__badge" style={{ background: group.color }} />
                    <div className="task-group__title">{group.title}</div>
                    <div className="task-group__meta">{group.items.length} 项未完成</div>
                  </div>
                  <div className="task-group__items">
                    {group.items.map((item) => (
                      <ReminderRow
                        key={item.identifier}
                        item={item}
                        pending={Boolean(pendingReminderIds[item.identifier])}
                        onToggle={handleReminderToggle}
                        onOpen={handleReminderOpen}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>
        )}
      </main>

      <footer className="app-footer">
        <span>鼠标离开自动收起 · 点击事项跳回原生应用</span>
        <span><kbd>Esc</kbd> 关闭</span>
      </footer>
    </div>
  );
}

function HeroCard({ hero, now, onOpen, onJoin }) {
  const event = hero.event;
  const start = toDate(event.startAt);
  const end = toDate(event.endAt);
  const label = hero.type === 'now' ? '当前进行中' : '下一件事';

  return (
    <div className={`hero-card ${hero.type === 'now' ? 'is-live' : ''}`} {...interactiveProps(() => onOpen(event))}>
      <div className="hero-accent" style={{ background: event.calendarColor }} />
      <div className="hero-topline">
        <span className={`hero-status ${hero.type === 'now' ? 'is-live' : ''}`}>{label}</span>
        <span className="hero-eyebrow">{hero.eyebrow}</span>
      </div>
      <div className="hero-title">{event.title}</div>
      <div className="hero-meta">
        <span>{event.isAllDay ? '全天' : `${formatTime(start)} - ${formatTime(end)}`}</span>
        <span>{event.calendarTitle}</span>
        {event.location ? <span>{event.location}</span> : null}
      </div>

      {hero.type === 'now' ? (
        <div className="hero-progress">
          <div className="hero-progress__bar" style={{ width: `${hero.progress * 100}%` }} />
        </div>
      ) : null}

      {event.joinURL ? (
        <div className="hero-actions">
          <button
            className="join-button"
            onClick={(nativeEvent) => {
              nativeEvent.stopPropagation();
              onJoin(event.joinURL);
            }}
          >
            {getMeetingActionLabel(event.joinURL)}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TimelineRow({ event, muted = false, active = false, onOpen, onJoin }) {
  const start = toDate(event.startAt);
  const end = toDate(event.endAt);

  return (
    <div className={`timeline-row ${muted ? 'is-muted' : ''} ${active ? 'is-active' : ''}`} {...interactiveProps(() => onOpen(event))}>
      <div className="timeline-row__time">{event.isAllDay ? '全天' : formatTime(start)}</div>
      <div className="timeline-row__rail">
        <span className="timeline-row__dot" style={{ background: event.calendarColor }} />
      </div>
      <div className="timeline-row__content">
        <div className="timeline-row__title">{event.title}</div>
        <div className="timeline-row__meta">
          <span>{event.isAllDay ? '全天' : `${formatTime(start)} - ${formatTime(end)}`}</span>
          <span>{event.calendarTitle}</span>
          {event.location ? <span>{event.location}</span> : null}
        </div>
      </div>
      {event.joinURL ? (
        <button
          className="row-action"
          onClick={(nativeEvent) => {
            nativeEvent.stopPropagation();
            onJoin(event.joinURL);
          }}
        >
          加入
        </button>
      ) : null}
    </div>
  );
}

function ReminderRow({ item, pending, onToggle, onOpen }) {
  return (
    <div className="reminder-row" {...interactiveProps(() => onOpen(item))}>
      <button
        className={`reminder-check ${item.completed ? 'is-done' : ''} ${item.isOverdue ? 'is-overdue' : ''}`}
        disabled={pending}
        onClick={(nativeEvent) => {
          nativeEvent.stopPropagation();
          onToggle(item);
        }}
      >
        {pending ? '…' : item.completed ? '✓' : ''}
      </button>

      <div className="reminder-row__content">
        <div className="reminder-row__title">{item.title}</div>
        <div className="reminder-row__meta">
          <span>{item.listTitle}</span>
          {item.dueAt ? <span>{item.isOverdue ? '已逾期' : formatShortDate(toDate(item.dueAt))}</span> : <span>无日期</span>}
        </div>
      </div>
    </div>
  );
}

function NextRow({ event, onOpen, onJoin }) {
  const start = toDate(event.startAt);

  return (
    <div className="next-row" {...interactiveProps(() => onOpen(event))}>
      <div className="next-row__time">{event.isAllDay ? '全天' : formatTime(start)}</div>
      <div className="next-row__dot" style={{ background: event.calendarColor }} />
      <div className="next-row__content">
        <div className="next-row__title">{event.title}</div>
        <div className="next-row__meta">{event.calendarTitle}</div>
      </div>
      {event.joinURL ? (
        <button
          className="row-action"
          onClick={(nativeEvent) => {
            nativeEvent.stopPropagation();
            onJoin(event.joinURL);
          }}
        >
          加入
        </button>
      ) : null}
    </div>
  );
}

function SectionHeader({ title, meta }) {
  return (
    <div className="section-header">
      <div className="section-header__title">{title}</div>
      <div className="section-header__meta">{meta}</div>
    </div>
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
