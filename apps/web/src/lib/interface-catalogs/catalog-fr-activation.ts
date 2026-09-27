/**
 * LA MODAL « VALIDEZ VOTRE COMPTE » (#8239, loi serveur #8238) — tranche du
 * catalogue `catalog-fr.ts`, extraite pour tenir le budget de taille
 * (CLAUDE.md) : le catalogue la RÉPAND. De J7 à J28, l'invitation à prouver
 * son adresse et à ajouter un numéro, sans quitter l'app.
 */
const frActivation = {
  'activation.invite.title': 'Validez votre compte',
  'activation.invite.daysLeft': 'Il vous reste {days} jours pour valider votre compte. Ensuite, la connexion demandera un code.',
  'activation.invite.daysLeft.one': 'Il vous reste 1 jour pour valider votre compte. Ensuite, la connexion demandera un code.',
  'activation.invite.lead': 'Validez votre compte pour continuer à l’utiliser sans interruption.',
  'activation.email.label': 'Confirmez votre adresse e-mail',
  'activation.email.send': 'Recevoir le code',
  'activation.email.sending': 'Envoi…',
  'activation.email.sent': 'Code envoyé à {email}. Saisissez-le ci-dessous.',
  'activation.email.failed': 'Le code n’a pas pu être envoyé. Réessayez.',
  'activation.email.done': 'Adresse vérifiée ✓',
  'activation.phone.label': 'Ajoutez un numéro pour sécuriser et récupérer votre compte',
  'activation.phone.add': 'Ajouter mon numéro',
  'activation.phone.field': 'Numéro de téléphone',
  'activation.phone.hint': 'Au format international, par exemple +33 6 12 34 56 78',
  'activation.phone.send': 'Envoyer le code',
  'activation.phone.code': 'Code reçu par SMS',
  'activation.phone.verify': 'Valider',
  'activation.phone.busy': 'Envoi…',
  'activation.phone.invalid': 'Saisissez un numéro au format international (+…).',
  'activation.phone.failed': 'Ce numéro n’a pas pu être enregistré. Réessayez.',
  'activation.phone.codeInvalid': 'Code invalide ou expiré',
  'activation.phone.done': 'Numéro vérifié ✓',
  'activation.complete': 'Votre compte est validé. Merci !',
  'activation.later': 'Plus tard',
  'activation.close': 'Fermer',
} as const;

export default frActivation;
