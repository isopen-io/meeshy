import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePackIndex } from '../../types/content-pack-index';
import { canUseFrame } from '../../types/frame-usage';
import { parseGloryFrameContract } from '../../types/glory-frames';
import { ACHIEVEMENT_RARITIES, type AchievementRarity } from '../../utils/game/glory';
import { LEVEL_TIER_KEYS } from '../../utils/game/levels';
import { PHOTO_STATIC_STEP_IDS } from '../../utils/game/photo-step-ids';
import {
  GLORY_FRAME_OFFER_EXEMPT_FAMILIES,
  frameUseContextOf,
  gloryFramesFor,
  type GloryFrameOfferPack,
  type GloryFramesForInput,
} from '../../utils/game/glory-frames';

const REPO = join(__dirname, '../../../..');
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown;

/** Le catalogue RÉEL : le registre publié et le contrat de chaque pack (L3). */
const catalog: readonly GloryFrameOfferPack[] = parsePackIndex(readJson(join(REPO, 'packages/shared/design/glory-frames/packs.json'))).entries.map((entry) => ({
  slug: entry.slug,
  atmosphere: entry.atmosphere ?? null,
  collections: (entry.collections ?? []).map((collection) => collection.slug),
  frames: parseGloryFrameContract(readJson(join(REPO, 'services/gateway/assets/packs', entry.contract.src)))?.contract.frames ?? [],
}));

/** Les packs installés par défaut et non retirables : l'Afrique éternelle, les moments, le trésor et, depuis LS (#10168), les hauts faits. */
const DEFAULTS = ['afrique', 'moments', 'tresor', 'succes'];
const offer = (over: Partial<GloryFramesForInput> & Pick<GloryFramesForInput, 'stepId'>) =>
  gloryFramesFor({ atmosphere: null, lastChosen: null, catalog, installed: new Set(DEFAULTS), ...over });
const ids = (refs: readonly { readonly frameId: string }[]) => refs.map((ref) => ref.frameId);

describe('la loi de proposition des cadres (§ 5.4) — une étape d’atmosphère', () => {
  it('Ambassadeur sans atmosphère : needsAtmosphere, et l’Afrique éternelle suggérée — la division d’abord, Savane puis Royaumes', () => {
    const result = offer({ stepId: 'rank:ambassadeur:3' });
    expect(result.needsAtmosphere).toBe(true);
    expect(result.reinstall).toBeNull();
    expect(ids(result.suggested).slice(0, 2)).toEqual(['savane.ambassadeur-3', 'royaumes.ambassadeur-3']);
    expect(ids(result.suggested)).toHaveLength(10);
    expect(result.preselected?.frameId).toBe('savane.ambassadeur-3');
  });

  it('l’écran de choix montre les sept atmosphères, l’Afrique d’abord, chacune par son cadre du rang et de la division ; chaque pack dit s’il est installé', () => {
    const result = offer({ stepId: 'rank:legende:1' });
    expect(result.others.map((other) => other.atmosphere)).toEqual(['egypte', 'olympe', 'celeste', 'nord', 'abysses', 'neon']);
    expect(result.others.every((other) => !other.installed)).toBe(true);
    expect(result.others.map((other) => other.frames[0]?.frameId)).toEqual(['egypte.legende-1', 'olympe.legende-1', 'celeste.legende-1', 'nord.legende-1', 'abysses.legende-1', 'neon.legende-1']);
  });

  it('Oracle B, atmosphère null → needsAtmosphere + suggested = l’Afrique, A B C de Savane puis de Royaumes, quelle que soit la division', () => {
    const result = offer({ stepId: 'rank:oracle:2' });
    expect(result.needsAtmosphere).toBe(true);
    expect(ids(result.suggested)).toEqual(['savane.oracle-a', 'savane.oracle-b', 'savane.oracle-c', 'royaumes.oracle-a', 'royaumes.oracle-b', 'royaumes.oracle-c']);
  });

  it('Orateur IV dans l’atmosphère choisie et installée : A B C de cette atmosphère', () => {
    const result = offer({ stepId: 'rank:orateur:4', atmosphere: 'olympe', installed: new Set([...DEFAULTS, 'olympe']) });
    expect(result.needsAtmosphere).toBe(false);
    expect(ids(result.suggested)).toEqual(['olympe.orateur-a', 'olympe.orateur-b', 'olympe.orateur-c']);
    expect(result.others.map((other) => [other.pack, other.installed])).toContainEqual(['afrique', true]);
  });

  it('Mythe (rank:mythe:0) : A B C du Mythe', () => {
    expect(ids(offer({ stepId: 'rank:mythe:0', atmosphere: 'neon', installed: new Set([...DEFAULTS, 'neon']) }).suggested)).toEqual(['neon.mythe-a', 'neon.mythe-b', 'neon.mythe-c']);
  });

  it('Afrique : la collection du dernier choix d’abord', () => {
    const result = offer({ stepId: 'rank:orateur:1', atmosphere: 'afrique', lastChosen: 'royaumes.orateur-b' });
    expect(ids(result.suggested)).toEqual(['royaumes.orateur-a', 'royaumes.orateur-b', 'royaumes.orateur-c', 'savane.orateur-a', 'savane.orateur-b', 'savane.orateur-c']);
    expect(result.preselected?.frameId).toBe('royaumes.orateur-b');
  });

  it('lastChosen d’une autre atmosphère → ignoré : le premier de suggested est présélectionné', () => {
    const result = offer({ stepId: 'rank:ambassadeur:2', atmosphere: 'afrique', lastChosen: 'neon.ambassadeur-2' });
    expect(result.preselected?.frameId).toBe('savane.ambassadeur-2');
  });

  it('choix reporté (« Choisir plus tard ») → présélection dans l’Afrique, toujours servie puisque non retirable', () => {
    const result = offer({ stepId: 'rank:ambassadeur:5' });
    expect(result.preselected?.frameId).toBe('savane.ambassadeur-5');
  });

  it('atmosphère choisie dont le pack N’est PAS installé ⇒ suggested = Afrique, reinstall = son pack', () => {
    const result = offer({ stepId: 'rank:ambassadeur:1', atmosphere: 'olympe' });
    expect(result.needsAtmosphere).toBe(false);
    expect(result.reinstall).toBe('olympe');
    expect(ids(result.suggested).slice(0, 2)).toEqual(['savane.ambassadeur-1', 'royaumes.ambassadeur-1']);
    expect(ids(result.suggested).every((id) => !id.startsWith('olympe.'))).toBe(true);
  });

  it('pack installé mais pas encore PRÊT sur l’appareil ⇒ suggested reste celui de l’atmosphère : la loi parle d’installation, jamais d’octets', () => {
    expect(ids(offer({ stepId: 'rank:ambassadeur:1', atmosphere: 'olympe', installed: new Set([...DEFAULTS, 'olympe']) }).suggested)[0]).toBe('olympe.ambassadeur-1');
  });

  it('un pack non installé n’entre JAMAIS dans suggested — même l’Afrique, si l’appareil ne l’a pas', () => {
    expect(offer({ stepId: 'rank:ambassadeur:1', installed: new Set(['moments']) }).suggested).toEqual([]);
  });

  it('un cadre MASQUÉ ne se propose plus', () => {
    const hiddenCatalog = catalog.map((pack) => ({ ...pack, frames: pack.frames.map((frame) => (frame.id === 'savane.ambassadeur-1' ? { ...frame, hidden: true } : frame)) }));
    expect(ids(offer({ stepId: 'rank:ambassadeur:1', catalog: hiddenCatalog }).suggested)[0]).toBe('royaumes.ambassadeur-1');
  });
});

describe('les moments, le trésor, la Flamme, la Meesh', () => {
  it('tier:comete → aurore, le palier dessiné le plus proche en dessous (D4) ; tier:galaxie → galaxie', () => {
    expect(ids(offer({ stepId: 'tier:comete' }).suggested)).toEqual(['moments.palier-aurore']);
    expect(ids(offer({ stepId: 'tier:galaxie' }).suggested)).toEqual(['moments.palier-galaxie']);
    expect(ids(offer({ stepId: 'tier:infini' }).suggested)).toEqual(['moments.palier-supernova']);
  });

  it('meesh:1 → l’écrin ; meesh:200 → or ; meesh:3000 → prisme ; meesh:30 → argent', () => {
    expect(['meesh:1', 'meesh:200', 'meesh:3000', 'meesh:30'].map((stepId) => ids(offer({ stepId }).suggested))).toEqual([
      ['moments.meesh-1'],
      ['moments.meesh-100'],
      ['moments.meesh-1000'],
      ['moments.meesh-10'],
    ]);
  });

  it('treasury:coffre → les cadres a b c du palier ; flame:30 → le cadre du seuil ; day → jour a et b', () => {
    expect(ids(offer({ stepId: 'treasury:coffre' }).suggested)).toEqual(['tresor.coffre-a', 'tresor.coffre-b', 'tresor.coffre-c']);
    expect(ids(offer({ stepId: 'flame:30' }).suggested)).toEqual(['moments.flamme-30']);
    expect(ids(offer({ stepId: 'day:2026-10-12' }).suggested)).toEqual(['moments.jour-a', 'moments.jour-b']);
  });

  it('le dernier choix de la MÊME famille est présélectionné', () => {
    expect(offer({ stepId: 'treasury:coffre', lastChosen: 'tresor.coffre-b' }).preselected?.frameId).toBe('tresor.coffre-b');
  });

  it('le pack des moments non installé ⇒ aucune suggestion (carte simple)', () => {
    expect(offer({ stepId: 'flame:7', installed: new Set(['afrique']) }).suggested).toEqual([]);
  });
});

describe('la loi d’usage (#10146) — jamais un cadre hors de son usage', () => {
  it('un Prestige sans cadre de prestige ⇒ carte simple : aucun cadre de rang ne le sert', () => {
    const result = offer({ stepId: 'prestige:2', atmosphere: 'afrique' });
    expect(result).toEqual({ needsAtmosphere: false, suggested: [], others: [], reinstall: null, preselected: null });
  });

  it('le niveau 100, le départ, un trophée, une ligue, une saison : carte simple tant qu’aucun cadre n’est déclaré pour eux (D5, #10180)', () => {
    for (const stepId of ['level-100:0', 'start', 'trophy:trophy.prestige.1', 'league-up:2026-10-05:or', 'season:3']) {
      expect({ stepId, suggested: offer({ stepId }).suggested }).toEqual({ stepId, suggested: [] });
    }
  });

  it('un haut fait sans le pack des hauts faits (ancien client) ⇒ carte simple, jamais un cadre de rang ni un cadre libre', () => {
    expect(offer({ stepId: 'achievement:messages.3', rarity: 'rare', installed: new Set(['afrique', 'moments', 'tresor']) }).suggested).toEqual([]);
  });
});

describe('les hauts faits (LS, #10168, PP9) — un haut fait se photographie dans SA rareté', () => {
  const withSucces = (over: Partial<GloryFramesForInput> & Pick<GloryFramesForInput, 'stepId'>) => offer({ installed: new Set(DEFAULTS), ...over });

  it('rare ⇒ succes.rare, et chaque rareté a son cadre, seul proposé', () => {
    for (const rarity of ACHIEVEMENT_RARITIES) {
      expect({ rarity, ids: ids(withSucces({ stepId: 'achievement:messages.3', rarity }).suggested) }).toEqual({ rarity, ids: [`succes.${rarity}`] });
    }
    expect(withSucces({ stepId: 'achievement:messages.3', rarity: 'rare' }).preselected?.frameId).toBe('succes.rare');
  });

  it('rareté non servie ⇒ le cadre NEUTRE, jamais celui d’une rareté — pour un haut fait simple comme pour un composé', () => {
    expect(ids(withSucces({ stepId: 'achievement:messages.3' }).suggested)).toEqual(['succes.neutre']);
    expect(ids(withSucces({ stepId: 'achievement:defi.streak-3', rarity: null }).suggested)).toEqual(['succes.neutre']);
    expect(ids(withSucces({ stepId: 'achievement:defi.streak-3', rarity: 'epic' }).suggested)).toEqual(['succes.epic']);
  });

  it('une rareté dont le cadre est masqué ⇒ le neutre, jamais une autre rareté', () => {
    const hiddenMythic = catalog.map((pack) => ({ ...pack, frames: pack.frames.map((frame) => (frame.id === 'succes.mythic' ? { ...frame, hidden: true } : frame)) }));
    expect(ids(withSucces({ stepId: 'achievement:messages.3', rarity: 'mythic', catalog: hiddenMythic }).suggested)).toEqual(['succes.neutre']);
  });

  it('le pack `succes` ne porte que des cadres de hauts faits : aucun cadre de rang, aucun cadre libre, et chaque rareté plus le neutre', () => {
    const succes = catalog.find((pack) => pack.slug === 'succes');
    expect(succes?.atmosphere).toBeNull();
    expect(succes?.frames.map((frame) => frame.usage.kind)).toEqual(Array(6).fill('achievement'));
    expect(succes?.frames.map((frame) => (frame.appliesTo.family === 'achievement' ? frame.appliesTo.rarity : 'autre')).sort()).toEqual([...ACHIEVEMENT_RARITIES, null].sort());
  });

  it('un cadre de haut fait n’est jamais proposé à une autre étape', () => {
    for (const stepId of ['rank:ambassadeur:3', 'tier:lueur', 'treasury:coffre', 'flame:30', 'day:2026-10-12', 'meesh:1']) {
      expect({ stepId, leaked: ids(withSucces({ stepId }).suggested).filter((id) => id.startsWith('succes.')) }).toEqual({ stepId, leaked: [] });
    }
  });

  it('chaque cadre proposé, suggéré ou dans others, peut servir le contexte de l’étape', () => {
    const steps = PHOTO_STATIC_STEP_IDS.filter((_, at) => at % 7 === 0);
    for (const stepId of steps) {
      const context = frameUseContextOf(stepId, null);
      const result = offer({ stepId, installed: new Set(catalog.map((pack) => pack.slug)) });
      const proposed = [...result.suggested, ...result.others.flatMap((other) => other.frames)];
      const usages = proposed.map((ref) => catalog.flatMap((pack) => pack.frames).find((frame) => frame.id === ref.frameId)?.usage);
      expect({ stepId, refused: usages.filter((usage) => usage === undefined || context === null || !canUseFrame(usage, context)).length }).toEqual({ stepId, refused: 0 });
    }
  });

  it('un cadre dont l’usage nomme UNE division ne sert que cette division — la loi d’usage borne la proposition même quand le placement l’ordonnerait (D3)', () => {
    const base = catalog.find((pack) => pack.slug === 'afrique');
    const template = base?.frames.find((frame) => frame.appliesTo.family === 'rank' && frame.appliesTo.rank === 'ambassadeur' && frame.appliesTo.division === 3);
    expect(template).toBeDefined();
    if (base === undefined || template === undefined) return;
    const scoped = { ...template, usage: { kind: 'rank' as const, rank: 'ambassadeur' as const, division: 3 as const } };
    const pack: GloryFrameOfferPack = { ...base, frames: [scoped] };
    const at = (stepId: string) => ids(gloryFramesFor({ stepId, atmosphere: 'afrique', lastChosen: null, catalog: [pack], installed: new Set(['afrique']) }).suggested);

    expect(at('rank:ambassadeur:3')).toEqual([scoped.id]);
    expect(at('rank:ambassadeur:1')).toEqual([]);
  });

  it('un cadre de rang n’est jamais proposé à un autre rang', () => {
    const result = offer({ stepId: 'rank:legende:2', installed: new Set(catalog.map((pack) => pack.slug)) });
    expect([...ids(result.suggested), ...result.others.flatMap((other) => ids(other.frames))].every((id) => id.includes('.legende-'))).toBe(true);
  });
});

describe('la matrice de couverture (§ 7 L3) — chaque étape a un cadre, ou une exemption NOMMÉE (cliquet qui ne fait que se vider)', () => {
  it('toute identité fixe du carnet reçoit au moins un cadre de l’Afrique, des moments, du trésor ou des hauts faits, sauf les familles exemptées', () => {
    const uncovered = PHOTO_STATIC_STEP_IDS.filter((stepId) => offer({ stepId }).suggested.length === 0);
    const families = [...new Set(uncovered.map((stepId) => (stepId.startsWith('rank:') ? `rank:${stepId.split(':')[1]}` : stepId.split(':')[0])))].sort();
    expect(families).toEqual([...GLORY_FRAME_OFFER_EXEMPT_FAMILIES].sort());
  });
});

describe('L14 (#10167) — les collections `moments` et `tresor` sont branchées par la loi TELLE QUELLE (#10180)', () => {
  const everywhere = new Set(catalog.map((pack) => pack.slug));
  const steps = [...PHOTO_STATIC_STEP_IDS, 'day:2026-10-22'];
  const momentFrames = catalog.filter((pack) => pack.atmosphere === null).flatMap((pack) => pack.frames);
  const familyOf = (stepId: string): string => stepId.split(':')[0] ?? '';
  /* Un haut fait se lit avec chaque rareté servie et sans rareté : c'est la rareté, pas l'identité, qui élit son cadre (LS, #10168). */
  const raritiesOf = (stepId: string): readonly (AchievementRarity | null)[] => (familyOf(stepId) === 'achievement' ? [null, ...ACHIEVEMENT_RARITIES] : [null]);
  const proposedAt = (frameId: string): readonly string[] =>
    steps.filter((stepId) =>
      raritiesOf(stepId).some((rarity) => {
        const result = offer({ stepId, installed: everywhere, rarity });
        return [...result.suggested, ...result.others.flatMap((other) => other.frames)].some((ref) => ref.frameId === frameId);
      }),
    );

  it('un cadre de moment n’est jamais proposé hors de sa famille : un palier, une Meesh, un trésor, une Flamme, un jour, un haut fait — jamais un rang, jamais une autre famille', () => {
    expect(momentFrames.length).toBeGreaterThanOrEqual(36);
    for (const frame of momentFrames) {
      const outside = proposedAt(frame.id).filter((stepId) => familyOf(stepId) !== frame.appliesTo.family);
      expect({ id: frame.id, outside }).toEqual({ id: frame.id, outside: [] });
    }
  });

  it('chaque cadre des moments, du trésor et des hauts faits sert au moins une étape : aucun cadre orphelin dans un pack non retirable', () => {
    const orphans = momentFrames.filter((frame) => proposedAt(frame.id).length === 0).map((frame) => frame.id);
    expect(orphans).toEqual([]);
  });

  it('D4 : le palier sans cadre dessiné prend le palier dessiné en dessous, et l’étape GARDE son identité — le titre vivant dit le vrai palier, le cadre dit le dessin', () => {
    const drawn = momentFrames.filter((frame) => frame.appliesTo.family === 'tier').map((frame) => (frame.appliesTo.family === 'tier' ? frame.appliesTo.tier : ''));
    const undrawn = LEVEL_TIER_KEYS.slice(1).filter((tier) => !drawn.includes(tier));
    expect(undrawn.length).toBeGreaterThan(0);
    for (const tier of undrawn) {
      const below = LEVEL_TIER_KEYS.slice(0, LEVEL_TIER_KEYS.indexOf(tier)).reverse().find((candidate) => drawn.includes(candidate));
      expect({ tier, suggested: ids(offer({ stepId: `tier:${tier}` }).suggested) }).toEqual({ tier, suggested: below === undefined ? [] : [`moments.palier-${below}`] });
    }
  });

  it('D5 (#10180) : départ, niveau 100, Prestige et trophée restent des exemptions NOMMÉES du cliquet, à côté des rangs des mythologies et des succès', () => {
    for (const family of ['start', 'level-100', 'prestige', 'trophy']) expect(GLORY_FRAME_OFFER_EXEMPT_FAMILIES).toContain(family);
    for (const family of ['tier', 'meesh', 'treasury', 'flame', 'day']) expect(GLORY_FRAME_OFFER_EXEMPT_FAMILIES).not.toContain(family);
  });
});

