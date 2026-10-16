/**
 * LE MOT DE PASSE OUBLIÉ ET SA RÉINITIALISATION (#10823) — la source des clés
 * `recovery.*`. Chargée AVEC `/forgot-password` et `/reset-password`
 * (`lib/i18n-account-recovery-catalog.ts`), jamais au démarrage. Valeurs
 * d'iOS (`auth.forgotPassword.*`) quand la clé existe.
 */
const fr = {
  'recovery.forgot.lead': 'Recevez par e-mail un lien pour choisir un nouveau mot de passe.',
  'recovery.forgot.neverHad': 'Jamais eu de mot de passe ?',
  'recovery.forgot.neverHad.text': 'Ce même lien vous permet d’en créer un.',
  'recovery.reset.newPassword': 'Nouveau mot de passe',
  'recovery.reset.lead': 'Choisissez un nouveau mot de passe.',
  'recovery.reset.confirm': 'Confirmer le mot de passe',
  'recovery.reset.tooShort': 'Mot de passe trop court (min {min} caractères)',
  'recovery.reset.mismatch': 'Les mots de passe ne correspondent pas',
  'recovery.reset.submit': 'Enregistrer le mot de passe',
  'recovery.reset.submit.busy': 'Enregistrement…',
  'recovery.reset.invalid.title': 'Lien invalide ou expiré',
  'recovery.reset.invalid.text': 'Demandez un nouveau lien pour choisir votre mot de passe.',
  'recovery.reset.invalid.action': 'Demander un nouveau lien',
  'recovery.reset.done.title': 'Mot de passe enregistré',
  'recovery.reset.done.text': 'Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.',
} as const;

export default fr;
