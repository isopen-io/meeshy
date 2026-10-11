import { AdminGameSeasonsPanel } from '@/routes/admin-game-seasons-parts';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

/**
 * **LE CALENDRIER DES SAISONS, BLOC DE « BARÈME DE POINTS »** (#10232, #10233) — aucune route neuve : le budget du
 * module d'entrée (`budgets.json › first_paint`) ne paie rien pour lui. L'écran du barème le monte sous son panneau
 * quand le lecteur porte `canManageGame` (BIGBOSS et ADMIN), et le panneau (la loi des saisons, le cache du calendrier,
 * l'éditeur, les propositions, l'export) vit dans CE module, que l'écran charge par `lazy(import())`.
 */
export default function AdminGameSeasonsBlock({ language }: { readonly language: AdminLanguage }) {
  return (
    <section aria-labelledby="gameseasons-block-title" className="grid gap-4" data-admin-game-seasons-block>
      <div className="grid gap-1">
        <h2 id="gameseasons-block-title" className="text-title font-semibold">
          {translateAdmin(language, 'admin.gameSeasons.title')}
        </h2>
        <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {translateAdmin(language, 'admin.gameSeasons.subtitle')}
        </p>
      </div>
      <AdminGameSeasonsPanel language={language} deps={apiDeps} />
    </section>
  );
}
