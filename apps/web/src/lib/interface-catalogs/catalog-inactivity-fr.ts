/**
 * LA VÉRIFICATION D'INACTIVITÉ (#18738, TEL-02) — la source des clés `inactivity.*` : les annonces de la pastille
 * de synchronisation (« n'a pas répondu à « Tout va bien ? » », « va bien »), le détail de l'en-tête, de la fiche
 * et du profil, et les réglages (le délai pour tous, prévenir une personne). Chargée à la demande
 * (`lib/i18n-inactivity-catalog.ts`).
 */
const fr = {
  'inactivity.announce.alert': '{name} n’a pas répondu à « Tout va bien ? »',
  'inactivity.announce.alertSomeone': 'Un Sang n’a pas répondu à « Tout va bien ? »',
  'inactivity.announce.responded': '{name} va bien',
  'inactivity.announce.respondedSomeone': 'Un Sang va bien',
  'inactivity.detail.title': 'Inactivité',
  'inactivity.detail.since': 'Aucune activité depuis {time}',
  'inactivity.detail.battery': 'Dernière batterie : {value}',
  'inactivity.detail.map': 'Dernière position',
  'inactivity.share.title': 'Prévenir si je ne réponds pas',
  'inactivity.share.explain': 'Si votre téléphone reste inactif et que vous ne répondez pas à « Tout va bien ? », {name} est prévenu.',
  'inactivity.global.title': 'Vérification d’inactivité',
  'inactivity.global.off': 'Désactivée',
  'inactivity.global.hours': '{count} h',
  'inactivity.settings.failed': 'Le réglage n’a pas pu être enregistré.',
  'inactivity.settings.offline': 'Hors ligne : le réglage n’a pas été enregistré.',
} as const;

export default fr;
