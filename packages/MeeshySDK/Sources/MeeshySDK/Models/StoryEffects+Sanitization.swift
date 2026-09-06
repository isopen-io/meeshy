import Foundation
import os

extension StoryEffects {

    /// Renvoie une copie de `self` prête à être envoyée au serveur — toute
    /// référence à un asset local (`file://`) sur un `StoryMediaObject` est
    /// supprimée. Le `postMediaId` (lien CDN via `data.media[]`) reste seul
    /// vecteur autorisé pour résoudre l'asset côté lecteur.
    ///
    /// **Le contract attendu** : le call-site (ViewModel) doit avoir flippé
    /// `mediaURL` du `file://` local de l'auteur vers l'URL CDN
    /// (`TusUploadResult.fileUrl`) après l'upload TUS. Si cette fonction
    /// trouve encore un `file://` ici, c'est un bug d'amont — on logge un
    /// warning + on nullifie pour ne pas polluer la base.
    ///
    /// Origine : le composer iOS écrit un `file://` local sur
    /// `StoryMediaObject.mediaURL` pendant l'édition (cf.
    /// `StoryComposerViewModel.setMediaURL`) pour que le canvas preview
    /// puisse charger l'asset depuis le sandbox de l'auteur. Sans flip
    /// après upload, ce path local est persisté en base et resservi tel
    /// quel aux lecteurs — qui ne peuvent jamais le résoudre depuis leur
    /// propre sandbox. Symptôme : canvas vide à l'ouverture de la story
    /// chez les amis (incident 2026-05-22, story
    /// `6a10128bd884010643facd33`).
    ///
    /// Le contract est posé dans `StoryMediaLayer.swift:132-134` :
    /// > "a published story never stamps `mediaURL` onto a per-object
    /// > `StoryMediaObject` (the URL lives on `StoryItem.media`, reachable
    /// > only via the resolver)"
    ///
    /// Les URL réseau (`http(s)://`) et fixtures (`fixture://`) sont
    /// préservées : elles sont sémantiquement portables d'un device à
    /// l'autre et utiles aux tests / mode preview.
    public func sanitizedForServerPublish() -> StoryEffects {
        var copy = self
        if let medias = copy.mediaObjects {
            copy.mediaObjects = medias.map { media in
                guard let raw = media.mediaURL, Self.isLocalFileURL(raw) else { return media }
                Self.logger.error(
                    "Sanitizer caught local file:// mediaURL on StoryMediaObject id=\(media.id, privacy: .public) postMediaId=\(media.postMediaId, privacy: .public) — call-site forgot to flip to CDN URL after upload. Nullifying."
                )
                var stripped = media
                stripped.mediaURL = nil
                return stripped
            }
        }
        // **L'AUDIO passe par le même filet** (2026-09-06).
        //
        // Le sanitizer gardait une famille et laissait l'autre : un son dont la
        // pré-montée n'avait pas abouti partait avec son `file:///Users/…`,
        // c'est-à-dire un chemin de disque qu'aucun lecteur ne peut résoudre —
        // et qui porte au passage le nom de compte de l'auteur.
        //
        // > **Une garde se mesure sur tout ce que la charge TRANSPORTE**, pas
        // > sur la famille pour laquelle elle a été écrite. C'est la leçon 275
        // > du dépôt, ici dans sa forme la plus littérale : le champ voisin
        // > porte le même nom, le même type et le même risque, et n'était pas
        // > gardé.
        if let audios = copy.audioPlayerObjects {
            copy.audioPlayerObjects = audios.map { audio in
                guard let raw = audio.mediaURL, Self.isLocalFileURL(raw) else { return audio }
                Self.logger.error(
                    "Sanitizer caught local file:// mediaURL on StoryAudioPlayerObject id=\(audio.id, privacy: .public) postMediaId=\(audio.postMediaId, privacy: .public) — call-site forgot to flip to CDN URL after upload. Nullifying."
                )
                var stripped = audio
                stripped.mediaURL = nil
                return stripped
            }
        }
        return copy
    }

    /// Détection lowercase pour défense profonde : URL parsing iOS est
    /// case-insensitive sur le scheme, donc un payload mal formé pourrait
    /// arriver avec `FILE://` ou `File://`.
    private static func isLocalFileURL(_ raw: String) -> Bool {
        raw.lowercased().hasPrefix("file:")
    }

    private static let logger = Logger(subsystem: "com.meeshy.sdk", category: "story-publish-sanitizer")
}
