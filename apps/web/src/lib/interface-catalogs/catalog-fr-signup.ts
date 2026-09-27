/**
 * L'INSCRIPTION — tranche du catalogue `catalog-fr.ts`, extraite pour tenir le budget
 * de taille (CLAUDE.md) : le catalogue la RÉPAND. L'alerte d'une inscription
 * SANS numéro de téléphone (#8040) : ce que le numéro protège, et les deux
 * gestes — l'ajouter, ou continuer sans lui. L'adresse DÉJÀ utilisée (#8216) :
 * ce qui se passe, et le lien de connexion en un geste.
 */
const frSignup = {
  'signup.phoneNudge.title': 'Ajouter un numéro de téléphone ?',
  'signup.phoneNudge.body': 'Votre numéro sert à sécuriser votre compte et à le récupérer si vous perdez l’accès à votre e-mail.',
  'signup.phoneNudge.add': 'Ajouter mon numéro',
  'signup.phoneNudge.continue': 'Continuer quand même',
  'signup.emailTaken.message': 'Un compte existe déjà avec cette adresse.',
  'signup.emailTaken.sendLink': 'Recevoir un lien de connexion',
  'signup.emailTaken.forgotPassword': 'Mot de passe oublié ?',
  'signup.emailTaken.isItYou': 'Est-ce vous ?',
  'signup.emailTaken.itsMe': 'C’est moi — récupérer mon compte',
  'signup.emailTaken.notMe': 'Ce n’est pas moi',
  'signup.emailTaken.notMeNote': 'Le code envoyé à cette adresse sera demandé pour l’obtenir.',
  'signup.phone.skip': 'Continuer avec l’e-mail seulement',
  'signup.card.title': 'Votre compte',
  'signup.card.validateNow': 'Valider mon compte maintenant',
  'signup.card.validateNow.busy': 'Création du compte…',
  'signup.card.code.lead': 'Entrez le code à 6 chiffres envoyé à {email}, ou ouvrez le lien reçu.',
  'signup.card.verified': 'Compte validé !',
  'signup.card.verified.lead': 'Tout est prêt : vos proches vous lisent dans votre langue.',
  'signup.submit': 'S’inscrire',
  'signup.submit.busy': 'Inscription…',
  'signup.talk': 'Parler aux autres',
} as const;

export default frSignup;
