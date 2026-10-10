import type { SessionState } from '@/lib/api/session';
import type { CoqueNative } from '@/lib/native-shell';
import type { SendSheetRequest } from '@/lib/send/send-sheet-store';

import { requestOfIncomingShare, type IncomingShare } from './incoming-share';

type SessionStoreLike = {
  getState(): { readonly session: SessionState };
  subscribe(listener: (state: { readonly session: SessionState }) => void): () => void;
};

export type NativeInboxDeps = {
  readonly coque: CoqueNative | undefined;
  readonly source: 'fixtures' | 'gateway';
  readonly sessionStore: SessionStoreLike;
  readonly read: (coque: CoqueNative | undefined) => Promise<IncomingShare | null>;
  readonly listen: (coque: CoqueNative | undefined, onShare: () => void) => boolean;
  readonly open: (request: SendSheetRequest) => void;
};

/**
 * LA COQUE OUVRE LA FEUILLE D'ENVOI SUR CE QU'UNE AUTRE APPLICATION LUI PARTAGE
 * (#8884). Au démarrage — le partage d'un lancement à froid attend côté natif —
 * et à chaque réveil du pont (application déjà ouverte), le partage est pris
 * (`consume` ne le rend qu'une fois).
 *
 * **Pas connecté : le partage ATTEND, il n'est pas écarté.** L'utilisateur vient
 * de choisir une photo dans sa galerie ; lui faire taper son mot de passe pour
 * la retrouver perdue serait un défaut, pas une précaution. Un seul partage
 * attend : le plus récent remplace le précédent. La feuille s'ouvre à la
 * première session connectée — jamais deux fois pour le même partage.
 *
 * Les lectures sont chaînées : un réveil pendant une lecture en cours attend son
 * tour au lieu de la doubler.
 */
export function startNativeShareInbox(deps: NativeInboxDeps): (() => void) | null {
  let waiting: SendSheetRequest | null = null;
  let chain: Promise<void> = Promise.resolve();

  const mayOpen = (): boolean => deps.source === 'fixtures' || deps.sessionStore.getState().session.status === 'authenticated';

  const deliver = (): void => {
    if (waiting === null || !mayOpen()) return;
    const request = waiting;
    waiting = null;
    deps.open(request);
  };

  const pull = (): void => {
    chain = chain
      .then(() => deps.read(deps.coque))
      .then((share) => {
        const request = share === null ? null : requestOfIncomingShare(share);
        if (request !== null) waiting = request;
        deliver();
      })
      .catch(() => undefined);
  };

  if (!deps.listen(deps.coque, pull)) return null;
  const unsubscribe = deps.sessionStore.subscribe(deliver);
  pull();
  return unsubscribe;
}
