/**
 * #11269 (audit adversarial, F1) — des octets qui SURVIVENT à leur effacement
 * laissent la purge en reprise, et restent impossibles à servir.
 *
 * Avant : `deleteAttachment` supprimait la LIGNE puis les fichiers, et un
 * `unlink` en échec (EBUSY, EACCES) était avalé. La purge, qui ne relit que les
 * lignes, concluait « pièces parties » : échéance remise à `null`, purge
 * déclarée finie — et le fichier, que plus aucune ligne ne citait, ressortait
 * par `GET /attachments/file/*` comme « pas une pièce jointe », sans jeton.
 *
 * Vrai `AttachmentService`, vraie purge, vrai verdict de la route par chemin,
 * vrai disque ; seule la base est un double en mémoire qui applique ses `where`.
 *
 * @jest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { AttachmentService } from '../../attachments/AttachmentService';
import { resolveFileRouteVerdict } from '../../attachments/fileRouteVerdict';
import { purgeDueViewOnceContent } from '../purgeViewOnceContent';
import { viewOncePurgeMemoryPrisma } from './helpers/view-once-purge-memory-prisma';

const MESSAGE_ID = '650000000000000000000001';
const ATTACHMENT_ID = '650000000000000000000002';
const FILE_KEY = 'attachments/2026/11/photo_11111111-2222-4333-8444-555555555555.jpg';
const THUMB_KEY = 'attachments/2026/11/photo_11111111-2222-4333-8444-555555555555_thumb.jpg';

function seed() {
  return viewOncePurgeMemoryPrisma({
    messages: [
      {
        id: MESSAGE_ID,
        conversationId: '650000000000000000000009',
        isViewOnce: true,
        content: 'secret',
        deletedAt: null,
        expiresAt: null,
        viewOnceBurnAt: new Date(Date.now() - 60_000),
        viewOnceBurnedAt: null,
      },
    ],
    attachments: [
      {
        id: ATTACHMENT_ID,
        messageId: MESSAGE_ID,
        filePath: FILE_KEY,
        thumbnailPath: THUMB_KEY,
        isViewOnce: true,
        isBlurred: false,
        effectFlags: 0,
        originalName: 'plage.jpg',
        transcription: { text: 'chut' },
        caption: 'à la plage',
        alt: 'une plage',
        captionTranslations: { en: { text: 'at the beach' } },
        altTranslations: { en: { text: 'a beach' } },
        thumbHash: 'abc',
        metadata: { width: 10 },
      },
    ],
  });
}

function busy(): NodeJS.ErrnoException {
  return Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
}

describe('purge d’une vue unique — des octets qui survivent à leur effacement (#11269, F1)', () => {
  const previousUploadPath = process.env.UPLOAD_PATH;
  const roots: string[] = [];

  beforeEach(() => jest.restoreAllMocks());
  afterEach(async () => {
    jest.restoreAllMocks();
    process.env.UPLOAD_PATH = previousUploadPath;
    await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  async function uploadRootWithFiles(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'view-once-purge-'));
    roots.push(root);
    await fs.mkdir(path.join(root, path.dirname(FILE_KEY)), { recursive: true });
    await fs.writeFile(path.join(root, FILE_KEY), 'octets');
    await fs.writeFile(path.join(root, THUMB_KEY), 'vignette');
    process.env.UPLOAD_PATH = root;
    return root;
  }

  async function exists(fullPath: string): Promise<boolean> {
    return fs.stat(fullPath).then(() => true, () => false);
  }

  it('un unlink qui lève EBUSY laisse l’échéance PASSÉE, et le fichier survivant n’est pas servi', async () => {
    const root = await uploadRootWithFiles();
    const { prisma, state } = seed();
    const service = new AttachmentService(prisma as unknown as PrismaClient);
    jest.spyOn(fs, 'unlink').mockRejectedValue(busy());
    const now = new Date();

    await purgeDueViewOnceContent(prisma as unknown as Parameters<typeof purgeDueViewOnceContent>[0], {
      now,
      attachmentRemover: service,
    });

    expect(await exists(path.join(root, FILE_KEY))).toBe(true);
    expect(state.messages[0].viewOnceBurnAt).not.toBeNull();
    expect(state.messages[0].viewOnceBurnedAt).toEqual(now);
    expect(await resolveFileRouteVerdict(FILE_KEY, prisma, now)).toEqual({ kind: 'gone' });
    expect(await resolveFileRouteVerdict(THUMB_KEY, prisma, now)).toEqual({ kind: 'gone' });
  });

  it('une pièce dont les octets résistent perd tout ce qui en DÉRIVE : transcription, traductions, légendes, nom, empreinte, métadonnées (F2)', async () => {
    await uploadRootWithFiles();
    const { prisma, state } = seed();
    const service = new AttachmentService(prisma as unknown as PrismaClient);
    jest.spyOn(fs, 'unlink').mockRejectedValue(busy());

    await purgeDueViewOnceContent(prisma as unknown as Parameters<typeof purgeDueViewOnceContent>[0], {
      now: new Date(),
      attachmentRemover: service,
    });

    expect(state.attachments).toHaveLength(1);
    expect(state.attachments[0]).toMatchObject({
      filePath: FILE_KEY,
      originalName: '',
      transcription: null,
      translations: null,
      captionTranslations: null,
      altTranslations: null,
      caption: null,
      alt: null,
      thumbHash: null,
      metadata: null,
    });
    expect(JSON.stringify(state.attachments[0])).not.toContain('chut');
    expect(JSON.stringify(state.attachments[0])).not.toContain('plage');
  });

  it('la passe suivante, le disque libéré, efface les octets et clôt la purge', async () => {
    const root = await uploadRootWithFiles();
    const { prisma, state } = seed();
    const service = new AttachmentService(prisma as unknown as PrismaClient);
    const unlink = jest.spyOn(fs, 'unlink').mockRejectedValue(busy());
    const purge = (now: Date) =>
      purgeDueViewOnceContent(prisma as unknown as Parameters<typeof purgeDueViewOnceContent>[0], {
        now,
        attachmentRemover: service,
      });

    await purge(new Date());
    unlink.mockRestore();
    await purge(new Date());

    expect(await exists(path.join(root, FILE_KEY))).toBe(false);
    expect(await exists(path.join(root, THUMB_KEY))).toBe(false);
    expect(state.attachments).toEqual([]);
    expect(state.messages[0].viewOnceBurnAt).toBeNull();
  });
});
