/**
 * LES DONNÉES DE PACKS D'UN COMPTE, À L'EXPORT ET À LA PURGE (#10151, LP3 ;
 * sous-issue de #9141) — les SEULS accès RGPD aux tables de packs.
 *
 * Ce que le compte a fait des packs :
 *  - ses CHOIX d'installation, `UserStickerPack`, des trois domaines (la clé
 *    `packChoiceKey` les espace : `mee`, `glory-frame.afrique`…) ;
 *  - sa BIBLIOTHÈQUE, `UserSticker`, et ses fichiers sous `stickers/<userId>/` ;
 *  - les packs qu'il a PROPOSÉS, `StickerPack` + `StickerPackItem`, et leurs
 *    fichiers sous `sticker-packs/<id>/` ;
 *  - ses propositions de packs d'APPARENCE (fonds, contours, bannières : `CommunityAppearancePack`, #10709) ;
 *  - ses propositions de LENS (`LensPack` et leurs fichiers `LensPackAsset`, #11271) ;
 *  - les packs qu'il POSSÈDE, `UserPackOwnership` (#10632, #11272), par TOUTE voie —
 *    achat en Meeshes, jeu, octroi, événement : la ligne de dépense part avec
 *    le jeu (`GamePurge`), la possession part ici, sans filtre sur la voie —
 *    sans quoi l'historique d'un compte purgé survivait à sa purge.
 *
 * La purge (à l'expiration de la grâce, `purgeAccountIsolatedData`) efface les
 * choix, la bibliothèque, les fichiers de son répertoire — y compris ceux
 * qu'aucune ligne ne référence plus (une création interrompue) — et les
 * propositions `pending` et `rejected` avec leurs fichiers. La ligne `User`
 * étant anonymisée et jamais supprimée, le `onDelete: Cascade` du schéma ne
 * joue jamais : la purge est explicite.
 *
 * Un pack PUBLIÉ (`approved`) reste en place : d'autres comptes l'ont installé
 * et ont posé ses stickers dans leurs messages. Son `author`, texte libre que
 * l'auteur a choisi (souvent son nom), est remplacé par une mention neutre, en
 * attendant la décision produit PP8 (#10184) sur le sort de ces packs.
 * `installCount` reste : c'est un agrégat sans identité.
 *
 * Les FICHIERS partent AVANT les lignes : une ligne effacée ne nomme plus le
 * fichier, et un fichier dont la suppression a échoué doit rester retrouvable
 * par une seconde passe. Idempotente par construction : rejouée, elle ne
 * trouve rien, et l'anonymisation filtre sur l'auteur déjà neutre.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { parsePackChoiceKey } from '@meeshy/shared/types/content-pack';
import { packOwnershipSourceOf } from '@meeshy/shared/types/pack-ownership';
import { streamedFileUrlFromEnv } from '../attachments/publicMediaUrl';
import { anonymizedLensDocument } from './LensPacks';

export const DELETED_ACCOUNT_PACK_AUTHOR = 'Compte supprimé';

/** Les statuts d'une proposition qui n'a jamais été publiée : effacée avec son auteur. */
const UNPUBLISHED_STATUSES = ['pending', 'rejected'];

const ACCOUNT_ID_SHAPE = /^[a-f0-9]{24}$/i;

export type PackPrivacyDb = Pick<PrismaClient, 'userStickerPack' | 'userSticker' | 'stickerPack' | 'stickerPackItem' | 'userPackOwnership' | 'communityAppearancePack' | 'lensPack' | 'lensPackAsset'>;

/** Le volume des téléversements, vu par la purge : chemins RELATIFS à sa racine. */
export interface PackFileStore {
  exists(relativePath: string): Promise<boolean>;
  /** Les fichiers d'un répertoire (chemins relatifs), vide s'il n'existe pas. */
  list(relativeDirectory: string): Promise<readonly string[]>;
  /** Vrai si le fichier existait et a été supprimé, faux s'il était déjà absent. */
  remove(relativePath: string): Promise<boolean>;
}

export type PackPurgeOptions = { readonly files?: PackFileStore };

export type PackPurgeSummary = {
  readonly choicesDeleted: number;
  readonly libraryDeleted: number;
  readonly submissionsDeleted: number;
  readonly publishedAnonymized: number;
  readonly filesDeleted: number;
  readonly ownershipsDeleted: number;
};

export type PackExportPage = { readonly limit: number; readonly offset: number };

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';

/** Le volume réel, confiné à sa racine : un chemin qui en sortirait est refusé, jamais suivi. */
export function diskPackFileStore(basePath: string): PackFileStore {
  const root = path.resolve(basePath);
  const resolve = (relativePath: string): string => {
    const absolute = path.resolve(root, relativePath);
    if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error(`Chemin hors du volume des téléversements : ${relativePath}`);
    return absolute;
  };
  return {
    exists: async (relativePath) => {
      try {
        return (await fs.stat(resolve(relativePath))).isFile();
      } catch (error) {
        if (isMissing(error)) return false;
        throw error;
      }
    },
    list: async (relativeDirectory) => {
      try {
        const entries = await fs.readdir(resolve(relativeDirectory), { withFileTypes: true });
        return entries.filter((entry) => entry.isFile()).map((entry) => `${relativeDirectory}/${entry.name}`);
      } catch (error) {
        if (isMissing(error)) return [];
        throw error;
      }
    },
    remove: async (relativePath) => {
      try {
        await fs.unlink(resolve(relativePath));
        return true;
      } catch (error) {
        if (isMissing(error)) return false;
        throw error;
      }
    },
  };
}

export const defaultPackFileStore = (): PackFileStore => diskPackFileStore(process.env.UPLOAD_PATH || '/app/uploads');

// ── L'export ──────────────────────────────────────────────────────────────

const LIBRARY_SELECT = {
  id: true, name: true, origin: true, mimeType: true, filePath: true, width: true, height: true,
  sizeBytes: true, animated: true, createdAt: true, lastUsedAt: true,
} as const;

const SUBMISSION_SELECT = {
  slug: true, name: true, description: true, author: true, status: true, reviewNote: true,
  reviewedAt: true, installCount: true, createdAt: true,
  items: {
    select: { key: true, title: true, emoji: true, kind: true, mimeType: true, filePath: true, width: true, height: true, sizeBytes: true, zones: true, position: true },
    orderBy: { position: 'asc' },
  },
} as const;

/** Les propositions d'apparence d'un tiers (#10709) : données seulement, aucun fichier. */
const APPEARANCE_SUBMISSION_SELECT = {
  domain: true, slug: true, name: true, description: true, author: true, status: true, reviewNote: true,
  reviewedAt: true, price: true, installCount: true, createdAt: true, contractJson: true,
} as const;

const LENS_SUBMISSION_SELECT = {
  slug: true, name: true, author: true, status: true, reviewNote: true, reviewedAt: true, installCount: true,
  cost: true, surfaces: true, startsAt: true, endsAt: true, communities: true, createdAt: true, documentJson: true,
} as const;

const withFileUrl = <T extends { readonly filePath: string }>(row: T): T & { readonly fileUrl: string } => ({
  ...row,
  fileUrl: streamedFileUrlFromEnv(row.filePath),
});

/**
 * Les choix (domaine, slug, état, dates), la bibliothèque et les propositions
 * du compte, chaque fichier avec son adresse servie. Bornée par la page de la
 * requête, comme toute section de `GET /me/export`.
 */
export async function exportPackData(prisma: PackPrivacyDb, userId: string, page: PackExportPage) {
  const window = { take: page.limit, skip: page.offset };
  const [choiceRows, choicesTotal, libraryRows, libraryTotal, submissionRows, submissionsTotal, ownershipRows, ownershipsTotal, appearanceRows, appearanceTotal, lensRows, lensTotal] = await Promise.all([
    prisma.userStickerPack.findMany({
      where: { userId },
      select: { packSlug: true, installedAt: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      ...window,
    }),
    prisma.userStickerPack.count({ where: { userId } }),
    prisma.userSticker.findMany({ where: { userId }, select: LIBRARY_SELECT, orderBy: { createdAt: 'desc' }, ...window }),
    prisma.userSticker.count({ where: { userId } }),
    prisma.stickerPack.findMany({ where: { submitterId: userId }, select: SUBMISSION_SELECT, orderBy: { createdAt: 'desc' }, ...window }),
    prisma.stickerPack.count({ where: { submitterId: userId } }),
    prisma.userPackOwnership.findMany({
      where: { userId },
      select: { packKey: true, source: true, reference: true, priceMeeshes: true, acquiredAt: true },
      orderBy: { acquiredAt: 'desc' },
      ...window,
    }),
    prisma.userPackOwnership.count({ where: { userId } }),
    prisma.communityAppearancePack.findMany({ where: { submitterId: userId }, select: APPEARANCE_SUBMISSION_SELECT, orderBy: { createdAt: 'desc' }, ...window }),
    prisma.communityAppearancePack.count({ where: { submitterId: userId } }),
    prisma.lensPack.findMany({ where: { submitterId: userId }, select: LENS_SUBMISSION_SELECT, orderBy: { createdAt: 'desc' }, ...window }),
    prisma.lensPack.count({ where: { submitterId: userId } }),
  ]);

  const choices = choiceRows.map(({ packSlug, installedAt, updatedAt }) => {
    const key = parsePackChoiceKey(packSlug);
    return {
      domain: key?.domain ?? null,
      slug: key?.slug ?? packSlug,
      installed: installedAt !== null,
      installedAt,
      updatedAt,
    };
  });

  const ownerships = ownershipRows.map(({ packKey, source, reference, priceMeeshes, acquiredAt }) => {
    const key = parsePackChoiceKey(packKey);
    return {
      domain: key?.domain ?? null,
      slug: key?.slug ?? packKey,
      source: packOwnershipSourceOf(source),
      reference: reference ?? null,
      priceMeeshes: priceMeeshes ?? 0,
      acquiredAt,
    };
  });

  return {
    choices: { items: choices, total: choicesTotal },
    library: { items: libraryRows.map(withFileUrl), total: libraryTotal },
    submissions: {
      items: submissionRows.map(({ items, ...pack }) => ({ ...pack, items: items.map(withFileUrl) })),
      total: submissionsTotal,
    },
    ownerships: { items: ownerships, total: ownershipsTotal },
    appearanceSubmissions: { items: appearanceRows, total: appearanceTotal },
    lensSubmissions: { items: lensRows, total: lensTotal },
  };
}

// ── La purge ──────────────────────────────────────────────────────────────

type PackPurgePlan = {
  readonly choices: number;
  readonly libraryRows: number;
  readonly unpublishedPackIds: readonly string[];
  readonly published: number;
  readonly files: readonly string[];
  readonly ownerships: number;
  readonly appearanceUnpublished: number;
  readonly appearancePublished: number;
  readonly lensUnpublishedIds: readonly string[];
  readonly lensPublished: number;
};

const unpublishedOf = (userId: string) => ({ submitterId: userId, status: { in: UNPUBLISHED_STATUSES } });
const publishedOf = (userId: string) => ({ submitterId: userId, status: 'approved', author: { not: DELETED_ACCOUNT_PACK_AUTHOR } });
/** Une lens retirée par la modération n'est plus servie : elle part avec le compte, comme une proposition. */
const lensUnpublishedOf = (userId: string) => ({ submitterId: userId, status: { in: [...UNPUBLISHED_STATUSES, 'withdrawn'] } });

/** Ce que la purge effacerait, lu sans rien écrire — l'unique inventaire, partagé par la purge et sa mesure. */
async function planPackPurge(prisma: PackPrivacyDb, userId: string, files: PackFileStore): Promise<PackPurgePlan> {
  const [choices, libraryRows, unpublished, published, directoryFiles, ownerships, appearanceUnpublished, appearancePublished, lensUnpublished, lensPublished] = await Promise.all([
    prisma.userStickerPack.count({ where: { userId } }),
    prisma.userSticker.findMany({ where: { userId }, select: { filePath: true } }),
    prisma.stickerPack.findMany({ where: unpublishedOf(userId), select: { id: true, items: { select: { filePath: true } } } }),
    prisma.stickerPack.count({ where: publishedOf(userId) }),
    ACCOUNT_ID_SHAPE.test(userId) ? files.list(`stickers/${userId}`) : Promise.resolve([]),
    prisma.userPackOwnership.count({ where: { userId } }),
    prisma.communityAppearancePack.count({ where: unpublishedOf(userId) }),
    prisma.communityAppearancePack.count({ where: publishedOf(userId) }),
    prisma.lensPack.findMany({ where: lensUnpublishedOf(userId), select: { id: true } }),
    prisma.lensPack.count({ where: publishedOf(userId) }),
  ]);
  const referenced = [...libraryRows.map((row) => row.filePath), ...unpublished.flatMap((pack) => pack.items.map((item) => item.filePath))];
  const candidates = [...new Set([...directoryFiles, ...referenced])];
  const present = await Promise.all(candidates.map(async (file) => ((await files.exists(file)) ? file : null)));
  return {
    choices,
    libraryRows: libraryRows.length,
    unpublishedPackIds: unpublished.map((pack) => pack.id),
    published,
    files: present.filter((file): file is string => file !== null),
    ownerships,
    appearanceUnpublished,
    appearancePublished,
    lensUnpublishedIds: lensUnpublished.map((pack) => pack.id),
    lensPublished,
  };
}

/** La mesure à blanc : les mêmes comptes que la purge, sans une écriture (rattrapage `DRY_RUN=1`). */
export async function measurePackData(prisma: PackPrivacyDb, userId: string, options: PackPurgeOptions = {}): Promise<PackPurgeSummary> {
  const plan = await planPackPurge(prisma, userId, options.files ?? defaultPackFileStore());
  return {
    choicesDeleted: plan.choices,
    libraryDeleted: plan.libraryRows,
    submissionsDeleted: plan.unpublishedPackIds.length + plan.appearanceUnpublished + plan.lensUnpublishedIds.length,
    publishedAnonymized: plan.published + plan.appearancePublished + plan.lensPublished,
    filesDeleted: plan.files.length,
    ownershipsDeleted: plan.ownerships,
  };
}

/**
 * Le nom de l'auteur vit DEUX fois dans une lens publiée : la colonne `author` et
 * `credits.author` du document, que `/pack-assets` sert sans authentification.
 * Les deux se taisent, et le document est ré-adressé ; l'écriture est
 * conditionnelle sur l'ancienne empreinte (une revue concurrente gagne).
 */
async function anonymizePublishedLenses(prisma: PackPrivacyDb, userId: string): Promise<{ readonly count: number }> {
  const rows = await prisma.lensPack.findMany({ where: publishedOf(userId), select: { id: true, documentJson: true, documentSha256: true } });
  const written = await Promise.all(
    rows.map((row) =>
      prisma.lensPack.updateMany({
        where: { id: row.id, documentSha256: row.documentSha256 },
        data: { author: DELETED_ACCOUNT_PACK_AUTHOR, ...anonymizedLensDocument(row.documentJson, DELETED_ACCOUNT_PACK_AUTHOR) },
      }),
    ),
  );
  return { count: written.reduce((sum, result) => sum + result.count, 0) };
}

export async function purgePackData(prisma: PackPrivacyDb, userId: string, options: PackPurgeOptions = {}): Promise<PackPurgeSummary> {
  const files = options.files ?? defaultPackFileStore();
  const plan = await planPackPurge(prisma, userId, files);
  const removed = await Promise.all(plan.files.map((file) => files.remove(file)));
  const packIds = [...plan.unpublishedPackIds];

  if (packIds.length > 0) await prisma.stickerPackItem.deleteMany({ where: { packId: { in: packIds } } });
  const lensIds = [...plan.lensUnpublishedIds];
  if (lensIds.length > 0) await prisma.lensPackAsset.deleteMany({ where: { packId: { in: lensIds } } });
  const [submissions, library, choices, published, ownerships, appearanceSubmissions, appearancePublished, lensSubmissions, lensPublished] = await Promise.all([
    prisma.stickerPack.deleteMany({ where: { id: { in: packIds }, ...unpublishedOf(userId) } }),
    prisma.userSticker.deleteMany({ where: { userId } }),
    prisma.userStickerPack.deleteMany({ where: { userId } }),
    prisma.stickerPack.updateMany({ where: publishedOf(userId), data: { author: DELETED_ACCOUNT_PACK_AUTHOR } }),
    prisma.userPackOwnership.deleteMany({ where: { userId } }),
    prisma.communityAppearancePack.deleteMany({ where: unpublishedOf(userId) }),
    prisma.communityAppearancePack.updateMany({ where: publishedOf(userId), data: { author: DELETED_ACCOUNT_PACK_AUTHOR } }),
    prisma.lensPack.deleteMany({ where: { id: { in: lensIds }, ...lensUnpublishedOf(userId) } }),
    anonymizePublishedLenses(prisma, userId),
  ]);

  return {
    choicesDeleted: choices.count,
    libraryDeleted: library.count,
    submissionsDeleted: submissions.count + appearanceSubmissions.count + lensSubmissions.count,
    publishedAnonymized: published.count + appearancePublished.count + lensPublished.count,
    filesDeleted: removed.filter(Boolean).length,
    ownershipsDeleted: ownerships.count,
  };
}
