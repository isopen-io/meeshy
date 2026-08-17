import {
  createBridgeReadingOutlet,
  messageReaderFromStore,
  type ConversationMessageReader,
} from '../../reading/bridge-reading-outlet';
import type { LlmProvider } from '../../llm/types';
import type { MessageEntry, PendingAction } from '../../graph/state';

// G-126 — le débouché de LECTURE adossé à l'observer (contrat §5.1, C3).
//
// Ce que C3 exige, et que ces tests éprouvent : le pont ✦ se produit par un chemin qui
// ne peut pas écrire dans le fil — ni message, ni brouillon, ni file de livraison, ni
// identité d'emprunt. Le résultat n'est attribué à personne : c'est de la lecture rendue,
// pas une prise de parole.

const messages: MessageEntry[] = [
  { id: 'm1', senderId: 'user1', senderName: 'Alice', content: 'Salut tout le monde', timestamp: 1 },
  { id: 'm2', senderId: 'user2', senderName: 'Bob', content: 'On avance sur la maquette', timestamp: 2 },
  { id: 'm3', senderId: 'user1', senderName: 'Alice', content: 'Je valide la maquette demain', timestamp: 3 },
  { id: 'm4', senderId: 'user2', senderName: 'Bob', content: 'Parfait, je prepare la demo', timestamp: 4 },
  { id: 'm5', senderId: 'user1', senderName: 'Alice', content: 'On se voit vendredi alors', timestamp: 5 },
];

function makeLlm(content = 'La maquette est validee, demo vendredi.'): { llm: LlmProvider; chat: jest.Mock } {
  const chat = jest.fn().mockResolvedValue({
    content,
    usage: { inputTokens: 10, outputTokens: 5 },
    model: 'mock',
    latencyMs: 1,
  });
  return { llm: { name: 'mock', chat }, chat };
}

function makeReader(entries: MessageEntry[] = messages): ConversationMessageReader {
  return { readMessages: jest.fn().mockResolvedValue(entries) };
}

/**
 * Enferme un objet injecté derrière un Proxy qui LÈVE à tout accès hors liste blanche.
 * Un témoin de capacité : si le débouché tendait la main vers `setMessages`, `enqueue`
 * ou `publish`, le test exploserait au lieu de passer discrètement.
 */
function sealed<T extends object>(target: T, allowed: string[]): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (typeof prop === 'string' && !allowed.includes(prop)) {
        throw new Error(`Acces interdit depuis le debouche de lecture: ${prop}`);
      }
      return Reflect.get(t, prop, receiver);
    },
  });
}

describe('débouché de lecture du pont ✦ — chemin non écrivant (G-126, C3)', () => {
  describe('lecture rendue', () => {
    it('rend une ligne bornée à la plage demandée, adossée au résumé de l\'observer', async () => {
      const { llm, chat } = makeLlm();
      const outlet = createBridgeReadingOutlet({ llm, reader: makeReader() });

      const result = await outlet.readRangeSummary({
        conversationId: 'conv1',
        fromMessageId: 'm2',
        toMessageId: 'm4',
      });

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('La maquette est validee, demo vendredi.');
      expect(result!.messageCount).toBe(3);
      expect(result!.fromMessageId).toBe('m2');
      expect(result!.toMessageId).toBe('m4');
      expect(result!.conversationId).toBe('conv1');

      const sent = chat.mock.calls[0][0].messages[0].content as string;
      expect(sent).toContain('On avance sur la maquette');
      expect(sent).not.toContain('Salut tout le monde');
      expect(sent).not.toContain('On se voit vendredi alors');
    });

    it('ne rend RIEN — jamais un résumé fabriqué — quand la plage n\'est pas couverte (C2)', async () => {
      const { llm, chat } = makeLlm();
      const outlet = createBridgeReadingOutlet({ llm, reader: makeReader() });

      const result = await outlet.readRangeSummary({
        conversationId: 'conv1',
        fromMessageId: 'm2',
        toMessageId: 'jamais-vu',
      });

      expect(result).toBeNull();
      expect(chat).not.toHaveBeenCalled();
    });

    it('rend l\'absence quand la conversation n\'a aucun message en mémoire', async () => {
      const { llm, chat } = makeLlm();
      const outlet = createBridgeReadingOutlet({ llm, reader: makeReader([]) });

      const result = await outlet.readRangeSummary({
        conversationId: 'conv1',
        fromMessageId: 'm1',
        toMessageId: 'm2',
      });

      expect(result).toBeNull();
      expect(chat).not.toHaveBeenCalled();
    });

    it('se dégrade en absence si la lecture d\'état échoue — le plancher déterministe reste à la gateway (C1)', async () => {
      const { llm } = makeLlm();
      const reader: ConversationMessageReader = {
        readMessages: jest.fn().mockRejectedValue(new Error('Redis indisponible')),
      };
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const outlet = createBridgeReadingOutlet({ llm, reader });

      const result = await outlet.readRangeSummary({
        conversationId: 'conv1',
        fromMessageId: 'm1',
        toMessageId: 'm2',
      });

      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });
  });

  describe('témoins du NON-ÉCRIVANT', () => {
    it('ne touche AUCUNE écriture du magasin d\'état, même quand on lui en tend une', async () => {
      // Le magasin réel (RedisStateManager) porte des écritures. Ici on lui en donne un
      // complet, chaque écriture armée pour lever : le débouché n'en appelle aucune.
      const setMessages = jest.fn(() => { throw new Error('ecriture interdite: setMessages'); });
      const setSummary = jest.fn(() => { throw new Error('ecriture interdite: setSummary'); });
      const setToneProfiles = jest.fn(() => { throw new Error('ecriture interdite: setToneProfiles'); });
      const setCooldown = jest.fn(() => { throw new Error('ecriture interdite: setCooldown'); });
      const enqueue = jest.fn(() => { throw new Error('livraison interdite: enqueue'); });
      const publish = jest.fn(() => { throw new Error('publication interdite: publish'); });

      const store = {
        getMessages: jest.fn().mockResolvedValue(messages),
        setMessages, setSummary, setToneProfiles, setCooldown, enqueue, publish,
      };

      const { llm } = makeLlm();
      const outlet = createBridgeReadingOutlet({ llm, reader: messageReaderFromStore(store) });
      const result = await outlet.readRangeSummary({
        conversationId: 'conv1',
        fromMessageId: 'm1',
        toMessageId: 'm3',
      });

      expect(result).not.toBeNull();
      for (const write of [setMessages, setSummary, setToneProfiles, setCooldown, enqueue, publish]) {
        expect(write).not.toHaveBeenCalled();
      }
      expect(store.getMessages).toHaveBeenCalledWith('conv1');
    });

    it('n\'accède qu\'à `readMessages` et `chat` — tout autre accès à ses dépendances lève', async () => {
      const { llm } = makeLlm();
      const reader = makeReader();
      const outlet = createBridgeReadingOutlet({
        llm: sealed(llm, ['chat']),
        reader: sealed(reader, ['readMessages']),
      });

      const result = await outlet.readRangeSummary({
        conversationId: 'conv1',
        fromMessageId: 'm1',
        toMessageId: 'm2',
      });

      expect(result).not.toBeNull();
    });

    it('rend un objet SANS identité : aucun champ n\'attribue la ligne à un participant', async () => {
      const { llm } = makeLlm();
      const outlet = createBridgeReadingOutlet({ llm, reader: makeReader() });
      const result = await outlet.readRangeSummary({
        conversationId: 'conv1',
        fromMessageId: 'm1',
        toMessageId: 'm2',
      });

      expect(Object.keys(result!).sort()).toEqual(
        ['conversationId', 'fromMessageId', 'messageCount', 'summary', 'toMessageId'].sort(),
      );
      for (const forbidden of ['asUserId', 'senderId', 'senderName', 'userId', 'messageSource', 'replyToId']) {
        expect(result).not.toHaveProperty(forbidden);
      }
    });

    it('rend un résultat que le compilateur REFUSE de faire passer pour une action livrable', async () => {
      const { llm } = makeLlm();
      const outlet = createBridgeReadingOutlet({ llm, reader: makeReader() });
      const result = await outlet.readRangeSummary({
        conversationId: 'conv1',
        fromMessageId: 'm1',
        toMessageId: 'm2',
      });

      // Témoin de type, vérifié à la compilation des tests : si un jour un résultat de
      // lecture devenait assignable à une action de livraison (donc porteur d'une identité
      // d'emprunt), la directive ci-dessous deviendrait inutile et le build casserait.
      // @ts-expect-error — une lecture n'est pas une action livrable.
      const jamaisLivrable: PendingAction = result!;
      expect(jamaisLivrable).toBeDefined();
    });
  });
});
