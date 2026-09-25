import { useStore } from 'zustand/react';

import { appUpdateStore } from '@/lib/app-update/pending-store';
import { appUpdateController, type RegistrationLike } from '@/lib/app-update/service-worker';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';

import { Glyph } from './glyph';

/**
 * LA BANNIÈRE DE MISE À JOUR (#6936) — le comportement du legacy
 * (`apps/web/components/common/SystemStatusBanner.tsx`), la matière de la v2.
 *
 * CE QU'ELLE REPREND DU LEGACY : le texte (« Une nouvelle version de Meeshy est
 * disponible ! »), les deux contrôles (« Mettre à jour », une croix
 * « Attendre »), l'annonce `role="status" aria-live="polite"`, et la PRIORITÉ
 * de la coupure réseau — hors ligne, elle ne peint rien : ce que le lecteur a
 * besoin de savoir à ce moment-là, c'est qu'il est hors ligne, et la pastille
 * de synchronisation le dit déjà (`components/sync-pill.tsx`).
 *
 * CE QU'ELLE N'EN REPREND PAS : la bande pleine largeur collée en haut du
 * document. La v2 suit l'interface iOS, où toute annonce vivante est une CARTE
 * flottante sous l'encoche, posée au-dessus du chrome de l'écran
 * (`RootChromeLayer`) — même géographie que la pastille, une marche plus haut
 * puisque celle-ci PREND des gestes et que la pastille n'en prend aucun.
 *
 * LE TEXTE EST LU AU RENDU (`translate`), pas capturé : la langue d'interface
 * change à chaud (#6206, `InterfaceLanguageRoot` remonte l'arbre), et une
 * bannière restée dans la langue précédente serait le seul texte de
 * l'application à ne pas suivre.
 */
export function AppUpdateBanner({
  /**
   * CE QUE LE CLIC FAIT — injecté pour être TÉMOIGNABLE. Le défaut est le
   * contrôleur de la page : purge des caches possédés, purge du cache de
   * requêtes persisté, `SKIP_WAITING`, UN rechargement.
   */
  apply = (registration) => void appUpdateController().applyUpdate(registration),
}: {
  readonly apply?: (registration: RegistrationLike) => void;
}) {
  const online = useOnline();
  const pending = useStore(appUpdateStore, (state) => state.pending);
  const store = useStore(appUpdateStore, (state) => state.store);
  const dismissed = useStore(appUpdateStore, (state) => state.dismissed);
  const applying = useStore(appUpdateStore, (state) => state.applying);
  const language = currentInterfaceLanguage();

  /* LA COUPURE PASSE D'ABORD (legacy, `SystemStatusBanner` § « Priorité 1 ») —
     et elle n'est pas qu'une question de hiérarchie : un rechargement hors
     ligne rendrait la coquille du cache, pas la version neuve. */
  if (!online || (pending === null && store === null) || dismissed) return null;

  const onApply = (): void => {
    if (applying || pending === null) return;
    appUpdateStore.getState().markApplying();
    apply(pending);
  };

  const actionClass =
    'grid min-h-11 shrink-0 place-items-center rounded-chip px-3.5 text-title font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2';
  const actionStyle = {
    background: 'linear-gradient(135deg, var(--color-ios-brand), var(--color-ios-brand-deep))',
    outlineColor: 'var(--color-ios-brand)',
  };

  return (
    <div
      className="fixed inset-x-0 z-50 flex justify-center px-4"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
    >
      <div
        role="status"
        aria-live="polite"
        aria-label={translate(language, 'appUpdate.region')}
        data-app-update="banner"
        className="flex w-full max-w-[520px] items-center gap-3 rounded-card px-3 py-2 shadow-lg"
        style={{
          backgroundColor: 'var(--color-ios-card)',
          border: '1px solid var(--color-edge)',
          color: 'var(--color-ios-ink)',
        }}
      >
        <span
          className="grid size-9 shrink-0 place-items-center rounded-chip text-white"
          style={{ background: 'linear-gradient(135deg, var(--color-ios-brand), var(--color-ios-brand-deep))' }}
          aria-hidden
        >
          <Glyph name="arrowUp" size={18} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-title font-semibold">{translate(language, 'appUpdate.available')}</p>
          <p className="text-mini" style={{ color: 'var(--color-ios-ink-2)' }}>
            {translate(language, store !== null && pending === null ? 'appUpdate.storeHint' : 'appUpdate.hint')}
          </p>
        </div>

        {/* CIBLES ≥ 44 px (dimension 5) — `min-h-11` sur les DEUX contrôles, et
            la croix aussi large que haute : une cible de 44 × 20 n'est pas une
            cible de 44. */}
        {/* LA COQUE (#6937) : sa version neuve vit sur le magasin, pas dans un
            service worker — l'action OUVRE la fiche. Un lien externe : la
            coque le confie au système (Play Store, App Store), comme les
            liens d'un message. */}
        {pending === null && store !== null ? (
          <a href={store.storeUrl} target="_blank" rel="noopener noreferrer" className={actionClass} style={actionStyle}>
            {translate(language, 'appUpdate.action')}
          </a>
        ) : (
          <button type="button" onClick={onApply} disabled={applying} className={actionClass} style={actionStyle}>
            {translate(language, applying ? 'appUpdate.applying' : 'appUpdate.action')}
          </button>
        )}

        <button
          type="button"
          onClick={() => appUpdateStore.getState().dismiss()}
          aria-label={translate(language, 'appUpdate.dismiss')}
          className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ color: 'var(--color-ios-ink-2)', outlineColor: 'var(--color-ios-brand)' }}
        >
          <Glyph name="x" size={16} />
        </button>
      </div>
    </div>
  );
}
