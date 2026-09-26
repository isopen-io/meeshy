/**
 * LA VÉRIFICATION EN ATTENTE D'UNE CONNEXION PAR MOT DE PASSE (#8034).
 *
 * Un e-mail inconnu tapé à la porte du mot de passe devient un compte SANS
 * mot de passe (contrat #8033) : la passerelle ne l'applique que s'il voyage
 * AVEC le code reçu — preuve que celui qui l'a tapé possède l'adresse. Entre
 * les deux écrans, il vit ICI, en mémoire vive et nulle part ailleurs : jamais
 * `localStorage`, jamais `sessionStorage`, jamais l'adresse. Un rechargement
 * l'oublie ; le compte reste alors joignable par le code et le lien.
 *
 * `accountCreated` choisit la phrase de l'écran du code (compte créé à
 * l'instant, ou compte qui attendait déjà sa vérification).
 *
 * `password` est ABSENT après une inscription sans numéro (#8055) : le mot
 * de passe y est déjà enregistré sur le compte, il ne voyage pas une seconde
 * fois avec le code.
 */
export type PendingVerification = {
  readonly email: string;
  readonly password?: string;
  readonly accountCreated: boolean;
};

let pending: PendingVerification | null = null;

const normalized = (email: string) => email.trim().toLowerCase();

export function holdPendingVerification(next: PendingVerification): void {
  pending = next;
}

export function pendingVerificationFor(email: string): PendingVerification | null {
  if (pending === null) return null;
  return normalized(pending.email) === normalized(email) ? pending : null;
}

export function forgetPendingVerification(): void {
  pending = null;
}
