import { useState, type FormEvent } from 'react';
import { useStore } from 'zustand/react';

import {
  DELETION_CONFIRMATION_PHRASE,
  deletionFailureOf,
  deletionLinkFrom,
  isDeletionPhraseTyped,
  requestAccountDeletion,
  requestFailureOf,
  resolveAccountDeletion,
  type DeletionAction,
  type DeletionLink,
  type DeletionRequestFailure,
  type DeletionResolution,
} from '@/lib/api/account-deletion';
import { apiDeps } from '@/lib/api/deps';
import type { ApiResult } from '@/lib/api/http';
import type { ReachFailure } from '@/lib/api/link-failure';
import { sessionStore } from '@/lib/api/session';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { useSearch } from '@/lib/router';

import { ActionButton, ActionLink, LinkAlert, LinkPage, LinkText, REACH_FAILURE_BODY, type ActionTone } from './link-page-parts';

/**
 * **`/account/deletion` — LA SUPPRESSION DE COMPTE** (#6715), obligation
 * réglementaire. Une adresse, deux entrées :
 *
 * 1. **Le lien de l'e-mail** — `?token=&action=confirm|cancel|purge`
 *    (`buildDeletionPageUrl`, `routes/me/delete-account.ts`). PUBLIC, comme le
 *    legacy : annuler sa suppression ne doit pas exiger l'accès au compte. La
 *    page DIT la conséquence, et c'est le CLIC qui appelle la passerelle — les
 *    liens visaient autrefois des `GET` qui mutaient, et un antivirus de
 *    messagerie confirmait la suppression sans qu'aucun humain ne clique
 *    (#4183). Une machine qui suit le lien ne voit que du texte.
 * 2. **Les réglages** — connecté, sans jeton : la demande, miroir
 *    `DeleteAccountView.swift` — la phrase à la lettre ET le mot de passe
 *    courant. Elle envoie l'e-mail qui porte les liens ci-dessus.
 *
 * Sans jeton ni session, le lien est incomplet : la page le dit, et propose de
 * se connecter pour faire la demande.
 */

export type AccountDeletionDeps = {
  readonly resolve: (link: DeletionLink) => Promise<ApiResult<DeletionResolution>>;
  readonly request: (currentPassword: string) => Promise<ApiResult<null>>;
};

const GATEWAY_DEPS: AccountDeletionDeps = {
  resolve: (link) => resolveAccountDeletion(apiDeps, link),
  request: (currentPassword) => requestAccountDeletion(apiDeps, currentPassword),
};

type PageProps = {
  readonly online: boolean;
  readonly language: InterfaceLanguage;
  readonly deps: AccountDeletionDeps;
};

export function AccountDeletionPage({
  link,
  signedIn,
  ...page
}: PageProps & { readonly link: DeletionLink | null; readonly signedIn: boolean }) {
  if (link !== null) return <DeletionLinkPage link={link} {...page} />;
  if (signedIn) return <DeletionRequestPage {...page} />;
  return <IncompleteLinkPage language={page.language} />;
}

export default function AccountDeletionScreen() {
  const [search] = useSearch();
  const online = useOnline();
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  return (
    <AccountDeletionPage
      link={deletionLinkFrom(search)}
      signedIn={signedIn}
      online={online}
      language={currentInterfaceLanguage()}
      deps={GATEWAY_DEPS}
    />
  );
}

const ACTION_COPY = {
  confirm: { title: 'accountDeletion.confirm.title', body: 'accountDeletion.confirm.body', action: 'accountDeletion.confirm.action', tone: 'danger' },
  cancel: { title: 'accountDeletion.cancel.title', body: 'accountDeletion.cancel.body', action: 'accountDeletion.cancel.action', tone: 'primary' },
  purge: { title: 'accountDeletion.purge.title', body: 'accountDeletion.purge.body', action: 'accountDeletion.purge.action', tone: 'danger' },
} as const satisfies Readonly<
  Record<DeletionAction, { readonly title: InterfaceCatalogKey; readonly body: InterfaceCatalogKey; readonly action: InterfaceCatalogKey; readonly tone: ActionTone }>
>;

type LinkState =
  | { readonly phase: 'ready'; readonly failure: ReachFailure | null }
  | { readonly phase: 'working' }
  | { readonly phase: 'done'; readonly resolution: DeletionResolution }
  | { readonly phase: 'closed'; readonly reason: 'expired' | 'invalid' };

function DeletionLinkPage({ link, online, language, deps }: PageProps & { readonly link: DeletionLink }) {
  const [state, setState] = useState<LinkState>({ phase: 'ready', failure: null });
  const copy = ACTION_COPY[link.action];

  async function resolve() {
    setState({ phase: 'working' });
    const result = await deps.resolve(link);
    if (result.ok) {
      setState({ phase: 'done', resolution: result.data });
      return;
    }
    const failure = deletionFailureOf(result);
    setState(failure === 'expired' || failure === 'invalid' ? { phase: 'closed', reason: failure } : { phase: 'ready', failure });
  }

  if (state.phase === 'done') return <DeletionDone resolution={state.resolution} language={language} />;
  if (state.phase === 'closed') {
    return (
      <LinkPage
        glyph="warningCircle"
        tone="danger"
        title={translate(language, 'accountDeletion.closed.title')}
        body={<LinkText>{translate(language, state.reason === 'expired' ? 'linkPage.expired' : 'accountDeletion.invalid')}</LinkText>}
      >
        <ActionLink to="list" tone="secondary">
          {translate(language, 'linkPage.home')}
        </ActionLink>
      </LinkPage>
    );
  }

  const working = state.phase === 'working';
  const failure = state.phase === 'ready' ? state.failure : null;
  return (
    <LinkPage
      glyph={link.action === 'cancel' ? 'check' : 'warningCircle'}
      tone={copy.tone === 'danger' ? 'danger' : 'brand'}
      title={translate(language, copy.title)}
      body={
        <>
          <LinkText>{translate(language, copy.body)}</LinkText>
          {online ? null : <LinkAlert>{translate(language, 'linkPage.offline.body')}</LinkAlert>}
          {failure === null ? null : <LinkAlert>{translate(language, REACH_FAILURE_BODY[failure])}</LinkAlert>}
        </>
      }
    >
      <ActionButton tone={copy.tone} disabled={working || !online} onClick={() => void resolve()}>
        {translate(language, working ? 'accountDeletion.working' : copy.action)}
      </ActionButton>
      <ActionLink to="list" tone="secondary">
        {translate(language, 'accountDeletion.dismiss')}
      </ActionLink>
    </LinkPage>
  );
}

function formattedDay(iso: string | null, language: InterfaceLanguage): string | null {
  if (iso === null) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

function doneMessage(resolution: DeletionResolution, language: InterfaceLanguage): string | null {
  if (resolution.status === 'CANCELLED') return translate(language, 'accountDeletion.done.cancelled');
  if (resolution.status === 'COMPLETED') return translate(language, 'accountDeletion.done.completed');
  const date = formattedDay(resolution.gracePeriodEndsAt, language);
  return date === null ? null : translate(language, 'accountDeletion.done.confirmed', { date });
}

function DeletionDone({ resolution, language }: { readonly resolution: DeletionResolution; readonly language: InterfaceLanguage }) {
  const message = doneMessage(resolution, language);
  return (
    <LinkPage
      glyph="check"
      tone="success"
      title={translate(language, 'accountDeletion.done.title')}
      body={
        <>
          {message === null ? null : <LinkText>{message}</LinkText>}
          {resolution.dataPurged ? <LinkText>{translate(language, 'accountDeletion.done.purged')}</LinkText> : null}
        </>
      }
    >
      <ActionLink to="list" tone="secondary">
        {translate(language, 'linkPage.home')}
      </ActionLink>
    </LinkPage>
  );
}

function IncompleteLinkPage({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <LinkPage
      glyph="warningCircle"
      tone="brand"
      title={translate(language, 'accountDeletion.incomplete.title')}
      body={<LinkText>{translate(language, 'accountDeletion.incomplete.body')}</LinkText>}
    >
      <ActionLink to="login" tone="primary">
        {translate(language, 'linkPage.signIn')}
      </ActionLink>
      <ActionLink to="list" tone="secondary">
        {translate(language, 'linkPage.home')}
      </ActionLink>
    </LinkPage>
  );
}

const REQUEST_FAILURE_COPY = {
  'wrong-password': 'accountDeletion.request.wrongPassword',
  'already-pending': 'accountDeletion.request.alreadyPending',
  'no-email': 'accountDeletion.request.noEmail',
  'signed-out': 'linkPage.signedOut.body',
  ...REACH_FAILURE_BODY,
} as const satisfies Readonly<Record<DeletionRequestFailure, InterfaceCatalogKey>>;

type RequestState =
  | { readonly phase: 'editing'; readonly failure: DeletionRequestFailure | null }
  | { readonly phase: 'sending' }
  | { readonly phase: 'sent' };

const FIELD_CLASS = 'w-full rounded-[14px] px-4 text-body focus-visible:outline-2';

const FIELD_STYLE = {
  minHeight: 52,
  color: 'var(--color-ios-ink)',
  backgroundColor: 'var(--color-ios-card)',
  border: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 60%, transparent)',
  outlineColor: 'var(--color-ios-brand)',
} as const;

/** Le texte de l'invite autour de la phrase, pour que la phrase se lise en chasse fixe là où la LANGUE la place. */
function aroundPhrase(prompt: string): readonly [string, string] {
  const index = prompt.indexOf(DELETION_CONFIRMATION_PHRASE);
  return index < 0 ? [prompt, ''] : [prompt.slice(0, index), prompt.slice(index + DELETION_CONFIRMATION_PHRASE.length)];
}

function DeletionRequestPage({ online, language, deps }: PageProps) {
  const [phrase, setPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<RequestState>({ phase: 'editing', failure: null });

  const sending = state.phase === 'sending';
  const ready = isDeletionPhraseTyped(phrase) && password !== '' && online && !sending;

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setState({ phase: 'sending' });
    const result = await deps.request(password);
    if (result.ok) {
      setPassword('');
      setState({ phase: 'sent' });
      return;
    }
    setState({ phase: 'editing', failure: requestFailureOf(result) });
  }

  if (state.phase === 'sent') {
    return (
      <LinkPage
        glyph="envelopeOpen"
        tone="brand"
        title={translate(language, 'accountDeletion.request.sent.title')}
        body={<LinkText>{translate(language, 'accountDeletion.request.sent.body')}</LinkText>}
      >
        <ActionLink to="settings" tone="secondary">
          {translate(language, 'linkPage.settings')}
        </ActionLink>
      </LinkPage>
    );
  }

  const failure = state.phase === 'editing' ? state.failure : null;
  const [before, after] = aroundPhrase(translate(language, 'accountDeletion.request.phrase', { phrase: DELETION_CONFIRMATION_PHRASE }));
  return (
    <LinkPage
      glyph="warningCircle"
      tone="danger"
      title={translate(language, 'accountDeletion.request.title')}
      body={<LinkText>{translate(language, 'accountDeletion.request.body')}</LinkText>}
    >
      <form className="grid gap-3 text-start" noValidate onSubmit={(event) => void send(event)}>
        <label htmlFor="account-deletion-phrase" style={{ color: 'var(--color-ios-ink)' }}>
          {before}
          <strong style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{DELETION_CONFIRMATION_PHRASE}</strong>
          {after}
        </label>
        <input
          id="account-deletion-phrase"
          value={phrase}
          onInput={(event) => setPhrase(event.currentTarget.value)}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className={FIELD_CLASS}
          style={FIELD_STYLE}
        />
        <label htmlFor="account-deletion-password" style={{ color: 'var(--color-ios-ink)' }}>
          {translate(language, 'accountDeletion.request.password')}
        </label>
        <input
          id="account-deletion-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onInput={(event) => setPassword(event.currentTarget.value)}
          className={FIELD_CLASS}
          style={FIELD_STYLE}
        />
        {online ? null : <LinkAlert>{translate(language, 'linkPage.offline.body')}</LinkAlert>}
        {failure === null ? null : <LinkAlert>{translate(language, REQUEST_FAILURE_COPY[failure])}</LinkAlert>}
        <ActionButton type="submit" tone="danger" disabled={!ready}>
          {translate(language, sending ? 'accountDeletion.working' : 'accountDeletion.request.action')}
        </ActionButton>
        <ActionLink to="settings" tone="secondary">
          {translate(language, 'accountDeletion.dismiss')}
        </ActionLink>
      </form>
    </LinkPage>
  );
}
