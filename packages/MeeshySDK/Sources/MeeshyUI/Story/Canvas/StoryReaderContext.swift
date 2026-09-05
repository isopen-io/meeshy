import Foundation
import UIKit
import AVFoundation
import MeeshySDK

/// Runtime parameters for `StoryCanvasUIView` mode `.play` reader playback.
///
/// Carries the Prisme Linguistique resolution chain, audio mute state,
/// completion callback (notified when `currentTime ≥ effectiveSlideDuration`),
/// post-media URL resolver (maps `postMediaId` → `URL`), and an optional
/// image cache for thumbHash placeholder + asset lookup.
public struct StoryReaderContext: Sendable {
    public let preferredLanguages: [String]
    public let mute: Bool
    public let onCompletion: (@Sendable () -> Void)?
    public let postMediaURLResolver: (@Sendable (String) -> URL?)?
    public let imageCache: ImageCacheReader?
    /// Résolveur d'URL audio LOCALE keyé par `audio.id` (et non `postMediaId`).
    /// Le composer/preview stockent leurs clips fraîchement importés dans
    /// `loadedAudioURLs[audio.id]` avec un `postMediaId` vide — le resolver
    /// `postMediaURLResolver` (par `postMediaId`) échoue alors et le son restait
    /// muet. Consommé en priorité par `reconfigureAudioForPlayback`. Directive
    /// user 2026-07-14 : « la preview doit jouer le son en arrière-plan ».
    public let localAudioURLResolver: (@Sendable (String) -> URL?)?
    /// Fournisseur du player du média PORTEUR (O16). Renseigné par les surfaces
    /// de LECTURE, `nil` sur le canvas de COMPOSITION — qui garde ses players
    /// privés, seuls capables de suivre une timeline en cours d'édition.
    public let playerProvider: (any StoryCarrierPlayerProviding)?

    /// **Le muet de cette surface est-il VERROUILLÉ ?** (#4084)
    ///
    /// `mute` dit l'ÉTAT, celui-ci dit s'il a le droit de changer. Les deux se
    /// lisent ensemble, comme `ScenePlayerConfig.isMuted` et `locksMute` dont
    /// il est la projection : une carte de fil est muette PAR CONSTRUCTION.
    ///
    /// Sans lui, le verrou n'existait qu'au niveau du PROP, et n'atteignait le
    /// canvas qu'à la passe de rendu suivante. Entre les deux, la notification
    /// diffusée `.storyComposerUnmuteCanvas` — postée `object: nil`, donc reçue
    /// par TOUS les canvas montés — relevait le muet des cartes de fil restées
    /// vivantes derrière un `fullScreenCover`. Le verrou était juste, testé, et
    /// contournable.
    public let locksMute: Bool

    public init(preferredLanguages: [String] = [],
                mute: Bool = false,
                onCompletion: (@Sendable () -> Void)? = nil,
                postMediaURLResolver: (@Sendable (String) -> URL?)? = nil,
                imageCache: ImageCacheReader? = nil,
                localAudioURLResolver: (@Sendable (String) -> URL?)? = nil,
                playerProvider: (any StoryCarrierPlayerProviding)? = nil,
                locksMute: Bool = false) {
        self.preferredLanguages = preferredLanguages
        self.mute = mute
        self.onCompletion = onCompletion
        self.postMediaURLResolver = postMediaURLResolver
        self.imageCache = imageCache
        self.localAudioURLResolver = localAudioURLResolver
        self.locksMute = locksMute
        self.playerProvider = playerProvider
    }

    public static let empty = StoryReaderContext()

    /// Copie avec une nouvelle chaine de langues, tous les autres réglages
    /// conservés. L'exploration de langue en cours de lecture ne dispose que de
    /// la chaine : reconstruire un contexte complet lui imposerait de recréer
    /// les resolvers média posés à la construction du canvas.
    public func withPreferredLanguages(_ languages: [String]) -> StoryReaderContext {
        StoryReaderContext(preferredLanguages: languages,
                           mute: mute,
                           onCompletion: onCompletion,
                           postMediaURLResolver: postMediaURLResolver,
                           imageCache: imageCache,
                           localAudioURLResolver: localAudioURLResolver,
                           playerProvider: playerProvider)
    }
}

/// Lightweight protocol decoupling the reader from the concrete cache type.
/// Conformed by `CacheCoordinator.shared.images` (DiskCacheStore).
public protocol ImageCacheReader: Sendable {
    func cachedImage(for key: String) async -> UIImage?
}

/// Fournisseur du player d'un média, interrogé par les couches du canvas AVANT
/// d'en ouvrir un privé (O16).
///
/// Le chemin de LECTURE ne fabrique pas le temps de son média porteur : un
/// player privé perdrait la continuité de lecture, la télémétrie `WatchSample`
/// et l'arbitrage `PlaybackCoordinator`. `nil` en retour = personne ne porte ce
/// média, la couche ouvre alors le sien.
public protocol StoryCarrierPlayerProviding: Sendable {
    @MainActor func player(for mediaIdentity: String) -> AVPlayer?
}
