/**
 * L'effacement des TRADUCTIONS PARTAGÉES (#9899) — audit adversarial C4.
 *
 * Une traduction partagée est la version scellée d'un message que les appareils
 * des membres se passent par la passerelle. Elle SURVIVAIT à tout ce qui retire
 * ou périme le message : suppression, édition, échéance d'éphémère, purge d'une
 * vue unique, anonymisation des messages d'un compte supprimé, et purge du
 * compte qui l'avait partagée. Chacun de ces écrivains vidait
 * `Message.translations` (les traductions du SERVEUR) sans jamais regarder la
 * table voisine.
 *
 * Le double de la table APPLIQUE le `where` (`helpers/shared-translation-table`) :
 * ce que ces témoins lisent, ce sont les lignes qui RESTENT, jamais la clause
 * reçue — une clause fausse passe aussi bien qu'une juste sous un double qui
 * répond `{ count: n }`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockWarn = jest.fn<(message: string, context: Record<string, unknown>) => void>();
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({
      warn: (message: string, context: Record<string, unknown>) => mockWarn(message, context),
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import {
  eraseSharedTranslations,
  eraseSharedTranslationsOfAccount,
} from '../../../../services/messaging/sharedTranslationErasure';
import {
  ORIGINAL_SOURCE_VERSION,
  sharedTranslationRow,
  sharedTranslationTable,
} from '../../../helpers/shared-translation-table';

const MESSAGE = '507f1f77bcf86cd799439011';
const OTHER_MESSAGE = '507f1f77bcf86cd799439012';
const THIRD_MESSAGE = '507f1f77bcf86cd799439013';
const EDITED_AT = '2026-10-10T12:00:00.000Z';
const EARLIER_EDIT = '2026-10-09T08:30:00.000Z';

beforeEach(() => {
  mockWarn.mockClear();
});

describe('eraseSharedTranslations — par message', () => {
  it('efface toutes les versions et toutes les langues du message nommé', async () => {
    const table = sharedTranslationTable([
      sharedTranslationRow({ id: 'fr-original', messageId: MESSAGE, targetLanguage: 'fr' }),
      sharedTranslationRow({ id: 'en-original', messageId: MESSAGE, targetLanguage: 'en' }),
      sharedTranslationRow({ id: 'fr-edited', messageId: MESSAGE, targetLanguage: 'fr', sourceVersion: EDITED_AT }),
    ]);

    await eraseSharedTranslations({ sharedTranslation: table.delegate } as never, { messageIds: [MESSAGE] });

    expect(table.remainingIds()).toEqual([]);
  });

  it('ne touche à aucune ligne des AUTRES messages', async () => {
    const table = sharedTranslationTable([
      sharedTranslationRow({ id: 'ciblée', messageId: MESSAGE }),
      sharedTranslationRow({ id: 'voisine', messageId: OTHER_MESSAGE }),
    ]);

    await eraseSharedTranslations({ sharedTranslation: table.delegate } as never, { messageIds: [MESSAGE] });

    expect(table.remainingIds()).toEqual(['voisine']);
  });

  it('efface un lot de messages en UNE requête', async () => {
    const table = sharedTranslationTable([
      sharedTranslationRow({ id: 'a', messageId: MESSAGE }),
      sharedTranslationRow({ id: 'b', messageId: OTHER_MESSAGE }),
      sharedTranslationRow({ id: 'c', messageId: THIRD_MESSAGE }),
    ]);

    await eraseSharedTranslations({ sharedTranslation: table.delegate } as never, {
      messageIds: [MESSAGE, OTHER_MESSAGE],
    });

    expect(table.deleteMany).toHaveBeenCalledTimes(1);
    expect(table.remainingIds()).toEqual(['c']);
  });

  it('sans message, n’interroge pas la base — et surtout n’émet jamais un `deleteMany` sans filtre', async () => {
    const table = sharedTranslationTable([sharedTranslationRow({ id: 'intacte' })]);

    await eraseSharedTranslations({ sharedTranslation: table.delegate } as never, { messageIds: [] });

    expect(table.deleteMany).not.toHaveBeenCalled();
    expect(table.remainingIds()).toEqual(['intacte']);
  });
});

describe('eraseSharedTranslations — après une édition (`keepSourceVersion`)', () => {
  it('efface les versions PÉRIMÉES et garde celle que l’édition vient d’écrire', async () => {
    const table = sharedTranslationTable([
      sharedTranslationRow({ id: 'original', messageId: MESSAGE, sourceVersion: ORIGINAL_SOURCE_VERSION }),
      sharedTranslationRow({ id: 'édition-précédente', messageId: MESSAGE, sourceVersion: EARLIER_EDIT }),
      sharedTranslationRow({ id: 'version-courante', messageId: MESSAGE, sourceVersion: EDITED_AT }),
    ]);

    await eraseSharedTranslations({ sharedTranslation: table.delegate } as never, {
      messageIds: [MESSAGE],
      keepSourceVersion: EDITED_AT,
    });

    expect(table.remainingIds()).toEqual(['version-courante']);
  });

  it('garde la version courante dans TOUTES ses langues', async () => {
    const table = sharedTranslationTable([
      sharedTranslationRow({ id: 'courante-fr', messageId: MESSAGE, targetLanguage: 'fr', sourceVersion: EDITED_AT }),
      sharedTranslationRow({ id: 'courante-en', messageId: MESSAGE, targetLanguage: 'en', sourceVersion: EDITED_AT }),
      sharedTranslationRow({ id: 'périmée-en', messageId: MESSAGE, targetLanguage: 'en' }),
    ]);

    await eraseSharedTranslations({ sharedTranslation: table.delegate } as never, {
      messageIds: [MESSAGE],
      keepSourceVersion: EDITED_AT,
    });

    expect(table.remainingIds()).toEqual(['courante-fr', 'courante-en']);
  });

  it('ne touche pas aux autres messages, quelle que soit leur version', async () => {
    const table = sharedTranslationTable([
      sharedTranslationRow({ id: 'voisine-originale', messageId: OTHER_MESSAGE }),
      sharedTranslationRow({ id: 'voisine-éditée', messageId: OTHER_MESSAGE, sourceVersion: EARLIER_EDIT }),
    ]);

    await eraseSharedTranslations({ sharedTranslation: table.delegate } as never, {
      messageIds: [MESSAGE],
      keepSourceVersion: EDITED_AT,
    });

    expect(table.remainingIds()).toEqual(['voisine-originale', 'voisine-éditée']);
  });
});

describe('eraseSharedTranslations — BEST-EFFORT, comme le retrait qui l’appelle', () => {
  it('un `deleteMany` qui échoue ne fait jamais échouer l’opération de la personne', async () => {
    const table = sharedTranslationTable([sharedTranslationRow()]);
    table.deleteMany.mockRejectedValueOnce(new Error('mongo down'));

    await expect(
      eraseSharedTranslations({ sharedTranslation: table.delegate } as never, { messageIds: [MESSAGE] })
    ).resolves.toBeUndefined();
  });

  it('journalise l’échec, avec le message visé', async () => {
    const table = sharedTranslationTable();
    table.deleteMany.mockRejectedValueOnce(new Error('mongo down'));

    await eraseSharedTranslations({ sharedTranslation: table.delegate } as never, {
      messageIds: [MESSAGE],
      keepSourceVersion: EDITED_AT,
    });

    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn.mock.calls[0][1]).toMatchObject({ messageIds: [MESSAGE], keepSourceVersion: EDITED_AT });
  });

  it('un client sans délégué `sharedTranslation` (double de test, client périmé) ne lève pas non plus', async () => {
    await expect(eraseSharedTranslations({} as never, { messageIds: [MESSAGE] })).resolves.toBeUndefined();
    expect(mockWarn).toHaveBeenCalledTimes(1);
  });

  it('un échec sur un lot n’a rien effacé à moitié : la ligne reste, l’appelant n’en sait rien', async () => {
    const table = sharedTranslationTable([sharedTranslationRow({ id: 'reste' })]);
    table.deleteMany.mockRejectedValueOnce(new Error('timeout'));

    await eraseSharedTranslations({ sharedTranslation: table.delegate } as never, { messageIds: [MESSAGE] });

    expect(table.remainingIds()).toEqual(['reste']);
  });
});

describe('eraseSharedTranslationsOfAccount — la purge du compte qui avait partagé', () => {
  const USER = '507f1f77bcf86cd799439aa1';
  const PARTICIPANT_IN_A = '507f1f77bcf86cd799439b01';
  const PARTICIPANT_IN_B = '507f1f77bcf86cd799439b02';
  const SOMEONE_ELSE = '507f1f77bcf86cd799439b99';

  const participantsOf = (ids: readonly string[]) => ({
    findMany: jest.fn(async (_args: unknown) => ids.map((id) => ({ id }))),
  });

  it('efface les traductions partagées par TOUS les participants du compte, dans toutes ses conversations', async () => {
    const table = sharedTranslationTable([
      sharedTranslationRow({ id: 'dans-A', sharedById: PARTICIPANT_IN_A, messageId: MESSAGE }),
      sharedTranslationRow({ id: 'dans-B', sharedById: PARTICIPANT_IN_B, messageId: OTHER_MESSAGE }),
    ]);

    await eraseSharedTranslationsOfAccount(
      { participant: participantsOf([PARTICIPANT_IN_A, PARTICIPANT_IN_B]), sharedTranslation: table.delegate } as never,
      USER
    );

    expect(table.remainingIds()).toEqual([]);
  });

  it('laisse les traductions que d’AUTRES participants ont partagées — y compris sur les messages du compte', async () => {
    const table = sharedTranslationTable([
      sharedTranslationRow({ id: 'partagée-par-le-compte', sharedById: PARTICIPANT_IN_A }),
      sharedTranslationRow({ id: 'partagée-par-un-autre', sharedById: SOMEONE_ELSE }),
    ]);

    await eraseSharedTranslationsOfAccount(
      { participant: participantsOf([PARTICIPANT_IN_A]), sharedTranslation: table.delegate } as never,
      USER
    );

    expect(table.remainingIds()).toEqual(['partagée-par-un-autre']);
  });

  it('résout les participants par `userId`, jamais par un identifiant de participant en clair', async () => {
    const participant = participantsOf([PARTICIPANT_IN_A]);
    const table = sharedTranslationTable();

    await eraseSharedTranslationsOfAccount({ participant, sharedTranslation: table.delegate } as never, USER);

    expect(participant.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: USER } }));
  });

  it('rend le nombre de lignes effacées, pour le bilan de la purge', async () => {
    const table = sharedTranslationTable([
      sharedTranslationRow({ sharedById: PARTICIPANT_IN_A }),
      sharedTranslationRow({ sharedById: PARTICIPANT_IN_A, targetLanguage: 'en' }),
      sharedTranslationRow({ sharedById: SOMEONE_ELSE }),
    ]);

    const erased = await eraseSharedTranslationsOfAccount(
      { participant: participantsOf([PARTICIPANT_IN_A]), sharedTranslation: table.delegate } as never,
      USER
    );

    expect(erased).toBe(2);
  });

  it('un compte sans participant n’émet jamais un `deleteMany` sans filtre', async () => {
    const table = sharedTranslationTable([sharedTranslationRow({ id: 'intacte', sharedById: SOMEONE_ELSE })]);

    const erased = await eraseSharedTranslationsOfAccount(
      { participant: participantsOf([]), sharedTranslation: table.delegate } as never,
      USER
    );

    expect(erased).toBe(0);
    expect(table.deleteMany).not.toHaveBeenCalled();
    expect(table.remainingIds()).toEqual(['intacte']);
  });

  it('une panne PROPAGE : la purge de compte est rejouable, elle ne se tait pas (cf. ses autres suppressions)', async () => {
    const table = sharedTranslationTable();
    table.deleteMany.mockRejectedValueOnce(new Error('mongo down'));

    await expect(
      eraseSharedTranslationsOfAccount(
        { participant: participantsOf([PARTICIPANT_IN_A]), sharedTranslation: table.delegate } as never,
        USER
      )
    ).rejects.toThrow('mongo down');
  });
});
