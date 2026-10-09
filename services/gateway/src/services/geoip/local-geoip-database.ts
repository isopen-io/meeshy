/**
 * LA BASE DE GÉOLOCALISATION EST LOCALE (#9609).
 *
 * Le pays et la ville d'une session se lisaient chez ip-api.com, en HTTP clair :
 * l'adresse de chaque connexion partait chez un tiers. Ils se lisent désormais
 * dans DB-IP Lite (ville, format MMDB, licence CC-BY 4.0), un fichier monté en
 * VOLUME — jamais dans l'image — et renouvelé chaque mois par
 * `infrastructure/scripts/geoip-update-dbip.sh`.
 *
 * Trois règles :
 *  - **absente, la base ne dégrade que le lieu** : pays et ville inconnus,
 *    aucun appel sortant, aucune erreur remontée à la connexion ;
 *  - **renouvelée, elle est reprise sans redémarrage** : la date du fichier se
 *    relit au plus une fois par `recheckEveryMs` ; un fichier renouvelé mais
 *    illisible laisse servir la base précédente ;
 *  - **chargée une fois** : deux lectures simultanées au démarrage partagent le
 *    même chargement.
 *
 * Le fichier de la ville pèse de l'ordre de 130 Mo, tenus en mémoire (le
 * lecteur MMDB lit un tampon). La base « pays » de DB-IP Lite (≈ 8 Mo) se monte
 * au même chemin si la mémoire l'exige : la ville sera alors inconnue.
 */
import { readFile, stat } from 'node:fs/promises';
import { Reader, type CityResponse } from 'mmdb-lib';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'GeoIpDatabase' });

type LocalizedNames = { readonly en?: string };

/** Ce que l'on lit d'un enregistrement DB-IP Lite « ville » (forme GeoLite2-City). */
export type GeoIpRecord = {
  readonly country?: { readonly iso_code?: string; readonly names?: LocalizedNames };
  readonly city?: { readonly names?: LocalizedNames };
  readonly subdivisions?: ReadonlyArray<{ readonly names?: LocalizedNames }>;
  readonly location?: { readonly time_zone?: string };
};

export interface GeoIpRecordSource {
  get(ip: string): GeoIpRecord | null;
}

/**
 * L'état de la base, lu sans attendre — pour le contrôle de santé : un
 * déploiement sans le fichier ne doit pas se dégrader en silence (#9609).
 * `unchecked` : jamais consultée ; `loaded` : servie ; `missing` : fichier
 * absent ; `unreadable` : présent mais illisible, aucune base servie.
 */
export type GeoIpDatabaseStatus = 'unchecked' | 'loaded' | 'missing' | 'unreadable';

export interface GeoIpDatabase {
  source(): Promise<GeoIpRecordSource | null>;
  status?(): GeoIpDatabaseStatus;
}

export type GeoIpFileSystem = {
  stat(path: string): Promise<{ readonly mtimeMs: number; readonly size?: number }>;
  readFile(path: string): Promise<Buffer>;
};

export type GeoIpDatabaseOptions = {
  readonly path: string;
  readonly fs: GeoIpFileSystem;
  readonly open: (buffer: Buffer) => GeoIpRecordSource;
  readonly now: () => number;
  readonly recheckEveryMs: number;
};

type Loaded = { readonly source: GeoIpRecordSource | null; readonly signature: string | null };

/** Ce qui dit qu'un fichier a changé : sa date ET sa taille (audit L2-8). */
const signatureOf = (stats: { readonly mtimeMs: number; readonly size?: number }) => `${stats.mtimeMs}:${stats.size ?? ''}`;

const isMissingFile = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT';

export function createGeoIpDatabase(options: GeoIpDatabaseOptions): GeoIpDatabase {
  let loaded: Loaded = { source: null, signature: null };
  /** Le dernier fichier qui n'a pas pu s'ouvrir : il n'est pas relu tant qu'il ne change pas. */
  let unreadableSignature: string | null = null;
  let checkedAt: number | null = null;
  let absenceReported = false;
  let state: GeoIpDatabaseStatus = 'unchecked';
  let pending: Promise<GeoIpRecordSource | null> | null = null;

  const refresh = async (): Promise<GeoIpRecordSource | null> => {
    checkedAt = options.now();
    try {
      const signature = signatureOf(await options.fs.stat(options.path));
      if (loaded.signature === signature || unreadableSignature === signature) return loaded.source;
      const buffer = await options.fs.readFile(options.path);
      const source = (() => {
        try {
          return options.open(buffer);
        } catch (error) {
          // Le CONTENU est illisible (pas une lecture qui a échoué) : ce fichier
          // ne sera pas relu tant que sa date ou sa taille ne change pas.
          unreadableSignature = signature;
          throw error;
        }
      })();
      unreadableSignature = null;
      loaded = { source, signature };
      absenceReported = false;
      state = 'loaded';
      logger.info('GeoIP database loaded', { path: options.path });
      return source;
    } catch (error) {
      if (isMissingFile(error)) {
        if (!absenceReported) {
          logger.warn('GeoIP database absent — country and city stay unknown', { path: options.path });
          absenceReported = true;
        }
        loaded = { source: null, signature: null };
        unreadableSignature = null;
        state = 'missing';
        return null;
      }
      logger.warn('GeoIP database unreadable — previous database kept', { path: options.path, error });
      if (loaded.source === null) state = 'unreadable';
      return loaded.source;
    }
  };

  return {
    status: () => state,
    source: () => {
      if (pending) return pending;
      const due = checkedAt === null || options.now() - checkedAt >= options.recheckEveryMs;
      if (!due) return Promise.resolve(loaded.source);
      pending = refresh().finally(() => {
        pending = null;
      });
      return pending;
    },
  };
}

/** Le chemin du fichier DANS le conteneur ; le volume le monte en lecture seule. */
export const DEFAULT_GEOIP_DATABASE_PATH = '/app/geoip/dbip-city-lite.mmdb';

const RECHECK_EVERY_MS = 60 * 60 * 1000;

export function defaultGeoIpDatabase(): GeoIpDatabase {
  return createGeoIpDatabase({
    path: process.env.GEOIP_DATABASE_PATH || DEFAULT_GEOIP_DATABASE_PATH,
    fs: { stat, readFile: (path) => readFile(path) },
    open: (buffer) => {
      const reader = new Reader<CityResponse>(buffer);
      return { get: (ip) => reader.get(ip) };
    },
    now: () => Date.now(),
    recheckEveryMs: RECHECK_EVERY_MS,
  });
}
