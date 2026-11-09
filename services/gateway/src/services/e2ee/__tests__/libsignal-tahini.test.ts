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
 *   s'ouvre ; sur une session plus ancienne, il est perdu, refusé au
 *   déchiffrement. Les redémarrages sont simulés par des ouvertures LOCALES
 *   chez le destinataire (`processPreKeyBundle`), chacune archivant la session
 *   active.
 *
 * Analyse : packages/shared/decisions/2026-11-09-une-montee-de-libsignal-est-un-seul-lot-sur-les-quatre-plateformes-17113.md
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { execFileSync } from 'child_process';
import { join } from 'path';

type Received = { text: string } | { error: { code: number; message: string } };
type Report = {
  loaded: string;
  glare: { firstMessages: Received[]; afterwards: Received[] };
  inFlightAfterRestarts: Record<string, Received>;
};

const report = JSON.parse(execFileSync(process.execPath, [join(__dirname, 'libsignal-tahini.mjs')]).toString()) as Report;

describe('libsignal — Tahini : ouverture simultanée et sessions archivées (#17113)', () => {
  it('deux pairs qui ouvrent chacun une session et envoient aussitôt se lisent, puis échangent sans perte', () => {
    expect(report.glare.firstMessages).toEqual([{ text: 'alice-1' }, { text: 'bob-1' }]);
    expect(report.glare.afterwards).toEqual([0, 1, 2, 3, 4, 5].map((round) => ({ text: `ping-${round}` })));
  });

  it('un SignalMessage en vol s’ouvre tant que sa session reste parmi les trois archivées', () => {
    expect(report.inFlightAfterRestarts['1']).toEqual({ text: 'en vol' });
    expect(report.inFlightAfterRestarts['3']).toEqual({ text: 'en vol' });
  });

  it('au-delà de trois redémarrages de session, le SignalMessage en vol est refusé au déchiffrement', () => {
    expect(report.inFlightAfterRestarts['4']).toEqual({
      error: { code: 0, message: expect.stringMatching(/^invalid Whisper message: decryption failed/) },
    });
  });
});
