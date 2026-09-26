/**
 * REJOINDRE, REPRENDRE, LA FICHE D'UN APPEL ET LE PAVÉ (lot 3 des appels —
 * #6383, #6454, #3586) — tranche espagnole du catalogue, RÉPANDUE par
 * `catalog-es.ts` comme `catalog-es-call.ts`. Libellés repris d'iOS
 * (`CallDetailSheet.swift`, `KeypadTab.swift`).
 */
const esCallJoin = {
  'callJoin.action': 'Unirse',
  'callJoin.named': 'Unirse a la llamada con {name}',
  'callJoin.header': 'Unirse a la llamada en curso',
  'callJoin.resume.title': 'Llamada en curso',
  'callJoin.resume.action': 'Reanudar',
  'callJoin.resume.named': 'Reanudar la llamada con {name}',
  'callJoin.detail.title': 'Detalles de la llamada',
  'callJoin.detail.type': 'Tipo',
  'callJoin.detail.date': 'Fecha',
  'callJoin.detail.duration': 'Duración',
  'callJoin.detail.data': 'Datos',
  'callJoin.detail.openConversation': 'Abrir la conversación',
  'callJoin.detail.loading': 'Cargando la llamada',
  'callJoin.detail.notFound.title': 'Llamada no encontrada',
  'callJoin.detail.notFound.body': 'Esta llamada ya no existe o no está disponible para ti.',
  'callJoin.detail.joining': 'Conectando a la llamada…',
  'keypad.title': 'Teclado',
  'keypad.open': 'Marcar un número',
  'keypad.input.placeholder': 'Número o nombre',
  'keypad.input.label': 'Número o nombre que buscar',
  'keypad.delete': 'Borrar',
  'keypad.clear': 'Borrar todo',
  'keypad.prompt.title': 'Marca un número o un nombre',
  'keypad.prompt.subtitle': 'Encuentra a alguien por número de teléfono o por nombre.',
  'keypad.searching': 'Buscando…',
  'keypad.noMatch.title': 'Ningún contacto encontrado',
  'keypad.noMatch.subtitle': 'Revisa el número o el nombre introducido.',
  'keypad.error.title': 'La búsqueda ha fallado',
  'keypad.error.body': 'Revisa tu conexión e inténtalo de nuevo.',
  'keypad.offline.title': 'Sin conexión',
  'keypad.offline.body': 'La búsqueda se reanudará cuando vuelva la red.',
  'keypad.results': 'Resultados',
  'keypad.call.audio.named': 'Llamada de voz a {name}',
  'keypad.call.video.named': 'Videollamada a {name}',
  'keypad.call.failed': 'No se pudo iniciar la llamada. Inténtalo de nuevo.',
  'keypad.retry': 'Reintentar',
} as const;

export default esCallJoin;
