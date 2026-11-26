import type { GameStatsTextKey } from './analytics-game-fr';

const f = {
  'admin.analytics.game.retention.title': 'Return of new sign-ups',
  'admin.analytics.game.retention.hint': 'Share of the accounts of a sign-up week still active 1, 7 and 30 days after signing up. “—”: no account of that week has had time to reach that day yet.',
  'admin.analytics.game.retention.column.week': 'Week of',
  'admin.analytics.game.retention.column.accounts': 'Sign-ups',
  'admin.analytics.game.retention.column.day1': 'After 1 day',
  'admin.analytics.game.retention.column.day7': 'After 7 days',
  'admin.analytics.game.retention.column.day30': 'After 30 days',
  'admin.analytics.game.retention.empty.title': 'No sign-up over the last {weeks} weeks',
  'admin.analytics.game.retention.empty.hint': 'Return is measured as soon as a week has a new sign-up.',
  'admin.analytics.game.daily.title': 'The Game, day by day',
  'admin.analytics.game.daily.hint': 'Offerings opened and Meeshes minted and spent each day (UTC). Meeshes are counted in units.',
  'admin.analytics.game.daily.column.day': 'Day',
  'admin.analytics.game.daily.column.offerings': 'Offerings opened',
  'admin.analytics.game.daily.column.minted': 'Meeshes minted',
  'admin.analytics.game.daily.column.spent': 'Meeshes spent',
  'admin.analytics.game.today.title': 'Today',
  'admin.analytics.game.today.hint': 'Players who keep their Flame going, and those who set the Game aside.',
  'admin.analytics.game.longFlames': 'Long Flames still alive',
  'admin.analytics.game.longFlames.caption': 'Lit for {days} days or more.',
  'admin.analytics.game.hidden': 'Accounts with the Game hidden',
  'admin.analytics.game.notificationsOff': 'Accounts without Game notifications',
  'admin.analytics.game.sampled': 'Capped reading: the figures are lower bounds.',
} satisfies Readonly<Record<GameStatsTextKey, string>>;

export default f;
