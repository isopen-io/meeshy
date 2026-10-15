import Foundation
@preconcurrency import Lottie
import MeeshySDK

// MARK: - D'où vient une couche Lottie (#10638)

/// **Le film d'une couche**, lu depuis un fichier de pack — le moteur de lecture est celui
/// des stickers (`LottieFilmSource`, `LottieFilm`) : aucun second moteur.
///
/// Un fichier de pack s'adresse par son contenu (`<sha16>.json`) : le magasin le
/// télécharge UNE fois, vérifie son empreinte et le garde ; une altération ne se lit pas.
/// Fail-soft : un fichier illisible rend `nil`, et la couche s'efface — le dessin
/// vectoriel du design reste.
nonisolated public enum LottieLayerSource {

    /// Le film d'un `.json` Lottie en mémoire (`nil` si ce n'en est pas un).
    public static func film(data: Data) -> LottieFilmSource? {
        (try? LottieAnimation.from(data: data)).map { LottieFilmSource($0) }
    }

    /// Le film d'une référence de pack, lu du magasin vérifié.
    @concurrent
    public static func film(for ref: PackAssetRef, store: ContentAddressedStore = .shared) async -> LottieFilmSource? {
        guard let data = try? await store.data(for: ref.file) else { return nil }
        return film(data: data)
    }
}
