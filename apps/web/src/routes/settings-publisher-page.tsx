import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';

import { GlyphSvg } from '@/components/glyph';
import { SETTINGS_GLYPHS } from '@/components/glyphs-settings';
import { GroupedSection, SECTION_INK, SECTION_INK_2 } from '@/components/grouped-section';
import { IosSwitch } from '@/components/ios-switch';
import { apiDeps } from '@/lib/api/deps';
import {
  partnerProfileQueryOptions,
  performShowOwnerProfileEdit,
  type PartnerOwnerProfile,
  type ShowOwnerProfileOutcome,
} from '@/lib/api/partner-profile';
import { appQueryClient } from '@/lib/api/query-client';
import { isPublisherPageCatalogLoaded, loadPublisherPageCatalog, translatePublisherPage } from '@/lib/i18n-publisher-page-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LA PAGE ÉDITEUR** (#16440, décision porteur du 2026-11-06) — Réglages :
 * un interrupteur « Afficher mon profil Meeshy sur ma page éditeur », ÉTEINT
 * par défaut. Il n'existe que pour un compte qui a un profil d'éditeur
 * (`GET /lens/partners/me` non nul) : sans profil, pendant la lecture ou si
 * elle échoue, la section est ABSENTE — une fonction fermée ne s'affiche pas.
 *
 * La section est PURE (`PublisherPageSectionView`) ; `PublisherPageSection`
 * la branche sur sa requête et sur l'écriture optimiste
 * (`performShowOwnerProfileEdit`). Ses libellés vivent hors du catalogue
 * d'interface : la section attend le sien.
 */

export type PublisherPageView =
  | { readonly kind: 'ready'; readonly displayName: string; readonly showOwnerProfile: boolean }
  | { readonly kind: 'none' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' };

function usePublisherPageCatalog(language: InterfaceLanguage): boolean {
  const [, setLoaded] = useState<InterfaceLanguage | null>(null);
  useEffect(() => {
    if (isPublisherPageCatalogLoaded(language)) return undefined;
    let live = true;
    loadPublisherPageCatalog(language).then(
      () => {
        if (live) setLoaded(language);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [language]);
  return isPublisherPageCatalogLoaded(language);
}

function ShowOwnerRow({
  language,
  displayName,
  enabled,
  disabled,
  onToggle,
}: {
  readonly language: InterfaceLanguage;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly disabled: boolean;
  readonly onToggle: (show: boolean) => void;
}) {
  const captionId = useId();
  const name = translatePublisherPage(language, 'publisherPage.showOwner');
  const caption = translatePublisherPage(language, 'publisherPage.caption').replace('{name}', displayName);
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5" style={{ minHeight: 52 }}>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="break-words text-body" style={{ color: SECTION_INK }}>
          {name}
        </span>
        <span id={captionId} className="break-words text-caption" style={{ color: SECTION_INK_2 }}>
          {caption}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={name}
        aria-describedby={captionId}
        data-setting="publisher-show-owner"
        {...(disabled ? { disabled: true } : {})}
        onClick={() => onToggle(!enabled)}
        className="grid shrink-0 place-items-center rounded-chip focus-visible:outline-2 active:opacity-80"
        style={{ minWidth: 56, minHeight: 44, outlineColor: 'var(--color-ios-brand)', ...(disabled ? { opacity: 0.5 } : {}) }}
      >
        <IosSwitch checked={enabled} />
      </button>
    </div>
  );
}

export function PublisherPageSectionView({
  language,
  view,
  disabled,
  onToggle,
}: {
  readonly language: InterfaceLanguage;
  readonly view: PublisherPageView;
  readonly disabled: boolean;
  readonly onToggle: (show: boolean) => void;
}) {
  const catalogReady = usePublisherPageCatalog(language);
  if (!catalogReady || view.kind !== 'ready') return null;
  return (
    <GroupedSection
      id="settings-publisher-page"
      title={translatePublisherPage(language, 'publisherPage.title').toLocaleUpperCase(language)}
      icon={<GlyphSvg glyph={SETTINGS_GLYPHS.userCircle} size={12} />}
    >
      <ShowOwnerRow language={language} displayName={view.displayName} enabled={view.showOwnerProfile} disabled={disabled} onToggle={onToggle} />
    </GroupedSection>
  );
}

const viewOf = (data: PartnerOwnerProfile | null | undefined, status: string): PublisherPageView => {
  if (data === null) return { kind: 'none' };
  if (data !== undefined) return { kind: 'ready', displayName: data.displayName, showOwnerProfile: data.showOwnerProfile };
  return status === 'error' ? { kind: 'error' } : { kind: 'loading' };
};

export function PublisherPageSection({
  language,
  enabled,
  online,
  onOutcome,
}: {
  readonly language: InterfaceLanguage;
  readonly enabled: boolean;
  readonly online: boolean;
  readonly onOutcome: (outcome: ShowOwnerProfileOutcome) => void;
}) {
  const query = useQuery({ ...partnerProfileQueryOptions(apiDeps), enabled }, appQueryClient);
  const toggle = (show: boolean) => {
    void performShowOwnerProfileEdit({
      show,
      deps: { ...apiDeps, queryClient: appQueryClient, isOnline: () => navigator.onLine },
    }).then(onOutcome);
  };
  return <PublisherPageSectionView language={language} view={viewOf(query.data, query.status)} disabled={!online} onToggle={toggle} />;
}
