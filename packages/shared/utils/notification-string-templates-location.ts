/**
 * Les gabarits du PARTAGE DE POSITION autour d'une personne (#19204), langue par langue — à part
 * pour que `notification-string-templates.ts` tienne dans son budget de taille (#4532).
 *
 * Le titre est « <nom> <action> » ; le corps dit la durée choisie en heures (`{count}`), ou
 * invite à répondre. Aucun gabarit ne porte de lieu : la position ne voyage jamais dans une
 * notification.
 */

import type { NotificationLanguage, NotificationStringKey } from './notification-strings.js';

type LocationShareKey = Extract<NotificationStringKey, `location.${string}`>;

export const LOCATION_SHARE_TEMPLATES: Record<NotificationLanguage, Record<LocationShareKey, string>> = {
  fr: {
    'location.startedAction': 'partage sa position avec toi',
    'location.startedBody': 'Pendant {count} h — touche pour le voir sur la carte',
    'location.extendAction': 'te demande de prolonger ton partage de position',
    'location.reaskAction': 'te demande de partager de nouveau ta position',
    'location.requestBody': 'Rien ne change tant que tu ne relances pas le partage',
  },
  en: {
    'location.startedAction': 'is sharing their location with you',
    'location.startedBody': 'For {count} h — tap to see them on the map',
    'location.extendAction': 'asks you to extend your location sharing',
    'location.reaskAction': 'asks you to share your location again',
    'location.requestBody': 'Nothing changes until you share again',
  },
  es: {
    'location.startedAction': 'comparte su ubicación contigo',
    'location.startedBody': 'Durante {count} h — toca para verlo en el mapa',
    'location.extendAction': 'te pide que prolongues tu ubicación compartida',
    'location.reaskAction': 'te pide que vuelvas a compartir tu ubicación',
    'location.requestBody': 'Nada cambia hasta que vuelvas a compartir',
  },
  pt: {
    'location.startedAction': 'está compartilhando a localização com você',
    'location.startedBody': 'Por {count} h — toque para ver no mapa',
    'location.extendAction': 'pede para você prolongar o compartilhamento da localização',
    'location.reaskAction': 'pede para você compartilhar a localização de novo',
    'location.requestBody': 'Nada muda até você compartilhar de novo',
  },
  de: {
    'location.startedAction': 'teilt den Standort mit dir',
    'location.startedBody': '{count} Std. lang — tippe, um es auf der Karte zu sehen',
    'location.extendAction': 'bittet dich, deine Standortfreigabe zu verlängern',
    'location.reaskAction': 'bittet dich, deinen Standort erneut zu teilen',
    'location.requestBody': 'Nichts ändert sich, bis du wieder teilst',
  },
  it: {
    'location.startedAction': 'condivide la posizione con te',
    'location.startedBody': 'Per {count} h — tocca per vederla sulla mappa',
    'location.extendAction': 'ti chiede di prolungare la condivisione della posizione',
    'location.reaskAction': 'ti chiede di condividere di nuovo la posizione',
    'location.requestBody': 'Non cambia nulla finché non condividi di nuovo',
  },
  ar: {
    'location.startedAction': 'يشاركك موقعه',
    'location.startedBody': 'لمدة {count} ساعة — المس لرؤيته على الخريطة',
    'location.extendAction': 'يطلب منك تمديد مشاركة موقعك',
    'location.reaskAction': 'يطلب منك مشاركة موقعك من جديد',
    'location.requestBody': 'لا شيء يتغيّر ما لم تُعِد المشاركة',
  },
  'zh-Hans': {
    'location.startedAction': '正在与你共享位置',
    'location.startedBody': '共 {count} 小时 — 轻点在地图上查看',
    'location.extendAction': '请你延长位置共享',
    'location.reaskAction': '请你再次共享位置',
    'location.requestBody': '在你重新共享之前，什么都不会改变',
  },
};
