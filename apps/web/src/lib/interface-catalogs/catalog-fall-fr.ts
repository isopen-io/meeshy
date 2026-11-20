/**
 * LA CHUTE DÉTECTÉE (#18748, SAN-01) — la source des clés `fall.*` : les annonces de la pastille de
 * synchronisation (« une chute a été détectée », « va bien »), le détail de l'en-tête, de la fiche et du profil, et
 * les réglages (prévenir une personne ; la ligne de « Moi » qui dit d'où vient la détection). Chargée à la demande
 * (`lib/i18n-fall-catalog.ts`).
 */
const fr = {
  'fall.announce.detected': 'Une chute a été détectée sur la montre de {name}',
  'fall.announce.detectedSomeone': 'Une chute a été détectée sur la montre d’un Sang',
  'fall.announce.responded': '{name} va bien',
  'fall.announce.respondedSomeone': 'Un Sang va bien',
  'fall.detail.title': 'Chute détectée',
  'fall.detail.at': 'Chute détectée à {time}',
  'fall.detail.battery': 'Dernière batterie : {value}',
  'fall.detail.map': 'Dernière position',
  'fall.share.title': 'Prévenir si ma montre détecte une chute',
  'fall.share.explain': 'Si votre Apple Watch détecte une chute, {name} est prévenu tout de suite.',
  'fall.me.title': 'Détection de chute',
  'fall.me.source': 'Apple Watch',
  'fall.me.question': 'D’où vient la détection ?',
  'fall.me.explain': 'Elle vient d’une Apple Watch : l’accord se donne dans l’app iPhone, jamais ici. Vos Sangs sont alors prévenus d’une chute.',
  'fall.settings.failed': 'Le réglage n’a pas pu être enregistré.',
  'fall.settings.offline': 'Hors ligne : le réglage n’a pas été enregistré.',
} as const;

export default fr;
