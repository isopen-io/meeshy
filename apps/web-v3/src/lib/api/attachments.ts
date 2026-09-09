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
