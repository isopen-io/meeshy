/**
 * O celular inacessível das pessoas próximas e do Sangue (#18737, TEL-01), português — carregado sob demanda
 * (`i18n-phone-reachability-catalog.ts`), nunca na inicialização.
 */
import type { PhoneReachabilityCatalog } from '../i18n-phone-reachability-catalog';

const pt = {
  'phone.announce.unreachable': 'O celular de {name} está inacessível desde {time}',
  'phone.announce.unreachableSomeone': 'O celular de alguém próximo está inacessível desde {time}',
  'phone.announce.reachable': 'O celular de {name} voltou a responder',
  'phone.announce.reachableSomeone': 'O celular de alguém próximo voltou a responder',
  'phone.a11y.unreachable': 'celular inacessível desde {time}',
  'phone.detail.title': 'Celular',
  'phone.detail.since': 'Celular inacessível desde {time}',
  'phone.cause.battery': 'Bateria descarregada, provavelmente',
  'phone.cause.network': 'Sem rede ou em modo avião, provavelmente',
  'phone.share.title': 'Avisar {name} se meu celular estiver inacessível',
  'phone.share.explainClose': '{name} saberá desde quando seu celular não responde e o motivo provável. Nada é compartilhado até você ativar.',
  'phone.share.explainBlood': 'Ativado por padrão com seu Sangue. Você pode desativar a qualquer momento.',
  'phone.share.globalOff': 'Você não avisa mais ninguém: está desativado para todos, no seu perfil.',
  'phone.global.title': 'Avisar meus próximos se meu celular estiver inacessível',
  'phone.global.explain': 'Seu Sangue, e as pessoas próximas a quem você permitiu, sabem desde quando seu celular não responde e o motivo provável. Nunca em uma conversa.',
  'phone.global.question': 'Quem é avisado?',
  'phone.consent.title': 'Avisar {name} se seu celular parar de responder?',
  'phone.consent.body': '{name} saberá que seu celular está inacessível, desde quando, e se provavelmente é a bateria ou a rede. Você pode mudar isso aqui quando quiser.',
  'phone.consent.confirm': 'Continuar',
  'phone.settings.failed': 'Não foi possível salvar o ajuste.',
  'phone.settings.offline': 'Sem conexão: o ajuste não foi salvo.',
  'phone.webNote': 'Este navegador não conta: só o app Meeshy do seu celular informa se ele está acessível.',
} as const satisfies PhoneReachabilityCatalog;

export default pt;
