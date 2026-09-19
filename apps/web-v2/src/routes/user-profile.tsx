import { useQuery } from '@tanstack/react-query';

import { authorAccentColor } from '@meeshy/shared/utils/conversation-colors';

import { Avatar } from '@/components/avatar';
import { Glyph } from '@/components/glyph';
import { ApiError } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { publicProfileQueryOptions } from '@/lib/api/public-profile';
import { initialsOf } from '@/lib/view/conversation';
import { useOnline } from '@/lib/net/online';
import { useParams } from '@/lib/router';
import { Link } from '@/routes/route-table';

/**
 * **LE PROFIL PUBLIC DE QUELQU'UN** (#7032) — `/u/$username`, l'adresse que
 * chaque mention vise. Elle porte la nomenclature du LEGACY (`apps/web/app/u/`,
 * D-5) : un lien déjà partagé, un signet, une notification qui la nomme
 * doivent continuer de s'ouvrir après la bascule.
 *
 * **Elle arrive AVANT les liens qui la visent, et c'est l'ordre qui compte.**
 * Sans cette route, `@pseudo` cliquable mènerait à « adresse inconnue » : un
 * contrôle qui ment (loi 4), le défaut que le rail des stories avait déjà payé
 * (voir le commentaire de `stories` dans `route-table.tsx`).
 *
 * **CE QUI N'EST PAS REPRIS CE LOT, ASSUMÉ** : les publications de la personne,
 * les actions relationnelles (demander en ami, bloquer, écrire), les
 * statistiques. Chacune est un port de plus et un geste de plus ; l'écran
 * qu'il faut d'abord, c'est celui qui répond « qui est-ce ? » à quelqu'un qui
 * vient de lire son nom dans un message. Le reste a son issue.
 *
 * **403 ET 404 SE CONFONDENT** (D-6, même doctrine que `PostDetailRefused`) :
 * rien du compte ne doit transparaître — pas même son existence.
 */

const isRefusal = (error: unknown): boolean => error instanceof ApiError && (error.status === 403 || error.status === 404);

function ProfileHeader({ title }: { readonly title: string }) {
  return (
    <header className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-2">
      <Link
        to="list"
        aria-label="Retour aux conversations"
        className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <Glyph name="caretLeft" size={20} />
      </Link>
      <h1 className="truncate text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
        {title}
      </h1>
    </header>
  );
}

function ProfileNotice({
  glyph,
  title,
  detail,
  tone,
}: {
  readonly glyph: 'lock' | 'warningCircle';
  readonly title: string;
  readonly detail: string;
  readonly tone: string;
}) {
  return (
    <div role={glyph === 'warningCircle' ? 'alert' : undefined} className="grid flex-1 content-center justify-items-center gap-3 px-8 text-center">
      <span style={{ color: tone }}>
        <Glyph name={glyph} size={28} />
      </span>
      <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {title}
      </p>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {detail}
      </p>
    </div>
  );
}

export default function UserProfileScreen() {
  const { username } = useParams<'/u/$username'>();
  const online = useOnline();
  const profile = useQuery(publicProfileQueryOptions({ ...apiDeps, handle: username }));

  const person = profile.data;
  const name = person?.displayName ?? person?.username ?? `@${username}`;

  return (
    <div data-user-profile={username} className="flex h-dvh flex-col overflow-hidden pt-safe">
      <ProfileHeader title={person === undefined ? 'Profil' : name} />
      <main id="contenu" className="scrollbar-none flex flex-1 flex-col overflow-y-auto px-4 pb-safe">
        {person !== undefined ? (
          <div className="grid justify-items-center gap-3 pt-6 text-center">
            <Avatar
              initials={initialsOf(name)}
              color={authorAccentColor(person.id, name)}
              size={88}
              name={name}
              {...(person.avatar === null ? {} : { src: person.avatar })}
            />
            <div className="grid gap-1">
              <p className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
                {name}
              </p>
              <p className="text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
                @{person.username}
              </p>
            </div>
            {person.bio === null ? null : (
              <p className="max-w-prose whitespace-pre-wrap text-body" style={{ color: 'var(--color-ios-ink)' }}>
                {person.bio}
              </p>
            )}
          </div>
        ) : isRefusal(profile.error) ? (
          <ProfileNotice
            glyph="lock"
            tone="var(--color-ios-ink-3)"
            title="Ce profil n’est pas accessible"
            detail="Il n’existe pas, ou vous n’y avez pas accès."
          />
        ) : profile.isError ? (
          <ProfileNotice
            glyph="warningCircle"
            tone="var(--color-error)"
            title={online ? 'Impossible de charger ce profil' : 'Hors ligne'}
            detail={online ? 'Réessayez dans un instant.' : 'Le profil s’affichera à la reconnexion.'}
          />
        ) : (
          <div aria-busy="true" aria-label="Chargement du profil" className="grid justify-items-center gap-3 pt-6">
            <div className="rounded-full" style={{ width: 88, height: 88, backgroundColor: 'var(--color-edge)' }} />
            <div className="rounded-chip" style={{ width: 160, height: 14, backgroundColor: 'var(--color-edge)' }} />
            <div className="rounded-chip" style={{ width: 110, height: 12, backgroundColor: 'var(--color-edge)' }} />
          </div>
        )}
      </main>
    </div>
  );
}
