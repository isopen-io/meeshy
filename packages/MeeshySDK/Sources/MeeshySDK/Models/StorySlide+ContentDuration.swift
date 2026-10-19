import CoreGraphics
import Foundation

extension StorySlide {
    /// SINGLE SOURCE OF TRUTH pour la durée d'un slide story.
    /// User spec 2026-05-28 : « rassembler les choses dans un seul lieu,
    /// respecter les 6s pour les statics (sauf si trop de long texte) ».
    ///
    /// PRIORITÉ (calculée from scratch — IGNORE `effects.slideDuration`
    /// persisté car les anciennes stories backend portent des valeurs
    /// arbitraires (12 s, etc.) issues du composer qui écrivait
    /// `slides[i].effects.slideDuration = Float(slides[i].duration)` à
    /// chaque publish, contournant cette source de vérité) :
    ///
    /// 1. Background vidéo OU audio présent → durée du media :
    ///    - media ≥ 6 s → exact
    ///    - media < 6 s → loop jusqu'à ≥ 6 s (`ceil(6 / dur) × dur`)
    ///
    /// 2. Texte long (cumul mots > 30) → 6 s + (mots − 30) / 6 secondes
    ///    (1 s par tranche de 6 mots au-delà de 30) pour donner au
    ///    lecteur le temps de lire.
    ///
    /// 3. Slide statique sans long texte → 6 s strict.
    ///
    /// Cette fonction est l'UNIQUE point d'autorité. Utilisée par le
    /// canvas displayLink (auto-advance), le viewer wall-clock (progress
    /// bar) et l'exporter (composition AVFoundation). Personne ne lit
    /// `effects.slideDuration` directement.
    static let defaultStaticDuration: TimeInterval = 6.0
    static let longTextThresholdWords: Int = 30
    static let longTextSecondsPerWord: Double = 1.0 / 6.0

    public func computedTotalDuration() -> TimeInterval {
        // PRIORITÉ 0 — autorité timeline (« la timeline EST la story »). Si l'auteur
        // a configuré la durée du slide via le timeline editor, elle est AUTORITAIRE :
        // elle gagne sur le contenu (un média plus long est rogné). Champ dédié
        // `timelineDuration` (distinct du legacy `slideDuration` aux valeurs backend
        // arbitraires) → `nil` pour tout l'existant = fallback contenu, zéro régression.
        if let pinned = effects.timelineDuration, pinned > 0 {
            return pinned
        }
        return contentDerivedDuration()
    }

    /// Durée dérivée du CONTENU (bg media loop / texte long / 6 s statique), en
    /// IGNORANT le pin timeline. Sert (1) de fallback à `computedTotalDuration()`
    /// quand aucun pin n'est posé, et (2) de référence pour décider si une durée
    /// configurée par le timeline est une vraie surcharge auteur (≠ contenu) ou
    /// juste la valeur auto — cf. `TimelineProject.apply`.
    public func contentDerivedDuration() -> TimeInterval {
        // Règle : MAX(donnée la plus longue, durée lecture texte, 6 s statique).
        // Directive user 2026-07-14 : « la timeline prend la durée automatique
        // de la donnée la plus longue (audio, vidéo) » — TOUTES sources : bg ET
        // fg, vidéo ET audio, chacune mesurée par sa FENÊTRE `startTime + duration`.
        // Core algorithm lives on `StoryEffects.contentDerivedDuration(...)` so
        // `TimelineProject` (same three arrays, not a `StorySlide`) can call it
        // too during live editing — see `TimelineViewModel.recomputeSlideDuration()`.
        StoryEffects.contentDerivedDuration(
            mediaObjects: effects.mediaObjects,
            audioPlayerObjects: effects.audioPlayerObjects,
            textObjects: effects.textObjects
        )
    }

    /// Effective slide duration that completes any background looping video to a full repetition.
    ///
    /// Examples:
    ///   slide=12s, video=5s → 15s (3 repetitions)
    ///   slide=12s, video=6s → 12s (exact 2 repetitions)
    ///
    /// Now an alias for `computedTotalDuration()`, which covers every element
    /// on the slide — not just looped backgrounds. Kept as a function rather
    /// than removed so out-of-tree callers (tests, fixtures) keep compiling.
    public func effectiveSlideDuration() -> TimeInterval {
        computedTotalDuration()
    }
}
