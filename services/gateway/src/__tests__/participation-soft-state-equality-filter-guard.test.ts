/**
 * Aucun filtre de la passerelle ne décide d'une PARTICIPATION sur `leftAt: null`
 * ou `bannedAt: null` NUS (#19690).
 *
 * Sous MongoDB `{ champ: null }` est une égalité : elle ne retient pas le
 * document dont la clé est ABSENTE. Et aucun chemin de création de `Participant`
 * n'écrit ces deux `DateTime?` — mesuré sur les huit sites de
 * `participant.create` du 2026-11-18 — donc l'absence est l'état de l'immense
 * majorité des membres, ceux qui ne sont ni partis ni bannis. Un tel filtre ne
 * manque pas un cas limite : il manque la POPULATION.
 *
 * Coût mesuré avant ce cliquet : la séance « Ensemble » (#17011/#17012) était
 * inerte pour tout le monde — `bothActiveMembers` rendait `false` pour presque
 * toutes les paires — et le compte « N en appel » de la liste sous-comptait les
 * participations d'avant l'audit C5. Les deux sites étaient verts : la fixture
 * de l'un portait `leftAt: null, bannedAt: null` explicitement, le `_count` de
 * l'autre était injecté sans jamais exercer sa clause.
 *
 * La forme JUSTE dit l'absence à côté — `unsetOrNull(champ)`,
 * `PARTICIPATION_VIVANTE`, `LIVE_CALL_PARTICIPATION` — et se compose par `AND`
 * quand le `where` porte déjà un `OR` (chacun rend cette clé, un double spread
 * en écraserait une).
 *
 * ─── CE QUE CE CLIQUET NE GARDE PAS, et sa TAILLE ────────────────────────────
 *
 * Il ne tient que les DEUX colonnes de la participation. Le même balayage sur
 * TOUTES les colonnes optionnelles rend **126 sites** (2026-11-18), dominés par
 * `deletedAt` (88) — dont une partie est couverte par une discipline d'ÉCRITURE
 * NOMMÉE (`LIVE_MESSAGE_MARK` pour `Message.deletedAt`, `NEW_DEVICE` et
 * `UNRESERVED` pour l'annuaire E2EE), qui rend l'égalité exacte pour les lignes
 * À VENIR. Trier les 126 colonne par colonne — discipline d'écriture prouvée à
 * chaque site de création, ou prédicat de lecture — est #19748, et c'est une
 * question par colonne, jamais un verdict global.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { join } from 'path';
import { equalityNullFiltersIn, sweepEqualityNullFilters } from './helpers/where-equality-null-scan';

const SRC_DIR = join(__dirname, '..');

/** Les colonnes de soft-state de la participation — `Participant` et `CallParticipant`. */
const COLONNES = new Set(['leftAt', 'bannedAt']);

const FIXTURE_FILTRE_NU = `
  const rows = await prisma.participant.findMany({
    where: { conversationId, isActive: true, leftAt: null, bannedAt: null },
    select: { userId: true },
  });
`;

const FIXTURE_ECRITURE = `
  await prisma.participant.update({
    where: { id },
    data: { bannedAt: null, isActive: true, leftAt: null },
  });
`;

const FIXTURE_ABSENCE_DITE = `
  const rows = await prisma.participant.findMany({
    where: { conversationId, AND: [PARTICIPATION_VIVANTE, { OR: [{ leftAt: null }, { leftAt: { isSet: false } }] }] },
  });
`;

const FIXTURE_WHERE_IMBRIQUE = `
  export const ACTIVE_CALL_SELECT = {
    _count: { select: { participants: { where: { leftAt: null } } } },
  } as const;
`;

const FIXTURE_EN_COMMENTAIRE = `
  // Audit C5 — \`{leftAt: null}\` seul manque les documents Mongo sans la clé.
  /** Et \`where: { bannedAt: null }\` dans un doc-comment non plus. */
  const rows = await prisma.participant.findMany({ where: { conversationId } });
`;

describe('le balayage lui-même — un scanner qui cherche une GRAPHIE doit prouver ce qu’il voit', () => {
  const sites = (source: string) => equalityNullFiltersIn('fixture.ts', source, COLONNES).map((site) => `${site.field}:${site.absenceSaidToo}`);

  it('relève un filtre NU, une colonne par occurrence', () => {
    expect(sites(FIXTURE_FILTRE_NU)).toEqual(['leftAt:false', 'bannedAt:false']);
  });

  it('ne relève pas une ÉCRITURE — `data` est la moitié légitime du remède', () => {
    expect(sites(FIXTURE_ECRITURE)).toEqual([]);
  });

  it('relève un `where` IMBRIQUÉ sous `select` / `_count` — c’est une lecture comme une autre', () => {
    expect(sites(FIXTURE_WHERE_IMBRIQUE)).toEqual(['leftAt:false']);
  });

  it('voit la forme JUSTE sans l’accuser : l’absence est dite à côté', () => {
    expect(sites(FIXTURE_ABSENCE_DITE)).toEqual(['leftAt:true']);
  });

  it('ne lit pas les COMMENTAIRES — sinon il relèverait les notes des cycles précédents', () => {
    expect(sites(FIXTURE_EN_COMMENTAIRE)).toEqual([]);
  });
});

describe('aucun filtre de participation ne décide sur une égalité nue (#19690)', () => {
  const balayage = () => sweepEqualityNullFilters(SRC_DIR, COLONNES);

  it('le balayage voit bien des filtres sur ces colonnes — une mesure vide passerait au vert', () => {
    expect(balayage().length).toBeGreaterThan(10);
  });

  it('chacun dit l’absence à côté — l’inventaire est VIDE, et la réparation est le prédicat, jamais une ligne ici', () => {
    const nus = balayage()
      .filter((site) => !site.absenceSaidToo)
      .map((site) => `${site.file}:${site.line}#${site.field}`);

    expect(nus).toEqual([]);
  });
});
