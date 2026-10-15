import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { searchStatusKey, type ThreadSearchHit } from '@/lib/view/thread-search';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import type { ThreadSearch } from '@/lib/view/use-thread-search';

import { Glyph } from './glyph';

/**
 * LE PANNEAU DE RECHERCHE DANS LA CONVERSATION — la barre que la loupe de
 * l'en-tête ouvre, et la liste de ce qu'elle trouve. Miroir de la `searchBar`
 * iOS (`ConversationView+MessageRow.swift`) : un champ sous l'en-tête, son
 * effacement, un bouton « Fermer », et la ligne d'état « Recherche… / Aucun
 * résultat / N résultats ».
 *
 * **UN ÉCART ASSUMÉ AVEC iOS.** L'app native filtre le fil SUR PLACE (le
 * `MessageStore` passe en fenêtre `.search` et ne garde que les bulles
 * trouvées). Le fil web est une fenêtre virtualisée dont l'ancrage, la
 * fenêtre `?around=` et le cache persisté ne connaissent pas de mode
 * « filtré » : le reproduire aurait touché tout l'écran. Ici, les résultats
 * sont une LISTE sous le champ — l'expéditeur, la date, l'extrait avec le mot
 * marqué — et toucher un résultat FERME la recherche puis amène le message
 * dans le fil par le saut de la citation (`useThreadJump`, fenêtre
 * `?around=` comprise : un message vieux de mille messages s'atteint en UNE
 * requête), surligné le temps de le repérer.
 *
 * **LE RETOUR ANDROID ET ÉCHAP FERMENT** (`useBackDismiss`) : le panneau est
 * une couche — monté seulement quand la recherche est ouverte, il pose son
 * entrée d'historique et la retire en se fermant. Sans elle, le geste retour
 * de la coque Capacitor quittait la CONVERSATION au lieu de fermer le champ.
 *
 * Tout est au doigt : chaque cible fait au moins 44 px, le champ prend le
 * focus à l'ouverture (le clavier monte sans second toucher) et sa touche
 * d'action dit « rechercher » (`enterKeyHint`).
 */
export function ThreadSearchPanel({
  search,
  onPick,
}: {
  readonly search: ThreadSearch;
  /** Le message touché — l'hôte ferme la recherche et y saute. */
  readonly onPick: (messageId: string) => void;
}) {
  useBackDismiss(search.close, { escape: true });
  const language = currentInterfaceLanguage();
  const statusKey = searchStatusKey({ ready: search.ready, phase: search.phase, count: search.count });
  const status =
    statusKey === 'thread.search.count.one' || statusKey === 'thread.search.count.other'
      ? translate(language, statusKey, { count: String(search.count) })
      : translate(language, statusKey);
  const dateOf = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="thread-column px-4 pb-2" data-thread-search="">
      <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-field px-3" style={{ minHeight: 44, backgroundColor: 'var(--color-ios-card)' }}>
          <Glyph name="magnifyingGlass" size={16} style={{ color: 'var(--color-ios-ink)' }} />
          <span className="offscreen">{translate(language, 'thread.search.open')}</span>
          <input
            type="search"
            value={search.query}
            onInput={(event) => search.setQuery(event.currentTarget.value)}
            placeholder={translate(language, 'thread.search.placeholder')}
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            data-thread-search-input=""
            className="min-w-0 flex-1 bg-transparent text-body outline-none"
            style={{ color: 'var(--color-ios-ink)' }}
          />
        </label>
        <button
          type="button"
          onClick={search.close}
          aria-label={translate(language, 'thread.search.close')}
          data-thread-search-close=""
          className="grid size-11 shrink-0 place-items-center"
          style={{ color: 'var(--accent)' }}
        >
          <Glyph name="x" size={18} />
        </button>
      </div>

      <p role="status" aria-live="polite" className="px-1 pt-1.5 text-mini" style={{ color: 'var(--color-ios-ink)' }} data-thread-search-status="">
        {status}
        {search.phase === 'failed' ? (
          <>
            {' '}
            <button type="button" onClick={search.retry} className="font-semibold underline" style={{ color: 'var(--accent)' }} data-thread-search-retry="">
              {translate(language, 'thread.search.retry')}
            </button>
          </>
        ) : null}
      </p>

      {search.hits.length > 0 ? (
        <ul className="mt-1 max-h-[55dvh] overflow-y-auto overscroll-contain" data-thread-search-results="">
          {search.hits.map((hit) => (
            <li key={hit.messageId}>
              <SearchHitRow hit={hit} date={dateOf.format(hit.createdAt)} translatedLabel={translate(language, 'thread.search.translated')} onPick={onPick} />
            </li>
          ))}
          {search.hasMore ? (
            <li>
              <button
                type="button"
                onClick={search.loadMore}
                disabled={search.loadingMore}
                data-thread-search-more=""
                className="w-full py-2 text-center text-caption font-semibold"
                style={{ minHeight: 44, color: 'var(--accent)' }}
              >
                {search.loadingMore ? translate(language, 'thread.search.searching') : translate(language, 'thread.search.more')}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function SearchHitRow({
  hit,
  date,
  translatedLabel,
  onPick,
}: {
  readonly hit: ThreadSearchHit;
  readonly date: string;
  readonly translatedLabel: string;
  readonly onPick: (messageId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(hit.messageId)}
      data-thread-search-hit={hit.messageId}
      className="flex w-full flex-col gap-0.5 rounded-field px-2 py-2 text-start"
      style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}
    >
      <span className="flex w-full items-baseline gap-2 text-mini">
        <span className="min-w-0 flex-1 truncate font-semibold">{hit.senderName}</span>
        <span className="shrink-0">{date}</span>
      </span>
      <span className="line-clamp-2 text-caption">
        {hit.snippet.before}
        {hit.snippet.match === '' ? null : (
          <mark className="rounded-sm px-0.5 font-semibold" style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 22%, transparent)', color: 'inherit' }}>
            {hit.snippet.match}
          </mark>
        )}
        {hit.snippet.after}
      </span>
      {hit.matchedIn === 'translation' ? (
        <span className="flex items-center gap-1 text-mini" data-thread-search-translated="">
          <Glyph name="translate" size={11} />
          {translatedLabel}
        </span>
      ) : null}
    </button>
  );
}
