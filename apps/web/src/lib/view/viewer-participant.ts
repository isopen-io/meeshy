import type { Viewer } from '@/lib/api/viewer';

/**
 * **LA LIGNE DE PARTICIPATION DU LECTEUR — LE SITE UNIQUE** (#20264).
 *
 * `viewer.id` ne nomme pas toujours la même COLONNE : un inscrit y porte son
 * `User.id`, un invité de lien y porte son `Participant.id` (`resolveViewer`,
 * `lib/api/viewer.ts` — `isAnonymous` reste vrai, `id` n'est plus `null`).
 * C'est la règle que la passerelle épelle pour ses propres requêtes
 * (`services/gateway/CLAUDE.md` : « une requête `Participant` sur cette clé
 * doit choisir sa COLONNE »), et le symptôme de la mélanger est une ligne
 * INTROUVABLE — pas une erreur.
 *
 * Trois orthographes de cette lecture vivaient dans `apps/web`, et seule la
 * plus consultée était fausse : `menuViewerOf` résolvait les deux colonnes,
 * `selfSenderOf` branchait sur `isAnonymous`, et le composeur du fil cherchait
 * `p.userId === viewer.id` SEUL. Un visiteur de lien n'y avait donc jamais de
 * ligne, `Composer` recevait `rights: undefined`, et son contrat lit cette
 * absence « tout est autorisé » : les tuiles du tiroir s'offraient à qui l'hôte
 * les avait retirées, pour un geste que la passerelle refuse (loi 4 prise à
 * l'envers — un contrôle qui existe sans avoir d'effet).
 *
 * **La colonne se choisit sur la NATURE de la clé, jamais par un `||` sur les
 * deux.** En production les deux formes rendent le même verdict (un
 * `Participant.id` ne vaut jamais un `User.id`), mais la disjonction ne DIT
 * rien : elle laisse croire que la clé est de nature inconnue, et c'est
 * précisément l'ignorance qui a produit la troisième orthographe.
 */
export function viewerParticipantOf<P extends { readonly id: string; readonly userId?: string | undefined }>(input: {
  readonly participants: readonly P[] | undefined;
  readonly viewer: Pick<Viewer, 'id' | 'isAnonymous'>;
}): P | undefined {
  const { participants, viewer } = input;
  const key = viewer.id;
  if (participants === undefined || key === null || key === '') return undefined;
  return viewer.isAnonymous ? participants.find((p) => p.id === key) : participants.find((p) => p.userId === key);
}
