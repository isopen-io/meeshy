import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';

import type { ServerOperation, ServerOperationRun } from '@meeshy/shared/types/admin-ops';

import { AdminAnnouncement } from '@/components/admin/announcement';
import { AdminButton } from '@/components/admin/button';
import { AdminFormError } from '@/components/admin/form';
import { AdminErrorState, AdminInlineNotice, AdminSkeleton } from '@/components/admin/states';
import { EDGE, INK, INK2, SURFACE } from '@/components/admin/tone';
import { Sheet } from '@/components/sheet';
import { formatBytes } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import { AWAITED_RUN_MAX_MS, awaitedRunOf, awaitedServed, operationCardOf, opsStatusRefreshMs } from '@/lib/admin/ops-run-view';
import { useAdminMotive } from '@/lib/admin/use-admin-motive';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import type { AdminDeps } from '@/lib/api/admin';
import { ADMIN_OPS_STATUS_KEY, SERVER_OPERATIONS_SHOWN, loadOpsStatus, triggerServerOperation, type AdminOpsStatus } from '@/lib/api/admin-ops';
import { unwrap } from '@/lib/api/client';
import type { ApiFailure } from '@/lib/api/http';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useOnline } from '@/lib/net/online';

import { BackupsSection } from './admin-monitoring-backups';

/**
 * **LA SAUVEGARDE ET LE NETTOYAGE** (#10396, #11441) — deux cartes : le dernier passage
 * (statut, fin, octets récupérés), le délai avant la prochaine, et le bouton, offert au
 * RANG D'ADMINISTRATION (ADMIN et BIGBOSS, demande porteur 2026-10-21 ; la passerelle
 * garde la même règle, et journalise chaque tentative). Le motif est proposé à l'ADMIN
 * (`useAdminMotive`), facultatif. La confirmation exige de TAPER le nom de l'opération (`backup`,
 * `image-prune`) — la passerelle compare le même mot. Les refus se disent en mots :
 * trop tôt (409), déjà en cours (409), relais absent ou journal indisponible (503). Le statut se relit toutes les
 * 5 s tant qu'une opération est en file ou en cours, 30 s sinon — la règle est le modèle de vue
 * pur `lib/admin/ops-run-view.ts` (#10467), témoigné hors du DOM.
 */
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

function refusalOf(failure: ApiFailure, language: AdminLanguage): string {
  if (failure.code === 'OPERATION_COOLDOWN') return translateAdmin(language, 'admin.ops.refused.cooldown');
  if (failure.code === 'OPERATION_IN_PROGRESS') return translateAdmin(language, 'admin.ops.refused.inProgress');
  if (failure.code === 'AUDIT_UNAVAILABLE') return translateAdmin(language, 'admin.ops.refused.audit');
  if (failure.code === 'OPS_RELAY_UNAVAILABLE' || failure.status === 503) return translateAdmin(language, 'admin.ops.refused.relay');
  if (failure.status === 403) return translateAdmin(language, 'admin.kit.refused.permission');
  if (failure.status === 0) return translateAdmin(language, 'admin.kit.refused.network');
  return translateAdmin(language, 'admin.kit.refused.server');
}

function ConfirmOperation({
  language,
  operation,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  readonly language: AdminLanguage;
  readonly operation: ServerOperation;
  readonly busy: boolean;
  readonly error: string;
  readonly onConfirm: (reason: string) => void;
  readonly onCancel: () => void;
}) {
  const proposed = useAdminMotive(language).fallback;
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState(proposed ?? '');
  const typedId = useId();
  const reasonId = useId();
  const field = { minHeight: 44, backgroundColor: SURFACE, border: `1px solid ${EDGE}`, color: INK } as const;
  return (
    <Sheet title={translateAdmin(language, `admin.ops.action.${operation}`)} presentation="centered" bodyAs="div" closeLabel={translateAdmin(language, 'admin.kit.close')} onClose={onCancel}>
      <form
        data-admin-ops-confirm={operation}
        className="grid gap-4 px-4 pb-4 pt-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (typed.trim() === operation && !busy) onConfirm(reason);
        }}
      >
        <p className="text-body" style={{ color: INK }}>
          {translateAdmin(language, `admin.ops.action.${operation}.body`)}
        </p>
        <label htmlFor={typedId} className="grid gap-2 text-body" style={{ color: INK }}>
          {translateAdmin(language, 'admin.ops.action.confirmType', { name: operation })}
          <input
            id={typedId}
            data-admin-ops-typed
            value={typed}
            autoComplete="off"
            spellCheck={false}
            onInput={(event) => setTyped(event.currentTarget.value)}
            className={`rounded-chip px-3 font-mono text-body ${FOCUS}`}
            style={field}
          />
        </label>
        <label htmlFor={reasonId} className="grid gap-2 text-body" style={{ color: INK }}>
          {translateAdmin(language, 'admin.ops.action.reason')}
          <input
            id={reasonId}
            data-admin-ops-reason
            value={reason}
            maxLength={500}
            {...(proposed === undefined ? {} : { placeholder: proposed })}
            onInput={(event) => setReason(event.currentTarget.value)}
            className={`rounded-chip px-3 text-body ${FOCUS}`}
            style={field}
          />
        </label>
        <AdminFormError text={error} data={{ 'data-admin-ops-error': '' }} />
        <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:justify-end">
          <AdminButton size="lg" onClick={onCancel} disabled={busy}>
            {translateAdmin(language, 'admin.ops.action.cancel')}
          </AdminButton>
          <AdminButton size="lg" type="submit" tone="danger" busy={busy} disabled={typed.trim() !== operation} data={{ 'data-admin-ops-go': operation }}>
            {translateAdmin(language, `admin.ops.action.${operation}`)}
          </AdminButton>
        </div>
      </form>
    </Sheet>
  );
}

function OperationCard({
  language,
  operation,
  status,
  now,
  canTrigger,
  online,
  onAsk,
  awaited = null,
}: {
  readonly language: AdminLanguage;
  readonly operation: ServerOperation;
  readonly status: AdminOpsStatus;
  readonly now: Date;
  readonly canTrigger: boolean;
  readonly online: boolean;
  readonly onAsk: () => void;
  /** La demande acceptée que le relais n'a pas encore publiée (#10467) : elle se dit « en file ». */
  readonly awaited?: ServerOperationRun | null;
}) {
  const card = operationCardOf({ operation, status, awaited, now, online });
  const { run } = card;
  const available = adminMomentOf(status.availableAt[operation], now, language);
  const finished = adminMomentOf(card.lastAt, now, language);
  return (
    <article data-admin-ops-operation={operation} data-admin-ops-run={run?.status ?? 'none'} className="grid content-start gap-3 rounded-card p-4 md:p-5" style={{ backgroundColor: SURFACE, border: `1px solid ${EDGE}` }}>
      <h3 className="text-body font-semibold" style={{ color: INK }}>
        {translateAdmin(language, `admin.ops.action.${operation}`)}
      </h3>
      <p className="text-caption" style={{ color: INK2 }}>
        {run === null
          ? translateAdmin(language, 'admin.ops.action.never')
          : [
              translateAdmin(language, 'admin.ops.action.last', { status: translateAdmin(language, `admin.ops.run.${run.status}`) }),
              finished?.relative ?? null,
              run.reclaimedBytes === null ? null : translateAdmin(language, 'admin.ops.action.reclaimed', { bytes: formatBytes(run.reclaimedBytes, language) }),
            ]
              .filter((part) => part !== null)
              .join(' · ')}
      </p>
      {card.waitMs > 0 && available !== null ? (
        <p className="text-caption" style={{ color: INK2 }} data-admin-ops-cooldown>
          {translateAdmin(language, 'admin.ops.action.availableIn', { when: available.relative })}
        </p>
      ) : null}
      {canTrigger ? (
        <div>
          <AdminButton tone="danger" disabled={!card.canPress} onClick={onAsk} data={{ 'data-admin-ops-trigger': operation }}>
            {translateAdmin(language, `admin.ops.action.${operation}`)}
          </AdminButton>
        </div>
      ) : null}
    </article>
  );
}

export function AdminOperationsActions({ language, deps, now }: { readonly language: AdminLanguage; readonly deps: AdminDeps; readonly now: () => Date }) {
  const reach = useAdminReach();
  const online = useOnline();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<ServerOperation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  /* La demande acceptée reste « en file » jusqu'à ce que le statut servi porte SON identifiant :
     entre le dépôt et la première écriture du relais, le statut relu montre encore le passage
     d'avant (#10467). Au plus deux minutes, puis le statut servi fait foi. */
  const [awaited, setAwaited] = useState<ServerOperationRun | null>(null);
  const awaitedRef = useRef<ServerOperationRun | null>(null);
  awaitedRef.current = awaited;
  const status = useQuery({
    queryKey: ADMIN_OPS_STATUS_KEY,
    queryFn: async ({ signal }) => unwrap(await loadOpsStatus({ ...deps, signal })),
    refetchInterval: (query) => opsStatusRefreshMs({ awaited: awaitedRef.current, runs: query.state.data?.runs }),
    refetchOnWindowFocus: false,
    retry: false,
  });
  /* L'heure se lit AU RENDU (#10467) : un état figé à l'ouverture, réarmé à chaque rendu du
     parent (dont `now` change d'identité toutes les 5 s avec les métriques), ne battait jamais
     et disait « dans 34 secondes » d'une sauvegarde déjà finie. Le battement ne fait que
     redessiner quand rien d'autre ne le fait. */
  const [, setBeat] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setBeat((beat) => beat + 1), 15_000);
    return () => clearInterval(timer);
  }, []);
  const clock = now();

  const trigger = async (operation: ServerOperation, reason: string) => {
    setBusy(true);
    setError('');
    const result = await triggerServerOperation({ ...deps, operation, reason });
    setBusy(false);
    if (!result.ok) {
      setError(refusalOf(result, language));
      void queryClient.invalidateQueries({ queryKey: ADMIN_OPS_STATUS_KEY });
      return;
    }
    setPending(null);
    setAwaited(awaitedRunOf({ operation, requestId: result.data.requestId, queuedAt: result.data.queuedAt, now: now() }));
    setAnnouncement(translateAdmin(language, 'admin.ops.action.queued'));
    void queryClient.invalidateQueries({ queryKey: ADMIN_OPS_STATUS_KEY });
  };

  const data = status.data;
  const servedAwaited = awaitedServed(awaited, data?.runs);
  useEffect(() => {
    if (awaited === null) return undefined;
    if (servedAwaited) {
      setAwaited(null);
      return undefined;
    }
    const timer = setTimeout(() => setAwaited(null), AWAITED_RUN_MAX_MS);
    return () => clearTimeout(timer);
  }, [awaited, servedAwaited]);
  return (
    <section className="grid gap-3" data-admin-ops-actions aria-labelledby="admin-ops-actions-title">
      <h2 id="admin-ops-actions-title" className="text-body font-semibold" style={{ color: INK }}>
        {translateAdmin(language, 'admin.ops.actions.title')}
      </h2>
      {data === undefined ? (
        status.isPending ? (
          <AdminSkeleton rows={2} />
        ) : (
          <AdminErrorState language={language} onRetry={() => void status.refetch()} />
        )
      ) : (
        <>
          {data.relayInstalled ? null : (
            <div data-admin-ops-relay-missing>
              <AdminInlineNotice tone="warning" text={translateAdmin(language, 'admin.ops.relay.missing')} />
            </div>
          )}
          <div className="grid gap-3 @2xl:grid-cols-2">
            {SERVER_OPERATIONS_SHOWN.map((operation) => (
              <OperationCard
                key={operation}
                language={language}
                operation={operation}
                status={data}
                now={clock}
                canTrigger={reach.hasAdminRank}
                online={online}
                awaited={awaited}
                onAsk={() => {
                  setError('');
                  setPending(operation);
                }}
              />
            ))}
          </div>
          {data.backup === null ? null : <BackupsSection language={language} backups={data.backup} now={clock} />}
        </>
      )}
      {pending === null ? null : (
        <ConfirmOperation language={language} operation={pending} busy={busy} error={error} onConfirm={(reason) => void trigger(pending, reason)} onCancel={() => setPending(null)} />
      )}
      <AdminAnnouncement text={announcement} />
    </section>
  );
}
