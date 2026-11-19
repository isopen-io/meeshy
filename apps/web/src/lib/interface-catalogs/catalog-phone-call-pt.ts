/**
 * « EN APPEL » (#18753, ACT-01), langue « pt » — chargée à la demande (`i18n-phone-call-catalog.ts`), jamais au
 * démarrage.
 */
import type { PhoneCallCatalog } from '../i18n-phone-call-catalog';

const pt = {
  'call.announce.started': '{name} está numa chamada',
  'call.announce.startedSomeone': 'Alguém do seu Sangue está numa chamada',
  'call.announce.ended': '{name} desligou',
  'call.announce.endedSomeone': 'Alguém do seu Sangue desligou',
  'call.detail.title': 'Numa chamada',
  'call.detail.sinceTime': 'Numa chamada desde as {time}',
  'call.detail.sinceMinutes': 'Numa chamada há {count} min',
  'call.share.title': 'Mostrar que estou numa chamada',
  'call.share.explain': '{name} vê que você está numa chamada, nunca com quem.',
  'call.share.globalOff': 'Desativado para todos no seu perfil.',
  'call.global.short': 'Mostrar ao meu Sangue que estou numa chamada',
  'call.settings.failed': 'Não foi possível salvar o ajuste.',
  'call.settings.offline': 'Offline: o ajuste não foi salvo.',
} as const satisfies PhoneCallCatalog;

export default pt;
