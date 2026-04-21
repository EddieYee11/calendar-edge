function isoAt(base, hour, minute = 0) {
  const date = new Date(base);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

export function createMockSnapshot() {
  const now = new Date();
  now.setHours(14, 12, 0, 0);

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const day2 = new Date(now);
  day2.setDate(day2.getDate() + 2);

  const day3 = new Date(now);
  day3.setDate(day3.getDate() + 3);

  return {
    fetchedAt: new Date().toISOString(),
    permissions: {
      calendar: { granted: true, message: '' },
      reminders: { granted: true, message: '' }
    },
    events: [
      {
        identifier: 'event-1',
        externalIdentifier: 'event-ext-1',
        title: '晨间拉伸',
        calendarTitle: '健康',
        calendarColor: '#8ab0d1',
        startAt: isoAt(now, 7, 30),
        endAt: isoAt(now, 8, 0),
        location: '',
        joinURL: '',
        isAllDay: false
      },
      {
        identifier: 'event-2',
        externalIdentifier: 'event-ext-2',
        title: '团队站会',
        calendarTitle: '工作',
        calendarColor: '#e59373',
        startAt: isoAt(now, 9, 30),
        endAt: isoAt(now, 9, 45),
        location: 'Zoom',
        joinURL: 'https://meet.zoom.us/j/123',
        isAllDay: false
      },
      {
        identifier: 'event-3',
        externalIdentifier: 'event-ext-3',
        title: '设计评审 · SlidePad',
        calendarTitle: '工作',
        calendarColor: '#e59373',
        startAt: isoAt(now, 14, 0),
        endAt: isoAt(now, 15, 0),
        location: '',
        joinURL: 'https://meet.feishu.cn/example',
        isAllDay: false
      },
      {
        identifier: 'event-4',
        externalIdentifier: 'event-ext-4',
        title: '和 Alex 的 1:1',
        calendarTitle: '工作',
        calendarColor: '#e59373',
        startAt: isoAt(now, 15, 30),
        endAt: isoAt(now, 16, 0),
        location: '',
        joinURL: '',
        isAllDay: false
      },
      {
        identifier: 'event-5',
        externalIdentifier: 'event-ext-5',
        title: '妈妈生日晚餐',
        calendarTitle: '家庭',
        calendarColor: '#ce9ab6',
        startAt: isoAt(now, 19, 30),
        endAt: isoAt(now, 21, 0),
        location: '小南国',
        joinURL: '',
        isAllDay: false
      },
      {
        identifier: 'event-6',
        externalIdentifier: 'event-ext-6',
        title: '全员会',
        calendarTitle: '工作',
        calendarColor: '#e59373',
        startAt: isoAt(tomorrow, 9, 0),
        endAt: isoAt(tomorrow, 10, 0),
        location: '',
        joinURL: '',
        isAllDay: false
      },
      {
        identifier: 'event-7',
        externalIdentifier: 'event-ext-7',
        title: '年度体检',
        calendarTitle: '健康',
        calendarColor: '#8ab0d1',
        startAt: isoAt(day2, 0, 0),
        endAt: isoAt(day2, 23, 59),
        location: '',
        joinURL: '',
        isAllDay: true
      },
      {
        identifier: 'event-8',
        externalIdentifier: 'event-ext-8',
        title: 'Hermes v2 评审',
        calendarTitle: '工作',
        calendarColor: '#e59373',
        startAt: isoAt(day2, 15, 0),
        endAt: isoAt(day2, 16, 0),
        location: '',
        joinURL: '',
        isAllDay: false
      },
      {
        identifier: 'event-9',
        externalIdentifier: 'event-ext-9',
        title: '客户访谈',
        calendarTitle: '工作',
        calendarColor: '#e59373',
        startAt: isoAt(day3, 10, 0),
        endAt: isoAt(day3, 11, 0),
        location: '',
        joinURL: '',
        isAllDay: false
      }
    ],
    reminders: [
      {
        identifier: 'reminder-1',
        externalIdentifier: 'reminder-ext-1',
        title: '回复 Jordan 的文档',
        listIdentifier: 'work',
        listTitle: '工作',
        listColor: '#e59373',
        dueAt: isoAt(now, 18, 0),
        completed: false,
        isOverdue: false
      },
      {
        identifier: 'reminder-2',
        externalIdentifier: 'reminder-ext-2',
        title: '提交 Q1 报销单',
        listIdentifier: 'work',
        listTitle: '工作',
        listColor: '#e59373',
        dueAt: isoAt(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), 17, 0),
        completed: false,
        isOverdue: true
      },
      {
        identifier: 'reminder-3',
        externalIdentifier: 'reminder-ext-3',
        title: '预约牙医',
        listIdentifier: 'health',
        listTitle: '健康',
        listColor: '#8ab0d1',
        dueAt: isoAt(now, 20, 0),
        completed: false,
        isOverdue: false
      },
      {
        identifier: 'reminder-4',
        externalIdentifier: 'reminder-ext-4',
        title: '给房东打电话',
        listIdentifier: 'home',
        listTitle: '生活',
        listColor: '#94b57f',
        dueAt: null,
        completed: false,
        isOverdue: false
      },
      {
        identifier: 'reminder-5',
        externalIdentifier: 'reminder-ext-5',
        title: '更新团队 OKR',
        listIdentifier: 'work',
        listTitle: '工作',
        listColor: '#e59373',
        dueAt: isoAt(day3, 18, 0),
        completed: false,
        isOverdue: false
      }
    ]
  };
}
