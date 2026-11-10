import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';

import type { ExternalNetwork, ExternalOpening } from '@/lib/external-conversation/external-conversation';

import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT D'OUVERTURE D'UNE CONVERSATION EXTERNE** (#17118) —
 * `POST conversations.external` (`services/gateway/src/routes/conversations/external.ts`,
 * #17117) : `{ network, handle }` et RIEN d'autre (le schéma Zod de la
 * passerelle est strict, un champ en trop est refusé). 201 ouverte, 200
 * retrouvée ; la réponse est fermée et ne recopie jamais le numéro.
 *
 * En fixtures, aucune passerelle ne joue l'ami : la porte se dit absente
 * (`404`, que `externalOpeningOutcomeOf` lit « pas encore disponible ici »).
 */
export type ExternalConversationsDeps = {
  readonly source: DataSource;
  readonly transport: HttpTransport;
};

export function openExternalConversation(
  deps: ExternalConversationsDeps,
  request: { readonly network: ExternalNetwork; readonly handle: string },
): Promise<ApiResult<ExternalOpening>> {
  if (deps.source === 'fixtures') {
    return Promise.resolve({ ok: false, status: 404, error: 'Conversation externe indisponible en fixtures' });
  }
  return deps.transport.request<ExternalOpening>({
    method: 'POST',
    path: conversationsEndpoints.external,
    body: { network: request.network, handle: request.handle },
  });
}
