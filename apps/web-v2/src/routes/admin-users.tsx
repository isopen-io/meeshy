import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  ADMIN_USERS_PAGE_SIZE,
  adminIdentityQueryOptions,
  adminUsersQueryKey,
  loadAdminUsers,
  type AdminUserRow,
} from '@/lib/api/admin';
import { apiDeps } from '@/lib/api/deps';
import { visibleAdminSections } from '@/lib/admin/sections';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useRoute } from '@/lib/router';
import { AdminDenied, AdminScreenFrame, AdminSkeleton } from '@/routes/admin-parts';
/** `Link` vient de la TABLE, pas du module générique : `createRouter(table)` le
 * fabrique typé sur elle, de sorte que `to` n'accepte qu'une clé réelle et
 * `params` la forme exacte du motif. Même import que `admin-parts`,
 * `links-parts` et `link-page-parts`. */
import { Link } from '@/routes/route-table';

/**
 * **LES COMPTES** (#6432) — la section d'administration la plus consultée,
 * servie NATIVEMENT par la v2. Miroir de `apps/web/app/admin/users`, réduit à
 * ce qui se LIT : chercher, parcourir, voir l'état d'un compte.
 *
 * ## Aucune écriture, et c'est un choix
 *
 * Bannir, changer un rôle, réinitialiser un mot de passe restent au legacy
 * tant que leurs confirmations n'ont pas été portées. Une action irréversible
 * derrière un bouton sans sa confirmation serait pire que son absence — et la
 * porte de suppression en dur (`DELETE <username>`, directive porteur
 * 2026-09-13) est un lot à elle seule.
 *
 * ## La garde est la MÊME que celle du hub
 *
 * `canManageUsers` est relue ici, pas héritée d'une navigation : on entre sur
 * cette adresse par un lien profond aussi bien que par le hub, et une garde
 * posée seulement à l'étage du dessus ne garde que l'escalier.
 */

const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';

/**
 * LA LIGNE OUVRE LA FICHE (#6819) — `cible` vient de l'écran et vaut `admUser`
 * ou `adminUser` selon l'espace d'où l'on parcourt la liste. La calculer ici
 * obligerait chaque ligne à relire la route ; la recevoir la garde muette et
 * cohérente avec le retour, qui suit la même règle (D-76 tient les deux
 * administrations séparées).
 *
 * Le lien porte la mise en page, pas le `<li>` : une cible tactile doit être
 * l'élément CLIQUABLE lui-même, sinon le pouce touche la carte sans rien
 * ouvrir sur ses bords. `minHeight: 44` est le plancher du dépôt.
 */
function UserRow({
  compte,
  language,
  cible,
}: {
  readonly compte: AdminUserRow;
  readonly language: InterfaceLanguage;
  readonly cible: 'adminUser' | 'admUser';
}) {
  return (
    <li data-admin-user={compte.id}>
      <Link
        to={cible}
        params={{ user: compte.id }}
        className="flex items-center gap-3 rounded-card px-4 py-3"
        style={{ minHeight: 44, backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)' }}
      >
      <span
        aria-hidden="true"
        className="grid size-2 shrink-0 place-items-center rounded-full"
        style={{ backgroundColor: compte.isOnline ? 'var(--color-success, #34D399)' : 'transparent' }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium" style={{ color: INK }}>
          {compte.displayName}
        </p>
        <p className="truncate text-caption" style={{ color: INK2 }}>
          @{compte.username} · {compte.email}
        </p>
      </div>
      <span className="shrink-0 rounded-chip px-2 py-0.5 text-caption" style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 14%, transparent)', color: INK2 }}>
        {compte.role}
      </span>
      {compte.isActive ? null : (
        <span className="shrink-0 text-caption" style={{ color: 'var(--color-danger)' }}>
          {translate(language, 'admin.users.inactive')}
        </span>
      )}
      </Link>
    </li>
  );
}

export default function AdminUsersScreen() {
  const language = currentInterfaceLanguage();
  const [recherche, setRecherche] = useState('');
  const [offset, setOffset] = useState(0);

  const { key } = useRoute();
  /** On reste dans l'espace d'où l'on vient : `/adm/users` ouvre `/adm/users/$user`,
   * `/admin/users` ouvre `/admin/users/$user`. Mélanger les deux ferait sauter
   * l'administrateur d'une administration à l'autre au premier tap. */
  const cible = key === 'admUsers' ? ('admUser' as const) : ('adminUser' as const);

  const identite = useQuery(adminIdentityQueryOptions(apiDeps));

  const autorise = visibleAdminSections(identite.data?.permissions ?? null).some((s) => s.id === 'users');

  const liste = useQuery({
    queryKey: adminUsersQueryKey(offset, recherche),
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminUsers({ ...apiDeps, offset, search: recherche, signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    enabled: autorise,
    retry: false,
  });

  const titre = translate(language, 'admin.nav.users');

  if (identite.isPending) {
    return (
      <AdminScreenFrame language={language} title={titre} back="admin">
        <AdminSkeleton rows={5} />
      </AdminScreenFrame>
    );
  }

  if (!autorise) {
    return (
      <AdminScreenFrame language={language} title={titre} back="admin">
        <AdminDenied language={language} />
      </AdminScreenFrame>
    );
  }

  const page = liste.data;

  return (
    <AdminScreenFrame language={language} title={titre} back="admin">
      <label className="grid gap-1 pb-4">
        <span className="text-caption" style={{ color: INK2 }}>
          {translate(language, 'admin.users.search')}
        </span>
        <input
          type="search"
          value={recherche}
          data-admin-users-search
          onChange={(event) => {
            setRecherche(event.target.value);
            // Toute nouvelle recherche repart de la PREMIÈRE page : garder
            // l'offset rendrait une liste vide sur un filtre qui a pourtant
            // des résultats — un « aucun compte » qui ment.
            setOffset(0);
          }}
          className="rounded-chip px-4 text-body"
          style={{
            minHeight: 44,
            backgroundColor: 'var(--color-ios-surface)',
            border: '1px solid var(--color-edge)',
            color: INK,
          }}
        />
      </label>

      {liste.isPending ? (
        <AdminSkeleton rows={6} />
      ) : page === undefined ? (
        <p className="text-caption" style={{ color: INK2 }}>
          {translate(language, 'admin.users.unavailable')}
        </p>
      ) : page.users.length === 0 ? (
        <p className="text-caption" style={{ color: INK2 }}>
          {translate(language, 'admin.users.empty')}
        </p>
      ) : (
        <>
          <p className="pb-2 text-caption" style={{ color: INK2 }}>
            {translate(language, 'admin.users.count', { count: String(page.total) })}
          </p>
          <ul className="grid gap-2">
            {page.users.map((compte) => (
              <UserRow key={compte.id} compte={compte} language={language} cible={cible} />
            ))}
          </ul>
          <div className="flex justify-between gap-2 pt-4">
            <button
              type="button"
              data-admin-users-prev
              disabled={offset === 0}
              onClick={() => setOffset((valeur) => Math.max(0, valeur - ADMIN_USERS_PAGE_SIZE))}
              className="rounded-chip px-4 text-body font-semibold disabled:opacity-40"
              style={{ minHeight: 44, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 16%, transparent)', color: INK }}
            >
              {translate(language, 'admin.users.previous')}
            </button>
            <button
              type="button"
              data-admin-users-next
              disabled={!page.hasMore}
              onClick={() => setOffset((valeur) => valeur + ADMIN_USERS_PAGE_SIZE)}
              className="rounded-chip px-4 text-body font-semibold disabled:opacity-40"
              style={{ minHeight: 44, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 16%, transparent)', color: INK }}
            >
              {translate(language, 'admin.users.next')}
            </button>
          </div>
        </>
      )}
    </AdminScreenFrame>
  );
}
