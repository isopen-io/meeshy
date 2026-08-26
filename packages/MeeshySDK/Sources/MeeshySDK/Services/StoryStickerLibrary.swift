import Foundation

/// S5 — ce qu'un contenu REÇU offre à « Mes stickers ».
///
/// L'image d'un sticker est INTÉGRÉE à l'entité publiée (`StorySticker
/// .postMediaId`) : ses octets se lisent donc sur le `PostMedia` du post
/// lui-même, par le même appariement id → média que le reste du rendu. Aucune
/// URL tierce n'entre nulle part, ni à l'écriture ni à la copie.
///
/// Décision PURE, comme `StoryStickerUpload` : l'app garde le téléchargement,
/// l'écriture disque et le retour utilisateur.
public enum StoryStickerLibrary {

    /// Un sticker reçu, prêt à entrer dans la bibliothèque.
    public struct Savable: Equatable, Sendable, Identifiable {
        /// Identifiant de bibliothèque. Dérivé du `postMediaId`, donc STABLE
        /// d'un enregistrement à l'autre : c'est ce qui rend reconnaissable un
        /// sticker déjà gardé.
        public let id: String
        /// URL du `PostMedia` porté par le post.
        public let mediaURLString: String

        public init(id: String, mediaURLString: String) {
            self.id = id
            self.mediaURLString = mediaURLString
        }
    }

    /// Espace de noms des ids venus d'un contenu reçu. Le collage pose un
    /// `UUID` par geste (`StickerLibraryPaste`) : sans préfixe, les deux
    /// dérivations partageraient un espace d'ids sans jamais partager de
    /// règle.
    public static let receivedIDPrefix = "received-"

    /// `nil` quand l'identifiant ne peut pas servir de nom de fichier dans le
    /// dossier de la bibliothèque. Il vient du serveur, et
    /// `StickerLibraryStore` le concatène à son dossier racine : un séparateur
    /// de chemin y ferait écrire ailleurs.
    public static func libraryID(forPostMediaID postMediaID: String) -> String? {
        guard !postMediaID.isEmpty else { return nil }
        let fileSafe = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
        guard postMediaID.unicodeScalars.allSatisfy(fileSafe.contains) else { return nil }
        return receivedIDPrefix + postMediaID
    }

    /// Les stickers du contenu qu'on peut copier dans la bibliothèque, dans
    /// leur ordre de composition. Vide = le geste est ABSENT (loi 4).
    ///
    /// Deux stickers posés à partir de la même image partagent leur
    /// `postMediaId` et ne rendent qu'une entrée : la bibliothèque garde des
    /// images, pas des occurrences.
    public static func savable(in item: StoryItem) -> [Savable] {
        guard let stickers = item.storyEffects?.stickerObjects else { return [] }
        return stickers.reduce(into: [Savable]()) { savable, sticker in
            guard sticker.kind == .image,
                  let id = libraryID(forPostMediaID: sticker.postMediaId),
                  !savable.contains(where: { $0.id == id }),
                  let url = item.media.first(where: { $0.id == sticker.postMediaId })?.url,
                  !url.isEmpty
            else { return }
            savable.append(Savable(id: id, mediaURLString: url))
        }
    }
}
