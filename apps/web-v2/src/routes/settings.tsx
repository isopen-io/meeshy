import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import { adminIdentityQueryOptions } from '@/lib/api/admin';
import { canEnterAdmin } from '@/lib/admin/sections';
import { performPreferenceEdit, type PreferenceActionDeps } from '@/lib/api/app-preferences-actions';
import { appPreferencesQueryOptions, type PreferencesPatch, type ThemeMode } from '@/lib/api/app-preferences';
import { logout } from '@/lib/api/auth';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import {
  currentInterfaceLanguage,
  followBrowserInterfaceLanguage,
  interfaceLanguageChoice,
  setInterfaceLanguage,
  type InterfaceLanguage,
} from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { currentThemePreference, setThemePreference, type ThemePreference } from '@/lib/scheme';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import { href, navigate } from '@/routes/route-table';
import {
  AboutSection,
  AccountSection,
  AppearanceSection,
  DataSection,
  LogoutButton,
  NotificationsSection,
  PrivacySection,
  ProfileCard,
  SettingsHeaderBar,
  SettingsOfflineNotice,
  SettingsContent,
  ToolsSection,
  type BooleanPreference,
  type PreferencesView,
} from '@/routes/settings-sections';

/**
 * **LES RÉGLAGES** (#5563) — miroir `SettingsView.swift`. Remplace l'écran
 * d'attente de #6214.
 *
 * **Chaque contrôle a un effet mesurable** :
 *  - le THÈME bascule à chaud (`setThemePreference`, une classe sur `<html>`)
 *    et persiste sur l'appareil — le script d'amorçage le relit avant la
 *    première peinture ; il est AUSSI écrit dans `application.theme`, que les
 *    autres appareils relisent (iOS, `ThemeManager.observeRemoteThemeSync`) ;
 *  - la LANGUE DE L'INTERFACE se pose à chaud : la racine remonte l'arbre sous
 *    la nouvelle langue (`main.tsx § InterfaceLanguageRoot`) ;
 *  - les BASCULES sont optimistes et se défont sur un refus
 *    (`lib/api/app-preferences-actions.ts`) ; la passerelle les obéit ;
 *  - la DÉCONNEXION purge la session d'abord, puis prévient la passerelle
 *    (`auth.ts#logout`), et mène à l'écran de connexion.
 *
 * **Cache d'abord.** Les réglages lus viennent du cache de requêtes persisté :
 * rouvrir l'écran les peint au premier rendu, et le squelette n'existe que
 * pour un cache vide. Le thème et la langue ne dépendent d'aucun réseau.
 */

const THEME_MODE: Readonly<Record<ThemePreference, ThemeMode>> = { system: 'auto', light: 'light', dark: 'dark' };

const actionDeps = (): PreferenceActionDeps => ({
  ...apiDeps,
  queryClient: appQueryClient,
  isOnline: () => navigator.onLine,
});

const togglePatch = (key: BooleanPreference, value: boolean): PreferencesPatch => ({ [key]: value });

function LogoutConfirm({
  language,
  onConfirm,
  onCancel,
}: {
  readonly language: InterfaceLanguage;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useBackDismiss(onCancel);
  useEffect(() => {
    const element = dialog.current;
    if (element !== null && !element.open) element.showModal();
  }, []);
  /* `flex-auto` SANS `min-w-0` : un bouton ne rétrécit jamais sous son libellé ;
     à 320 px, les deux se superposent plutôt que de tronquer « Déconnexion ». */
  const buttonClass = 'grid flex-auto place-items-center rounded-chip px-4 text-body font-semibold focus-visible:outline-2';
  return (
    <dialog
      ref={dialog}
      data-logout-confirm
      aria-labelledby="settings-logout-title"
      aria-describedby="settings-logout-message"
      onClose={onCancel}
      className="m-auto w-[min(22rem,calc(100vw-2rem))] rounded-card p-5 backdrop:bg-[rgb(0_0_0/0.45)]"
      style={{ backgroundColor: 'var(--color-ios-surface)', color: 'var(--color-ios-ink)' }}
    >
      <h2 id="settings-logout-title" className="text-body font-bold">
        {translate(language, 'settings.logout.title')}
      </h2>
      <p id="settings-logout-message" className="mt-1.5 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, 'settings.logout.message')}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          data-logout-cancel
          onClick={() => dialog.current?.close()}
          className={buttonClass}
          style={{ minHeight: 44, outlineColor: 'var(--color-ios-brand)', backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 16%, transparent)' }}
        >
          {translate(language, 'common.cancel')}
        </button>
        <button
          type="button"
          data-logout-proceed
          onClick={onConfirm}
          className={buttonClass}
          style={{ minHeight: 44, color: 'white', outlineColor: 'var(--color-danger)', backgroundColor: 'var(--color-danger)' }}
        >
          {translate(language, 'settings.logout.title')}
        </button>
      </div>
    </dialog>
  );
}

const notices = {
  offline: 'settings.offline.body',
  refused: 'settings.save.error',
} as const satisfies Readonly<Record<string, InterfaceCatalogKey>>;

export default function SettingsScreen() {
  const language = currentInterfaceLanguage();

  /**
   * L'ENTRÉE de l'administration (#6432) — visible seulement pour qui y a
   * droit. Le droit vient du SERVEUR : `SessionUser` ne projette pas `role`.
   *
   * `retry: false` et aucune remontée d'erreur : un refus (403) ou une panne
   * laisse simplement la rangée absente. C'est le bon défaut — la rangée n'est
   * qu'un chemin de DÉCOUVERTE, la garde étant refaite par l'écran `/admin`
   * lui-même. Une erreur affichée ici apprendrait à un visiteur ordinaire
   * qu'il existe un espace qu'on lui refuse.
   */
  const droits = useQuery(adminIdentityQueryOptions(apiDeps));
  const peutAdministrer = canEnterAdmin(droits.data?.permissions ?? null);
  const online = useOnline();
  const sessionUser = useStore(sessionStore, (state) => (state.session.status === 'authenticated' ? state.session.user : null));
  const enabled = apiDeps.source === 'fixtures' || sessionUser !== null;
  const query = useQuery({ ...appPreferencesQueryOptions(apiDeps), enabled }, appQueryClient);

  const [theme, setTheme] = useState<ThemePreference>(currentThemePreference);
  const [interfaceChoice, setInterfaceChoice] = useState<InterfaceLanguage | null>(interfaceLanguageChoice);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (notice === null) return undefined;
    const handle = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(handle);
  }, [notice]);

  const view: PreferencesView =
    query.data !== undefined ? { kind: 'ready', preferences: query.data } : query.status === 'error' ? { kind: 'error' } : { kind: 'loading' };

  const chooseTheme = (preference: ThemePreference) => {
    setThemePreference(preference);
    setTheme(preference);
    if (!enabled) return;
    void performPreferenceEdit({ patch: { theme: THEME_MODE[preference] }, deps: actionDeps() }).then((outcome) => {
      if (outcome.status === 'refused') setNotice(translate(language, 'settings.theme.sync_error'));
    });
  };

  const toggle = (key: BooleanPreference, value: boolean) => {
    void performPreferenceEdit({ patch: togglePatch(key, value), deps: actionDeps() }).then((outcome) => {
      if (outcome.status !== 'saved') setNotice(translate(language, notices[outcome.status]));
    });
  };

  const chooseInterfaceLanguage = (choice: InterfaceLanguage | null) => {
    setInterfaceChoice(choice);
    const change = choice === null ? followBrowserInterfaceLanguage() : setInterfaceLanguage(choice);
    change.catch(() => {
      setInterfaceChoice(interfaceLanguageChoice());
      setNotice(translate(language, 'settings.save.error'));
    });
  };

  const logOut = async () => {
    setConfirming(false);
    setLoggingOut(true);
    await logout().catch(() => undefined);
    navigate(href('login'), true);
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <SettingsHeaderBar language={language} />
      <main id="contenu" className="flex-1 overflow-y-auto px-4 pb-safe">
        <SettingsContent>
          {online ? null : <SettingsOfflineNotice language={language} />}
          <ProfileCard
            language={language}
            user={sessionUser === null ? null : { username: sessionUser.username, displayName: sessionUser.displayName ?? null, avatar: sessionUser.avatar ?? null }}
          />
          <AccountSection language={language} />
          <PrivacySection language={language} view={view} disabled={!online} onToggle={toggle} onRetry={() => void query.refetch()} />
          <AppearanceSection
            language={language}
            theme={theme}
            onTheme={chooseTheme}
            interfaceChoice={interfaceChoice}
            onInterfaceLanguage={chooseInterfaceLanguage}
            primaryLanguage={sessionUser?.systemLanguage ?? null}
          />
          <NotificationsSection
            language={language}
            view={view}
            disabled={!online}
            onToggle={toggle}
            onRetry={() => void query.refetch()}
          />
          <DataSection language={language} />
          <ToolsSection language={language} showAdmin={peutAdministrer} />
          <AboutSection language={language} version={__APP_VERSION__} />
          <LogoutButton language={language} busy={loggingOut} onPress={() => setConfirming(true)} />
        </SettingsContent>
      </main>
      {confirming ? <LogoutConfirm language={language} onConfirm={() => void logOut()} onCancel={() => setConfirming(false)} /> : null}
      <p
        role="status"
        aria-live="polite"
        data-settings-notice
        className="pointer-events-none fixed inset-x-4 bottom-6 mx-auto max-w-sm rounded-chip px-4 py-2.5 text-center text-caption font-semibold empty:hidden"
        style={{ color: 'var(--color-ios-surface)', backgroundColor: 'var(--color-ios-ink)' }}
      >
        {notice ?? ''}
      </p>
    </div>
  );
}
