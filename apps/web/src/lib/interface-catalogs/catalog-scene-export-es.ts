import type { SceneExportCatalog } from '@/lib/i18n-scene-export-catalog';

const es = {
  'sceneExport.menu.save': 'Guardar',
  'sceneExport.menu.imager': 'Crear imagen',
  'sceneExport.tray.preparing': 'Preparando la exportación…',
  'sceneExport.tray.progress': 'Exportando · {percent} %',
  'sceneExport.tray.delivering': 'Guardando el archivo…',
  'sceneExport.tray.cancel': 'Cancelar la exportación',
  'sceneExport.tray.ready': 'Archivo listo para compartir',
  'sceneExport.tray.share': 'Compartir',
  'sceneExport.notice.saved': 'Publicación guardada',
  'sceneExport.notice.shared': 'Archivo compartido',
  'sceneExport.notice.cancelled': 'Exportación cancelada',
  'sceneExport.notice.failed': 'Error en la exportación',
  'sceneExport.notice.retry': 'Toca de nuevo para guardar el archivo',
  'sceneExport.notice.unsupported': 'Este navegador no puede grabar vídeo',
  'sceneExport.notice.offline': 'No se puede exportar sin conexión',
  'sceneExport.notice.busy': 'Esta publicación ya se está exportando',
} satisfies SceneExportCatalog;

export default es;
