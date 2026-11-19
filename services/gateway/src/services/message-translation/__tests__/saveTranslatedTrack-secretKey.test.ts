/**
 * #19841 — le nom d'une piste de post porte un jeton secret : aucun journal
 * ne l'écrit. Une piste de message garde un journal qui la nomme.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const lines: string[] = [];
const record = (...args: unknown[]) => { lines.push(JSON.stringify(args)); };

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: record, warn: record, info: record, debug: record }) },
}));

import { saveTranslatedTrack } from '../translatedTrackSave';

const TOKEN = 'f'.repeat(32);
const prisma = { messageAttachment: { findUnique: async () => null }, message: { findUnique: async () => null } } as unknown as Parameters<typeof saveTranslatedTrack>[0];

const save = async (filename: string, attachmentId: string, binary?: Buffer) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'track-log-'));
  process.env.UPLOAD_PATH = root;
  lines.splice(0);
  await saveTranslatedTrack(prisma, { translatedDir: path.join(root, 'translated'), filename, attachmentId, language: 'en', binary });
  return lines.join('\n');
};

describe('le journal d’une piste traduite', () => {
  it('n’écrit jamais le jeton d’une piste de post, écrite ou non', async () => {
    const written = await save(`post/6650a1b2c3d4e5f6a7b8c9d1_en_${TOKEN}.mp3`, '6650a1b2c3d4e5f6a7b8c9d1', Buffer.from('voix'));
    const announced = await save(`post/6650a1b2c3d4e5f6a7b8c9d1_en_${TOKEN}.mp3`, '6650a1b2c3d4e5f6a7b8c9d1');

    expect(written).not.toContain(TOKEN);
    expect(announced).not.toContain(TOKEN);
    expect(written).toContain('en');
  });

  it('nomme toujours la pièce et la langue d’une piste de message', async () => {
    const written = await save('6650a1b2c3d4e5f6a7b8c9d2_en.mp3', '6650a1b2c3d4e5f6a7b8c9d2', Buffer.from('voix'));

    expect(written).toContain('6650a1b2c3d4e5f6a7b8c9d2');
    expect(written).toContain('en');
  });
});
