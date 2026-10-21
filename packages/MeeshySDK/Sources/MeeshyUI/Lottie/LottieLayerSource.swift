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

    /// Le film d'une référence de pack, lu du magasin vérifié — puis gardé en mémoire.
    /// Des demandes simultanées du même fichier (trente rangées au même contour, #10815)
    /// partagent UNE lecture et UN décodage : un seul modèle, jamais trente.
    @concurrent
    public static func film(for ref: PackAssetRef, store: ContentAddressedStore = .shared) async -> LottieFilmSource? {
        if let cached = cachedFilm(for: ref) { return cached }
        return await reads.film(for: ref, store: store)
    }

    static func load(_ ref: PackAssetRef, store: ContentAddressedStore) async -> LottieFilmSource? {
        guard let data = try? await store.data(for: ref.file), let film = film(data: data) else { return nil }
        memory.setObject(film, forKey: ref.sha256 as NSString)
        return film
    }

    private static let reads = PendingFilmReads()

    /// Le film déjà lu d'une référence, sans attendre : une couche rouverte (un fil où l'on
    /// revient) se monte dès sa première image au lieu d'apparaître après coup. Clé = l'empreinte
    /// entière, donc seuls des octets vérifiés y entrent ; un seul modèle par fichier, partagé.
    public static func cachedFilm(for ref: PackAssetRef) -> LottieFilmSource? {
        memory.object(forKey: ref.sha256 as NSString)
    }

    /// `NSCache` est sûr d'un fil à l'autre ; borné, il se vide de lui-même sous la pression mémoire.
    nonisolated(unsafe) private static let memory: NSCache<NSString, LottieFilmSource> = {
        let cache = NSCache<NSString, LottieFilmSource>()
        cache.countLimit = 16
        return cache
    }()
}

/// Les lectures de film en cours, une par empreinte : qui arrive pendant une lecture
/// l'attend au lieu d'en lancer une seconde.
private actor PendingFilmReads {
    private var running: [String: Task<LottieFilmSource?, Never>] = [:]

    func film(for ref: PackAssetRef, store: ContentAddressedStore) async -> LottieFilmSource? {
        if let cached = LottieLayerSource.cachedFilm(for: ref) { return cached }
        if let pending = running[ref.sha256] { return await pending.value }
        let task = Task.detached(priority: .userInitiated) { await LottieLayerSource.load(ref, store: store) }
        running[ref.sha256] = task
        let film = await task.value
        running[ref.sha256] = nil
        return film
    }
}
