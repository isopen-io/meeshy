import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { SeasonAppEvent } from '@meeshy/shared/utils/game/season-app-events';

import { AdminBadge } from '@/components/admin/badges';
import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminFormActions, AdminFormError, AdminSelect, AdminTextArea } from '@/components/admin/form';
import { AdminEmptyState, AdminErrorState, AdminSkeleton } from '@/components/admin/states';
import { INK2 } from '@/components/admin/tone';
import { adminMoment } from '@/lib/admin/format';
import { draftOfProposal, editBody, hasIssues, validateDraft, type DraftIssues, type SeasonDraft, ADMIN_SEASON_CALENDAR_QUERY_KEY } from '@/lib/admin/game-season-form';
import type { AdminDeps } from '@/lib/api/admin';
import {
  ADMIN_GAME_SEASONS_QUERY_KEY,
  adminSeasonProposalsQueryKey,
  approveSeasonProposal,
  loadSeasonProposals,
  rejectSeasonProposal,
  type AdminSeasonList,
  type ProposalStatusFilter,
  type SeasonProposal,
} from '@/lib/api/admin-game-seasons';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { appEventFaultText, seasonFailureText } from '@/routes/admin-game-seasons-errors';
import { SeasonFields } from '@/routes/admin-game-seasons-fields';

/**
 * **LES PROPOSITIONS DE L'IA** (#10233) — l'IA propose, un humain valide. Une proposition arrive EN ATTENTE avec ses
 * textes, ses points, l'aperçu de l'événement App Store et ses défauts ; elle est ÉDITABLE (l'humain corrige avant de
 * valider) et n'a que deux gestes : Valider ou Rejeter. RIEN n'est appliqué à la saison sans le clic « Valider » —
 * même les corrections ne partent qu'avec lui.
 */

const NO_ISSUES: DraftIssues = { copyFields: [] };
const FILTERS: readonly ProposalStatusFilter[] = ['pending', 'approved', 'rejected', 'all'];

function AppEventPreview({ language, event, faults }: { readonly language: AdminLanguage; readonly event: SeasonAppEvent | null; readonly faults: readonly string[] }) {
  return (
    <section aria-label={translateAdmin(language, 'admin.gameSeasons.event.title')} data-gameseasons-event className="grid gap-2 rounded-card p-3" style={{ border: '1px solid var(--color-edge)' }}>
      <h4 className="text-body font-semibold">{translateAdmin(language, 'admin.gameSeasons.event.title')}</h4>
      <p className="text-caption" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.gameSeasons.event.note')}
      </p>
      {event === null ? (
        <p className="text-body" data-gameseasons-event-none>
          {translateAdmin(language, 'admin.gameSeasons.event.none')}
        </p>
      ) : (
        <dl className="grid gap-1 text-caption">
          {(
            [
              ['admin.gameSeasons.event.key', event.key],
              ['admin.gameSeasons.event.reference', event.reference_name],
              ['admin.gameSeasons.event.publish', adminMoment(event.publish_start, language)],
              ['admin.gameSeasons.event.start', adminMoment(event.event_start, language)],
              ['admin.gameSeasons.event.end', adminMoment(event.event_end, language)],
              ['admin.gameSeasons.event.deepLink', event.deep_link],
            ] as const
          ).map(([labelKey, value]) => (
            <div key={labelKey} className="flex flex-wrap gap-2">
              <dt style={{ color: INK2 }}>{translateAdmin(language, labelKey)}</dt>
              <dd className="min-w-0 break-words font-medium" dir="ltr">
                {value}
              </dd>
            </div>
          ))}
          <div>
            <dt style={{ color: INK2 }}>{translateAdmin(language, 'admin.gameSeasons.event.localizations')}</dt>
            <dd>
              <ul className="grid gap-1">
                {Object.entries(event.localizations).map(([locale, text]) => (
                  <li key={locale} data-gameseasons-event-locale={locale}>
                    <span className="font-medium" dir="ltr">
                      {locale}
                    </span>{' '}
                    {text.name} · {text.short_description}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
      )}
      {faults.length === 0 ? (
        <p className="text-caption" style={{ color: 'var(--color-success)' }} data-gameseasons-event-nofaults>
          {translateAdmin(language, 'admin.gameSeasons.event.noFaults')}
        </p>
      ) : (
        <div role="alert" data-gameseasons-event-faults>
          <p className="text-caption font-semibold" style={{ color: 'var(--color-danger)' }}>
            {translateAdmin(language, 'admin.gameSeasons.event.faults')}
          </p>
          <ul className="list-disc ps-5 text-caption" style={{ color: 'var(--color-danger)' }}>
            {faults.map((fault) => (
              <li key={fault}>{appEventFaultText(language, fault)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ReviewedSummary({ language, proposal }: { readonly language: AdminLanguage; readonly proposal: SeasonProposal }) {
  return (
    <p className="text-caption" style={{ color: INK2 }} data-gameseasons-reviewed>
      {translateAdmin(language, 'admin.gameSeasons.proposal.reviewedAt', { date: adminMoment(proposal.reviewedAt, language) })}
    </p>
  );
}

function PendingReview({
  language,
  deps,
  proposal,
  list,
}: {
  readonly language: AdminLanguage;
  readonly deps: AdminDeps;
  readonly proposal: SeasonProposal;
  readonly list: AdminSeasonList | undefined;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<SeasonDraft>(() => draftOfProposal(proposal));
  const [shown, setShown] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const issues = shown && list !== undefined ? validateDraft(draft, list.now) : NO_ISSUES;

  const refresh = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ADMIN_GAME_SEASONS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ADMIN_SEASON_CALENDAR_QUERY_KEY }),
    ]);
  };

  const approve = useMutation({
    mutationFn: async (): Promise<void> => {
      if (list === undefined) return;
      setShown(true);
      if (hasIssues(validateDraft(draft, list.now))) {
        setError(translateAdmin(language, 'admin.gameSeasons.fixIssues'));
        return;
      }
      setError('');
      /* Les corrections de l'humain sont celles qui s'écartent de la proposition reçue. */
      const { status: _status, ...body } = editBody(
        { startDay: proposal.startDay, status: 'scheduled', themeKey: proposal.themeKey, stepPoints: proposal.stepPoints, copy: proposal.copy },
        draft,
        list.revision,
      );
      const result = await approveSeasonProposal({ ...deps, id: proposal.id, body });
      if (!result.ok) {
        setError(seasonFailureText(language, result));
        return;
      }
      setDone(translateAdmin(language, 'admin.gameSeasons.proposal.approved', { number: String(result.data.season.number), revision: String(result.data.revision) }));
      await refresh();
    },
  });

  const reject = useMutation({
    mutationFn: async (): Promise<void> => {
      setError('');
      const result = await rejectSeasonProposal({ ...deps, id: proposal.id, reason });
      if (!result.ok) {
        setError(seasonFailureText(language, result));
        return;
      }
      setDone(translateAdmin(language, 'admin.gameSeasons.proposal.rejected'));
      await refresh();
    },
  });

  if (done !== '') {
    return (
      <p role="status" data-gameseasons-proposal-done className="text-body font-medium">
        {done}
      </p>
    );
  }

  const busy = approve.isPending || reject.isPending;
  return (
    <div className="grid gap-4">
      <p className="text-caption font-medium" data-gameseasons-not-applied>
        {translateAdmin(language, 'admin.gameSeasons.proposal.notApplied')}
      </p>
      {list === undefined ? null : (
        <SeasonFields language={language} draft={draft} onDraft={(next) => setDraft({ ...next, status: 'scheduled' })} issues={issues} now={list.now} showStatus={false} idPrefix={`gameseasons-proposal-${proposal.id}`} disabled={busy} />
      )}
      <AppEventPreview language={language} event={proposal.appEvent} faults={proposal.appEventFaults} />
      <AdminFormError text={error} data={{ 'data-gameseasons-error': '' }} />
      <AdminTextArea
        id={`gameseasons-reject-${proposal.id}`}
        label={translateAdmin(language, 'admin.gameSeasons.proposal.rejectReason')}
        value={reason}
        maxLength={280}
        rows={2}
        onValue={setReason}
        data={{ 'data-gameseasons-reject-reason': proposal.id }}
      />
      <AdminFormActions
        language={language}
        secondary={[
          {
            id: 'reject',
            label: translateAdmin(language, reject.isPending ? 'admin.gameSeasons.proposal.rejecting' : 'admin.gameSeasons.proposal.reject'),
            tone: 'danger',
            disabled: busy,
            onClick: () => reject.mutate(),
            data: { 'data-gameseasons-reject': proposal.id },
          },
        ]}
        primary={{
          label: translateAdmin(language, approve.isPending ? 'admin.gameSeasons.proposal.approving' : 'admin.gameSeasons.proposal.approve'),
          busy: approve.isPending,
          disabled: list === undefined || reject.isPending,
          onClick: () => approve.mutate(),
          data: { 'data-gameseasons-approve': proposal.id },
        }}
      />
    </div>
  );
}

function ProposalCard({ language, deps, proposal, list }: { readonly language: AdminLanguage; readonly deps: AdminDeps; readonly proposal: SeasonProposal; readonly list: AdminSeasonList | undefined }) {
  const tone = proposal.status === 'pending' ? 'warning' : proposal.status === 'approved' ? 'success' : 'neutral';
  return (
    <article data-gameseasons-proposal={proposal.id} data-gameseasons-proposal-status={proposal.status} className="grid gap-3 rounded-card p-4" style={{ border: '1px solid var(--color-edge)' }}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-body font-semibold">{translateAdmin(language, 'admin.gameSeasons.proposal.heading', { number: String(proposal.number) })}</h3>
        <AdminBadge tone={tone} anchor={`proposal-${proposal.status}`}>
          {translateAdmin(language, proposal.status === 'pending' ? 'admin.gameSeasons.proposal.badge.pending' : proposal.status === 'approved' ? 'admin.gameSeasons.proposal.badge.approved' : 'admin.gameSeasons.proposal.badge.rejected')}
        </AdminBadge>
      </header>
      <p className="text-caption" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.gameSeasons.proposal.createdAt', { date: adminMoment(proposal.createdAt, language) })}
        {proposal.model === null ? '' : ` · ${translateAdmin(language, 'admin.gameSeasons.proposal.model', { model: proposal.model })}`}
      </p>
      {proposal.brief === null ? null : (
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.gameSeasons.proposal.brief', { brief: proposal.brief })}
        </p>
      )}
      {proposal.status === 'pending' ? (
        <PendingReview language={language} deps={deps} proposal={proposal} list={list} />
      ) : (
        <>
          <AppEventPreview language={language} event={proposal.appEvent} faults={proposal.appEventFaults} />
          <ReviewedSummary language={language} proposal={proposal} />
        </>
      )}
    </article>
  );
}

export function ProposalsSection({ language, deps, list }: { readonly language: AdminLanguage; readonly deps: AdminDeps; readonly list: AdminSeasonList | undefined }) {
  const [filter, setFilter] = useState<ProposalStatusFilter>('pending');
  const query = useQuery({
    queryKey: adminSeasonProposalsQueryKey(filter),
    queryFn: async ({ signal }) => {
      const result = await loadSeasonProposals({ ...deps, status: filter, signal });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    retry: false,
  });

  return (
    <AdminFicheSection id="gameseasons-proposals" title={translateAdmin(language, 'admin.gameSeasons.proposals.title')}>
      <AdminSelect
        id="gameseasons-proposals-filter"
        label={translateAdmin(language, 'admin.gameSeasons.proposals.filter')}
        value={filter}
        options={FILTERS.map((value) => ({ value, label: translateAdmin(language, `admin.gameSeasons.proposals.status.${value}`) }))}
        onValue={(value) => setFilter(FILTERS.find((candidate) => candidate === value) ?? 'pending')}
        data={{ 'data-gameseasons-proposals-filter': '' }}
      />
      {query.data !== undefined ? (
        query.data.length === 0 ? (
          <AdminEmptyState title={translateAdmin(language, 'admin.gameSeasons.proposals.empty')} data={{ 'data-gameseasons-proposals-empty': '' }} />
        ) : (
          <div className="grid gap-4">
            {query.data.map((proposal) => (
              <ProposalCard key={proposal.id} language={language} deps={deps} proposal={proposal} list={list} />
            ))}
          </div>
        )
      ) : query.isPending ? (
        <AdminSkeleton rows={2} />
      ) : (
        <div data-gameseasons-proposals-failed>
          <AdminErrorState language={language} message={translateAdmin(language, 'admin.gameSeasons.proposals.loadFailed')} onRetry={() => void query.refetch()} />
        </div>
      )}
    </AdminFicheSection>
  );
}

