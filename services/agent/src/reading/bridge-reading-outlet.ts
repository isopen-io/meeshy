import { summarizeMessageRange, type MessageRange } from '../agents/observer';
import type { MessageEntry } from '../graph/state';
import type { LlmProvider } from '../llm/types';

// ---------------------------------------------------------------------------------------------
// G-126 — Le débouché de LECTURE du pont ✦, adossé à l'observer (contrat §5.1, contrainte C3).
//
// Ce que C3 exige, en une phrase : le pont se produit par un chemin qui ne peut pas écrire dans
// le fil — pas de `generator`, pas de file de livraison, pas d'identité d'emprunt — sinon
// allumer les ponts allumerait l'impersonation.
//
// Le service, tel qu'il existe, produit pour LIVRER : `strategist` choisit un `asUserId`,
// `generator` fabrique un message sous cette identité, la file Redis le publie en ZMQ et la
// gateway le poste comme si un vrai utilisateur l'avait écrit. Ce module-ci ne prolonge pas ce
// chemin, il en ouvre un autre, à côté, et volontairement plus pauvre :
//
//   - il LIT la fenêtre de messages d'une conversation par un port réduit à une seule méthode
//     de lecture — on ne lui tend jamais un magasin d'état complet, donc il ne peut rien écrire,
//     même par accident ni par un futur ajout distrait ;
//   - il résume une PLAGE explicite via `summarizeMessageRange` (G-125), la brique de l'observer ;
//   - il rend un objet de lecture : une ligne, ses deux bornes, le compte réellement couvert.
//     Aucun champ n'attribue cette ligne à quelqu'un — ce n'est la parole de personne, et le
//     compilateur refuse de faire passer ce résultat pour une action livrable.
//
// Absence ⇒ absence : plage introuvable, mémoire vide, modèle muet ou lecture en panne rendent
// `null`. La gateway (G-127) retombe alors sur le pont déterministe (C1/C2) ; jamais un résumé
// fabriqué ni une couverture déclarée à tort.
//
// Inertie : ce module n'ouvre aucune boucle, n'écoute aucun canal, ne s'abonne à rien. Il ne
// fait quoi que ce soit que si on l'appelle, et `agent_grammar` reste OFF — aucun drapeau n'est
// touché ici.
// ---------------------------------------------------------------------------------------------

/**
 * Le port de lecture : une seule méthode, rien d'autre. En production il est adossé au magasin
 * de fenêtre glissante existant, mais il n'en emprunte QUE la lecture — c'est la réduction de
 * capacité qui tient C3, pas une discipline d'écriture.
 */
export type ConversationMessageReader = {
  readMessages(conversationId: string): Promise<MessageEntry[]>;
};

export type BridgeReadingRequest = {
  conversationId: string;
} & MessageRange;

/**
 * Ce que le débouché rend. Des faits de lecture, et rien de plus : pas d'auteur, pas de
 * destinataire, pas de langue déclarée (la paire `translations`+`originalLanguage` de l'étage
 * agent est montée par la gateway, G-127), pas de brouillon à poster.
 */
export type BridgeReadingResult = {
  conversationId: string;
  /** Une seule ligne, contrainte posée à la génération par l'observer (G-125). */
  summary: string;
  fromMessageId: string;
  toMessageId: string;
  /** Messages réellement couverts par la plage — compté, jamais déduit. */
  messageCount: number;
};

export type BridgeReadingOutlet = {
  readRangeSummary(request: BridgeReadingRequest): Promise<BridgeReadingResult | null>;
};

/**
 * Adapte un magasin de messages existant en port de lecture. Le paramètre est typé par sa
 * seule forme utile : le magasin réel peut porter des écritures, elles ne franchissent pas
 * cette frontière.
 */
export function messageReaderFromStore(
  store: { getMessages(conversationId: string): Promise<MessageEntry[]> },
): ConversationMessageReader {
  return {
    readMessages: (conversationId) => store.getMessages(conversationId),
  };
}

export function createBridgeReadingOutlet(deps: {
  llm: LlmProvider;
  reader: ConversationMessageReader;
}): BridgeReadingOutlet {
  return {
    async readRangeSummary(request) {
      let messages: MessageEntry[];
      try {
        messages = await deps.reader.readMessages(request.conversationId);
      } catch (error) {
        console.error('[Reading] Lecture de la fenêtre impossible (G-126):', error);
        return null;
      }

      const summary = await summarizeMessageRange(deps.llm, messages, {
        fromMessageId: request.fromMessageId,
        toMessageId: request.toMessageId,
      });
      if (!summary) return null;

      return {
        conversationId: request.conversationId,
        summary: summary.summary,
        fromMessageId: summary.fromMessageId,
        toMessageId: summary.toMessageId,
        messageCount: summary.messageCount,
      };
    },
  };
}
