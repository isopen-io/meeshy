import { Glyph } from '@/components/glyph';
import { Link } from '@/routes/route-table';

/**
 * LES TROIS ÉTATS DU FIL, AVANT SON RENDU RÉEL (#5650, F5/§5 étape 10) —
 * EXTRAITS de `routes/thread.tsx` (budget de taille, `CLAUDE.md` § Code
 * Style : le fichier était déjà à 908 lignes) plutôt qu'ajoutés sur place.
 * Chacun porte son PROPRE en-tête minimal (retour seul) : `ThreadRefused` et
 * `ThreadError` ne connaissent JAMAIS la conversation visée — D-6, aucun
 * titre, aucun compte de membres, même sur un refus 403 (« vous n'en êtes
 * pas membre » ne doit pas laisser deviner qu'elle EXISTE davantage qu'un
 * id qui n'existe pas du tout, F8).
 */

/**
 * `content-center` ET NON `place-items-center` SEUL (#5650, revue-correction)
 * — `grid flex-1 place-items-center` centre chaque enfant DANS SA RANGÉE, et
 * les rangées implicites se répartissent sur toute la hauteur : à l'écran,
 * l'icône était collée en haut, le titre au tiers, le bouton en bas — quatre
 * éléments éparpillés au lieu d'un bloc. `align-content: center` TASSE les
 * rangées au centre ; `gap-3` redevient l'espacement réel entre elles.
 */
function MinimalHeader() {
  return (
    <header
      className="z-10 shrink-0 backdrop-blur-xl"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-surface) 80%, transparent)' }}
    >
      <div className="flex items-center gap-2 px-4 py-2">
        <Link
          to="list"
          className="grid size-11 shrink-0 place-items-center rounded-chip"
          style={{ color: 'var(--color-ios-brand)' }}
          aria-label="Retour"
        >
          <Glyph name="caretLeft" size={22} />
        </Link>
      </div>
    </header>
  );
}

/** `status === 'refused'` (D-6) — 403/404 confondus : « elle n'existe pas,
 * ou vous n'en êtes pas membre », jamais l'un ou l'autre distingué. */
export function ThreadRefused() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <MinimalHeader />
      <div className="grid flex-1 content-center justify-items-center gap-3 px-8 text-center">
        <span style={{ color: 'var(--color-ios-ink-3)' }}>
          <Glyph name="lock" size={28} />
        </span>
        <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          Cette conversation n’est pas accessible
        </p>
        <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          Elle n’existe pas, ou vous n’en êtes pas membre.
        </p>
        <Link
          to="list"
          className="grid place-items-center rounded-chip px-5 text-body font-semibold text-white"
          style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
        >
          Retour aux conversations
        </Link>
      </div>
    </div>
  );
}

/** `status === 'error'` — la même carrosserie que `ThreadRefused`, un
 * échec RÉSEAU plutôt qu'un refus : « Réessayer » plutôt qu'un retour seul. */
export function ThreadError({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <MinimalHeader />
      <div role="alert" className="grid flex-1 content-center justify-items-center gap-3 px-8 text-center">
        <span style={{ color: 'var(--color-error)' }}>
          <Glyph name="warningCircle" size={28} />
        </span>
        <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          Impossible de charger le fil
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="grid place-items-center rounded-chip px-5 text-body font-semibold text-white"
          style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
        >
          Réessayer
        </button>
      </div>
    </div>
  );
}

const SKELETON_ROW_HEIGHT = 88;
const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

/** `status === 'pending'` — en-tête RÉEL (le retour reste utile pendant le
 * chargement) puis HUIT lignes de `SKELETON_ROW_HEIGHT` (l'estimation du
 * virtualiseur, `thread.tsx:296`), alternées 60 %/45 % de largeur. */
export function ThreadSkeleton() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <MinimalHeader />
      <div className="flex flex-1 flex-col gap-2 overflow-hidden px-3.5 pt-2" aria-busy="true" aria-label="Chargement du fil">
        {SKELETON_ROWS.map((i) => (
          <div key={i} className="flex items-end gap-2" style={{ height: SKELETON_ROW_HEIGHT, flexShrink: 0 }}>
            <div className="shrink-0 rounded-full" style={{ width: 28, height: 28, backgroundColor: 'var(--color-ios-card)' }} />
            <div
              className="rounded-chip"
              style={{ width: i % 2 === 0 ? '60%' : '45%', height: 40, backgroundColor: 'var(--color-ios-card)' }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
