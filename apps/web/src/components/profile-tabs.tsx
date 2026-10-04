import { useCallback, useId, useState, type KeyboardEvent, type ReactNode } from 'react';

import { GlyphSvg } from '@/components/glyph';
import { PROFILE_GLYPHS } from '@/components/glyphs-profile';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { PROFILE_TAB_PARAM, resolveProfileTab, steppedTab, type ProfileTabId } from '@/lib/profile/tabs';
import { navigate, useOptionalRoute } from '@/lib/router';

/**
 * **LA BARRE D'ONGLETS DU PROFIL** (#6330) — `pinnedTabBar`
 * (`UserProfileSheet+Header.swift`) : icône + libellé, filet de 2 px de la
 * couleur du profil sous l'onglet actif, épinglée en haut du défilement une
 * fois la bannière passée.
 *
 * Onglets ARIA : un seul onglet dans l'ordre de tabulation (l'actif), les
 * flèches parcourent la liste DANS LE SENS DE LECTURE — une interface arabe
 * avance avec la flèche gauche —, Début et Fin vont aux extrémités, et un
 * onglet qui prend le focus s'ouvre. La sélection ne repose jamais sur la
 * seule couleur : le filet et la graisse la portent aussi.
 *
 * **Le LIBELLÉ actif est à l'encre, pas à l'accent** — écart assumé avec iOS :
 * mesuré au gate, l'accent tombe à 4,22:1 en sombre et la marque à 4,47:1 en
 * clair, sous l'AA d'un libellé de 15 px. L'accent garde l'icône et le filet,
 * qui ne sont pas du texte.
 */

const TAB_COPY = {
  posts: { label: 'userProfile.tab.posts', glyph: PROFILE_GLYPHS.quotes },
  conversations: { label: 'userProfile.tab.conversations', glyph: PROFILE_GLYPHS.chatCircle },
  details: { label: 'userProfile.tab.details', glyph: PROFILE_GLYPHS.identificationCard },
  activity: { label: 'userProfile.tab.activity', glyph: PROFILE_GLYPHS.chartBar },
} as const satisfies Readonly<Record<ProfileTabId, { readonly label: InterfaceCatalogKey; readonly glyph: (typeof PROFILE_GLYPHS)[keyof typeof PROFILE_GLYPHS] }>>;

export const profileTabId = (base: string, tab: ProfileTabId): string => `${base}-tab-${tab}`;
export const profileTabPanelId = (base: string, tab: ProfileTabId): string => `${base}-panel-${tab}`;

const isRtl = (element: Element): boolean => getComputedStyle(element).direction === 'rtl' || element.closest('[dir="rtl"]') !== null;

export function ProfileTabs<T extends ProfileTabId>({
  language,
  tabs,
  active,
  onChange,
  idBase,
  accent = 'var(--color-ios-brand)',
  badges = {},
}: {
  readonly language: InterfaceLanguage;
  readonly tabs: readonly T[];
  readonly active: T;
  readonly onChange: (tab: T) => void;
  readonly idBase: string;
  readonly accent?: string;
  /** Une pastille par onglet (« 3 » demandes en attente), avec ce qu'elle dit au lecteur d'écran. */
  readonly badges?: Partial<Record<T, { readonly text: string; readonly label: string }>>;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = steppedTab({ tabs, current: active, key: event.key, rtl: isRtl(event.currentTarget) });
    if (next === null) return;
    event.preventDefault();
    onChange(next);
    document.getElementById(profileTabId(idBase, next))?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={translate(language, 'userProfile.tabs.label')}
      data-profile-tabs
      className="sticky top-0 z-10 -mx-4 flex min-w-0 px-4"
      style={{
        backgroundColor: 'var(--color-ios-surface)',
        borderBottom: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 22%, transparent)',
      }}
    >
      {tabs.map((tab) => {
        const selected = tab === active;
        const copy = TAB_COPY[tab];
        const label = translate(language, copy.label);
        const badge = badges[tab];
        return (
          <button
            key={tab}
            id={profileTabId(idBase, tab)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={profileTabPanelId(idBase, tab)}
            {...(badge === undefined ? {} : { 'aria-label': `${label}, ${badge.label}` })}
            tabIndex={selected ? 0 : -1}
            data-profile-tab={tab}
            onClick={() => onChange(tab)}
            onKeyDown={onKeyDown}
            className="relative flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 px-1 pt-2.5 pb-3 text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2"
            style={{
              color: selected ? 'var(--color-ios-ink)' : 'var(--color-ios-ink-2)',
              fontWeight: selected ? 700 : 600,
              outlineColor: accent,
            }}
          >
            <GlyphSvg glyph={copy.glyph} size={14} className="shrink-0 max-[359px]:hidden" {...(selected ? { style: { color: accent } } : {})} />
            <span className="truncate">{label}</span>
            {badge === undefined ? null : (
              <span
                aria-hidden="true"
                data-profile-tab-badge={tab}
                className="grid place-items-center rounded-chip px-1.5 text-chip font-bold"
                style={{ minWidth: 18, height: 18, color: 'var(--color-ios-on-brand)', backgroundColor: 'var(--ios-indigo-600)' }}
              >
                {badge.text}
              </span>
            )}
            <span
              aria-hidden="true"
              className="absolute inset-x-2 bottom-0 h-0.5 rounded-chip"
              style={{ backgroundColor: selected ? accent : 'transparent' }}
            />
          </button>
        );
      })}
    </div>
  );
}

/** Le panneau d'un onglet, nommé par lui. Seul le panneau actif est monté. */
export function ProfileTabPanel({
  idBase,
  tab,
  children,
}: {
  readonly idBase: string;
  readonly tab: ProfileTabId;
  readonly children: ReactNode;
}) {
  return (
    <div role="tabpanel" id={profileTabPanelId(idBase, tab)} aria-labelledby={profileTabId(idBase, tab)} data-profile-panel={tab} className="grid gap-6">
      {children}
    </div>
  );
}

/**
 * L'onglet ouvert, lu dans `?tab=` et réécrit EN PLACE (`replace`) : changer
 * d'onglet n'empile pas d'entrée d'historique — le retour arrière quitte la
 * fiche, comme sur iOS. Hors routeur (un témoin monte la vue seule), l'onglet
 * vit dans l'état local de l'hôte et l'adresse n'est pas touchée.
 */
export function useProfileTab<T extends ProfileTabId>({
  offered,
  fallback,
}: {
  readonly offered: readonly T[];
  readonly fallback: T;
}): readonly [T, (tab: T) => void, string] {
  const route = useOptionalRoute();
  const [local, setLocal] = useState<T | null>(null);
  const idBase = useId();
  const requested = route === null ? local : route.search.get(PROFILE_TAB_PARAM);
  const active = resolveProfileTab({ requested, offered, fallback });
  const select = useCallback(
    (tab: T) => {
      setLocal(tab);
      if (route === null) return;
      const next = new URLSearchParams(route.search);
      if (tab === fallback) next.delete(PROFILE_TAB_PARAM);
      else next.set(PROFILE_TAB_PARAM, tab);
      const chain = next.toString();
      navigate(`${window.location.pathname}${chain === '' ? '' : `?${chain}`}`, true);
    },
    [fallback, route],
  );
  return [active, select, idBase] as const;
}
