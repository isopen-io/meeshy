import { uploadAttachments, uploadShortfall, type PendingUpload } from '@/lib/api/attachments';
import type { ApiFailure } from '@/lib/api/http';

import type { SendDeps } from './perform-send';
import { transferFraction } from './send-progress';
import { DIRECT_UPLOAD_LIMITS, uploadBatchesOf, type UploadBatch } from './upload-batches';

export type UploadOutcome =
  | { readonly ok: true; readonly ids: readonly string[] }
  | { readonly ok: false; readonly failure: ApiFailure };

/**
 * LE TÉLÉVERSEMENT D'UN ENVOI (#16134) — sans `deps.transfer`, UNE requête
 * multipart, comme avant. Avec lui, les lots de `uploadBatchesOf` (la même
 * règle que le partage, #12974) : un fichier lourd part par la REPRISE et
 * rapporte sa fraction tranche par tranche ; un lot direct vaut 1 à son
 * accusé. La fraction du message pondère chaque fichier par son poids et
 * s'inscrit sous le `clientMessageId` de CE message.
 */
export async function uploadPending(params: {
  readonly deps: SendDeps;
  readonly pending: readonly PendingUpload[];
  readonly clientMessageId: string;
}): Promise<UploadOutcome> {
  const { deps, pending, clientMessageId } = params;
  const transfer = deps.transfer;
  if (transfer === undefined) return directBatch(deps, pending);

  const sizes = pending.map((piece) => piece.file.size);
  const fractions = pending.map(() => 0);
  const publish = (index: number, fraction: number): void => {
    fractions[index] = fraction;
    transfer.progress.getState().report(clientMessageId, transferFraction(sizes, fractions));
  };
  const resumable =
    transfer.resumable ??
    (async (piece) => {
      const { uploadMessageAttachment } = await import('@/lib/api/post-media-upload');
      return uploadMessageAttachment({ ...transfer.media, ...piece, ...(transfer.checkpoints === undefined ? {} : { checkpoints: transfer.checkpoints }) });
    });

  const ids: string[] = [];
  for (const batch of uploadBatchesOf(sizes, transfer.limits ?? DIRECT_UPLOAD_LIMITS)) {
    const sent = await sendBatch({ deps, pending, batch, resumable, publish });
    if (!sent.ok) return sent;
    ids.push(...sent.ids);
  }
  return { ok: true, ids };
}

async function directBatch(deps: SendDeps, pending: readonly PendingUpload[]): Promise<UploadOutcome> {
  const result = await uploadAttachments({ source: deps.source, transport: deps.transport, pending });
  const failure = uploadShortfall(pending.map((piece) => piece.file), result);
  if (failure !== null) return { ok: false, failure };
  if (!result.ok) return { ok: false, failure: result };
  return { ok: true, ids: result.data.attachments.map((attachment) => attachment.id) };
}

async function sendBatch(params: {
  readonly deps: SendDeps;
  readonly pending: readonly PendingUpload[];
  readonly batch: UploadBatch;
  readonly resumable: NonNullable<NonNullable<SendDeps['transfer']>['resumable']>;
  readonly publish: (index: number, fraction: number) => void;
}): Promise<UploadOutcome> {
  const { deps, pending, batch, resumable, publish } = params;
  if (batch.kind === 'resumable') {
    const piece = pending[batch.index];
    if (piece === undefined) return { ok: false, failure: { ok: false, status: 0, error: 'Fichier introuvable' } };
    const sent = await resumable({ file: piece.file, onProgress: (fraction) => publish(batch.index, fraction) });
    if (!sent.ok) return { ok: false, failure: sent };
    publish(batch.index, 1);
    return { ok: true, ids: [sent.data.attachmentId] };
  }
  const slice = batch.indexes.flatMap((index) => (pending[index] === undefined ? [] : [pending[index]!]));
  const sent = await directBatch(deps, slice);
  if (sent.ok) batch.indexes.forEach((index) => publish(index, 1));
  return sent;
}
