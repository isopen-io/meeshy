import Foundation

/// **Quand tente-t-on le chemin animé, et que rend-il ?** (#4925)
///
/// ## Le maillon qui manquait
///
/// Le lot d'origine a livré le décodeur (`AnimatedImageDecoder`) et la vue qui
/// joue (`AnimatedImageView`), puis a câblé la SCÈNE, qui n'est pas une vue
/// SwiftUI mais un `CALayer` — `StoryStickerLayer.stampAnimated`. Les surfaces
/// SwiftUI, elles, n'ont jamais reçu leur moitié : au 2026-09-03,
/// `AnimatedImageView` n'était montée **nulle part**. Un sticker de message et
/// une image de commentaire arrivaient figés avec un décodeur parfait dans le
/// même paquet.
///
/// > Une vue qui n'a aucun consommateur ne rougit nulle part : ses propres
/// > témoins passent, le build est vert, et la feature n'existe pas.
///
/// ## Pourquoi une RÈGLE et pas trois `if` dans la vue
///
/// Les trois raisons de ne rien tenter — l'hôte a dit non, le mouvement est
/// réduit, il n'y a pas d'URL — décident d'un COÛT, pas d'un affichage : chacune
/// épargne une lecture d'octets et un décodage de N images. Écrites dans le
/// corps d'une vue, elles seraient réévaluées à chaque rendu et se
/// dédoubleraient au premier second appelant. Écrites ici, elles se mesurent
/// sans monter quoi que ce soit.
nonisolated public enum AnimatedImageResolution {

    /// `false` ⇒ ne pas lire un seul octet.
    ///
    /// Le mouvement réduit est traité ICI plutôt que dans `AnimatedImageView`
    /// (qui sait aussi figer) parce que les deux sites ne coûtent pas la même
    /// chose : figer dans la vue décode d'abord les trente images pour n'en
    /// montrer qu'une. Le repli fixe de l'appelant montre déjà la PREMIÈRE
    /// image — ce qu'affiche un GIF non joué, donc la vignette choisie par
    /// l'auteur. La préférence est honorée sans rien payer.
    public static func shouldAttempt(
        urlString: String?,
        animates: Bool,
        reduceMotion: Bool
    ) -> Bool {
        guard animates, !reduceMotion else { return false }
        guard let urlString, !urlString.isEmpty else { return false }
        return true
    }

    /// Les octets d'abord, l'image ensuite — `nil` si rien n'anime.
    ///
    /// `nil` n'est PAS un échec : c'est le signal que l'appelant garde son
    /// chemin actuel, avec son thumbHash, son cache progressif et son
    /// placeholder. Aucune image fixe ne change de rendu à cause de ce lot.
    ///
    /// Le `loader` est une closure et non un protocole : un second protocole de
    /// chargement d'octets serait la jumelle de `StoryMediaImageLoading`, avec
    /// sa propre politique de cache et ses propres ratés. La production passe
    /// la MÊME pile que l'image (L1 NSCache, L2 disque, réseau), donc jamais un
    /// second téléchargement.
    public static func resolve(
        urlString: String?,
        animates: Bool,
        reduceMotion: Bool,
        maxPixelSize: Int,
        loader: (String) async -> Data?
    ) async -> AnimatedImageDecoder.Decoded? {
        guard shouldAttempt(urlString: urlString, animates: animates, reduceMotion: reduceMotion),
              let urlString else { return nil }
        guard let data = await loader(urlString) else { return nil }
        return AnimatedImageDecoder.decode(data, maxPixelSize: maxPixelSize)
    }
}
