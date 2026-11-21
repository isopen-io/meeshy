/**
 * #19841 (audit) — deux résultats concurrents d'un même média ne laissent ni
 * une référence vers un fichier effacé, ni un fichier sans référence.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

jest.mock('../../ZmqSingleton', () => ({ ZMQSingleton: { getInstanceSync: jest.fn(() => null) } }));

import { PostAudioService } from '../PostAudioService';
import { persistPostAudioTranslations } from '../../message-translation/postAudioResult';

const url = (lang: string, t: string) => `/api/v1/attachments/file/translated/post/6650a1b2c3d4e5f6a7b8c9d1_${lang}_${t.repeat(32)}.mp3`;
const entry = (u: string) => ({ type: 'audio', transcription: 'x', path: '/p', url: u, durationMs: 1, format: 'audio/mp3', cloned: false, quality: 1, ttsModel: 'c' }) as never;

describe('#19841 — les pistes de post sous concurrence', () => {
  it('RACE : deux résultats concurrents de langues disjointes ne laissent jamais la base pointer un fichier effacé', async () => {
    let row: Record<string, { url: string }> = { fr: entry(url('fr', 'a')), en: entry(url('en', 'b')) };
    const removed: string[] = [];
    const prisma = {
      postMedia: {
        findUnique: async () => { const snap = row; await new Promise((r) => setTimeout(r, 10)); return { translations: snap }; },
        update: async (a: { data: { translations: Record<string, { url: string }> } }) => { row = a.data.translations; return { commentId: null }; },
      },
      post: { findFirst: async () => null },
    };
    const svc = PostAudioService.init(prisma as never, { broadcastPostUpdated: jest.fn() } as never, { delete: async (u: string) => { removed.push(u); } });
    await Promise.all([
      svc.handleAudioTranslationsReady({ postId: 'p', postMediaId: 'm', translations: { fr: entry(url('fr', 'c')) } }),
      svc.handleAudioTranslationsReady({ postId: 'p', postMediaId: 'm', translations: { en: entry(url('en', 'd')) } }),
    ]);
    const referenced = Object.values(row).map((e) => e.url);
    expect(referenced.filter((u) => removed.includes(u))).toEqual([]);
  });

  it('ORPHELIN : une langue en double dans un même résultat ne laisse aucun fichier sans référence', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'a19841-'));
    process.env.UPLOAD_PATH = root;
    let row: Record<string, { url: string }> = {};
    const prisma = {
      postMedia: { findUnique: async () => ({ translations: row }), update: async (a: { data: { translations: Record<string, { url: string }> } }) => { row = a.data.translations; return { commentId: null }; } },
      post: { findFirst: async () => null },
      messageAttachment: { findUnique: async () => null },
      message: { findUnique: async () => null },
    };
    PostAudioService.init(prisma as never, { broadcastPostUpdated: jest.fn() } as never, { delete: async () => undefined });
    const audio = (t: string) => ({ targetLanguage: 'en', translatedText: t, audioUrl: 'x', durationMs: 1, voiceCloned: false, voiceQuality: 1, _audioBinary: Buffer.from(t), audioMimeType: 'audio/mpeg' });
    await persistPostAudioTranslations(prisma as never, { postId: '6650a1b2c3d4e5f6a7b8c9d0', postMediaId: '6650a1b2c3d4e5f6a7b8c9d1' }, [audio('one'), audio('two')]);
    const files = await fs.readdir(path.join(root, 'translated', 'post'));
    expect(files).toHaveLength(Object.keys(row).length);
  });
});
