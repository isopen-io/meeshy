import { useState } from 'react';

import { apiDeps } from '@/lib/api/deps';
import type { ApiResult } from '@/lib/api/http';
import type { ReachFailure } from '@/lib/api/link-failure';
import { revokeAllSessionsFromLink, revokeFailureOf, type RevokeSessionsResult } from '@/lib/api/revoke-sessions';
import { translate } from '@/lib/i18n-catalog';
import { translateRevokeSessions } from '@/lib/i18n-revoke-sessions-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { forgetEmailLinkSecret } from '@/lib/links/email-link-secret';
import { useEmailLinkSearch } from '@/lib/links/email-link-search';
import { useOnline } from '@/lib/net/online';

import { ActionButton, ActionLink, LinkAlert, LinkPage, LinkText, REACH_FAILURE_BODY } from './link-page-parts';

/**
 * **`/auth/revoke-sessions` — « CE N'ÉTAIT PAS MOI »** (#10859). L'alerte de
 * nouvelle connexion porte `?via=email#token=…` : le jeton est dans le
 * FRAGMENT, relevé par `useEmailLinkSearch`, et ne part qu'au CLIC, dans le
 * corps de `POST /auth/revoke-all-sessions`. Le lien visait auparavant un `GET`
 * de la passerelle qui mutait : le jeton finissait dans le journal d'accès, et
 * un pré-chargeur de liens déconnectait la personne sans qu'elle clique.
 *
 * PUBLIQUE : la personne alertée a pu perdre l'accès à son compte — c'est même
 * le cas que ce lien sert.
 */

export const REVOKE_SESSIONS_KEYS = [
  'revokeSessions.title',
  'revokeSessions.body',
  'revokeSessions.action',
  'revokeSessions.working',
  'revokeSessions.done.title',
  'revokeSessions.done.body',
  'revokeSessions.invalid',
  'revokeSessions.dismiss',
] as const;

export type RevokeSessionsPageDeps = {
  readonly revoke: (token: string) => Promise<ApiResult<RevokeSessionsResult>>;
};

const GATEWAY_DEPS: RevokeSessionsPageDeps = { revoke: (token) => revokeAllSessionsFromLink(apiDeps, token) };

type State =
  | { readonly phase: 'ready'; readonly failure: ReachFailure | null }
  | { readonly phase: 'working' }
  | { readonly phase: 'done' }
  | { readonly phase: 'invalid' };

export function RevokeSessionsPage({
  token,
  online,
  language,
  deps,
}: {
  readonly token: string | null;
  readonly online: boolean;
  readonly language: InterfaceLanguage;
  readonly deps: RevokeSessionsPageDeps;
}) {
  const [state, setState] = useState<State>(token === null || token === '' ? { phase: 'invalid' } : { phase: 'ready', failure: null });

  async function revoke() {
    if (token === null || token === '') return;
    setState({ phase: 'working' });
    const result = await deps.revoke(token);
    if (result.ok) {
      forgetEmailLinkSecret();
      setState({ phase: 'done' });
      return;
    }
    const failure = revokeFailureOf(result);
    if (failure === 'invalid') forgetEmailLinkSecret();
    setState(failure === 'invalid' ? { phase: 'invalid' } : { phase: 'ready', failure });
  }

  if (state.phase === 'done') {
    return (
      <LinkPage
        glyph="check"
        tone="success"
        title={translateRevokeSessions(language, 'revokeSessions.done.title')}
        body={<LinkText>{translateRevokeSessions(language, 'revokeSessions.done.body')}</LinkText>}
      >
        <ActionLink to="login" tone="primary">
          {translate(language, 'linkPage.signIn')}
        </ActionLink>
      </LinkPage>
    );
  }

  if (state.phase === 'invalid') {
    return (
      <LinkPage
        glyph="warningCircle"
        tone="danger"
        title={translate(language, 'accountDeletion.closed.title')}
        body={<LinkText>{translateRevokeSessions(language, 'revokeSessions.invalid')}</LinkText>}
      >
        <ActionLink to="login" tone="primary">
          {translate(language, 'linkPage.signIn')}
        </ActionLink>
      </LinkPage>
    );
  }

  const working = state.phase === 'working';
  const failure = state.phase === 'ready' ? state.failure : null;
  return (
    <LinkPage
      glyph="warningCircle"
      tone="danger"
      title={translateRevokeSessions(language, 'revokeSessions.title')}
      body={
        <>
          <LinkText>{translateRevokeSessions(language, 'revokeSessions.body')}</LinkText>
          {online ? null : <LinkAlert>{translate(language, 'linkPage.offline.body')}</LinkAlert>}
          {failure === null ? null : <LinkAlert>{translate(language, REACH_FAILURE_BODY[failure])}</LinkAlert>}
        </>
      }
    >
      <ActionButton tone="danger" disabled={working || !online} onClick={() => void revoke()}>
        {translateRevokeSessions(language, working ? 'revokeSessions.working' : 'revokeSessions.action')}
      </ActionButton>
      <ActionLink to="list" tone="secondary">
        {translateRevokeSessions(language, 'revokeSessions.dismiss')}
      </ActionLink>
    </LinkPage>
  );
}

export default function RevokeSessionsScreen() {
  const search = useEmailLinkSearch();
  const online = useOnline();
  return <RevokeSessionsPage token={search.get('token')} online={online} language={currentInterfaceLanguage()} deps={GATEWAY_DEPS} />;
}
