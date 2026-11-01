import type { SceneExportCatalog } from '@/lib/i18n-scene-export-catalog';

const de = {
  'sceneExport.menu.save': 'Speichern',
  'sceneExport.menu.imager': 'Als Bild',
  'sceneExport.length.title': 'Welche Dauer rendern?',
  'sceneExport.length.subtitle': 'Ab dem Anfang des Beitrags',
  'sceneExport.length.option': '{part}/4 · {duration}',
  'sceneExport.length.cancel': 'Abbrechen',
  'sceneExport.tray.preparing': 'Export wird vorbereitet…',
  'sceneExport.tray.progress': 'Export läuft · {percent} %',
  'sceneExport.tray.delivering': 'Datei wird gespeichert…',
  'sceneExport.tray.cancel': 'Export abbrechen',
  'sceneExport.tray.ready': 'Datei bereit zum Teilen',
  'sceneExport.tray.share': 'Teilen',
  'sceneExport.notice.saved': 'Beitrag gespeichert',
  'sceneExport.notice.shared': 'Datei geteilt',
  'sceneExport.notice.cancelled': 'Export abgebrochen',
  'sceneExport.notice.failed': 'Export fehlgeschlagen',
  'sceneExport.notice.retry': 'Erneut tippen, um die Datei zu speichern',
  'sceneExport.notice.unsupported': 'Dieser Browser kann kein Video aufnehmen',
  'sceneExport.notice.offline': 'Export offline nicht möglich',
  'sceneExport.notice.busy': 'Dieser Beitrag wird bereits exportiert',
} satisfies SceneExportCatalog;

export default de;
