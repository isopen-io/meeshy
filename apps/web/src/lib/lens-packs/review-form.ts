import type { ApiFailure } from '@/lib/api/http';
import type { LensReview } from '@/lib/api/lens-packs';

/**
 * **PUBLIER UNE LENS EN FIXANT SA FENÊTRE ET SES COMMUNAUTÉS** (W16, #11322) —
 * loi pure. Le serveur accepte `window: { startsAt, endsAt }` entière (instants
 * ISO) et `communities` (identifiants de 24 caractères hexadécimaux) ; à
 * défaut, celles du document valent. Les dates se saisissent en UTC. Le
 * géo-créneau, le prix et le crédit n'existent pas ici (#11251).
 */
export type ApprovalForm = { readonly startsAt: string; readonly endsAt: string; readonly communities: string; readonly note: string };

const COMMUNITY = /^[0-9a-f]{24}$/;

const instantOf = (local: string): string | null => {
  const date = new Date(`${local}:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : `${date.toISOString().slice(0, 19)}Z`;
};

export function reviewOfApproval(form: ApprovalForm): { readonly ok: true; readonly review: LensReview } | { readonly ok: false } {
  const start = form.startsAt.trim();
  const end = form.endsAt.trim();
  if ((start === '') !== (end === '')) return { ok: false };
  const startsAt = start === '' ? null : instantOf(start);
  const endsAt = end === '' ? null : instantOf(end);
  if ((start !== '' && startsAt === null) || (end !== '' && endsAt === null)) return { ok: false };
  if (startsAt !== null && endsAt !== null && startsAt >= endsAt) return { ok: false };
  const communities = form.communities
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== '');
  if (!communities.every((entry) => COMMUNITY.test(entry))) return { ok: false };
  const note = form.note.trim();
  return {
    ok: true,
    review: {
      decision: 'approve',
      ...(note === '' ? {} : { note }),
      ...(startsAt !== null && endsAt !== null ? { window: { startsAt, endsAt } } : {}),
      ...(communities.length > 0 ? { communities } : {}),
    },
  };
}

export type LensReviewRefusal = 'self-review' | 'invalid-window' | 'audit' | 'not-found' | 'forbidden' | 'failed';

export function lensReviewRefusalOf(failure: ApiFailure): LensReviewRefusal {
  if (failure.code === 'LENS_SELF_REVIEW') return 'self-review';
  if (failure.code === 'LENS_INVALID_WINDOW') return 'invalid-window';
  if (failure.code === 'LENS_AUDIT_UNAVAILABLE') return 'audit';
  if (failure.code === 'LENS_NOT_FOUND' || failure.status === 404) return 'not-found';
  if (failure.status === 401 || failure.status === 403) return 'forbidden';
  return 'failed';
}
