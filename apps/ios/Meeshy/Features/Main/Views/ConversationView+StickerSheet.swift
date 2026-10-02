import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La destination ENVOYER de la feuille unique (#9189, #9190)

extension ConversationView {

    /// Chaque choix de la feuille devient un message — par le chemin d'envoi
    /// de sa famille (`ConversationView+Sticker`).
    func sendStickerChoice(_ choice: StickerSheetChoice) {
        switch choice {
        case .emoji(let emoji): sendEmojiSticker(emoji)
        case .library(let item): sendLibrarySticker(item)
        case .template(let gabarit, let slots): sendTemplateSticker(gabarit, slots: slots)
        case .locationTemplate(let lieu, let gabarit): sendLocationTemplateSticker(place: lieu, template: gabarit)
        case .mee(let mee): sendMeeSticker(mee)
        case .instant(let instant, let slots): sendMeeInstant(instant, slots: slots)
        case .packItem(let pack, let item): sendPackSticker(pack, item: item)
        }
    }

    /// **Un sticker de pack part comme un Mee** (#9190) : son image de repli —
    /// celle que le web joint aussi — et le descripteur `pack.<slug>.<clé>`,
    /// que le web redessine. Les octets viennent du cache des images ; une
    /// image introuvable ne part pas, et le dit.
    func sendPackSticker(_ pack: StickerPack, item: StickerPackItem) {
        Task {
            guard let loaded = await StickerPackItemImages.load(item) else {
                FeedbackToastManager.shared.showError("Échec de l'envoi de la pièce jointe")
                return
            }
            sendStickerImage(loaded.image, sticker: pack.messageSticker(for: item))
        }
    }
}
