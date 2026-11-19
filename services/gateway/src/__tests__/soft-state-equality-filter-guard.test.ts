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
 * ─── `lastActivityAt`, et l'axe de classement qui n'existait pas (#19800) ────
 *
 * Mesuré le 2026-11-19 : **1 site**, et il était nu — l'ÉCRITURE monotone de
 * `recordConversationActivity`, unique écrivain de `Conversation.lastActivityAt`.
 * Son `OR` portait `{ lastActivityAt: null }` et `{ lt: at }`, donc il
 * n'appariait aucune conversation : les treize chemins de création n'écrivent
 * pas la colonne. `updateMany` rendait `count: 0`, la première écriture ne
 * pouvait jamais avoir lieu, et les QUATRE alimenteurs de l'axe « activité » du
 * rang de liste — réaction de message, réaction de pièce jointe, appel, épingle
 * — étaient inertes pour la population entière.
 *
 * Ce site enseigne une forme que les fixtures ne couvraient pas : une égalité
 * nue dont la SŒUR de `OR` est un INTERVALLE (`{ lt }`). La clause est une
 * alternative, elle a la forme juste, et aucune de ses branches ne dit l'absence
 * — `FIXTURE_SOEUR_INTERVALLE` l'épingle. Et les LECTEURS de cette colonne
 * étaient déjà justes (`list-rank.ts` dit l'absence en trois branches depuis
 * #8309) : **un cliquet de lecture ne dit rien d'une colonne dont c'est
 * l'ÉCRITURE qui est nue.**
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
 * (`Participant`, `CallParticipant`), l'échéance (`ServerEncryptionKey`,
 * `Notification`, `Post`, `ShareLink`, `UserDevice`, `Sound`) et le rang
 * d'activité (`Conversation.lastActivityAt`, #19800).
 */
const COLONNES = new Set(['leftAt', 'bannedAt', 'expiresAt', 'lastActivityAt']);

/**
 * **Une colonne n'est pas un piège sur tous les modèles qui la portent**, et
 * `lastActivityAt` est le cas qui l'a prouvé : `DateTime?` sur `Conversation`
 * (le piège y est, #19800) et `DateTime @default(now())` sur `UserSession`,
 * donc REQUISE, donc toujours présente, donc l'égalité nue y est EXACTE.
 *
 * Ce qui rend la distinction PORTANTE et non cosmétique, et c'est l'audit
 * adversarial du cycle 182 qui l'a mesuré de bout en bout : la première version
 * de ce cliquet se contentait du nom de colonne et absolvait le risque par une
 * phrase — « aucun filtre ne peut poser l'égalité nue sur `UserSession` ». Elle
 * était FAUSSE. L'audit l'a reproduite dans les deux sens :
 *
 * ```
 * where: { lastActivityAt: null }            sur userSession  ⇒  tsc EXIT=0, cliquet ROUGE
 * where: { lastActivityAt: { isSet: false } } sur userSession  ⇒  TS2353 — NE COMPILE PAS
 * ```
 *
 * Un cliquet qui rougit sur un site dont **le seul remède qu'il nomme ne
 * compile pas** ne laisse que deux issues, mauvaises toutes les deux : geler la
 * ligne sous une absolution réservée à une discipline d'ÉCRITURE qu'elle n'a
 * pas, ou retirer la colonne et perdre la garde sur `Conversation`. C'est la
 * forme exacte du constat D du cycle 181, dans la phrase même qui le citait.
 *
 * **Sur une colonne REQUISE, le remède n'est pas `isSet`, c'est de SUPPRIMER le
 * filtre** — il n'y a rien à apparier de plus.
 *
 * Un site dont le modèle ne se résout pas (`model: ''`) est GARDÉ, jamais
 * absous : la direction sûre pour un cliquet est le faux positif, qui fait
 * regarder, et l'inventaire des sites nus étant VIDE, aucun n'est vivant.
 */
const MODELES_PAR_COLONNE: Readonly<Record<string, readonly string[]>> = {
  lastActivityAt: ['conversation'],
};

/** Ce site est-il sur un modèle où sa colonne est OPTIONNELLE — donc piégeuse ? */
const colonneEstPiegeuse = (site: { readonly field: string; readonly model: string }): boolean => {
  const modeles = MODELES_PAR_COLONNE[site.field];
  return modeles === undefined || site.model === '' || modeles.includes(site.model);
};

/**
 * Les égalités nues GELÉES — et une ligne n'y entre QU'AVEC la discipline
 * d'ÉCRITURE qui la rend exacte, prouvée à CHAQUE site de création. C'est la
 * seule absolution que #19748 autorise, et elle se MESURE : « cette colonne
 * porte sans doute une discipline » est exactement l'affirmation du côté qui
 * absout, que le cycle 179 a payée.
 */
const DISCIPLINE_D_ECRITURE: Readonly<Record<string, { readonly sites: number; readonly raison: string }>> = {
  'services/notifications/visibleNotificationsWhere.ts#expiresAt': { sites: 1, raison:
    'Notification.expiresAt a UN créateur (NotificationService, l’unique '
    + '`prisma.notification.create` du dépôt) et il écrit TOUJOURS la colonne '
    + '(`expiresAt: params.expiresAt || null`) : l’égalité est exacte pour toute '
    + 'ligne qu’il a produite, et aucun script ni migration n’en crée. La forme à '
    + 'DEUX branches est de plus MESURÉE — `scripts/migrations/mongodb/010_notification_expiry_index.js` '
    + 'et `@@index([userId, isRead, expiresAt])` existent pour que ses deux branches '
    + 'soient des intervalles d’index, `emitCountsUpdate` tournant à CHAQUE '
    + 'notification créée. Y ajouter une troisième branche d’absence toucherait un '
    + 'chemin chaud pour couvrir les seules lignes ANTÉRIEURES à la colonne, '
    + 'qu’aucun chemin vivant ne crée : la forme ATTESTÉE gagne (cycle 180, constat I).' },
};

/**
 * Ce que l'instrument ne sait PAS suivre : un identifiant répandu sous un
 * `where` qu'aucun fichier de production ne déclare. Les huit mesurés le
 * 2026-11-19 sont des paramètres, des déstructurations et des constantes
 * importées — aucun n'est un littéral de `where`. Gelé pour qu'un NEUVIÈME se
 * fasse ouvrir : une limite publiée sans sa liste protège le site qu'elle cache,
 * et c'est ce qui a coûté `visibleNotificationsWhere` au cycle 180.
 */
const HORS_DE_PORTEE: readonly string[] = [
  'CALL_TERMINAL_STATUSES', 'PRIVILEGED_PLATFORM_ROLES', 'axes', 'directConversationIds',
  'observedIds', 'ownerIds', 'readerParticipantIds', 'weekKeys',
];

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
 * L'absence NIÉE — la forme que la seconde version de ce balayage bénissait
 * (audit du cycle 181, constat A). `NOT: { champ: { isSet: false } }` dit « la
 * clé EST posée » : l'union « nulle OU posée » exclut exactement les documents
 * absents, soit #19690 réinstallé et CERTIFIÉ correct par le cliquet censé
 * l'interdire. Le texte cherché était pourtant le bon ; c'est la POLARITÉ qui
 * change le sens, et une expression régulière sur le tableau ne la voit pas.
 */
const FIXTURE_ABSENCE_NIEE = `
  const rows = await prisma.participant.findMany({
    where: { conversationId, OR: [{ leftAt: null }, { NOT: { leftAt: { isSet: false } } }] },
  });
`;

/**
 * Et l'absence dite dans la MÊME branche n'est pas une alternative : une branche
 * qui porte une seconde condition exige les deux, donc ne rattrape pas le
 * document absent.
 */
const FIXTURE_ABSENCE_MEME_BRANCHE = `
  const rows = await prisma.participant.findMany({
    where: { OR: [{ leftAt: null, isActive: true }, { leftAt: { isSet: false }, isActive: true }] },
  });
`;

/**
 * Les trois formes de constante que l'annotation seule ne couvrait PAS, et que
 * l'audit du cycle 181 (constat B) a reproduites une par une. La troisième règle
 * — « répandue dans un `where` » — les prend toutes, sans rien demander au type.
 */
const FIXTURE_FRAGMENT_TYPE_INFERE = `
  const VIVANT = { purpose: 'conversation', expiresAt: null };
  const rows = await prisma.key.findMany({ where: { conversationId, ...VIVANT } });
`;

const FIXTURE_FRAGMENT_ALIAS = `
  type KeyWhere = Prisma.ServerEncryptionKeyWhereInput;
  const VIVANT: KeyWhere = { expiresAt: null };
  const rows = await prisma.key.findMany({ where: { ...VIVANT } });
`;

const FIXTURE_FRAGMENT_SATISFIES = `
  const VIVANT = { expiresAt: null } satisfies Prisma.ServerEncryptionKeyWhereInput;
  const rows = await prisma.key.findMany({ where: { ...VIVANT } });
`;

/**
 * La contrepartie, sans quoi la règle 3 relèverait toute charge d'écriture
 * extraite : une constante que RIEN ne répand dans un `where` reste une
 * écriture.
 */
const FIXTURE_FRAGMENT_ECRITURE = `
  const PAYLOAD = { leftAt: null };
  await prisma.participant.update({ where: { id }, data: { ...PAYLOAD } });
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

/**
 * La forme du défaut #19800 : l'égalité nue dont la SŒUR de `OR` est un
 * INTERVALLE. La clause EST une alternative — donc elle ressemble au remède —
 * et aucune de ses branches ne dit l'absence. Une sonde qui se contenterait de
 * « ce champ a-t-il une sœur dans son `OR` ? » la bénirait.
 */
const FIXTURE_SOEUR_INTERVALLE = `
  await prisma.conversation.updateMany({
    where: { id, OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: at } }] },
    data: { lastActivityAt: at },
  });
`;

/** Le même site, RÉPARÉ : la troisième branche dit l'absence. */
const FIXTURE_SOEUR_INTERVALLE_REPAREE = `
  await prisma.conversation.updateMany({
    where: { id, OR: [{ lastActivityAt: null }, { lastActivityAt: { isSet: false } }, { lastActivityAt: { lt: at } }] },
    data: { lastActivityAt: at },
  });
`;

/**
 * Les quatre formes de RÉSOLUTION DU MODÈLE (#19800, audit du cycle 182). Elles
 * existent parce que la distinction `Conversation` / `UserSession` décide d'un
 * ROUGE sans remède, et qu'une distinction qu'on énonce sans la mesurer protège
 * le site qu'elle cache.
 */
const FIXTURE_MODELE_DELEGUE = `
  await prisma.conversation.updateMany({
    where: { id, OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: at } }] },
    data: { lastActivityAt: at },
  });
`;

/** Le délégué sous un porteur et un `await` — la forme d'un service. */
const FIXTURE_MODELE_DELEGUE_PORTE = `
  const rows = await this.prisma.userSession.findMany({
    where: { lastActivityAt: null },
    select: { id: true },
  });
`;

/** Le modèle par l'ANNOTATION, quand aucun appel n'enveloppe le littéral. */
const FIXTURE_MODELE_ANNOTE = `
  const VIVANT: Prisma.ConversationWhereInput = { isActive: true, lastActivityAt: null };
`;

/**
 * Et le modèle NON RÉSOLU : un `where` passé en paramètre, qu'aucun délégué
 * n'enveloppe. Il doit rester GARDÉ — un `''` n'est pas une absolution.
 */
const FIXTURE_MODELE_INCONNU = `
  export function scope(): SomeOpaqueType {
    return { where: { lastActivityAt: null } };
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

  it('REFUSE une égalité nue dont la SŒUR de `OR` est un INTERVALLE — une alternative n’est pas le remède (#19800)', () => {
    expect(sites(FIXTURE_SOEUR_INTERVALLE)).toEqual(['lastActivityAt:false']);
  });

  it('et il absout le MÊME site une fois la troisième branche posée', () => {
    expect(sites(FIXTURE_SOEUR_INTERVALLE_REPAREE)).toEqual(['lastActivityAt:true']);
  });

  it.each([
    ['le délégué de l’appel englobant', FIXTURE_MODELE_DELEGUE, 'conversation'],
    ['un délégué porté, sous `await`', FIXTURE_MODELE_DELEGUE_PORTE, 'userSession'],
    ['l’annotation `Prisma.<Modèle>WhereInput`', FIXTURE_MODELE_ANNOTE, 'conversation'],
    ['rien du tout — et il le DIT', FIXTURE_MODELE_INCONNU, ''],
  ])('résout le MODÈLE par %s', (_voie, fixture, attendu) => {
    expect(equalityNullFiltersIn('fixture.ts', fixture, COLONNES).map((site) => site.model)).toEqual([attendu]);
  });

  /**
   * Le constat A de l'audit du cycle 182, dans les DEUX sens. Sans le modèle, ce
   * cliquet accusait le site de session — où `isSet: false` ne compile pas
   * (`TS2353`), donc où il n'avait aucun remède à offrir.
   */
  it('ne tient PAS pour piégeuse une colonne requise sur SON modèle (`UserSession.lastActivityAt`)', () => {
    const [site] = equalityNullFiltersIn('fixture.ts', FIXTURE_MODELE_DELEGUE_PORTE, COLONNES);
    expect(colonneEstPiegeuse(site)).toBe(false);
  });

  it('la tient pour piégeuse sur le modèle où elle est OPTIONNELLE, et sur un modèle non résolu', () => {
    const [conversation] = equalityNullFiltersIn('fixture.ts', FIXTURE_MODELE_ANNOTE, COLONNES);
    const [inconnu] = equalityNullFiltersIn('fixture.ts', FIXTURE_MODELE_INCONNU, COLONNES);
    expect([colonneEstPiegeuse(conversation), colonneEstPiegeuse(inconnu)]).toEqual([true, true]);
  });

  /**
   * Et la portée par modèle ne s'applique QU'aux colonnes qui la déclarent : les
   * trois colonnes triées avant #19800 restent gardées sur tout modèle, leur
   * mesure ayant été prise ainsi.
   */
  it('garde les colonnes SANS portée de modèle sur n’importe quel modèle', () => {
    const [site] = equalityNullFiltersIn('fixture.ts', FIXTURE_FILTRE_NU, COLONNES);
    expect([site.model, colonneEstPiegeuse(site)]).toEqual(['participant', true]);
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

  it('REFUSE l’absence NIÉE — `NOT: { isSet: false }` dit l’inverse de ce que le texte suggère', () => {
    expect(sites(FIXTURE_ABSENCE_NIEE)).toEqual(['leftAt:false']);
  });

  it('REFUSE l’absence dite dans la MÊME branche — une alternative a deux branches', () => {
    expect(sites(FIXTURE_ABSENCE_MEME_BRANCHE)).toEqual(['leftAt:false']);
  });

  it.each([
    ['au type INFÉRÉ', FIXTURE_FRAGMENT_TYPE_INFERE],
    ['via un ALIAS de type', FIXTURE_FRAGMENT_ALIAS],
    ['avec `satisfies`', FIXTURE_FRAGMENT_SATISFIES],
  ])('voit un fragment RÉPANDU dans un `where` %s — sans rien demander à son type', (_forme, fixture) => {
    expect(equalityNullFiltersIn('fixture.ts', fixture, new Set(['expiresAt'])))
      .toEqual([expect.objectContaining({ field: 'expiresAt', absenceSaidInSameOr: false })]);
  });

  it('ne relève pas une constante d’ÉCRITURE que rien ne répand dans un `where`', () => {
    expect(sites(FIXTURE_FRAGMENT_ECRITURE)).toEqual([]);
  });
});

describe('aucun filtre de soft-state ne décide sur une égalité nue (#19690, #19755, #19800)', () => {
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
      .filter(colonneEstPiegeuse)
      .filter((site) => DISCIPLINE_D_ECRITURE[`${site.file}#${site.field}`] === undefined)
      .map((site) => `${site.file}:${site.line}#${site.field} (${site.spelling})`);

    expect(nus).toEqual([]);
  });

  /**
   * Une absolution porte son COMPTE, parce que sa clé est un FICHIER et que la
   * mesure qui la justifie décrit UNE lecture. Sans ce témoin, une seconde
   * égalité nue posée dans le même fichier entrerait sous une absolution écrite
   * pour sa voisine — reproduit par l'audit du cycle 181 (constat C), cliquet
   * resté vert. Un numéro de ligne dériverait à la première édition ; un compte,
   * non.
   */
  it('une discipline gelée couvre le NOMBRE de sites qu’elle a mesuré, jamais un de plus', () => {
    const comptes = balayage().sites
      .filter((site) => !site.absenceSaidInSameOr)
      .filter(colonneEstPiegeuse)
      .reduce<Record<string, number>>((tally, site) => {
        const cle = `${site.file}#${site.field}`;
        return { ...tally, [cle]: (tally[cle] ?? 0) + 1 };
      }, {});

    const ecarts = Object.entries(DISCIPLINE_D_ECRITURE)
      .filter(([cle, gelee]) => (comptes[cle] ?? 0) !== gelee.sites)
      .map(([cle, gelee]) => `${cle} : ${gelee.sites} mesuré(s), ${comptes[cle] ?? 0} trouvé(s)`);

    expect(ecarts).toEqual([]);
  });

  /**
   * L'angle mort de l'instrument, PUBLIÉ. Un fragment répandu sous un `where`
   * qu'aucun fichier de production ne déclare sort de sa portée — et une limite
   * publiée sans sa liste ne peut pas rougir : c'est elle qui a tenu
   * `visibleNotificationsWhere` hors du balayage du cycle 180.
   */
  it('les fragments HORS DE PORTÉE sont ceux mesurés — un neuvième se fait ouvrir', () => {
    expect([...balayage().unresolvedFragments]).toEqual([...HORS_DE_PORTEE]);
  });

  /**
   * Une absolution qui ne décrit plus rien est pire qu'une absence
   * d'absolution : elle couvre le site SUIVANT. Chaque ligne gelée doit
   * correspondre à un site réellement nu — sinon elle est à retirer, et son
   * retrait fait partie du correctif qui l'a rendue inutile.
   */
  it('aucune discipline gelée ne couvre un site qui n’existe plus — une absolution périmée absout le suivant', () => {
    const nus = new Set(
      balayage().sites
        .filter((site) => !site.absenceSaidInSameOr)
        .filter(colonneEstPiegeuse)
        .map((site) => `${site.file}#${site.field}`)
    );

    expect(Object.keys(DISCIPLINE_D_ECRITURE).filter((cle) => !nus.has(cle))).toEqual([]);
  });
});
