import { useRef, useState } from 'react';

import { Avatar } from '@/components/avatar';
import { Glyph } from '@/components/glyph';
import { LensRow } from '@/components/lens-row';
import { useScene } from '@/lib/lens/scene';
import { CONVERSATIONS } from '@/lib/api/fixtures';
import { READER_LANGUAGES } from '@/lib/reader';

/**
 * L'ECRAN DE LISTE.
 *
 * Anatomie reprise d'iOS (`ConversationListView`) : un en-tete FLOTTANT (il n'y
 * a aucune barre de navigation systeme dans l'app iOS), un rail de stories, une
 * rangee de filtres, l'empilement de cartes, et une barre de recherche EN BAS —
 * pas en haut. Ce dernier point est le plus contre-intuitif pour qui vient du
 * web, et c'est un choix d'accessibilite : sur un telephone tenu d'une main, le
 * haut de l'ecran est hors de portee du pouce.
 */

const FILTERS = ['Tous', 'Non lus', 'Groupes', 'Directs', 'Épinglés'] as const;

export default function ConversationsScreen() {
  const [filter, setFilter] = useState<string>('Tous');
  const [search, setSearch] = useState('');
  const frame = useRef<HTMLUListElement | null>(null);
  const { focus } = useScene(frame);

  const visible = CONVERSATIONS.filter((c) => {
    if (filter === 'Non lus' && c.unread === 0) return false;
    if (filter === 'Groupes' && !c.isGrouped) return false;
    if (filter === 'Directs' && c.isGrouped) return false;
    if (search && !c.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-2">
        <h1
          className="flex-1 text-large-title font-bold"
          style={{
            background: 'linear-gradient(90deg, var(--color-ios-brand), var(--color-ios-brand-deep))',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          Meeshy Chats
        </h1>
        <button
          type="button"
          className="grid size-10 place-items-center rounded-chip"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 12%, transparent)', color: 'var(--color-ios-brand)' }}
        >
          <Glyph name="linkSimple" size={18} title="Créer un lien de partage" />
        </button>
        <button
          type="button"
          className="grid size-10 place-items-center rounded-chip"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 12%, transparent)', color: 'var(--color-ios-brand)' }}
        >
          <Glyph name="plus" size={18} title="Nouvelle conversation" />
        </button>
      </header>

      {/* Le rail de stories : avatars 88 px, anneau de marque quand non vues. */}
      <section aria-label="Stories" className="shrink-0 overflow-x-auto pb-1">
        <ul className="flex gap-3 px-4 py-2">
          {CONVERSATIONS.map((c) => (
            <li key={c.id} className="flex w-[88px] shrink-0 flex-col items-center gap-1.5">
              <span
                className="grid place-items-center rounded-chip p-[2.5px]"
                style={{
                  background:
                    c.unread > 0
                      ? 'var(--color-ios-brand)'
                      : 'color-mix(in srgb, var(--color-ios-ink-3) 40%, transparent)',
                }}
              >
                <Avatar initials={c.initials} tint={c.tint} size={72} name={c.title} />
              </span>
              <span className="w-full truncate text-center text-check" style={{ color: 'var(--color-ios-ink-2)' }}>
                {c.title}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <nav aria-label="Filtres" className="shrink-0 overflow-x-auto">
        <ul className="flex gap-2 px-4 py-1.5">
          {FILTERS.map((f) => {
            const active = f === filter;
            return (
              <li key={f}>
                <button
                  type="button"
                  onClick={() => setFilter(f)}
                  aria-pressed={active}
                  className="rounded-chip px-3 py-1.5 text-title font-medium whitespace-nowrap transition-colors"
                  style={
                    active
                      ? { backgroundColor: 'var(--color-ios-brand)', color: 'white' }
                      : {
                          backgroundColor: 'var(--color-ios-card)',
                          color: 'var(--color-ios-ink-2)',
                          border: '0.5px solid var(--color-edge)',
                        }
                  }
                >
                  {f}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/*
        AUCUN `gap` : l'espacement des cartes est ce qui les faisait lire comme
        des boîtes. La Lentille est un flux — les rangées se touchent, et c'est
        la perspective qui les sépare.
      */}
      <ul ref={frame} id="contenu" className="flex flex-1 flex-col overflow-y-auto px-2 pt-2">
        {visible.map((c) => (
          <LensRow
            key={c.id}
            conversation={c}
            languages={READER_LANGUAGES}
            status={{
              magnified: focus === c.id,
              /* La perspective est écrite par la scène directement dans le
                 style du nœud, à chaque image. Ces valeurs-ci ne sont que
                 l'état de DÉPART, avant la première passe. */
              alpha: 1,
              scale: 1,
              breathing: 0,
            }}
          />
        ))}
        {/*
          LA QUEUE DE LISTE — une demi-hauteur de fenêtre de vide sous la
          dernière rangée. Sans elle, la bande de focus, ancrée à 140 du bas,
          ne pourrait jamais atteindre les dernières conversations : elles
          resteraient à jamais non magnifiées, et la liste se terminerait par
          une zone morte que rien n'explique.
        */}
        <li aria-hidden="true" style={{ height: '50dvh', flexShrink: 0 }} />
        {visible.length === 0 ? (
          /* Status vide : jamais un spinner, jamais une phrase seule — un
             contour pointille de CONTROLE, un glyphe, une phrase, une sortie. */
          <li
            className="mx-2 mt-8 grid place-items-center gap-3 rounded-hero p-6 text-center"
            style={{ border: '2px dashed color-mix(in srgb, var(--color-ios-brand) 40%, transparent)' }}
          >
            <Glyph name="magnifyingGlass" size={40} style={{ color: 'var(--color-ios-ink-3)' }} />
            <p className="text-body" style={{ color: 'var(--color-ios-ink)' }}>
              Aucune conversation ne correspond à « {search || filter} ».
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setFilter('Tous');
              }}
              className="rounded-chip px-5 text-body font-semibold text-white"
              style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
            >
              Tout afficher
            </button>
          </li>
        ) : null}
      </ul>

      {/* La barre de recherche EN BAS — a portee du pouce (cf. doc-comment). */}
      <div
        className="shrink-0 px-4 pt-2"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
      >
        <div
          className="flex items-center gap-3 px-4 py-3 backdrop-blur-xl"
          style={{
            borderRadius: 22,
            backgroundColor: 'color-mix(in srgb, var(--color-ios-card) 85%, transparent)',
            border: '1px solid var(--color-edge)',
          }}
        >
          <Glyph name="magnifyingGlass" size={16} style={{ color: 'var(--color-ios-ink-2)' }} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            placeholder="Rechercher…"
            aria-label="Rechercher une conversation"
            className="min-w-0 flex-1 bg-transparent text-bubble outline-none placeholder:text-ios-ink-3"
          />
          {search ? (
            <button type="button" onClick={() => setSearch('')} className="grid size-6 place-items-center">
              <Glyph name="x" size={14} title="Effacer" style={{ color: 'var(--color-error)' }} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
