/**
 * LES VECTEURS DE LA LOI DE PROPOSITION DES CADRES (#10156, L4) —
 * `packages/shared/design/packs/frame-offer-vectors.json`, PRODUIT par la loi TS
 * (`utils/game/glory-frames.ts`) et rejoué par iOS (`GloryFrameOfferVectorTests.swift`,
 * sur le miroir `GameGloryFrames.swift`). Sur divergence, le TS a raison.
 *
 * Le catalogue des vecteurs est le registre RÉEL (L3) projeté sur ce que la loi lit, plus deux packs
 * SYNTHÉTIQUES qui n'existent pas encore — `succes` (LS) et `mythologies` (L15) — pour que leurs lignes du
 * tableau du § 5.4 soient tenues des deux côtés avant leur lot.
 *
 * Régénération voulue : `UPDATE_FRAME_OFFER_VECTORS=1 npx vitest run __tests__/vectors/frame-offer.vectors.test.ts`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePackIndex } from '../../types/content-pack-index';
import { parseGloryFrameContract } from '../../types/glory-frames';
import { gloryFramesFor, type GloryFrameOfferFrame, type GloryFrameOfferPack } from '../../utils/game/glory-frames';
import type { GloryAtmosphere } from '../../types/glory-atmospheres';
import type { AchievementRarity } from '../../utils/game/glory';

const REPO = join(__dirname, '../../../..');
const FILE = join(REPO, 'packages/shared/design/packs/frame-offer-vectors.json');
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown;

const project = ({ id, usage, collection, appliesTo, option, hidden }: GloryFrameOfferFrame): GloryFrameOfferFrame => ({ id, usage, collection, appliesTo, option, hidden });

const real: readonly GloryFrameOfferPack[] = parsePackIndex(readJson(join(REPO, 'packages/shared/design/glory-frames/packs.json'))).entries.map((entry) => ({
  slug: entry.slug,
  atmosphere: entry.atmosphere ?? null,
  collections: (entry.collections ?? []).map((collection) => collection.slug),
  frames: (parseGloryFrameContract(readJson(join(REPO, 'services/gateway/assets/packs', entry.contract.src)))?.contract.frames ?? []).map(project),
}));

/** Le pack synthétique n'a pas de cadre `mythic` : la ligne « rareté sans cadre ⇒ le neutre » se tient. */
const RARITIES: readonly AchievementRarity[] = ['common', 'rare', 'epic', 'legendary'];

const synthetic: readonly GloryFrameOfferPack[] = [
  {
    slug: 'succes',
    atmosphere: null,
    collections: ['succes'],
    frames: [
      ...RARITIES.map((rarity) => ({ id: `succes.${rarity}`, usage: { kind: 'achievement', rarity } as const, collection: 'succes', appliesTo: { family: 'achievement', rarity } as const, option: null, hidden: false })),
      { id: 'succes.neutre', usage: { kind: 'achievement' }, collection: 'succes', appliesTo: { family: 'achievement', rarity: null }, option: null, hidden: false },
      { id: 'succes.ancien-epic', usage: { kind: 'achievement', rarity: 'epic' }, collection: 'succes', appliesTo: { family: 'achievement', rarity: 'epic' }, option: null, hidden: true },
    ],
  },
  {
    slug: 'mythologies',
    atmosphere: null,
    collections: ['mythologies'],
    frames: (['a', 'b'] as const).map((option) => ({
      id: `mythologies.murmure-${option}`,
      usage: { kind: 'rank', rank: 'murmure' } as const,
      collection: 'mythologies',
      appliesTo: { family: 'rank', rank: 'murmure', division: null } as const,
      option: option.toUpperCase(),
      hidden: false,
    })),
  },
];

const catalog: readonly GloryFrameOfferPack[] = [...real, ...synthetic];

type CaseInput = {
  readonly stepId: string;
  readonly atmosphere: GloryAtmosphere | null;
  readonly lastChosen: string | null;
  readonly installed: readonly string[];
  readonly rarity: AchievementRarity | null;
};

const DEFAULTS = ['afrique', 'moments', 'tresor'];
const WITH_SUCCES = [...DEFAULTS, 'succes', 'mythologies'];

const at = (name: string, stepId: string, over: Partial<CaseInput> = {}) => ({
  name,
  input: { stepId, atmosphere: null, lastChosen: null, installed: DEFAULTS, rarity: null, ...over },
});

const PLAN = [
  at('Ambassadeur sans atmosphère : needsAtmosphere, l’Afrique, la division d’abord', 'rank:ambassadeur:3'),
  at('Oracle B, atmosphère null → needsAtmosphere + suggested = Afrique', 'rank:oracle:2'),
  at('choix reporté → présélection dans l’Afrique', 'rank:ambassadeur:5'),
  at('lastChosen d’une autre atmosphère → ignoré', 'rank:ambassadeur:2', { atmosphere: 'afrique', lastChosen: 'neon.ambassadeur-2' }),
  at('Orateur IV dans l’Olympe installé', 'rank:orateur:4', { atmosphere: 'olympe', installed: [...DEFAULTS, 'olympe'] }),
  at('Mythe (rank:mythe:0) au Néon', 'rank:mythe:0', { atmosphere: 'neon', installed: [...DEFAULTS, 'neon'] }),
  at('Afrique : Savane puis Royaumes', 'rank:orateur:1', { atmosphere: 'afrique' }),
  at('Afrique : la collection du dernier choix d’abord', 'rank:orateur:1', { atmosphere: 'afrique', lastChosen: 'royaumes.orateur-b' }),
  at('Légende I : others marque chaque pack installé ou non', 'rank:legende:1', { installed: [...DEFAULTS, 'nord'] }),
  at('pack non installé ⇒ jamais dans suggested', 'rank:ambassadeur:1', { installed: ['moments'] }),
  at('atmosphère choisie, pack NON installé ⇒ Afrique + reinstall', 'rank:ambassadeur:1', { atmosphere: 'olympe' }),
  at('atmosphère choisie, pack installé mais pas prêt ⇒ suggested reste celui de l’atmosphère', 'rank:ambassadeur:1', { atmosphere: 'olympe', installed: [...DEFAULTS, 'olympe'] }),
  at('meesh:1 → l’écrin', 'meesh:1'),
  at('meesh:30 → argent', 'meesh:30'),
  at('meesh:200 → or', 'meesh:200'),
  at('meesh:3000 → prisme', 'meesh:3000'),
  at('tier:lueur → lueur', 'tier:lueur'),
  at('tier:comete → aurore', 'tier:comete'),
  at('tier:infini → supernova', 'tier:infini'),
  at('treasury:coffre → a b c', 'treasury:coffre'),
  at('treasury:coffre, dernier choix b', 'treasury:coffre', { lastChosen: 'tresor.coffre-b' }),
  at('flame:30 → le cadre du seuil', 'flame:30'),
  at('day → jour a et b', 'day:2026-10-12'),
  at('succès rare ⇒ succes.rare', 'achievement:messages.3', { rarity: 'rare', installed: WITH_SUCCES }),
  at('succès sans rareté servie ⇒ le cadre neutre, jamais une rareté', 'achievement:messages.3', { installed: WITH_SUCCES }),
  at('succès composé, rareté servie (un cadre masqué ne se propose pas)', 'achievement:defi.streak-3', { rarity: 'epic', installed: WITH_SUCCES }),
  at('succès composé, rareté non servie ⇒ le neutre', 'achievement:defi.streak-3', { installed: WITH_SUCCES }),
  at('pack des succès absent ⇒ carte simple', 'achievement:messages.3', { rarity: 'rare' }),
  at('succès d’une rareté sans cadre ⇒ le neutre, jamais une autre rareté', 'achievement:messages.3', { rarity: 'mythic', installed: WITH_SUCCES }),
  at('Murmure → les cadres de sa mythologie', 'rank:murmure:3', { installed: WITH_SUCCES }),
  at('Prestige sans cadre de prestige ⇒ carte simple', 'prestige:2', { atmosphere: 'afrique', installed: WITH_SUCCES }),
  at('niveau 100 sans cadre déclaré ⇒ carte simple', 'level-100:0'),
  at('départ ⇒ carte simple', 'start'),
  at('trophée ⇒ carte simple', 'trophy:trophy.prestige.1'),
  at('saison ⇒ carte simple', 'season:3'),
  at('identité illisible ⇒ rien', 'rank:ambassadeur:9'),
  at('Meesh zéro ⇒ rien', 'meesh:0'),
  at('palier inconnu ⇒ rien', 'tier:inconnu'),
  at('division écrite autrement ⇒ rien', 'rank:ambassadeur:3.0'),
  at('Meesh signée ⇒ rien', 'meesh:+10'),
];

const evaluate = (input: CaseInput) => gloryFramesFor({ ...input, catalog, installed: new Set(input.installed) });

const render = (): string =>
  `${JSON.stringify({ $format: 'frame-offer/1', catalog, cases: PLAN.map(({ name, input }) => ({ name, input, expected: evaluate(input) })) }, null, 2)}\n`;

if (process.env.UPDATE_FRAME_OFFER_VECTORS === '1') writeFileSync(FILE, render());

describe('frame-offer-vectors.json ne diverge pas de la loi', () => {
  it('est exactement ce que la loi produit', () => {
    expect(JSON.parse(readFileSync(FILE, 'utf8'))).toEqual(JSON.parse(render()));
  });

  it('porte au moins un cas par ligne du tableau du § 5.4', () => {
    const families = new Set(PLAN.map(({ input }) => (input.stepId.startsWith('rank:') ? input.stepId.split(':').slice(0, 2).join(':') : input.stepId.split(':')[0])));
    for (const family of ['rank:murmure', 'rank:ambassadeur', 'rank:orateur', 'rank:oracle', 'rank:legende', 'rank:mythe', 'tier', 'level-100', 'prestige', 'start', 'achievement', 'meesh', 'treasury', 'flame', 'day']) {
      expect(families.has(family)).toBe(true);
    }
  });
});
