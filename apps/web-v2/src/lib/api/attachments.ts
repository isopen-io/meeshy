import type { ConversationsDeps } from './conversations';
import { uploadedAttachmentsOf } from './fixtures';
import type { ApiResult } from './http';
import type { Attachment } from './types';

/**
 * LE PORT DE L'UPLOAD (#5668, § 0 de la spécification) — **PAS**
 * `POST /conversations/:id/messages` (qui ne consomme que des
 * `attachmentIds` déjà obtenus, `messages.ts`), mais
 * `POST /api/v1/attachments/upload`
 * (`services/gateway/src/routes/attachments/upload.ts:59-207`,
 * `consumes: ['multipart/form-data']`) : les octets partent AVANT, sur cette
 * route-ci.
 *
 * FORME multipart EXACTE que la passerelle lit (`upload.ts:128-151`) : un
 * champ `files` par fichier (`part.type === 'file'`), et un champ
 * `metadata_<i>` (JSON, `i` = rang du fichier dans l'ordre d'ajout) — ce lot
 * n'y pose que `duration` (ms), pour un vocal (`upload.ts:146`,
 * `UploadProcessor.ts:744-745`). Miroir `apps/web/services/attachmentService.ts:53-76`.
 *
 * `uploadMultiple` AVALE les échecs PAR FICHIER (`UploadProcessor.ts:744-751`)
 * — un fichier au MIME refusé (#5615) disparaît de la réponse SOUS
 * `success: true`. Ce port ne réconcilie PAS lui-même (c'est
 * `send/perform-send.ts` qui compare `attachments.length` au nombre de
 * fichiers envoyés, § 0 « UPLOAD_PARTIAL ») : il rend la réponse telle quelle.
 */
export type PendingUpload = {
  readonly file: File;
  /** Millisecondes — posé seulement pour un enregistrement vocal
   * (`use-recorder.ts`). */
  readonly durationMs?: number;
  /** `PendingAttachment.localId` (`send/attachments.ts`) — REÇU quand
   * l'appelant en a un (défaut 7, revue #5668), pour que le repli
   * `fixtures` réutilise l'URL d'aperçu déjà créée (`previewUrlFor`)
   * plutôt que d'en fabriquer une troisième pour le même fichier. Sans
   * effet sur le port réel : `formDataOf` ne le sert jamais au fil. */
  readonly localId?: string;
};

function formDataOf(pending: readonly PendingUpload[]): FormData {
  const form = new FormData();
  pending.forEach((p, index) => {
    form.append('files', p.file, p.file.name);
    if (p.durationMs !== undefined) {
      form.append(`metadata_${index}`, JSON.stringify({ duration: p.durationMs }));
    }
  });
  return form;
}

/**
 * LE DÉLAI D'UN TÉLÉVERSEMENT SE COMPTE EN OCTETS, PAS EN LATENCE
 * (revue-correction #5668) — `DEFAULT_TIMEOUT_MS` (15 s, `http.ts`) est
 * arbitré contre le p95 d'un appel JSON. Le profil réseau que ce dépôt
 * budgète (Fast 3G, `budgets.json § network_note`) monte à ~400 kbit/s : une
 * photo de 4 Mo demande ~80 s, une de 10 Mo ~200 s. Sous les 15 s du défaut,
 * AUCUN envoi de photo n'aboutissait sur ce profil — et l'échec se lisait
 * « la passerelle n'a pas répondu », qui accuse le serveur d'une horloge
 * cliente. Le plafond retenu couvre `SMALL_FILE_THRESHOLD` (50 Mo,
 * `attachment.ts:487`, la borne au-delà de laquelle c'est TUS qui doit
 * porter) à ce débit-là, avec une marge : 50 Mo / 400 kbit/s ≈ 1000 s.
 * Ce n'est PAS « pas de délai » : une connexion morte doit toujours finir par
 * rendre la main à « Réessayer ».
 */
const UPLOAD_TIMEOUT_MS = 1_200_000;

export async function uploadAttachments(
  params: ConversationsDeps & { readonly pending: readonly PendingUpload[]; readonly signal?: AbortSignal },
): Promise<ApiResult<{ readonly attachments: readonly Attachment[] }>> {
  if (params.pending.length === 0) return { ok: true, data: { attachments: [] } };

  if (__FIXTURES__ && params.source === 'fixtures') {
    return { ok: true, data: { attachments: uploadedAttachmentsOf(params.pending) } };
  }

  return params.transport.request<{ readonly attachments: readonly Attachment[] }>({
    method: 'POST',
    path: '/api/v1/attachments/upload',
    body: formDataOf(params.pending),
    timeoutMs: UPLOAD_TIMEOUT_MS,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
}

/**
 * QUI A OUVERT / TÉLÉCHARGÉ / ÉCOUTÉ / REGARDÉ UNE PIÈCE (#7226, W7) —
 * `GET /api/v1/attachments/:id/status-details`
 * (`services/gateway/src/routes/messages-reads.ts:570-634`). L'enveloppe
 * pose `pagination` À LA RACINE (`sendPaginatedSuccess`), PAS dans `data` —
 * `data` EST le tableau (`statusDetails.statuses`), contrairement à
 * `fetchMessageReceiptsPeople` (§ `receipts.ts`) dont la pagination vit dans
 * `data.pagination`. Deux routes, deux conventions ; ce port SUIT chacune,
 * il n'en invente pas une troisième commune.
 *
 * Forme d'une ligne — miroir EXACT de `getAttachmentStatusDetails`
 * (`services/gateway/src/services/MessageReadStatusService.ts:2271-2305`) :
 * `viewCount` compte les ouvertures d'une IMAGE, `downloadedAt` un
 * téléchargement (générique, tous types de pièce).
 */
export type AttachmentStatusRow = {
  readonly participantId: string;
  readonly username: string;
  readonly avatar?: string | null;
  readonly viewedAt: string | null;
  readonly downloadedAt: string | null;
  readonly listenedAt: string | null;
  readonly watchedAt: string | null;
  readonly listenCount: number;
  readonly watchCount: number;
  readonly listenedComplete: boolean;
  readonly watchedComplete: boolean;
  readonly lastPlayPositionMs: number | null;
  readonly lastWatchPositionMs: number | null;
  readonly viewCount: number;
  readonly viewedLanguages: readonly string[];
};

export const attachmentStatusDetailsQueryKey = (attachmentId: string) =>
  ['attachment-status-details', attachmentId] as const;

/**
 * DÉTERMINISTE, DÉRIVÉE DE L'IDENTIFIANT (#7226) — pas de corpus « qui a
 * consommé cette pièce » sous fixtures ; un seed tiré des caractères de
 * `attachmentId` (même motif que `waveformOf`, `lib/view/message.ts:103`)
 * fait varier ouvertures/téléchargements/position d'une pièce à l'autre
 * SANS jamais changer d'un rendu au suivant.
 */
function attachmentStatusFixtureOf(attachmentId: string): readonly AttachmentStatusRow[] {
  const seed = [...attachmentId].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) % 9973, 7);
  const complete = seed % 2 === 0;
  const positionMs = complete ? null : 4_000 + (seed % 20_000);
  const count = 1 + (seed % 3);
  const base = Date.UTC(2026, 8, 21, 10, 5, 0);
  return [
    {
      participantId: `fx-participant-${seed}`,
      username: 'Alice',
      avatar: null,
      viewedAt: seed % 4 === 0 ? new Date(base).toISOString() : null,
      downloadedAt: seed % 5 === 0 ? new Date(base + 1_000).toISOString() : null,
      listenedAt: new Date(base + 2_000).toISOString(),
      watchedAt: new Date(base + 2_000).toISOString(),
      listenCount: count,
      watchCount: count,
      listenedComplete: complete,
      watchedComplete: complete,
      lastPlayPositionMs: positionMs,
      lastWatchPositionMs: positionMs,
      viewCount: seed % 4,
      viewedLanguages: [],
    },
  ];
}

export async function fetchAttachmentStatusDetails(
  params: ConversationsDeps & {
    readonly attachmentId: string;
    readonly offset?: number;
    readonly limit?: number;
    readonly filter?: 'all' | 'viewed' | 'downloaded' | 'listened' | 'watched';
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<readonly AttachmentStatusRow[]>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const statuses = attachmentStatusFixtureOf(params.attachmentId);
    return { ok: true, data: statuses, pagination: { total: statuses.length, limit: 20, offset: 0, hasMore: false } };
  }
  // Même raison que `fetchMessageReceiptsPeople` : les agrégats « ouvertures »
  // et « téléchargements » se SOMMENT sur les lignes servies, donc une page de
  // vingt (le défaut de la route, `messages-reads.ts:585`) donnerait un total
  // FAUX dès le vingt-et-unième consommateur. 100 est le plafond de la route
  // (`validatePagination(…, { maxLimit: 100 })`).
  const query = new URLSearchParams({
    ...(params.offset !== undefined ? { offset: String(params.offset) } : {}),
    limit: String(params.limit ?? 100),
    ...(params.filter !== undefined ? { filter: params.filter } : {}),
  });
  const search = query.toString();
  return params.transport.request<readonly AttachmentStatusRow[]>({
    method: 'GET',
    path: `/api/v1/attachments/${params.attachmentId}/status-details${search.length > 0 ? `?${search}` : ''}`,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
}
