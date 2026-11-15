/**
 * **POURQUOI LA SESSION S'EST FERMÉE** (#9613) — le motif de
 * `auth:session-revoked` (`lib/api/socket.ts`) est noté AVANT que la session ne
 * finisse (`api/realtime.ts`), puis l'écran de connexion l'explique UNE fois
 * (`components/session-end-notice.tsx`) : « fermée par l'équipe Meeshy » —
 * jamais un administrateur nommé —, « depuis un autre de vos appareils », « le
 * mot de passe a changé »…
 *
 * Gardé dans le stockage de la SESSION du navigateur (l'onglet, jamais le
 * disque durable) pour survivre au retour à la connexion, en mémoire vive
 * quand ce stockage refuse. Ce module n'est atteint que par `import()` : rien
 * n'en pèse sur la première peinture.
 */

export const SESSION_END_REASONS = ['admin_revoke', 'user_revoke', 'password_changed', 'logout', 'logout_all_devices', 'session_expired'] as const;

export type SessionEndReason = (typeof SESSION_END_REASONS)[number];

/** `activation_required` n'est pas une fin à expliquer : la connexion suivante mène au code d'activation. */
export function sessionEndReasonOf(raw: unknown): SessionEndReason | null {
  return SESSION_END_REASONS.find((reason) => reason === raw) ?? null;
}

type ReasonStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const KEY = 'meeshy.session-end';

export function createSessionEndMemory(storage: ReasonStorage | null) {
  let held: SessionEndReason | null = null;
  const attempt = <T>(gesture: () => T, fallback: T): T => {
    try {
      return gesture();
    } catch {
      return fallback;
    }
  };
  return {
    note(raw: unknown): void {
      held = sessionEndReasonOf(raw);
      attempt(() => (held === null ? storage?.removeItem(KEY) : storage?.setItem(KEY, held)), undefined);
    },
    pending(): SessionEndReason | null {
      return held ?? sessionEndReasonOf(attempt(() => storage?.getItem(KEY) ?? null, null));
    },
    dismiss(): void {
      held = null;
      attempt(() => storage?.removeItem(KEY), undefined);
    },
  };
}

const browserStorage = (): ReasonStorage | null => {
  try {
    return typeof sessionStorage === 'object' ? sessionStorage : null;
  } catch {
    return null;
  }
};

export const sessionEnd = createSessionEndMemory(browserStorage());
