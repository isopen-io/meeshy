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
    ///
    /// **`primaryReelDisplayMedia`, et surtout pas `media.first(…)`** : c'est
    /// la propriété que `ReelFeedVideoSurface` interroge pour décider quoi
    /// JOUER, et le préchauffage doit remplir le cache sous la clé que la
    /// lecture ira y chercher. Elle est de plus repost-consciente — un réel
    /// republié ne porte aucun média sur le post extérieur, et une résolution
    /// écrite à la main ici aurait silencieusement cessé de préchauffer toute
    /// cette famille. Un cache alimenté sous une clé que personne ne lit ne
    /// préchauffe rien ; il ne fait que dépenser.
    nonisolated static func videoURL(for post: FeedPost) -> URL? {
        guard let media = post.primaryReelDisplayMedia, media.type == .video,
              let raw = media.url, !raw.isEmpty else { return nil }
        return MeeshyConfig.resolveMediaURL(raw)
    }

    /// Prépare le réel `post` : son FICHIER d'abord, son lecteur ensuite.
    ///
    /// **Le fichier est la moitié qui manquait** (#7625). La surface vidéo
    /// (`ReelVideoView`, `ReelFeedVideoSurface`) ne charge le moteur que
    /// lorsque `VideoAvailabilityResolver` rend `.ready` — le fichier SUR
    /// DISQUE. Un lecteur préparé en streaming dormait donc dans le pool
    /// pendant que la page affichait poster et indicateur le temps du
    /// téléchargement, lancé seulement quand la page entrait à l'écran. Le
    /// fichier part désormais dans le registre partagé, en silence, et la
    /// surface montée au swipe le rejoint ou le trouve prêt.
    ///
    /// `preroll: false` pour un voisin qu'on garde sans le préparer à jouer —
    /// le précédent, déjà vu : son fichier suffit, sa place dans le pool
    /// (trois lecteurs) revient au suivant.
    static func prepare(
        _ post: FeedPost,
        preroll: Bool = true,
        center: AttachmentDownloadCenter = .shared
    ) async {
        guard MediaThermalPolicy.shouldPrefetchVideo(
            thermalState: ProcessInfo.processInfo.thermalState
        ) else { return }
        guard let media = post.primaryReelDisplayMedia, media.type == .video,
              let url = videoURL(for: post) else { return }
        let attachment = media.toMessageAttachment()
        center.prefetch(urlString: attachment.fileUrl,
                        expectedSize: Int64(attachment.fileSize),
                        cacheStore: .video)
        guard preroll else { return }
        await StoryMediaLoader.shared.preloadAndCachePlayer(url: url)
    }
}

// MARK: - Qui préchauffer dans le lecteur plein écran

/// **Les deux voisins du réel affiché dans le pager plein écran** (#7625).
///
/// `ReelsPlayerView` ne préparait RIEN : sa pile est paresseuse, la page N+1
/// n'était montée qu'en entrant à l'écran, et c'est seulement là que son
/// téléchargement partait. Le SUIVANT passe en premier — c'est le geste
/// majoritaire ; le PRÉCÉDENT ensuite, pour qu'un retour arrière retrouve son
/// fichier. Règle d'ORDRE pure (l'ordre du pager est celui du tableau), donc
/// éprouvable sans lecteur ni réseau.
nonisolated enum ReelPagerPrewarmWindow {

    static func neighbours(of currentId: String?, in ids: [String]) -> [String] {
        guard let currentId, let index = ids.firstIndex(of: currentId) else { return [] }
        let previous = index > 0 ? ids[index - 1] : nil
        return [next(of: currentId, in: ids), previous].compactMap { $0 }
    }

    /// Le seul voisin dont on prépare aussi le LECTEUR — le pool est borné.
    static func next(of currentId: String?, in ids: [String]) -> String? {
        guard let currentId, let index = ids.firstIndex(of: currentId),
              ids.indices.contains(index + 1) else { return nil }
        return ids[index + 1]
    }
}
