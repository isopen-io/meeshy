/**
 * L'ADRESSE SIGNÉE PAR LECTEUR d'un fichier protégé (#9600, décision porteur
 * du 2026-10-08).
 *
 * `GET /attachments/file/*` sert un fichier par son CHEMIN, sans identité :
 * une `<img>`, un `AVPlayer`, l'extension de notification n'envoient aucun
 * jeton. La route ne peut donc juger que la vie GLOBALE du message porteur, et
 * un lecteur dont la flamme est éteinte, ou qui a consommé sa vue unique, en
 * retélécharge les octets tant qu'un autre lecteur les garde vivants.
 *
 * La signature porte l'identité DANS l'adresse. Elle lie, sous une clé secrète
 * du serveur (HMAC-SHA-256, tronqué à 128 bits) :
 *
 *  - la clé de stockage servie (original, miniature, variante, piste traduite) ;
 *  - la pièce jointe dont l'adresse a été servie ;
 *  - le participant LECTEUR (une ligne `Participant`, donc une conversation) ;
 *  - une échéance, en secondes.
 *
 * ─── LA FORME DE L'ADRESSE : LA SIGNATURE VIT DANS LE CHEMIN ────────────────
 *
 *     /api/v1/attachments/signed/<pièce>.<lecteur>.<échéance>.<mac>/<clé encodée>
 *
 * Jamais dans une chaîne de requête : le résolveur web
 * (`apps/web/src/lib/api/media-url.ts`) RECOMPOSE toute adresse dont le chemin
 * commence par la route de flux ou par une clé datée — il en reprend la clé et
 * la repose derrière sa base, ce qui jette `?…` (adresse absolue) ou l'encode
 * dans le chemin (adresse relative). Une route DISTINCTE, qui ne porte ni
 * `/attachments/file/` ni `/AAAA/MM/` en tête, traverse INCHANGÉE les trois
 * résolveurs (web, iOS `MeeshyConfig.resolveMediaURL`, Android
 * `MediaUrlResolver`) : un chemin à barre initiale y est posé derrière
 * l'origine, rien d'autre. Aucun client n'a donc à changer.
 *
 * La clé de stockage est encodée d'UN SEUL coup (`%2F`), comme la route de
 * flux le fait pour ses propres adresses : le dernier segment garde
 * l'extension du fichier, que les lecteurs média lisent.
 *
 * ─── L'ÉCHÉANCE : COURTE, ET STABLE PAR PAS ─────────────────────────────────
 *
 * Une adresse vaut entre {@link READER_FILE_URL_LIFETIME_SECONDS} et cette
 * durée plus un pas ({@link READER_FILE_URL_STEP_SECONDS}) : l'échéance part
 * de la fin du pas en cours. Deux lectures dans le même pas servent donc la
 * MÊME adresse — les caches clients, clés sur l'adresse complète
 * (`DiskCacheStore.fileKey` iOS, seau `medias` du service worker), ne voient
 * pas une adresse neuve à chaque relecture de la liste.
 *
 * L'échéance n'est PAS la garde de lecture : la route rejoue, à chaque requête,
 * la vie du message porteur ET celle de ce lecteur (`readerStillReadsBytes`,
 * #9589). Elle borne ce que vaut une adresse qui a FUI vers un tiers — jamais
 * au-delà de ce que le lecteur lui-même peut encore lire.
 *
 * ─── LA CLÉ ET SA ROTATION ──────────────────────────────────────────────────
 *
 * `ATTACHMENT_URL_SIGNING_KEY` signe et vérifie ; `ATTACHMENT_URL_SIGNING_KEY_PREVIOUS`
 * ne fait que vérifier. Une rotation pose la nouvelle clé en courante, passe
 * l'ancienne en précédente, et retire celle-ci après une durée de vie
 * d'adresse (un pas compris). 32 octets en base64 strict
 * (`openssl rand -base64 32`), distincts par environnement ; une clé absente,
 * malformée ou nulle est IGNORÉE — sans clé courante, rien n'est signé et
 * l'adresse servie reste celle d'avant ce lot. Aucune valeur de clé n'est
 * jamais journalisée.
 *
 * ─── LA BASCULE ─────────────────────────────────────────────────────────────
 *
 * `ATTACHMENT_URL_SIGNATURE_ENFORCE=true` fait REFUSER par la route par chemin
 * l'adresse NON signée d'un contenu protégé. Désactivé par défaut : il ne se
 * pose qu'à zéro usage mesuré de l'ancienne adresse (décision
 * `2026-10-08-un-fichier-protege-se-telecharge-par-une-adresse-signee-pour-son-lecteur-9600.md`).
 */
import { createHmac, timingSafeEqual } from 'crypto';
import { apiPath } from '@meeshy/shared/api/prefix';

import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'ReaderFileSignature' });

export const ATTACHMENT_URL_SIGNING_KEY_ENV = 'ATTACHMENT_URL_SIGNING_KEY';
export const ATTACHMENT_URL_SIGNING_PREVIOUS_KEY_ENV = 'ATTACHMENT_URL_SIGNING_KEY_PREVIOUS';
export const ATTACHMENT_URL_SIGNATURE_ENFORCE_ENV = 'ATTACHMENT_URL_SIGNATURE_ENFORCE';

/** Ce qu'une adresse signée vaut AU MOINS. */
export const READER_FILE_URL_LIFETIME_SECONDS = 6 * 60 * 60;
/** Le pas d'arrondi de l'échéance : l'adresse ne change qu'une fois par pas. */
export const READER_FILE_URL_STEP_SECONDS = 60 * 60;
/** Au-delà, une échéance n'a pas pu être émise par ce serveur. */
const MAX_REMAINING_SECONDS = READER_FILE_URL_LIFETIME_SECONDS + READER_FILE_URL_STEP_SECONDS;

/** La route qui sert une adresse signée — relative au préfixe d'API. */
export const SIGNED_FILE_ROUTE = '/attachments/signed';

const KEY_BYTES = 32;
const KEY_SHAPE = /^[A-Za-z0-9+/]{43}=$/;
const OBJECT_ID = /^[0-9a-f]{24}$/;
const EXPIRY = /^[1-9][0-9]{0,11}$/;
/**
 * Le MAC est TRONQUÉ à 128 bits (RFC 2104 § 5, NIST SP 800-107 § 5.3.4) : le
 * jeton tient ainsi dans un paramètre de route (`maxParamLength` de Fastify,
 * 100 caractères — 83 ici). 128 bits restent hors de portée d'une forge en
 * ligne, seule attaque possible contre une clé que le client ne voit jamais.
 */
const MAC_BYTES = 16;
const MAC = /^[A-Za-z0-9_-]{22}$/;
const DOMAIN = 'meeshy:attachment-file:v1';

export type SigningKeys = { readonly current: Buffer | null; readonly previous: Buffer | null };

type Env = Readonly<Record<string, string | undefined>>;

function parseKey(raw: string | undefined): Buffer | null {
  const value = raw?.trim();
  if (!value || !KEY_SHAPE.test(value)) return null;
  const key = Buffer.from(value, 'base64');
  if (key.length !== KEY_BYTES || key.every((byte) => byte === 0)) return null;
  return key;
}

export function readSigningKeys(env: Env = process.env): SigningKeys {
  return {
    current: parseKey(env[ATTACHMENT_URL_SIGNING_KEY_ENV]),
    previous: parseKey(env[ATTACHMENT_URL_SIGNING_PREVIOUS_KEY_ENV]),
  };
}

let enforcementWithoutKeyReported = false;

/**
 * Vrai au seul mot `true` : une bascule de refus ne s'active pas par accident.
 *
 * Et seulement avec une clé COURANTE lisible (audit #9600, L1-C) : sans elle
 * rien n'est signé, et imposer la signature refuserait tout média protégé à
 * tous ses lecteurs. Refuser de démarrer couperait toute la passerelle pour une
 * variable ; la bascule est donc IGNORÉE, et le défaut journalisé en erreur une
 * fois par processus — l'adresse nue reste servie, mesurée, comme avant.
 */
export function readerFileSignatureEnforced(env: Env = process.env): boolean {
  if (env[ATTACHMENT_URL_SIGNATURE_ENFORCE_ENV]?.trim().toLowerCase() !== 'true') return false;
  if (readSigningKeys(env).current !== null) return true;
  if (!enforcementWithoutKeyReported) {
    enforcementWithoutKeyReported = true;
    log.error(
      `${ATTACHMENT_URL_SIGNATURE_ENFORCE_ENV}=true is IGNORED: ${ATTACHMENT_URL_SIGNING_KEY_ENV} is missing or unreadable, nothing is signed, enforcing would refuse every protected file`
    );
  }
  return false;
}

export type ReaderFileGrant = {
  readonly storageKey: string;
  readonly attachmentId: string;
  readonly readerParticipantId: string;
};

export type ReaderFileUrlSigner = {
  /** L'adresse RELATIVE signée — le client la pose derrière son origine. */
  readonly sign: (grant: ReaderFileGrant) => string;
};

/** Le MAC sous sa forme CANONIQUE (base64url) : la comparaison porte sur la chaîne, aucune autre écriture des mêmes bits n'est admise. */
function mac(key: Buffer, grant: ReaderFileGrant, expiresAtSeconds: string): string {
  return createHmac('sha256', key)
    .update([DOMAIN, grant.storageKey, grant.attachmentId, grant.readerParticipantId, expiresAtSeconds].join('\n'))
    .digest()
    .subarray(0, MAC_BYTES)
    .toString('base64url');
}

function expiryFor(now: Date): number {
  const nextStep = (Math.floor(now.getTime() / 1000 / READER_FILE_URL_STEP_SECONDS) + 1) * READER_FILE_URL_STEP_SECONDS;
  return nextStep + READER_FILE_URL_LIFETIME_SECONDS;
}

/**
 * Le signataire d'un instant — `null` sans clé courante, et l'appelant sert
 * alors l'adresse telle qu'il la servait avant ce lot.
 */
export function readerFileUrlSigner(input: { readonly keys: SigningKeys; readonly now: Date }): ReaderFileUrlSigner | null {
  const key = input.keys.current;
  if (!key) return null;
  const expiresAt = String(expiryFor(input.now));
  return {
    sign: (grant) => {
      const signature = mac(key, grant, expiresAt);
      const token = [grant.attachmentId, grant.readerParticipantId, expiresAt, signature].join('.');
      return apiPath(`${SIGNED_FILE_ROUTE}/${token}/${encodeURIComponent(grant.storageKey)}`);
    },
  };
}

/**
 * Une clé POSÉE mais illisible désarme la signature sans bruit : la passerelle
 * le dit, une fois par processus et par variable, sans jamais citer la valeur.
 */
const misconfigurationReported = new Set<string>();

function reportUnreadableKeys(env: Env, keys: SigningKeys): void {
  const unreadable = [
    [ATTACHMENT_URL_SIGNING_KEY_ENV, keys.current],
    [ATTACHMENT_URL_SIGNING_PREVIOUS_KEY_ENV, keys.previous],
  ] as const;
  unreadable
    .filter(([name, key]) => key === null && (env[name]?.trim() ?? '') !== '' && !misconfigurationReported.has(name))
    .forEach(([name]) => {
      misconfigurationReported.add(name);
      log.error(`${name} is set but is not 32 non-zero bytes of strict base64 — reader-signed file addresses are disabled for it`);
    });
}

export function readerFileUrlSignerFromEnv(now: Date, env: Env = process.env): ReaderFileUrlSigner | null {
  const keys = readSigningKeys(env);
  reportUnreadableKeys(env, keys);
  return readerFileUrlSigner({ keys, now });
}

export type ReaderFileTokenCheck =
  | { readonly kind: 'valid'; readonly attachmentId: string; readonly readerParticipantId: string }
  | { readonly kind: 'invalid'; readonly reason: 'malformed' | 'no-key' | 'mismatch' | 'expired' | 'beyond-lifetime' };

const sameMac = (expected: string, given: string): boolean => {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Vérifie le jeton d'une adresse signée contre la clé de stockage RÉSOLUE par
 * la route. Le MAC se compare avant l'échéance : une échéance réécrite est une
 * falsification, pas une adresse périmée.
 */
export function checkReaderFileToken(input: {
  readonly token: string;
  readonly storageKey: string;
  readonly keys: SigningKeys;
  readonly now: Date;
}): ReaderFileTokenCheck {
  const parts = input.token.split('.');
  if (parts.length !== 4) return { kind: 'invalid', reason: 'malformed' };
  const [attachmentId, readerParticipantId, expiresAt, signature] = parts as [string, string, string, string];
  if (!OBJECT_ID.test(attachmentId) || !OBJECT_ID.test(readerParticipantId) || !EXPIRY.test(expiresAt) || !MAC.test(signature)) {
    return { kind: 'invalid', reason: 'malformed' };
  }

  const keys = [input.keys.current, input.keys.previous].filter((key): key is Buffer => key !== null);
  if (keys.length === 0) return { kind: 'invalid', reason: 'no-key' };

  const grant = { storageKey: input.storageKey, attachmentId, readerParticipantId };
  if (!keys.some((key) => sameMac(mac(key, grant, expiresAt), signature))) return { kind: 'invalid', reason: 'mismatch' };

  const remaining = Number(expiresAt) - Math.floor(input.now.getTime() / 1000);
  if (remaining <= 0) return { kind: 'invalid', reason: 'expired' };
  if (remaining > MAX_REMAINING_SECONDS) return { kind: 'invalid', reason: 'beyond-lifetime' };
  return { kind: 'valid', attachmentId, readerParticipantId };
}
