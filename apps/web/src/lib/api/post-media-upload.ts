import * as uploadsEndpoints from '@meeshy/shared/api/endpoints/uploads';

import { anySignal, timeoutSignal } from './abort';
import type { DataSource } from './config';
import { credentialHeaders, type ApiFailure, type ApiResult, type Credential } from './http';
import {
  backgroundFetchIdOf,
  defaultBackgroundUploadPort,
  documentVisibility,
  type BackgroundUploadPort,
  type PageVisibility,
} from './tus-background';
import {
  TUS_CHECKPOINT_MAX_AGE_MS,
  claimTusLease,
  idbTusCheckpointStore,
  tusFingerprint,
  type TusCheckpointStore,
  type TusFinishedMedia,
} from './tus-checkpoint';

/**
 * LE CLIENT TUS D'UN `PostMedia` (#6900, § 1.5 de la spécification) — le
 * MÊME protocole que `TusUploadManager.swift` (`:180-196`, `:288-520`,
 * `:520-582`) : `POST uploads.root` (201 + `Location`), `PATCH` par
 * tranches (`Upload-Offset`), `HEAD` pour se réaligner sur un 409, une
 * nouvelle création sur un 404/410. Sans rafraîchissement de jeton (web-v2
 * n'en a aucun).
 *
 * **La reprise SURVIT à un rechargement (#11311).** Un checkpoint IndexedDB
 * (`tus-checkpoint.ts` : adresse de session, offset accepté, empreinte du
 * fichier) est écrit après la création puis après chaque tranche ; un envoi du
 * même fichier, d'une autre page, relit l'offset du SERVEUR (`HEAD`) et repart de
 * là au lieu de recréer une session. Une panne réseau ou une annulation GARDE le
 * checkpoint, un refus définitif de la passerelle le PURGE.
 *
 * **Page à l'arrière-plan en plein envoi : le reste part dans le navigateur.**
 * Là où Background Fetch existe (Chrome, PWA Chromium — DEC-WEB, #11253), la
 * tranche en vol est annulée, l'offset relu, et UN `PATCH` du reste est confié
 * au navigateur (`tus-background.ts`) ; le service worker range l'accusé sur le
 * checkpoint (`public/sw-background-upload.js`) et la page qui revient le rend
 * sans réseau. Safari et la WebView de la coque restent au premier plan.
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
  /** Où l'envoi inscrit sa progression pour reprendre après un rechargement : IndexedDB par défaut,
   * `null` pour ne rien retenir. Injecté par les témoins. */
  readonly checkpoints?: TusCheckpointStore | null;
  /** L'horloge de la durée de vie du checkpoint — injectée par les témoins. */
  readonly now?: () => number;
  /** L'envoi de fond (Background Fetch) : résolu depuis le navigateur par défaut, `null` là où il n'existe pas
   * (Safari, WebView Android). Sans checkpoint, il n'est jamais utilisé. */
  readonly background?: BackgroundUploadPort | null;
  /** Le passage de la page à l'arrière-plan — `document` par défaut, injecté par les témoins. */
  readonly visibility?: PageVisibility;
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

const UPLOADS_PATH = uploadsEndpoints.root;
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
  const deadline = timeoutSignal(TUS_REQUEST_TIMEOUT_MS);
  const signal = params.signal === undefined ? deadline : anySignal([params.signal, deadline]);
  try {
    const response = await (params.fetchImpl ?? fetch)(url, { ...init, signal });
    return { kind: 'response', response };
  } catch (error) {
    if (params.signal?.aborted === true) return { kind: 'failure', failure: failure(0, 'Téléversement annulé', 'ABORTED') };
    if (deadline.aborted) return { kind: 'failure', failure: failure(0, 'La passerelle n’a pas répondu', 'TIMEOUT') };
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

/** `Location` — absolue ou relative (`uploads.byWildcard(<id>)`) selon que
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

  const store = params.checkpoints === undefined ? idbTusCheckpointStore() : params.checkpoints;
  const fingerprint = tusFingerprint(params);
  const release = store === null ? null : claimTusLease(fingerprint);
  const checkpoints = release === null ? null : store;
  try {
    const result = await transmit(params, credential, { checkpoints, fingerprint });
    if (checkpoints !== null && settlesCheckpoint(result)) await checkpoints.remove(fingerprint);
    return result;
  } finally {
    release?.();
  }
}

type CheckpointContext = { readonly checkpoints: TusCheckpointStore | null; readonly fingerprint: string };

/** Ce qui rend un checkpoint inutile : l'envoi est fini, tous ses octets sont partis, ou la passerelle a refusé
 * pour de bon (4xx hors authentification, délai et débit). Une panne réseau, une annulation, un 5xx ou un jeton
 * absent le GARDENT — c'est tout le but de la reprise. */
function settlesCheckpoint(result: ApiResult<PostMediaUploadResult>): boolean {
  if (result.ok) return true;
  const { status } = result;
  return (status >= 200 && status < 300) || isDefinitiveRefusal(status);
}

const isDefinitiveRefusal = (status: number): boolean => status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429;

type Resumed =
  | { readonly kind: 'session'; readonly location: string; readonly offset: number }
  | { readonly kind: 'finished'; readonly media: TusFinishedMedia }
  | { readonly kind: 'failure'; readonly failure: ApiFailure };

/** La session d'un envoi précédent du même fichier, relue côté serveur — le checkpoint n'est qu'un REPÈRE, l'offset
 * de la passerelle fait foi. `null` : repartir d'une session neuve (checkpoint périmé, d'une autre taille, déjà
 * entièrement envoyé, ou session oubliée du serveur). Un `HEAD` en panne rend la panne et GARDE le checkpoint.
 * Un envoi de fond qui a fini pendant l'absence rend son média ; un qui tourne encore est attendu (une fois). */
async function resumedSession(
  params: PostMediaUploadParams,
  credential: Credential,
  context: CheckpointContext & { readonly checkpoints: TusCheckpointStore; readonly background: BackgroundUploadPort | null },
  waited = false,
): Promise<Resumed | null> {
  const { checkpoints, fingerprint, background } = context;
  const total = params.file.size;
  const found = await checkpoints.find(fingerprint);
  if (found === null) return null;
  const age = (params.now ?? Date.now)() - found.savedAt;
  if (age > TUS_CHECKPOINT_MAX_AGE_MS) {
    await checkpoints.remove(fingerprint);
    return null;
  }
  if (found.finished !== undefined) return { kind: 'finished', media: found.finished };
  if (found.background !== undefined && background !== null && !waited && (await background.isRunning(fingerprint))) {
    await background.settled(fingerprint, params.signal);
    if (params.signal?.aborted === true) return { kind: 'failure', failure: failure(0, 'Téléversement annulé', 'ABORTED') };
    return resumedSession(params, credential, context, true);
  }
  if (found.fileSize !== total || found.offset >= total) {
    await checkpoints.remove(fingerprint);
    return null;
  }
  const location = resolvedLocation(found.location, params.base);
  const head = await exchange(location, { method: 'HEAD', headers: { ...credentialHeaders(credential), 'Tus-Resumable': TUS_RESUMABLE } }, params);
  if (head.kind === 'failure') return { kind: 'failure', failure: head.failure };
  const { response } = head;
  if (response.status === 200) {
    const served = offsetOf(response);
    if (served !== null && served < total) return { kind: 'session', location, offset: served };
    await checkpoints.remove(fingerprint);
    return null;
  }
  if (!isDefinitiveRefusal(response.status)) return { kind: 'failure', failure: await refusal(response) };
  await checkpoints.remove(fingerprint);
  return null;
}

type Handoff =
  | { readonly kind: 'finished'; readonly media: TusFinishedMedia }
  | { readonly kind: 'foreground'; readonly offset: number }
  | { readonly kind: 'failure'; readonly failure: ApiFailure };

/** La page vient de passer à l'arrière-plan : relit l'offset du serveur, confie le RESTE du fichier au navigateur,
 * puis attend le service worker. Le marqueur de fond est posé sur le checkpoint AVANT l'inscription, pour que le
 * worker, qui peut finir avant le retour de `start`, trouve une ligne à mettre à jour — et rien ne l'écrase après. */
async function handOffToBackground(args: {
  readonly params: PostMediaUploadParams;
  readonly port: BackgroundUploadPort;
  readonly checkpoints: TusCheckpointStore;
  readonly fingerprint: string;
  readonly location: string;
  readonly offset: number;
  readonly remember: (location: string, offset: number, background?: string) => Promise<void>;
}): Promise<Handoff> {
  const { params, port, checkpoints, fingerprint, location, remember } = args;
  const live = params.credential();
  if (live === null) return { kind: 'failure', failure: failure(401, 'Authentification requise', 'UNAUTHORIZED') };
  const head = await exchange(location, { method: 'HEAD', headers: { ...credentialHeaders(live), 'Tus-Resumable': TUS_RESUMABLE } }, params);
  if (head.kind === 'failure') return { kind: 'failure', failure: head.failure };
  const served = head.response.status === 200 ? offsetOf(head.response) : null;
  if (served === null || served >= params.file.size) return { kind: 'foreground', offset: args.offset };

  await remember(location, served, backgroundFetchIdOf(fingerprint));
  const started = await port.start({
    fingerprint,
    location,
    offset: served,
    file: params.file,
    title: `Meeshy · ${params.file.name}`,
    headers: {
      ...credentialHeaders(live),
      'Tus-Resumable': TUS_RESUMABLE,
      'Content-Type': 'application/offset+octet-stream',
      'Upload-Offset': String(served),
    },
  });
  if (!started) {
    await remember(location, served);
    return { kind: 'foreground', offset: served };
  }
  await port.settled(fingerprint, params.signal);
  if (params.signal?.aborted === true) return { kind: 'failure', failure: failure(0, 'Téléversement annulé', 'ABORTED') };
  const settled = await checkpoints.find(fingerprint);
  return settled?.finished === undefined ? { kind: 'foreground', offset: served } : { kind: 'finished', media: settled.finished };
}

async function transmit(
  params: PostMediaUploadParams,
  credential: Credential,
  context: CheckpointContext,
): Promise<ApiResult<PostMediaUploadResult>> {
  const total = params.file.size;
  const chunkSize = Math.max(1, params.chunkSize ?? WEB_TUS_CHUNK_BYTES);
  const { checkpoints, fingerprint } = context;
  const remember = (location: string, offset: number, background?: string): Promise<void> =>
    checkpoints === null
      ? Promise.resolve()
      : checkpoints.save({ location, offset, fileSize: total, fingerprint, savedAt: (params.now ?? Date.now)(), ...(background !== undefined ? { background } : {}) });
  const port = checkpoints === null ? null : params.background === undefined ? await defaultBackgroundUploadPort() : params.background;

  const resumed = checkpoints === null ? null : await resumedSession(params, credential, { checkpoints, fingerprint, background: port });
  if (resumed?.kind === 'failure') return resumed.failure;
  if (resumed?.kind === 'finished') return { ok: true, data: resumed.media };
  const created = resumed === null ? await createUpload(params, credential) : resumed.location;
  if (typeof created !== 'string') return created;

  let location = created;
  let offset = resumed === null ? 0 : resumed.offset;
  if (resumed === null) await remember(location, 0);
  let realignments = 0;
  let restarted = false;

  /* La page cachée annule la tranche EN VOL (jamais l'envoi) : `wire` porte ce signal en plus de celui de
     l'appelant. Une annulation de l'APPELANT reste une annulation. */
  const hidden = new AbortController();
  let backgrounded = false;
  let wire: PostMediaUploadParams = params.signal === undefined ? { ...params, signal: hidden.signal } : { ...params, signal: anySignal([params.signal, hidden.signal]) };
  const stopWatching =
    port === null
      ? () => undefined
      : (params.visibility ?? documentVisibility).onHidden(() => {
          backgrounded = true;
          hidden.abort();
        });

  try {
    while (offset < total) {
      const end = Math.min(offset + chunkSize, total);
      /* L'IDENTITÉ EST RELUE À CHAQUE TRANCHE, ET SON ABSENCE ARRÊTE TOUT (#9743) —
         une tranche ne part jamais sans jeton, ni après la sortie de son auteur. */
      const live = params.credential();
      if (live === null) return failure(401, 'Authentification requise', 'UNAUTHORIZED');
      const patched = await exchange(
        location,
        {
          method: 'PATCH',
          headers: {
            ...credentialHeaders(live),
            'Tus-Resumable': TUS_RESUMABLE,
            'Content-Type': 'application/offset+octet-stream',
            'Upload-Offset': String(offset),
          },
          body: params.file.slice(offset, end),
        },
        wire,
      );
      if (patched.kind === 'failure') {
        if (!backgrounded || params.signal?.aborted === true || port === null || checkpoints === null) return patched.failure;
        const handoff = await handOffToBackground({ params, port, checkpoints, fingerprint, location, offset, remember });
        if (handoff.kind === 'failure') return handoff.failure;
        if (handoff.kind === 'finished') return { ok: true, data: handoff.media };
        stopWatching();
        backgrounded = false;
        wire = params;
        offset = handoff.offset;
        continue;
      }
      const { response } = patched;

      if (response.status === 200 || response.status === 204) {
        const next = offsetOf(response) ?? end;
        params.onProgress?.(Math.min(1, next / total));
        if (next >= total) {
          const media = await finishedMedia(response);
          return media === null ? failure(response.status, 'Réponse de fin de téléversement illisible', 'TUS_FINISH_UNREADABLE') : { ok: true, data: media };
        }
        offset = next;
        await remember(location, offset);
        continue;
      }

      if (response.status === 409) {
        realignments += 1;
        if (realignments > MAX_OFFSET_REALIGNMENTS) return refusal(response);
        const relive = params.credential();
        if (relive === null) return failure(401, 'Authentification requise', 'UNAUTHORIZED');
        const head = await exchange(location, { method: 'HEAD', headers: { ...credentialHeaders(relive), 'Tus-Resumable': TUS_RESUMABLE } }, wire);
        if (head.kind === 'failure') return head.failure;
        const served = head.response.status === 200 ? offsetOf(head.response) : null;
        if (served === null) return failure(409, 'Décalage serveur illisible', 'TUS_OFFSET_UNKNOWN');
        offset = served;
        await remember(location, offset);
        continue;
      }

      if (response.status === 404 || response.status === 410) {
        if (restarted) return failure(response.status, 'Session de téléversement perdue', 'TUS_SESSION_LOST');
        restarted = true;
        const again = params.credential();
        if (again === null || again.kind !== credential.kind) return failure(401, 'Authentification requise', 'UNAUTHORIZED');
        const recreated = await createUpload(wire, again);
        if (typeof recreated !== 'string') return recreated;
        location = recreated;
        offset = 0;
        await remember(location, 0);
        continue;
      }

      return refusal(response);
    }

    return failure(0, 'Téléversement inachevé', 'TUS_UNFINISHED');
  } finally {
    stopWatching();
  }
}
