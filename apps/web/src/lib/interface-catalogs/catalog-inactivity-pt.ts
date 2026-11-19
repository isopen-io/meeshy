/**
 * LA VÉRIFICATION D'INACTIVITÉ (#18738, TEL-02), langue « pt » — chargée à la demande
 * (`i18n-inactivity-catalog.ts`), jamais au démarrage.
 */
import type { InactivityCatalog } from '../i18n-inactivity-catalog';

const pt = {
  'inactivity.announce.alert': '{name} não respondeu a «Está tudo bem?»',
  'inactivity.announce.alertSomeone': 'Alguém do seu Sangue não respondeu a «Está tudo bem?»',
  'inactivity.announce.responded': '{name} está bem',
  'inactivity.announce.respondedSomeone': 'Alguém do seu Sangue está bem',
  'inactivity.detail.title': 'Inatividade',
  'inactivity.detail.since': 'Sem atividade desde {time}',
  'inactivity.detail.battery': 'Última bateria: {value}',
  'inactivity.detail.map': 'Última localização',
  'inactivity.share.title': 'Avisar se eu não responder',
  'inactivity.share.explain': 'Se o seu telefone ficar inativo e você não responder a «Está tudo bem?», {name} é avisado.',
  'inactivity.global.title': 'Verificação de inatividade',
  'inactivity.global.off': 'Desativada',
  'inactivity.global.hours': '{count} h',
  'inactivity.settings.failed': 'Não foi possível salvar a configuração.',
  'inactivity.settings.offline': 'Sem conexão: a configuração não foi salva.',
} as const satisfies InactivityCatalog;

export default pt;
