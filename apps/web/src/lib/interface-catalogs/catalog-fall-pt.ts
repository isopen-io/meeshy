/**
 * LA CHUTE DÉTECTÉE (#18748, SAN-01), langue « pt » — chargée à la demande (`i18n-fall-catalog.ts`), jamais au
 * démarrage.
 */
import type { FallCatalog } from '../i18n-fall-catalog';

const pt = {
  'fall.announce.detected': 'Foi detetada uma queda no relógio de {name}',
  'fall.announce.detectedSomeone': 'Foi detetada uma queda no relógio de um Sangue',
  'fall.announce.responded': '{name} está bem',
  'fall.announce.respondedSomeone': 'Um Sangue está bem',
  'fall.detail.title': 'Queda detetada',
  'fall.detail.at': 'Queda detetada às {time}',
  'fall.detail.battery': 'Última bateria: {value}',
  'fall.detail.map': 'Última localização',
  'fall.share.title': 'Avisar se o meu relógio detetar uma queda',
  'fall.share.explain': 'Se o seu Apple Watch detetar uma queda, {name} é avisado de imediato.',
  'fall.me.title': 'Deteção de quedas',
  'fall.me.source': 'Apple Watch',
  'fall.me.question': 'De onde vem a deteção?',
  'fall.me.explain': 'Vem de um Apple Watch: o consentimento dá-se na app do iPhone, nunca aqui. Os seus Sangue são então avisados de uma queda.',
  'fall.settings.failed': 'Não foi possível guardar a definição.',
  'fall.settings.offline': 'Sem ligação: a definição não foi guardada.',
} as const satisfies FallCatalog;

export default pt;
