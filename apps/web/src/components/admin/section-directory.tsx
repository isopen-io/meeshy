import { routeInSpace } from '@/lib/admin/admin-space';
import { ADMIN_GROUPS } from '@/lib/admin/sections';
import type { AdminReach } from '@/lib/admin/use-admin-reach';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { Link } from '@/routes/route-table';

import { AdminGlyph } from './admin-glyph';
import { BRAND, EDGE, INK, INK2, SURFACE, toneBackground } from './tone';

/**
 * **LE RÉPERTOIRE DES SECTIONS DU HUB** (#8876) — les tuiles rangées par groupe,
 * chacune un LIEN vers sa section dans l'ESPACE COURANT (`/adm` reste `/adm`,
 * D-76), avec son glyphe, son libellé et la ligne qui dit ce qu'on y fait.
 *
 * Il ne liste que ce que `reach.sections` porte — visible ET prête — et saute le
 * tableau de bord, où l'on se trouve : jamais une tuile qui ne mène nulle part,
 * jamais une tuile pour la page qu'on regarde.
 */
export function AdminSectionDirectory({ language, reach }: { readonly language: InterfaceLanguage; readonly reach: AdminReach }) {
  const groupes = ADMIN_GROUPS.map((groupe) => ({
    groupe,
    tuiles: reach.sections.filter((section) => section.group === groupe.id && section.id !== 'dashboard'),
  })).filter(({ tuiles }) => tuiles.length > 0);

  return (
    <div className="grid gap-6" data-admin-directory>
      {groupes.map(({ groupe, tuiles }) => (
        <section key={groupe.id} aria-labelledby={`admin-group-${groupe.id}`} className="grid gap-3" data-admin-group={groupe.id}>
          <h2 id={`admin-group-${groupe.id}`} className="text-title font-semibold" style={{ color: INK }}>
            {translateAdmin(language, groupe.labelKey)}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tuiles.map((section) => (
              <li key={section.id}>
                <Link
                  to={routeInSpace(section.route, reach.space)}
                  data-admin-section={section.id}
                  className="flex h-full items-start gap-3 rounded-card p-4 focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ minHeight: 56, backgroundColor: SURFACE, border: `1px solid ${EDGE}`, color: INK, outlineColor: BRAND }}
                >
                  <span
                    aria-hidden="true"
                    className="grid size-10 shrink-0 place-items-center rounded-chip"
                    style={{ backgroundColor: toneBackground('brand'), color: BRAND }}
                  >
                    <AdminGlyph name={section.glyph} size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-body font-semibold">{translateAdmin(language, section.labelKey)}</span>
                    <span className="block text-caption" style={{ color: INK2 }}>
                      {translateAdmin(language, `${section.labelKey}.hint`)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
