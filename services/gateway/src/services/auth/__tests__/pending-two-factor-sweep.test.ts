/**
 * Un TROISIÈME site ne peut plus réécrire la boucle du mint (#4542)
 *
 * Le critère 1 de l'issue a deux moitiés. La première — « un site unique
 * compose le défi, les deux producteurs l'appellent » — se prouve par le
 * témoin de collision. La seconde — « un balayage interdit qu'un troisième
 * réécrive la boucle » — ne se prouve que par un cliquet : une convention ne
 * garde rien, elle se contourne en silence, et c'est exactement ce qui a
 * produit la duplication que ce lot supprime.
 *
 * Trois inventaires VIDES, et trois bornes de non-vacuité — parce qu'un
 * balayage qui ne lit rien passe au vert, et c'est la pire des façons de
 * passer.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { statSync } from 'fs';
import { join } from 'path';

import {
  CHALLENGE_COLUMN,
  HAND_ROLLED_MINT,
  REBORROWED_COLUMN,
  SITE_UNIQUE,
  productionSources,
  sweepChallengeColumnSites,
  sweepHandRolledMintSites,
  sweepReborrowedColumnSites,
  walk,
  wiredProducers
} from './pending-two-factor-sweep';

const SRC_DIR = join(__dirname, '..', '..', '..');

describe('site unique du défi d\'étape 2 (#4542)', () => {
  describe('bornes de non-vacuité — sans elles, un balayage vide passerait au vert', () => {
    it('lit bien toute l\'arborescence du gateway', () => {
      expect(statSync(SRC_DIR).isDirectory()).toBe(true);
      expect(walk(SRC_DIR).length).toBeGreaterThan(400);
      expect(productionSources(SRC_DIR).length).toBeGreaterThan(300);
    });

    it('le site unique existe, et le motif des colonnes le VOIT', () => {
      const site = productionSources(SRC_DIR).find((entry) => entry.file === SITE_UNIQUE);

      expect(site).toBeDefined();
      expect(
        (site as { source: string }).source.split('\n').filter((line) => CHALLENGE_COLUMN.test(line)).length
      ).toBeGreaterThanOrEqual(4);
    });

    it('les DEUX producteurs connus passent par le site unique', () => {
      expect(wiredProducers(SRC_DIR).sort()).toEqual([
        'services/AuthService.ts',
        'services/MagicLinkService.ts'
      ]);
    });

    /**
     * Le détecteur du mint fabriqué à la main, éprouvé sur les DEUX corps
     * réels qu'il vient de faire disparaître. Un motif qui ne rougit sur
     * aucune fixture ne garde rien : la seule preuve qu'il sait voir est de
     * lui montrer ce qu'il doit voir.
     */
    it('le motif du mint reconnaît les deux corps supprimés, et épargne leurs consommateurs', () => {
      expect(HAND_ROLLED_MINT.test("const twoFactorToken = crypto.randomBytes(32).toString('hex');")).toBe(true);
      expect(
        HAND_ROLLED_MINT.test(
          "const twoFactorTokenHash = crypto.createHash('sha256').update(twoFactorToken).digest('hex');"
        )
      ).toBe(true);

      expect(HAND_ROLLED_MINT.test('const { twoFactorToken, code } = request.body;')).toBe(false);
      expect(HAND_ROLLED_MINT.test('  twoFactorToken?: string;')).toBe(false);
      expect(HAND_ROLLED_MINT.test('        twoFactorToken // Return the raw token to the client')).toBe(false);
    });

    /** Le motif de l'emprunt, éprouvé sur la ligne exacte qui portait le défaut. */
    it('le motif de l\'emprunt reconnaît la ligne d\'origine, et épargne la vraie vérification', () => {
      expect(
        REBORROWED_COLUMN.test('            phoneVerificationCode: twoFactorTokenHash, // Reusing this field')
      ).toBe(true);
      expect(REBORROWED_COLUMN.test('        phoneVerificationCode: twoFactorTokenHash,')).toBe(true);

      expect(REBORROWED_COLUMN.test('          phoneVerificationCode: hashedCode,')).toBe(false);
      expect(REBORROWED_COLUMN.test('          phoneVerificationExpiry: codeExpiry')).toBe(false);
      expect(REBORROWED_COLUMN.test('            phoneVerificationCode: null,')).toBe(false);
    });
  });

  it('inventaire 1 — aucun fichier de production hors du site unique ne nomme les colonnes du défi', () => {
    expect(sweepChallengeColumnSites(SRC_DIR)).toEqual([]);
  });

  it('inventaire 2 — aucun fichier de production ne fabrique le jeton d\'étape 2 lui-même', () => {
    expect(sweepHandRolledMintSites(SRC_DIR)).toEqual([]);
  });

  it('inventaire 3 — aucun fichier ne remet le défi dans la colonne d\'une autre vérification', () => {
    expect(sweepReborrowedColumnSites(SRC_DIR)).toEqual([]);
  });
});
