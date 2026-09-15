import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import { apiDeps } from '@/lib/api/deps';
import {
  emailNotificationsFailureOf,
  loadEmailNotifications,
  saveEmailNotifications,
  type EmailNotificationsFailure,
} from '@/lib/api/email-notifications';
import type { ApiResult } from '@/lib/api/http';
import { sessionStore } from '@/lib/api/session';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

import { ActionButton, ActionLink, LinkAlert, LinkPage, LinkText, ReachFailurePage, SignedOutPage } from './link-page-parts';

/**
 * **`/settings/notifications` — SE DÉSABONNER DES E-MAILS** (#6715). Le lien
 * que chaque diffusion porte en pied de message
 * (`jobs/broadcast-sender.ts`, `unsubscribeUrl`). Le legacy ne servait AUCUNE
 * page à cette adresse : ses réglages vivaient sous `/settings#…`, et le lien
 * de désabonnement menait à la page introuvable.
 *
 * **Arriver ne désabonne pas.** La page lit l'état, le DIT, et un geste le
 * retourne. Un pré-chargeur de lien (antivirus de messagerie, aperçu d'une
 * messagerie) suit les liens des e-mails : un désabonnement au montage
 * désabonnerait des gens qui n'ont rien demandé (#4183, même leçon que la
 * suppression de compte). Le nominal reste à deux gestes : ouvrir, toucher.
 *
 * **Le geste est optimiste** : l'état change au toucher, la passerelle
 * confirme ensuite, et un refus le défait en le disant.
 *
 * **Une page à part, pas une rangée des réglages** : l'écran des réglages ne
 * porte pas ce réglage (voir `lib/api/email-notifications.ts`), et une adresse
 * que les e-mails ont déjà envoyée doit mener À l'effet promis, pas à une
 * liste où le chercher. Elle agit sur le compte connecté : sans session, elle
 * ne lit rien et le dit.
 */

export type EmailNotificationsPageDeps = {
  readonly load: () => Promise<ApiResult<boolean>>;
  readonly save: (enabled: boolean) => Promise<ApiResult<boolean>>;
};

const GATEWAY_DEPS: EmailNotificationsPageDeps = {
  load: () => loadEmailNotifications(apiDeps),
  save: (enabled) => saveEmailNotifications(apiDeps, enabled),
};

export function EmailNotificationsPage({
  signedIn,
  language,
  deps,
}: {
  readonly signedIn: boolean;
  readonly language: InterfaceLanguage;
  readonly deps: EmailNotificationsPageDeps;
}) {
  if (!signedIn) return <SignedOutPage language={language} />;
  return <EmailPreference language={language} deps={deps} />;
}

export default function SettingsNotificationsScreen() {
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  return <EmailNotificationsPage signedIn={signedIn} language={currentInterfaceLanguage()} deps={GATEWAY_DEPS} />;
}

type PreferenceState =
  | { readonly phase: 'loading' }
  | { readonly phase: 'failed'; readonly failure: EmailNotificationsFailure }
  | { readonly phase: 'ready'; readonly enabled: boolean; readonly saving: boolean; readonly refused: boolean };

function EmailPreference({ language, deps }: { readonly language: InterfaceLanguage; readonly deps: EmailNotificationsPageDeps }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PreferenceState>({ phase: 'loading' });
  const started = useRef<number | null>(null);

  useEffect(() => {
    if (started.current === attempt) return;
    started.current = attempt;
    void load();

    async function load() {
      const result = await deps.load();
      setState(
        result.ok
          ? { phase: 'ready', enabled: result.data, saving: false, refused: false }
          : { phase: 'failed', failure: emailNotificationsFailureOf(result) },
      );
    }
  }, [attempt]);

  async function toggle(current: boolean) {
    setState({ phase: 'ready', enabled: !current, saving: true, refused: false });
    const result = await deps.save(!current);
    setState(
      result.ok
        ? { phase: 'ready', enabled: result.data, saving: false, refused: false }
        : { phase: 'ready', enabled: current, saving: false, refused: true },
    );
  }

  const retry = () => {
    setState({ phase: 'loading' });
    setAttempt((count) => count + 1);
  };

  const title = translate(language, 'emailNotifications.title');

  if (state.phase === 'loading') {
    return <LinkPage glyph="bell" tone="brand" title={title} busy body={<LinkText>{translate(language, 'emailNotifications.loading')}</LinkText>} />;
  }

  if (state.phase === 'failed') {
    return state.failure === 'signed-out' ? (
      <SignedOutPage language={language} />
    ) : (
      <ReachFailurePage language={language} failure={state.failure} onRetry={retry} />
    );
  }

  const { enabled, saving, refused } = state;
  return (
    <LinkPage
      glyph={enabled ? 'bell' : 'bellSlash'}
      tone="brand"
      title={title}
      body={
        <>
          <LinkText>{translate(language, enabled ? 'emailNotifications.on' : 'emailNotifications.off')}</LinkText>
          <LinkText>{translate(language, 'emailNotifications.security')}</LinkText>
          {refused ? <LinkAlert>{translate(language, 'emailNotifications.failed')}</LinkAlert> : null}
        </>
      }
    >
      <ActionButton disabled={saving} onClick={() => void toggle(enabled)}>
        {translate(language, enabled ? 'emailNotifications.unsubscribe' : 'emailNotifications.resubscribe')}
      </ActionButton>
      <ActionLink to="settings" tone="secondary">
        {translate(language, 'linkPage.settings')}
      </ActionLink>
    </LinkPage>
  );
}
