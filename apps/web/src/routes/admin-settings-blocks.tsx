import { useId, useState } from 'react';

import { AdminGlyph } from '@/components/admin/admin-glyph';
import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminInlineNotice } from '@/components/admin/states';
import { BRAND, EDGE, INK, INK2, SURFACE } from '@/components/admin/tone';
import { readSidebarFolded, writeSidebarFolded } from '@/lib/admin/admin-space';
import { useAdminAction } from '@/lib/admin/use-admin-action';
import type { AdminDeps } from '@/lib/api/admin';
import { ADMIN_DASHBOARD_KEYS, recomputeAdminDashboard } from '@/lib/api/admin-settings';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { AnnouncementTone } from '@/lib/view/use-live-announcer';

/**
 * **LES DEUX BLOCS QUI AGISSENT** (#8876, #6732) — recalculer les compteurs du tableau de
 * bord, et la préférence du menu latéral. Chacun a un effet, et le DIT : un réglage sans
 * effet serait un contrôle qui ment (loi 4).
 *
 * Aucune « configuration de la plateforme » n'est dessinée ici : aucune ressource ne la
 * sert, et une page de réglages qui ne règle rien est pire qu'une page absente.
 */
type Announce = (message: string, tone?: AnnouncementTone) => void;

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

/**
 * **RECALCULER LES COMPTEURS** — la plateforme garde ceux du tableau de bord dix minutes ;
 * le geste vide ce cache, puis relit les lectures du tableau de bord (les deux familles de
 * clés) et ANNONCE le résultat. Non destructif et sans effet de bord (le prochain affichage
 * recalcule simplement) : pas de confirmation. Hors ligne, le bouton est désactivé.
 *
 * Le bloc n'est posé que pour qui porte `canManageNotifications` : la route l'exige, et un
 * bouton voué au 403 n'a pas à exister.
 */
export function DashboardBlock({
  language,
  deps,
  online,
  announce,
}: {
  readonly language: InterfaceLanguage;
  readonly deps: AdminDeps;
  readonly online: boolean;
  readonly announce: Announce;
}) {
  const action = useAdminAction<{ readonly recomputed: true }>({ language, onAnnounce: announce });
  /* `run` ne rend la main qu'APRÈS la relecture : tant qu'elle dure, le geste est « en cours »
     pour l'écran, sans quoi un second appui partirait sur des compteurs que le premier rafraîchit. */
  const [settling, setSettling] = useState(false);
  const running = action.state.phase === 'running' || settling;

  const recompute = async () => {
    setSettling(true);
    try {
      await action.run({
        call: () => recomputeAdminDashboard(deps),
        success: 'admin.settings.dash.done',
        invalidate: ADMIN_DASHBOARD_KEYS,
      });
    } finally {
      setSettling(false);
    }
  };

  return (
    <AdminFicheSection id="settings-dashboard" title={translateAdmin(language, 'admin.settings.dash.title')}>
      <p className="text-body" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.settings.dash.body')}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-admin-action="recompute-dashboard"
          disabled={!online || running}
          aria-busy={running}
          onClick={() => void recompute()}
          className={`inline-flex items-center gap-2 rounded-chip px-5 text-body font-semibold text-white disabled:opacity-40 ${FOCUS}`}
          style={{ minHeight: 44, backgroundColor: BRAND, outlineColor: BRAND }}
        >
          <AdminGlyph name="arrowClockwise" size={16} />
          {translateAdmin(language, running ? 'admin.settings.dash.busy' : 'admin.settings.dash.action')}
        </button>
        {action.state.phase === 'done' ? (
          <span data-admin-dashboard-done className="inline-flex items-center gap-1 text-caption font-medium" style={{ color: 'var(--color-success)' }}>
            <AdminGlyph name="checkCircle" size={14} />
            {action.state.message}
          </span>
        ) : null}
      </div>
      {action.state.phase === 'error' ? <AdminInlineNotice tone="danger" text={action.state.message} /> : null}
    </AdminFicheSection>
  );
}

/**
 * **L'ESPACE D'ADMINISTRATION** — « Menu latéral replié par défaut » : le menu de grand
 * écran démarre réduit à ses icônes. C'est la MÊME préférence que le bouton de repli du
 * menu (`readSidebarFolded` / `writeSidebarFolded`, `admin-space.ts`), retenue par
 * navigateur — une commodité, jamais un état partagé. Elle s'applique à la prochaine
 * ouverture de l'administration, et le message du geste le dit.
 */
export function SpaceBlock({ language, announce }: { readonly language: InterfaceLanguage; readonly announce: Announce }) {
  const [folded, setFolded] = useState(readSidebarFolded);
  const labelId = useId();
  const hintId = useId();

  const toggle = () => {
    const next = !folded;
    writeSidebarFolded(next);
    setFolded(next);
    announce(translateAdmin(language, next ? 'admin.settings.space.foldedOn' : 'admin.settings.space.foldedOff'));
  };

  return (
    <AdminFicheSection id="settings-space" title={translateAdmin(language, 'admin.settings.space.title')}>
      <button
        type="button"
        role="switch"
        aria-checked={folded}
        aria-labelledby={labelId}
        aria-describedby={hintId}
        data-admin-action="toggle-folded-sidebar"
        onClick={toggle}
        className={`flex w-full items-center gap-3 rounded-chip text-start ${FOCUS}`}
        style={{ minHeight: 44, color: INK, outlineColor: BRAND }}
      >
        <span
          aria-hidden="true"
          className="relative inline-block h-7 w-12 shrink-0 rounded-full transition-colors"
          style={{ backgroundColor: folded ? BRAND : 'color-mix(in srgb, var(--color-ios-ink-3) 30%, transparent)', border: `1px solid ${EDGE}` }}
        >
          <span
            className="absolute top-0.5 size-6 rounded-full transition-all"
            style={{ backgroundColor: SURFACE, insetInlineStart: folded ? '1.375rem' : '0.125rem' }}
          />
        </span>
        <span id={labelId} className="min-w-0 break-words text-body font-medium">
          {translateAdmin(language, 'admin.settings.space.folded')}
        </span>
      </button>
      <p id={hintId} className="text-caption" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.settings.space.foldedHint')}
      </p>
    </AdminFicheSection>
  );
}
