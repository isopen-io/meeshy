import Foundation
@preconcurrency import Lottie

// MARK: - Quand une couche Lottie joue (#10638, spec D6)

/// **La loi de lecture d'une couche Lottie** — pure, donc éprouvée sans écran.
///
/// Une couche animée (fond, bannière, contour) n'est jamais indispensable :
/// elle joue quand TOUT l'autorise, et s'arrête sinon.
/// - Réduire les animations ⇒ l'image fixe est la PREMIÈRE image du film : la couche perd
///   son mouvement, pas son intention. Cette règle l'emporte sur toutes les autres.
/// - App en arrière-plan ou couche hors écran ⇒ pause là où elle en est (aucun travail de
///   rendu pour une image que personne ne voit), reprise au retour.
/// - `animates: false` (décision de l'app : aperçu, mode économie) ⇒ première image.
nonisolated public enum LottieLayerPlayback {

    /// Le moteur Core Animation : le mouvement tourne dans le serveur de rendu, à la cadence
    /// de l'écran, sans image à décoder ni à garder en mémoire.
    public static let configuration = LottieConfiguration(renderingEngine: .coreAnimation)

    public static func mode(animates: Bool, reduceMotion: Bool, sceneActive: Bool, onScreen: Bool) -> LottiePlaybackMode {
        guard animates, !reduceMotion else { return .paused(at: .progress(0)) }
        guard sceneActive, onScreen else { return .paused(at: .currentFrame) }
        return .playing(.fromProgress(0, toProgress: 1, loopMode: .loop))
    }
}
