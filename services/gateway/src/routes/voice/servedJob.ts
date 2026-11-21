import { AudioTranslateError } from '../../services/AudioTranslateService';

export type ServedVoiceJob = {
  readonly jobId: string;
  readonly status?: string;
  readonly progress?: number;
  readonly currentStep?: string;
  readonly createdAt?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly result?: Record<string, unknown>;
  readonly error?: string;
};

export type CancelOutcome =
  | { readonly kind: 'cancelled'; readonly served: { readonly jobId: string; readonly status: 'cancelled' } }
  | { readonly kind: 'not-cancellable'; readonly message: string };

const SERVED_FIELDS = [
  ['status', 'status', 'string'],
  ['progress', 'progress', 'number'],
  ['currentStep', 'current_step', 'string'],
  ['createdAt', 'created_at', 'string'],
  ['startedAt', 'started_at', 'string'],
  ['completedAt', 'completed_at', 'string'],
  ['result', 'result', 'object'],
  ['error', 'error', 'string'],
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasType = (value: unknown, type: 'string' | 'number' | 'object'): boolean =>
  type === 'object' ? isRecord(value) : typeof value === type;

export function toServedJob(raw: unknown, requestedJobId: string): ServedVoiceJob {
  const view = isRecord(raw) ? raw : {};
  const jobId = typeof view.id === 'string' && view.id ? view.id : requestedJobId;
  const fields = Object.fromEntries(
    SERVED_FIELDS
      .filter(([, source, type]) => hasType(view[source], type))
      .map(([target, source]) => [target, view[source]])
  );
  return { jobId, ...fields };
}

export function toCancelOutcome(raw: unknown, jobId: string): CancelOutcome {
  const view = isRecord(raw) ? raw : {};
  if (view.success === true) {
    return { kind: 'cancelled', served: { jobId, status: 'cancelled' } };
  }
  const message = typeof view.message === 'string' && view.message ? view.message : 'Job cannot be cancelled';
  return { kind: 'not-cancellable', message };
}

export const isTranslatorNotFound = (error: unknown): boolean =>
  error instanceof AudioTranslateError && error.code === 'NOT_FOUND';
