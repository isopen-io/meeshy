import { useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import { Avatar } from '@/components/avatar';
import { Glyph } from '@/components/glyph';
import { LensRow } from '@/components/lens-row';
import { useScene } from '@/lib/lens/scene';
import { CONVERSATIONS, VIEWER_ID } from '@/lib/api/fixtures';
import { accentOf } from '@/lib/accent';
import { conversationStore, effectiveFlagsOf, effectiveUnreadOf } from '@/lib/conversation-store';
import { applyFilter, emptinessOf, FILTER_LABELS, LIST_FILTERS, orderConversations, type ListFilter } from '@/lib/lens/filters';
import { READER_LANGUAGES } from '@/lib/reader';
import type { Conversation } from '@/lib/api/types';
import type { RowActionId } from '@/lib/view/row-actions';
import { initialsOf, titleOf } from '@/lib/view/conversation';
import { Link } from '@/routes/route-table';

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

/**
 * Un seul callback par écran, PARAMÉTRÉ par conversation à l'appel — plutôt
 * qu'une fabrique `(conversation) => (id) => …` recréée à chaque rendu de
 * chaque rangée (99 conversations × un nouveau closure par image de
 * défilement magnifiée). Les actions du store portent déjà l'id de
 * conversation ; ce gestionnaire n'a besoin que de la lire une fois via
 * `getState()` au moment du CLIC, jamais au rendu.
 */
function handleRowAction(conversation: Conversation, id: RowActionId): void {
  const { overrides, togglePin, toggleMute, toggleArchive, markRead, markUnread } = conversationStore.getState();
  const flags = effectiveFlagsOf(conversation, overrides);
  switch (id) {
    case 'pin':
      togglePin(conversation.id, flags.isPinned);
      return;
    case 'mute':
      toggleMute(conversation.id, flags.isMuted);
      return;
    case 'archive':
      toggleArchive(conversation.id, flags.isArchived);
      return;
    case 'read':
      if (effectiveUnreadOf(conversation, overrides) > 0) markRead(conversation.id);
      else markUnread(conversation.id);
      return;
  }
}

export default function ConversationsScreen() {
  const [filter, setFilter] = useState<ListFilter>('all');
  const [search, setSearch] = useState('');
  const frame = useRef<HTMLUListElement | null>(null);
  const { focus } = useScene(frame);
  const overrides = useStore(conversationStore, (s) => s.overrides);

  const filtered = applyFilter({ conversations: CONVERSATIONS, filter, search, viewerId: VIEWER_ID, overrides });
  const visible = orderConversations(filtered, overrides);
  const emptiness = emptinessOf(CONVERSATIONS, visible);

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
        {/*
          #5559 revue-correction, défaut 2 : « Créer un lien de partage » et
          « Nouvelle conversation » n'avaient AUCUN gestionnaire — aucune
          route ne les sert aujourd'hui (`route-table.tsx` ne déclare que
          `list`/`thread`). Deux boutons qui ne font RIEN au clic sur
          l'écran PHARE, à côté d'un écran dont tout le reste agit, sont
          pires qu'une absence : ils PROMETTENT un effet qu'ils ne tiennent
          pas. Retirés jusqu'à leur porte réelle (issues compagnon à ouvrir :
          lien de partage — la passerelle expose déjà la création, l'effet
          minimal est une copie presse-papier avec retour visible ; nouvelle
          conversation — un flux de composition à construire) plutôt que de
          laisser deux contrôles mentir.
        */}
      </header>

      {/*
        LE RAIL D'ACCÈS RAPIDE : avatars 88 px, anneau de marque quand non lu.
        #5559 revue-correction, défauts 3 et 9.

        (3) CE N'ÉTAIT NI DES STORIES NI UN CONTRÔLE : quatre `<li>` nus,
        aucun `<a>` ni `<button>`, un anneau qui promettait un contenu que
        rien n'ouvrait. En l'absence d'une route « stories » (issue
        compagnon à ouvrir), la seule destination RÉELLE de chaque avatar
        aujourd'hui est SON FIL — chaque tuile est donc un `Link` vers
        `thread`, exactement ce qu'elle ouvre déjà si on tape la ligne
        correspondante plus bas.

        (9) LE RAIL LIT DÉSORMAIS LA MÊME SOURCE QUE LA LISTE — `CONVERSATIONS`
        filtrées du corpus ARCHIVÉ (`effectiveFlagsOf(...).isArchived`, même
        précédence iOS `:598-601` que `applyFilter`) et `effectiveUnreadOf`
        pour l'anneau. Avant ce correctif, le rail lisait le fil BRUT et
        `unreadOf` seul : marquer « Lu » vidait le badge de la ligne sans
        jamais éteindre l'anneau du rail, archiver sortait la conversation de
        la liste sans jamais la retirer du rail — deux vérités pour un même
        état, sur le MÊME écran.
      */}
      <section aria-label="Accès rapide aux conversations" className="shrink-0 overflow-x-auto pb-1">
        <ul className="flex gap-3 px-4 py-2">
          {CONVERSATIONS.filter((c) => !effectiveFlagsOf(c, overrides).isArchived).map((c) => {
            const title = titleOf(c, VIEWER_ID);
            return (
              <li key={c.id} className="flex w-[88px] shrink-0 flex-col items-center gap-1.5">
                <Link
                  to="thread"
                  params={{ conversation: c.id }}
                  aria-label={title}
                  className="flex flex-col items-center gap-1.5 rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ outlineColor: 'var(--color-ios-brand)' }}
                >
                  <span
                    className="grid place-items-center rounded-chip p-[2.5px]"
                    style={{
                      background:
                        effectiveUnreadOf(c, overrides) > 0
                          ? 'var(--color-ios-brand)'
                          : 'color-mix(in srgb, var(--color-ios-ink-3) 40%, transparent)',
                    }}
                  >
                    <Avatar initials={initialsOf(title)} color={accentOf(c)} size={72} />
                  </span>
                  <span className="w-full truncate text-center text-check" style={{ color: 'var(--color-ios-ink-2)' }}>
                    {title}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <nav aria-label="Filtres" className="shrink-0 overflow-x-auto">
        <ul className="flex gap-2 px-4 py-1.5">
          {LIST_FILTERS.map((f) => {
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
                  {FILTER_LABELS[f]}
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
            viewerId={VIEWER_ID}
            flags={effectiveFlagsOf(c, overrides)}
            unreadCount={effectiveUnreadOf(c, overrides)}
            onRowAction={(id) => handleRowAction(c, id)}
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

          ELLE N'EXISTE QUE S'IL Y A UNE RANGÉE À MAGNIFIER. Rendue
          inconditionnellement, elle poussait l'état vide 50 dvh plus bas :
          mesuré à 390×844, le panneau « Aucune conversation ne correspond… »
          commençait à 688 px et finissait à 899 — sa SORTIE, le bouton « Tout
          afficher », tombait donc hors de l'écran. Un état vide dont on ne
          voit pas l'issue est un cul-de-sac, et une cale destinée à la
          magnification n'a rien à caler quand il n'y a rien à magnifier.
        */}
        {visible.length > 0 ? <li aria-hidden="true" style={{ height: '50dvh', flexShrink: 0 }} /> : null}
        {/*
          DEUX états VIDES DISTINCTS (#5559 T15) : `empty-corpus` (aucune
          conversation du tout — l'écran de DÉMARRAGE) contre `empty-filter`
          (un filtre ou une recherche qui ne rend rien sur un corpus non
          vide). Les confondre ferait dire « aucune conversation ne
          correspond à… » à un compte qui n'en a encore AUCUNE — un message
          qui accuse la recherche d'un vide qu'elle n'a pas produit.
        */}
        {emptiness === 'empty-corpus' ? (
          <li
            className="mx-2 mt-8 grid place-items-center gap-3 rounded-hero p-6 text-center"
            style={{ border: '2px dashed color-mix(in srgb, var(--color-ios-brand) 40%, transparent)' }}
          >
            <Glyph name="users" size={40} style={{ color: 'var(--color-ios-ink-3)' }} />
            <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
              Aucune conversation pour l’instant.
            </p>
            <p className="text-title" style={{ color: 'var(--color-ios-ink-2)' }}>
              Un message, une story, un mood, un post — ou invitez vos amis.
            </p>
          </li>
        ) : null}
        {emptiness === 'empty-filter' ? (
          /* Status vide : jamais un spinner, jamais une phrase seule — un
             contour pointille de CONTROLE, un glyphe, une phrase, une sortie. */
          <li
            className="mx-2 mt-8 grid place-items-center gap-3 rounded-hero p-6 text-center"
            style={{ border: '2px dashed color-mix(in srgb, var(--color-ios-brand) 40%, transparent)' }}
          >
            <Glyph name="magnifyingGlass" size={40} style={{ color: 'var(--color-ios-ink-3)' }} />
            <p className="text-body" style={{ color: 'var(--color-ios-ink)' }}>
              Aucune conversation ne correspond à « {search || FILTER_LABELS[filter]} ».
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setFilter('all');
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
