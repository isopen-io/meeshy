import { TUS_CHUNK_SIZE } from '@meeshy/shared/types/attachment';

import type { ApiFailure, ApiResult, Credential } from './http';

/**
 * LE CLIENT TUS D'UN `PostMedia` (#6900, § 1.5 de la spécification) — le
 * MÊME protocole que `TusUploadManager.swift` (`:180-196`, `:288-520`,
 * `:520-582`), sans checkpoint disque (§1.5 « Adapté » : la reprise ne
 * survit pas à un rechargement de page, question 9.5) ni rafraîchissement de
 * jeton (web-v2 n'en a aucun : un 401 vide la session au lieu d'être rejoué,
 * `client.ts#onUnauthorized`).
 *
 * `uploadPostMedia` ne CRÉE de `PostMedia` que pour un contexte de
 * `{post, story, status, comment}` — `isPostMediaUploadContext`,
 * `packages/shared/types/attachment.ts:477-480` — jamais pour un
 * `MessageAttachment` (`lib/api/attachments.ts`, une route DISTINCTE).
 *
 * Rend un `ApiResult` — jamais une exception : un appelant qui déballe lui
 * garde le contrat de tout le reste de `lib/api/*` (`http.ts`).
 */
export type PostMediaUploadContext = 'post' | 'story' | 'status' | 'comment';

export type PostMediaUploadResult = {
  readonly postMediaId: string;
  readonly fileUrl: string;
  readonly mimeType: string;
  readonly thumbHash?: string;
};

export type PostMediaUploadParams = {
  readonly base: string;
  readonly credential: () => Credential | null;
  readonly file: File;
  readonly uploadContext: PostMediaUploadContext;
  /** Une empreinte CLIENTE (`thumbhash`, `tus-handler.ts:457-465`) — servie
   * seulement quand l'appelant en tient déjà une ; le serveur en génère une
   * sinon (`:466-472`). */
  readonly thumbHash?: string;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
  /** Injectée par les témoins — `TUS_CHUNK_SIZE` (10 Mo) en production :
   * jamais de fichier de test à cette taille. */
  readonly chunkSize?: number;
};

const UPLOADS_PATH = '/api/v1/uploads';
const TUS_RESUMABLE = '1.0.0';
/** Reprises sur 409/404/410 avant d'abandonner — une seule boucle bornée,
 * jamais un `while(true)` : un double-diagnostic serveur incohérent (offset
 * qui ne progresse jamais) doit rendre la main plutôt que tourner sans fin. */
const MAX_RECOVERY_ATTEMPTS = 8;

function credentialHeaders(credential: Credential | null): Record<string, string> {
  if (credential === null) return {};
  return credential.kind === 'registered'
    ? { Authorization: `Bearer ${credential.token}` }
    : { 'X-Session-Token': credential.sessionToken };
}

/** `btoa` suffit — nom de fichier, MIME et contexte sont des ASCII imprimables ;
 * un nom de fichier porteur d'UTF-8 est BORNÉ par le navigateur (`File.name`
 * décodé), jamais un octet brut que `btoa` refuserait. */
function base64(value: string): string {
  if (typeof btoa === 'function') return btoa(value);
  return Buffer.from(value, 'utf-8').toString('base64');
}

/** `Upload-Metadata` — `clé valeur_base64` séparés par des virgules
 * (`tus-handler.ts` lit `filename`, `filetype`, `uploadcontext`, `thumbhash`). */
function uploadMetadataHeader(params: {
  readonly filename: string;
  readonly filetype: string;
  readonly uploadcontext: string;
  readonly thumbhash?: string;
}): string {
  const pairs: Array<readonly [string, string]> = [
    ['filename', params.filename],
    ['filetype', params.filetype],
    ['uploadcontext', params.uploadcontext],
  ];
  if (params.thumbhash !== undefined) pairs.push(['thumbhash', params.thumbhash]);
  return pairs.map(([key, value]) => `${key} ${base64(value)}`).join(',');
}

function failure(status: number, error: string, code?: string): ApiFailure {
  return { ok: false, status, error, ...(code !== undefined ? { code } : {}) };
}

async function textOf(response: Response): Promise<string> {
  try {
    return (await response.text()).trim();
  } catch {
    return '';
  }
}

function offsetHeaderOf(response: Response, fallback: number): number {
  const raw = response.headers.get('Upload-Offset');
  const parsed = raw === null ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** `Location` — absolue (`https://…`) ou relative (`/api/v1/uploads/<id>`,
 * la forme que `@tus/server` rend quand la requête n'a pas d'hôte de
 * confiance) : les deux formes existent selon le déploiement, jamais
 * devinée. */
function resolvedLocation(location: string, base: string): string {
  if (/^https?:\/\//i.test(location)) return location;
  return `${base}${location.startsWith('/') ? '' : '/'}${location}`;
}

type CreatedUpload = { readonly location: string };

async function createUpload(
  params: PostMediaUploadParams,
  fetchImpl: typeof fetch,
): Promise<CreatedUpload | ApiFailure> {
  const headers: Record<string, string> = {
    ...credentialHeaders(params.credential()),
    'Tus-Resumable': TUS_RESUMABLE,
    'Upload-Length': String(params.file.size),
    'Upload-Metadata': uploadMetadataHeader({
      filename: params.file.name,
      filetype: params.file.type !== '' ? params.file.type : 'application/octet-stream',
      uploadcontext: params.uploadContext,
      ...(params.thumbHash !== undefined ? { thumbhash: params.thumbHash } : {}),
    }),
  };
  const response = await fetchImpl(`${params.base}${UPLOADS_PATH}`, {
    method: 'POST',
    headers,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (response.status !== 201) {
    return failure(response.status, (await textOf(response)) || `Erreur ${response.status}`);
  }
  const location = response.headers.get('Location');
  if (location === null || location === '') {
    return failure(response.status, 'Réponse de téléversement invalide');
  }
  return { location: resolvedLocation(location, params.base) };
}

async function headOffset(
  location: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<number | null> {
  const response = await fetchImpl(location, { method: 'HEAD', headers: { ...headers, 'Tus-Resumable': TUS_RESUMABLE } });
  if (response.status !== 200) return null;
  const raw = response.headers.get('Upload-Offset');
  const parsed = raw === null ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

type AttachmentEnvelope = {
  readonly success?: boolean;
  readonly data?: { readonly attachment?: Record<string, unknown> };
};

function resultOfFinalResponse(payload: unknown): PostMediaUploadResult | null {
  const envelope = payload as AttachmentEnvelope;
  if (envelope?.success !== true) return null;
  const attachment = envelope.data?.attachment;
  if (attachment === undefined) return null;
  const id = attachment.id;
  const fileUrl = attachment.fileUrl;
  const mimeType = attachment.mimeType;
  if (typeof id !== 'string' || typeof fileUrl !== 'string' || typeof mimeType !== 'string') return null;
  const thumbHash = attachment.thumbHash;
  return {
    postMediaId: id,
    fileUrl,
    mimeType,
    ...(typeof thumbHash === 'string' && thumbHash !== '' ? { thumbHash } : {}),
  };
}

export async function uploadPostMedia(params: PostMediaUploadParams): Promise<ApiResult<PostMediaUploadResult>> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const chunkSize = params.chunkSize ?? TUS_CHUNK_SIZE;
  const total = params.file.size;

  let created = await createUpload(params, fetchImpl);
  if ('ok' in created) return created;
  let location = created.location;

  const bytes = new Uint8Array(await params.file.arrayBuffer());
  let offset = 0;
  let recoveries = 0;

  // Un fichier VIDE n'a aucune tranche à envoyer : `onUploadFinish` ne
  // s'exécute jamais côté serveur (le protocole TUS ne le prévoit pas), donc
  // ce cas n'a pas d'accusé à attendre — refusé plutôt que de boucler.
  if (total === 0) return failure(0, 'Fichier vide');

  while (offset < total) {
    const headers = credentialHeaders(params.credential());
    const end = Math.min(offset + chunkSize, total);
    const chunk = bytes.subarray(offset, end);
    const response = await fetchImpl(location, {
      method: 'PATCH',
      headers: {
        ...headers,
        'Tus-Resumable': TUS_RESUMABLE,
        'Content-Type': 'application/offset+octet-stream',
        'Upload-Offset': String(offset),
      },
      body: chunk,
      ...(params.signal !== undefined ? { signal: params.signal } : {}),
    });

    if (response.status === 200 || response.status === 204) {
      const nextOffset = offsetHeaderOf(response, end);
      if (nextOffset >= total) {
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          payload = undefined;
        }
        const result = resultOfFinalResponse(payload);
        if (result === null) return failure(response.status, 'Réponse de téléversement invalide');
        return { ok: true, data: result };
      }
      offset = nextOffset;
      continue;
    }

    if (response.status === 409) {
      recoveries += 1;
      if (recoveries > MAX_RECOVERY_ATTEMPTS) return failure(409, (await textOf(response)) || 'Décalage refusé');
      const serverOffset = await headOffset(location, headers, fetchImpl);
      if (serverOffset === null) return failure(409, (await textOf(response)) || 'Décalage refusé');
      offset = serverOffset;
      continue;
    }

    if (response.status === 404 || response.status === 410) {
      recoveries += 1;
      if (recoveries > MAX_RECOVERY_ATTEMPTS) return failure(response.status, (await textOf(response)) || 'Session de téléversement expirée');
      created = await createUpload(params, fetchImpl);
      if ('ok' in created) return created;
      location = created.location;
      offset = 0;
      continue;
    }

    return failure(response.status, (await textOf(response)) || `Erreur ${response.status}`);
  }

  return failure(0, 'Téléversement inachevé');
}
