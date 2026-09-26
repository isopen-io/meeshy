/**
 * L'ÉCRAN DU CODE REÇU PAR E-MAIL — tranche du catalogue `catalog-fr.ts`,
 * extraite pour tenir le budget de taille (CLAUDE.md) : le catalogue la
 * RÉPAND. `/auth/verify-email` (code à 6 chiffres, lien de l'e-mail) et la
 * saisie du code sur l'étape « e-mail envoyé » de la connexion par e-mail
 * (#8034, contrat #8033).
 */
const frVerifyEmail = {
  'verifyEmail.bar.title': 'Vérification de l’e-mail',
  'verifyEmail.noAddress': 'Ce lien ne porte aucune adresse e-mail à vérifier. Ouvrez-le depuis l’e-mail que Meeshy vous a envoyé.',
  'verifyEmail.backToLogin': 'Retour à la connexion',
  'verifyEmail.verified': 'E-mail vérifié !',
  'verifyEmail.continue': 'Continuer',
  'verifyEmail.title': 'Vérifiez votre e-mail',
  'verifyEmail.subtitle': 'Entrez le code à 6 chiffres envoyé à {email}',
  'verifyEmail.subtitle.created': 'Nous avons créé votre compte et envoyé un code et un lien à {email}. Entrez le code ou ouvrez le lien.',
  'verifyEmail.subtitle.pending': 'Votre compte attend sa vérification : nous avons renvoyé un code et un lien à {email}.',
  'verifyEmail.code.label': 'Code de vérification',
  'verifyEmail.submit': 'Vérifier',
  'verifyEmail.submit.busy': 'Vérification…',
  'verifyEmail.error.invalid': 'Code invalide ou expiré',
  'verifyEmail.error.offline': 'Pas de connexion. Vérifiez votre réseau et réessayez.',
  'verifyEmail.error.rateLimited': 'Trop de tentatives — réessayez dans quelques minutes.',
  'verifyEmail.resend.prompt': 'Vous n’avez pas reçu le code ?',
  'verifyEmail.resend': 'Renvoyer le code',
  'verifyEmail.resend.busy': 'Envoi…',
  'verifyEmail.resend.locked': 'Renvoyer le code ({seconds}s)',
  'verifyEmail.resend.done': 'Code renvoyé !',
  'verifyEmail.link.checking': 'Vérification du lien…',
  'verifyEmail.link.invalid': 'Ce lien n’est plus valide. Entrez le code reçu dans le même e-mail.',
  'verifyEmail.signingIn': 'Connexion…',
  'emailSent.codeOrLink': 'Entrez le code à 6 chiffres reçu à {email}, ou ouvrez le lien du même e-mail.',
} as const;

export default frVerifyEmail;
