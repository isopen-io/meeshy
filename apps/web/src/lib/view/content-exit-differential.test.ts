import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { contentExitLaw, contentExitLawOfSource, type ContentExitLaw, type ContentExitProjection } from '@meeshy/shared/utils/content-exit-law';

import { EXIT_ACTIONS, contentExitOf, exitOffers, mediaLeaves, quotedExitOf, type ExitAction, type ExitMessage } from './content-exit';

/**
 * LE DIFFÉRENTIEL (#9573) — le web ne doit JAMAIS offrir ce que la loi
 * partagée refuse, quelle que soit la façon dont la protection est déclarée
 * (colonne, bit, message, pièce) et quelle que soit la porte par laquelle la
 * pièce arrive au verdict (dans `message.attachments`, ou remise à côté).
 */

const NOW = 1_700_000_000_000;
const { EPHEMERAL, EPHEMERAL_AFTER_READ, VIEW_ONCE, BLURRED } = MESSAGE_EFFECT_FLAGS;

type MessageShape = Pick<ExitMessage, 'isViewOnce' | 'viewOnceCount' | 'isBlurred' | 'effectFlags' | 'ephemeralDuration' | 'expiresAt' | 'isEncrypted'>;
type PieceShape = { readonly isViewOnce?: boolean; readonly isBlurred?: boolean; readonly isEncrypted?: boolean; readonly effectFlags?: number };

const base: MessageShape = { isViewOnce: false, viewOnceCount: 0, isBlurred: false };
const later = new Date(NOW + 60_000);

const MESSAGES: Readonly<Record<string, MessageShape>> = {
  'ordinaire': base,
  'flamme à durée (bit + durée)': { ...base, effectFlags: EPHEMERAL, ephemeralDuration: 300 },
  'flamme à durée (durée seule, sans bit)': { ...base, ephemeralDuration: 300 },
  'flamme à durée (bit + durée + échéance)': { ...base, effectFlags: EPHEMERAL, ephemeralDuration: 300, expiresAt: later },
  'après lecture (bits)': { ...base, effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ },
  'après lecture (bit seul, sans EPHEMERAL)': { ...base, effectFlags: EPHEMERAL_AFTER_READ },
  'copie transférée (durée + après lecture)': { ...base, effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ, ephemeralDuration: 60 },
  'vue unique (colonne seule)': { ...base, isViewOnce: true },
  'vue unique (bit seul)': { ...base, effectFlags: VIEW_ONCE },
  'vue unique (colonne + bit)': { ...base, isViewOnce: true, effectFlags: VIEW_ONCE },
  'éphémère sans durée (bit seul)': { ...base, effectFlags: EPHEMERAL },
  'éphémère sans durée (échéance seule)': { ...base, expiresAt: later },
  'flouté (colonne seule)': { ...base, isBlurred: true },
  'flouté (bit seul)': { ...base, effectFlags: BLURRED },
  'chiffré': { ...base, isEncrypted: true },
};

const PIECES: Readonly<Record<string, PieceShape | null>> = {
  'sans pièce': null,
  'pièce ordinaire': { isViewOnce: false, isBlurred: false },
  'pièce ordinaire (aucun champ)': {},
  'pièce vue unique (colonne)': { isViewOnce: true, isBlurred: false },
  'pièce vue unique (bit seul)': { effectFlags: VIEW_ONCE },
  'pièce après lecture (bit seul)': { effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ },
  'pièce éphémère (bit seul)': { effectFlags: EPHEMERAL },
  'pièce floutée (colonne)': { isViewOnce: false, isBlurred: true },
  'pièce floutée (bit seul)': { effectFlags: BLURRED },
  'pièce chiffrée': { isViewOnce: false, isBlurred: false, isEncrypted: true },
};

const projectionOf = (message: MessageShape, piece: PieceShape | null): ContentExitProjection => ({
  isViewOnce: message.isViewOnce ?? null,
  isBlurred: message.isBlurred ?? null,
  effectFlags: message.effectFlags ?? null,
  ephemeralDuration: message.ephemeralDuration ?? null,
  expiresAt: message.expiresAt ?? null,
  attachments: piece === null ? [] : [{ isViewOnce: piece.isViewOnce ?? null, isBlurred: piece.isBlurred ?? null, effectFlags: piece.effectFlags ?? null }],
});

const lawAllows = (law: ContentExitLaw, action: ExitAction): boolean => (action === 'forward' ? law.forward.allowed : law.exportable);

const CASES = Object.entries(MESSAGES).flatMap(([messageLabel, message]) =>
  Object.entries(PIECES).map(([pieceLabel, piece]) => ({ label: `${messageLabel} × ${pieceLabel}`, message, piece })),
);

describe('différentiel — le web n’offre jamais ce que la loi refuse', () => {
  test('le produit cartésien couvre 150 combinaisons', () => {
    expect(CASES.length).toBe(150);
  });

  CASES.forEach(({ label, message, piece }) => {
    const projection = projectionOf(message, piece);
    const laws = [contentExitLaw(projection), contentExitLawOfSource(projection)];
    const refusedBy = (action: ExitAction): boolean => laws.some((law) => !lawAllows(law, action));

    test(`${label} — la pièce DANS le message`, () => {
      const exit = contentExitOf({ ...message, attachments: piece === null ? [] : [piece] }, NOW);
      const overreach = EXIT_ACTIONS.filter((action) => exitOffers(exit, action) && refusedBy(action));
      expect(overreach).toEqual([]);
      expect(exit.leaves && !exit.readable).toBe(false);
      expect(exit.nature).toBe(laws[0]?.nature ?? 'ordinary');
      const sealed = quotedExitOf({ ...message, effectFlags: undefined as unknown as number, attachments: piece === null ? [] : [piece] }, NOW);
      expect([sealed.readable, sealed.leaves, sealed.forward.allowed, sealed.nature === 'ordinary']).toEqual([false, false, false, false]);
      const allowed = laws[0]?.forward;
      if (exit.forward.allowed && allowed?.allowed === true) expect(exit.forward.maxDurationSeconds).toBe(allowed.maxDurationSeconds);
    });

    if (piece !== null) {
      test(`${label} — la pièce remise À CÔTÉ d’un message servi sans ses pièces`, () => {
        const leaves = mediaLeaves({ message, piece, now: NOW });
        expect(leaves && refusedBy('save')).toBe(false);
      });
    }
  });
});

describe('une action sur UNE pièce obéit au verdict du message ENTIER', () => {
  test('la pièce ordinaire d’un message dont une AUTRE pièce est à vue unique ne sort pas', () => {
    const open = { isViewOnce: false, isBlurred: false };
    const message = { ...base, attachments: [open, { isViewOnce: true, isBlurred: false }] };
    expect(mediaLeaves({ message, piece: open, now: NOW })).toBe(false);
  });
});
