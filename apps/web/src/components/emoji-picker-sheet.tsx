import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';

import {
  EMOJI_CATEGORY_IDS,
  loadEmojiIndex,
  loadEmojiNames,
  loadedEmojiIndex,
  loadedEmojiNames,
  searchEmojis,
  type EmojiCategoryId,
} from '@/lib/emoji/emoji-catalogue';
import { isGridKey, nextGridIndex } from '@/lib/emoji/emoji-grid-keys';
import { supportedEmojiLevel } from '@/lib/emoji/emoji-support';
import { readEmojiRecents, recordEmojiRecent } from '@/lib/emoji-recents';
import { emojiPickerText, loadEmojiPickerCatalog, type EmojiPickerCatalogKey } from '@/lib/i18n-emoji-picker-catalog';
import { interfaceDirection } from '@/lib/inline-interface-language-bootstrap.js';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { EXTENDED_REACTIONS } from '@/lib/view/message-actions';

import { Sheet } from './sheet';

/**
 * LA FEUILLE D'EMOJIS COMPLÈTE (#10531) — miroir d'`EmojiPickerSheet`
 * (`apps/ios/Meeshy/Features/Main/Views/EmojiPickerSheet.swift`) : une rangée
 * de catégories, une recherche, les récents. Elle remplace la grille des vingt
 * (`EmojiGrid`) partout où celle-ci s'ouvrait — l'humeur, le composeur, les
 * commentaires, les réactions — et ses hôtes ne diffèrent toujours que par ce
 * qu'ils FONT de l'emoji choisi.
 *
 * ELLE S'OUVRE SUR CE QU'ELLE SAIT DÉJÀ MONTRER. L'onglet « Récents » ne
 * dépend d'aucune donnée chargée : les emojis récents de l'appareil et les
 * vingt suggestions (`EXTENDED_REACTIONS`, la liste d'avant) sont à l'écran au
 * premier rendu. La table des emojis arrive à côté par `import()`, et les noms
 * de recherche d'une langue à la première frappe seulement.
 *
 * UNE CATÉGORIE À LA FOIS, comme iOS : la plus longue compte moins de quatre
 * cents emojis, et la recherche est bornée (`EMOJI_SEARCH_LIMIT`) — la feuille
 * ne monte jamais les dix-neuf cents boutons d'un coup.
 *
 * AU CLAVIER : la rangée de catégories est une liste d'onglets (flèches, Début,
 * Fin), chaque grille n'a qu'un arrêt de tabulation et se parcourt aux
 * flèches ; de droite à gauche, gauche et droite s'inversent.
 */
export const EMOJI_SEARCH_LIMIT = 120;

/**
 * CE QUE LA FEUILLE ATTEND AVANT SON PREMIER RENDU : ses libellés
 * (`emojiPicker.*`). Les sites paresseux l'appellent APRÈS avoir importé un
 * hôte de la feuille — le chargeur du catalogue voyage ainsi avec la feuille,
 * et aucun chunk de route (le fil, le composeur) ne le porte. La table des
 * emojis part en même temps, sans être attendue.
 */
export function prepareEmojiPickerSheet(): Promise<void> {
  void loadEmojiIndex().catch(() => undefined);
  return loadEmojiPickerCatalog(currentInterfaceLanguage()).then(() => undefined);
}

const CATEGORY_ICON: Readonly<Record<EmojiCategoryId, string>> = {
  recent: '🕒',
  smileys: '😀',
  people: '👋',
  animals: '🐻',
  food: '🍔',
  activities: '⚽',
  travel: '🚗',
  objects: '💡',
  symbols: '❤️',
  flags: '🏳️',
};

const CATEGORY_LABEL: Readonly<Record<EmojiCategoryId, EmojiPickerCatalogKey>> = {
  recent: 'emojiPicker.category.recent',
  smileys: 'emojiPicker.category.smileys',
  people: 'emojiPicker.category.people',
  animals: 'emojiPicker.category.animals',
  food: 'emojiPicker.category.food',
  activities: 'emojiPicker.category.activities',
  travel: 'emojiPicker.category.travel',
  objects: 'emojiPicker.category.objects',
  symbols: 'emojiPicker.category.symbols',
  flags: 'emojiPicker.category.flags',
};

type OnDemand<T> = { readonly status: 'idle' | 'loading' | 'ready' | 'failed'; readonly value: T | null };

/**
 * Une donnée chargée À LA DEMANDE : déjà en mémoire, elle est là au premier
 * rendu ; sinon elle se charge quand elle devient `wanted`, et `retry` la
 * redemande après un échec (hors ligne, les noms de recherche ne sont pas dans
 * le cache d'installation).
 */
function useOnDemand<T>(wanted: boolean, peek: () => T | null, load: () => Promise<T>): OnDemand<T> & { readonly retry: () => void } {
  const [state, setState] = useState<OnDemand<T>>(() => {
    const value = peek();
    return value === null ? { status: 'idle', value: null } : { status: 'ready', value };
  });
  const [attempt, setAttempt] = useState(0);
  const settled = state.status === 'ready';

  useEffect(() => {
    if (!wanted || settled) return undefined;
    const live = { current: true };
    setState({ status: 'loading', value: null });
    load().then(
      (value) => {
        if (live.current) setState({ status: 'ready', value });
      },
      () => {
        if (live.current) setState({ status: 'failed', value: null });
      },
    );
    return () => {
      live.current = false;
    };
    /* `load` et `peek` sont recréés à chaque rendu par l'hôte : seuls `wanted` et la tentative relancent. */
  }, [wanted, attempt, settled]);

  return { ...state, retry: () => setAttempt((count) => count + 1) };
}

const columnsOf = (buttons: readonly HTMLElement[]): number => {
  const top = buttons[0]?.offsetTop;
  const wrapped = buttons.findIndex((button) => button.offsetTop !== top);
  return wrapped === -1 ? buttons.length : wrapped;
};

function EmojiCells({
  emojis,
  label,
  rtl,
  onPick,
}: {
  readonly emojis: readonly string[];
  readonly label: string;
  readonly rtl: boolean;
  readonly onPick: (emoji: string) => void;
}) {
  const [active, setActive] = useState(0);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isGridKey(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
    const index = buttons.findIndex((button) => button === event.target);
    if (index === -1) return;
    event.preventDefault();
    buttons[nextGridIndex({ index, count: buttons.length, columns: columnsOf(buttons), key: event.key, rtl })]?.focus();
  };

  return (
    <div
      role="group"
      aria-label={label}
      data-emoji-grid=""
      className="grid gap-1"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))' }}
      onKeyDown={onKeyDown}
    >
      {emojis.map((emoji, index) => (
        <button
          key={emoji}
          type="button"
          data-emoji={emoji}
          aria-label={emoji}
          tabIndex={index === Math.min(active, emojis.length - 1) ? 0 : -1}
          onFocus={() => setActive(index)}
          onClick={() => onPick(emoji)}
          className="grid place-items-center rounded-chip text-2xl focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ minHeight: 44, minWidth: 44, outlineColor: 'var(--color-ios-brand)' }}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="pb-3">
      <h3 className="px-1 pb-1 text-check font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Notice({ label, retryLabel, onRetry }: { readonly label: string; readonly retryLabel?: string; readonly onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
      <p role="status" className="text-title" style={{ color: 'var(--color-ios-ink-2)' }}>
        {label}
      </p>
      {onRetry === undefined ? null : (
        <button
          type="button"
          data-emoji-retry=""
          onClick={onRetry}
          className="rounded-chip px-4 text-check font-semibold"
          style={{ minHeight: 44, minWidth: 44, color: 'var(--color-ios-brand)', backgroundColor: 'var(--color-ios-card)' }}
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export function EmojiPickerSheet({
  title,
  onPick,
  onClose,
}: {
  readonly title: string;
  readonly onPick: (emoji: string) => void;
  readonly onClose: () => void;
}) {
  const language = currentInterfaceLanguage();
  const text = (key: EmojiPickerCatalogKey) => emojiPickerText(language, key);
  const rtl = interfaceDirection(language) === 'rtl';
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const tabId = (id: EmojiCategoryId) => `${baseId}-tab-${id}`;

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<EmojiCategoryId>('recent');
  const [recents] = useState(() => readEmojiRecents());
  const searching = query.trim().length > 0;

  const index = useOnDemand(true, loadedEmojiIndex, loadEmojiIndex);
  const names = useOnDemand(searching, () => loadedEmojiNames(language), () => loadEmojiNames(language));
  const maxLevel = useMemo(() => supportedEmojiLevel(), []);

  const results = useMemo(
    () =>
      searching && index.value !== null && names.value !== null
        ? searchEmojis({ index: index.value, names: names.value, query, maxLevel, limit: EMOJI_SEARCH_LIMIT })
        : null,
    [searching, index.value, names.value, query, maxLevel],
  );
  const grouped = useMemo(
    () =>
      category === 'recent' || index.value === null
        ? null
        : (index.value.byGroup.get(category) ?? []).filter((entry) => entry.level <= maxLevel).map((entry) => entry.emoji),
    [category, index.value, maxLevel],
  );

  const pick = (emoji: string) => {
    recordEmojiRecent(emoji);
    onPick(emoji);
  };

  const choose = (id: EmojiCategoryId) => {
    setQuery('');
    setCategory(id);
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isGridKey(event.key)) return;
    const count = EMOJI_CATEGORY_IDS.length;
    const next = EMOJI_CATEGORY_IDS[nextGridIndex({ index: EMOJI_CATEGORY_IDS.indexOf(category), count, columns: count, key: event.key, rtl })];
    if (next === undefined) return;
    event.preventDefault();
    choose(next);
    const target = event.currentTarget.querySelector<HTMLElement>(`[data-emoji-category="${next}"]`);
    target?.focus();
    target?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };

  const loading = <Notice label={text('emojiPicker.loading')} />;
  const tableFailed = <Notice label={text('emojiPicker.failed')} retryLabel={text('emojiPicker.retry')} onRetry={index.retry} />;

  const body = (() => {
    if (searching) {
      if (index.status === 'failed') return tableFailed;
      if (names.status === 'failed') {
        return <Notice label={text('emojiPicker.search.unavailable')} retryLabel={text('emojiPicker.retry')} onRetry={names.retry} />;
      }
      if (results === null) return loading;
      if (results.length === 0) return <Notice label={text('emojiPicker.search.empty')} />;
      return <EmojiCells key={`search:${query}`} emojis={results} label={text('emojiPicker.search')} rtl={rtl} onPick={pick} />;
    }
    if (category === 'recent') {
      return (
        <>
          {recents.length === 0 ? null : (
            <Section title={text('emojiPicker.section.recent')}>
              <EmojiCells emojis={recents} label={text('emojiPicker.section.recent')} rtl={rtl} onPick={pick} />
            </Section>
          )}
          <Section title={text('emojiPicker.section.suggested')}>
            <EmojiCells emojis={EXTENDED_REACTIONS} label={text('emojiPicker.section.suggested')} rtl={rtl} onPick={pick} />
          </Section>
        </>
      );
    }
    if (index.status === 'failed') return tableFailed;
    if (grouped === null) return loading;
    return <EmojiCells key={category} emojis={grouped} label={text(CATEGORY_LABEL[category])} rtl={rtl} onPick={pick} />;
  })();

  return (
    <Sheet
      title={title}
      bodyAs="div"
      searchLabel={text('emojiPicker.search')}
      searchPlaceholder={text('emojiPicker.search')}
      search={query}
      onSearchChange={setQuery}
      dialogData={{ 'data-emoji-picker': '' }}
      onClose={onClose}
    >
      <div
        role="tablist"
        aria-label={text('emojiPicker.categories')}
        aria-orientation="horizontal"
        className="flex shrink-0 gap-1 overflow-x-auto px-4 pb-2"
        onKeyDown={onTabKeyDown}
      >
        {EMOJI_CATEGORY_IDS.map((id) => {
          const selected = !searching && id === category;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={tabId(id)}
              data-emoji-category={id}
              aria-label={text(CATEGORY_LABEL[id])}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={id === category ? 0 : -1}
              onClick={() => choose(id)}
              className="grid shrink-0 grow place-items-center rounded-chip focus-visible:outline-2 focus-visible:-outline-offset-2"
              style={{
                minHeight: 44,
                minWidth: 44,
                fontSize: 20,
                outlineColor: 'var(--color-ios-brand)',
                backgroundColor: selected ? 'color-mix(in srgb, var(--accent, var(--color-ios-brand)) 18%, transparent)' : 'transparent',
              }}
            >
              <span aria-hidden="true">{CATEGORY_ICON[id]}</span>
            </button>
          );
        })}
      </div>
      <div
        id={panelId}
        role="tabpanel"
        data-emoji-panel={searching ? 'search' : category}
        {...(searching ? { 'aria-label': text('emojiPicker.search') } : { 'aria-labelledby': tabId(category) })}
        className="min-h-0 flex-1 overflow-y-auto px-4 pt-1"
      >
        {body}
      </div>
    </Sheet>
  );
}
