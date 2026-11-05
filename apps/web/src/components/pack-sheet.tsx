import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { authorAccentColor } from '@meeshy/shared/utils/conversation-colors';

import type { ConversationsDeps } from '@/lib/api/conversations';
import { myProfileQueryOptions } from '@/lib/api/profile';
import { translateStickerPacks } from '@/lib/i18n-sticker-packs-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { decorPackState, isAnimatedDecor } from '@/lib/packs/decor-items';
import { decorItemName, useAppearanceNames, usePackItems, type PackRef } from '@/lib/packs/use-pack-items';

import { DecorThumb } from './decor-stage';
import type { PackAction } from './pack-shop';
import { useScheme } from './profile-banner-design';
import { Sheet } from './sheet';

/**
 * **LA FICHE D'UN PACK DE DÉCOR** (#16267) — ouverte en touchant sa rangée de
 * la boutique : ses éléments en grille (chacun ouvre le plein écran), son
 * éditeur (« Meeshy » à défaut), son poids et son état (embarqué, installé, à
 * télécharger), le geste Installer / Retirer de la boutique, et le prix
 * seulement s'il existe. Les éléments d'un pack servi se chargent à
 * l'ouverture, sous un état dessiné ; un échec se dit et se réessaie.
 */

const FALLBACK_ACCENT = '#6366F1';
const PUBLISHER_FALLBACK = 'Meeshy';
const SKELETON = [0, 1, 2, 3, 4, 5] as const;

export type PackSheetProps = {
  readonly language: InterfaceLanguage;
  readonly deps: ConversationsDeps;
  readonly pack: PackRef & {
    readonly title: string;
    readonly description: string;
    readonly author: string;
    readonly installed: boolean;
    readonly price: number | null;
    readonly owned: boolean;
  };
  readonly cover: ReactNode;
  readonly action: PackAction;
  readonly busy: boolean;
  readonly notice: string;
  readonly onAction: () => void;
  readonly onOpenItem: (index: number) => void;
  readonly onClose: () => void;
};

const weightOf = (language: InterfaceLanguage, bytes: number): string => {
  const mega = bytes >= 1_000_000;
  return new Intl.NumberFormat(language, { style: 'unit', unit: mega ? 'megabyte' : 'kilobyte', maximumFractionDigits: 1 }).format(bytes / (mega ? 1_000_000 : 1_000));
};

export function PackSheet({ language, deps, pack, cover, action, busy, notice, onAction, onOpenItem, onClose }: PackSheetProps) {
  const t = translateStickerPacks;
  const scheme = useScheme();
  const names = useAppearanceNames(language);
  const items = usePackItems(pack, deps);
  const profile = useQuery({ ...myProfileQueryOptions(deps), enabled: deps.source === 'gateway' });
  const accent = profile.data === undefined ? FALLBACK_ACCENT : authorAccentColor(profile.data.id, profile.data.displayName ?? profile.data.username);
  const list = items.data?.items ?? [];
  const embedded = items.data?.embedded === true;
  const state = decorPackState({ embedded, installed: pack.installed });
  const bytes = items.data?.bytes ?? null;
  const facts = [
    t(language, 'packs.sheet.publisher', { author: pack.author === '' ? PUBLISHER_FALLBACK : pack.author }),
    ...(items.data === undefined ? [] : [t(language, state === 'embedded' ? 'packs.sheet.state.embedded' : state === 'installed' ? 'packs.sheet.state.installed' : 'packs.sheet.state.download')]),
    ...(bytes === null ? [] : [t(language, 'packs.sheet.size', { size: weightOf(language, bytes) })]),
    ...(pack.price === null ? [] : [pack.owned ? t(language, 'packs.owned') : t(language, 'packs.price', { price: String(pack.price) })]),
  ];
  const wide = pack.domain === 'banner' || pack.domain === 'banner-frame';
  const grid = wide ? 'grid-cols-2' : 'grid-cols-3';
  const primary = action.kind === 'buy' || (action.kind === 'toggle' && !pack.installed);

  return (
    <Sheet title={pack.title} bodyAs="div" dialogData={{ 'data-pack-sheet': `${pack.domain}:${pack.slug}` }} onClose={onClose}>
      <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-6">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="shrink-0">
            {cover}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {pack.description === '' ? null : (
              <p className="text-body" style={{ color: 'var(--color-ios-ink)' }}>
                {pack.description}
              </p>
            )}
            <p data-pack-sheet-facts className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              {facts.join(' · ')}
            </p>
          </div>
        </div>
        {action.kind === 'toggle' || action.kind === 'buy' ? (
          <button
            type="button"
            data-pack-sheet-action={action.kind}
            aria-busy={busy}
            {...(action.kind === 'toggle' ? { 'aria-pressed': pack.installed } : {})}
            onClick={onAction}
            className="min-h-11 rounded-full px-5 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={
              primary
                ? { backgroundColor: 'var(--accent, var(--color-ios-brand))', color: 'var(--color-ios-on-brand)', outlineColor: 'var(--color-ios-brand)' }
                : { backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink)', outlineColor: 'var(--color-ios-brand)' }
            }
          >
            {action.label}
          </button>
        ) : action.kind === 'swap' ? (
          <button type="button" data-pack-sheet-action="swap" onClick={action.run} className="min-h-11 rounded-full px-5 text-body font-semibold" style={{ backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink)' }}>
            {action.label}
          </button>
        ) : (
          <p data-pack-sheet-action={action.kind} className="text-body font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
            {action.label}
          </p>
        )}
        <p role="status" aria-live="polite" className="text-caption empty:hidden" style={{ color: 'var(--ios-error)' }}>
          {notice}
        </p>
        <section aria-label={t(language, 'packs.sheet.items')} className="flex flex-col gap-2">
          <h3 className="text-caption font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
            {t(language, 'packs.sheet.items')}
          </h3>
          {list.length > 0 ? (
            <ul className={`grid ${grid} gap-2`}>
              {list.map((item, index) => (
                <li key={item.key}>
                  <button
                    type="button"
                    data-pack-sheet-item={item.key}
                    aria-label={`${decorItemName(names, item)}${isAnimatedDecor(item) ? ` · ${t(language, 'packs.preview.animated')}` : ''}`}
                    onClick={() => onOpenItem(index)}
                    className="grid w-full place-items-center gap-1 rounded-card p-2 text-caption focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{ minHeight: 44, backgroundColor: 'var(--color-ios-fill)', outlineColor: 'var(--color-ios-brand)', color: 'var(--color-ios-ink)' }}
                  >
                    <DecorThumb item={item} accent={accent} scheme={scheme} />
                    <span aria-hidden="true" className="max-w-full truncate">
                      {decorItemName(names, item)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : items.isError ? (
            <div className="flex flex-col items-start gap-2">
              <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
                {t(language, 'packs.sheet.failed')}
              </p>
              <button type="button" data-pack-sheet-retry onClick={() => void items.refetch()} className="min-h-11 rounded-full px-4 text-body font-semibold" style={{ backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink)' }}>
                {t(language, 'packs.retry')}
              </button>
            </div>
          ) : (
            <div data-pack-sheet-loading role="status" aria-busy="true" className="flex flex-col gap-2">
              <span className="sr-only">{t(language, 'packs.sheet.loading')}</span>
              <ul aria-hidden="true" className={`grid ${grid} gap-2`}>
                {SKELETON.map((cell) => (
                  <li key={cell} className={`block animate-pulse rounded-card motion-reduce:animate-none ${wide ? 'aspect-[3/1]' : 'aspect-square'}`} style={{ backgroundColor: 'var(--color-ios-fill)' }} />
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </Sheet>
  );
}
