/**
 * Ce qu'une CATÉGORIE de préférences est — une table, et une seule.
 *
 * Sept catégories, quatre verbes : la surface engendrait vingt-huit routes dont
 * la catégorie n'était qu'un paramètre déguisé en chemin (#4181). Les fusionner
 * en trois demandait d'abord de répondre à une question que le dépôt n'avait
 * écrite nulle part : **où lit-on ce qu'une catégorie SAIT d'elle-même ?**
 *
 * La réponse était « à trois endroits » :
 *
 *  1. `index.ts` énumérait les sept schémas et les sept jeux de défauts pour
 *     monter les routeurs, puis les RÉÉNUMÉRAIT pour composer l'agrégat, avec
 *     sa propre fonction `complete()` — une seconde implémentation de la
 *     complétion par défauts. Deux chemins pour une même règle, donc deux
 *     vérités possibles le jour où un défaut change : le `GET` d'une catégorie
 *     l'aurait rendu, l'agrégat non.
 *  2. La factory tenait `readStored` / `resolveComplete` dans sa fermeture,
 *     inatteignables par quiconque n'était pas une route de catégorie.
 *  3. Les TROIS gestes qui suivent toute écriture — retrait des lignes héritées
 *     de janvier 2026, purge du cache des portes de diffusion, diffusion de
 *     `preferences:updated` — vivaient recopiés dans chacun des quatre verbes.
 *
 * Ce module est le site unique des trois. `resolveComplete` y devient une
 * fonction PURE (critère 2 de #4181) : l'agrégat ne la réimplémente plus, et un
 * défaut ajouté à une catégorie apparaît dans sa réponse sans qu'aucune ligne
 * d'`index.ts` ne soit touchée — `index.ts` ne nomme plus aucun défaut.
 *
 * ## Pourquoi une table et non sept appels
 *
 * Un registre se PARCOURT. `?categories=a,b` n'est réalisable que si la liste
 * des catégories est une donnée ; tant qu'elle était un enchaînement de sept
 * `fastify.register`, toute question posée « sur un sous-ensemble » demandait
 * de réécrire l'énumération à l'endroit qui la posait. C'est exactement ce qui
 * s'est produit : l'agrégat l'a réécrite.
 */

import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  PrivacyPreferenceSchema,
  AudioPreferenceSchema,
  MessagePreferenceSchema,
  NotificationPreferenceSchema,
  VideoPreferenceSchema,
  DocumentPreferenceSchema,
  ApplicationPreferenceSchema,
  PRIVACY_PREFERENCE_DEFAULTS,
  AUDIO_PREFERENCE_DEFAULTS,
  MESSAGE_PREFERENCE_DEFAULTS,
  NOTIFICATION_PREFERENCE_DEFAULTS,
  VIDEO_PREFERENCE_DEFAULTS,
  DOCUMENT_PREFERENCE_DEFAULTS,
  APPLICATION_PREFERENCE_DEFAULTS,
} from '@meeshy/shared/types/preferences';
import {
  resolveStoredPrivacyPreferences,
  retireLegacyPrivacyRows,
} from '../../../services/preferences/privacy-storage';
import { invalidatePrivacyPreferences } from '../../../services/preferences/privacy-cache';
import {
  emitPreferenceCategoryUpdated,
  PREFERENCE_CATEGORIES,
  type PreferenceCategory,
} from '../../../services/preferences/preferences-broadcast';
import { submittedKeysOnly } from '../../../utils/partial-update';

export { PREFERENCE_CATEGORIES };
export type { PreferenceCategory };

/** Un document de préférences, tel qu'il voyage : des clés, des valeurs. */
export type PreferenceDocument = Record<string, unknown>;

/**
 * Ce que la factory et le registre attendent d'un schéma : parser un corps
 * COMPLET, et savoir se départialiser pour parser un corps partiel.
 *
 * Décrit STRUCTURELLEMENT et non par `ZodSchema<T>` pour une raison précise :
 * la table ci-dessous range sept schémas dont les types de sortie diffèrent, et
 * un générique unique ne peut pas les tenir sans que chaque lecture ait à le
 * réinstancier. Le contrat utile ici n'est pas « quel objet sort » — les routes
 * servent du JSON opaque — mais « ce corps est-il valide ». La forme
 * structurelle l'exprime exactement, sans une seule assertion de type.
 */
export type PreferenceSchema = {
  readonly parse: (input: unknown) => PreferenceDocument;
  readonly partial: () => { readonly parse: (input: unknown) => PreferenceDocument };
};

/**
 * Où vit l'état d'une catégorie, quand ce n'est pas seulement son champ JSON.
 *
 * Une seule catégorie a besoin de le dire : `privacy` possède, en plus de son
 * document, les lignes clé/valeur héritées de janvier 2026 que les six portes
 * de diffusion obéissent encore (`services/preferences/privacy-storage`).
 */
export type CategoryStorage = {
  /** Ce que le serveur tient pour stocké — au-delà du seul document JSON. */
  readonly readStored: (
    prisma: PrismaClient,
    userId: string
  ) => Promise<PreferenceDocument | null>;
  /** Après CHAQUE écriture réussie, une fois le document autoritatif. */
  readonly afterWrite?: (prisma: PrismaClient, userId: string) => Promise<void>;
};

export type PreferenceEntry = {
  readonly schema: PreferenceSchema;
  readonly defaults: PreferenceDocument;
  readonly storage?: CategoryStorage;
};

/**
 * La table. Sept lignes, lues par le montage des alias (`index.ts`), par les
 * trois routes unifiées (`unified-routes.ts`) et par la factory.
 *
 * `privacy` est la SEULE à porter un `storage` : un endpoint présent du 12 au
 * 18 janvier 2026 a écrit des lignes clé/valeur puis a été retiré sans reprise
 * de données. Les six portes de diffusion les obéissent toujours ; sans ce
 * rangement injecté, l'écran affichait le défaut « tout visible » pendant que le
 * serveur taisait, et le `PATCH` d'un réglage voisin effaçait l'opt-out.
 * `afterWrite` clôt la fenêtre au premier réglage écrit.
 */
export const PREFERENCE_REGISTRY: Readonly<Record<PreferenceCategory, PreferenceEntry>> = {
  privacy: {
    schema: PrivacyPreferenceSchema,
    defaults: PRIVACY_PREFERENCE_DEFAULTS,
    storage: {
      readStored: resolveStoredPrivacyPreferences,
      afterWrite: retireLegacyPrivacyRows,
    },
  },
  audio: { schema: AudioPreferenceSchema, defaults: AUDIO_PREFERENCE_DEFAULTS },
  message: { schema: MessagePreferenceSchema, defaults: MESSAGE_PREFERENCE_DEFAULTS },
  notification: {
    schema: NotificationPreferenceSchema,
    defaults: NOTIFICATION_PREFERENCE_DEFAULTS,
  },
  video: { schema: VideoPreferenceSchema, defaults: VIDEO_PREFERENCE_DEFAULTS },
  document: { schema: DocumentPreferenceSchema, defaults: DOCUMENT_PREFERENCE_DEFAULTS },
  application: {
    schema: ApplicationPreferenceSchema,
    defaults: APPLICATION_PREFERENCE_DEFAULTS,
  },
};

/** `true` quand la chaîne nomme l'une des sept catégories. */
export function isPreferenceCategory(value: string): value is PreferenceCategory {
  return Object.prototype.hasOwnProperty.call(PREFERENCE_REGISTRY, value);
}

const isDocument = (value: unknown): value is PreferenceDocument =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isEmptyDocument = (value: unknown): boolean =>
  !isDocument(value) || Object.keys(value).length === 0;

/**
 * **LE SITE UNIQUE de la complétion par défauts** (critère 2 de #4181).
 *
 * Les défauts comblent les clés muettes. Une clé stockée gagne toujours, y
 * compris quand sa valeur ÉGALE le défaut — c'est une superposition, pas une
 * fusion conditionnelle : distinguer les deux ferait dépendre le résultat de la
 * valeur, ce qu'aucun appelant n'attend.
 *
 * Pure et sans accès base : elle est ainsi appelable depuis la factory (qui a
 * lu par sa fermeture), depuis l'agrégat (qui lit en lot) et depuis un témoin,
 * sans qu'aucun des trois n'en réécrive la règle.
 */
export function resolveComplete(
  defaults: PreferenceDocument,
  stored: PreferenceDocument | null | undefined
): PreferenceDocument {
  return { ...defaults, ...(isDocument(stored) ? stored : {}) };
}

/**
 * Ce que le serveur tient pour STOCKÉ sur une catégorie — le document JSON, ou
 * ce que son rangement dit quand elle en a un.
 *
 * `null` signifie « rien d'écrit » : l'appelant sert les défauts. Un document
 * vide (`{}`) vaut `null` — la ligne `UserPreferences` naît avec ses sept
 * colonnes à `null` et une remise à zéro y revient.
 */
export async function readStoredCategory(
  prisma: PrismaClient,
  userId: string,
  category: PreferenceCategory
): Promise<PreferenceDocument | null> {
  const storage = PREFERENCE_REGISTRY[category].storage;
  if (storage) {
    const stored = await storage.readStored(prisma, userId);
    return isEmptyDocument(stored) ? null : stored;
  }

  return readJsonPreferenceColumn(prisma, userId, category);
}

/**
 * La colonne JSON d'une catégorie, et rien d'autre.
 *
 * Exportée pour la factory des alias : elle reçoit son rangement en paramètre
 * plutôt que de le lire dans le registre — un routeur monté à la main dans un
 * témoin doit obéir à ce qu'on lui passe, pas à ce que la table dit de son nom.
 * Les DEUX chemins partagent en revanche la lecture de la colonne, et la règle
 * « un document vide vaut rien d'écrit » avec elle.
 */
export async function readJsonPreferenceColumn(
  prisma: PrismaClient,
  userId: string,
  category: PreferenceCategory
): Promise<PreferenceDocument | null> {
  const row = await prisma.userPreferences.findUnique({
    where: { userId },
    select: { [category]: true },
  });

  const document = row?.[category];
  return isEmptyDocument(document) ? null : (document as PreferenceDocument);
}

/**
 * L'état complet d'UNE catégorie : ses défauts, comblés par le stocké.
 * La projection que servent le `GET` d'un alias et la base de fusion du `PATCH`.
 */
export async function resolveCompleteCategory(
  prisma: PrismaClient,
  userId: string,
  category: PreferenceCategory
): Promise<PreferenceDocument> {
  return resolveComplete(
    PREFERENCE_REGISTRY[category].defaults,
    await readStoredCategory(prisma, userId, category)
  );
}

/**
 * L'état complet de PLUSIEURS catégories, en une lecture de la ligne.
 *
 * L'agrégat coûtait deux requêtes (la ligne entière + le résolveur de
 * confidentialité) et sept complétions écrites à la main. Il en coûte toujours
 * deux au plus — et une seule dès que `?categories=` ne demande pas `privacy`,
 * ce qui est le cas nominal d'un écran de réglages. Les sept colonnes ne sont
 * plus repatriées pour en lire une : le `select` est construit sur ce qui est
 * DEMANDÉ.
 */
export async function resolveCompleteCategories(
  prisma: PrismaClient,
  userId: string,
  categories: readonly PreferenceCategory[]
): Promise<Record<string, PreferenceDocument>> {
  const jsonCategories = categories.filter((c) => !PREFERENCE_REGISTRY[c].storage);
  const storedCategories = categories.filter((c) => PREFERENCE_REGISTRY[c].storage);

  const [row, ...storedDocuments] = await Promise.all([
    jsonCategories.length > 0
      ? prisma.userPreferences.findUnique({
          where: { userId },
          select: Object.fromEntries(jsonCategories.map((c) => [c, true])),
        })
      : Promise.resolve(null),
    ...storedCategories.map((c) => readStoredCategory(prisma, userId, c)),
  ]);

  const byStorage = new Map(
    storedCategories.map((c, index) => [c, storedDocuments[index] ?? null])
  );

  return Object.fromEntries(
    categories.map((category) => [
      category,
      resolveComplete(
        PREFERENCE_REGISTRY[category].defaults,
        byStorage.has(category)
          ? byStorage.get(category)
          : ((row as PreferenceDocument | null)?.[category] as PreferenceDocument | undefined)
      ),
    ])
  );
}

/**
 * Ce qu'un `PATCH` a VRAIMENT demandé de changer sur une catégorie.
 *
 * Deux gestes en un, et l'ordre compte : Zod valide (types, énumérations,
 * bornes, clés inconnues écartées) puis `submittedKeysOnly` retire les défauts
 * que `partial()` réinjecte — `partial()` enveloppe chaque champ dans
 * `optional()` mais ne lui retire pas son `default()`, si bien qu'une fusion
 * `{ ...existant, ...validé }` serait inerte (cf. `utils/partial-update`).
 *
 * C'est aussi ce qui rend `mode=replace` FIDÈLE : une clé absente du corps
 * reste absente du document écrit, au lieu de revenir à son défaut Zod.
 */
export function submittedFrom(schema: PreferenceSchema, body: unknown): PreferenceDocument {
  return submittedKeysOnly(schema.partial().parse(body), body);
}

/** La même règle, pour un appelant qui ne connaît que le NOM de la catégorie. */
export function parseSubmittedKeys(
  category: PreferenceCategory,
  body: unknown
): PreferenceDocument {
  return submittedFrom(PREFERENCE_REGISTRY[category].schema, body);
}

/**
 * **LES TROIS GESTES qui suivent toute écriture de préférence.**
 *
 * En perdre un est le défaut le plus silencieux du module, et chacun a déjà
 * coûté quelque chose :
 *
 *  1. `afterWrite` — sans lui, « réinitialiser » remet le document à `null`, la
 *     lecture redescend sur les lignes de janvier 2026, et la remise à zéro ne
 *     remet rien à zéro tout en n'étant plus visible nulle part.
 *  2. la purge du cache — six portes de diffusion mémoïsent la confidentialité
 *     cinq minutes ; sans elle, couper ses accusés de lecture ne prenait effet
 *     qu'après ce délai, le serveur continuant de diffuser ce que l'utilisateur
 *     venait de demander de taire pendant que l'écran lui confirmait l'inverse.
 *  3. la diffusion — le contrat client est PAR CATÉGORIE
 *     (`use-socket-cache-sync` invalide `queryKeys.preferences.category(...)`) :
 *     une écriture multi-catégories émet donc une fois PAR catégorie, jamais un
 *     évènement « tout » que le client laisserait tomber.
 *
 * Site unique partagé par les quatre verbes des alias ET par les trois routes
 * unifiées : c'est la seule forme où la fusion ne peut pas en égarer un.
 *
 * `afterWrite` n'est PAS avalé. Une panne rend 500 sans diffuser : sur une
 * remise à zéro, des lignes de janvier survivantes RESSUSCITERAIENT le réglage
 * effacé — annoncer un succès partiel serait annoncer l'inverse de ce qui s'est
 * passé. Les quatre verbes sont idempotents, le client peut retenter.
 */
export async function applyCategoryWriteEffects(
  fastify: FastifyInstance,
  userId: string,
  categories: readonly PreferenceCategory[]
): Promise<void> {
  for (const category of categories) {
    const afterWrite = PREFERENCE_REGISTRY[category].storage?.afterWrite;
    if (afterWrite) await afterWrite(fastify.prisma, userId);
  }

  if (categories.includes('privacy')) invalidatePrivacyPreferences(userId);

  for (const category of categories) {
    emitPreferenceCategoryUpdated(fastify, userId, category);
  }
}
