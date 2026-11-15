/**
 * LE TÉLÉPHONE INJOIGNABLE DES PROCHES ET DES SANGS (#18737, TEL-01) — la source des clés `phone.*` : les annonces
 * de la pastille de synchronisation, le glyphe de l'avatar, le détail de la fiche et du profil, et les réglages
 * (prévenir une personne, prévenir mes Proches). Chargée à la demande (`lib/i18n-phone-reachability-catalog.ts`).
 */
const fr = {
  'phone.announce.unreachable': 'Le téléphone de {name} est injoignable depuis {time}',
  'phone.announce.unreachableSomeone': 'Le téléphone d’un proche est injoignable depuis {time}',
  'phone.announce.reachable': 'Le téléphone de {name} répond de nouveau',
  'phone.announce.reachableSomeone': 'Le téléphone d’un proche répond de nouveau',
  'phone.a11y.unreachable': 'téléphone injoignable depuis {time}',
  'phone.detail.title': 'Téléphone',
  'phone.detail.since': 'Téléphone injoignable depuis {time}',
  'phone.cause.battery': 'Batterie vide, probablement',
  'phone.cause.network': 'Sans réseau ou en mode avion, probablement',
  'phone.share.title': 'Prévenir {name} si mon téléphone est injoignable',
  'phone.share.explainClose': '{name} saura depuis quand votre téléphone ne répond plus, et pourquoi c’est probable. Rien n’est partagé tant que vous ne l’activez pas.',
  'phone.share.explainBlood': 'Activé par défaut avec vos Sangs. Vous pouvez le retirer à tout moment.',
  'phone.share.globalOff': 'Vous ne prévenez plus personne : le réglage est coupé pour tous, depuis votre profil.',
  'phone.global.title': 'Prévenir mes Proches si mon téléphone est injoignable',
  'phone.global.explain': 'Vos Sangs, et les Proches à qui vous l’avez accordé, savent depuis quand votre téléphone ne répond plus, et pourquoi c’est probable. Jamais dans une conversation.',
  'phone.global.question': 'Qui est prévenu ?',
  'phone.consent.title': 'Prévenir {name} si votre téléphone ne répond plus ?',
  'phone.consent.body': '{name} saura que votre téléphone est injoignable, depuis quand, et si c’est probablement la batterie ou le réseau. Ce réglage reste modifiable ici.',
  'phone.consent.confirm': 'Continuer',
  'phone.settings.failed': 'Le réglage n’a pas pu être enregistré.',
  'phone.settings.offline': 'Hors ligne : le réglage n’a pas été enregistré.',
  'phone.webNote': 'Ce navigateur ne compte pas : seule l’application Meeshy de votre téléphone dit s’il est joignable.',
} as const;

export default fr;
