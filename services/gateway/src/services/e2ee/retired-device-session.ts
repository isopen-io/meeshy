/**
 * FERMER LA SESSION D'UN APPAREIL CHIFFRÉ QU'ON RETIRE (#13013).
 *
 * Un appareil volé, toujours connecté, se réenrôlerait aussitôt sous une
 * identité neuve : son retrait depuis une autre session ferme donc la sienne.
 * « Fermée » ne se dit que d'une session qui ne vit plus — `invalidateSession`
 * avale ses erreurs et rend `false` aussi bien pour une session déjà close que
 * pour une écriture ratée, d'où la relecture. La socket n'est coupée qu'alors.
 */
type Session = { readonly userId: string; readonly sessionId: string };

export type RetiredDeviceSessionDeps = {
  readonly invalidate: (sessionId: string) => Promise<boolean>;
  readonly isLive: (session: Session) => Promise<boolean>;
  readonly disconnect: (session: Session) => Promise<void>;
};

export function createRetiredDeviceSessionCloser(deps: RetiredDeviceSessionDeps): (session: Session) => Promise<boolean> {
  return async (session) => {
    const invalidated = await deps.invalidate(session.sessionId);
    if (!invalidated && (await deps.isLive(session))) return false;
    await deps.disconnect(session);
    return true;
  };
}
