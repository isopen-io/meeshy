import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand/react';

import { ACTIVE_CALL_QUERY_KEY, loadActiveCall } from '@/lib/api/call-sessions';
import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { callActions } from '@/lib/calls/call-actions';
import { callIdentityOf } from '@/lib/calls/call-notice';
import { resumableCall } from '@/lib/calls/call-resume';
import { callStore } from '@/lib/calls/call-store';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { Glyph, GlyphSvg } from './glyph';
import { CALLS_GLYPHS } from './glyphs-calls';

/**
 * **LA BANNIÈRE « REPRENDRE L'APPEL »** (#3586, E7) — posée par la couche
 * d'appel (`call-layer.tsx`) au-dessus de TOUTES les routes, comme la pastille
 * d'un appel en cours : quitter la conversation, recharger l'onglet ou rouvrir
 * la coque ne fait pas oublier qu'on est encore dans un appel.
 *
 * **Cache d'abord.** `GET /calls/active` est une requête TanStack persistée
 * (`query-client.ts`) : au rechargement, la bannière se peint depuis le disque
 * AVANT toute réponse, puis la lecture se refait au montage, au retour du
 * focus et toutes les 30 s. La charge persistée est une PROJECTION
 * (`call-sessions.ts`) : ni présence ni numéro.
 *
 * Un appel qui se termine EN LOCAL invalide la lecture : sans cela, la
 * bannière rejouerait l'appel qu'on vient de raccrocher jusqu'au prochain
 * sondage.
 */
export const ACTIVE_CALL_POLL_MS = 30_000;

export default function CallResumeBanner() {
  const language = currentInterfaceLanguage();
  const session = useStore(sessionStore, (state) => state.session);
  const signedIn = session.status === 'authenticated' || apiDeps.source === 'fixtures';
  const local = useStore(callStore, (state) => state.call);
  const localPhase = local?.phase.kind ?? null;
  const previous = useRef(localPhase);

  const active = useQuery(
    {
      queryKey: ACTIVE_CALL_QUERY_KEY,
      queryFn: async ({ signal }) => unwrap(await loadActiveCall(apiDeps, signal)),
      enabled: signedIn,
      refetchInterval: ACTIVE_CALL_POLL_MS,
      staleTime: 0,
      retry: false,
    },
    appQueryClient,
  );

  useEffect(() => {
    const was = previous.current;
    previous.current = localPhase;
    const ended = was !== null && was !== 'ended' && (localPhase === null || localPhase === 'ended');
    if (ended) void appQueryClient.invalidateQueries({ queryKey: ACTIVE_CALL_QUERY_KEY });
  }, [localPhase]);

  if (!signedIn) return null;
  const viewerId = resolveViewer({ source: apiDeps.source, session }).id ?? '';
  const request = resumableCall({ active: active.data ?? null, local, viewerId, identityOf: callIdentityOf });
  if (request === null) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}>
      <button
        type="button"
        data-call-resume={request.callId}
        aria-label={translate(language, 'callJoin.resume.named', { name: request.title === '' ? translate(language, 'calls.unknown') : request.title })}
        onClick={() => callActions.join(request)}
        className="pointer-events-auto flex min-h-11 max-w-full items-center gap-2 rounded-chip py-1.5 pr-1.5 pl-3.5 shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          backgroundColor: 'var(--color-ios-card)',
          color: 'var(--color-ios-ink)',
          outlineColor: 'var(--color-success)',
          boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-success) 45%, transparent), 0 8px 24px rgb(0 0 0 / 0.18)',
        }}
      >
        <span aria-hidden="true" style={{ color: 'var(--color-success)' }}>
          {request.media === 'video' ? <GlyphSvg glyph={CALLS_GLYPHS.videoCamera} size={16} /> : <Glyph name="phone" size={16} />}
        </span>
        <span aria-hidden="true" className="grid min-w-0 text-left leading-tight">
          <span data-call-resume-title className="truncate text-check font-semibold" style={{ color: 'var(--color-success)' }}>
            {translate(language, 'callJoin.resume.title')}
          </span>
          {request.title === '' ? null : (
            <span data-call-resume-name className="truncate text-caption font-medium">
              {request.title}
            </span>
          )}
        </span>
        <span
          aria-hidden="true"
          className="ml-1 grid shrink-0 place-items-center rounded-chip px-3 text-caption font-semibold text-white"
          style={{ height: 32, backgroundColor: 'var(--ios-indigo-600)' }}
        >
          {translate(language, 'callJoin.resume.action')}
        </span>
      </button>
    </div>
  );
}
