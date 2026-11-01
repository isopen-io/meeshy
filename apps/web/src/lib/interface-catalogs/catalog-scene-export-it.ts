import type { SceneExportCatalog } from '@/lib/i18n-scene-export-catalog';

const it = {
  'sceneExport.menu.save': 'Salva',
  'sceneExport.menu.imager': 'Crea immagine',
  'sceneExport.length.title': 'Quanta durata generare?',
  'sceneExport.length.subtitle': 'Dall’inizio della pubblicazione',
  'sceneExport.length.option': '{part}/4 · {duration}',
  'sceneExport.length.cancel': 'Annulla',
  'sceneExport.tray.preparing': 'Preparazione dell’esportazione…',
  'sceneExport.tray.progress': 'Esportazione · {percent} %',
  'sceneExport.tray.delivering': 'Salvataggio del file…',
  'sceneExport.tray.cancel': 'Annulla l’esportazione',
  'sceneExport.tray.ready': 'File pronto da condividere',
  'sceneExport.tray.share': 'Condividi',
  'sceneExport.notice.saved': 'Pubblicazione salvata',
  'sceneExport.notice.shared': 'File condiviso',
  'sceneExport.notice.cancelled': 'Esportazione annullata',
  'sceneExport.notice.failed': 'Esportazione non riuscita',
  'sceneExport.notice.retry': 'Tocca di nuovo per salvare il file',
  'sceneExport.notice.unsupported': 'Questo browser non può registrare video',
  'sceneExport.notice.offline': 'Impossibile esportare offline',
  'sceneExport.notice.busy': 'Questa pubblicazione è già in esportazione',
} satisfies SceneExportCatalog;

export default it;
