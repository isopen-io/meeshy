import type { Participant } from '@/lib/api/types';
import type { Viewer } from '@/lib/api/viewer';

import { viewerParticipantOf } from './viewer-participant';

/**
 * L'AUTEUR D'UN ENVOI EN VOL : le lecteur, tel que la passerelle le servira
 * (#10120). Un compte est la ligne de son compte. Un invité est sa ligne de
 * participant (son `id`, il n'a pas de `userId`), sous le nom qu'il a DONNÉ :
 * la ligne porte son pseudo `ano_…`, que le message confirmé ne porte plus.
 *
 * La LECTURE de la ligne est partagée (`viewerParticipantOf`, #20264) ; ce qui
 * est propre à cette unité est la SURCHARGE du pseudo, et elle seule.
 */
export function selfSenderOf({
  participants,
  viewer,
}: {
  readonly participants: readonly Participant[] | undefined;
  readonly viewer: Viewer;
}): Participant | undefined {
  const row = viewerParticipantOf({ participants, viewer });
  if (row === undefined) return undefined;
  return viewer.isAnonymous ? { ...row, displayName: viewer.displayName } : row;
}
