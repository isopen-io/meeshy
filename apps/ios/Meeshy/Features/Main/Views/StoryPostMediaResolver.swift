import Foundation
import MeeshySDK
import MeeshyUI

/// Résout un `postMediaId` en URL streamable sur toute la fenêtre de préchargement.
///
/// Fonction pure des médias de la fenêtre : le mixer audio du lecteur en a besoin
/// pour faire correspondre `StoryAudioPlayerObject.postMediaId` à une URL —
/// sans lui, `reconfigureAudioForPlayback` saute chaque clip en silence (loggé
/// via `Logger.storyAudio`). Les images contournent le résolveur via
/// `CachedAsyncImage`, mais l'audio n'a pas de chemin de préchargement
/// équivalent : il FAUT en fournir un ici.
enum StoryPostMediaResolver {

    static func resolver(covering items: [StoryItem]) -> @Sendable (String) -> URL? {
        let mediaIndex: [String: URL] = Dictionary(
            items
                .flatMap { $0.media }
                .compactMap { m -> (String, URL)? in
                    // #7056 — `MeeshyConfig.resolveMediaURL`, jamais `URL(string:)`
                    // nu : une CLÉ DE STOCKAGE (`2026/02/<id>/photo.jpg`, la
                    // forme que la base porte désormais) ne rend PAS `nil` ici —
                    // elle rend une URL RELATIVE, sans schéma ni hôte. Le
                    // `guard` passait, le chargement échouait, et aucune
                    // branche de repli n'était empruntée : l'image disparaissait
                    // en silence. Un `nil` aurait au moins été visible.
                    guard let raw = m.url, let url = MeeshyConfig.resolveMediaURL(raw) else { return nil }
                    return (m.id, url)
                },
            uniquingKeysWith: { first, _ in first }
        )
        return { postMediaId in
            mediaIndex[postMediaId]
        }
    }
}
