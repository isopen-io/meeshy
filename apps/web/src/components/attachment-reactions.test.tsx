import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { messagesOf } from '@/lib/api/fixtures';
import { MEDIA_CONVERSATION_ID } from '@/lib/api/fixtures-media';
import { MEDIA_GRID_OVERFLOW_WITNESS_ID } from '@/lib/api/fixtures-media-grid';
import { RENDER_MATRIX_MESSAGES } from '@/lib/api/fixtures-render-matrix';
import type { Attachment } from '@/lib/api/types';
import type { MediaGridFrame } from '@/lib/view/media-grid-layout';

import { Attachments } from './attachment-blocks';

/**
 * LES RÉACTIONS D'UNE PIÈCE S'AFFICHENT SUR CETTE PIÈCE (#7894) — la passerelle
 * sert `attachments[].reactionSummary` + `currentUserReactions`
 * (`messages-list-query.ts`, `aggregateAttachmentReactions`) ; iOS les pose en
 * pastille au coin bas-gauche de la tuile (`BubbleStandardLayout+Media.swift`,
 * `FocalAttachmentBlock.swift`, `AttachmentReactionBadge.swift`). Témoins
 * écrits contre `Attachments`, le site unique des trois modes de lecture.
 */

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const piecesOf = (messageId: string): readonly Attachment[] => {
  const message = RENDER_MATRIX_MESSAGES.find((m) => m.id === messageId);
  if (!message?.attachments) throw new Error(`témoin introuvable : ${messageId}`);
  return message.attachments;
};

const mount = (attachments: readonly Attachment[], frame: MediaGridFrame): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <Attachments attachments={attachments} languages={['fr']} fallbackLanguage="fr" mediaFrame={frame} />,
  );
  return host;
};

const badgesOf = (host: HTMLElement): HTMLElement[] =>
  Array.from(host.querySelectorAll<HTMLElement>('[data-attachment-reactions]'));

const tileOf = (host: HTMLElement, attachmentId: string): HTMLElement => {
  const tile = host.querySelector<HTMLElement>(`[data-attachment="${attachmentId}"]`);
  if (!tile) throw new Error(`tuile introuvable : ${attachmentId}`);
  return tile;
};

const FRAMES: readonly MediaGridFrame[] = ['box', 'tiles'];

for (const frame of FRAMES) describe(`pièce réagie dans une GRILLE (${frame})`, () => {
  const pieces = piecesOf('mx-piece-reactions');
  const [reacted, quiet] = pieces as [Attachment, Attachment];

  test('UNE pastille, posée dans la case de la pièce réagie — jamais sur sa voisine', () => {
    const host = mount(pieces, frame);
    const badges = badgesOf(host);
    expect(badges.length).toBe(1);
    const badge = badges[0]!;
    expect(badge.getAttribute('data-attachment-reactions')).toBe(reacted.id);
    expect(badge.parentElement!.contains(tileOf(host, reacted.id))).toBe(true);
    expect(badge.parentElement!.contains(tileOf(host, quiet.id))).toBe(false);
  });

  test('elle montre les émojis servis et leur TOTAL, et dit « dont la vôtre »', () => {
    const badge = badgesOf(mount(pieces, frame))[0]!;
    expect(badge.textContent).toContain('🔥');
    expect(badge.textContent).toContain('😍');
    expect(badge.textContent).toContain('3');
    expect(badge.getAttribute('data-mine')).toBe('true');
    expect(badge.getAttribute('aria-label')).toBe('Réactions, dont la vôtre : 3');
  });
});

describe('pièce réagie SEULE', () => {
  const [reacted] = piecesOf('mx-piece-reactions') as [Attachment];

  test('image seule : la pastille vit dans la tuile', () => {
    const host = mount([reacted], 'tiles');
    const badge = badgesOf(host)[0];
    expect(badge?.parentElement!.contains(tileOf(host, reacted.id))).toBe(true);
  });

  test('une seule réaction, d’autrui : aucun total écrit, aucune marque « mienne »', () => {
    const lone = { ...reacted, reactionSummary: { '👍': 1 }, currentUserReactions: [] };
    const badge = badgesOf(mount([lone], 'box'))[0]!;
    expect(badge.getAttribute('data-mine')).toBe('false');
    expect(badge.querySelector('[data-reaction-total]')).toBe(null);
    expect(badge.getAttribute('aria-label')).toBe('Réactions : 1');
  });

  test('vidéo : la pastille vit dans la tuile vidéo', () => {
    const video = { ...reacted, id: 'a-video', mimeType: 'video/mp4', fileUrl: 'https://cdn.example/v.mp4' };
    const host = mount([video], 'box');
    expect(badgesOf(host)[0]?.parentElement!.contains(tileOf(host, 'a-video'))).toBe(true);
  });
});

describe('une pièce PROTÉGÉE n’annonce rien, pas même un compte (leçon 275)', () => {
  test('floutée et réagie ⇒ aucune pastille', () => {
    const [reacted, quiet] = piecesOf('mx-piece-reactions') as [Attachment, Attachment];
    const host = mount([{ ...reacted, isBlurred: true }, quiet], 'box');
    expect(host.querySelector('[data-protected-attachment]')).not.toBe(null);
    expect(badgesOf(host).length).toBe(0);
  });
});

/**
 * #7896 — LA TUILE « PHOTO PROTÉGÉE » D'UNE GRILLE PREND LES COINS DE SES
 * VOISINES. Elle gardait `rounded-2xl` : en bulle (`box`), la boîte noire de
 * la grille (`BubbleStandardLayout.swift:784-787`) apparaissait dans ses coins.
 */
describe('#7896 — la tuile protégée d’une grille a les coins de ses voisines', () => {
  const overflow = (): readonly Attachment[] => {
    const message = messagesOf(MEDIA_CONVERSATION_ID).find((m) => m.id === MEDIA_GRID_OVERFLOW_WITNESS_ID);
    return message?.attachments ?? [];
  };

  const cellClassOf = (host: HTMLElement, selector: string): string =>
    host.querySelector(selector)!.parentElement!.className;

  for (const frame of FRAMES) {
    test(`${frame} : aucun arrondi propre, la case est celle d’une voisine`, () => {
      const host = mount(overflow(), frame);
      const masked = host.querySelector<HTMLElement>('[data-protected-attachment]')!;
      expect(masked.className).not.toContain('rounded');
      const neighbour = host.querySelector('[data-media-grid] button[data-attachment]')!;
      expect(cellClassOf(host, '[data-protected-attachment]')).toBe(neighbour.parentElement!.className);
    });
  }

  test('hors grille (vocal masqué), le substitut garde son arrondi historique', () => {
    const voice = { ...piecesOf('mx-piece-reactions')[0]!, mimeType: 'audio/wav', isBlurred: true };
    const host = mount([voice], 'box');
    expect(host.querySelector<HTMLElement>('[data-protected-attachment]')!.className).toContain('rounded-2xl');
  });
});
