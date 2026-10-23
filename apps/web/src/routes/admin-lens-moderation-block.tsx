import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { parseLens } from '@meeshy/shared/types/lens-format';

import { AdminSkeleton } from '@/components/admin/states';
import type { ConversationsDeps } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import {
  LENS_PENDING_QUERY_KEY,
  LENS_PUBLISHED_QUERY_KEY,
  LENS_WITHDRAWN_QUERY_KEY,
  loadLensDocument,
  loadLensPending,
  loadPublishedLenses,
  loadWithdrawnLenses,
  restoreLens,
  reviewLens,
  withdrawLens,
  type LensPack,
  type LensReview,
} from '@/lib/api/lens-packs';
import type { AdminLanguage } from '@/lib/i18n-admin-catalog';
import { lensModerationText } from '@/lib/lens-packs/moderation-texts';
import { lensReviewRefusalOf, reviewOfApproval, type ApprovalForm, type LensReviewRefusal } from '@/lib/lens-packs/review-form';

/**
 * **LA MODÉRATION DES LENS** (W16, #11322) — sous l'écran des signalements,
 * monté pour `canModerateContent` seulement (la passerelle garde les mêmes
 * routes, fail-closed). La file (`GET /packs/lens/pending`), le document servi
 * (`GET /packs/lens/:slug/document`, relu par `parseLens`), publier en fixant
 * la fenêtre et les communautés ou refuser avec un mot
 * (`POST /packs/lens/:slug/review`), et retirer une lens publiée
 * (`POST /packs/lens/:slug/withdraw`), puis la rétablir (`POST
 * /packs/lens/:slug/restore`, #12321) depuis la liste des retirées (`GET
 * /packs/lens/withdrawn`, la plus récente d'abord, avec sa note). Ses installations
 * retirées ne reviennent pas, et l'écran le dit. Chaque geste est journalisé par la
 * passerelle avant d'agir (famille « Packs » du journal). Le géo-créneau, le
 * prix et le crédit n'existent pas ici (#11251).
 */
const INK2 = 'var(--color-ios-ink-2)';

type Outcome = {
  readonly slug: string;
  readonly done?: 'approved' | 'rejected' | 'withdrawn' | 'restored';
  readonly refusal?: LensReviewRefusal | 'invalid';
  readonly restoring?: true;
};

function DocumentSummary({ language, deps, slug }: { readonly language: AdminLanguage; readonly deps: ConversationsDeps; readonly slug: string }) {
  const query = useQuery({
    queryKey: ['admin', 'lens', 'document', slug],
    queryFn: async () => {
      const result = await loadLensDocument(deps, slug);
      if (!result.ok) throw new Error(result.error);
      return parseLens(result.data);
    },
    retry: false,
  });
  if (query.isPending) return null;
  const parsed = query.data;
  if (parsed === undefined || parsed.status !== 'ok') {
    return (
      <p data-lens-document-summary="unreadable" className="text-caption" style={{ color: 'var(--color-error)' }}>
        {lensModerationText(language, 'documentUnreadable')}
      </p>
    );
  }
  const { lens } = parsed;
  return (
    <p data-lens-document-summary="ok" className="text-caption" style={{ color: INK2 }}>
      {lensModerationText(language, 'documentSummary', {
        layers: String(lens.layers.length),
        kinds: [...new Set(lens.layers.map((layer) => layer.kind))].join(', '),
        triggers: String(lens.triggers.length),
        surfaces: lens.surfaces.join(', '),
      })}
    </p>
  );
}

const EMPTY_FORM: ApprovalForm = { startsAt: '', endsAt: '', communities: '', note: '' };

function PendingRow({
  language,
  deps,
  pack,
  busy,
  outcome,
  onReview,
}: {
  readonly language: AdminLanguage;
  readonly deps: ConversationsDeps;
  readonly pack: LensPack;
  readonly busy: boolean;
  readonly outcome: Outcome | null;
  readonly onReview: (review: LensReview | null) => void;
}) {
  const [form, setForm] = useState<ApprovalForm>(EMPTY_FORM);
  const [showDocument, setShowDocument] = useState(false);
  const field = (key: keyof ApprovalForm, type: string) => (
    <label className="grid gap-1 text-caption">
      <span style={{ color: INK2 }}>{lensModerationText(language, `field.${key}`)}</span>
      <input
        name={key}
        type={type}
        value={form[key]}
        onInput={(event) => setForm({ ...form, [key]: event.currentTarget.value })}
        className="min-h-11 rounded-lg px-3"
        style={{ backgroundColor: 'var(--color-ios-fill)' }}
      />
    </label>
  );
  return (
    <li data-lens-pending={pack.slug} className="grid gap-2 rounded-2xl p-3" style={{ backgroundColor: 'var(--color-ios-card)' }}>
      <div className="grid gap-0.5">
        <span className="font-semibold">{pack.name}</span>
        <span className="text-caption" style={{ color: INK2 }}>
          {[lensModerationText(language, 'by', { author: pack.author }), ...(pack.cost === null ? [] : [lensModerationText(language, 'cost', { cost: pack.cost })])].join(' · ')}
        </span>
      </div>
      {showDocument ? (
        <DocumentSummary language={language} deps={deps} slug={pack.slug} />
      ) : (
        <button type="button" data-lens-document-open={pack.slug} onClick={() => setShowDocument(true)} className="min-h-11 justify-self-start rounded-full px-4" style={{ backgroundColor: 'var(--color-ios-fill)' }}>
          {lensModerationText(language, 'document')}
        </button>
      )}
      {field('startsAt', 'datetime-local')}
      {field('endsAt', 'datetime-local')}
      {field('communities', 'text')}
      {field('note', 'text')}
      {outcome?.refusal === undefined ? null : (
        <p role="alert" data-lens-refusal={outcome.refusal} className="text-caption" style={{ color: 'var(--color-error)' }}>
          {lensModerationText(language, outcome.refusal === 'invalid' ? 'invalid' : `refusal.${outcome.refusal}`)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-lens-approve={pack.slug}
          disabled={busy}
          onClick={() => {
            const approval = reviewOfApproval(form);
            onReview(approval.ok ? approval.review : null);
          }}
          className="min-h-11 rounded-full px-4 font-semibold"
          style={{ backgroundColor: 'var(--accent, var(--color-ios-brand))', color: 'var(--color-ios-on-brand)' }}
        >
          {lensModerationText(language, 'approve')}
        </button>
        <button
          type="button"
          data-lens-reject={pack.slug}
          disabled={busy}
          onClick={() => onReview({ decision: 'reject', ...(form.note.trim() === '' ? {} : { note: form.note.trim() }) })}
          className="min-h-11 rounded-full px-4"
          style={{ backgroundColor: 'var(--color-ios-fill)' }}
        >
          {lensModerationText(language, 'reject')}
        </button>
      </div>
    </li>
  );
}

export function AdminLensModerationPanel({ language, deps }: { readonly language: AdminLanguage; readonly deps: ConversationsDeps }) {
  const queryClient = useQueryClient();
  const pending = useQuery({
    queryKey: LENS_PENDING_QUERY_KEY,
    queryFn: async () => {
      const result = await loadLensPending(deps);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    retry: false,
  });
  const published = useQuery({
    queryKey: LENS_PUBLISHED_QUERY_KEY,
    queryFn: async () => {
      const result = await loadPublishedLenses(deps);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    retry: false,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [notes, setNotes] = useState<Readonly<Record<string, string>>>({});
  const withdrawn = useQuery({
    queryKey: LENS_WITHDRAWN_QUERY_KEY,
    queryFn: async () => {
      const result = await loadWithdrawnLenses(deps);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    retry: false,
  });

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: LENS_PENDING_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: LENS_PUBLISHED_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: LENS_WITHDRAWN_QUERY_KEY });
  };

  const review = async (slug: string, decision: LensReview | null): Promise<void> => {
    if (decision === null) {
      setOutcome({ slug, refusal: 'invalid' });
      return;
    }
    setBusy(slug);
    const result = await reviewLens(deps, slug, decision);
    setBusy(null);
    if (!result.ok) {
      setOutcome({ slug, refusal: lensReviewRefusalOf(result) });
      return;
    }
    setOutcome({ slug, done: decision.decision === 'approve' ? 'approved' : 'rejected' });
    refresh();
  };

  const withdraw = async (slug: string): Promise<void> => {
    setBusy(slug);
    const result = await withdrawLens(deps, slug, notes[slug]);
    setBusy(null);
    if (!result.ok) {
      setOutcome({ slug, refusal: lensReviewRefusalOf(result) });
      return;
    }
    setOutcome({ slug, done: 'withdrawn' });
    refresh();
  };

  const restore = async (slug: string): Promise<void> => {
    setBusy(slug);
    const result = await restoreLens(deps, slug, notes[slug]);
    setBusy(null);
    if (!result.ok) {
      setOutcome({ slug, refusal: lensReviewRefusalOf(result), restoring: true });
      return;
    }
    setOutcome({ slug, done: 'restored' });
    refresh();
  };

  if (pending.isPending) return <AdminSkeleton rows={3} language={language} />;
  if (pending.isError) {
    return (
      <p role="alert" data-lens-moderation-error>
        {lensModerationText(language, 'load.failed')}
      </p>
    );
  }

  return (
    <div className="grid gap-4" data-lens-moderation>
      {outcome?.done === undefined ? null : (
        <p role="status" data-lens-done={outcome.done} className="text-caption">
          {lensModerationText(language, `done.${outcome.done}`)}
        </p>
      )}
      <section aria-label={lensModerationText(language, 'pending')} className="grid gap-2">
        <h3 className="text-body font-semibold">{lensModerationText(language, 'pending')}</h3>
        {pending.data.length === 0 ? (
          <p data-lens-pending-empty style={{ color: INK2 }}>
            {lensModerationText(language, 'pendingEmpty')}
          </p>
        ) : (
          <ul className="grid gap-2">
            {pending.data.map((pack) => (
              <PendingRow
                key={pack.slug}
                language={language}
                deps={deps}
                pack={pack}
                busy={busy === pack.slug}
                outcome={outcome?.slug === pack.slug ? outcome : null}
                onReview={(decision) => void review(pack.slug, decision)}
              />
            ))}
          </ul>
        )}
      </section>
      <section aria-label={lensModerationText(language, 'published')} className="grid gap-2">
        <h3 className="text-body font-semibold">{lensModerationText(language, 'published')}</h3>
        {(published.data ?? []).length === 0 ? (
          <p data-lens-published-empty style={{ color: INK2 }}>
            {lensModerationText(language, 'publishedEmpty')}
          </p>
        ) : (
          <ul className="grid gap-2">
            {(published.data ?? []).map((pack) => (
              <li key={pack.slug} data-lens-published={pack.slug} className="grid gap-2 rounded-2xl p-3" style={{ backgroundColor: 'var(--color-ios-card)' }}>
                <span className="font-semibold">{pack.name}</span>
                {outcome?.slug === pack.slug && outcome.restoring === undefined && outcome.refusal !== undefined && outcome.refusal !== 'invalid' ? (
                  <p role="alert" data-lens-refusal={outcome.refusal} className="text-caption" style={{ color: 'var(--color-error)' }}>
                    {lensModerationText(language, `refusal.${outcome.refusal}`)}
                  </p>
                ) : null}
                <label className="grid gap-1 text-caption">
                  <span style={{ color: INK2 }}>{lensModerationText(language, 'field.note')}</span>
                  <input
                    name="note"
                    value={notes[pack.slug] ?? ''}
                    onInput={(event) => setNotes({ ...notes, [pack.slug]: event.currentTarget.value })}
                    className="min-h-11 rounded-lg px-3"
                    style={{ backgroundColor: 'var(--color-ios-fill)' }}
                  />
                </label>
                <button
                  type="button"
                  data-lens-withdraw={pack.slug}
                  disabled={busy === pack.slug}
                  onClick={() => void withdraw(pack.slug)}
                  className="min-h-11 justify-self-start rounded-full px-4"
                  style={{ backgroundColor: 'var(--color-ios-fill)' }}
                >
                  {lensModerationText(language, 'withdraw')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label={lensModerationText(language, 'withdrawn')} className="grid gap-2">
        <h3 className="text-body font-semibold">{lensModerationText(language, 'withdrawn')}</h3>
        <p data-lens-withdrawn-hint className="text-caption" style={{ color: INK2 }}>
          {lensModerationText(language, 'withdrawnHint')}
        </p>
        {withdrawn.isError ? (
          <p role="alert" data-lens-withdrawn-error>
            {lensModerationText(language, 'load.failed')}
          </p>
        ) : (withdrawn.data ?? []).length === 0 ? (
          withdrawn.isPending ? null : (
            <p data-lens-withdrawn-empty style={{ color: INK2 }}>
              {lensModerationText(language, 'withdrawnEmpty')}
            </p>
          )
        ) : (
          <ul className="grid gap-2">
            {(withdrawn.data ?? []).map((pack) => (
              <li key={pack.slug} data-lens-withdrawn={pack.slug} className="grid gap-2 rounded-2xl p-3" style={{ backgroundColor: 'var(--color-ios-card)' }}>
                <span className="font-semibold">{pack.name}</span>
                {pack.reviewNote === null ? null : (
                  <span className="text-caption" style={{ color: INK2 }}>
                    {lensModerationText(language, 'withdrawnNote', { note: pack.reviewNote })}
                  </span>
                )}
                {outcome?.slug === pack.slug && outcome.restoring === true && outcome.refusal !== undefined && outcome.refusal !== 'invalid' ? (
                  <p role="alert" data-lens-refusal={outcome.refusal} className="text-caption" style={{ color: 'var(--color-error)' }}>
                    {lensModerationText(language, `refusal.${outcome.refusal}`)}
                  </p>
                ) : null}
                <button
                  type="button"
                  data-lens-restore={pack.slug}
                  disabled={busy === pack.slug}
                  onClick={() => void restore(pack.slug)}
                  className="min-h-11 justify-self-start rounded-full px-4"
                  style={{ backgroundColor: 'var(--color-ios-fill)' }}
                >
                  {lensModerationText(language, 'restore')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function AdminLensModerationBlock({ language }: { readonly language: AdminLanguage }) {
  return (
    <section aria-labelledby="lens-moderation-title" className="grid gap-4" data-admin-lens-moderation-block>
      <div className="grid gap-1">
        <h2 id="lens-moderation-title" className="text-title font-semibold">
          {lensModerationText(language, 'title')}
        </h2>
        <p className="text-caption" style={{ color: INK2 }}>
          {lensModerationText(language, 'hint')}
        </p>
      </div>
      <AdminLensModerationPanel language={language} deps={apiDeps} />
    </section>
  );
}
