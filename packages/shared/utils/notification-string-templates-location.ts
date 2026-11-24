/**
 * Les gabarits du PARTAGE DE POSITION autour d'une personne (#19204), langue par langue — à part
 * pour que `notification-string-templates.ts` tienne dans son budget de taille (#4532).
 *
 * Le titre est « <nom> <action> » ; le corps dit la durée du partage pour CE lecteur, en heures
 * pleines ou en minutes (`{count}`), ou invite à répondre. Aucun gabarit ne porte de lieu : la position ne voyage jamais dans une
 * notification. L'alerte de proximité entre Sangs (#20540) dit « <nom> est tout près » au TITRE, sans distance, et la
 * distance au CORPS (`{value}`, le palier formaté dans la langue du lecteur) : seul le corps suit `showPreview`, donc
 * un aperçu coupé ne laisse partir aucune distance.
 */

import type { NotificationLanguage, NotificationStringKey } from './notification-strings.js';

type LocationShareKey = Extract<NotificationStringKey, `location.${string}`>;

export const LOCATION_SHARE_TEMPLATES: Record<NotificationLanguage, Record<LocationShareKey, string>> = {
  fr: {
    'location.startedAction': 'partage sa position avec toi',
    'location.startedBody': 'Pendant {count} h — touche pour le voir sur la carte',
    'location.startedBodyMinutes': 'Pendant {count} min — touche pour le voir sur la carte',
    'location.extendAction': 'te demande de prolonger ton partage de position',
    'location.reaskAction': 'te demande de partager de nouveau ta position',
    'location.requestBody': 'Rien ne change tant que tu ne relances pas le partage',
    'location.proximityAction': 'est tout près',
    'location.proximityBody': 'À {value} — touche pour vous voir tous les deux sur la carte',
  },
  en: {
    'location.startedAction': 'is sharing their location with you',
    'location.startedBody': 'For {count} h — tap to see them on the map',
    'location.startedBodyMinutes': 'For {count} min — tap to see them on the map',
    'location.extendAction': 'asks you to extend your location sharing',
    'location.reaskAction': 'asks you to share your location again',
    'location.requestBody': 'Nothing changes until you share again',
    'location.proximityAction': 'is nearby',
    'location.proximityBody': '{value} away — tap to see you both on the map',
  },
  es: {
    'location.startedAction': 'comparte su ubicación contigo',
    'location.startedBody': 'Durante {count} h — toca para verlo en el mapa',
    'location.startedBodyMinutes': 'Durante {count} min — toca para verlo en el mapa',
    'location.extendAction': 'te pide que prolongues tu ubicación compartida',
    'location.reaskAction': 'te pide que vuelvas a compartir tu ubicación',
    'location.requestBody': 'Nada cambia hasta que vuelvas a compartir',
    'location.proximityAction': 'está cerca',
    'location.proximityBody': 'A {value} — toca para veros a los dos en el mapa',
  },
  pt: {
    'location.startedAction': 'está compartilhando a localização com você',
    'location.startedBody': 'Por {count} h — toque para ver no mapa',
    'location.startedBodyMinutes': 'Por {count} min — toque para ver no mapa',
    'location.extendAction': 'pede para você prolongar o compartilhamento da localização',
    'location.reaskAction': 'pede para você compartilhar a localização de novo',
    'location.requestBody': 'Nada muda até você compartilhar de novo',
    'location.proximityAction': 'está por perto',
    'location.proximityBody': 'A {value} — toque para ver vocês dois no mapa',
  },
  de: {
    'location.startedAction': 'teilt den Standort mit dir',
    'location.startedBody': '{count} Std. lang — tippe, um es auf der Karte zu sehen',
    'location.startedBodyMinutes': '{count} Min. lang — tippe, um es auf der Karte zu sehen',
    'location.extendAction': 'bittet dich, deine Standortfreigabe zu verlängern',
    'location.reaskAction': 'bittet dich, deinen Standort erneut zu teilen',
    'location.requestBody': 'Nichts ändert sich, bis du wieder teilst',
    'location.proximityAction': 'ist in der Nähe',
    'location.proximityBody': '{value} entfernt — tippe, um euch beide auf der Karte zu sehen',
  },
  it: {
    'location.startedAction': 'condivide la posizione con te',
    'location.startedBody': 'Per {count} h — tocca per vederla sulla mappa',
    'location.startedBodyMinutes': 'Per {count} min — tocca per vederla sulla mappa',
    'location.extendAction': 'ti chiede di prolungare la condivisione della posizione',
    'location.reaskAction': 'ti chiede di condividere di nuovo la posizione',
    'location.requestBody': 'Non cambia nulla finché non condividi di nuovo',
    'location.proximityAction': 'è qui vicino',
    'location.proximityBody': 'A {value} — tocca per vedervi entrambi sulla mappa',
  },
  ar: {
    'location.startedAction': 'يشاركك موقعه',
    'location.startedBody': 'لمدة {count} ساعة — المس لرؤيته على الخريطة',
    'location.startedBodyMinutes': 'لمدة {count} دقيقة — المس لرؤيته على الخريطة',
    'location.extendAction': 'يطلب منك تمديد مشاركة موقعك',
    'location.reaskAction': 'يطلب منك مشاركة موقعك من جديد',
    'location.requestBody': 'لا شيء يتغيّر ما لم تُعِد المشاركة',
    'location.proximityAction': 'قريب منك',
    'location.proximityBody': 'على بُعد {value} — المس لرؤيتكما معًا على الخريطة',
  },
  'zh-Hans': {
    'location.startedAction': '正在与你共享位置',
    'location.startedBody': '共 {count} 小时 — 轻点在地图上查看',
    'location.startedBodyMinutes': '共 {count} 分钟 — 轻点在地图上查看',
    'location.extendAction': '请你延长位置共享',
    'location.reaskAction': '请你再次共享位置',
    'location.requestBody': '在你重新共享之前，什么都不会改变',
    'location.proximityAction': '就在附近',
    'location.proximityBody': '相距 {value} — 轻点在地图上查看你们俩',
  },
};
