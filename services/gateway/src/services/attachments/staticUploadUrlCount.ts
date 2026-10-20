import { MEDIA_URL_FIELDS, type MediaUrlField, type MediaUrlStore } from './mediaUrlNormalization';

/**
 * COMPTER LES LIGNES QUI GRAVENT `static.<domaine>/uploads` (#11256).
 *
 * Le nginx statique servait les uploads de la passerelle sous
 * `static.<domaine>/uploads/<clé>`. Le fermer casse toute ligne dont la
 * colonne porte cette adresse en dur : c'est une MIGRATION DE DONNÉES (feu
 * vert du porteur, #9223), pas un retrait de compose. Ce module ne porte que
 * la décision et le balayage ; il ne lit pas la base (le port lui est remis) et
 * il ne peut pas écrire, son port n'a pas de `write`.
 */
export type StaticUploadUrlStore = Pick<MediaUrlStore, 'name' | 'list'>;

export type StaticUploadUrlTally = { readonly scanned: number } & Readonly<Record<MediaUrlField, number>>;

export type StaticUploadUrlReport = {
  readonly total: number;
  readonly parCollection: Readonly<Record<string, StaticUploadUrlTally>>;
  readonly exemples: readonly string[];
};

const STATIC_HOST_PREFIX = 'static.';
const UPLOADS_PATH_PREFIX = '/uploads/';

/** Combien d'exemples le compte montre — assez pour juger, jamais la table entière. */
const EXEMPLES_MAX = 12;

/**
 * Une adresse ABSOLUE dont l'hôte est un sous-domaine `static.*` et dont le
 * chemin COMMENCE par `/uploads/`. Le magasin legacy (`/u/…`) n'en est pas, il
 * reste servi ; une clé nue ou la route de la passerelle non plus.
 */
export function isStaticUploadUrl(value: string): boolean {
  if (!value.startsWith('http://') && !value.startsWith('https://')) return false;
  try {
    const { hostname, pathname } = new URL(value);
    return hostname.startsWith(STATIC_HOST_PREFIX) && pathname.startsWith(UPLOADS_PATH_PREFIX);
  } catch {
    return false;
  }
}

const TALLY_VIDE: StaticUploadUrlTally = { scanned: 0, fileUrl: 0, thumbnailUrl: 0 };

export async function countStaticUploadUrls(options: {
  readonly stores: readonly StaticUploadUrlStore[];
}): Promise<StaticUploadUrlReport> {
  const parCollection: Record<string, StaticUploadUrlTally> = {};
  const exemples: string[] = [];

  for (const store of options.stores) {
    let tally = TALLY_VIDE;
    let cursor: string | null = null;

    for (;;) {
      const rows = await store.list(cursor);
      if (rows.length === 0) break;

      for (const row of rows) {
        tally = { ...tally, scanned: tally.scanned + 1 };
        for (const field of MEDIA_URL_FIELDS) {
          const value = row[field];
          if (value === null || !isStaticUploadUrl(value)) continue;
          tally = { ...tally, [field]: tally[field] + 1 };
          if (exemples.length < EXEMPLES_MAX) exemples.push(`${store.name}.${field}  ${row.id}  ${value}`);
        }
      }
      cursor = rows[rows.length - 1]!.id;
    }
    parCollection[store.name] = tally;
  }

  const total = Object.values(parCollection).reduce((somme, t) => somme + t.fileUrl + t.thumbnailUrl, 0);
  return { total, parCollection, exemples };
}
