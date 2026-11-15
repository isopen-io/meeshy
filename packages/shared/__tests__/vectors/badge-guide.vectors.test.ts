/**
 * Suite de vecteurs du guide d'un badge (#9639) — `badgeGuide`.
 *
 * `badge-guide.vectors.json` est le CONTRAT cross-plateforme : ce fichier (TS,
 * la source de vérité) le produit et le rejoue ; `BadgeGuideVectorTests.swift`
 * (SDK, via `BadgeGuideResolver`) le rejoue. Sur divergence, c'est le TS qui a
 * raison : le miroir bouge, jamais le vecteur sans lui.
 *
 * Deux gardes : `runVectors` rejoue chaque cas à travers la loi ; le test de
 * divergence compare le fichier à ce que la loi PRODUIT (retouche à la main,
 * cas du plan manquant).
 *
 * Régénération voulue : `UPDATE_BADGE_GUIDE_VECTORS=1 bun test __tests__/vectors/badge-guide.vectors.test.ts`.
 *
 * @see packages/shared/utils/game/badge-guide.ts
 * @see packages/shared/fixtures/reading-modes/badge-guide.vectors.json
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runVectors } from './harness.js';
import type { EngagementAxisKey } from '../../types/engagement.js';
import { badgeGuide, type BadgeGuideInput } from '../../utils/game/badge-guide.js';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'reading-modes', 'badge-guide.vectors.json');

type Plan = { readonly label: string; readonly input: BadgeGuideInput };

const plan = (label: string, axisKey: EngagementAxisKey, count: number, served: BadgeGuideInput['served'] = []): Plan => ({
  label,
  input: { axisKey, count, served },
});

const PLAN: readonly Plan[] = [
  plan('zéro : aucune étoile, le cuivre à 1', 'content.post', 0),
  plan('1 : le cuivre, seuil 1 franchi', 'social.friendship', 1),
  plan('9 : toujours le cuivre, 1 de plus pour le bronze', 'social.tracked_link', 9),
  plan('10 : le bronze pile au seuil', 'social.share', 10),
  plan('37 : le bronze, 13 vers l’argent', 'content.text_message', 37),
  plan('99 : l’argent, 1 vers l’or', 'comment.text', 99),
  plan('100 : l’or et son ruban', 'comment.audio', 100),
  plan('999 : le platine, 1 vers l’obsidienne', 'tool.reaction', 999),
  plan('1 000 : l’obsidienne', 'tool.attachment', 1000),
  plan('5 000 : le prisme, plus de prochaine étoile', 'tool.sticker', 5000),
  plan('12 345 : toujours le prisme', 'conversation.private', 12345),
  plan('paliers datés par la trace servie', 'content.story', 12, [
    { threshold: 1, reachedAt: '2026-09-01T10:00:00.000Z' },
    { threshold: 10, reachedAt: '2026-10-02T10:00:00.000Z' },
  ]),
  plan('palier tenu par sa seule trace, compteur redescendu', 'content.reel', 40, [{ threshold: 50, reachedAt: '2026-08-01T00:00:00.000Z' }]),
  plan('seuil servi hors échelle ignoré', 'conversation.public', 3, [{ threshold: 7, reachedAt: '2026-08-01T00:00:00.000Z' }]),
  plan('compteur négatif : zéro', 'conversation.community', -4),
  plan('compteur fractionnaire : tronqué', 'conversation.group_created', 9.8),
  plan('invité venu : 2', 'social.invite_joined', 2),
  plan('montage dans l’app : 50', 'tool.in_app_edit', 50),
  plan('publication directe : 500', 'tool.direct_publish', 500),
  plan('message vocal : 4 999', 'content.audio_message', 4999),
];

const evaluate = (input: BadgeGuideInput): unknown => JSON.parse(JSON.stringify(badgeGuide(input))) as unknown;

const render = (): string =>
  `${JSON.stringify(
    PLAN.map((entry) => ({ _label: entry.label, input: entry.input, expected: evaluate(entry.input) })),
    null,
    2,
  )}\n`;

if (process.env.UPDATE_BADGE_GUIDE_VECTORS === '1') writeFileSync(FILE, render());

runVectors<BadgeGuideInput, unknown>('badge-guide', evaluate);

describe('badge-guide.vectors.json ne diverge pas de la loi', () => {
  it('est exactement ce que la loi produit', () => {
    expect(JSON.parse(readFileSync(FILE, 'utf-8'))).toEqual(JSON.parse(render()));
  });
});
