import { BrandMark } from './brand-mark';
import { PULL_SETTLE_MS, type PullPhase } from '@/lib/view/pull-to-refresh';

export type PullIndicatorProps = {
  readonly phase: PullPhase;
  readonly offsetPx: number;
  /** `true` sous `prefers-reduced-motion: reduce` — voir la note sur le
   * calcul du décalage de repos, plus bas. */
  readonly reducedMotion?: boolean;
};

const INDICATOR_SIZE = 28;
const LINE_WIDTH = 3;

function progressOf(phase: PullPhase): number {
  if (phase.kind === 'pulling') return phase.progress;
  if (phase.kind === 'armed' || phase.kind === 'refreshing' || phase.kind === 'completing') return 1;
  return 0;
}

function announcementOf(phase: PullPhase): string {
  if (phase.kind === 'armed') return 'Relâchez pour actualiser';
  if (phase.kind === 'refreshing') return 'Actualisation…';
  if (phase.kind === 'completing') return phase.outcome === 'ok' ? 'Liste à jour' : 'Actualisation impossible';
  return '';
}

/**
 * UN ÉCHEC SE VOIT, il ne s'annonce pas seulement (revue-correction #6195).
 * `announcementOf` distinguait déjà « Liste à jour » d'« Actualisation
 * impossible » — pour un lecteur d'écran SEUL : les pixels étaient
 * IDENTIQUES dans les deux cas, et un rafraîchissement raté sur un cache non
 * vide (le cas nominal d'un réseau qui tombe) ne laissait aucune trace
 * VISIBLE. `--color-error` (conscient du schéma — le MÊME jeton que
 * `ListError` sert déjà dans ce fichier de route, et que huit autres
 * composants) teinte la marque le temps de la phase `completing`, sans
 * ajouter ni bandeau ni toast (D-11).
 *
 * `--ios-error` (utilisé jusqu'ici) n'a AUCUNE redéfinition sous `:root.light`
 * dans `ios.css` : il vaut `#f87171` sur `--ios-surface: #ffffff`, mesuré
 * 2,77:1 — sous les 3:1 exigés d'un élément non textuel porteur d'information
 * (WCAG 1.4.11), là où `--color-error` mesure 5,74:1 en clair et 6,15:1 en
 * sombre (revue-correction #6195, défaut 6).
 */
function tintOf(phase: PullPhase): string {
  return phase.kind === 'completing' && phase.outcome === 'failed' ? 'var(--color-error)' : 'var(--color-ios-brand)';
}

/**
 * `PullIndicator` (#6195) — miroir de `MeeshyPullIndicator` (iOS) : le logo
 * de marque (`BrandMark`, actif RÉCUPÉRÉ, directive 4) qui s'affirme avec la
 * progression du geste, et UNE région `role="status"` (D-11 : jamais un toast
 * de plus) qui annonce chaque phase.
 */
export function PullIndicator({ phase, offsetPx, reducedMotion = false }: PullIndicatorProps) {
  const progress = progressOf(phase);
  /* MÊME RÉGIME QUE LE SCROLLPORT (`pullTransform`, revue-correction #6195) :
     doigt POSÉ ⇒ aucune transition, la marque suit le doigt à l'image près ;
     doigt PARTI ⇒ la transition, pour que le retour et la teinte d'échec
     s'animent au lieu de claquer. */
  const settles = phase.kind !== 'pulling' && phase.kind !== 'armed';
  return (
    /**
     * ANCRÉ AU HAUT DE LA LISTE, PAS AU HAUT DE L'ÉCRAN (revue-correction
     * #6195). `absolute top-0` prenait pour repère le CADRE de l'écran : la
     * marque se peignait sous le TITRE de l'en-tête, à ~60 px au-dessus de la
     * réserve que le geste venait d'ouvrir — mesuré à la capture, dans les
     * deux schémas. Une boîte EN FLUX de hauteur NULLE, posée entre l'en-tête
     * et le scrollport, met ce repère exactement là où la réserve commence,
     * sans rien ajouter à la mise en page (`height: 0` ⇒ zéro contribution au
     * flex, `offsetTop` des rangées inchangé — l'invariant de `check-lens.mjs`).
     */
    <div className="pointer-events-none relative z-10 grid place-items-center" style={{ height: 0 }}>
      <div
        aria-hidden="true"
        style={{
          opacity: progress,
          /**
           * SOUS MOUVEMENT RÉDUIT, `offsetPx` reste épinglé à `0` À TOUTE
           * PHASE (`usePullToRefresh`, Q1) : `offsetPx - 40` restait alors
           * COLLÉ à `translateY(-40px)` — 40 px AU-DESSUS de l'ancre posée par
           * la boîte de hauteur nulle, donc dans l'en-tête, à pleine opacité
           * dès `armed` (revue-correction #6195, défaut 4). Le décalage de
           * repos doit se dériver de la MÊME source que la réserve : sous
           * mouvement réduit il n'y a pas de réserve à suivre, donc la marque
           * se peint À l'ancre elle-même (`0`), dans la bande que la boîte
           * délimite — jamais 40 px au-dessus.
           */
          transform: `translateY(${reducedMotion ? 0 : offsetPx - 40}px) scale(${0.6 + 0.4 * progress})`,
          ...(settles
            ? { transitionProperty: 'transform, opacity, color', transitionDuration: `${PULL_SETTLE_MS}ms` }
            : {}),
          color: tintOf(phase),
        }}
      >
        <BrandMark size={INDICATOR_SIZE} lineWidth={LINE_WIDTH} />
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {announcementOf(phase)}
      </span>
    </div>
  );
}
