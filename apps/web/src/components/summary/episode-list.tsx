import { Glyph } from '@/components/glyph';
import { displayTitle, isAgentTitled, type ConversationEpisode } from '@/lib/summary/types';

/**
 * « CE QUI S'EST PASSÉ » — miroir `EpisodeListView.swift` (#5695, étape 8).
 * Une ligne par épisode, chevron nommé par la DIRECTION DE LECTURE (écart 4,
 * `.glyph-forward` — jamais un nom de côté physique).
 */
export function EpisodeList({
  episodes,
  onOpen,
  lang,
}: {
  readonly episodes: readonly ConversationEpisode[];
  readonly onOpen: (episode: ConversationEpisode) => void;
  /** Posé sur le titre quand la locale de CADRAGE diffère de celle du document. */
  readonly lang?: string;
}) {
  if (episodes.length === 0) return null;
  return (
    <section aria-label="Ce qui s'est passé" className="flex flex-col gap-2">
      <h3 className="text-title font-black" style={{ color: 'var(--color-ios-ink)' }}>
        Ce qui s&rsquo;est passé
      </h3>
      <ul className="flex flex-col gap-1">
        {episodes.map((episode) => (
          <li key={episode.id}>
            <button
              type="button"
              data-episode
              data-episode-id={episode.id}
              onClick={() => onOpen(episode)}
              aria-describedby="episode-hint"
              className="flex min-h-11 w-full items-center gap-2 rounded-row-ios px-3 py-2 text-left"
              style={{ backgroundColor: 'var(--color-summary-surface-tint)' }}
            >
              {isAgentTitled(episode) ? (
                <span aria-hidden className="text-[12px] font-black" style={{ color: 'var(--color-ios-brand)' }}>
                  ✦
                </span>
              ) : null}
              <span
                className="line-clamp-2 flex-1 text-title font-semibold"
                style={{ color: 'var(--color-ios-ink)', opacity: 0.9 }}
                {...(lang !== undefined ? { lang } : {})}
              >
                {displayTitle(episode)}
              </span>
              <Glyph name="caretLeft" className="glyph-forward shrink-0" size={11} style={{ color: 'var(--color-ios-ink)', opacity: 0.4 }} />
            </button>
          </li>
        ))}
      </ul>
      <span id="episode-hint" hidden>
        Ouvre les messages de cet épisode
      </span>
    </section>
  );
}

export default EpisodeList;
