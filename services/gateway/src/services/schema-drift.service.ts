import { Prisma } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced';

/**
 * Sonde de DÉRIVE DE TYPAGE — « aucune ligne ne porte un type que le schéma ne déclare pas ».
 *
 * ## Ce que le défaut coûtait
 *
 * MongoDB n'impose aucun type ; le schéma Prisma décrit une INTENTION, pas une
 * contrainte. Une écriture passée hors Prisma (script de migration, `mongosh`,
 * import) peut donc poser un `Number` dans une colonne déclarée `String?`, et
 * rien ne le signale. Or **Prisma relit la ligne après chaque écriture** : dès
 * qu'une seule valeur est mal typée, TOUTE `update()` visant cette ligne lève —
 * y compris celles qui ne touchent pas la colonne fautive. Mesuré en
 * intégration (#4243) : un compte dont `phoneNumber` valait `237650159233`
 * (nombre) ne pouvait plus rien écrire sur lui-même — ni présence, ni
 * `lastLoginIp`, ni compteur d'échecs d'authentification, ni profil. Chaque
 * appel échouait isolément, dans un `catch` qui journalise et rend un 500 ou un
 * silence selon le site : le compte était mort sans qu'aucun tableau de bord ne
 * le dise. Le rattrapage de #4159 s'y est cassé les dents en production ; c'est
 * lui qui a révélé la ligne, six mois après l'écriture qui l'a posée.
 *
 * ## Pourquoi une SONDE, et pas seulement une correction
 *
 * Corriger la ligne ne corrige pas la CAUSE : la prochaine écriture hors Prisma
 * reproduira la mine, et personne ne le saura avant des mois. La sonde compte,
 * à intervalle régulier, les valeurs présentes dont le type BSON n'est pas
 * parmi ceux que le schéma déclare, et journalise en `error` dès qu'il y en a
 * une. Elle balaye les 85 collections, pas seulement `User` : la ligne trouvée
 * prouve qu'une écriture hors Prisma a EU LIEU, rien ne dit qu'elle fut la
 * seule, et un `Message` ou une `Conversation` mal typée produirait le même
 * blocage silencieux.
 *
 * ## Pourquoi `$runCommandRaw`, et jamais une lecture typée
 *
 * Une lecture Prisma TYPÉE sur une ligne mal typée LÈVE — c'est exactement le
 * défaut qu'on cherche à compter. La sonde ne peut donc pas utiliser l'API
 * qu'elle protège : elle passe par `aggregate` brut, où le filtre s'exécute
 * côté base et ne rend que des nombres.
 *
 * ## Le recensement vient du SCHÉMA, jamais d'une liste tenue à la main
 *
 * `colonnesChaineDuSchema()` dérive les colonnes du datamodel Prisma (DMMF).
 * Une liste écrite à la main dériverait au premier `@map` ajouté, et la sonde
 * rendrait « 0 dérive » sur une colonne qu'elle ne regarde plus — un silence
 * qui a l'air d'un succès. Corollaire tenu ci-dessous : un datamodel
 * ILLISIBLE ne rend pas un rapport propre, il rend une ERREUR.
 *
 * ## Frontière assumée
 *
 * Les 5 types COMPOSITES du schéma (documents embarqués) ne sont pas balayés :
 * leurs champs ne sont pas des colonnes de collection et exigeraient un chemin
 * `a.b.c` par occurrence. C'est une lacune CONNUE, déclarée ici plutôt que
 * masquée par une exhaustivité que la sonde n'a pas.
 */

const journalParDefaut = enhancedLogger.child({ module: 'SchemaDrift' });

/** Un champ du datamodel Prisma, réduit à ce dont la sonde a besoin. */
export type ChampDatamodel = {
  readonly name: string;
  readonly dbName?: string | null;
  readonly kind: string;
  readonly type: string;
  readonly isList: boolean;
  readonly isRequired: boolean;
  readonly nativeType?: readonly [string, readonly unknown[]] | null;
};

/** Un modèle du datamodel Prisma, réduit à ce dont la sonde a besoin. */
export type ModeleDatamodel = {
  readonly name: string;
  readonly dbName?: string | null;
  readonly fields: readonly ChampDatamodel[];
};

export type ColonneSondee = {
  /** Nom MONGO de la colonne — `@map` fait foi, jamais le nom Prisma. */
  readonly colonne: string;
  /** Nom PRISMA du champ, pour que le journal désigne ce qu'on lit dans le schéma. */
  readonly champ: string;
  readonly liste: boolean;
  readonly requis: boolean;
};

export type CollectionSondee = {
  readonly modele: string;
  /** Nom MONGO de la collection — `@@map` fait foi. */
  readonly collection: string;
  readonly colonnes: readonly ColonneSondee[];
};

export type DeriveDeTypage = {
  readonly collection: string;
  readonly colonne: string;
  /** Le type BSON RENCONTRÉ — jamais la valeur : une valeur mal typée reste une donnée personnelle. */
  readonly typeBson: string;
  /** Quelques `_id` pour rendre la ligne trouvable, sans divulguer son contenu. */
  readonly exemples: readonly string[];
};

export type CollectionNonSondee = {
  readonly collection: string;
  readonly raison: string;
};

export type RapportDeTypage = {
  readonly collectionsSondees: number;
  readonly colonnesSondees: number;
  readonly lignesEnDerive: number;
  readonly derives: readonly DeriveDeTypage[];
  /**
   * Ce que la sonde n'a PAS pu regarder. Sans ce champ, un balayage tronqué
   * (délai dépassé, base indisponible) rendrait « 0 dérive » et se lirait
   * comme un succès : un contrôle qui ne distingue pas « rien trouvé » de
   * « rien regardé » ment sur le fait.
   */
  readonly collectionsNonSondees: readonly CollectionNonSondee[];
};

/** Le minimum que la sonde exige d'un client Prisma — rien de typé, par construction. */
export type ExecuteurMongo = {
  $runCommandRaw(commande: Record<string, unknown>): Promise<unknown>;
};

export type JournalDeSonde = {
  info(message: string, contexte?: Record<string, unknown>): void;
  warn(message: string, contexte?: Record<string, unknown>): void;
  error(message: string, erreur?: unknown, contexte?: Record<string, unknown>): void;
};

export type OptionsDeSonde = {
  /** Plafond de temps CÔTÉ BASE par collection. Un balayage qui ne rend pas la main bloque le démarrage. */
  readonly maxTimeMS?: number;
  /** Combien de lignes fautives détailler par collection — le détail ne sert qu'à nommer la colonne. */
  readonly echantillon?: number;
  readonly journal?: JournalDeSonde;
  /** Injecté par les tests ; en production, le datamodel du client généré. */
  readonly modeles?: readonly ModeleDatamodel[];
};

const MAX_TIME_MS_PAR_DEFAUT = 20_000;
const ECHANTILLON_PAR_DEFAUT = 20;

/**
 * Le datamodel du client généré, lu DÉFENSIVEMENT.
 *
 * Le client Prisma est remplacé par un stub dans les runs Jest (`moduleNameMapper`),
 * et un client non généré n'expose aucun `dmmf`. On ne veut pas que ce cas fasse
 * exploser l'import du module — mais on ne veut PAS non plus qu'il produise un
 * rapport vert : `sonderLeTypage` refuse un recensement vide (voir plus bas).
 */
function datamodelDuClient(): readonly ModeleDatamodel[] {
  const client = Prisma as unknown as { dmmf?: { datamodel?: { models?: readonly ModeleDatamodel[] } } };
  return client?.dmmf?.datamodel?.models ?? [];
}

/**
 * Recense, pour chaque collection, les colonnes que le schéma déclare `String`.
 *
 * Deux exclusions, chacune payée par un faux positif qu'elle évite :
 * - les champs `@db.ObjectId` : leur type BSON est `objectId`, jamais `string`.
 *   Les inclure ferait rougir la sonde sur les 255 colonnes d'identité du
 *   schéma, c'est-à-dire sur CHAQUE ligne de la base — un contrôle qui rougit
 *   toujours ne signale plus rien.
 * - les champs non scalaires (relations, composites) : ce ne sont pas des
 *   colonnes de collection.
 */
export function colonnesChaineDuSchema(modeles: readonly ModeleDatamodel[]): readonly CollectionSondee[] {
  return modeles
    .map((modele) => ({
      modele: modele.name,
      collection: modele.dbName ?? modele.name,
      colonnes: modele.fields
        .filter((champ) =>
          champ.kind === 'scalar' &&
          champ.type === 'String' &&
          champ.nativeType?.[0] !== 'ObjectId')
        .map((champ) => ({
          colonne: champ.dbName ?? champ.name,
          champ: champ.name,
          liste: champ.isList,
          requis: champ.isRequired,
        })),
    }))
    .filter((collection) => collection.colonnes.length > 0);
}

/**
 * Le filtre Mongo qui dit « cette colonne porte un type que le schéma ne déclare pas ».
 *
 * `$exists: true` est INDISPENSABLE : sans lui, `$not: { $type: ... }` matche
 * aussi les documents où la colonne MANQUE — c'est-à-dire toutes les lignes
 * antérieures à l'ajout d'une colonne. La sonde compterait alors la moitié de
 * la base comme « en dérive ».
 *
 * `null` appartient aux types déclarés d'une colonne OPTIONNELLE et pas d'une
 * colonne REQUISE : Prisma lit `null` sans broncher sur `String?`, et lève sur
 * `String`. La distinction est gratuite ici et elle attrape une seconde forme
 * de la même mine.
 *
 * Une LISTE se casse de deux façons distinctes — la valeur n'est pas un
 * tableau, ou l'un de ses éléments n'est pas une chaîne — et un seul
 * `$not: { $type: 'string' }` ne dirait ni l'une ni l'autre : sur un tableau,
 * `$type: 'string'` interroge les ÉLÉMENTS, si bien qu'un tableau VIDE (cas
 * nominal, très fréquent) passerait pour une dérive.
 */
export function filtreDeDerive(colonne: ColonneSondee): Record<string, unknown> {
  const chemin = colonne.colonne;
  if (colonne.liste) {
    return {
      $or: [
        { [chemin]: { $exists: true, $not: { $type: 'array' } } },
        { [chemin]: { $elemMatch: { $not: { $type: 'string' } } } },
      ],
    };
  }
  const typesDeclares = colonne.requis ? ['string'] : ['string', 'null'];
  return { [chemin]: { $exists: true, $not: { $type: typesDeclares } } };
}

/** Le `$match` d'une collection : une ligne fautive sur N colonnes suffit à la retenir. */
export function filtreDeCollection(collection: CollectionSondee): Record<string, unknown> {
  return { $or: collection.colonnes.map(filtreDeDerive) };
}

/**
 * L'expression qui rend le type BSON RENCONTRÉ pour une colonne.
 *
 * Sur un tableau, `$type` rendrait `'array'` et masquerait l'élément fautif —
 * or c'est lui qu'on cherche. On rend donc l'ensemble des types d'éléments,
 * dédoublonné, que l'appelant met en forme.
 */
function expressionDeType(colonne: ColonneSondee): unknown {
  const reference = `$${colonne.colonne}`;
  if (!colonne.liste) return { $type: reference };
  return {
    $cond: [
      { $isArray: reference },
      { $setUnion: [{ $map: { input: reference, in: { $type: '$$this' } } }] },
      { $type: reference },
    ],
  };
}

/**
 * Le détail ne projette JAMAIS la valeur fautive, seulement son TYPE et l'`_id`
 * de la ligne. Le rattrapage de #4159 avait déjà tranché la question dans
 * l'autre sens (`colonneFautive()` n'extrait que le nom de la colonne du
 * message d'erreur Prisma) : une valeur mal typée reste une donnée personnelle,
 * et un journal d'exploitation n'est pas l'endroit où la recopier.
 */
export function pipelineDeDetail(collection: CollectionSondee, echantillon: number): readonly unknown[] {
  const types: Record<string, unknown> = {};
  for (const colonne of collection.colonnes) types[colonne.colonne] = expressionDeType(colonne);
  return [
    { $match: filtreDeCollection(collection) },
    { $limit: echantillon },
    { $project: { _id: 1, types } },
  ];
}

/** La commande `aggregate` brute — bornée côté base, jamais côté client. */
export function commandeDeComptage(collection: CollectionSondee, maxTimeMS: number): Record<string, unknown> {
  return {
    aggregate: collection.collection,
    pipeline: [{ $match: filtreDeCollection(collection) }, { $count: 'n' }],
    cursor: {},
    maxTimeMS,
  };
}

export function commandeDeDetail(
  collection: CollectionSondee,
  echantillon: number,
  maxTimeMS: number,
): Record<string, unknown> {
  return {
    aggregate: collection.collection,
    pipeline: pipelineDeDetail(collection, echantillon),
    cursor: {},
    maxTimeMS,
  };
}

function premierLot(reponse: unknown): readonly Record<string, unknown>[] {
  const cursor = (reponse as { cursor?: { firstBatch?: unknown } } | null)?.cursor;
  const lot = cursor?.firstBatch;
  return Array.isArray(lot) ? (lot as Record<string, unknown>[]) : [];
}

function identifiantMongo(brut: unknown): string {
  if (typeof brut === 'string') return brut;
  if (brut && typeof brut === 'object' && '$oid' in brut) return String((brut as { $oid: unknown }).$oid);
  return String(brut);
}

function typeLisible(brut: unknown): string {
  return Array.isArray(brut) ? `array<${brut.map(String).join('|')}>` : String(brut);
}

/**
 * Dépouille l'échantillon en une ligne PAR COLONNE FAUTIVE.
 *
 * Le document projeté porte le type de TOUTES les colonnes sondées, y compris
 * celles qui vont bien : c'est ce qui rend l'aggregate unique. Le tri se fait
 * donc ici, en ne retenant que les types que le schéma ne déclare pas — la
 * même règle que le filtre, appliquée au résultat.
 */
function derivesDeLEchantillon(
  collection: CollectionSondee,
  documents: readonly Record<string, unknown>[],
): readonly DeriveDeTypage[] {
  const parCle = new Map<string, { colonne: string; typeBson: string; exemples: string[] }>();
  for (const document of documents) {
    const types = (document.types ?? {}) as Record<string, unknown>;
    for (const colonne of collection.colonnes) {
      const rencontre = typeLisible(types[colonne.colonne]);
      if (estTypeDeclare(colonne, rencontre)) continue;
      const cle = `${colonne.colonne}::${rencontre}`;
      const entree = parCle.get(cle) ?? { colonne: colonne.colonne, typeBson: rencontre, exemples: [] };
      entree.exemples.push(identifiantMongo(document._id));
      parCle.set(cle, entree);
    }
  }
  return [...parCle.values()].map((entree) => ({ collection: collection.collection, ...entree }));
}

function estTypeDeclare(colonne: ColonneSondee, rencontre: string): boolean {
  if (colonne.liste) return rencontre === 'array<>' || rencontre === 'array<string>' || rencontre === 'missing';
  if (rencontre === 'missing') return true;
  return rencontre === 'string' || (!colonne.requis && rencontre === 'null');
}

/**
 * Balaye la base et rend le compte des lignes dont une colonne `String` porte
 * un autre type.
 *
 * SÉQUENTIEL, jamais en parallèle : le `$match` est un balayage complet (aucun
 * index ne porte sur le TYPE d'une valeur), et 85 balayages simultanés
 * feraient de la sonde un incident à leur tour.
 *
 * Le détail n'est demandé que si le compte est non nul : une base saine coûte
 * une commande par collection et zéro document rendu.
 */
export async function sonderLeTypage(
  prisma: ExecuteurMongo,
  options: OptionsDeSonde = {},
): Promise<RapportDeTypage> {
  const journal = options.journal ?? journalParDefaut;
  const maxTimeMS = options.maxTimeMS ?? MAX_TIME_MS_PAR_DEFAUT;
  const echantillon = options.echantillon ?? ECHANTILLON_PAR_DEFAUT;
  const collections = colonnesChaineDuSchema(options.modeles ?? datamodelDuClient());

  // Un recensement VIDE n'est pas une base saine : c'est une sonde aveugle.
  // La faire rendre un rapport vert ici ferait passer « je n'ai rien regardé »
  // pour « je n'ai rien trouvé » — précisément le silence qui a laissé la mine
  // de #4243 vivre six mois.
  if (collections.length === 0) {
    journal.error(
      '[SchemaDrift] datamodel ILLISIBLE — aucune colonne `String` recensée, la sonde ne garde RIEN',
      undefined,
      { collectionsSondees: 0 },
    );
    return {
      collectionsSondees: 0,
      colonnesSondees: 0,
      lignesEnDerive: 0,
      derives: [],
      collectionsNonSondees: [{ collection: '*', raison: 'datamodel illisible' }],
    };
  }

  const derives: DeriveDeTypage[] = [];
  const nonSondees: CollectionNonSondee[] = [];
  let lignesEnDerive = 0;
  let colonnesSondees = 0;

  for (const collection of collections) {
    colonnesSondees += collection.colonnes.length;
    try {
      const comptage = premierLot(await prisma.$runCommandRaw(commandeDeComptage(collection, maxTimeMS)));
      const compte = Number(comptage[0]?.n ?? 0);
      if (!Number.isFinite(compte) || compte === 0) continue;
      lignesEnDerive += compte;
      const detail = premierLot(await prisma.$runCommandRaw(commandeDeDetail(collection, echantillon, maxTimeMS)));
      derives.push(...derivesDeLEchantillon(collection, detail));
    } catch (erreur) {
      // Une collection qu'on n'a pas su lire ne compte NI comme propre NI comme
      // fautive : elle est nommée dans `collectionsNonSondees`, et le rapport
      // reste honnête sur son propre périmètre.
      nonSondees.push({
        collection: collection.collection,
        raison: erreur instanceof Error ? erreur.message : String(erreur),
      });
    }
  }

  const rapport: RapportDeTypage = {
    collectionsSondees: collections.length - nonSondees.length,
    colonnesSondees,
    lignesEnDerive,
    derives,
    collectionsNonSondees: nonSondees,
  };
  journaliser(rapport, journal);
  return rapport;
}

/**
 * LA garde qui rougit. `error` dès qu'une ligne dérive — pas `warn` : une ligne
 * mal typée est un compte qui ne peut plus rien écrire sur lui-même, pas une
 * curiosité de schéma.
 */
function journaliser(rapport: RapportDeTypage, journal: JournalDeSonde): void {
  if (rapport.lignesEnDerive > 0) {
    journal.error(
      '[SchemaDrift] DÉRIVE DE TYPAGE — des lignes portent un type que le schéma ne déclare pas ; toute écriture Prisma sur ces lignes LÈVERA, quel que soit le champ écrit',
      undefined,
      {
        lignesEnDerive: rapport.lignesEnDerive,
        derives: rapport.derives,
        collectionsSondees: rapport.collectionsSondees,
        colonnesSondees: rapport.colonnesSondees,
      },
    );
  }
  if (rapport.collectionsNonSondees.length > 0) {
    journal.warn('[SchemaDrift] balayage INCOMPLET — ces collections n\'ont pas été regardées', {
      collectionsNonSondees: rapport.collectionsNonSondees,
    });
  }
  if (rapport.lignesEnDerive === 0 && rapport.collectionsNonSondees.length === 0) {
    journal.info('[SchemaDrift] aucune dérive de typage', {
      collectionsSondees: rapport.collectionsSondees,
      colonnesSondees: rapport.colonnesSondees,
    });
  }
}

/** Douze heures : assez rare pour ne rien coûter, assez fréquent pour qu'une mine ne dorme pas six mois. */
const PERIODE_PAR_DEFAUT_MS = 12 * 60 * 60 * 1000;

export type SondeDeTypage = { arreter(): void };

/**
 * Démarre la sonde : une passe au démarrage, puis à intervalle régulier.
 *
 * La passe de démarrage n'est PAS derrière une garde de premier boot. Le dépôt
 * a déjà payé ce piège avec `ensurePostGeoIndex`, restée sous
 * `shouldInitialize()` et donc jamais exécutée en production jusqu'à ce que
 * `/posts/nearby` rende 500. Un contrôle rétroactif sur une base qui contient
 * déjà des données est, par définition, incompatible avec une porte « base
 * vide ».
 *
 * `unref()` : la sonde ne doit jamais retenir le processus au moment de
 * l'arrêt.
 */
export function demarrerSondeDeTypage(
  prisma: ExecuteurMongo,
  options: OptionsDeSonde & { readonly periodeMs?: number } = {},
): SondeDeTypage {
  const journal = options.journal ?? journalParDefaut;
  const periodeMs = options.periodeMs ?? PERIODE_PAR_DEFAUT_MS;
  const passe = (): void => {
    void sonderLeTypage(prisma, options).catch((erreur: unknown) =>
      journal.error('[SchemaDrift] la sonde de typage a ÉCHOUÉ — la base n\'est plus surveillée', erreur),
    );
  };
  passe();
  const minuterie = setInterval(passe, periodeMs);
  minuterie.unref?.();
  return { arreter: () => clearInterval(minuterie) };
}
