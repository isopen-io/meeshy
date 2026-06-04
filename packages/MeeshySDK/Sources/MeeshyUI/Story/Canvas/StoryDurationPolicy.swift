import Foundation

/// Politique de durée minimale d'une slide quand son background media (audio
/// ou vidéo) a une durée inférieure au seuil. Garantit que l'utilisateur a le
/// temps de percevoir le contenu avant transition de slide.
///
/// **Règle** : si `bgMediaDuration < minimumLoopAccumulation`, la slide
/// joue pendant `ceil(minimumLoopAccumulation / bgMediaDuration) × bgMediaDuration`
/// secondes — donc un nombre entier de boucles complètes, jamais coupées mid-loop.
///
/// **Source** : design 2026-05-28 « loops audio + règle si BG < 6s → looper
/// jusqu'à 6s » validée @jcnm. Applique uniformément aux 2 types de média
/// (`AVPlayerLooper` du `StoryBackgroundLayer` gère le bouclage natif ;
/// cette policy ajuste juste la durée NOMINALE de la slide).
///
/// **Note** : la production utilise cette logique implicitement via
/// `StorySlide.computedTotalDuration()` dans `StoryModels.swift:926`. Le
/// présent type extrait la règle comme primitive testable et documente
/// la constante 6s comme point d'attache pour futures évolutions.
/// Le bg audio loop est déjà câblé par défaut côté
/// `StoryCanvasUIView.configureBackground(looping: background.loop ?? true)`.
public enum StoryDurationPolicy {

    /// Seuil minimum (secondes) — durée totale cumulée minimum pour BG court.
    ///
    /// `nonisolated` explicite pour permettre la lecture depuis n'importe quel
    /// actor (MeeshyUI utilise `defaultIsolation: MainActor`, donc sans cette
    /// annotation le static serait MainActor-isolé et les tests `XCTestCase`
    /// non-MainActor ne pourraient pas y accéder synchronement).
    nonisolated public static let minimumLoopAccumulation: TimeInterval = 6.0

    /// Calcule la durée effective de la slide à partir de la durée intrinsèque
    /// (texte, photo, etc.) et de la durée du média background (optionnelle).
    ///
    /// `nonisolated` : pure math, pas de side-effect, peut tourner sur n'importe
    /// quel thread. Voir `StoryDurationPolicyTests` non-MainActor pour la raison.
    ///
    /// - Parameters:
    ///   - intrinsic: durée qu'aurait la slide sans la règle de loop (texte, photo, durée explicite, etc.)
    ///   - backgroundMediaDuration: durée du media BG en secondes
    ///     (`nil` si pas de média BG, `0` ou négatif si non résolu — traité comme nil)
    /// - Returns: la durée finale appliquée. Toujours `>= intrinsic`.
    nonisolated public static func adjustedDuration(
        intrinsic: TimeInterval,
        backgroundMediaDuration: TimeInterval?
    ) -> TimeInterval {
        guard
            let d = backgroundMediaDuration,
            d > 0,
            d < minimumLoopAccumulation
        else {
            return intrinsic
        }
        let loops = ceil(minimumLoopAccumulation / d)
        let loopTotal = loops * d
        return max(intrinsic, loopTotal)
    }
}
