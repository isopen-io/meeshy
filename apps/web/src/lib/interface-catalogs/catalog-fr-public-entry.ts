/**
 * L'ENTRÉE PUBLIQUE — tranche du catalogue `catalog-fr.ts`, extraite pour tenir le
 * budget de taille (CLAUDE.md) : le catalogue la RÉPAND (#10007). L'en-tête des
 * pages publiques (marque, sélecteur de langue), l'écran de connexion et la
 * saisie du lien par e-mail.
 */
const frPublicEntry = {
  'publicHeader.home': 'Accueil de Meeshy',
  'publicHeader.language': 'Langue',
  'brand.credit.hint': 'ouvre la plateforme services.ceo dans un nouvel onglet',
  'login.offline': 'Hors ligne — la connexion n’est pas possible pour l’instant.',
  'login.twoFactor.title': 'Double authentification',
  'login.twoFactor.lead': 'Entrez le code de votre application d’authentification.',
  'login.twoFactor.code': 'Code à 6 chiffres',
  'login.twoFactor.submit': 'Valider',
  'login.twoFactor.busy': 'Vérification…',
  'login.twoFactor.cancel': 'Annuler',
  'login.passwordDoor': 'Se connecter avec un identifiant et un mot de passe',
  'login.username.label': 'E-mail, téléphone ou pseudo',
  'login.username.placeholder': 'Identifiant, e-mail ou téléphone',
  'login.password.label': 'Mot de passe',
  'login.submit': 'Se connecter',
  'login.submit.busy': 'Connexion…',
  'login.emailDoor': 'Se connecter par e-mail',
  'login.forgotPassword': 'Mot de passe oublié ?',
  'login.forgotPassword.label': 'Mot de passe oublié',
  'login.noAccount': 'Pas de compte ?',
  'login.createAccount': 'Créer un compte',
  'magicLink.title': 'Votre adresse e-mail',
  'magicLink.howItWorks': 'Comment ça marche',
  'magicLink.howItWorks.text': 'Pas de mot de passe à retenir : nous vous envoyons un lien par e-mail. Ouvrez-le et vous êtes connecté.',
  'magicLink.email.label': 'Adresse email',
  'magicLink.email.placeholder': 'nom@exemple.com',
  'magicLink.email.invalid': 'Adresse e-mail invalide',
  'magicLink.rateLimited': 'Trop de demandes — réessayez dans une heure.',
  'magicLink.offline': 'Pas de connexion. Vérifiez votre réseau et réessayez.',
  'magicLink.submit': 'Recevoir le lien',
  'magicLink.submit.busy': 'Envoi…',
  'magicLink.flowTitle': 'Connexion par e-mail',
  'magicLink.validating': 'Vérification du lien…',
  'magicLink.invalid.title': 'Lien invalide ou expiré',
  'magicLink.invalid.body': 'Un lien de connexion expire après 10 minutes et ne sert qu’une fois.',
  'magicLink.requestNew': 'Demander un nouveau lien',
  'magicLink.backToLogin': 'Retour à la connexion',
  'magicLink.retry': 'Réessayer',
  'magicLink.resend': 'Renvoyer',
  'magicLink.resend.label': 'Renvoyer le lien',
  'magicLink.cancel': 'Annuler',
  'magicLink.linkExpired': 'Lien expiré, renvoyez-en un nouveau',
} as const;

export default frPublicEntry;
