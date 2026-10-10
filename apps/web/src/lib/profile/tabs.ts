/**
 * **LES ONGLETS DU PROFIL** (#6330) — miroir de `ProfileTab`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift`) :
 * Publications, Conversations, Détails, Détails ouvert d'abord.
 *
 * L'onglet ouvert se lit dans l'adresse (`?tab=`) pour qu'un retour arrière,
 * un lien partagé ou un rechargement rouvre le même. Une adresse est une
 * entrée NON FIABLE : un onglet inconnu, ou qui n'existe pas sur CETTE fiche
 * (les conversations en commun avec soi-même), retombe sur le défaut au lieu
 * de monter un panneau vide.
 */

export type ProfileTabId = 'posts' | 'conversations' | 'details' | 'activity';

export const USER_PROFILE_TABS = ['posts', 'conversations', 'details'] as const satisfies readonly ProfileTabId[];

export const MY_PROFILE_TABS = ['details', 'posts', 'activity'] as const satisfies readonly ProfileTabId[];

export const PROFILE_TAB_PARAM = 'tab';

export const userProfileTabs = ({ conversations }: { readonly conversations: boolean }): readonly ProfileTabId[] =>
  conversations ? USER_PROFILE_TABS : USER_PROFILE_TABS.filter((tab) => tab !== 'conversations');

export const resolveProfileTab = <T extends ProfileTabId>({
  requested,
  offered,
  fallback,
}: {
  readonly requested: string | null;
  readonly offered: readonly T[];
  readonly fallback: T;
}): T => offered.find((tab) => tab === requested) ?? fallback;

const STEPS: Readonly<Record<string, (index: number, last: number, forward: number) => number>> = {
  ArrowRight: (index, _last, forward) => index + forward,
  ArrowLeft: (index, _last, forward) => index - forward,
  Home: () => 0,
  End: (_index, last) => last,
};

export const steppedTab = <T extends string>({
  tabs,
  current,
  key,
  rtl,
}: {
  readonly tabs: readonly T[];
  readonly current: T;
  readonly key: string;
  readonly rtl: boolean;
}): T | null => {
  const step = STEPS[key];
  if (step === undefined || tabs.length === 0) return null;
  const target = step(tabs.indexOf(current), tabs.length - 1, rtl ? -1 : 1);
  return tabs[(target + tabs.length) % tabs.length] ?? null;
};
