import { Avatar } from '@/components/avatar';
import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import { attachmentSrc } from '@/lib/api/media-url';
import { adminMoment } from '@/lib/admin/format';
import { translateAdmin, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { initialsOf, participantAvatarOf } from '@/lib/view/conversation';

/**
 * **LA CARTE D'IDENTITÉ D'UN MEMBRE** (#6819, refondue par #7845) — ce qu'un
 * administrateur doit savoir AVANT d'agir : de qui l'on parle (visage,
 * bannière, nom, pseudo), avec quel pouvoir (rôle) et dans quel état (actif,
 * désactivé, supprimé, verrouillé).
 *
 * ## L'ÉTAT se lit en TROIS champs, jamais en un statut calculé (#6822)
 *
 * `DELETE /admin/users/:userId` n'écrit que `isActive:false` — ni `deletedAt`,
 * ni `deletedBy`. Un compte supprimé arrive donc avec `deletedAt: null`, et
 * afficher « supprimé » sur la seule foi de `isActive` mentirait. On dit donc
 * « supprimé » QUAND la passerelle l'affirme, « désactivé » sinon.
 *
 * ## Le visage d'abord (#6975)
 *
 * C'est le seul écran de l'application où identifier une personne A une
 * conséquence (désactiver, bannir, réinitialiser un mot de passe) : la photo
 * se montre en grand, et la bannière — servie depuis #7845 — la porte.
 *
 * ## La complétude est une MESURE, pas un décor
 *
 * `profileCompletionRate` est calculé par la passerelle ; `null` (non servi,
 * illisible) ne peint AUCUNE barre — une barre à zéro affirmerait un profil
 * vide. La barre est un `role="progressbar"` borné, que le lecteur d'écran
 * annonce avec sa valeur.
 */

const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';
const BRAND = 'var(--color-ios-brand)';
const DANGER = 'var(--color-danger)';

function etatDe(membre: AdminUserDetail): AdminPlainCatalogKey | null {
  if (membre.deletedAt !== null) return 'admin.user.deleted';
  return membre.isActive ? null : 'admin.users.inactive';
}

function Puce({ texte, ton, data }: { readonly texte: string; readonly ton: 'neutre' | 'danger'; readonly data: string }) {
  const couleur = ton === 'danger' ? DANGER : BRAND;
  return (
    <span
      data-admin-user-chip={data}
      className="inline-flex items-center rounded-chip px-2.5 py-1 text-caption font-semibold"
      style={{ color: couleur, backgroundColor: `color-mix(in srgb, ${couleur} 12%, transparent)` }}
    >
      {texte}
    </span>
  );
}

export function AdminUserHero({ membre, language }: { readonly membre: AdminUserDetail; readonly language: InterfaceLanguage }) {
  const etat = etatDe(membre);
  const photo = participantAvatarOf(membre);
  const verrouille = membre.lockedUntil !== null && new Date(membre.lockedUntil).getTime() > Date.now();
  const taux = membre.profileCompletionRate;

  return (
    <section
      aria-labelledby="admin-user-name"
      data-admin-user-hero
      className="overflow-hidden rounded-card"
      style={{ backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)' }}
    >
      <div
        className="aspect-[3/1] w-full bg-cover bg-center"
        data-admin-user-banner={membre.banner === null ? 'none' : 'served'}
        style={
          membre.banner === null
            ? { background: `linear-gradient(135deg, color-mix(in srgb, ${BRAND} 40%, transparent), color-mix(in srgb, ${BRAND} 8%, transparent))` }
            : { backgroundImage: `url("${attachmentSrc(membre.banner)}")` }
        }
      />
      <div className="grid gap-3 px-4 pb-4">
        <div className="-mt-9 flex items-end gap-3">
          <span className="shrink-0 rounded-full" style={{ boxShadow: '0 0 0 3px var(--color-ios-surface)' }}>
            <Avatar
              initials={initialsOf(membre.displayName)}
              color={BRAND}
              size={72}
              name={membre.displayName}
              {...(photo === undefined ? {} : { src: photo })}
              /* La présence se PROUVE : la passerelle la sert masquée à qui
                 n'y a pas droit, et un hors-ligne ne peint aucun point
                 (règle 1/3/5) — l'avatar porte la palette centrale. */
              {...(membre.isOnline ? { presence: 'online' as const } : {})}
            />
          </span>
        </div>

        <div className="grid min-w-0 gap-0.5">
          <h2 id="admin-user-name" className="truncate text-screen font-bold" style={{ color: INK }}>
            {membre.displayName}
          </h2>
          <p className="truncate text-caption" style={{ color: INK2 }}>
            @{membre.username}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Puce texte={membre.role} ton="neutre" data="role" />
          {etat === null ? null : <Puce texte={translateAdmin(language, etat)} ton="danger" data="state" />}
          {verrouille ? (
            <Puce
              texte={translateAdmin(language, 'admin.user.locked', { date: adminMoment(membre.lockedUntil, language) })}
              ton="danger"
              data="locked"
            />
          ) : null}
        </div>

        {membre.bio === '' ? null : (
          <p className="text-body" style={{ color: INK }}>
            {membre.bio}
          </p>
        )}

        {taux === null ? null : (
          <div className="grid gap-1">
            <p className="text-caption" style={{ color: INK2 }} id="admin-user-completion">
              {translateAdmin(language, 'admin.user.completion', { percent: String(Math.round(taux)) })}
            </p>
            <div
              role="progressbar"
              aria-labelledby="admin-user-completion"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(taux)}
              className="h-1.5 overflow-hidden rounded-full"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 20%, transparent)' }}
            >
              <div className="h-full rounded-full" style={{ width: `${taux}%`, backgroundColor: BRAND }} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
