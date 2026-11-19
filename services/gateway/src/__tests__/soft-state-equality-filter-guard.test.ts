/**
 * Aucun filtre de la passerelle ne décide d'un SOFT-STATE sur une égalité nue —
 * ni `leftAt: null` / `bannedAt: null` pour une PARTICIPATION (#19690), ni
 * `expiresAt: null` / `{ equals: null }` pour une ÉCHÉANCE (#19755).
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
 * ─── `expiresAt`, et ce que son TRI colonne par colonne a rendu (#19748) ─────
 *
 * Mesuré le 2026-11-19 : **7 sites**, dont **un seul** nu — celui du coffre de
 * clés (#19755), qui chargeait ZÉRO clé de conversation à chaque démarrage parce
 * qu'aucun de ses deux créateurs n'écrit la colonne. Cinq autres disaient déjà
 * l'absence à côté. Le septième est GELÉ, avec sa discipline d'écriture MESURÉE
 * (`DISCIPLINE_D_ECRITURE` ci-dessous) : c'est ce que « le tri est une question
 * PAR COLONNE » veut dire — une égalité nue est exacte quand la colonne est
 * écrite à CHAQUE création, et cela se mesure, jamais ne se suppose.
 *
 * ─── CE QUE CE CLIQUET NE GARDE PAS, et sa TAILLE ────────────────────────────
 *
 * Il ne tient que TROIS colonnes, et il ne lit que
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
 * `ServerKeyVault.initialize` portait un exemplaire VIVANT — #19755) et il ne
 * voit ni `packages/shared`, ni `scripts/`.
 *
 * **La limite « il ne voit pas les fragments de `where` nommés ailleurs » est
 * LEVÉE** (#19755), et elle a coûté deux sites : une annotation
 * `Prisma.<Modèle>WhereInput` déclare un `where` aussi sûrement que la clé, et
 * le premier site qu'elle a rendu est le prédicat partagé des SEPT lectures de
 * notifications. **Une limite qu'on écrit au lieu de la mesurer protège le site
 * qu'elle cache** : celle-ci était documentée depuis le cycle 180, donc
 * incapable de rougir. Corollaire pour qui EXTRAIT un filtre dans une constante
 * — ce que le correctif de #19755 a fait : sans annotation, l'extraction met le
 * filtre hors de portée du cliquet qui le garde, et le lot qui répare sort du
 * champ de sa propre garde. « Zéro trouvé » n'est pas « zéro existe »
 * (leçon 261).
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { join } from 'path';
import { equalityNullFiltersIn, sweepEqualityNullFilters } from './helpers/where-equality-null-scan';

const SRC_DIR = join(__dirname, '..');

/**
 * Les colonnes de soft-state triées (#19748) : les deux de la participation
 * (`Participant`, `CallParticipant`) et l'échéance (`ServerEncryptionKey`,
 * `Notification`, `Post`, `ShareLink`, `UserDevice`, `Sound`).
 */
const COLONNES = new Set(['leftAt', 'bannedAt', 'expiresAt']);

/**
 * Les égalités nues GELÉES — et une ligne n'y entre QU'AVEC la discipline
 * d'ÉCRITURE qui la rend exacte, prouvée à CHAQUE site de création. C'est la
 * seule absolution que #19748 autorise, et elle se MESURE : « cette colonne
 * porte sans doute une discipline » est exactement l'affirmation du côté qui
 * absout, que le cycle 179 a payée.
 */
const DISCIPLINE_D_ECRITURE: Readonly<Record<string, string>> = {
  'services/notifications/visibleNotificationsWhere.ts#expiresAt':
    'Notification.expiresAt a UN créateur (NotificationService, l’unique '
    + '`prisma.notification.create` du dépôt) et il écrit TOUJOURS la colonne '
    + '(`expiresAt: params.expiresAt || null`) : l’égalité est exacte pour toute '
    + 'ligne qu’il a produite, et aucun script ni migration n’en crée. La forme à '
    + 'DEUX branches est de plus MESURÉE — `scripts/migrations/mongodb/010_notification_expiry_index.js` '
    + 'et `@@index([userId, isRead, expiresAt])` existent pour que ses deux branches '
    + 'soient des intervalles d’index, `emitCountsUpdate` tournant à CHAQUE '
    + 'notification créée. Y ajouter une troisième branche d’absence toucherait un '
    + 'chemin chaud pour couvrir les seules lignes ANTÉRIEURES à la colonne, '
    + 'qu’aucun chemin vivant ne crée : la forme ATTESTÉE gagne (cycle 180, constat I).',
};

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

/**
 * Un `where` NOMMÉ : le fragment qu'une fonction REND, et qu'un appelant
 * répandra. Sa seule déclaration est son type de retour — et c'est cette forme
 * que le balayage ne voyait pas jusqu'à #19755, en le disant dans un
 * doc-comment incapable de rougir.
 */
const FIXTURE_WHERE_NOMME_RETOURNE = `
  export function visibleScope(userId: string): Prisma.NotificationWhereInput {
    const now = new Date();
    return {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
  }
`;

/** Le même, en CONSTANTE annotée — la forme qu'une EXTRACTION produit. */
const FIXTURE_WHERE_NOMME_CONSTANTE = `
  const VIVANT: Prisma.ParticipantWhereInput = { isActive: true, leftAt: null };
`;

/**
 * Et une ÉCRITURE nommée reste une écriture : c'est l'ANNOTATION qui décide,
 * pas la position dans le fichier.
 */
const FIXTURE_ECRITURE_NOMMEE = `
  function payload(): Prisma.ParticipantUpdateInput {
    return { leftAt: null, bannedAt: null };
  }
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

  it('voit un `where` NOMMÉ rendu par une fonction — son type de retour le déclare', () => {
    expect(equalityNullFiltersIn('fixture.ts', FIXTURE_WHERE_NOMME_RETOURNE, new Set(['expiresAt'])))
      .toEqual([expect.objectContaining({ field: 'expiresAt', absenceSaidInSameOr: false })]);
  });

  it('voit un `where` NOMMÉ porté par une constante annotée — sinon une EXTRACTION échappe au cliquet', () => {
    expect(sites(FIXTURE_WHERE_NOMME_CONSTANTE)).toEqual(['leftAt:false']);
  });

  it('ne prend pas une ÉCRITURE nommée pour un `where` — c’est l’annotation qui décide', () => {
    expect(sites(FIXTURE_ECRITURE_NOMMEE)).toEqual([]);
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

  it('chacun dit l’absence dans le MÊME `OR`, sauf ceux dont la discipline d’ÉCRITURE est mesurée', () => {
    const nus = balayage().sites
      .filter((site) => !site.absenceSaidInSameOr)
      .filter((site) => DISCIPLINE_D_ECRITURE[`${site.file}#${site.field}`] === undefined)
      .map((site) => `${site.file}:${site.line}#${site.field} (${site.spelling})`);

    expect(nus).toEqual([]);
  });

  /**
   * Une absolution qui ne décrit plus rien est pire qu'une absence
   * d'absolution : elle couvre le site SUIVANT. Chaque ligne gelée doit
   * correspondre à un site réellement nu — sinon elle est à retirer, et son
   * retrait fait partie du correctif qui l'a rendue inutile.
   */
  it('aucune discipline gelée ne couvre un site qui n’existe plus — une absolution périmée absout le suivant', () => {
    const nus = new Set(
      balayage().sites.filter((site) => !site.absenceSaidInSameOr).map((site) => `${site.file}#${site.field}`)
    );

    expect(Object.keys(DISCIPLINE_D_ECRITURE).filter((cle) => !nus.has(cle))).toEqual([]);
  });
});
