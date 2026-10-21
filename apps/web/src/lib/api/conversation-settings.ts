import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';
import type { ConversationWriteRole } from '@meeshy/shared/types/conversation';

import { managementFailureOf, type MemberActionDeps, type MemberActionOutcome } from './conversation-member-actions';
import { conversationQueryKey, patchConversation, patchConversationDetail } from './conversations';
import type { ApiResult } from './http';
import type { Conversation } from './types';

/**
 * **LES RÉGLAGES D'UNE CONVERSATION DEPUIS SA FEUILLE** (#7836) — le pendant de
 * `ConversationSettingsViewModel.save()` (iOS) : un `PATCH /conversations/:id`
 * qui ne porte QUE ce qui change (la route n'écrit que les champs reçus,
 * `core-lifecycle.ts`). L'identité (nom, description, photo) est ouverte à un
 * modérateur, les permissions (qui peut écrire, annonces, mode lent,
 * traduction automatique) à un administrateur — la passerelle reste juge.
 *
 * OPTIMISTE : la liste et le fil prennent la valeur avant la réponse ; la
 * valeur SERVIE gagne ensuite ; un refus ou une panne rend aux deux caches
 * les champs touchés, tels qu'ils étaient.
 */
export type ConversationSettingsPatch = {
  readonly title?: string;
  readonly description?: string;
  /** `null` retire la photo. */
  readonly avatar?: string | null;
  readonly defaultWriteRole?: ConversationWriteRole;
  readonly isAnnouncementChannel?: boolean;
  readonly slowModeSeconds?: number;
  readonly autoTranslateEnabled?: boolean;
};

type Field = keyof ConversationSettingsPatch;
type Fields = Partial<Record<Field, unknown>>;

const fieldsOf = (patch: ConversationSettingsPatch): readonly Field[] => Object.keys(patch) as Field[];

/** Les champs de `ConversationSettingsPatch` sont ceux de `Conversation` ; `null` (retirer la photo) devient l'ABSENCE du champ, comme la passerelle le sert. */
function withFields(conversation: Conversation, values: Fields): Conversation {
  const cleared = new Set(Object.entries(values).flatMap(([key, value]) => (value === null || value === undefined ? [key] : [])));
  const kept = Object.entries(conversation).filter(([key]) => !cleared.has(key));
  const set = Object.entries(values).filter(([, value]) => value !== null && value !== undefined);
  return Object.fromEntries([...kept, ...set]) as unknown as Conversation;
}

function pick(source: Record<string, unknown> | undefined, fields: readonly Field[]): Fields {
  if (source === undefined) return {};
  return Object.fromEntries(fields.flatMap((field) => (field in source ? [[field, source[field]]] : [])));
}

function apply(deps: MemberActionDeps, conversationId: string, values: { readonly list: Fields; readonly detail: Fields }): void {
  patchConversation(deps.queryClient, conversationId, (c) => withFields(c, values.list));
  patchConversationDetail(deps.queryClient, conversationId, (c) => withFields(c, values.detail));
}

const servedOf = (result: ApiResult<unknown>): Record<string, unknown> | undefined =>
  result.ok && typeof result.data === 'object' && result.data !== null ? (result.data as Record<string, unknown>) : undefined;

export async function updateConversationSettings(params: {
  readonly deps: MemberActionDeps;
  readonly conversationId: string;
  readonly patch: ConversationSettingsPatch;
}): Promise<MemberActionOutcome> {
  const { deps, conversationId, patch } = params;
  const fields = fieldsOf(patch);
  let listBefore: Fields = {};
  patchConversation(deps.queryClient, conversationId, (c) => {
    listBefore = Object.fromEntries(fields.map((field) => [field, (c as unknown as Record<string, unknown>)[field]]));
    return c;
  });
  const detail = deps.queryClient.getQueryData<Conversation>(conversationQueryKey(conversationId)) as unknown as Record<string, unknown> | undefined;
  const detailBefore: Fields = Object.fromEntries(fields.map((field) => [field, detail?.[field]]));

  apply(deps, conversationId, { list: patch, detail: patch });
  if (deps.source !== 'gateway') return { ok: true };

  const rollback = () => apply(deps, conversationId, { list: listBefore, detail: detailBefore });
  let result: ApiResult<unknown>;
  try {
    result = await deps.transport.request<unknown>({ method: 'PATCH', path: conversationsEndpoints.byId(conversationId), body: patch });
  } catch (error) {
    rollback();
    return { ok: false, reason: 'failed', error: error instanceof Error ? error.message : 'network' };
  }
  if (!result.ok) {
    rollback();
    return managementFailureOf(result);
  }
  const served = pick(servedOf(result), fields);
  apply(deps, conversationId, { list: served, detail: served });
  return { ok: true };
}
