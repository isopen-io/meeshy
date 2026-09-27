import type { QueryClient } from '@tanstack/react-query';
import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';

import { forgetEphemeral } from '@/lib/view/ephemeral-reception';

import type { Transport } from '../net/transport';

import { expireLastMessage } from './list-preview';
import { patchThreadMessages } from './messages';
import { outcomeOf } from './outcome';
import { tombstoneQuotesOf } from './quote-tombstone';

/**
 * LA CONSOMMATION D'UNE FLAMME-ŒIL (#8304) — le contrat de #8302 :
 * `POST conversations/:id/messages/after-read/consume` `{ messageIds }` →
 * `{ data: { consumed } }`. Pour l'APPELANT seulement, la passerelle pose
 * l'échéance à maintenant et expire aussitôt (`message:expired` vers ses
 * autres appareils) ; elle ignore ce qui n'est pas une flamme-œil reçue.
 *
 * L'ADRESSE vient du catalogue généré (`byIdMessagesAfterReadConsume`, #8342).
 */
export function consumeAfterRead(
  transport: Transport,
  input: { readonly conversationId: string; readonly messageIds: readonly string[] },
): Promise<unknown> {
  return transport({
    method: 'POST',
    path: conversationsEndpoints.byIdMessagesAfterReadConsume(input.conversationId),
    body: { messageIds: [...input.messageIds] },
  });
}

export type AfterReadStorage = {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
};

export type AfterReadQueue = {
  /** Ajoute des messages VUS à consommer — idempotent. */
  readonly enqueue: (conversationId: string, messageIds: readonly string[]) => void;
  /** Ce qui attend encore l'accord du serveur : le fil le cache en attendant. */
  readonly pendingFor: (conversationId: string) => ReadonlySet<string>;
  /** Envoie tout ce qui attend ; une panne garde l'entrée, un refus la retire. */
  readonly flush: () => Promise<void>;
};

type Pending = Readonly<Record<string, readonly string[]>>;

function isPending(value: unknown): value is Pending {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((ids) => Array.isArray(ids) && ids.every((id) => typeof id === 'string'));
}

/**
 * LA FILE — une consommation qui n'est pas partie n'est pas perdue : le
 * lecteur a vu le message, et le retirer seulement de l'écran le laisserait
 * revenir au prochain chargement. Persistée (le lecteur peut fermer l'onglet
 * hors ligne), en mémoire si le stockage est refusé, vidée à chaque occasion
 * (sortie de conversation, retour du réseau, ouverture d'un fil).
 */
export function createAfterReadQueue(deps: {
  readonly storage: AfterReadStorage | null;
  readonly key: string;
  readonly send: (conversationId: string, messageIds: readonly string[]) => Promise<unknown>;
}): AfterReadQueue {
  const { storage, key, send } = deps;

  const read = (): Pending => {
    try {
      const raw = storage?.getItem(key);
      if (raw === null || raw === undefined) return {};
      const parsed: unknown = JSON.parse(raw);
      return isPending(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };

  let pending: Pending = read();
  const inFlight = new Set<string>();

  const write = (next: Pending): void => {
    pending = next;
    try {
      if (Object.keys(next).length === 0) storage?.removeItem(key);
      else storage?.setItem(key, JSON.stringify(next));
    } catch {
      return;
    }
  };

  const without = (conversationId: string, ids: readonly string[]): Pending => {
    const remaining = (pending[conversationId] ?? []).filter((id) => !ids.includes(id));
    const { [conversationId]: _dropped, ...rest } = pending;
    return remaining.length === 0 ? rest : { ...rest, [conversationId]: remaining };
  };

  const flushOne = async (conversationId: string): Promise<void> => {
    if (inFlight.has(conversationId)) return;
    const ids = pending[conversationId] ?? [];
    if (ids.length === 0) return;
    inFlight.add(conversationId);
    try {
      const outcome = outcomeOf(await send(conversationId, ids));
      if (outcome !== 'transient') write(without(conversationId, ids));
    } catch {
      return;
    } finally {
      inFlight.delete(conversationId);
    }
  };

  return {
    enqueue: (conversationId, messageIds) => {
      const held = pending[conversationId] ?? [];
      const added = messageIds.filter((id) => !held.includes(id));
      if (added.length === 0) return;
      write({ ...pending, [conversationId]: [...held, ...added] });
    },
    pendingFor: (conversationId) => new Set(pending[conversationId] ?? []),
    flush: async () => {
      await Promise.all(Object.keys(pending).map(flushOne));
    },
  };
}

/**
 * LE RETRAIT LOCAL, SUR-LE-CHAMP — le lecteur a quitté la conversation : il
 * n'y a personne pour regarder brûler la rangée (la combustion de
 * `applyMessageExpired` est pour qui est DANS le fil). Le message quitte le
 * cache du fil, la ligne de liste passe « expiré » (son texte n'a plus le
 * droit de rester dans un cache persisté) et les citations sont scellées —
 * les trois écritures de `message:expired`, sans son délai.
 */
export function removeAfterReadLocally(
  queryClient: QueryClient,
  input: { readonly conversationId: string; readonly messageIds: readonly string[]; readonly now?: Date },
): void {
  const { conversationId, messageIds } = input;
  if (messageIds.length === 0) return;
  const now = input.now ?? new Date();
  for (const messageId of messageIds) {
    expireLastMessage(queryClient, conversationId, messageId, now);
    tombstoneQuotesOf(queryClient, { conversationId, messageId, deletedAt: now.toISOString() });
    forgetEphemeral(messageId);
  }
  patchThreadMessages(queryClient, conversationId, (messages) =>
    messages.some((m) => messageIds.includes(m.id)) ? messages.filter((m) => !messageIds.includes(m.id)) : messages,
  );
}
