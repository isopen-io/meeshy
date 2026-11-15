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
 *
 * `pendingSessionToken` (#8083) : le jeton d'ATTENTE que la passerelle remet
 * à CET appareil — il ne lit que l'état `pending` / `proven` de l'adresse
 * (`verification-watch.ts`), jamais une session. Même régime que le mot de
 * passe : mémoire vive seulement, jamais l'adresse, jamais journalisé.
 */
export type PendingVerification = {
  readonly email: string;
  readonly password?: string;
  readonly accountCreated: boolean;
  readonly pendingSessionToken?: string;
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
