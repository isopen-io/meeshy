export const DAY = 864e5;
export const TZ = 'Europe/Paris';
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (iso, tz = TZ) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: tz });
export const ymdToUTC = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const utcToYmd = (ms) => new Date(ms).toISOString().slice(0, 10);
export const fmtDay = (s, o) => new Date(ymdToUTC(s)).toLocaleDateString('fr-FR', { timeZone: 'UTC', ...o });
const monthStart = (k) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, 1);
const monthLabel = (k, month) => new Date(monthStart(k)).toLocaleDateString('fr-FR', { month, year: 'numeric', timeZone: 'UTC' });
const roll = (k, sep, max, unit) => { let y = +k.slice(0, 4), n = +k.slice(4 + sep.length) + 1; if (n > max) { n = 1; y++; } return `${y}${sep}${unit(n)}`; };

export const GRAN = {
  day: { name: 'jour', prev: 'la veille', key: (y) => y, start: ymdToUTC, next: (k) => utcToYmd(ymdToUTC(k) + DAY), label: (k) => fmtDay(k, { day: 'numeric', month: 'short' }), long: (k) => fmtDay(k, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) },
  week: { name: 'semaine', prev: 'la semaine précédente', key: (y) => { const t = ymdToUTC(y); return utcToYmd(t - ((new Date(t).getUTCDay() + 6) % 7) * DAY); }, start: ymdToUTC, next: (k) => utcToYmd(ymdToUTC(k) + 7 * DAY), label: (k) => fmtDay(k, { day: 'numeric', month: 'short' }), long: (k) => 'semaine du ' + fmtDay(k, { day: 'numeric', month: 'long', year: 'numeric' }) },
  month: { name: 'mois', prev: 'le mois précédent', key: (y) => y.slice(0, 7), start: monthStart, next: (k) => roll(k, '-', 12, pad), label: (k) => monthLabel(k, 'short'), long: (k) => monthLabel(k, 'long') },
  quarter: { name: 'trimestre', prev: 'le trimestre précédent', key: (y) => `${y.slice(0, 4)}-Q${Math.floor((+y.slice(5, 7) - 1) / 3) + 1}`, start: (k) => Date.UTC(+k.slice(0, 4), (+k.slice(6) - 1) * 3, 1), next: (k) => roll(k, '-Q', 4, String), label: (k) => `T${k.slice(6)} ${k.slice(0, 4)}`, long: (k) => `trimestre ${k.slice(6)} de ${k.slice(0, 4)}` },
  semester: { name: 'semestre', prev: 'le semestre précédent', key: (y) => `${y.slice(0, 4)}-H${+y.slice(5, 7) <= 6 ? 1 : 2}`, start: (k) => Date.UTC(+k.slice(0, 4), (+k.slice(6) - 1) * 6, 1), next: (k) => roll(k, '-H', 2, String), label: (k) => `S${k.slice(6)} ${k.slice(0, 4)}`, long: (k) => `semestre ${k.slice(6)} de ${k.slice(0, 4)}` },
  year: { name: 'année', prev: "l'année précédente", key: (y) => y.slice(0, 4), start: (k) => Date.UTC(+k, 0, 1), next: (k) => String(+k + 1), label: (k) => k, long: (k) => `année ${k}` },
};
export const prevKey = (g, k) => g.key(utcToYmd(g.start(k) - DAY));

export const pctOf = (a, b) => (b ? Math.round((100 * a) / b) : 0);
export const tally = (items) => ({
  total: items.length,
  done: items.filter((i) => i.status === 'Done').length,
  wip: items.filter((i) => i.status === 'In Progress').length,
  todo: items.filter((i) => i.status !== 'Done' && i.status !== 'In Progress').length,
});

const events = (items) => items.flatMap((i) => [i.createdAt && { kind: 'created', day: ymd(i.createdAt) }, i.closedAt && { kind: 'closed', day: ymd(i.closedAt) }]).filter(Boolean);

export function periodStats(items, today) {
  const ev = events(items);
  const count = (g, kind, key) => ev.filter((e) => e.kind === kind && g.key(e.day) === key).length;
  return Object.entries(GRAN).map(([id, g]) => {
    const cur = g.key(today), prv = prevKey(g, cur);
    return { id, name: g.name, label: g.long(cur), prevName: g.prev, closed: count(g, 'closed', cur), prevClosed: count(g, 'closed', prv), created: count(g, 'created', cur), prevCreated: count(g, 'created', prv) };
  });
}

export function buckets(items, g, today) {
  const ev = events(items);
  if (!ev.length) return [];
  const first = ev.map((e) => e.day).reduce((a, b) => (a < b ? a : b));
  const keys = [];
  for (let k = g.key(first), guard = 0; guard < 5000; k = g.next(k), guard++) { keys.push(k); if (k === g.key(today)) break; }
  const byKey = new Map(keys.map((k) => [k, { key: k, closed: 0, created: 0 }]));
  for (const e of ev) { const b = byKey.get(g.key(e.day)); if (b) b[e.kind]++; }
  let cumDone = 0, cumScope = 0;
  return keys.map((k) => { const b = byKey.get(k); cumDone += b.closed; cumScope += b.created; return { ...b, cumDone, cumScope }; });
}

export const daysUntil = (due, today) => Math.round((ymdToUTC(due.slice(0, 10)) - ymdToUTC(today)) / DAY);
export function dueState(m, t, today) {
  if (m.state === 'closed') return { kind: 'closed' };
  if (!m.dueOn) return { kind: 'none' };
  const days = daysUntil(m.dueOn, today);
  if (days < 0 && t.done < t.total) return { kind: 'late', days };
  if (days <= 14 && pctOf(t.done, t.total) < 80) return { kind: 'soon', days };
  return { kind: 'due', days };
}

export function closedInLastDays(items, today, n) {
  const to = ymdToUTC(today) + DAY, from = to - n * DAY;
  return items.filter((i) => i.closedAt && ymdToUTC(ymd(i.closedAt)) >= from && ymdToUTC(ymd(i.closedAt)) < to).length;
}

export function median(list) {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function horizonOrder(items) {
  const firstDue = new Map();
  for (const i of items) {
    if (!i.horizon) continue;
    const due = (i.milestoneDue || '9999').slice(0, 10);
    if (!firstDue.has(i.horizon) || due < firstDue.get(i.horizon)) firstDue.set(i.horizon, due);
  }
  return [...firstDue.keys()].sort((a, b) => firstDue.get(a).localeCompare(firstDue.get(b)) || a.localeCompare(b));
}
