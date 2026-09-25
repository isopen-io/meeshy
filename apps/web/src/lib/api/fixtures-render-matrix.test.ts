import { describe, expect, test } from 'bun:test';

import { messagesOf } from './fixtures';
import { RENDER_MATRIX_CONVERSATION_ID } from './fixtures-render-matrix';
import type { Message } from './types';

const served = (): readonly Message[] => messagesOf(RENDER_MATRIX_CONVERSATION_ID);

const findOrThrow = (id: string): Message => {
  const found = served().find((m) => m.id === id);
  if (found === undefined) throw new Error(`témoin introuvable : ${id}`);
  return found;
};

const namedPieceOf = (m: Message): unknown => (m.replyTo as { readonly attachmentReplyTo?: unknown } | undefined)?.attachmentReplyTo;

describe('la matrice de rendu (#7881) — servie par son adresse, chaque combinaison reçue ET à soi', () => {
  test('le fil s’ouvre et chaque message appartient à la conversation', () => {
    expect(served().length).toBeGreaterThan(0);
    served().forEach((m) => expect(m.conversationId).toBe(RENDER_MATRIX_CONVERSATION_ID));
  });

  test('une pièce NOMMÉE désigne une pièce qui existe sur la citation', () => {
    for (const id of ['mx-reply-image', 'mx-reply-audio-mine', 'mx-reply-video']) {
      const reply = findOrThrow(id);
      const piece = namedPieceOf(reply) as { readonly attachmentId: string } | undefined;
      expect(piece).toBeDefined();
      expect((reply.replyTo?.attachments ?? []).map((a) => a.id)).toContain(piece!.attachmentId);
    }
  });

  test('une image PORTRAIT seule, citée par sa réponse (#7929) — le cadre à son rapport', () => {
    const [portrait] = findOrThrow('mx-portrait').attachments ?? [];
    expect(findOrThrow('mx-portrait').attachments).toHaveLength(1);
    expect((portrait?.height ?? 0) > (portrait?.width ?? 0)).toBe(true);
    expect(findOrThrow('mx-reply-portrait').replyTo?.id).toBe('mx-portrait');
  });

  test('plusieurs vocaux, plusieurs vidéos, texte long + images — des deux côtés', () => {
    expect(findOrThrow('mx-audios').attachments).toHaveLength(2);
    expect(findOrThrow('mx-audios-mine').attachments).toHaveLength(2);
    expect(findOrThrow('mx-videos').attachments).toHaveLength(2);
    expect(findOrThrow('mx-videos-mine').attachments).toHaveLength(2);
    expect(findOrThrow('mx-long-images').content.length).toBeGreaterThan(120);
    expect(findOrThrow('mx-long-images-mine').senderId).toBe('u-viewer');
  });

  test('l’humeur citée porte `moodEmoji` — la forme de `buildPostReplyTo`', () => {
    for (const id of ['mx-mood', 'mx-mood-mine']) {
      const snapshot = (findOrThrow(id).metadata as { readonly postReplyTo?: { readonly moodEmoji?: unknown } }).postReplyTo;
      expect(typeof snapshot?.moodEmoji).toBe('string');
    }
  });
});
