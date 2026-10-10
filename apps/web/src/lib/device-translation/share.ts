import type { ShareTranslationBody, SharedTranslationEnvelope, SharedTranslationInner } from '@meeshy/shared/types/shared-translation';
import type { SharedTranslationBinding, SharedTranslationKeySource } from '@meeshy/shared/utils/shared-translation-seal';

import { attempted } from './attempted';
import { deviceCacheKey, type KeyValueStore } from './cache';
import { createRecentKeys } from './recent-keys';
import type { DeliveredTranslation, OfferedMessage } from './scheduler';
import type { ShareOutcome } from './shared-translations-api';

/**
 * **L'APPAREIL PARTAGE CE QU'IL A TRADUIT** (#9899) — chaque traduction que cet
 * appareil livre part, SCELLÉE, vers les autres membres de la conversation : ils
 * l'ouvrent depuis le texte du message, que seuls ses lecteurs détiennent, et
 * n'ont plus à la recalculer. Le serveur garde l'enveloppe sans la lire.
 *
 * Le scellement est un PORT (`SealPort`) : ce qui le porte vit dans un Worker
 * (`seal-port.ts`), pour que le contrat partagé et son validateur ne pèsent ni
 * sur la page ni sur les écrans qui n'ont rien à sceller. La passerelle est un
 * port aussi.
 *
 * **Le partage n'est jamais sur le chemin de l'affichage.** La traduction est
 * déjà peinte quand il commence ; il ne lève pas, ne remonte aucune panne, et
 * chaque issue dit ce qu'on en fait :
 * - `shared` : posté (ou déjà partagé par un autre : le sien fait foi) — fini ;
 * - `refused` : la passerelle ne le veut pas, le renvoyer ne changerait rien —
 *   fini pour cette session, retenté à la suivante (un 401 d'une session
 *   expirée n'est pas un refus de la traduction) ;
 * - `declined` : le COMPTE a coupé ses accusés de lecture, et un partage en est
 *   un — plus rien ne se scelle ni ne part de la session ; la suivante relit le
 *   réglage en reposant la question à la passerelle ;
 * - `failed` : une panne — retenté à la prochaine livraison de cette traduction ;
 * - un sceau qui échoue (traduction plus longue que ce que la passerelle prend) :
 *   fini, il ne raccourcira pas.
 *
 * Jamais pour un message chiffré de bout en bout : son clair n'est pas ici, et la
 * dérivation par le texte y laisserait deviner un message court.
 */
export type SealPort = (params: {
  readonly binding: SharedTranslationBinding;
  readonly key: SharedTranslationKeySource;
  readonly inner: SharedTranslationInner;
}) => Promise<SharedTranslationEnvelope>;

/**
 * Ce que l'appareil a déjà posté avec succès, d'une session à l'autre. Une
 * traduction du cache est livrée à chaque ouverture du fil : sans registre, chaque
 * ouverture reposterait tout l'historique (le limiteur de la passerelle est
 * global, 300 requêtes par minute et par adresse). Il ne dit que `shared` —
 * ni un refus, ni une panne.
 */
export type ShareLedger = {
  readonly has: (key: string) => Promise<boolean>;
  readonly add: (key: string) => Promise<void>;
};

const LEDGER_PREFIX = 'shared|';

/** Le registre dans le même stockage que le cache des traductions : mêmes clés, autre préfixe. Il ne lève pas. */
export function createShareLedger(store: KeyValueStore): ShareLedger {
  return {
    has: async (key) => {
      try {
        return (await store.get(`${LEDGER_PREFIX}${key}`)) !== undefined;
      } catch {
        return false;
      }
    },
    add: async (key) => {
      try {
        await store.set(`${LEDGER_PREFIX}${key}`, '1');
      } catch {
        return;
      }
    },
  };
}

const MEMORY_LIMIT = 500;

const mayShare = (delivered: DeliveredTranslation, origin: OfferedMessage): boolean =>
  !origin.encrypted && origin.conversationId !== '' && delivered.messageId === origin.id && delivered.text.trim() !== '';

export function createTranslationSharer(params: {
  readonly seal: SealPort;
  readonly post: (conversationId: string, body: ShareTranslationBody) => Promise<ShareOutcome>;
  readonly ledger?: ShareLedger;
}): (delivered: DeliveredTranslation, origin: OfferedMessage) => Promise<void> {
  const { seal, post, ledger } = params;
  const settled = createRecentKeys(MEMORY_LIMIT);
  const flying = new Map<string, Promise<void>>();
  const account = { declined: false };

  const recorded = async (key: string): Promise<boolean> => ledger !== undefined && (await attempted(() => ledger.has(key), false));

  const send = async (key: string, delivered: DeliveredTranslation, origin: OfferedMessage): Promise<void> => {
    if (await recorded(key)) {
      settled.add(key);
      return;
    }
    const envelope = await attempted<SharedTranslationEnvelope | null>(
      () =>
        seal({
          binding: { conversationId: origin.conversationId, messageId: origin.id, targetLanguage: delivered.target, sourceContent: origin.content },
          key: { kdf: 'message-content' },
          inner: { v: 1, text: delivered.text, sourceLanguage: delivered.source, engine: delivered.engine },
        }),
      null,
    );
    if (envelope === null) {
      settled.add(key);
      return;
    }
    const outcome = await attempted<ShareOutcome>(
      () => post(origin.conversationId, { messageId: origin.id, targetLanguage: delivered.target, envelope }),
      'failed',
    );
    if (outcome === 'failed') return;
    if (outcome === 'declined') account.declined = true;
    settled.add(key);
    if (outcome === 'shared' && ledger !== undefined) await attempted(() => ledger.add(key), undefined);
  };

  return (delivered, origin) => {
    if (account.declined || !mayShare(delivered, origin)) return Promise.resolve();
    const key = deviceCacheKey({ messageId: origin.id, target: delivered.target, text: origin.content });
    if (settled.has(key)) return Promise.resolve();
    const running = flying.get(key);
    if (running !== undefined) return running;
    const turn = send(key, delivered, origin).finally(() => flying.delete(key));
    flying.set(key, turn);
    return turn;
  };
}
