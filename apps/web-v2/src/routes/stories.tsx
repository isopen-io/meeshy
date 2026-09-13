import { useMemo } from 'react';
import { useStore } from 'zustand';

import { Avatar } from '@/components/avatar';
import { apiDeps } from '@/lib/api/deps';
import { useStoryTray } from '@/lib/api/query';
import { sessionStore } from '@/lib/api/session';
import { storyViewedStore } from '@/lib/api/story-viewed-store';
import { resolveViewer } from '@/lib/api/viewer';
import { initialsOf } from '@/lib/view/conversation';
import { groupStoriesByAuthor, storyAuthorLabel } from '@/lib/view/story-tray';
import { useSearch } from '@/lib/router';
import { Link } from '@/routes/route-table';

/**
 * **TOUTES LES STORIES** (#6080) — la destination du second bouton flottant du
 * rail (« Voir toutes les stories »).
 *
 * `?author=` filtre l'AFFICHAGE sur un auteur — un repli de navigation
 * conservé pour un lien direct, mais qui n'a plus de PORTE dans l'interface
 * depuis #5817 : chaque tuile du rail ouvre désormais directement le lecteur
 * (`/story/$post`), jamais cette liste filtrée. La MÊME adresse sert « tout
 * voir » et « voir celles d'Inès » parce que c'est le même écran avec un
 * filtre : deux écrans auraient été deux vérités sur « comment on présente
 * une story ».
 *
 * **CHAQUE LIGNE OUVRE LE LECTEUR** (#5817), jamais elle-même : le tap sur
 * une ligne nomme une PERSONNE, donc suit son id d'entrée
 * (`group.entryStoryId`, même loi que le rail, `lib/view/story-tray.ts`)
 * plutôt que de reboucler sur `?author=`.
 *
 * Il lit le MÊME cache que le rail (`useStoryTray`, même clé de requête) :
 * arriver ici depuis la liste ne déclenche aucune requête et n'affiche aucun
 * squelette — cache-first, § Instant App Principles.
 */
export default function StoriesScreen() {
  const [search] = useSearch();
  const filtreAuteur = search.get('author') ?? undefined;
  const session = useStore(sessionStore, (s) => s.session);
  const viewer = useMemo(() => resolveViewer({ source: apiDeps.source, session }), [session]);
  const tray = useStoryTray();
  /** L'avance OPTIMISTE sur « vu par moi » — le MÊME magasin que le rail
   * (`api/story-viewed-store.ts`) : revenir du lecteur éteint l'anneau ici
   * aussi, sans attendre que la passerelle reserve `isViewedByMe`. */
  const seenNow = useStore(storyViewedStore, (s) => s.ids);

  const groups = useMemo(
    () => groupStoriesByAuthor(tray.data ?? [], { viewerId: viewer.id ?? undefined, viewedIds: seenNow }),
    [tray.data, viewer.id, seenNow],
  );
  const montres = useMemo(
    () => (filtreAuteur === undefined ? groups : groups.filter((g) => g.authorId === filtreAuteur)),
    [groups, filtreAuteur],
  );

  const chargement = tray.data === undefined && !tray.isError;

  return (
    <main className="flex h-dvh flex-col overflow-hidden pt-safe">
      <header className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-2">
        <Link
          to="list"
          aria-label="Retour aux conversations"
          className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ outlineColor: 'var(--color-ios-brand)' }}
        >
          <span aria-hidden="true" className="text-lg leading-none">‹</span>
        </Link>
        <h1 className="text-body font-semibold" style={{ color: 'var(--color-ios-ink-1)' }}>
          {filtreAuteur === undefined ? 'Stories' : storyAuthorLabel(montres[0] ?? groups[0] ?? ({} as never)) || 'Stories'}
        </h1>
      </header>

      <div className="scrollbar-none flex-1 overflow-y-auto px-4 pb-safe">
        {chargement ? (
          <p role="status" className="py-8 text-center text-check" style={{ color: 'var(--color-ios-ink-2)' }}>
            Chargement des stories…
          </p>
        ) : tray.isError ? (
          <p role="alert" className="py-8 text-center text-check" style={{ color: 'var(--color-ios-ink-2)' }}>
            Les stories n'ont pas pu être chargées.
          </p>
        ) : montres.length === 0 ? (
          <div className="grid flex-1 content-center justify-items-center gap-3 px-6 py-12 text-center">
            <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink-1)' }}>
              Aucune story pour l'instant
            </p>
            <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              Les stories de vos contacts apparaîtront ici pendant vingt-quatre heures.
            </p>
            <Link
              to="storyCompose"
              className="grid place-items-center rounded-chip px-5 py-2 text-body font-semibold text-white"
              style={{ background: 'var(--color-ios-brand)' }}
            >
              Créer une story
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-2 py-2">
            {montres.map((g) => {
              const label = storyAuthorLabel(g);
              return (
                <li key={g.authorId}>
                  <Link
                    to="story"
                    params={{ post: g.entryStoryId }}
                    className="flex w-full items-center gap-3 rounded-card px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{ backgroundColor: 'var(--color-ios-card)', outlineColor: 'var(--color-ios-brand)' }}
                  >
                    <span
                      className="grid shrink-0 place-items-center rounded-chip"
                      style={{
                        padding: '2px',
                        background: g.hasUnseen
                          ? 'var(--color-ios-brand)'
                          : 'color-mix(in srgb, var(--color-ios-ink-3) 40%, transparent)',
                      }}
                    >
                      <Avatar initials={initialsOf(label)} color={'var(--color-ios-brand)'} size={44} />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-body font-semibold" style={{ color: 'var(--color-ios-ink-1)' }}>
                        {label}
                      </span>
                      <span className="text-check" style={{ color: 'var(--color-ios-ink-2)' }}>
                        {g.stories.length === 1 ? '1 story' : `${g.stories.length} stories`}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
