import type { SessionState } from '@/lib/api/session';
import type { SendSheetRequest } from '@/lib/send/send-sheet-store';

import { requestOfIncomingShare, type IncomingShare } from './incoming-share';
import { SHARE_PATH } from './share-target';

export type ShareEntryDeps = {
  readonly sessionStatus: SessionState['status'];
  readonly source: 'fixtures' | 'gateway';
  readonly take: () => Promise<IncomingShare | null>;
  readonly open: (request: SendSheetRequest) => void;
  readonly navigate: (path: string, replace: boolean) => void;
};

export type ShareEntryOutcome = 'opened' | 'login' | 'empty';

/**
 * L'ARRIVÉE SUR `/share` (#8884) — le système a posté un partage, le worker l'a
 * rangé, la page s'ouvre. Trois issues, et une seule ne perd rien :
 *
 *  · **connecté** : le partage est lu (et purgé), la feuille d'envoi s'ouvre
 *    par-dessus l'accueil ;
 *  · **pas connecté** : on NE LIT PAS — le partage reste rangé (une heure au
 *    plus, `web-inbox.ts`) et la connexion ramène ici par `?next=`. C'est le
 *    choix « garder en attente » : écarter un partage parce qu'on n'a pas
 *    encore tapé son mot de passe perdrait la photo que l'utilisateur vient de
 *    choisir ;
 *  · **rien** (adresse rouverte, partage purgé ou expiré) : retour à l'accueil.
 *
 * `replace` partout : `/share` n'est pas un écran où revenir par « retour ».
 */
export async function enterSharedContent(deps: ShareEntryDeps): Promise<ShareEntryOutcome> {
  if (deps.source === 'gateway' && deps.sessionStatus !== 'authenticated') {
    deps.navigate(`/login?next=${encodeURIComponent(SHARE_PATH)}`, true);
    return 'login';
  }
  const received = await deps.take();
  const request = received === null ? null : requestOfIncomingShare(received);
  deps.navigate('/', true);
  if (request === null) return 'empty';
  deps.open(request);
  return 'opened';
}
