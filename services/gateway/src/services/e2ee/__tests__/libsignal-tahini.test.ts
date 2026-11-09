/**
 * Tahini (#17113) : libsignal 0.106 arbitre l'ouverture SIMULTANÉE d'une session
 * par les deux pairs, casse un interblocage après cinq changements de sens, et ne
 * garde plus que TROIS sessions archivées (quarante en 0.105.4). Ce banc fixe ce
 * que la passerelle et ses appareils de test observent avec la VRAIE
 * bibliothèque (processus à part, `libsignal-tahini.mjs`) :
 *
 * - deux pairs qui ouvrent chacun une session et envoient avant d'avoir reçu
 *   finissent par se lire, puis échangent sans perte ;
 * - un SignalMessage en vol sur une session encore dans les trois archivées
 *   s'ouvre ; sur une session plus ancienne, il est perdu.
 *
 * Analyse : packages/shared/decisions/2026-11-09-une-montee-de-libsignal-est-un-seul-lot-sur-les-quatre-plateformes-17113.md
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { execFileSync } from 'child_process';
import { join } from 'path';

type Report = {
  loaded: string;
  glare: { firstMessages: Array<string | null>; afterwards: Array<string | null> };
  inFlightAfterRestarts: Record<string, string | null>;
};

const report = JSON.parse(execFileSync(process.execPath, [join(__dirname, 'libsignal-tahini.mjs')]).toString()) as Report;

describe('libsignal — Tahini : ouverture simultanée et sessions archivées (#17113)', () => {
  it('deux pairs qui ouvrent chacun une session et envoient aussitôt se lisent, puis échangent sans perte', () => {
    expect(report.glare.afterwards).toEqual(report.glare.afterwards.map((_, index) => `ping-${index}`));
    expect(report.glare.afterwards.length).toBeGreaterThan(0);
  });

  it('un SignalMessage en vol s’ouvre tant que sa session reste parmi les trois archivées', () => {
    expect(report.inFlightAfterRestarts['1']).toBe('en vol');
    expect(report.inFlightAfterRestarts['3']).toBe('en vol');
  });

  it('au-delà de trois redémarrages de session, le SignalMessage en vol est perdu', () => {
    expect(report.inFlightAfterRestarts['4']).toBeNull();
  });
});
