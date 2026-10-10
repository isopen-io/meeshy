import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { CHROME_ACTION_HIT_CLASS, ChromeActionDisc } from '@/components/chrome-action';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { SETTINGS_GLYPHS } from '@/components/glyphs-settings';
import { GroupedSection, SECTION_BRAND_INK, SECTION_CARD_STYLE, SECTION_INK, SECTION_INK_2 } from '@/components/grouped-section';
import {
  loadActiveSessions,
  revokeOtherSessions,
  revokeSession,
  securityFailureOf,
  SESSIONS_QUERY_KEY,
  type AccountSecurityDeps,
  type ActiveSession,
  type ActiveSessions,
  type SecurityFailure,
} from '@/lib/api/account-security';
import { ApiError, unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import type { ApiResult } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { loadSessionsCatalog, sessionsTextOf, type SessionsText } from '@/lib/i18n-sessions-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { orderedSessions, sessionFields, sessionTitle, withoutSessions } from '@/lib/view/sessions';
import { Link } from '@/routes/route-table';

/**
 * **SÉCURITÉ > SESSIONS** (#6720) — miroir `ActiveSessionsView.swift`, monté
 * dans les réglages (`settings.tsx`, `?volet=securite`) et chargé à la
 * demande avec son catalogue : rien n'en entre dans la première peinture.
 *
 * - **Tout est montré** (décision porteur du 2026-10-08) : version et build,
 *   plateforme, appareil, système, navigateur, adresse IP, lieu approximatif,
 *   fuseau, ouverture, dernière activité, moyen de connexion — et
 *   l'attribution DB-IP servie avec la liste (licence CC-BY 4.0).
 * - **La courante en tête**, marquée « Cet appareil », sans geste de fermeture.
 * - **Cache d'abord** : la liste vit EN MÉMOIRE (jamais sur le disque, voir
 *   `api/account-security.ts`) ; rouvrir l'écran la peint aussitôt et la
 *   relit en silence. Le squelette n'existe que pour un cache vide.
 * - **Optimiste** : une fermeture retire la ligne au geste, la passerelle
 *   confirme, un refus la remet et le dit. Une session déjà fermée (404) est
 *   un succès. Hors ligne, aucun geste ne part : les boutons le disent.
 */

export type SecurityScreenDeps = {
  readonly load: (signal: AbortSignal) => Promise<ApiResult<ActiveSessions>>;
  readonly revoke: (sessionId: string) => Promise<ApiResult<unknown>>;
  readonly revokeOthers: () => Promise<ApiResult<number>>;
};

const gatewayDeps = (deps: AccountSecurityDeps): SecurityScreenDeps => ({
  load: (signal) => loadActiveSessions({ ...deps, signal }),
  revoke: (sessionId) => revokeSession(deps, sessionId),
  revokeOthers: () => revokeOtherSessions(deps),
});

/** Charge le catalogue de la langue AVANT le premier rendu — appelé par l'import paresseux des réglages. */
export const prepareSecurityScreen = (language: InterfaceLanguage): Promise<unknown> => loadSessionsCatalog(language);

type Pending = { readonly kind: 'one'; readonly session: ActiveSession } | { readonly kind: 'others' } | null;

const BUTTON_STYLE = { minHeight: 44, outlineColor: 'var(--color-ios-brand)' } as const;

export function SettingsSecurityScreen({
  language,
  deps = gatewayDeps(apiDeps),
  queryClient = appQueryClient,
  now = () => new Date(),
}: {
  readonly language: InterfaceLanguage;
  readonly deps?: SecurityScreenDeps;
  readonly queryClient?: QueryClient;
  readonly now?: () => Date;
}) {
  const t = sessionsTextOf(language);
  const online = useOnline();
  const [pending, setPending] = useState<Pending>(null);
  const [announce, setAnnounce] = useState('');
  const query = useQuery(
    {
      queryKey: SESSIONS_QUERY_KEY,
      queryFn: async ({ signal }) => unwrap(await deps.load(signal)),
      retry: false,
      gcTime: 30 * 60_000,
    },
    queryClient,
  );

  useEffect(() => {
    if (announce === '') return undefined;
    const handle = setTimeout(() => setAnnounce(''), 4000);
    return () => clearTimeout(handle);
  }, [announce]);

  const close = async (target: NonNullable<Pending>) => {
    setPending(null);
    const snapshot = queryClient.getQueryData<ActiveSessions>(SESSIONS_QUERY_KEY);
    const closes = (session: ActiveSession) => (target.kind === 'one' ? session.id === target.session.id : !session.isCurrent);
    queryClient.setQueryData<ActiveSessions | undefined>(SESSIONS_QUERY_KEY, (before) => withoutSessions(before, closes));
    const result = target.kind === 'one' ? await deps.revoke(target.session.id) : await deps.revokeOthers();
    const settled = result.ok || (target.kind === 'one' && securityFailureOf(result) === 'not-found');
    if (!settled) {
      queryClient.setQueryData(SESSIONS_QUERY_KEY, snapshot);
      setAnnounce(t(target.kind === 'one' ? 'sessions.revoke.error' : 'sessions.others.error'));
      return;
    }
    const count = result.ok && typeof result.data === 'number' ? result.data : 1;
    setAnnounce(
      target.kind === 'one'
        ? t('sessions.revoke.done')
        : count === 1
          ? t('sessions.others.done.one')
          : t('sessions.others.done.other', { count: String(count) }),
    );
    void queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
  };

  const view = query.data;
  const failure: SecurityFailure | null = query.error instanceof ApiError ? securityFailureOf(query.error) : query.error === null ? null : 'unavailable';
  const sessions = view === undefined ? [] : orderedSessions(view.sessions);
  const others = sessions.some((session) => !session.isCurrent);

  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe" data-settings-security>
      <header className="flex shrink-0 items-center gap-1 px-2" style={{ height: 64 }}>
        <Link
          to="settings"
          aria-label={t('sessions.back')}
          className={`${CHROME_ACTION_HIT_CLASS} focus-visible:outline-2 focus-visible:outline-offset-2`}
          style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
        >
          <ChromeActionDisc>
            <Glyph name="caretLeft" size={16} className="rtl:-scale-x-100" />
          </ChromeActionDisc>
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-body font-semibold" style={{ color: SECTION_INK }}>
          {t('sessions.title')}
        </h1>
      </header>
      <main id="contenu" className="flex-1 overflow-y-auto px-4 pb-safe">
        <div className="mx-auto grid max-w-xl gap-6 pb-24" style={{ paddingTop: 8 }}>
          {online ? null : (
            <p role="status" data-sessions-offline className="rounded-card px-3.5 py-3 text-caption" style={{ ...SECTION_CARD_STYLE, color: SECTION_INK }}>
              {t('sessions.offline')}
            </p>
          )}
          <GroupedSection id="sessions-title" title={t('sessions.section').toLocaleUpperCase(language)} icon={<GlyphSvg glyph={SETTINGS_GLYPHS.shieldCheck} size={12} />} card={false}>
            <p className="ps-1 text-caption" style={{ color: SECTION_INK_2 }}>
              {t('sessions.intro')}
            </p>
            {view === undefined ? (
              failure === null ? (
                <SessionsSkeleton label={t('sessions.loading')} />
              ) : (
                <SessionsError t={t} failure={failure} onRetry={() => void query.refetch()} />
              )
            ) : sessions.length === 0 ? (
              <div data-sessions-empty className="grid gap-1 rounded-card p-4 text-center" style={SECTION_CARD_STYLE}>
                <span className="text-body font-semibold" style={{ color: SECTION_INK }}>
                  {t('sessions.empty.title')}
                </span>
                <span className="text-caption" style={{ color: SECTION_INK_2 }}>
                  {t('sessions.empty.body')}
                </span>
              </div>
            ) : (
              <ul className="grid gap-2" aria-labelledby="sessions-title">
                {sessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    language={language}
                    t={t}
                    now={now()}
                    approximate={view.geolocation?.approximate ?? true}
                    disabled={!online}
                    onRevoke={() => setPending({ kind: 'one', session })}
                  />
                ))}
              </ul>
            )}
            {view === undefined || view.geolocation === null ? null : (
              <p data-sessions-attribution className="ps-1 text-caption" style={{ color: SECTION_INK_2 }}>
                {`${t('sessions.attribution.note')} `}
                <a
                  href={view.geolocation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`underline focus-visible:outline-2 ${SECTION_BRAND_INK}`}
                  style={{ outlineColor: 'var(--color-ios-brand)' }}
                >
                  {view.geolocation.text}
                </a>
              </p>
            )}
          </GroupedSection>
          {view === undefined || sessions.length === 0 ? null : others ? (
            <button
              type="button"
              data-sessions-revoke-others
              disabled={!online}
              onClick={() => setPending({ kind: 'others' })}
              className="flex items-center justify-center gap-2 rounded-card px-4 text-body font-semibold focus-visible:outline-2 disabled:opacity-40"
              style={{ ...SECTION_CARD_STYLE, ...BUTTON_STYLE, color: 'var(--color-error)' }}
            >
              <GlyphSvg glyph={SETTINGS_GLYPHS.signOut} size={16} className="rtl:-scale-x-100" />
              {t('sessions.others')}
            </button>
          ) : (
            <p data-sessions-alone className="text-center text-caption" style={{ color: SECTION_INK_2 }}>
              {t('sessions.others.none')}
            </p>
          )}
        </div>
      </main>
      {pending === null ? null : (
        <ConfirmDialog
          name={pending.kind === 'one' ? 'revoke-session' : 'revoke-other-sessions'}
          title={t(pending.kind === 'one' ? 'sessions.revoke.title' : 'sessions.others.title')}
          body={pending.kind === 'one' ? t('sessions.revoke.body', { device: sessionTitle(pending.session, t) }) : t('sessions.others.body')}
          cancelLabel={t('sessions.cancel')}
          confirmLabel={t(pending.kind === 'one' ? 'sessions.revoke' : 'sessions.others')}
          tone="destructive"
          onConfirm={() => void close(pending)}
          onCancel={() => setPending(null)}
        />
      )}
      <p
        role="status"
        aria-live="polite"
        data-sessions-announce
        className="pointer-events-none fixed inset-x-4 bottom-6 mx-auto max-w-sm rounded-chip px-4 py-2.5 text-center text-caption font-semibold empty:hidden"
        style={{ color: 'var(--color-ios-surface)', backgroundColor: 'var(--color-ios-ink)' }}
      >
        {announce}
      </p>
    </div>
  );
}

function SessionCard({
  session,
  language,
  t,
  now,
  approximate,
  disabled,
  onRevoke,
}: {
  readonly session: ActiveSession;
  readonly language: InterfaceLanguage;
  readonly t: SessionsText;
  readonly now: Date;
  readonly approximate: boolean;
  readonly disabled: boolean;
  readonly onRevoke: () => void;
}) {
  const title = sessionTitle(session, t);
  const tint = session.isCurrent ? 'var(--color-success)' : 'var(--color-ios-brand)';
  return (
    <li
      data-session={session.id}
      data-session-current={session.isCurrent ? '' : undefined}
      className="grid gap-2 rounded-card p-4"
      style={{ ...SECTION_CARD_STYLE, borderColor: `color-mix(in srgb, ${tint} 40%, transparent)` }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 break-words text-body font-semibold" style={{ color: SECTION_INK }}>
          {title}
        </span>
        {session.isCurrent ? <Badge tint="var(--color-success)">{t('sessions.current')}</Badge> : null}
        {session.isTrusted ? <Badge tint="var(--color-ios-brand)">{t('sessions.trusted')}</Badge> : null}
      </div>
      <dl className="grid gap-1 text-caption" style={{ gridTemplateColumns: 'auto 1fr', columnGap: 12 }}>
        {sessionFields(session, { language, now, t, approximate }).map((field) => (
          <div key={field.key} data-session-field={field.key} style={{ display: 'contents' }}>
            <dt style={{ color: SECTION_INK_2 }}>{field.label}</dt>
            <dd className="min-w-0 break-words" style={{ color: SECTION_INK }} {...(field.ltr ? { dir: 'ltr' } : {})}>
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
      {session.isCurrent ? null : (
        <button
          type="button"
          data-session-revoke={session.id}
          aria-label={t('sessions.revoke.label', { device: title })}
          disabled={disabled}
          onClick={onRevoke}
          className="inline-flex items-center gap-2 rounded-chip px-3 text-caption font-semibold focus-visible:outline-2 disabled:opacity-40"
          style={{ ...BUTTON_STYLE, justifySelf: 'start', color: 'var(--color-error)', border: '1px solid var(--color-edge)' }}
        >
          {t('sessions.revoke')}
        </button>
      )}
    </li>
  );
}

function Badge({ tint, children }: { readonly tint: string; readonly children: string }) {
  return (
    <span className="rounded-chip px-2 py-0.5 text-caption font-semibold" style={{ color: tint, backgroundColor: `color-mix(in srgb, ${tint} 14%, transparent)` }}>
      {children}
    </span>
  );
}

function SessionsSkeleton({ label }: { readonly label: string }) {
  return (
    <div role="status" aria-label={label} data-sessions-loading className="grid gap-2">
      {[0, 1].map((index) => (
        <div key={index} aria-hidden="true" className="grid gap-2 rounded-card p-4 motion-safe:animate-pulse" style={SECTION_CARD_STYLE}>
          <div className="rounded-chip" style={{ height: 16, width: '45%', backgroundColor: 'var(--color-edge)' }} />
          <div className="rounded-chip" style={{ height: 12, width: '80%', backgroundColor: 'var(--color-edge)' }} />
          <div className="rounded-chip" style={{ height: 12, width: '65%', backgroundColor: 'var(--color-edge)' }} />
        </div>
      ))}
    </div>
  );
}

function SessionsError({ t, failure, onRetry }: { readonly t: SessionsText; readonly failure: SecurityFailure; readonly onRetry: () => void }) {
  return (
    <div role="alert" data-sessions-error={failure} className="grid gap-2 rounded-card p-4 text-center" style={SECTION_CARD_STYLE}>
      <span className="text-body" style={{ color: SECTION_INK }}>
        {t(failure === 'signed-out' ? 'sessions.signedOut' : failure === 'offline' ? 'sessions.offline' : 'sessions.error.title')}
      </span>
      {failure === 'signed-out' ? null : (
        <button
          type="button"
          onClick={onRetry}
          className={`rounded-chip px-4 text-body font-semibold focus-visible:outline-2 ${SECTION_BRAND_INK}`}
          style={{ ...BUTTON_STYLE, justifySelf: 'center' }}
        >
          {t('sessions.error.retry')}
        </button>
      )}
    </div>
  );
}
