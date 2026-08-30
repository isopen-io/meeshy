/**
 * #4166, critère 4 — `POST /attachments/:attachmentId/translate` ne lit plus
 * la ligne `MessageAttachment` deux fois : la route en avait déjà lu le
 * `mimeType` pour son propre gate de consentement, puis
 * `AttachmentTranslateService.translate()` la relisait ENTIÈREMENT via un
 * `include` sans `select` — deux allers-retours pour la même ligne.
 *
 * Le témoin porte sur l'APPEL PRISMA, jamais sur ce que la route ou le
 * service RENDENT — c'est la subtilité de méthode que l'issue nomme
 * elle-même : un test qui n'asserte que la forme de la réponse reste vert
 * quand on remet un `include` nu, puisque le schéma de sortie filtre déjà.
 * Ici : un double qui CAPTURE/COMPTE les appels à
 * `prisma.messageAttachment.findUnique`.
 *
 * Fichier séparé de `AttachmentTranslateService.test.ts` (déjà hors budget,
 * 1345 lignes) plutôt qu'ajouté dedans — règle du dépôt : « Ajouter à un
 * fichier déjà hors budget est interdit ».
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

// AudioTranslateService n'est JAMAIS atteint par les deux témoins ci-dessous
// (mimeType volontairement hors `audio/*`, `image/*`, `video/*`,
// `application/pdf`, `text/*` — la branche `default` du dispatcher répond
// `UNSUPPORTED_TYPE` avant de toucher au moindre service de traduction) :
// le double reste minimal, il ne prouve que le nombre de lectures.
jest.mock('../../../services/AudioTranslateService', () => ({
  AudioTranslateService: jest.fn().mockImplementation(() => ({
    translateSync: jest.fn(),
    translateAsync: jest.fn(),
    getJobStatus: jest.fn(),
    cancelJob: jest.fn(),
  })),
}));

import { AttachmentTranslateService } from '../../../services/AttachmentTranslateService';
import { attachmentTranslateSelect } from '../../../services/attachments/attachmentIncludes';

const USER_ID = 'user-1';
const ATTACHMENT_ID = 'att-1';

/** Forme rendue par `attachmentTranslateSelect` — voir attachmentIncludes.ts. */
function makePreloadedAttachment(overrides: Record<string, unknown> = {}) {
  return {
    id: ATTACHMENT_ID,
    messageId: 'msg-1',
    // Hors audio/image/video/pdf/text : `getAttachmentType` rend 'unknown',
    // la branche `default` répond SANS jamais construire `AudioTranslateService`.
    mimeType: 'chemistry/unknown',
    uploadedBy: USER_ID,
    isForwarded: false,
    forwardedFromAttachmentId: null,
    duration: null,
    filePath: 'docs/x.bin',
    message: { id: 'msg-1', conversationId: 'conv-1' },
    ...overrides,
  };
}

function makePrisma() {
  return {
    messageAttachment: { findUnique: jest.fn() },
    participant: { findFirst: jest.fn() },
  } as unknown as PrismaClient;
}

describe('AttachmentTranslateService.translate — une seule lecture de la ligne (#4166 critère 4)', () => {
  it('ne lit PAS la ligne quand un attachement préchargé est fourni (le chemin que la route emprunte désormais)', async () => {
    const prisma = makePrisma();
    const service = new AttachmentTranslateService(prisma, {} as any);

    const result = await service.translate(
      USER_ID,
      ATTACHMENT_ID,
      { targetLanguages: ['fr'] },
      makePreloadedAttachment()
    );

    expect(prisma.messageAttachment.findUnique).not.toHaveBeenCalled();
    // Preuve que le chemin nominal a bien été exercé (pas une sortie
    // anticipée sur un autre garde) : l'attachement préchargé a été utilisé
    // jusqu'au dispatcher de type.
    expect(result).toMatchObject({ success: false, errorCode: 'UNSUPPORTED_TYPE' });
  });

  it("lit la ligne UNE SEULE FOIS, avec select: attachmentTranslateSelect (jamais include), quand rien n'est préchargé", async () => {
    // Comportement INCHANGÉ pour tout appelant qui ne précharge rien —
    // `AttachmentTranslateService.test.ts` (1345 témoins) continue de couvrir
    // ce chemin sans modification.
    const prisma = makePrisma();
    (prisma.messageAttachment.findUnique as jest.Mock<any>).mockResolvedValue(
      makePreloadedAttachment()
    );
    const service = new AttachmentTranslateService(prisma, {} as any);

    await service.translate(USER_ID, ATTACHMENT_ID, { targetLanguages: ['fr'] });

    expect(prisma.messageAttachment.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.messageAttachment.findUnique).toHaveBeenCalledWith({
      where: { id: ATTACHMENT_ID },
      select: attachmentTranslateSelect,
    });
    // La garde de source négative (`bare-include-guard.test.ts`) interdit le
    // motif au niveau du SOURCE ; ce témoin-ci prouve, à l'EXÉCUTION, que
    // l'appel réel porte bien `select` — les deux sont complémentaires, ni
    // redondants.
    const call = (prisma.messageAttachment.findUnique as jest.Mock<any>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(call).not.toHaveProperty('include');
    expect(call).toHaveProperty('select');
  });

  // Note de périmètre : `translateAudio` (la branche audio du dispatcher)
  // relit `messageAttachment` PLUSIEURS fois par elle-même — le walk de
  // chaîne de transferts (`_findOriginalAttachmentAndSender`) et le double
  // contrôle de cache (transcription / traductions) sur `originalAttachmentId`.
  // Ce sont des lectures DISTINCTES, pour une raison DISTINCTE (cache,
  // remontée de chaîne) — pas la même relecture de `attachmentId` que ce
  // critère ferme. Ce fichier ne couvre donc que le dispatcher racine
  // (`translate`), le seul site où le doublon nommé par l'issue vivait.
});
