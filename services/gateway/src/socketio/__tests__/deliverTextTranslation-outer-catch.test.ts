/**
 * Le `catch` de fin de méthode de `_handleTextTranslationReady` : ce qui
 * l'atteint, et ce qui ne doit plus l'atteindre (#17026).
 *
 * ─── Pourquoi ce fichier existe ──────────────────────────────────────────────
 *
 * Ces deux témoins vivaient dans `MeeshySocketIOManager.test.ts`, qui est hors
 * budget (dette héritée : 8 158 lignes). **Un fichier déjà hors budget est
 * interdit d'ajout** — on extrait d'abord, on ajoute ensuite (`CLAUDE.md`
 * racine, #4531). Le cliquet de taille est tombé sur le lot #17026 en le disant
 * exactement : `8158 → 8192`. La bonne réponse n'est pas de raboter les
 * commentaires du lot, c'est de lui donner sa place.
 *
 * ─── Le premier témoin a CHANGÉ DE SENS, et le changement est le lot ─────────
 *
 * Il assertait, sous le titre « increments stats.errors when io.to.emit
 * throws », qu'une émission vivante tombée atteint le `catch` de fin de méthode
 * et incrémente `stats.errors`. C'était une description EXACTE du comportement
 * — et ce comportement était le DÉFAUT : le `catch` est en aval de l'enfilage
 * hors ligne, donc y arriver annulait le rejeu de la traduction pour TOUS les
 * absents, définitivement (le `message:new` enfilé à l'envoi porte
 * `translations: []`, et aucun client ne refetch de lui-même tant qu'il n'ouvre
 * pas la conversation).
 *
 * Le témoin assert donc la garantie NEUVE, pas l'absence de l'ancienne : rien
 * n'est désactivé ni sauté, la propriété est inversée avec sa raison. Un témoin
 * de coverage qui gêne nomme souvent le contrat qu'on vient de changer.
 *
 * Et la couverture du `catch` extérieur est reprise par le second témoin, sur
 * un chemin qui y mène VRAIMENT — sans quoi l'inversion aurait troqué une
 * garantie contre un trou.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Doit rester TEXTUELLEMENT avant l'import du manager : son seul effet attendu
// est l'enregistrement des doubles socket.io / services / handlers.
import { getIoState } from './helpers/message-new-parity-mocks';

import { MeeshySocketIOManager } from '../MeeshySocketIOManager';
import { makeTranslationService, makePrisma } from './helpers/message-new-parity-fixtures';

const CONV = 'conv-123456789012';

describe('_handleTextTranslationReady — le catch de fin de méthode', () => {
  let manager: any;
  let prisma: ReturnType<typeof makePrisma>;
  let ioState: ReturnType<typeof getIoState>;

  const data = (messageId: string) => ({
    taskId: `task-${messageId}`,
    result: { messageId, translatedText: 'Bonjour', sourceLanguage: 'en', confidenceScore: 0.9 },
    targetLanguage: 'fr',
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    ioState = getIoState();
    ioState.to.mockClear();
    ioState.toEmit.mockClear();
    // `clearAllMocks` efface les APPELS, jamais les IMPLÉMENTATIONS : sans cette
    // ligne, un témoin qui fait lever `emit` le ferait lever pour les suivants.
    ioState.toEmit.mockImplementation(() => undefined);
    ioState.sockets.sockets.clear();
    ioState.sockets.adapter.rooms.clear();

    prisma = makePrisma();
    (prisma.message.findUnique as any).mockResolvedValue({ conversationId: CONV });
    (prisma.conversation.findUnique as any).mockResolvedValue(null);

    manager = new MeeshySocketIOManager({} as any, prisma as any, makeTranslationService() as any);
    await manager.initialize();
  });

  it("#17026 — une émission tombée ne remonte PAS au catch de fin de méthode", async () => {
    ioState.toEmit.mockImplementationOnce(() => {
      throw new Error('socket emit crashed in textTranslation');
    });

    const before = manager.getStats().errors;
    await manager._handleTextTranslationReady(data('msg-txt-outer'));

    expect(manager.getStats().errors).toBe(before);
  });

  it('incrémente stats.errors quand la normalisation de la conversation LÈVE', async () => {
    // Un chemin qui atteint le `catch` extérieur pour de bon : il est en amont
    // de l'audience comme de l'émission, et rien ne le garde — c'est la
    // signature d'une conversation introuvable ou d'un cache en défaut, pas
    // d'un canal best-effort.
    jest
      .spyOn(manager as any, 'normalizeConversationId')
      .mockRejectedValueOnce(new Error('conversation id unresolvable') as never);

    const before = manager.getStats().errors;
    await manager._handleTextTranslationReady(data('msg-txt-outer-2'));

    expect(manager.getStats().errors).toBe(before + 1);
  });
});
