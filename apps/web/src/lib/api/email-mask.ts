/** La puce des contacts masqués — la même pour une adresse et un numéro. */
export const CONTACT_MASK = '•';

/** La première lettre et le domaine (`a•••@meeshy.example`) : assez pour se
 * reconnaître, trop peu pour récolter une adresse. Sans dépendance, pour
 * qu'un écran d'authentification la prenne sans charger le profil. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return CONTACT_MASK.repeat(3);
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return local.length === 1 ? `${CONTACT_MASK}@${domain}` : `${local.slice(0, 1)}${CONTACT_MASK.repeat(3)}@${domain}`;
}
