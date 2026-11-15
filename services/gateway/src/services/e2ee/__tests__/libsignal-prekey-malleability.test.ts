/**
 * Un PreKeySignalMessage est MALLÉABLE (#17113) : le quartet bas de son premier
 * octet n'est couvert par aucun MAC, et un champ protobuf inconnu ajouté à la fin
 * est ignoré. Une copie modifiée s'ouvre donc avec le MÊME clair ; le premier
 * exemplaire déchiffré gagne et le suivant est refusé comme doublon. Comportement
 * amont, identique en 0.105.4.
 *
 * Règle qui en découle (décision 2026-11-09-…-17113.md) : JAMAIS d'identifiant,
 * de déduplication ni de signature calculés sur les octets d'un
 * PreKeySignalMessage — un relais (DMA compris) en verrait deux messages.
 *
 * Banc : `libsignal-prekey-malleability.mjs`, vraie bibliothèque, processus à part.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { execFileSync } from 'child_process';
import { join } from 'path';

type Received = { text: string } | { error: { code: number; message: string } };
type Report = {
  firstByte: number;
  lowNibbleFlipped: { copy: Received; original: Received };
  unknownFieldAppended: { copy: Received; original: Received };
};

const report = JSON.parse(execFileSync(process.execPath, [join(__dirname, 'libsignal-prekey-malleability.mjs')]).toString()) as Report;
const duplicate = { error: { code: 1, message: expect.stringMatching(/old counter/) } };

describe('libsignal — un PreKeySignalMessage est malléable, le premier exemplaire gagne (#17113)', () => {
  it('le premier octet porte la version 4 dans ses deux quartets', () => {
    expect(report.firstByte).toBe(0x44);
  });

  it('une copie au quartet bas modifié (0x44 → 0x45) s’ouvre avec le même clair, puis l’original est refusé comme doublon', () => {
    expect(report.lowNibbleFlipped).toEqual({ copy: { text: 'secret' }, original: duplicate });
  });

  it('une copie suivie d’un champ protobuf inconnu (f8 07 01) s’ouvre avec le même clair, puis l’original est refusé comme doublon', () => {
    expect(report.unknownFieldAppended).toEqual({ copy: { text: 'secret' }, original: duplicate });
  });
});
