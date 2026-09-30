import { AdminGlyph } from '@/components/admin/admin-glyph';
import { AdminBadge, AdminRoleBadge } from '@/components/admin/badges';
import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminMetaRow } from '@/components/admin/meta';
import { INK, INK2, INK3, TONE_COLOR } from '@/components/admin/tone';
import { interpretRole } from '@/lib/admin/interpret/enums';
import { SOVEREIGN_GESTURES, capabilityOpensText, capabilityRows } from '@/lib/admin/settings-access';
import type { AdminReach } from '@/lib/admin/use-admin-reach';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **VOTRE ACCÈS** (#8876, #6732) — le rôle, les dix capacités servies dites en mots
 * (accordée ou non, et ce que chacune ouvre), et, pour le créateur, les gestes que son
 * rang ouvre.
 *
 * Tout vient de la matrice que la plateforme SERT (`reach`) : cet écran ne décide de rien,
 * il dit ce qui a été décidé. Une capacité non accordée n'est pas cachée — elle dit ce
 * qu'elle ouvrirait, parce que « pourquoi je ne vois pas cette section ? » doit trouver sa
 * réponse ici. Ce que chaque capacité ouvre est LU dans le registre des sections.
 */
const SOVEREIGN_GLYPH = 'shieldCheck' as const;

export function AccessBlock({ language, reach }: { readonly language: InterfaceLanguage; readonly reach: AdminReach }) {
  const role = interpretRole(reach.role, language);
  const rows = capabilityRows({ granted: reach.can, reached: reach.sections });

  return (
    <>
      <AdminFicheSection id="settings-access" title={translateAdmin(language, 'admin.settings.access.title')}>
        <p className="text-body" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.settings.access.intro')}
        </p>
        <dl className="grid gap-3">
          <AdminMetaRow
            anchor="role"
            label={translateAdmin(language, 'admin.settings.access.role')}
            value={<AdminRoleBadge language={language} role={reach.role} />}
            explain={role.explain}
          />
        </dl>
        <h3 className="text-caption font-semibold uppercase" style={{ color: INK3 }}>
          {translateAdmin(language, 'admin.settings.access.list')}
        </h3>
        <ul className="grid gap-3" data-admin-capabilities>
          {rows.map((row) => (
            <li
              key={row.key}
              data-admin-capability={row.key}
              data-admin-granted={row.granted ? 'yes' : 'no'}
              className="grid gap-1 border-t pt-3 first:border-t-0 first:pt-0"
              style={{ borderColor: 'var(--color-edge)' }}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium" style={{ color: INK }}>
                  {translateAdmin(language, `admin.settings.cap.${row.key}.label`)}
                </span>
                <AdminBadge tone={row.granted ? 'success' : 'neutral'} glyph={row.granted ? 'checkCircle' : 'prohibit'}>
                  {translateAdmin(language, row.granted ? 'admin.settings.access.granted' : 'admin.settings.access.denied')}
                </AdminBadge>
              </span>
              <span className="text-caption" style={{ color: INK2 }}>
                {translateAdmin(language, `admin.settings.cap.${row.key}.explain`)}
              </span>
              <span data-admin-capability-opens className="text-caption" style={{ color: INK3 }}>
                {capabilityOpensText(row, language)}
              </span>
            </li>
          ))}
        </ul>
      </AdminFicheSection>

      {reach.isSovereign ? (
        <AdminFicheSection id="settings-sovereign" title={translateAdmin(language, 'admin.settings.sovereign.title')}>
          <p className="text-body" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.settings.sovereign.intro')}
          </p>
          <ul className="grid gap-2" data-admin-sovereign-gestures>
            {SOVEREIGN_GESTURES.map((gesture) => (
              <li key={gesture} data-admin-sovereign-gesture={gesture} className="flex items-start gap-3" style={{ minHeight: 28 }}>
                <span aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: TONE_COLOR.info }}>
                  <AdminGlyph name={SOVEREIGN_GLYPH} size={18} />
                </span>
                <span className="min-w-0 break-words text-body" style={{ color: INK }}>
                  {translateAdmin(language, `admin.settings.sovereign.${gesture}`)}
                </span>
              </li>
            ))}
          </ul>
        </AdminFicheSection>
      ) : null}
    </>
  );
}
