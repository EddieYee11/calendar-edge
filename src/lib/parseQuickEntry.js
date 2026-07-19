// 自然语言快速录入解析:「周四 15:00 评审 !高」→ 日期 / 时间 / 时长 / 优先级
// 供日程创建浮层与待办输入共用。命中的片段会从标题中剥离。

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

const WEEKDAY_MAP = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
const REL_DAY_MAP = { 今天: 0, 明天: 1, 后天: 2, 大后天: 3 };

function dateLabel(dateKey, todayKey) {
  const rel = { [todayKey]: '今天', [addDaysKey(todayKey, 1)]: '明天', [addDaysKey(todayKey, 2)]: '后天' }[dateKey];
  const d = parseKey(dateKey);
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  return rel ? `${rel} ${wd}` : `${d.getMonth() + 1}/${d.getDate()} ${wd}`;
}

export function parseQuickEntry(raw, todayKey) {
  let title = (raw || '').trim();
  const tokens = [];
  let pri = null;
  let dateKey = null;
  let time = null;
  let durMin = null;

  const strip = (match) => {
    title = title.replace(match, ' ');
  };

  // 优先级 !高 / !中 / !低
  const priMatch = title.match(/[!！](高|中|低)/);
  if (priMatch) {
    pri = { 高: 'high', 中: 'mid', 低: 'low' }[priMatch[1]];
    title = title.replace(/[!！](高|中|低)/g, ' ');
  }

  // 相对日:大后天 需先于 后天 匹配
  const relMatch = title.match(/大后天|后天|明天|今天/);
  if (relMatch) {
    dateKey = addDaysKey(todayKey, REL_DAY_MAP[relMatch[0]]);
    strip(relMatch[0]);
  }

  // 绝对日期:7月20日 / 7/20 / 7-20(过期滚到明年)
  if (!dateKey) {
    const absMatch = title.match(/(?<!\d)(\d{1,2})\s*(?:月\s*(\d{1,2})\s*[日号]?|[/-](\d{1,2}))(?!\d)/);
    if (absMatch) {
      const month = Number(absMatch[1]);
      const day = Number(absMatch[2] || absMatch[3]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const today = parseKey(todayKey);
        let candidate = new Date(today.getFullYear(), month - 1, day);
        if (fmtKey(candidate) < todayKey) {
          candidate = new Date(today.getFullYear() + 1, month - 1, day);
        }
        dateKey = fmtKey(candidate);
        strip(absMatch[0]);
      }
    }
  }

  // 周X / 星期X / 礼拜X(取未来最近一次;前缀「下」加一周)
  if (!dateKey) {
    const wdMatch = title.match(/(下)?\s*(?:周|星期|礼拜)([一二三四五六日天])/);
    if (wdMatch) {
      const target = WEEKDAY_MAP[wdMatch[2]];
      const todayDow = parseKey(todayKey).getDay();
      let diff = (target - todayDow + 7) % 7;
      if (diff === 0) {
        diff = 7;
      }
      if (wdMatch[1]) {
        diff += 7;
      }
      dateKey = addDaysKey(todayKey, diff);
      strip(wdMatch[0]);
    }
  }

  // 时刻:15:00 或 下午3点半 / 晚上8点 / 9点15分
  const clockMatch = title.match(/(?<!\d)(\d{1,2}):(\d{2})(?!\d)/);
  if (clockMatch && Number(clockMatch[1]) < 24 && Number(clockMatch[2]) < 60) {
    time = `${pad2(Number(clockMatch[1]))}:${clockMatch[2]}`;
    strip(clockMatch[0]);
  } else {
    const cnMatch = title.match(/(凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2})\s*点\s*(半|一刻|三刻|(\d{1,2})\s*分?)?/);
    if (cnMatch && Number(cnMatch[2]) <= 24) {
      let hour = Number(cnMatch[2]);
      const meridiem = cnMatch[1];
      if ((meridiem === '下午' || meridiem === '晚上') && hour < 12) {
        hour += 12;
      } else if (meridiem === '中午' && hour < 11) {
        hour += 12;
      }
      let minute = 0;
      if (cnMatch[3] === '半') {
        minute = 30;
      } else if (cnMatch[3] === '一刻') {
        minute = 15;
      } else if (cnMatch[3] === '三刻') {
        minute = 45;
      } else if (cnMatch[4]) {
        minute = Math.min(59, Number(cnMatch[4]));
      }
      if (hour < 24) {
        time = `${pad2(hour)}:${pad2(minute)}`;
        strip(cnMatch[0]);
      }
    }
  }

  // 时长:1.5小时 / 2h / 90分钟(需在时刻解析后,避免吃掉「3点30分」)
  const hourMatch = title.match(/(\d+(?:\.\d+)?)\s*(?:个)?\s*(?:小时|h)(?![a-z])/i);
  if (hourMatch) {
    durMin = Math.round(Number(hourMatch[1]) * 60);
    strip(hourMatch[0]);
  } else {
    const minMatch = title.match(/(\d{1,3})\s*分钟/);
    if (minMatch) {
      durMin = Number(minMatch[1]);
      strip(minMatch[0]);
    }
  }

  title = title.replace(/\s{2,}/g, ' ').trim();

  if (dateKey) {
    tokens.push({ kind: 'date', label: dateLabel(dateKey, todayKey) });
  }
  if (time) {
    tokens.push({ kind: 'time', label: time });
  }
  if (durMin) {
    tokens.push({ kind: 'dur', label: durMin % 60 === 0 ? `${durMin / 60}小时` : `${durMin}分钟` });
  }
  if (pri) {
    tokens.push({ kind: 'pri', label: `!${{ high: '高', mid: '中', low: '低' }[pri]}` });
  }

  return { title, pri, dateKey, time, durMin, tokens };
}
