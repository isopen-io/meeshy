/**
 * L'ÉCRAN DU CODE REÇU PAR E-MAIL — tranche du catalogue `catalog-fr.ts`,
 * extraite pour tenir le budget de taille (CLAUDE.md) : le catalogue la
 * RÉPAND. `/auth/verify-email` (code à 6 chiffres, lien de l'e-mail) et la
 * saisie du code sur l'étape « e-mail envoyé » de la connexion par e-mail
 * (#8034, contrat #8033).
 */
const frVerifyEmail = {
  'verifyEmail.backToLogin': 'Retour à la connexion',
  'verifyEmail.verified': 'E-mail vérifié !',
  'verifyEmail.code.label': 'Code de vérification',
  'verifyEmail.submit': 'Vérifier',
  'verifyEmail.submit.busy': 'Vérification…',
  'verifyEmail.error.invalid': 'Code invalide ou expiré',
  'verifyEmail.error.offline': 'Pas de connexion. Vérifiez votre réseau et réessayez.',
  'verifyEmail.error.rateLimited': 'Trop de tentatives — réessayez dans quelques minutes.',
  'verifyEmail.link.checking': 'Vérification du lien…',
  'verifyEmail.proven': 'Adresse confirmée ✓ — saisissez le code reçu pour vous connecter ici.',
  'emailSent.codeOrLink': 'Entrez le code à 6 chiffres reçu à {email}, ou ouvrez le lien du même e-mail.',
  'signInLink.switchAccount.title': 'Ouvrir un AUTRE compte ?',
  'signInLink.switchAccount.lead': 'Vous êtes connecté avec @{current}, mais ce que vous venez d’ouvrir mène à un autre compte :',
  'signInLink.switchAccount.warning': 'Si vous n’avez pas demandé ce lien ou ce code vous-même, annulez : votre session reste ouverte et rien ne change.',
  'signInLink.switchAccount.cancel': 'Annuler et rester sur @{current}',
  'signInLink.switchAccount.confirm': 'Ouvrir cet autre compte',
  'signInLink.switchAccount.kept': '@{current} restera dans vos comptes sur cet appareil.',
  'signInLink.switchAccount.busy': 'Un instant…',
  'signInLink.switchAccount.failed': 'Impossible d’ouvrir cet autre compte pour le moment. Votre session reste ouverte, et le lien est refermé.',
  'signInLink.switchAccount.expired': 'Ce lien a expiré : demandez-en un nouveau. Votre session reste ouverte.',
  'signInLink.switchAccount.leave': 'Revenir à l’accueil',
  'emailSent.title': 'E-mail envoyé',
  'emailSent.openLink': 'Ouvrez le lien reçu à {email}',
  'emailSent.nothingReceived': 'Rien reçu ?',
  'emailSent.nothingReceived.text': 'Regardez vos indésirables (spam) : le message peut y être tombé.',
} as const;

export default frVerifyEmail;
