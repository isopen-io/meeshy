import type { SceneExportCatalog } from '@/lib/i18n-scene-export-catalog';

const en = {
  'sceneExport.menu.save': 'Save',
  'sceneExport.menu.imager': 'Picture it',
  'sceneExport.length.title': 'How much to render?',
  'sceneExport.length.subtitle': 'From the start of the post',
  'sceneExport.length.option': '{part}/4 · {duration}',
  'sceneExport.length.cancel': 'Cancel',
  'sceneExport.tray.preparing': 'Preparing the export…',
  'sceneExport.tray.progress': 'Exporting · {percent}%',
  'sceneExport.tray.delivering': 'Saving the file…',
  'sceneExport.tray.cancel': 'Cancel export',
  'sceneExport.tray.ready': 'File ready to share',
  'sceneExport.tray.share': 'Share',
  'sceneExport.notice.saved': 'Post saved',
  'sceneExport.notice.shared': 'File shared',
  'sceneExport.notice.cancelled': 'Export cancelled',
  'sceneExport.notice.failed': 'Export failed',
  'sceneExport.notice.retry': 'Tap again to save the file',
  'sceneExport.notice.unsupported': 'This browser can’t record video',
  'sceneExport.notice.offline': 'Can’t export while offline',
  'sceneExport.notice.busy': 'This post is already being exported',
} satisfies SceneExportCatalog;

export default en;
