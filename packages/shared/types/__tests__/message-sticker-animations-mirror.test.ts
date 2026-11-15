/**
 * `MESSAGE_STICKER_ANIMATIONS` est le MIROIR de l'énumération Swift
 * `StickerAnimation` — et un miroir se vérifie, il ne s'affirme pas.
 *
 * Une animation admise par le gateway qu'iOS ne connaît pas se décode en
 * `nil` côté client (sticker immobile) ; une animation qu'iOS produit et que
 * le gateway refuse fait tomber le sticker ENTIER à `null` côté serveur. Les
 * deux listes doivent donc rester identiques, cas pour cas et dans l'ordre.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MESSAGE_STICKER_ANIMATIONS } from '../message-sticker';

const SWIFT_ENUM = resolve(
  __dirname,
  '../../../MeeshySDK/Sources/MeeshySDK/Models/Story/StickerAnimation.swift'
);

function swiftCases(): string[] {
  const source = readFileSync(SWIFT_ENUM, 'utf-8');
  const start = source.indexOf('public enum StickerAnimation');
  const end = source.indexOf('// MARK:', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return [...source.slice(start, end).matchAll(/^\s*case (\w+)\s*$/gm)].map((m) => m[1]);
}

describe('MESSAGE_STICKER_ANIMATIONS ↔ StickerAnimation (Swift)', () => {
  it('les deux listes sont identiques, cas pour cas et dans l’ordre', () => {
    expect([...MESSAGE_STICKER_ANIMATIONS]).toEqual(swiftCases());
  });

  it('le balayage VOIT bien les cas Swift — un balayage vide rendrait tout vert', () => {
    expect(swiftCases().length).toBeGreaterThanOrEqual(11);
  });
});
