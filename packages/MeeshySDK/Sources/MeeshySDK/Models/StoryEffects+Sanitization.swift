import Foundation

extension StoryEffects {

    /// Renvoie une copie de `self` prête à être envoyée au serveur — toute
    /// référence à un asset local (`file://`) sur un `StoryMediaObject` est
    /// supprimée. Le `postMediaId` (lien CDN via `data.media[]`) reste seul
    /// vecteur autorisé pour résoudre l'asset côté lecteur.
    ///
    /// Le composer iOS écrit un `file://` local sur `StoryMediaObject.mediaURL`
    /// pendant l'édition (cf. `StoryComposerViewModel.setMediaURL`) pour que
    /// le canvas preview puisse charger l'asset depuis le sandbox de l'auteur.
    /// Sans nettoyage avant le `POST /posts`, ce path local est persisté en
    /// base et resservi tel quel aux lecteurs — qui ne peuvent jamais le
    /// résoudre depuis leur propre sandbox. Symptôme : canvas vide à
    /// l'ouverture de la story chez les amis (incident 2026-05-22, story
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
                var stripped = media
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
}
