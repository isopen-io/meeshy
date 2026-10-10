import { useEffect, useMemo, useRef, useState } from 'react';

import { Glyph } from '@/components/glyph';
import { searchTemplates, type CardTone, type TemplateVocabulary } from '@/lib/export/message-card-search';
import { CARD_LINKS, CARD_TYPEFACE_IDS, type MessageCardTemplateId } from '@/lib/export/message-card-templates';
import type { TemplateUsage } from '@/lib/export/message-card-usage';
import { translateExportCard, type ExportCardCatalogKey } from '@/lib/i18n-export-card-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { CardThumb, type ThumbSource } from './thread-export-thumb';
import { LINK_LABEL, TYPEFACE_LABEL, templateLabel } from './thread-export-tray';

/**
 * **LA GALERIE DES STYLES** — toutes les cartes, peintes sur le message de
 * l'utilisateur, les plus utilisées d'abord. On y CHERCHE avec les mots de
 * l'interface (« plume sombre », « bulles »), sans se soucier des accents, et
 * les noms des polices et des liaisons s'offrent en suggestions d'un toucher.
 *
 * Les cartes se montent par PAGES au fil du défilement : 784 boutons d'un
 * coup coûteraient une image perdue à l'ouverture, pour des vignettes que
 * personne ne verra.
 */

const PAGE = 48;

const TONES: readonly (CardTone | null)[] = [null, 'dark', 'light'];
const TONE_LABEL = { all: 'export.card.tone.all', dark: 'export.card.tone.dark', light: 'export.card.tone.light' } as const satisfies Readonly<Record<string, ExportCardCatalogKey>>;

export const vocabularyOf = (language: InterfaceLanguage): TemplateVocabulary => ({
  typeface: Object.fromEntries(CARD_TYPEFACE_IDS.map((id) => [id, translateExportCard(language, TYPEFACE_LABEL[id])])) as TemplateVocabulary['typeface'],
  link: Object.fromEntries(CARD_LINKS.map((id) => [id, translateExportCard(language, LINK_LABEL[id])])) as TemplateVocabulary['link'],
  tone: { dark: translateExportCard(language, 'export.card.tone.dark'), light: translateExportCard(language, 'export.card.tone.light') },
});

export function ExportGallery({
  language,
  usage,
  selected,
  thumbs,
  onPick,
  onClose,
}: {
  readonly language: InterfaceLanguage;
  readonly usage: TemplateUsage;
  readonly selected: MessageCardTemplateId;
  readonly thumbs: ThumbSource;
  readonly onPick: (id: MessageCardTemplateId) => void;
  readonly onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [tone, setTone] = useState<CardTone | null>(null);
  const [shown, setShown] = useState(PAGE);
  const vocabulary = useMemo(() => vocabularyOf(language), [language]);
  const found = useMemo(() => searchTemplates({ query, vocabulary, usage, tone }), [query, vocabulary, usage, tone]);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => setShown(PAGE), [query, tone]);

  useEffect(() => {
    const node = sentinel.current;
    if (node === null || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setShown((count) => count + PAGE);
    }, { rootMargin: '240px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [found]);

  const suggestions = [...CARD_TYPEFACE_IDS.map((id) => vocabulary.typeface[id]), ...CARD_LINKS.map((id) => vocabulary.link[id])];
  const suggest = (word: string) => setQuery((current) => `${current.trim()} ${word}`.trim());

  return (
    <div data-export-gallery-sheet="" className="glass-prominent absolute inset-0 z-10 flex flex-col" role="region" aria-label={translateExportCard(language, 'export.card.gallery.title')}>
      <div className="grid shrink-0 gap-2 px-4 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full px-4" style={{ minHeight: 44, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 7%, transparent)' }}>
            <Glyph name="magnifyingGlass" size={18} style={{ color: 'var(--color-ios-ink-3)' }} />
            <input
              type="search"
              data-export-search=""
              value={query}
              autoFocus
              onInput={(e) => setQuery(e.currentTarget.value)}
              placeholder={translateExportCard(language, 'export.card.gallery.placeholder')}
              aria-label={translateExportCard(language, 'export.card.gallery.search')}
              className="w-full min-w-0 bg-transparent py-2 text-body outline-none"
              style={{ color: 'var(--color-ios-ink)' }}
            />
          </label>
          <button
            type="button"
            data-export-gallery-close=""
            onClick={onClose}
            aria-label={translateExportCard(language, 'export.card.gallery.close')}
            title={translateExportCard(language, 'export.card.gallery.close')}
            className="grid shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ width: 44, height: 44, color: 'var(--color-ios-ink)', backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 7%, transparent)' }}
          >
            <Glyph name="x" size={18} />
          </button>
        </div>

        <div role="group" aria-label={translateExportCard(language, 'export.card.tab.palette')} className="flex gap-1 rounded-full p-1" style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 7%, transparent)' }}>
          {TONES.map((value) => (
            <button
              key={value ?? 'all'}
              type="button"
              data-export-tone={value ?? ''}
              aria-pressed={value === tone}
              onClick={() => setTone(value)}
              className="flex-1 rounded-full text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                minHeight: 36,
                color: value === tone ? 'var(--color-ios-surface)' : 'var(--color-ios-ink-2)',
                backgroundColor: value === tone ? 'var(--color-ios-ink)' : 'transparent',
              }}
            >
              {translateExportCard(language, TONE_LABEL[value ?? 'all'])}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {suggestions.map((word) => (
            <button
              key={word}
              type="button"
              data-export-suggestion={word}
              onClick={() => suggest(word)}
              className="shrink-0 rounded-full px-3 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ minHeight: 32, color: 'var(--color-ios-ink)', backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 7%, transparent)' }}
            >
              {word}
            </button>
          ))}
        </div>

        <p aria-live="polite" data-export-count={found.length} className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {translateExportCard(language, 'export.card.gallery.count', { count: String(found.length) })}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {found.length === 0 ? (
          <p data-export-gallery-empty="" className="px-2 py-10 text-center text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
            {translateExportCard(language, 'export.card.gallery.empty')}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-x-2.5 gap-y-3">
            {found.slice(0, shown).map((id) => (
              <div key={id} className="grid min-w-0 gap-1">
                <CardThumb id={id} source={thumbs} label={templateLabel(language, id)} pressed={id === selected} width="100%" onPick={() => onPick(id)} data={{ 'data-export-gallery-template': id }} />
                <span aria-hidden="true" className="truncate text-[11px]" style={{ color: 'var(--color-ios-ink-2)' }}>
                  {templateLabel(language, id)}
                </span>
              </div>
            ))}
          </div>
        )}
        {shown < found.length ? <div ref={sentinel} style={{ height: 1 }} /> : null}
      </div>
    </div>
  );
}
