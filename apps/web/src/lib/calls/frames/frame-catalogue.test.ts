import { describe, expect, test } from 'bun:test';

import { captureFrames, RAW_MOOD_FILES } from './frame-catalogue';
import { bucketOf, expandMotif, framesFor, moodsFor, reconcileFrame } from './frame-filter';
import { DUO_ONLY_ARRANGEMENTS, FRAME_MOODS, FrameMoodFileSchema, type CaptureFrame, type FrameMotif } from './frame-spec';

const PRODUCT_PEOPLE = [2, 3, 4, 5, 6] as const;

describe('le catalogue des cadres de capture', () => {
  test('chaque fichier d’ambiance se lit au schéma, sans exception', () => {
    const failures = RAW_MOOD_FILES.map((file, index) => ({ index, result: FrameMoodFileSchema.safeParse(file) })).filter(({ result }) => !result.success);
    expect(failures.map(({ index, result }) => `${FRAME_MOODS[index]}: ${result.success ? '' : result.error.message}`)).toEqual([]);
  });

  test('chaque fichier ne déclare que des motifs de SON ambiance', () => {
    const strays = RAW_MOOD_FILES.flatMap((file) => {
      const parsed = FrameMoodFileSchema.safeParse(file);
      return parsed.success ? parsed.data.motifs.filter((motif) => motif.mood !== parsed.data.mood || !motif.id.startsWith(`${parsed.data.mood}.`)).map((motif) => motif.id) : [];
    });
    expect(strays).toEqual([]);
  });

  test('une centaine de cadres au moins', () => {
    expect(captureFrames().length).toBeGreaterThanOrEqual(100);
  });

  test('les identifiants sont uniques et stables : <ambiance>.<motif>.<tranche>', () => {
    const ids = captureFrames().map((frame) => frame.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[a-z-]+\.[a-z0-9-]+\.(duo|comite|groupe|tablee)$/));
  });

  test('chaque ambiance tient au moins trois motifs et sert chaque nombre de 2 à 6', () => {
    const frames = captureFrames();
    const gaps = FRAME_MOODS.flatMap((mood) => {
      const motifs = new Set(frames.filter((frame) => frame.mood === mood).map((frame) => frame.motif));
      const missing = PRODUCT_PEOPLE.filter((people) => framesFor(frames, people, mood).length === 0).map((people) => `${mood}@${people}`);
      return motifs.size < 3 ? [`${mood}: ${motifs.size} motif(s)`, ...missing] : missing;
    });
    expect(gaps).toEqual([]);
  });

  test('chaque motif se nomme d’un nom propre, identique dans les sept langues', () => {
    captureFrames().forEach((frame) => expect(frame.name.trim().length).toBeGreaterThan(0));
  });

  test('split et diagonal ne servent que le duo', () => {
    const misplaced = captureFrames().filter((frame) => DUO_ONLY_ARRANGEMENTS.has(frame.layout.arrangement) && frame.bucket !== 'duo').map((frame) => frame.id);
    expect(misplaced).toEqual([]);
  });

  test('la zone de contenu reste habitable : marges et réserves laissent au moins la moitié de la hauteur', () => {
    const cramped = captureFrames().filter((frame) => frame.layout.top + frame.layout.bottom > 0.5 || frame.layout.margin > 0.2).map((frame) => frame.id);
    expect(cramped).toEqual([]);
  });

  test('le titre de groupe ne vit que dans les variantes de groupe', () => {
    const duoWithGroupTitle = captureFrames().filter((frame) => frame.bucket === 'duo' && frame.title.source === 'group').map((frame) => frame.id);
    expect(duoWithGroupTitle).toEqual([]);
  });

  test('les pseudos apparaissent dans une part réelle du catalogue, et la marque partout', () => {
    const frames = captureFrames();
    const withHandles = frames.filter((frame) => frame.names.show === 'handle' || frame.names.show === 'both');
    expect(withHandles.length).toBeGreaterThanOrEqual(15);
    const marks = new Set(frames.map((frame) => frame.brand.mark));
    expect([...marks].sort()).toEqual(['both', 'logo', 'wordmark']);
  });
});

const motif = (overrides: Partial<FrameMotif> = {}): FrameMotif => ({
  id: 'elegant.test',
  mood: 'elegant',
  name: 'Test',
  base: {
    layout: { arrangement: 'grid', margin: 0.05, gap: 0.02, top: 0.1, bottom: 0.1 },
    slot: { shape: 'rect', tilt: 'none', tone: 'color' },
    background: { kind: 'solid', color: '#000000' },
    ornaments: [],
    brand: { mark: 'logo', place: 'bottom', color: '#ffffff', size: 'm' },
    names: { show: 'none', style: 'caption', font: 'elegant', color: '#ffffff' },
    title: { source: 'none', font: 'elegant', color: '#ffffff', place: 'top', size: 'm' },
  },
  variants: { duo: { layout: { arrangement: 'split', margin: 0.05, gap: 0.02, top: 0.1, bottom: 0.1 } }, groupe: {} },
  ...overrides,
});

const frames = (): readonly CaptureFrame[] => [
  ...expandMotif(motif()),
  ...expandMotif(motif({ id: 'elegant.other', variants: { comite: {} } })),
  ...expandMotif(motif({ id: 'jovial.fete', mood: 'jovial', variants: { comite: {}, groupe: {} } })),
];

describe('la règle de filtrage', () => {
  test('la tranche d’un nombre de personnes', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 12, 13].map(bucketOf)).toEqual([null, 'duo', 'comite', 'comite', 'groupe', 'groupe', 'tablee', 'tablee', null]);
  });

  test('un motif se déplie en un cadre par variante, la variante surchargeant la base', () => {
    const [duo, groupe] = expandMotif(motif());
    expect(duo?.id).toBe('elegant.test.duo');
    expect(duo?.layout.arrangement).toBe('split');
    expect(groupe?.id).toBe('elegant.test.groupe');
    expect(groupe?.layout.arrangement).toBe('grid');
    expect(groupe?.people).toEqual([5, 6]);
  });

  test('à quatre, aucun cadre de duo ni de groupe ; à cinq, aucun duo', () => {
    expect(framesFor(frames(), 4).map((frame) => frame.id)).toEqual(['elegant.other.comite', 'jovial.fete.comite']);
    expect(framesFor(frames(), 5).every((frame) => frame.bucket === 'groupe')).toBe(true);
  });

  test('les ambiances proposées sont celles qui servent le nombre', () => {
    expect(moodsFor(frames(), 2)).toEqual(['elegant']);
    expect(moodsFor(frames(), 3)).toEqual(['elegant', 'jovial']);
  });

  test('une arrivée garde le motif dans sa nouvelle variante, sinon l’ambiance', () => {
    expect(reconcileFrame(frames(), 'elegant.test.duo', 5)?.id).toBe('elegant.test.groupe');
    expect(reconcileFrame(frames(), 'elegant.test.duo', 3)?.id).toBe('elegant.other.comite');
    expect(reconcileFrame(frames(), 'jovial.fete.comite', 2)).toBeNull();
    expect(reconcileFrame(frames(), 'elegant.test.groupe', 6)?.id).toBe('elegant.test.groupe');
  });
});
