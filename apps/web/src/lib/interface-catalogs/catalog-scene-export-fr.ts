/**
 * L'EXPORT D'UNE PUBLICATION À SCÈNE, FRANÇAIS (#13873) — la SOURCE des clés
 * du menu « Sauvegarder » / « Imager », du choix de longueur et du bandeau
 * des exports en cours. Les six autres langues portent exactement ces clés
 * (`satisfies SceneExportCatalog`, `i18n-scene-export-catalog.test.ts`).
 */
const fr = {
  'sceneExport.menu.save': 'Sauvegarder',
  'sceneExport.menu.imager': 'Imager',
  'sceneExport.length.title': 'Quelle durée imager ?',
  'sceneExport.length.subtitle': 'Depuis le début de la publication',
  'sceneExport.length.option': '{part}/4 · {duration}',
  'sceneExport.length.cancel': 'Annuler',
  'sceneExport.tray.preparing': 'Préparation de l’export…',
  'sceneExport.tray.progress': 'Export en cours · {percent} %',
  'sceneExport.tray.delivering': 'Enregistrement du fichier…',
  'sceneExport.tray.cancel': 'Annuler l’export',
  'sceneExport.notice.saved': 'Publication enregistrée',
  'sceneExport.notice.cancelled': 'Export annulé',
  'sceneExport.notice.failed': 'Échec de l’export',
  'sceneExport.notice.retry': 'Touchez de nouveau pour enregistrer le fichier',
  'sceneExport.notice.unsupported': 'Ce navigateur ne sait pas enregistrer de vidéo',
  'sceneExport.notice.offline': 'Export impossible hors ligne',
  'sceneExport.notice.busy': 'Un export de cette publication est déjà en cours',
} as const;

export default fr;
