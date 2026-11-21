/**
 * Les gabarits des COMMUNAUTÉS (#18052, #19879), langue par langue — à part pour que
 * `notification-string-templates.ts` tienne dans son budget de taille (#4532).
 *
 * « Ajouté à la communauté » et le refus d'une demande d'entrée : le nom de la
 * communauté seul (`{title}`), jamais celui de qui a ajouté ou refusé.
 */

import type { NotificationLanguage, NotificationStringKey } from './notification-strings.js';

type CommunityKey = Extract<NotificationStringKey, `community.${string}`>;

export const COMMUNITY_TEMPLATES: Record<NotificationLanguage, Record<CommunityKey, string>> = {
  fr: {
    'community.added': 'Ajouté à la communauté {title}',
    'community.joinRejected': 'Votre demande pour rejoindre {title} n’a pas été acceptée',
  },
  en: {
    'community.added': 'Added to the community {title}',
    'community.joinRejected': 'Your request to join {title} was not accepted',
  },
  es: {
    'community.added': 'Añadido a la comunidad {title}',
    'community.joinRejected': 'Tu solicitud para unirte a {title} no fue aceptada',
  },
  pt: {
    'community.added': 'Adicionado à comunidade {title}',
    'community.joinRejected': 'Seu pedido para entrar em {title} não foi aceito',
  },
  de: {
    'community.added': 'Zur Community {title} hinzugefügt',
    'community.joinRejected': 'Deine Anfrage, {title} beizutreten, wurde nicht angenommen',
  },
  it: {
    'community.added': 'Aggiunto alla community {title}',
    'community.joinRejected': 'La tua richiesta di unirti a {title} non è stata accettata',
  },
  ar: {
    'community.added': 'تمت إضافتك إلى مجتمع {title}',
    'community.joinRejected': 'لم يتم قبول طلبك للانضمام إلى {title}',
  },
  'zh-Hans': {
    'community.added': '已加入社区 {title}',
    'community.joinRejected': '你加入 {title} 的请求未被接受',
  },
};
