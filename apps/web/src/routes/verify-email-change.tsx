import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import { apiDeps } from '@/lib/api/deps';
import { emailChangeFailureOf, verifyEmailChange, type EmailChangeFailure, type EmailChangeResult } from '@/lib/api/email-change';
import type { ApiResult } from '@/lib/api/http';
import { sessionStore } from '@/lib/api/session';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useSearch } from '@/lib/router';

import { ActionLink, LinkPage, LinkText, ReachFailurePage, SignedOutPage } from './link-page-parts';

/**
 * **`/settings/verify-email-change?token=` — LA NOUVELLE ADRESSE SE CONFIRME**
 * (#6715). L'adresse que la passerelle compose dans l'e-mail envoyé à la
 * NOUVELLE adresse (`routes/users/contact-change.ts`, `contact-changes.ts`).
 *
 * **Sous session, comme le legacy.** La route de vérification porte
 * `fastify.authenticate` : c'est le changement en attente du compte CONNECTÉ
 * qui se vérifie. Le legacy renvoyait vers la connexion avec un `returnUrl` ;
 * la connexion de la v2 ne ramène pas encore, donc la page ne dépense pas le
 * jeton sans session et dit quoi faire (`SignedOutPage`).
 *
 * **Le jeton se consomme au montage**, une fois (garde de `useRef`) : un lien
 * de confirmation n'a qu'un effet possible, que la personne a déjà choisi en
 * demandant le changement, et il est réversible depuis les réglages. Le
 * `useRef` tient aussi contre le double montage du mode strict.
 */

export type VerifyEmailChangeDeps = {
  readonly verify: (token: string) => Promise<ApiResult<EmailChangeResult>>;
};

const GATEWAY_DEPS: VerifyEmailChangeDeps = { verify: (token) => verifyEmailChange(apiDeps, token) };

export function VerifyEmailChangePage({
  token,
  signedIn,
  language,
  deps,
}: {
  readonly token: string | null;
  readonly signedIn: boolean;
  readonly language: InterfaceLanguage;
  readonly deps: VerifyEmailChangeDeps;
}) {
  if (token === null || token === '') return <EmailChangeRefused language={language} message="missing" />;
  if (!signedIn) return <SignedOutPage language={language} />;
  return <EmailChangeVerification token={token} language={language} deps={deps} />;
}

export default function VerifyEmailChangeScreen() {
  const [search] = useSearch();
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  return <VerifyEmailChangePage token={search.get('token')} signedIn={signedIn} language={currentInterfaceLanguage()} deps={GATEWAY_DEPS} />;
}

type VerifyState =
  | { readonly phase: 'verifying' }
  | { readonly phase: 'done'; readonly email: string | null }
  | { readonly phase: 'failed'; readonly failure: EmailChangeFailure };

const REFUSAL_COPY = {
  expired: 'linkPage.expired',
  invalid: 'emailChange.invalid',
  taken: 'emailChange.taken',
  missing: 'emailChange.missing',
} as const;

function EmailChangeVerification({
  token,
  language,
  deps,
}: {
  readonly token: string;
  readonly language: InterfaceLanguage;
  readonly deps: VerifyEmailChangeDeps;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<VerifyState>({ phase: 'verifying' });
  const started = useRef<string | null>(null);

  useEffect(() => {
    const run = `${token}#${attempt}`;
    if (started.current === run) return;
    started.current = run;
    void verify();

    async function verify() {
      const result = await deps.verify(token);
      setState(result.ok ? { phase: 'done', email: result.data.email } : { phase: 'failed', failure: emailChangeFailureOf(result) });
    }
  }, [token, attempt]);

  const retry = () => {
    setState({ phase: 'verifying' });
    setAttempt((count) => count + 1);
  };

  if (state.phase === 'verifying') return <LinkPage glyph="envelopeOpen" tone="brand" title={translate(language, 'emailChange.verifying')} busy />;

  if (state.phase === 'done') {
    return (
      <LinkPage
        glyph="check"
        tone="success"
        title={translate(language, 'emailChange.done.title')}
        body={
          <LinkText>
            {state.email === null ? translate(language, 'emailChange.done.generic') : translate(language, 'emailChange.done.body', { email: state.email })}
          </LinkText>
        }
      >
        <ActionLink to="settings" tone="primary">
          {translate(language, 'linkPage.settings')}
        </ActionLink>
      </LinkPage>
    );
  }

  const { failure } = state;
  if (failure === 'signed-out') return <SignedOutPage language={language} />;
  if (failure === 'offline' || failure === 'rate-limited' || failure === 'unavailable') {
    return <ReachFailurePage language={language} failure={failure} onRetry={retry} />;
  }
  return <EmailChangeRefused language={language} message={failure} />;
}

function EmailChangeRefused({ language, message }: { readonly language: InterfaceLanguage; readonly message: keyof typeof REFUSAL_COPY }) {
  return (
    <LinkPage
      glyph="warningCircle"
      tone="danger"
      title={translate(language, 'emailChange.failed.title')}
      body={<LinkText>{translate(language, REFUSAL_COPY[message])}</LinkText>}
    >
      <ActionLink to="settings" tone="primary">
        {translate(language, 'linkPage.settings')}
      </ActionLink>
      <ActionLink to="list" tone="secondary">
        {translate(language, 'linkPage.home')}
      </ActionLink>
    </LinkPage>
  );
}
