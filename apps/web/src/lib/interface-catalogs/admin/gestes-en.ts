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
  'admin.gesture.preview.open': 'Preview',
  'admin.gesture.preview.title': 'Post preview',
  'admin.gesture.preview.previous': 'Previous post',
  'admin.gesture.preview.next': 'Next post',
  'admin.gesture.preview.fiche': 'Open the record',
  'admin.gesture.preview.keys': 'j and k, or the arrow keys, move between posts.',
  'admin.gesture.preview.scene': 'Scene {index} of {count}',
  'admin.gesture.preview.scenePrevious': 'Previous scene',
  'admin.gesture.preview.sceneNext': 'Next scene',
  'admin.gesture.preview.file': 'Open the file',
  'admin.gesture.preview.empty': 'This post has neither text nor media.',
} satisfies AdminCatalogFragment<typeof fr>;

export default f;
