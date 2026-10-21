import Foundation
import MeeshySDK

/// **Le sticker REÇU se range dans « Mes stickers »** (#10630) — la loi PURE de
/// « Ajouter à mes stickers » et de « Dans mes stickers ».
///
/// Un sticker voyage avec un PNG en pièce jointe image (rétrocompatibilité) :
/// c'est cette image que l'ajout relit et dépose en bibliothèque, par le MÊME
/// chemin que « Enregistrer ce sticker » d'une story (`StickerLibraryReceive`).
/// L'identifiant de bibliothèque en est dérivé (`received-<id de la pièce>`) :
/// stable, donc le même sticker reçu deux fois vise la même entrée et le second
/// geste s'arrête avant le téléchargement.
///
/// Trois lois tiennent ici et nulle part ailleurs, pour que le menu, la fiche
/// et la galerie ne les réécrivent pas :
/// - **qui peut s'ajouter** (`savable`) : un sticker AVEC une image jointe ;
/// - **qui est déjà rangé** (`isInLibrary`) : l'entrée dérivée existe, ou c'est
///   MON sticker de bibliothèque renvoyé (il porte son `stickerId`) ;
/// - **qui n'est PAS un média** (`isGalleryExcluded`) : un sticker n'est ni une
///   photo à feuilleter ni une pièce à enregistrer dans Photos.
nonisolated enum ReceivedSticker {

    /// Ce qu'un geste d'ajout copiera — `nil` ⇒ l'ajout n'est PAS offert (loi 4 :
    /// un sticker emoji ou gabarit sans image n'a rien à déposer).
    static func savable(in message: MeeshyMessage) -> StoryStickerLibrary.Savable? {
        guard message.sticker != nil,
              let picture = message.attachments.first(where: { $0.type == .image })
        else { return nil }
        return savable(attachmentId: picture.id, fileUrl: picture.fileUrl)
    }

    static func savable(attachmentId: String, fileUrl: String) -> StoryStickerLibrary.Savable? {
        guard !fileUrl.isEmpty,
              let id = StoryStickerLibrary.libraryID(forPostMediaID: attachmentId)
        else { return nil }
        return StoryStickerLibrary.Savable(id: id, mediaURLString: fileUrl)
    }

    /// Mon sticker de bibliothèque renvoyé porte son `stickerId` : il y est déjà.
    static func isInLibrary(_ savable: StoryStickerLibrary.Savable,
                            isMine: Bool,
                            libraryStickerId: String?,
                            known: Set<String>) -> Bool {
        known.contains(savable.id) || (isMine && !(libraryStickerId ?? "").isEmpty)
    }

    /// « Ajouter à mes stickers » est-il offert pour ce message ? Il l'est s'il y
    /// a une image à déposer ET qu'elle n'est pas déjà rangée (loi 4).
    /// Un sticker qu'on POSSÈDE déjà — emoji, gabarit du catalogue, Mee — ne
    /// se dépose pas dans « Mes stickers » : il s'y figerait en doublon. Il se
    /// met en favori (#10688).
    static func offersAdd(for message: MeeshyMessage, known: Set<String>) -> Bool {
        guard MessageStickerFavorite.entry(for: message.sticker) == nil,
              let savable = savable(in: message) else { return false }
        return !isInLibrary(savable, isMine: message.isMe,
                            libraryStickerId: message.sticker?.stickerId, known: known)
    }

    /// Le sticker n'entre dans AUCUNE galerie de médias : son image jointe ne sert
    /// qu'aux anciens clients.
    static func isGalleryExcluded(_ message: MeeshyMessage) -> Bool {
        message.sticker != nil
    }

    /// Fenêtre où un second toucher fait un DOUBLE toucher (le menu du message)
    /// plutôt qu'une ouverture de fiche.
    static let doubleTapWindow: TimeInterval = 0.28
}

/// Les identifiants déjà en bibliothèque, tenus en mémoire pour que le menu et la
/// fiche répondent SANS attendre le disque. Rafraîchi à l'apparition d'un sticker
/// (au plus une fois par fenêtre) et après chaque ajout.
@MainActor
final class ReceivedStickerLedger {
    // iOS 26.1 : sous SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor, la `deinit`
    // synthétisée est ISOLÉE et double-libère (abrt).
    // Garde : `MainActorDeinitSourceGuardTests`.
    nonisolated deinit {}

    static let shared = ReceivedStickerLedger()

    private(set) var ids: Set<String> = []
    private var refreshedAt: Date?
    private static let staleAfter: TimeInterval = 30

    func refresh(force: Bool = false, now: Date = Date()) async {
        if !force, let last = refreshedAt, now.timeIntervalSince(last) < Self.staleAfter { return }
        refreshedAt = now
        ids = Set(await StickerLibraryPaste.libraryIDs())
    }

    /// Ajoute le sticker de ce message à la bibliothèque et le DIT (toast).
    func add(_ savable: StoryStickerLibrary.Savable) async {
        await StickerLibraryReceive.saveAndAnnounce([savable])
        await refresh(force: true)
    }

    /// Le geste du menu : sans image à déposer, rien ne part (le menu ne l'offre pas).
    func addSticker(of message: MeeshyMessage) {
        guard let savable = ReceivedSticker.savable(in: message) else { return }
        HapticFeedback.light()
        Task { @MainActor in await self.add(savable) }
    }
}
