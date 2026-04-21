/**
 * @typedef {Object} StoryAct
 * @property {string} id
 * @property {string} chapter
 * @property {string} title
 * @property {string} hook
 * @property {string} [support]
 * @property {string[]} [anchors]
 * @property {{label: string, value: string, note?: string}[]} [metrics]
 * @property {{label: string, state?: 'past' | 'agent' | 'result'}[]} [steps]
 * @property {string} durationHint
 * @property {'pinned' | 'flow' | 'mixed'} visualMode
 */

/**
 * @typedef {Object} LifeScenario
 * @property {string} id
 * @property {string} title
 * @property {string} prompt
 * @property {string[]} actions
 * @property {string} outcome
 */

/** @type {StoryAct[]} */
export const storyActs = [
  {
    id: 'intro',
    chapter: 'ACT 01',
    title: '这次不一样',
    hook: 'AI 真的已经到来了，而且这次来得极其猛烈。',
    support: '以前的革命替代体力，这一次直接瞄准智力。',
    anchors: ['工业革命级别', '替代对象改变', '历史判断锚点'],
    steps: [
      { label: '手工' },
      { label: '劳动' },
      { label: '重复性操作' },
      { label: '智力' }
    ],
    durationHint: '200vh',
    visualMode: 'pinned'
  },
  {
    id: 'metrics',
    chapter: 'ACT 02',
    title: '不是概念，是现实',
    hook: '我现在的工作里，40% 已经由 AI 直接完成。',
    support: '不是协助，不是建议，而是独立干完。',
    anchors: ['40% 直接完成', '10 分钟交付', '并发多线程处理'],
    metrics: [
      { label: '直接完成占比', value: '40%', note: '不是辅助，是独立交付' },
      { label: '单任务耗时', value: '10 min', note: '过去要半天到一天' },
      { label: '并发处理', value: 'x 6', note: '同一时间多条任务链运行' }
    ],
    durationHint: '180vh',
    visualMode: 'pinned'
  },
  {
    id: 'misconception',
    chapter: 'ACT 03',
    title: '你可能还没见过真正的 AI',
    hook: '如果认知还停留在问答对话层，你会误判这次变化的烈度。',
    support: '高级搜索不是重点，真正的变化在于它已经开始行动。',
    anchors: ['搜索框心智', '顾问式 AI', '行动链条开启'],
    steps: [
      { label: '浏览', state: 'agent' },
      { label: '理解', state: 'agent' },
      { label: '判断', state: 'agent' },
      { label: '执行', state: 'result' }
    ],
    durationHint: '130vh',
    visualMode: 'flow'
  },
  {
    id: 'workflow',
    chapter: 'ACT 04',
    title: '视频全流程自动化',
    hook: '一条 YouTube 链接进来，素材处理到发布上线都能自主跑完。',
    support: '我的审核环节只剩验收意义，当前通过率已经来到 90%+。',
    anchors: ['旧流程 6 步', '90%+ 通过率', '一句同意发布'],
    metrics: [{ label: '审核通过率', value: '90%+', note: '当前只保留结果检查' }],
    durationHint: '260vh',
    visualMode: 'pinned'
  },
  {
    id: 'social',
    chapter: 'ACT 05',
    title: '社交平台自动运营',
    hook: '它不是帮你点个转发，而是自己浏览、判断、生成并执行。',
    support: '浏览、理解、价值判断、生成措辞、执行操作，整条链路它都接住。',
    anchors: ['浏览动态', '内容价值判断', '转发语自动生成'],
    durationHint: '180vh',
    visualMode: 'pinned'
  },
  {
    id: 'life',
    chapter: 'ACT 06',
    title: '从工作到生活，都跟你有关',
    hook: '如果你觉得这些只和特殊职业有关，那就看生活层面的接管能力。',
    support: '通勤、旅行、家庭协调，本质上也都是信息处理与执行任务。',
    anchors: ['通勤日程', '旅行决策', '家庭预约处理'],
    durationHint: '170vh',
    visualMode: 'mixed'
  },
  {
    id: 'watershed',
    chapter: 'ACT 07',
    title: '真正的分水岭',
    hook: '从“AI 给你答案，你去执行”到“AI 替你执行，你只管验收”。',
    support: '顾问式 AI 和 Agent 式 AI 的差别，不在回答质量，而在落地鸿沟是否被跨过去。',
    anchors: ['问答 AI', '行动 AI', '落地鸿沟消失'],
    durationHint: '210vh',
    visualMode: 'pinned'
  },
  {
    id: 'finale',
    chapter: 'ACT 08',
    title: '这扇门已经打开了',
    hook: '技术上也许只是一小步，但门槛已经从程序员拉到所有人。',
    support: 'AI 不是未来，AI 是现在。这不是焦虑，这是事实。',
    anchors: ['如何迎接', '如何利用', '如果不动会怎样'],
    durationHint: '150vh',
    visualMode: 'pinned'
  }
];

export const misconceptionPanels = [
  {
    id: 'search',
    label: '旧认知 01',
    title: '搜索框',
    body: '问一个问题，拿一段结果，像高级检索。'
  },
  {
    id: 'chat',
    label: '旧认知 02',
    title: '聊天助手',
    body: '会说、会总结、会写点东西，但你还得自己动手。'
  },
  {
    id: 'answer',
    label: '旧认知 03',
    title: '答案生成器',
    body: '它负责输出文字，你负责理解、筛选和执行。'
  }
];

export const workflowComparison = {
  legacy: [
    { label: '寻找素材并下载', state: 'past' },
    { label: '导入剪辑工具生成文案', state: 'past' },
    { label: '贴上频道 Logo', state: 'past' },
    { label: '逐个导出', state: 'past' },
    { label: '逐个上传并写长短文案', state: 'past' },
    { label: '设置定时发布', state: 'past' }
  ],
  agent: [
    { label: '粘贴 YouTube 链接', state: 'agent' },
    { label: '自动抓取素材与生成视频', state: 'agent' },
    { label: '自动填充文案与发布信息', state: 'agent' },
    { label: '人工验收一轮', state: 'result' },
    { label: '一句“同意发布”', state: 'result' },
    { label: '账号自动上线', state: 'result' }
  ]
};

export const workflowCallouts = [
  '大半天到一天 -> 十分钟级交付',
  '我负责看结果，它负责跑流程',
  '素材处理、生成、发布都在后台并行完成'
];

export const socialFeed = [
  {
    id: 'post-a',
    author: '@daily.signal',
    title: '行业新规发布，影响下周投放窗口',
    summary: '内容涉及政策时间点、讨论热度与用户反应。',
    tag: '高价值'
  },
  {
    id: 'post-b',
    author: '@ops.watch',
    title: '竞争对手开始复制同类选题形式',
    summary: '需要判断是否跟进，以及跟进角度。',
    tag: '待判断'
  },
  {
    id: 'post-c',
    author: '@creator.memo',
    title: '一条普通情绪贴，热度高但信息密度低',
    summary: '适合忽略，不应该占用你的执行额度。',
    tag: '跳过'
  },
  {
    id: 'post-d',
    author: '@trend.flow',
    title: '一条能带来增量曝光的趋势串',
    summary: '需要快速生成合适转发语并执行。',
    tag: '立即转发'
  }
];

export const socialActions = [
  '打开平台并扫描信息流',
  '识别高价值内容与语境',
  '生成合适的转发语',
  '直接完成转发操作'
];

export const socialOutput = {
  title: 'Agent Draft',
  body: '这条信息对下周策略有直接影响，先转存并同步关键节点，后续再跟进执行细节。'
};

/** @type {LifeScenario[]} */
export const lifeScenarios = [
  {
    id: 'commute',
    title: '通勤与日程整理',
    prompt: '帮我把今天的会议、路程和待办重新排一下，尽量减少来回折返。',
    actions: ['读取日历', '合并路线', '调整会议顺序', '整理待办提醒'],
    outcome: '你看到的是一版新日程，不是一串建议。'
  },
  {
    id: 'travel',
    title: '旅行计划与比价',
    prompt: '周末去上海，两个人，优先高铁 + 市中心酒店，帮我给出最省心的组合。',
    actions: ['抓取交通班次', '筛选酒店', '比较价格与时间', '输出预订方案'],
    outcome: '不只是推荐，而是帮你把可执行方案收束到一条线。'
  },
  {
    id: 'family',
    title: '家庭琐事与预约处理',
    prompt: '下周给家里安排体检、保洁和维修，尽量放在同一天处理。',
    actions: ['查询可预约时段', '协调冲突时间', '生成沟通文本', '形成统一安排'],
    outcome: '碎片琐事被整理成一个可直接确认的执行包。'
  }
];

export const watershedComparison = {
  left: {
    title: '问答 AI',
    lead: '你提问题，它给答案。',
    steps: ['提问', '拿到答案', '自己理解', '自己执行']
  },
  right: {
    title: '行动 AI',
    lead: '你提需求，它去完成。',
    steps: ['提出目标', '后台拆解任务', '自动操作', '人类验收']
  }
};

export const finalQuestions = ['你要如何迎接 AI？', '你要如何利用 AI？', '如果你不动，AI 会不会替代你？'];
