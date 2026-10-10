import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { attachmentDefaults, message } from '@/lib/api/fixtures-base';
import type { Attachment, Message } from '@/lib/api/types';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import {
  menuPiecesOf,
  pieceDeletable,
  pieceIdAt,
  pieceMenuItems,
  piecePreviewBox,
  targetedPieceOf,
  withPieceRestored,
  withoutPiece,
} from './message-piece';
import { NO_MEDIA_OFFERS } from './viewer-page-offers';

/**
 * #9907, #9908, #9906 — CHAQUE PIÈCE D'UN MESSAGE SE VISE SEULE. Ces témoins
 * gardent la LOI : la tuile touchée est la pièce visée, l'aperçu parcourt les
 * pièces visuelles d'un lot, le menu d'une pièce offre ce que la pièce
 * permet, et la suppression retire la pièce visée — la 3ᵉ d'un lot, jamais la
 * première.
 */

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const piece = (id: string, mimeType = 'image/jpeg', partial: Partial<Attachment> = {}): Attachment =>
  ({
    ...attachmentDefaults,
    id,
    messageId: 'm-lot',
    fileName: `${id}.jpg`,
    originalName: `${id}.jpg`,
    mimeType,
    fileSize: 1,
    fileUrl: `https://cdn.meeshy.me/${id}`,
    uploadedBy: 'u-moi',
    createdAt: '2026-10-10T09:00:00.000Z',
    ...partial,
  }) as Attachment;

const lot = (count: number, partial: Partial<Message> = {}): Message =>
  message({
    id: 'm-lot',
    senderId: 'u-moi',
    content: '',
    originalLanguage: 'fr',
    translations: [],
    createdAt: new Date('2026-10-10T09:00:00.000Z'),
    attachments: Array.from({ length: count }, (_, i) => piece(`a-${i + 1}`)),
    ...partial,
  });

describe('menuPiecesOf — les pièces que l’aperçu parcourt', () => {
  test('sept photos : les sept, dans l’ordre', () => {
    expect(menuPiecesOf(lot(7)).map((p) => p.id)).toEqual(['a-1', 'a-2', 'a-3', 'a-4', 'a-5', 'a-6', 'a-7']);
  });

  test('une pièce seule EST le message : aucun défilement', () => {
    expect(menuPiecesOf(lot(1))).toEqual([]);
  });

  test('un vocal et un document ne sont pas des pièces de l’aperçu', () => {
    const mixte = lot(0, { attachments: [piece('a-1'), piece('v', 'audio/mp4'), piece('d', 'application/pdf'), piece('a-2', 'video/mp4')] });
    expect(menuPiecesOf(mixte).map((p) => p.id)).toEqual(['a-1', 'a-2']);
  });
});

describe('pieceIdAt — la tuile que l’appui a touchée (#9907)', () => {
  const rowWithTiles = (): { readonly row: HTMLElement; readonly img: HTMLElement; readonly text: HTMLElement } => {
    const row = document.createElement('div');
    row.setAttribute('data-row', 'm-lot');
    row.innerHTML = '<p>légende</p><div data-piece="a-3"><button><img alt=""></button></div>';
    return { row, img: row.querySelector('img')!, text: row.querySelector('p')! };
  };

  test('un appui sur l’image d’une case vise sa pièce', () => {
    const { row, img } = rowWithTiles();
    expect(pieceIdAt(img, row)).toBe('a-3');
  });

  test('un appui hors tuile ne vise aucune pièce', () => {
    const { row, text } = rowWithTiles();
    expect(pieceIdAt(text, row)).toBeUndefined();
    expect(pieceIdAt(null, row)).toBeUndefined();
  });

  test('une case HORS de la rangée pressée ne compte pas', () => {
    const { row } = rowWithTiles();
    const ailleurs = document.createElement('div');
    ailleurs.setAttribute('data-piece', 'x');
    expect(pieceIdAt(ailleurs, row)).toBeUndefined();
  });
});

describe('targetedPieceOf — la pièce visée et son rang', () => {
  test('la 3ᵉ d’un lot de sept', () => {
    expect(targetedPieceOf(lot(7), 'a-3')).toEqual({ pieces: menuPiecesOf(lot(7)), index: 2 });
  });

  test('une pièce disparue, ou un message à une pièce : rien', () => {
    expect(targetedPieceOf(lot(7), 'a-9')).toBeNull();
    expect(targetedPieceOf(lot(1), 'a-1')).toBeNull();
    expect(targetedPieceOf(lot(7), undefined)).toBeNull();
  });
});

describe('pieceMenuItems — le menu d’une pièce (#9908)', () => {
  const all = { save: true, react: true, reply: true, compose: true, share: true };

  test('pièce ouverte, auteur : répondre, enregistrer, transférer, supprimer, puis tout le message', () => {
    expect(pieceMenuItems({ offers: all, deletable: true }).map((i) => i.id)).toEqual([
      'pieceReply',
      'pieceSave',
      'pieceForward',
      'pieceDelete',
      'wholeMessage',
    ]);
  });

  test('pièce protégée, lecteur : seul le message entier reste accessible', () => {
    expect(pieceMenuItems({ offers: NO_MEDIA_OFFERS, deletable: false }).map((i) => i.id)).toEqual(['wholeMessage']);
  });
});

describe('pieceDeletable — qui supprime une pièce après l’envoi (#9906)', () => {
  test('l’auteur, sur un message connu de la passerelle', () => {
    expect(pieceDeletable({ message: lot(3), piece: piece('a-3'), viewerId: 'u-moi' })).toBe(true);
  });

  test('ni un autre lecteur, ni un envoi encore local, ni un message supprimé', () => {
    expect(pieceDeletable({ message: lot(3), piece: piece('a-3'), viewerId: 'u-autre' })).toBe(false);
    expect(pieceDeletable({ message: lot(3, { id: 'cid_123' }), piece: piece('a-3'), viewerId: 'u-moi' })).toBe(false);
    expect(pieceDeletable({ message: lot(3, { deletedAt: new Date() }), piece: piece('a-3'), viewerId: 'u-moi' })).toBe(false);
    expect(pieceDeletable({ message: lot(3), piece: piece('a-3', 'image/jpeg', { uploadedBy: 'u-autre' }), viewerId: 'u-moi' })).toBe(false);
  });
});

describe('withoutPiece / withPieceRestored — la 3ᵉ pièce d’un lot, et elle seule (#9906)', () => {
  test('supprimer la 3ᵉ retire la 3ᵉ, jamais la première', () => {
    expect(withoutPiece(lot(5), 'a-3').attachments?.map((p) => p.id)).toEqual(['a-1', 'a-2', 'a-4', 'a-5']);
  });

  test('le retour arrière la remet à SON rang', () => {
    const before = lot(5);
    const third = before.attachments![2]!;
    expect(withPieceRestored(withoutPiece(before, 'a-3'), third, 2).attachments?.map((p) => p.id)).toEqual(['a-1', 'a-2', 'a-3', 'a-4', 'a-5']);
  });

  test('une pièce déjà présente ne se double pas', () => {
    const before = lot(3);
    expect(withPieceRestored(before, before.attachments![0]!, 2).attachments?.length).toBe(3);
  });
});

describe('piecePreviewBox — une boîte stable pour tout le défilement (#9907)', () => {
  const viewport = { width: 390, height: 844 };

  test('la largeur offerte, la hauteur de la pièce la plus haute', () => {
    const box = piecePreviewBox({ pieces: [{ width: 1600, height: 900 }, { width: 900, height: 1200 }], viewport: { width: 390, height: 1000 }, sidePadding: 16 });
    expect(box).toEqual({ width: 358, height: Math.round(358 / (900 / 1200)) });
  });

  test('une pièce très haute est plafonnée à une part de l’écran', () => {
    const box = piecePreviewBox({ pieces: [{ width: 500, height: 4000 }, { width: 100, height: 100 }], viewport, sidePadding: 16 });
    expect(box.height).toBe(Math.round(844 * 0.55));
  });

  test('un grand écran ne dépasse pas la largeur maximale ; sans dimensions, un carré', () => {
    expect(piecePreviewBox({ pieces: [{}, {}], viewport: { width: 1440, height: 900 }, sidePadding: 16 })).toEqual({ width: 420, height: 420 });
  });
});
