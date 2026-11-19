/**
 * Le jumeau de `participation-soft-state-equality-filter-guard` sur l'autre
 * table : celui-là garde les colonnes de départ d'une PARTICIPATION, celui-ci
 * garde l'état d'un COMPTE — `User.deactivatedAt`.
 *
 * ─── POURQUOI CETTE COLONNE, ET ELLE SEULE ───────────────────────────────────
 *
 * `deactivatedAt` n'est déclarée que sur `User` (mesuré sur `schema.prisma`).
 * Son verdict ne dépend donc d'aucune désambiguïsation de modèle, contrairement
 * à `deletedAt`, que sept modèles portent et dont la discipline d'écriture
 * diffère de l'un à l'autre (`LIVE_MESSAGE_MARK` la tient sur `Message`, rien ne
 * la tient sur `User`) — ce tri-là est #19748, et il se répond par une mesure
 * PAR COLONNE, jamais par un gel en bloc.
 *
 * Et sur cette colonne, il n'y a **aucune occurrence légitime à porter** :
 * aucun des deux chemins de création de compte ne l'écrit
 * (`services/auth/registration.service.ts`, `services/admin/user-management.service.ts`),
 * donc l'absence est l'état de la population entière et `{ deactivatedAt: null }`
 * en `where` n'apparie presque personne. Quatre portes composaient ce prédicat à
 * la main et refusaient tout le monde (#19799) : la présence d'équipe (#16623),
 * la synchronisation d'appartenance de communauté, l'adoption de salon et la
 * notification « ajouté à une communauté ». Quand ce cliquet tombe, la
 * réparation est `USABLE_ACCOUNT_WHERE`, jamais une ligne d'inventaire ici.
 *
 * ─── CE QUE CE FICHIER NE REFAIT PAS ─────────────────────────────────────────
 *
 * Le balayage lui-même — pile des cadres, écriture contre filtre, `where`
 * imbriqué, commentaires dépouillés, conjonction impossible — est prouvé chez
 * son jumeau. Ici on prouve DEUX choses de plus, et elles ne se déduisent pas de
 * là-bas : que l'instrument voit une forme nue **sur CETTE colonne** (cycle 180,
 * constat H : une sonde satisfaite par une seule colonne est aveugle sur
 * l'autre), et que les DEUX moitiés de la loi — la lecture JS et la sélection —
 * rendent le même verdict sur les mêmes documents.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { join } from 'path';
import { equalityNullFiltersIn, sweepEqualityNullFilters } from './helpers/where-equality-null-scan';
import { matchesMongoWhere, type MongoDocument } from './helpers/mongo-where';
import { isUsableAccount, USABLE_ACCOUNT_WHERE, type AccountState } from '../services/relations/usableAccount';

const SRC_DIR = join(__dirname, '..');

/** La colonne d'état de compte que `User` seule porte. */
const COLONNES = new Set(['deactivatedAt']);

const FIXTURE_FILTRE_NU = `
  const vivants = await prisma.user.findMany({
    where: { id: { in: ids }, isActive: true, deactivatedAt: null, deletedAt: null },
    select: { id: true },
  });
`;

const FIXTURE_EQUALS = `
  const vivants = await prisma.user.findMany({
    where: { id: { in: ids }, deactivatedAt: { equals: null } },
  });
`;

const FIXTURE_ECRITURE = `
  await prisma.user.update({
    where: { id },
    data: { isActive: true, deactivatedAt: null },
  });
`;

const FIXTURE_ABSENCE_DITE = `
  const vivants = await prisma.user.findMany({
    where: { id: { in: ids }, AND: [{ OR: [{ deactivatedAt: null }, { deactivatedAt: { isSet: false } }] }] },
  });
`;

describe('le balayage voit une forme nue SUR CETTE COLONNE — prouvé par colonne, sur fixtures', () => {
  const sites = (source: string) =>
    equalityNullFiltersIn('fixture.ts', source, COLONNES).map((site) => `${site.field}:${site.absenceSaidInSameOr}`);

  it('relève le filtre nu de la porte « compte vivant »', () => {
    expect(sites(FIXTURE_FILTRE_NU)).toEqual(['deactivatedAt:false']);
  });

  it('relève la graphie `{ equals: null }` — la même égalité sous un autre nom', () => {
    expect(sites(FIXTURE_EQUALS)).toEqual(['deactivatedAt:false']);
  });

  it('ne relève pas la RÉACTIVATION — `data: { deactivatedAt: null }` est la moitié légitime du remède', () => {
    expect(sites(FIXTURE_ECRITURE)).toEqual([]);
  });

  it('voit la forme JUSTE sans l’accuser : l’absence est dite dans le même `OR`', () => {
    expect(sites(FIXTURE_ABSENCE_DITE)).toEqual(['deactivatedAt:true']);
  });
});

/**
 * La LIGNE que le cliquet nomme, et pourquoi elle mérite son propre témoin.
 *
 * Le site `routes/communities/addable-user.ts:19` était nommé `:8` : le
 * dépouillement des commentaires remplaçait chaque bloc par la chaîne vide,
 * emportant ses retours à la ligne, et tout ce qui suivait remontait d'autant.
 * Un cliquet dont la valeur est de NOMMER fichier, ligne, colonne et graphie n'a
 * pas le droit de se tromper sur le champ le plus actionnable des quatre.
 */
/**
 * Ce que l'instrument BÉNIT à tort, et ce qu'il NE VOIT PAS. Les deux moitiés
 * viennent de l'audit adversarial du cycle 181 (constat C3), et les deux sont
 * ici des témoins plutôt qu'une phrase : **une limite qu'on ne mesure pas
 * redevient un angle mort silencieux** (règle du cycle 108).
 */
describe('le balayage ne bénit que la branche CANONIQUE', () => {
  const sites = (source: string) =>
    equalityNullFiltersIn('fixture.ts', source, COLONNES).map((site) => `${site.field}:${site.absenceSaidInSameOr}`);

  it('REFUSE une branche d’absence IMPOSSIBLE — le `OR` vaut alors l’égalité nue', () => {
    expect(sites(`
      const rows = await prisma.user.findMany({
        where: { id, OR: [{ deactivatedAt: null }, { AND: [{ deactivatedAt: { isSet: false } }, { deactivatedAt: { not: null } }] }] },
      });
    `)).toEqual(['deactivatedAt:false']);
  });

  it('REFUSE une absence CITÉE dans un littéral de chaîne — un libellé n’est pas un filtre', () => {
    expect(sites(`
      const rows = await prisma.user.findMany({
        where: { id, OR: [{ deactivatedAt: null }, { label: 'deactivatedAt: { isSet: false }' }] },
      });
    `)).toEqual(['deactivatedAt:false']);
  });

  it('accepte la branche canonique, même accompagnée d’une troisième branche', () => {
    expect(sites(`
      const rows = await prisma.user.findMany({
        where: { id, OR: [{ deactivatedAt: null }, { deactivatedAt: { isSet: false } }, { deactivatedAt: { gt: now } }] },
      });
    `)).toEqual(['deactivatedAt:true']);
  });
});

/**
 * Les TROIS formes que l'instrument ne voit pas, mesurées — et la quatrième, qu'il
 * voit depuis #19755.
 *
 * Le lot du coffre de clés (#19755, fusionné dans `dev` le même jour) a appris au
 * balayage à résoudre une constante NOMMÉE puis répandue dans un `where`
 * (`whereFragments` / `constantNameOf`), et il PUBLIE ce qu'il ne résout pas
 * (`unresolvedFragments`) au lieu de s'en taire. Ce témoin-ci avait été écrit
 * contre l'instrument d'AVANT, et il est tombé à la fusion : c'est le bon sens de
 * l'échec — une limite mesurée par un témoin le reste jusqu'à ce que quelqu'un la
 * lève, et alors le témoin le dit.
 *
 * Reste vrai, et mesuré ci-dessous : une constante sous une RELATION, une
 * FABRIQUE, un TERNAIRE. La première n'est pas théorique —
 * `services/community-online-count.ts` écrit `user: { is: living }`, et c'est
 * l'un des sites de `USABLE_ACCOUNT_WHERE`.
 *
 * « Inventaire VIDE » signifie donc « aucune égalité nue que CET instrument sait
 * voir », jamais « aucune égalité nue » : c'est la leçon 261, et elle vaut de
 * l'instrument autant que du dépôt.
 */
describe('ce que le balayage NE VOIT PAS — la limite est mesurée, pas affirmée', () => {
  const vus = (source: string) => equalityNullFiltersIn('fixture.ts', source, COLONNES).length;

  it('relève une constante NOMMÉE puis répandue — acquis de #19755', () => {
    expect(vus(`
      const LIVING = { isActive: true, deactivatedAt: null };
      const rows = await prisma.user.findMany({ where: { id, ...LIVING } });
    `)).toBe(1);
  });

  it.each([
    ['une constante NOMMÉE sous une relation', `
      const living = { isActive: true, deactivatedAt: null };
      const rows = await prisma.communityMember.findMany({ where: { user: { is: living } } });
    `],
    ['une FABRIQUE qui rend le filtre', `
      export const livingWhere = () => ({ isActive: true, deactivatedAt: null });
    `],
    ['un TERNAIRE qui choisit le filtre', `
      const rows = await prisma.user.findMany({ where: flag ? { deactivatedAt: null } : { id } });
    `],
  ])('ne relève pas %s', (_forme, source) => {
    expect(vus(source)).toBe(0);
  });
});

describe('le balayage nomme la VRAIE ligne, commentaires compris', () => {
  const SOURCE_AVEC_BLOC = [
    'import { prisma } from "./db";',
    '',
    '/**',
    ' * Un doc-comment de plusieurs lignes, comme en porte toute unité de ce dépôt.',
    ' *',
    ' * Il ne doit déplacer aucune ligne du code qui le suit.',
    ' */',
    'export const vivants = () => prisma.user.findMany({',
    '  where: { deactivatedAt: null },',
    '});',
  ].join('\n');

  it('rend 9 — la ligne du filtre dans le FICHIER, pas dans la source dépouillée', () => {
    expect(equalityNullFiltersIn('fixture.ts', SOURCE_AVEC_BLOC, COLONNES).map((site) => site.line)).toEqual([9]);
  });
});

describe('aucune porte ne décide d’un compte vivant sur une égalité nue (#19799)', () => {
  const balayage = () => sweepEqualityNullFilters(SRC_DIR, COLONNES);

  /**
   * La non-vacuité porte sur l'INSTRUMENT — les fichiers lus — et jamais sur le
   * NOMBRE de sites trouvés : une sonde posée sur la production mesure l'état du
   * dépôt, et rougirait le jour où quelqu'un branche un site de plus sur la loi,
   * c'est-à-dire sur un changement CORRECT (cycle 180, constat H).
   */
  it('le balayage lit bien les sources de production — un corpus vide passerait au vert', () => {
    expect(balayage().filesScanned).toBeGreaterThan(900);
  });

  /**
   * « VIDE » porte sur ce que l'instrument SAIT voir : une égalité écrite EN
   * LIGNE sous une clé littérale `where:`. Les quatre formes qu'il ne relève pas
   * sont mesurées au describe précédent — « zéro trouvé » n'est pas « zéro
   * existe » (leçon 261), et l'une d'elles est écrite par un site de la loi.
   */
  it('l’inventaire est VIDE — la réparation est `USABLE_ACCOUNT_WHERE`, jamais une ligne ici', () => {
    const nus = balayage().sites
      .filter((site) => !site.absenceSaidInSameOr)
      .map((site) => `${site.file}:${site.line}#${site.field} (${site.spelling})`);

    expect(nus).toEqual([]);
  });
});

/**
 * Les deux moitiés de la MÊME loi, confrontées sur les mêmes documents.
 *
 * `isUsableAccount` juge une ligne DÉJÀ CHARGÉE (le client Prisma rend `null`
 * pour une colonne absente, donc la lecture JS est exacte sans rien savoir de
 * MongoDB) ; `USABLE_ACCOUNT_WHERE` doit SÉLECTIONNER la même population. Rien
 * ne les confrontait, et c'est dans cet écart que vivait #19799 : la loi JS était
 * juste, sa jumelle côté `where` n'existait pas, et quatre sites l'ont recomposée
 * à la main.
 */
describe('la loi JS et la loi `where` rendent le même verdict', () => {
  const documents: ReadonlyArray<readonly [string, MongoDocument]> = [
    ['la forme NOMINALE de production — aucune des deux colonnes écrite', { isActive: true }],
    ['les deux colonnes à `null` explicite — l’état d’un compte réactivé', { isActive: true, deletedAt: null, deactivatedAt: null }],
    ['désactivé', { isActive: true, deletedAt: null, deactivatedAt: new Date('2026-10-01T00:00:00Z') }],
    ['supprimé', { isActive: true, deletedAt: new Date('2026-10-01T00:00:00Z'), deactivatedAt: null }],
    ['désactivé, la colonne `deletedAt` jamais écrite', { isActive: true, deactivatedAt: new Date('2026-10-01T00:00:00Z') }],
    ['supprimé, la colonne `deactivatedAt` jamais écrite', { isActive: true, deletedAt: new Date('2026-10-01T00:00:00Z') }],
    ['inactif', { isActive: false }],
  ];

  it.each(documents)('%s', (_forme, document) => {
    const selectionne = matchesMongoWhere(document, USABLE_ACCOUNT_WHERE as unknown as MongoDocument);
    const juge = isUsableAccount(document as unknown as AccountState);

    expect(selectionne).toBe(juge);
  });

  it('la loi retient bien la forme nominale — sans quoi les deux moitiés s’accorderaient à tort sur un refus', () => {
    expect(matchesMongoWhere({ isActive: true }, USABLE_ACCOUNT_WHERE as unknown as MongoDocument)).toBe(true);
  });
});
