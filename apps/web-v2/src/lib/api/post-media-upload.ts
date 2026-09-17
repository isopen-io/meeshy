import type { DataSource } from './config';
import { credentialHeaders, type ApiFailure, type ApiResult, type Credential } from './http';

/**
 * LE CLIENT TUS D'UN `PostMedia` (#6900, § 1.5 de la spécification) — le
 * MÊME protocole que `TusUploadManager.swift` (`:180-196`, `:288-520`,
 * `:520-582`) : `POST /api/v1/uploads` (201 + `Location`), `PATCH` par
 * tranches (`Upload-Offset`), `HEAD` pour se réaligner sur un 409, une
 * nouvelle création sur un 404/410. Sans checkpoint disque (question 9.5 : la
 * reprise ne survit pas à un rechargement de page) ni rafraîchissement de
 * jeton (web-v2 n'en a aucun).
 *
 * Ne CRÉE de `PostMedia` que pour un contexte `{post, story, status, comment}`
 * — `isPostMediaUploadContext`, `packages/shared/types/attachment.ts:477-480` —
 * jamais un `MessageAttachment` (`lib/api/attachments.ts`, route DISTINCTE).
 *
 * **Rend un `ApiResult`, et ne REJETTE JAMAIS** — réseau coupé, annulation,
 * délai dépassé, nom de fichier non ASCII : chaque panne est une VALEUR. Un
 * appelant qui attend l'accusé (la publication, § 1.4) ne peut pas rester
 * suspendu sur une promesse rejetée que personne n'a attrapée.
 *
 * Chargé en `import()` par le studio à la PREMIÈRE sélection de fichier
 * (chunk `post_media_upload`, `budgets.json`) : l'écran s'ouvre sans lui.
 */
export type PostMediaUploadContext = 'post' | 'story' | 'status' | 'comment';

export type PostMediaUploadResult = {
  readonly postMediaId: string;
  readonly fileUrl: string;
  readonly mimeType: string;
  readonly thumbHash?: string;
};

export type PostMediaUploadDeps = {
  readonly source: DataSource;
  readonly base: string;
  readonly credential: () => Credential | null;
  readonly fetchImpl?: typeof fetch;
};

export type PostMediaUploadParams = PostMediaUploadDeps & {
  readonly file: File;
  readonly uploadContext: PostMediaUploadContext;
  /** Une empreinte CLIENTE (`thumbhash`, `tus-handler.ts:457-465`) — servie
   * seulement quand l'appelant en tient déjà une ; la passerelle en génère une
   * sinon (`:466-472`). */
  readonly thumbHash?: string;
  readonly signal?: AbortSignal;
  /** Fraction envoyée, de 0 à 1 — rappelée après chaque tranche acceptée. */
  readonly onProgress?: (fraction: number) => void;
  /** Injectée par les témoins ; `WEB_TUS_CHUNK_BYTES` en production. */
  readonly chunkSize?: number;
};

/**
 * LA TRANCHE WEB — 2 Mio, pas les 10 Mo de `TUS_CHUNK_SIZE` (calibrés pour
 * `URLSession`, question 9.6). Chaque requête a son propre délai de garde
 * (`TUS_REQUEST_TIMEOUT_MS`) : sur le profil que ce dépôt budgète (Fast 3G,
 * ~400 kbit/s, `budgets.json § network`), 10 Mo demandent ~200 s — au-delà du
 * délai, donc un échec systématique —, 2 Mio ~40 s. Seule la tranche EN VOL
 * est lue en mémoire (`File.slice`), jamais le fichier entier : une vidéo de
 * plusieurs centaines de mégaoctets ne tient pas dans une WebView Android.
 */
export const WEB_TUS_CHUNK_BYTES = 2 * 1024 * 1024;
export const TUS_REQUEST_TIMEOUT_MS = 120_000;

const UPLOADS_PATH = '/api/v1/uploads';
const TUS_RESUMABLE = '1.0.0';
/** Réalignements sur 409 avant d'abandonner — une boucle BORNÉE : un serveur
 * dont l'offset ne progresse jamais rend la main plutôt que de tourner. */
const MAX_OFFSET_REALIGNMENTS = 8;

function failure(status: number, error: string, code?: string): ApiFailure {
  return { ok: false, status, error, ...(code !== undefined ? { code } : {}) };
}

/** UTF-8 → base64, la forme que `@tus/utils` DÉCODE (`Metadata.js:35`,
 * `Buffer.from(value, 'base64').toString('utf8')`). `btoa` seul encode du
 * Latin-1 — « été.jpg » arriverait mutilé — et LÈVE sur tout caractère
 * au-delà de U+00FF (un nom de fichier en arabe, l'une des sept langues). */
function base64Utf8(value: string): string {
  const binary = Array.from(new TextEncoder().encode(value), (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary);
}

function uploadMetadataHeader(entries: ReadonlyArray<readonly [string, string]>): string {
  return entries.map(([key, value]) => `${key} ${base64Utf8(value)}`).join(',');
}

type Exchange = { readonly kind: 'response'; readonly response: Response } | { readonly kind: 'failure'; readonly failure: ApiFailure };

/** Un aller-retour, jamais une exception : le signal de l'appelant COMPOSÉ au
 * délai de garde (motif `http.ts#composeSignal`), la cause lue sur l'état des
 * signaux sources après coup. */
async function exchange(
  url: string,
  init: RequestInit,
  params: Pick<PostMediaUploadParams, 'signal' | 'fetchImpl'>,
): Promise<Exchange> {
  const timeoutSignal = AbortSignal.timeout(TUS_REQUEST_TIMEOUT_MS);
  const signal = params.signal === undefined ? timeoutSignal : AbortSignal.any([params.signal, timeoutSignal]);
  try {
    const response = await (params.fetchImpl ?? fetch)(url, { ...init, signal });
    return { kind: 'response', response };
  } catch (error) {
    if (params.signal?.aborted === true) return { kind: 'failure', failure: failure(0, 'Téléversement annulé', 'ABORTED') };
    if (timeoutSignal.aborted) return { kind: 'failure', failure: failure(0, 'La passerelle n’a pas répondu', 'TIMEOUT') };
    const message = error instanceof Error ? error.message : 'Réseau indisponible';
    return { kind: 'failure', failure: failure(0, message, 'NETWORK') };
  }
}

async function textOf(response: Response): Promise<string> {
  try {
    return (await response.text()).trim();
  } catch {
    return '';
  }
}

async function refusal(response: Response): Promise<ApiFailure> {
  return failure(response.status, (await textOf(response)) || `Erreur ${response.status}`);
}

function offsetOf(response: Response): number | null {
  const raw = response.headers.get('Upload-Offset');
  const parsed = raw === null || raw === '' ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** `Location` — absolue ou relative (`/api/v1/uploads/<id>`) selon que
 * `@tus/server` a reçu un hôte de confiance (`respectForwardedHeaders`). */
function resolvedLocation(location: string, base: string): string {
  if (/^https?:\/\//i.test(location)) return location;
  return `${base}${location.startsWith('/') ? '' : '/'}${location}`;
}

async function createUpload(params: PostMediaUploadParams, credential: Credential): Promise<string | ApiFailure> {
  const entries: Array<readonly [string, string]> = [
    ['filename', params.file.name],
    ['filetype', params.file.type !== '' ? params.file.type : 'application/octet-stream'],
    ['uploadcontext', params.uploadContext],
    ...(params.thumbHash !== undefined ? [['thumbhash', params.thumbHash] as const] : []),
  ];
  const created = await exchange(
    `${params.base}${UPLOADS_PATH}`,
    {
      method: 'POST',
      headers: {
        ...credentialHeaders(credential),
        'Tus-Resumable': TUS_RESUMABLE,
        'Upload-Length': String(params.file.size),
        'Upload-Metadata': uploadMetadataHeader(entries),
      },
    },
    params,
  );
  if (created.kind === 'failure') return created.failure;
  if (created.response.status !== 201) return refusal(created.response);
  const location = created.response.headers.get('Location');
  if (location === null || location === '') return failure(201, 'Réponse de téléversement sans Location', 'TUS_NO_LOCATION');
  return resolvedLocation(location, params.base);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Le corps de la DERNIÈRE tranche (`tus-handler.ts:612-652`), narrowé champ
 * par champ — jamais un résultat inventé depuis une réponse partielle. */
async function finishedMedia(response: Response): Promise<PostMediaUploadResult | null> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return null;
  }
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) return null;
  const attachment = payload.data.attachment;
  if (!isRecord(attachment)) return null;
  const { id, fileUrl, mimeType, thumbHash } = attachment;
  if (typeof id !== 'string' || id === '' || typeof fileUrl !== 'string' || typeof mimeType !== 'string') return null;
  return { postMediaId: id, fileUrl, mimeType, ...(typeof thumbHash === 'string' && thumbHash !== '' ? { thumbHash } : {}) };
}

let fixtureUploads = 0;

export async function uploadPostMedia(params: PostMediaUploadParams): Promise<ApiResult<PostMediaUploadResult>> {
  const total = params.file.size;
  if (total === 0) return failure(400, 'Fichier vide', 'EMPTY_FILE');

  // Les fixtures miment l'ACCUSÉ de `tus-handler.ts:612-652` sans session ni
  // réseau — comme tous les ports de `lib/api/*` sous cette source.
  if (__FIXTURES__ && params.source === 'fixtures') {
    fixtureUploads += 1;
    params.onProgress?.(1);
    return {
      ok: true,
      data: { postMediaId: `fx-pm-${fixtureUploads}`, fileUrl: `fixtures/${params.file.name}`, mimeType: params.file.type },
    };
  }

  const credential = params.credential();
  if (credential === null) return failure(401, 'Authentification requise', 'UNAUTHORIZED');
  if (credential.kind === 'anonymous') {
    return failure(403, 'Post media upload requires an identifiable registered account', 'POST_MEDIA_REQUIRES_ACCOUNT');
  }

  const chunkSize = Math.max(1, params.chunkSize ?? WEB_TUS_CHUNK_BYTES);
  const created = await createUpload(params, credential);
  if (typeof created !== 'string') return created;

  let location = created;
  let offset = 0;
  let realignments = 0;
  let restarted = false;

  while (offset < total) {
    const end = Math.min(offset + chunkSize, total);
    const patched = await exchange(
      location,
      {
        method: 'PATCH',
        headers: {
          ...credentialHeaders(params.credential()),
          'Tus-Resumable': TUS_RESUMABLE,
          'Content-Type': 'application/offset+octet-stream',
          'Upload-Offset': String(offset),
        },
        body: params.file.slice(offset, end),
      },
      params,
    );
    if (patched.kind === 'failure') return patched.failure;
    const { response } = patched;

    if (response.status === 200 || response.status === 204) {
      const next = offsetOf(response) ?? end;
      params.onProgress?.(Math.min(1, next / total));
      if (next >= total) {
        const media = await finishedMedia(response);
        return media === null ? failure(response.status, 'Réponse de fin de téléversement illisible', 'TUS_FINISH_UNREADABLE') : { ok: true, data: media };
      }
      offset = next;
      continue;
    }

    if (response.status === 409) {
      realignments += 1;
      if (realignments > MAX_OFFSET_REALIGNMENTS) return refusal(response);
      const head = await exchange(
        location,
        { method: 'HEAD', headers: { ...credentialHeaders(params.credential()), 'Tus-Resumable': TUS_RESUMABLE } },
        params,
      );
      if (head.kind === 'failure') return head.failure;
      const served = head.response.status === 200 ? offsetOf(head.response) : null;
      if (served === null) return failure(409, 'Décalage serveur illisible', 'TUS_OFFSET_UNKNOWN');
      offset = served;
      continue;
    }

    if (response.status === 404 || response.status === 410) {
      if (restarted) return failure(response.status, 'Session de téléversement perdue', 'TUS_SESSION_LOST');
      restarted = true;
      const recreated = await createUpload(params, credential);
      if (typeof recreated !== 'string') return recreated;
      location = recreated;
      offset = 0;
      continue;
    }

    return refusal(response);
  }

  return failure(0, 'Téléversement inachevé', 'TUS_UNFINISHED');
}
