import Foundation
import MeeshySDK
import MeeshyUI

// MARK: - Qui préchauffer

/// **Le réel qui SUIT l'actif dans le fil** (#7009).
///
/// Le coordinateur d'autoplay n'élisait que le réel ACTIF : le voisin n'était
/// touché qu'au moment où il devenait actif à son tour, et le swipe montrait un
/// trou noir le temps du premier frame. Le tableau des frames porte pourtant
/// déjà tout ce qu'il faut — chacune sait son `midY`.
///
/// Règle purement GÉOMÉTRIQUE, donc éprouvable sans lecteur ni réseau : le fil
/// défile vers le bas, « suivant » est le `midY` immédiatement supérieur à
/// celui de l'actif. Le PRÉCÉDENT n'est pas préchauffé — il vient d'être joué,
/// son lecteur est encore dans le pool (borné à trois, éviction FIFO), et lui
/// réserver une place coûterait celle du suivant pour servir le geste
/// minoritaire.
nonisolated enum ReelPrewarmWindow {

    static func next(after activeId: String?, in frames: [ReelFrame]) -> String? {
        guard let activeId,
              let active = frames.first(where: { $0.id == activeId }) else { return nil }
        return frames
            .filter { $0.midY > active.midY }
            .min(by: { $0.midY < $1.midY })?
            .id
    }
}

// MARK: - Préchauffage d'un réel

/// Prépare l'`AVPlayerItem` d'un réel AVANT qu'il ne devienne actif.
///
/// Orchestration produit, donc app-side : elle lit un `FeedPost`, résout son
/// URL par `MeeshyConfig`, et encode une règle « quand préchauffer ». Le SDK
/// fournit les atomes — `StoryMediaLoader.preloadAndCachePlayer(url:)`, dont le
/// pool est déjà **borné à trois lecteurs** avec éviction FIFO et purge sur
/// avertissement mémoire ; c'est lui qui libère N−2 quand N+1 entre, et rien
/// ici n'a à le refaire.
///
/// Deux disciplines reprises du préchauffage de pagination
/// (`FeedViewModel`) et du prefetcher de stories :
/// - **garde thermique** — un appareil qui chauffe cesse d'ouvrir des sessions
///   de décodage, sinon un défilement rapide en empile jusqu'au throttling ;
/// - **priorité de fond** — le préchauffage ne dispute jamais le thread du
///   geste en cours.
///
/// Et surtout : on PRÉPARE, on ne JOUE pas. `preloadAndCachePlayer` ne appelle
/// jamais `play()`, donc la session audio n'est pas activée
/// (`SharedAVPlayerManager.play` en est le seul site) et le voisin reste muet.
@MainActor
enum ReelPrewarm {

    /// L'URL vidéo d'un réel, ou `nil` quand il n'en porte pas (réel photo,
    /// audio, scène sans vidéo) — auquel cas il n'y a rien à préchauffer.
    nonisolated static func videoURL(for post: FeedPost) -> URL? {
        guard let media = post.media.first(where: { $0.type == .video }),
              let raw = media.url else { return nil }
        return MeeshyConfig.resolveMediaURL(raw)
    }

    static func prepare(_ post: FeedPost) async {
        guard MediaThermalPolicy.shouldPrefetchVideo(
            thermalState: ProcessInfo.processInfo.thermalState
        ) else { return }
        guard let url = videoURL(for: post) else { return }
        await StoryMediaLoader.shared.preloadAndCachePlayer(url: url)
    }
}
