/**
 * « EN APPEL » (#18753, ACT-01) — la source des clés `call.*` : les annonces de la pastille de synchronisation
 * (« est en appel », « a raccroché »), « En appel depuis 14:00 » de l'en-tête, de la fiche et du profil, et les
 * réglages (montrer à mes Sangs, montrer à une personne). Jamais d'interlocuteur. Chargée à la demande
 * (`lib/i18n-phone-call-catalog.ts`).
 */
const fr = {
  'call.announce.started': '{name} est en appel',
  'call.announce.startedSomeone': 'Un Sang est en appel',
  'call.announce.ended': '{name} a raccroché',
  'call.announce.endedSomeone': 'Un Sang a raccroché',
  'call.detail.title': 'En appel',
  'call.detail.sinceTime': 'En appel depuis {time}',
  'call.detail.sinceMinutes': 'En appel depuis {count} min',
  'call.share.title': 'Montrer que je suis en appel',
  'call.share.explain': '{name} voit que vous êtes en appel, jamais avec qui.',
  'call.share.globalOff': 'Coupé pour tous dans votre profil.',
  'call.global.short': 'Montrer à mes Sangs que je suis en appel',
  'call.settings.failed': 'Le réglage n’a pas pu être enregistré.',
  'call.settings.offline': 'Hors ligne : le réglage n’a pas été enregistré.',
} as const;

export default fr;
