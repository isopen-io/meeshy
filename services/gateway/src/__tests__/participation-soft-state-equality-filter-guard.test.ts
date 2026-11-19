/**
 * Aucun filtre de la passerelle ne décide d'une PARTICIPATION sur `leftAt: null`
 * ou `bannedAt: null` NUS (#19690).
 *
 * Sous MongoDB `{ champ: null }` est une égalité : elle ne retient pas le
 * document dont la clé est ABSENTE. Et **aucun chemin de création de
 * `Participant` n'écrit ces colonnes sur une ligne VIVANTE** — douze chemins
 * mesurés le 2026-11-18 (huit `participant.create`, deux `createMany` dans
 * `InitService`, deux `participants: { create }` imbriqués dans
 * `callGroupConversation` et `share-link-mint`), aucun `upsert` ni
 * `connectOrCreate`. Le seul qui écrive `leftAt` est la pierre tombale de
 * `repairOrphanedMessageSenders`, qu'`isActive: false` exclut de toute façon.
 * L'absence est donc l'état de l'immense majorité des membres, ceux qui ne sont
 * ni partis ni bannis : un tel filtre ne manque pas un cas limite, il manque la
 * POPULATION. (Les lignes aux nulls EXPLICITES viennent de la migration
 * `scripts/migrations/migrate-to-participant-model.ts`, hors de ce balayage.)
 *
 * Coût mesuré avant ce cliquet : la séance « Ensemble » (#17011/#17012) était
 * inerte pour tout le monde — `bothActiveMembers` rendait `false` pour presque
 * toutes les paires — et le compte « N en appel » de la liste sous-comptait les
 * participations d'avant l'audit C5. Les deux sites étaient verts : la fixture
 * de l'un portait `leftAt: null, bannedAt: null` explicitement, le `_count` de
 * l'autre était injecté sans jamais exercer sa clause.
 *
 * La forme JUSTE dit l'absence dans le MÊME `OR` — `unsetOrNull(champ)`,
 * `PARTICIPATION_VIVANTE`, `LIVE_CALL_PARTICIPATION`. Et attention à la phrase
 * « se compose par `AND` » : elle vaut des PRÉDICATS COMPLETS, dont chacun rend
 * une clé `OR` qu'un double spread écraserait. Appliquée aux deux BRANCHES, elle
 * produit `AND: [{ champ: null }, { champ: { isSet: false } }]` — une conjonction
 * IMPOSSIBLE qui n'apparie AUCUN document, soit #19690 en pire. Le balayage la
 * relève (fixture `FIXTURE_CONJONCTION_IMPOSSIBLE`) ; sa première version la
 * BÉNISSAIT, parce qu'elle cherchait `isSet: false` n'importe où dans le bloc.
 *
 * ─── CE QUE CE CLIQUET NE GARDE PAS, et sa TAILLE ────────────────────────────
 *
 * Il ne tient que les DEUX colonnes de la participation, et il ne lit que
 * `services/gateway/src` — `packages/shared`, `scripts/` et les migrations sont
 * hors champ. Le même balayage sur TOUTES les colonnes optionnelles rend un
 * ordre de grandeur de **120 sites** (2026-11-18), dominés par
 * `deletedAt` (88) — dont une partie est couverte par une discipline d'ÉCRITURE
 * NOMMÉE (`LIVE_MESSAGE_MARK` pour `Message.deletedAt`, `NEW_DEVICE` et
 * `UNRESERVED` pour l'annuaire E2EE), qui rend l'égalité exacte pour les lignes
 * À VENIR. Les trier colonne par colonne — discipline d'écriture prouvée à
 * CHAQUE site de création, ou prédicat de lecture — est #19748, et c'est une
 * question par colonne, jamais un verdict global.
 *
 * **Ce compte est une borne INFÉRIEURE d'une population mal définie**, et c'est
 * une propriété de l'INSTRUMENT, pas du dépôt : il dépend de la graphie cherchée
 * (sa première version était aveugle à `{ equals: null }`, dont
 * `ServerKeyVault.initialize` porte un exemplaire VIVANT qui charge zéro clé de
 * conversation à chaque démarrage — #19755) et il ne voit pas les fragments de
 * `where` nommés ailleurs puis répandus, ni `packages/shared`, ni `scripts/`.
 * « Zéro trouvé » n'est pas « zéro existe » (leçon 261).
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

/**
 * La conjonction IMPOSSIBLE — la forme que la première version de ce balayage
 * bénissait (audit du cycle 180, constat F). `AND` exige les deux branches : la
 * clé ne peut pas être à la fois nulle et absente, donc cette clause n'apparie
 * AUCUN document. C'est #19690 en pire, et la phrase « composer par `AND` » le
 * suggère à qui l'applique aux BRANCHES plutôt qu'aux prédicats complets.
 */
const FIXTURE_CONJONCTION_IMPOSSIBLE = `
  const rows = await prisma.participant.findMany({
    where: { conversationId, AND: [{ leftAt: null }, { leftAt: { isSet: false } }] },
  });
`;

/** La SECONDE graphie de la même égalité — vivante dans ce dépôt. */
const FIXTURE_EQUALS = `
  const rows = await prisma.participant.findMany({
    where: { conversationId, bannedAt: { equals: null } },
  });
`;

const FIXTURE_EN_COMMENTAIRE = `
  // Audit C5 — \`{leftAt: null}\` seul manque les documents Mongo sans la clé.
  /** Et \`where: { bannedAt: null }\` dans un doc-comment non plus. */
  const rows = await prisma.participant.findMany({ where: { conversationId } });
`;

describe('le balayage lui-même — un scanner qui cherche une GRAPHIE doit prouver ce qu’il voit', () => {
  const sites = (source: string) =>
    equalityNullFiltersIn('fixture.ts', source, COLONNES).map((site) => `${site.field}:${site.absenceSaidInSameOr}`);

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

  it('REFUSE la conjonction impossible — `AND` des deux branches n’apparie AUCUN document', () => {
    expect(sites(FIXTURE_CONJONCTION_IMPOSSIBLE)).toEqual(['leftAt:false']);
  });

  it('voit la graphie `{ equals: null }` — la même égalité sous un autre nom', () => {
    expect(sites(FIXTURE_EQUALS)).toEqual(['bannedAt:false']);
  });
});

describe('aucun filtre de participation ne décide sur une égalité nue (#19690)', () => {
  const balayage = () => sweepEqualityNullFilters(SRC_DIR, COLONNES);

  /**
   * La non-vacuité porte sur l'INSTRUMENT — les fichiers lus —, jamais sur le
   * NOMBRE de sites trouvés sur ces deux colonnes. Mesuré : `bannedAt` n'a plus
   * aucun site, et les sites `leftAt` sont tous des `OR` dépliés à la main chez
   * les appels. Une sonde « plus de N sites » aurait donc deux défauts, les deux
   * relevés par l'audit du cycle 180 (constat H) : elle est satisfaite par une
   * seule des deux colonnes, donc aveugle sur l'autre ; et elle ROUGIRAIT le
   * jour où quelqu'un branche ces sites sur `LIVE_CALL_PARTICIPATION` — c'est-à-
   * dire sur un changement CORRECT, en invitant à baisser le seuil. Elle
   * mesurerait la popularité d'un idiome, pas une propriété (cycle 107, dont le
   * balayage fut JETÉ pour cette raison). La capacité du balayage à VOIR une
   * forme nue est prouvée par colonne au describe précédent, sur fixtures.
   */
  it('le balayage lit bien les sources de production — un corpus vide passerait au vert', () => {
    expect(balayage().filesScanned).toBeGreaterThan(900);
  });

  it('chacun dit l’absence dans le MÊME `OR` — l’inventaire est VIDE, et la réparation est le prédicat, jamais une ligne ici', () => {
    const nus = balayage().sites
      .filter((site) => !site.absenceSaidInSameOr)
      .map((site) => `${site.file}:${site.line}#${site.field} (${site.spelling})`);

    expect(nus).toEqual([]);
  });
});
