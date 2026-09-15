import { describe, expect, test } from 'bun:test';

import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { Attachment } from '@/lib/api/types';

import { mediaGridSlots, partitionAttachments, soloVideoSlot, visibleCount } from './media-grid-layout';

/**
 * T1 (#6221) — `mediaGridSlots`, miroir de `FocalMediaGridLayout.slots(for:)`.
 * Les cotes ne sont PAS arrondies, comme côté Swift.
 */
describe('mediaGridSlots — miroir de FocalMediaGridLayout.slots', () => {
  test('0 pièce : aucune case', () => {
    expect(mediaGridSlots(0)).toEqual([]);
  });

  test('1 pièce : une case pleine 300 × 240', () => {
    expect(mediaGridSlots(1)).toEqual([{ width: 300, height: 240, overflowCount: 0 }]);
  });

  test('2 pièces : deux cases 149 × 180', () => {
    const slots = mediaGridSlots(2);
    expect(slots).toHaveLength(2);
    for (const slot of slots) {
      expect(slot.width).toBeCloseTo(149, 5);
      expect(slot.height).toBe(180);
      expect(slot.overflowCount).toBe(0);
    }
  });

  test('3 pièces : gauche 178,8 puis deux à 119,2, hauteur de boîte 240 sur les trois', () => {
    const [left, right1, right2] = mediaGridSlots(3);
    expect(left!.width).toBeCloseTo(178.8, 5);
    expect(right1!.width).toBeCloseTo(119.2, 5);
    expect(right2!.width).toBeCloseTo(119.2, 5);
    expect(left!.height).toBe(240);
    expect(right1!.height).toBe(240);
    expect(right2!.height).toBe(240);
  });

  test('4 pièces : quatre cases 149 × 240, overflowCount 0', () => {
    const slots = mediaGridSlots(4);
    expect(slots).toHaveLength(4);
    for (const slot of slots) {
      expect(slot.width).toBeCloseTo(149, 5);
      expect(slot.height).toBe(240);
    }
    expect(slots[3]!.overflowCount).toBe(0);
  });

  test('6 pièces : 4 cases rendues, +2 SEULEMENT sur la 4ᵉ', () => {
    const slots = mediaGridSlots(6);
    expect(slots).toHaveLength(4);
    expect(slots[0]!.overflowCount).toBe(0);
    expect(slots[1]!.overflowCount).toBe(0);
    expect(slots[2]!.overflowCount).toBe(0);
    expect(slots[3]!.overflowCount).toBe(2);
  });

  test('7 pièces : +3 sur la 4ᵉ', () => {
    expect(mediaGridSlots(7)[3]!.overflowCount).toBe(3);
  });

  test('visibleCount(n) = min(n, 4)', () => {
    expect(visibleCount(1)).toBe(1);
    expect(visibleCount(4)).toBe(4);
    expect(visibleCount(6)).toBe(4);
    expect(visibleCount(0)).toBe(0);
  });

  test('soloVideoSlot(9/16) : plafond de hauteur mordu (1,6 × 300 = 480)', () => {
    const slot = soloVideoSlot(9 / 16);
    expect(slot.height).toBe(480);
    expect(slot.width).toBeCloseTo(270, 5);
  });

  test('soloVideoSlot(16/9) : largeur pleine, hauteur 168,75 (non arrondie)', () => {
    const slot = soloVideoSlot(16 / 9);
    expect(slot.width).toBe(300);
    expect(slot.height).toBeCloseTo(168.75, 5);
  });

  test('soloVideoSlot(undefined) : repli 16/9', () => {
    const withoutRatio = soloVideoSlot(undefined);
    const explicit169 = soloVideoSlot(16 / 9);
    expect(withoutRatio).toEqual(explicit169);
  });
});

/**
 * T2 — `partitionAttachments`, miroir de `BubbleContentBuilder.swift:221-247`.
 */
describe('partitionAttachments — miroir de BubbleContentBuilder.swift:221-247', () => {
  const attachmentOf = (id: string, mimeType: string): Attachment => ({
    ...attachmentDefaults,
    id,
    messageId: 'm1',
    fileName: id,
    originalName: id,
    mimeType,
    fileSize: 100,
    fileUrl: `data:${mimeType};base64,AA==`,
    uploadedBy: 'u1',
    createdAt: new Date().toISOString(),
  });
  const image = (id: string): Attachment => attachmentOf(id, 'image/png');
  const video = (id: string): Attachment => attachmentOf(id, 'video/webm');
  const audio = (id: string): Attachment => attachmentOf(id, 'audio/webm');
  const file = (id: string): Attachment => attachmentOf(id, 'application/pdf');

  test('image et vidéo vont dans `visual`, ORDRE conservé', () => {
    const a = image('a');
    const b = video('b');
    const c = image('c');
    const { visual, audio: aud, nonMedia } = partitionAttachments([a, b, c]);
    expect(visual).toEqual([a, b, c]);
    expect(aud).toEqual([]);
    expect(nonMedia).toEqual([]);
  });

  test('vocal va dans `audio`, fichier dans `nonMedia`', () => {
    const v = audio('v');
    const f = file('f');
    const result = partitionAttachments([v, f]);
    expect(result.audio).toEqual([v]);
    expect(result.nonMedia).toEqual([f]);
    expect(result.visual).toEqual([]);
  });

  test('mixte : chaque groupe garde SON ordre propre', () => {
    const a = image('a');
    const v = audio('v');
    const b = video('b');
    const f = file('f');
    const result = partitionAttachments([a, v, b, f]);
    expect(result.visual).toEqual([a, b]);
    expect(result.audio).toEqual([v]);
    expect(result.nonMedia).toEqual([f]);
  });

  test('une pièce MASQUÉE reste dans `visual` À SA POSITION — elle occupe sa case', () => {
    const a = image('a');
    const masked: Attachment = { ...image('masked'), isViewOnce: true };
    const c = image('c');
    const { visual } = partitionAttachments([a, masked, c]);
    expect(visual).toEqual([a, masked, c]);
  });

  test('liste vide : trois groupes vides', () => {
    expect(partitionAttachments([])).toEqual({ visual: [], audio: [], nonMedia: [] });
  });
});
