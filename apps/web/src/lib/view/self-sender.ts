import type { Participant } from '@/lib/api/types';
import type { Viewer } from '@/lib/api/viewer';

/**
 * **LA LIGNE DE PARTICIPATION DU LECTEUR, DANS CETTE CONVERSATION** (#10120,
 * #20264) — la loi UNIQUE, parce que `viewer.id` ne nomme pas la même colonne
 * selon le lecteur : un compte s'y reconnaît par `Participant.userId`, un
 * visiteur de lien par `Participant.id` — il n'a pas de `userId`, et le
 * `CLAUDE.md` de la passerelle l'écrit (« `authContext.userId` n'est PAS
 * toujours un `User.id` »).
 *
 * **Chercher sur la seule colonne `userId` ne trouve donc JAMAIS la ligne d'un
 * visiteur**, et une ligne introuvable ne dit pas « aucun droit » : elle dit
 * « je n'ai pas lu ». `Composer` lit cette absence « tout est autorisé » (son
 * contrat : « Absent ⇒ tout est autorisé »), si bien qu'un visiteur à qui
 * l'hôte avait retiré les images, les fichiers ou les vocaux voyait encore
 * leurs tuiles, et son geste échouait au serveur. C'était le défaut du fil
 * jusqu'à #20264 — à la ligne PRÉCÉDENTE de celle qui appelle `selfSenderOf`,
 * qui résolvait déjà les deux colonnes.
 *
 * Deux projections, et une seule résolution :
 *
 * | consommateur | ce qu'il prend |
 * |---|---|
 * | les droits du composeur (`useComposerAccess`) | `permissions` de la ligne, telle que servie |
 * | l'auteur d'un envoi EN VOL (`selfSenderOf`) | la ligne, plus le nom que l'invité a DONNÉ |
 */
export function viewerParticipationOf({
  participants,
  viewer,
}: {
  readonly participants: readonly Participant[] | undefined;
  readonly viewer: Viewer;
}): Participant | undefined {
  if (participants === undefined || viewer.id === null) return undefined;
  const id = viewer.id;
  return viewer.isAnonymous ? participants.find((p) => p.id === id) : participants.find((p) => p.userId === id);
}

/**
 * L'AUTEUR D'UN ENVOI EN VOL : le lecteur, tel que la passerelle le servira
 * (#10120). Un compte est la ligne de son compte. Un invité est sa ligne de
 * participant, sous le nom qu'il a DONNÉ : la ligne porte son pseudo `ano_…`,
 * que le message confirmé ne porte plus.
 *
 * PROJECTION de `viewerParticipationOf` (#20264) : le nom donné est une
 * affaire de COMPOSITION de la bulle optimiste, jamais une seconde façon de
 * reconnaître le lecteur.
 */
export function selfSenderOf({
  participants,
  viewer,
}: {
  readonly participants: readonly Participant[] | undefined;
  readonly viewer: Viewer;
}): Participant | undefined {
  const row = viewerParticipationOf({ participants, viewer });
  if (row === undefined || !viewer.isAnonymous) return row;
  return { ...row, displayName: viewer.displayName };
}
