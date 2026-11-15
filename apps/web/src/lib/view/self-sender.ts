import type { Participant } from '@/lib/api/types';
import type { Viewer } from '@/lib/api/viewer';

/**
 * L'AUTEUR D'UN ENVOI EN VOL : le lecteur, tel que la passerelle le servira
 * (#10120). Un compte est la ligne de son compte. Un invité est sa ligne de
 * participant (son `id`, il n'a pas de `userId`), sous le nom qu'il a DONNÉ :
 * la ligne porte son pseudo `ano_…`, que le message confirmé ne porte plus.
 */
export function selfSenderOf({
  participants,
  viewer,
}: {
  readonly participants: readonly Participant[] | undefined;
  readonly viewer: Viewer;
}): Participant | undefined {
  if (participants === undefined || viewer.id === null) return undefined;
  if (!viewer.isAnonymous) return participants.find((p) => p.userId === viewer.id);
  const row = participants.find((p) => p.id === viewer.id);
  return row === undefined ? undefined : { ...row, displayName: viewer.displayName };
}
