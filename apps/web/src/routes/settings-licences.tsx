import type { ReactNode } from 'react';

import { CHROME_ACTION_HIT_CLASS, ChromeActionDisc } from '@/components/chrome-action';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { SETTINGS_GLYPHS } from '@/components/glyphs-settings';
import { SECTION_BRAND_INK, SECTION_CARD_STYLE, SECTION_INK, SECTION_INK_2 } from '@/components/grouped-section';
import { translate } from '@/lib/i18n-catalog';
import { loadLicencesCatalog, translateLicences, type LicencesCatalogKey } from '@/lib/i18n-licences-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { AGPL_3_0_TEXT } from '@/lib/licences/agpl-3.0-text';
import { WEB_LIBSIGNAL_ENGINE, type LibsignalEngine } from '@/lib/licences/libsignal-engine';
import { sourceOfferFor, type SourceOffer } from '@/lib/licences/source-offer';
import { Link } from '@/routes/route-table';

/**
 * **LES LICENCES** (#14628) — le volet `?volet=licences` des réglages, miroir de
 * `LicensesView.swift` : la licence de Meeshy (sources MIT), l'offre de source
 * au commit du bundle et, quand le bundle embarque le moteur WASM de libsignal,
 * la mention AGPL-3.0, le texte intégral de la licence (embarqué, jamais
 * téléchargé) et le renvoi aux avis de libsignal. Chargé à la demande avec ses
 * libellés : rien n'en entre dans la première peinture.
 *
 * Ingénierie de conformité, pas un avis juridique : la rédaction finale attend
 * l'avocat du projet (#11548).
 */

export const prepareSettingsLicences = (language: InterfaceLanguage): Promise<unknown> => loadLicencesCatalog(language);

type ScreenProps = {
  readonly language: InterfaceLanguage;
  readonly commit?: string | null;
  readonly engine?: LibsignalEngine | null;
};

export function SettingsLicencesScreen({ language, commit = __BUILD_COMMIT__, engine = WEB_LIBSIGNAL_ENGINE }: ScreenProps) {
  const t = (key: LicencesCatalogKey) => translateLicences(language, key);
  const offer = sourceOfferFor(commit);
  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe" data-settings-licences-screen>
      <header className="flex shrink-0 items-center gap-1 px-2" style={{ height: 64 }}>
        <Link
          to="settings"
          aria-label={translate(language, 'pending.back')}
          className={`${CHROME_ACTION_HIT_CLASS} focus-visible:outline-2 focus-visible:outline-offset-2`}
          style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
        >
          <ChromeActionDisc>
            <Glyph name="caretLeft" size={16} className="rtl:-scale-x-100" />
          </ChromeActionDisc>
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-body font-semibold" style={{ color: SECTION_INK }}>
          {t('licences.title')}
        </h1>
      </header>
      <main id="contenu" className="flex-1 overflow-y-auto px-4 pb-safe">
        <div className="mx-auto grid max-w-xl gap-6 pb-24 pt-2">
          <LicenceSection id="licences-meeshy" title={t('licences.meeshy.title')} language={language}>
            <p data-licences-statement className="px-3.5 py-3 text-body" style={{ color: SECTION_INK }}>
              {t(engine === null ? 'licences.meeshy.body_mit' : 'licences.meeshy.body')}
            </p>
            <SourceRow language={language} offer={offer} />
          </LicenceSection>
          {engine === null ? null : <AgplSections language={language} engine={engine} />}
          <p className="px-1 text-caption" style={{ color: SECTION_INK_2 }}>
            {t('licences.legal_review')}
          </p>
        </div>
      </main>
    </div>
  );
}

function LicenceSection({
  id,
  title,
  language,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly language: InterfaceLanguage;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid gap-2">
      <h2 id={id} className={`ps-1 text-check font-bold tracking-wide ${SECTION_BRAND_INK}`}>
        {title.toLocaleUpperCase(language)}
      </h2>
      <div className="grid overflow-hidden rounded-card" style={SECTION_CARD_STYLE}>
        {children}
      </div>
    </section>
  );
}

function SourceRow({ language, offer }: { readonly language: InterfaceLanguage; readonly offer: SourceOffer }) {
  const t = (key: LicencesCatalogKey) => translateLicences(language, key);
  return (
    <a
      href={offer.url}
      target="_blank"
      rel="noopener noreferrer"
      data-licences-source
      aria-description={t('licences.source.open')}
      className="flex items-center gap-3 px-3.5 py-2.5 text-start focus-visible:outline-2"
      style={{ minHeight: 52, outlineColor: 'var(--color-ios-brand)', borderTop: '1px solid var(--color-ios-hairline)' }}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body font-medium" style={{ color: SECTION_INK }}>
          {t('licences.source.title')}
        </span>
        <span className="text-caption" style={{ color: SECTION_INK_2 }}>
          {t('licences.source.body')}
        </span>
        {offer.shortCommit === null ? null : (
          <span dir="ltr" data-licences-commit className="font-mono text-caption" style={{ color: SECTION_INK_2 }}>
            {t('licences.source.commit').replace('{commit}', offer.shortCommit)}
          </span>
        )}
      </span>
      <span aria-hidden="true" className="shrink-0" style={{ color: 'var(--color-ios-brand)' }}>
        <GlyphSvg glyph={SETTINGS_GLYPHS.arrowSquareOut} size={16} />
      </span>
    </a>
  );
}

function AgplSections({ language, engine }: { readonly language: InterfaceLanguage; readonly engine: LibsignalEngine }) {
  const t = (key: LicencesCatalogKey) => translateLicences(language, key);
  return (
    <>
      <LicenceSection id="licences-agpl" title={t('licences.agpl.title')} language={language}>
        <details data-licences-agpl>
          <summary className="cursor-pointer px-3.5 py-3 text-body font-medium focus-visible:outline-2" style={{ minHeight: 44, color: SECTION_INK, outlineColor: 'var(--color-ios-brand)' }}>
            {t('licences.agpl.title')}
          </summary>
          <pre dir="ltr" className="overflow-x-auto whitespace-pre px-3.5 pb-3 font-mono text-caption" style={{ color: SECTION_INK }}>
            {AGPL_3_0_TEXT}
          </pre>
        </details>
      </LicenceSection>
      <LicenceSection id="licences-libsignal" title={t('licences.libsignal.title')} language={language}>
        <p className="px-3.5 pt-3 text-caption" style={{ color: SECTION_INK_2 }}>
          {t('licences.libsignal.body')}
        </p>
        <a
          href={engine.acknowledgmentsUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-licences-libsignal
          className="flex items-center gap-3 px-3.5 py-2.5 text-body font-medium focus-visible:outline-2"
          style={{ minHeight: 44, color: SECTION_INK, outlineColor: 'var(--color-ios-brand)' }}
        >
          <span className="min-w-0 flex-1">
            {t('licences.libsignal.open')} <span dir="ltr">(v{engine.version})</span>
          </span>
          <span aria-hidden="true" className="shrink-0" style={{ color: 'var(--color-ios-brand)' }}>
            <GlyphSvg glyph={SETTINGS_GLYPHS.arrowSquareOut} size={16} />
          </span>
        </a>
      </LicenceSection>
    </>
  );
}
