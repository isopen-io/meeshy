import type { AdminCatalogFragment } from './fragment';
import type fr from './gestes-fr';

const f = {
  'admin.gesture.col': 'Actions',
  'admin.gesture.group': 'Actions on this post',
  'admin.gesture.takeOffline': 'Take offline',
  'admin.gesture.restore': 'Put back online',
  'admin.gesture.audience': 'Audience',
  'admin.gesture.audience.placeholder': 'Change the audience…',
  'admin.gesture.takeOffline.title': 'Take this post offline?',
  'admin.gesture.takeOffline.body': 'It leaves the feed, profiles and links. Its author still sees it but cannot reopen it. “Put back online” restores it as it was.',
  'admin.gesture.restore.title': 'Put this post back online?',
  'admin.gesture.restore.body': 'The hold is lifted and the post gets back the audience its author chose.',
  'admin.gesture.audience.title': 'Serve this post to: {audience}?',
  'admin.gesture.audience.body': 'The chosen audience replaces the author’s; any moderation hold is lifted.',
  'admin.gesture.motive': 'Reason',
  'admin.gesture.done.takeOffline': 'Post taken offline.',
  'admin.gesture.done.restore': 'Post back online.',
  'admin.gesture.done.audience': 'Post audience changed.',
  'admin.gesture.filter.state': 'State',
} satisfies AdminCatalogFragment<typeof fr>;

export default f;
