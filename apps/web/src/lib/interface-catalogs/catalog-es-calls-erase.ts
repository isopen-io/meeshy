/**
 * EFFACER ET CHERCHER DANS LE JOURNAL D'APPELS (#8066) — tranche du catalogue,
 * RÉPANDUE par `catalog-es.ts` comme `catalog-es-call-feedback.ts`.
 */
const esCallsErase = {
  'calls.edit': 'Editar',
  'calls.editDone': 'Listo',
  'calls.hide.named': 'Quitar la llamada con {name} del historial',
  'calls.clearAll': 'Borrar todo',
  'calls.clearAll.confirm': '¿Borrar todo tu historial de llamadas? Los demás participantes conservan el suyo.',
  'calls.clearAll.confirmAction': 'Borrar',
  'calls.clearAll.cancel': 'Cancelar',
  'calls.erase.failed': 'No se pudo borrar. Inténtalo de nuevo.',
  'calls.search': 'Buscar un nombre',
  'calls.search.clear': 'Borrar la búsqueda',
  'calls.search.empty': 'Ninguna llamada coincide con «{query}»',
} as const;

export default esCallsErase;
