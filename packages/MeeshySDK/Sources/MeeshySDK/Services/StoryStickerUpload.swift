import Foundation

/// Ce qu'un sticker IMAGE doit à la publication, entre l'espace d'ids du
/// COMPOSER et celui du SERVEUR.
///
/// Un sticker importé n'est pas une référence externe : son image est
/// INTÉGRÉE à l'entité publiée, au même titre que tout autre média du post
/// (`StorySticker.postMediaId`). Elle part donc par le chemin commun — TUS →
/// `PostMedia` → `postMediaId` — et le sticker reçoit son identifiant serveur
/// à ce moment-là, le seul où il existe. Même problème et même forme que
/// `StoryMediaAltMapping.serverKeyed`.
public enum StoryStickerUpload {

    /// Les ids des stickers dont l'image reste à téléverser, dans l'ordre des
    /// stickers de la slide — deux publications des mêmes entrées produisent
    /// la même séquence.
    ///
    /// Un `postMediaId` déjà rempli vient d'un upload précédent (édition d'une
    /// story publiée) : le renvoyer créerait un second `PostMedia` et
    /// laisserait le premier orphelin. Un sticker sans bitmap sous son id est
    /// un sticker emoji — il n'a rien à envoyer.
    public static func pendingUploadIds(
        stickers: [StorySticker],
        availableBitmapIds: Set<String>
    ) -> [String] {
        stickers
            .filter { $0.postMediaId.isEmpty && availableBitmapIds.contains($0.id) }
            .map(\.id)
    }

    /// Reporte sur les stickers les `postMediaId` que l'upload vient
    /// d'attribuer, keyés par id de sticker.
    ///
    /// Un sticker absent de `uploaded` est rendu INCHANGÉ, jamais retiré :
    /// l'envoi de son image a pu échouer, et il reste alors affichable par son
    /// emoji de repli (`StorySticker.wireEmoji`). Le retirer coûterait à
    /// l'auteur une composition là où l'échec ne lui coûte qu'un glyphe à la
    /// place de l'image. Un identifiant vide est traité comme une absence : le
    /// sticker passerait sinon pour téléversé tout en ne pointant sur rien.
    public static func applying(
        uploads uploaded: [String: String],
        to stickers: [StorySticker]
    ) -> [StorySticker] {
        stickers.map { sticker in
            guard let postMediaId = uploaded[sticker.id], !postMediaId.isEmpty else { return sticker }
            var assigned = sticker
            assigned.postMediaId = postMediaId
            return assigned
        }
    }

    /// Les `PostMedia` que la composition référence ENCORE par ses stickers.
    ///
    /// Le PUT d'édition supprime tout original absent de l'ensemble conservé :
    /// sans cette liste, éditer une story effacerait côté serveur l'image de
    /// chaque sticker qu'elle continue pourtant d'afficher.
    public static func attachedPostMediaIds(stickers: [StorySticker]) -> [String] {
        stickers.map(\.postMediaId).filter { !$0.isEmpty }
    }
}
