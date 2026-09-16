/**
 * **LE BROUILLON D'UN GROUPE, ET CE QUI LE REFUSE** (#6706).
 *
 * Miroir de `validateCommunityDraft` (`api/communities.ts`) : la validation rend
 * soit le CORPS exact que la passerelle attend, soit le CHAMP à blâmer — jamais
 * un booléen. C'est ce qui permet à l'écran de poser un refus SOUS son champ
 * plutôt que dans un bandeau, et de le savoir avant qu'aucune requête ne parte.
 *
 * **Les bornes sont celles du serveur, recopiées ici parce qu'elles sont
 * MESURÉES** (`packages/shared/utils/validation.ts:128,131,629`) : titre 1-100,
 * description ≤ 500, participants ≤ 250. Les recopier est le prix d'un refus
 * immédiat ; le témoin les cite avec leur source pour qu'une évolution serveur
 * se voie.
 *
 * **Deux règles que le serveur N'IMPOSE PAS, et que ce module impose :**
 *
 * 1. **Un titre est OBLIGATOIRE.** Le schéma de la passerelle le dit en prose
 *    (« required for group/public », `conversation-request.ts:32`) sans
 *    l'imposer : un groupe sans titre reçoit un titre DÉRIVÉ à l'affichage
 *    (`generateDefaultConversationTitle`). Laisser partir un groupe sans nom
 *    produirait une conversation que personne ne sait nommer ensuite — et,
 *    depuis #6790, on sait ce que coûte un titre qu'aucun humain n'a choisi.
 * 2. **Au moins un participant.** Le serveur accepte `participantIds: []` — il
 *    créerait un groupe d'une seule personne. Ce n'est pas un groupe, c'est une
 *    note ; l'écran ne doit pas l'offrir.
 *
 * **Le créateur n'est JAMAIS dans la liste.** La passerelle l'ajoute elle-même
 * en `role: 'creator'`, et l'y mettre rend **422 `INVALID_OPERATION`**
 * (`core-lifecycle.ts:121`) — un statut que la route ne déclare même pas dans
 * ses réponses. Le filtrer ici plutôt que de compter sur l'écran : c'est la
 * seule place où la règle est vraie quel que soit l'appelant.
 */

/** Bornes SERVEUR, mesurées (`packages/shared/utils/validation.ts`). */
export const GROUP_TITLE_MAX = 100;
export const GROUP_DESCRIPTION_MAX = 500;
export const GROUP_PARTICIPANTS_MAX = 250;

export type GroupDraft = {
  readonly title: string;
  readonly description: string;
  readonly participantIds: readonly string[];
};

export type GroupField = 'title' | 'description' | 'participants';

export type GroupBody = {
  readonly title: string;
  readonly description?: string;
  readonly participantIds: readonly string[];
};

export type GroupValidation =
  | { readonly ok: true; readonly body: GroupBody }
  | { readonly ok: false; readonly field: GroupField };

export const EMPTY_GROUP_DRAFT: GroupDraft = { title: '', description: '', participantIds: [] };

/**
 * Les participants RÉELLEMENT envoyés : dédoublonnés, sans le lecteur, sans
 * valeur vide — dans l'ordre où l'utilisateur les a choisis, parce que c'est
 * l'ordre qu'il voit à l'écran.
 */
export function participantsToSend(participantIds: readonly string[], viewerId: string | null): readonly string[] {
  const kept = new Set<string>();
  for (const id of participantIds) {
    const trimmed = id.trim();
    if (trimmed === '' || trimmed === viewerId) continue;
    kept.add(trimmed);
  }
  return [...kept];
}

export function validateGroupDraft(draft: GroupDraft, viewerId: string | null): GroupValidation {
  const title = draft.title.trim();
  const description = draft.description.trim();
  const participantIds = participantsToSend(draft.participantIds, viewerId);

  if (title === '' || title.length > GROUP_TITLE_MAX) return { ok: false, field: 'title' };
  if (description.length > GROUP_DESCRIPTION_MAX) return { ok: false, field: 'description' };
  if (participantIds.length === 0 || participantIds.length > GROUP_PARTICIPANTS_MAX) {
    return { ok: false, field: 'participants' };
  }

  return {
    ok: true,
    body: {
      title,
      ...(description === '' ? {} : { description }),
      participantIds,
    },
  };
}

/**
 * CE QU'UN REFUS DE CRÉATION DIT — distinct de `creationOutcomeOf`
 * (`creation.ts`), qui sert le DIRECT : un direct n'a pas de champ à blâmer,
 * un groupe en a trois.
 *
 * Le 422 `INVALID_OPERATION` ne devrait plus se produire (le créateur est
 * filtré), mais il est NOMMÉ plutôt qu'avalé dans le refus générique : si la
 * passerelle le rend quand même, le message doit désigner la liste, seul endroit
 * où l'utilisateur peut agir.
 */
export const GROUP_REFUSAL: Readonly<Record<GroupField, string>> = {
  title: 'Donnez un nom à ce groupe — 100 caractères au plus.',
  description: 'La description ne peut pas dépasser 500 caractères.',
  participants: 'Choisissez au moins une personne, et 250 au plus.',
};

export const GROUP_CREATION_FAILED = 'Impossible de créer ce groupe — réessayez dans un instant.';
export const GROUP_CREATION_OFFLINE = 'Hors ligne — reconnectez-vous puis créez le groupe.';

export type GroupOutcome =
  | { readonly kind: 'open'; readonly conversationId: string }
  | { readonly kind: 'invalid'; readonly field: GroupField; readonly message: string }
  | { readonly kind: 'failure'; readonly message: string };

export function groupOutcomeOf(params: {
  readonly result: { readonly ok: true; readonly data: { readonly id: string } } | { readonly ok: false; readonly status: number };
  readonly online: boolean;
}): GroupOutcome {
  if (params.result.ok) return { kind: 'open', conversationId: params.result.data.id };
  if (params.result.status === 422) {
    return { kind: 'invalid', field: 'participants', message: GROUP_REFUSAL.participants };
  }
  return { kind: 'failure', message: params.online ? GROUP_CREATION_FAILED : GROUP_CREATION_OFFLINE };
}
