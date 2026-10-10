// Turns a typed sentence into an item: "Robotics report due Sunday 11pm" -> assignment, Sun 11 Oct, 23:00.
// Works in the browser and in Node (for tests). English; day first for numeric dates (12.10. = 12 October).
(function (root) {
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const WEEKDAYS = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
  const MONTHS = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
  const ASSIGNMENT = /\b(assignment|essay|report|exam|quiz|test|homework|project|deadline|due|submit|submission|paper|thesis|presentation|lab|coursework)\b/i;
  const EVENT = /\b(meeting|lecture|call|appointment|seminar|class|dinner|lunch|breakfast|party|gym|session|workshop|interview|concert|trip|flight|dentist|doctor|training|practice|date)\b/i;
  const day = (y, m, d) => new Date(y, m, d);
  const addDays = (d, n) => day(d.getFullYear(), d.getMonth(), d.getDate() + n);

  // Removes the first match of a pattern from the text and hands back what it captured.
  function take(state, re) { const m = re.exec(state.text); if (!m) return null; state.text = (state.text.slice(0, m.index) + ' ' + state.text.slice(m.index + m[0].length)); return m; }

  function parseQuick(input, { now = new Date(), categories = [] } = {}) {
    const st = { text: ` ${String(input)} ` }, out = { title: '', type: null, date: '', time: '', category: '', repeat: '', found: [] };
    const today = day(now.getFullYear(), now.getMonth(), now.getDate());
    let m;

    // ---- repeat ----
    if ((m = take(st, /\bevery\s+(day|week|month)\b|\b(daily|weekly|monthly)\b/i))) { const w = (m[1] || m[2]).toLowerCase(); out.repeat = w.startsWith('day') ? 'daily' : w.startsWith('week') ? 'weekly' : 'monthly'; out.found.push('repeat'); }
    let repeatDay = null;
    if ((m = take(st, /\bevery\s+(sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)[a-z]*\b/i))) { repeatDay = WEEKDAYS[m[1].toLowerCase()]; out.repeat = 'weekly'; out.found.push('repeat'); }

    // ---- time ----
    let hour = null, min = 0;
    const setTime = (h, mi, ap) => {
      h = +h; mi = +(mi || 0);
      if (ap) { ap = ap.toLowerCase(); if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; }
      else if (h >= 1 && h <= 6 && !(mi === 0 && false)) h += 12; // nobody means 3 in the morning
      if (h > 23 || mi > 59) return false;
      hour = h; min = mi; return true;
    };
    if ((m = take(st, /\b(midnight)\b/i))) { hour = 23; min = 59; }
    else if ((m = take(st, /\b(noon|midday)\b/i))) { hour = 12; min = 0; }
    else if ((m = take(st, /\b(?:at|by|before|until|klo)?\s*(\d{1,2}):(\d{2})\s*(am|pm)?\b/i))) { if (!setTime(m[1], m[2], m[3])) st.text += m[0]; }
    else if ((m = take(st, /\b(?:at|by|before|until)?\s*(\d{1,2})\s*(am|pm)\b/i))) { if (!setTime(m[1], 0, m[2])) st.text += m[0]; }
    else if ((m = take(st, /\b(?:at|by|before|until|klo)\s*(\d{1,2})[.](\d{2})\b/i)) || (m = take(st, /(?<![\d.])(1[3-9]|2[0-3])[.]([0-5]\d)(?![\d.])/))) { if (!setTime(m[1], m[2])) st.text += m[0]; }
    else if ((m = take(st, /\b(?:at|by|before|until)\s+(\d{1,2})\b(?!\s*(?:st|nd|rd|th|\/|\.))/i))) { if (!setTime(m[1], 0)) st.text += m[0]; }
    if (hour !== null) out.found.push('time');
    if ((m = take(st, /\b(?:in\s+)?(\d+)\s*(?:hours?|hrs?|h)\s+(?:from now|later)?\b|\bin\s+(\d+)\s*(?:hours?|hrs?|h)\b/i)) && (m[1] || m[2])) {
      const t = new Date(now.getTime() + (+(m[1] || m[2])) * 3600000); out.date = ymd(t); hour = t.getHours(); min = t.getMinutes(); out.found.push('time', 'date');
    }

    // ---- date ----
    const setDate = (d) => { out.date = ymd(d); out.found.push('date'); };
    const futureOf = (mo, d, y) => { // a day and month with no year: this year, or next if it already passed
      let c = day(y ?? now.getFullYear(), mo, d);
      if (y === undefined && c < today) c = day(now.getFullYear() + 1, mo, d);
      return c.getMonth() === mo ? c : null;
    };
    if (!out.date) {
      if ((m = take(st, /\b(\d{4})-(\d{2})-(\d{2})\b/))) setDate(day(+m[1], +m[2] - 1, +m[3]));
      else if ((m = take(st, /\bday after tomorrow\b/i))) setDate(addDays(today, 2));
      else if ((m = take(st, /\b(tomorrow|tmrw|tmr)\b/i))) setDate(addDays(today, 1));
      else if ((m = take(st, /\b(tonight)\b/i))) { setDate(today); if (hour === null) { hour = 20; min = 0; out.found.push('time'); } }
      else if ((m = take(st, /\b(today)\b/i))) setDate(today);
      else if ((m = take(st, /\bin\s+(\d+)\s*(day|week|month)s?\b/i))) { const n = +m[1]; setDate(m[2].toLowerCase() === 'day' ? addDays(today, n) : m[2].toLowerCase() === 'week' ? addDays(today, 7 * n) : day(today.getFullYear(), today.getMonth() + n, today.getDate())); }
      else if ((m = take(st, /\b(?:end of (?:the )?week|eow)\b/i))) setDate(addDays(today, (5 - today.getDay() + 7) % 7 || 7));
      else if ((m = take(st, /\bnext\s+week\b/i))) setDate(addDays(today, 7 - ((today.getDay() + 6) % 7)));
      else if ((m = take(st, /\b(?:(next|this|on)\s+)?(sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)(?:day|sday|nesday|rsday|urday)?\b/i))) {
        const wd = WEEKDAYS[m[2].toLowerCase()];
        let n = (wd - today.getDay() + 7) % 7;
        if (n === 0 && !(m[1] || '').toLowerCase().startsWith('th')) n = 0;
        if ((m[1] || '').toLowerCase() === 'next') { const monday = addDays(today, -((today.getDay() + 6) % 7)); n = (n + (addDays(today, n) < addDays(monday, 7) ? 7 : 0)); }
        setDate(addDays(today, n));
      }
      else if ((m = take(st, /\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?\b/i))) { const c = futureOf(MONTHS[m[2].toLowerCase()], +m[1], m[3] ? +m[3] : undefined); if (c) setDate(c); else st.text += m[0]; }
      else if ((m = take(st, /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4}))?/i))) { const c = futureOf(MONTHS[m[1].toLowerCase()], +m[2], m[3] ? +m[3] : undefined); if (c) setDate(c); else st.text += m[0]; }
      else if ((m = take(st, /(?<![\d.])(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\.?(?![\d:])/))) {
        const d = +m[1], mo = +m[2] - 1; let y = m[3] ? +m[3] : undefined; if (y !== undefined && y < 100) y += 2000;
        const c = mo >= 0 && mo <= 11 && d >= 1 && d <= 31 ? futureOf(mo, d, y) : null;
        if (c) setDate(c); else st.text += m[0];
      }
    }
    if (repeatDay !== null && !out.date) { setDate(addDays(today, (repeatDay - today.getDay() + 7) % 7)); }
    if (hour !== null) out.time = `${pad(hour)}:${pad(min)}`;

    // ---- course / category ----
    for (const c of categories) {
      const name = c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // "#study" or "for study" is a tag: it is removed. A course name that is just a word in the title is left where it is.
      if (take(st, new RegExp(`(?:#|\\bfor\\s+)${name}\\b`, 'i')) || new RegExp(`\\b${name}\\b`, 'i').test(st.text)) { out.category = c.name; out.found.push('course'); break; }
    }

    // ---- type ----
    const original = String(input);
    if (/\b(due|deadline|submit)\b/i.test(original) || ASSIGNMENT.test(original)) out.type = 'assignment';
    else if ((EVENT.test(original) && (out.date || out.time)) || (out.time && out.date && !/\b(buy|get|pick|remember|finish|write|read|clean|pay)\b/i.test(original))) out.type = 'event';
    else if (out.found.length || /\w/.test(original)) out.type = out.date ? null : 'todo';
    if (/\b(due|deadline|submit)\b/i.test(original) && !out.time && out.type === 'assignment') { /* the app fills in the usual due time */ }

    // ---- title ----
    let title = st.text.replace(/\b(due|deadline|on|at|by|for|in|until|before|next|this|every|the)\b(?=\s*$)/gi, '').replace(/^\s*\b(due|on|at|by|for)\b/i, '');
    title = title.replace(/\s+/g, ' ').replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '').replace(/\b(due|by|on|at)\s*$/i, '').trim();
    out.title = title || original.trim();
    out.title = out.title.charAt(0).toUpperCase() + out.title.slice(1);
    return out;
  }

  // A short label for the preview: "Assignment · Sun 11 Oct, 23:00 · Study".
  function describe(q) {
    const names = { assignment: 'Assignment', event: 'Event', todo: 'To-do' }, DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const parts = [];
    if (q.type) parts.push(names[q.type]);
    if (q.date) { const d = new Date(q.date + 'T00:00'); parts.push(`${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}${q.time ? ', ' + q.time : ''}`); }
    else if (q.time) parts.push(q.time);
    if (q.repeat) parts.push('repeats ' + q.repeat);
    if (q.category) parts.push(q.category);
    return parts.join(' · ');
  }

  const api = { parseQuick, describe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Quick = api;
})(typeof window !== 'undefined' ? window : globalThis);
