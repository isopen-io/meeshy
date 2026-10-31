import type { SceneExportCatalog } from '@/lib/i18n-scene-export-catalog';

const pt = {
  'sceneExport.menu.save': 'Salvar',
  'sceneExport.menu.imager': 'Criar imagem',
  'sceneExport.length.title': 'Que duração gerar?',
  'sceneExport.length.subtitle': 'Desde o início da publicação',
  'sceneExport.length.option': '{part}/4 · {duration}',
  'sceneExport.length.cancel': 'Cancelar',
  'sceneExport.tray.preparing': 'Preparando a exportação…',
  'sceneExport.tray.progress': 'Exportando · {percent} %',
  'sceneExport.tray.delivering': 'Salvando o arquivo…',
  'sceneExport.tray.cancel': 'Cancelar a exportação',
  'sceneExport.notice.saved': 'Publicação salva',
  'sceneExport.notice.cancelled': 'Exportação cancelada',
  'sceneExport.notice.failed': 'Falha na exportação',
  'sceneExport.notice.retry': 'Toque de novo para salvar o arquivo',
  'sceneExport.notice.unsupported': 'Este navegador não consegue gravar vídeo',
  'sceneExport.notice.offline': 'Não é possível exportar offline',
  'sceneExport.notice.busy': 'Esta publicação já está sendo exportada',
} satisfies SceneExportCatalog;

export default pt;
