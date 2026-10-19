import Foundation
import UIKit
import MeeshySDK

/// Async image loader used by `StoryMediaLayer.configureImage`. Default
/// production conformer is `DiskCacheImageLoader`, which forwards into
/// `CacheCoordinator.shared.images` (`DiskCacheStore`) and inherits its
/// L1 NSCache + L2 disk + network fetch + downsampling pipeline.
///
/// The protocol exists so tests can inject a deterministic in-process stub
/// and exercise the cancel chain without hitting the real disk cache or
/// `URLSession`. Marked `nonisolated` on the requirement so witnesses don't
/// pick up MeeshyUI's `defaultIsolation(MainActor)` — actor-isolated
/// witnesses (e.g. `DiskCacheStore.image(for:)`) match cleanly.
public protocol StoryMediaImageLoading: Sendable {
    nonisolated func image(for urlString: String) async -> UIImage?

    /// **Les OCTETS, et pas seulement l'image** (#4925).
    ///
    /// `image(for:)` rend une `UIImage`, c'est-à-dire UNE image : pour un GIF ou
    /// un APNG, l'animation est déjà perdue à ce niveau, avant qu'aucune vue ne
    /// puisse la demander. C'est ce maillon — et lui seul — qui faisait qu'un
    /// sticker animé arrivait figé jusqu'au canvas, quel que soit le soin mis
    /// en aval.
    ///
    /// Le repli par défaut rend `nil`, et il est une DÉCLARATION, pas une
    /// commodité : **un chargeur qui ne sert pas d'octets ne peut pas animer**,
    /// et le dire explicitement vaut mieux qu'obliger chaque bouchon de test à
    /// implémenter une méthode dont il n'a que faire. Le conformeur de
    /// PRODUCTION, lui, doit la servir — `StoryStickerAnimatedBytesGuardTests`
    /// le vérifie, sans quoi le repli s'appliquerait partout en silence et la
    /// feature n'existerait nulle part.
    nonisolated func data(for urlString: String) async -> Data?
}

public extension StoryMediaImageLoading {
    nonisolated func data(for urlString: String) async -> Data? { nil }
}

/// Production conformer — thin shim around `CacheCoordinator.shared.images`.
/// We don't conform `DiskCacheStore` directly because doing so from the UI
/// module crosses the MainActor / actor isolation boundary in a way that
/// confuses Swift 6.2's conformance checker; a value-type shim sidesteps
/// the issue and stays trivially `Sendable`.
public struct DiskCacheImageLoader: StoryMediaImageLoading {
    public nonisolated init() {}
    public nonisolated func image(for urlString: String) async -> UIImage? {
        await CacheCoordinator.shared.images.image(for: urlString)
    }

    /// Les octets bruts, servis par la MÊME pile que `image(for:)` — L1 NSCache,
    /// L2 disque, réseau. Aucun second chemin de téléchargement : ce serait une
    /// jumelle du cache, avec sa propre politique et ses propres ratés.
    public nonisolated func data(for urlString: String) async -> Data? {
        try? await CacheCoordinator.shared.images.data(for: urlString)
    }
}
