/**
 * « QUI EST PRÉVENU » (#14063), PORTUGAIS : la section de Réglages ›
 * Notifications. Hors du catalogue d'interface, arrivé à son plafond : chargé
 * par la section (`i18n-circle-notify-catalog.ts`), jamais au démarrage.
 */
import type { CircleNotifyCatalog } from '../i18n-circle-notify-catalog';

const pt = {
  'circleNotify.title': 'Avisar',
  'circleNotify.intro': 'Escolha, ação por ação, qual círculo das suas pessoas recebe uma notificação.',
  'circleNotify.intro.question': 'Quem recebe essas notificações?',
  'circleNotify.family.publication': 'Minhas publicações',
  'circleNotify.family.onMyContent': 'Nos meus conteúdos',
  'circleNotify.family.elsewhere': 'Em outros lugares',
  'circleNotify.summary.mixed': 'Depende da ação',
  'circleNotify.action.post': 'Publicação',
  'circleNotify.action.reel': 'Reel',
  'circleNotify.action.story': 'Story',
  'circleNotify.action.mood': 'Humor',
  'circleNotify.action.repost': 'Republicação',
  'circleNotify.action.share': 'Compartilhamento',
  'circleNotify.action.comment': 'Comentário',
  'circleNotify.action.reaction': 'Reação',
  'circleNotify.action.quote': 'Citação',
  'circleNotify.action.reference': 'Referência',
  'circleNotify.action.mention': 'Menção',
  'circleNotify.choice.NOBODY': 'Ninguém',
  'circleNotify.explain.question': 'Quem é avisado com esta escolha?',
  'circleNotify.explain.COMMUNITY': 'Todos os seus vínculos, de Sangue a Conhecido, e os membros das comunidades que você compartilha.',
  'circleNotify.explain.PUBLIC': 'As mesmas pessoas que Comunidade: o Meeshy não tem seguidores, nenhum desconhecido é avisado.',
  'circleNotify.loading': 'Carregando…',
  'circleNotify.unavailable': 'Não foi possível ler estas configurações.',
  'circleNotify.retry': 'Tentar novamente',
} as const satisfies CircleNotifyCatalog;

export default pt;
