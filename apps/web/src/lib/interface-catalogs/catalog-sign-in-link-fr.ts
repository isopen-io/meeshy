/**
 * LA CONFIRMATION D'UN LIEN DE CONNEXION ouvert hors de l'appareil qui l'a demandé (« Se connecter en tant que
 * @x ? », 8da83d255f) — la source des clés `signInLink.confirm.*`. Chargée AVEC le lien magique et la
 * vérification d'adresse (`lib/i18n-sign-in-link-catalog.ts`), jamais au démarrage.
 */
const fr = {
  'signInLink.confirm.title': 'Se connecter en tant que @{username} ?',
  'signInLink.confirm.lead': 'Ce lien n’a pas été demandé depuis cet appareil. Ne continuez que si ce compte est bien le vôtre.',
  'signInLink.confirm.leadSignedIn': 'Vous êtes connecté avec @{current}. Ce lien ouvrirait le compte ci-dessous à sa place ; @{current} restera dans vos comptes sur cet appareil.',
  'signInLink.confirm.accept': 'Se connecter',
  'signInLink.confirm.cancel': 'Annuler',
  'signInLink.confirm.claim': 'Cette adresse sera rattachée à @{username} et retirée de tout autre compte Meeshy.',
  'signInLink.confirm.acceptClaim': 'Rattacher l’adresse et se connecter',
  'verifyEmail.bar.title': 'Vérification de l’e-mail',
  'verifyEmail.noAddress': 'Ce lien ne porte aucune adresse e-mail à vérifier. Ouvrez-le depuis l’e-mail que Meeshy vous a envoyé.',
  'verifyEmail.continue': 'Continuer',
  'verifyEmail.title': 'Vérifiez votre e-mail',
  'verifyEmail.subtitle': 'Entrez le code à 6 chiffres envoyé à {email}',
  'verifyEmail.subtitle.created': 'Nous avons créé votre compte et envoyé un code et un lien à {email}. Entrez le code ou ouvrez le lien.',
  'verifyEmail.subtitle.pending': 'Votre mot de passe est bon, mais votre compte doit d’abord être activé en prouvant que cette adresse est la vôtre. Nous venons d’envoyer un code et un lien à {email}.',
  'verifyEmail.subtitle.pending.inbox': 'Ouvrez votre boîte mail, et pensez à regarder dans les indésirables.',
  'verifyEmail.resend.prompt': 'Vous n’avez pas reçu le code ?',
  'verifyEmail.resend': 'Renvoyer le code',
  'verifyEmail.resend.busy': 'Envoi…',
  'verifyEmail.resend.locked': 'Renvoyer le code ({seconds}s)',
  'verifyEmail.resend.done': 'Code renvoyé !',
  'verifyEmail.link.invalid': 'Ce lien n’est plus valide. Entrez le code reçu dans le même e-mail.',
  'verifyEmail.handoff.opened': 'Le lien a été ouvert dans l’app Meeshy.',
  'verifyEmail.handoff.stay': 'Continuer dans le navigateur',
  'verifyEmail.arrival.title': 'Adresse confirmée !',
  'verifyEmail.arrival.lead': 'Nous préparons vos conversations…',
  'verifyEmail.arrival.status': 'Adresse confirmée — connexion…',
} as const;

export default fr;
