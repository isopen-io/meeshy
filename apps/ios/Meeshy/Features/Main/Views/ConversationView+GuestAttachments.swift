import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Pièces jointes d'un INVITÉ restreint (#10006)
//
// Les termes du lien (#10001) disent ce qu'un invité peut joindre. Un compte,
// ou un invité dont le lien ne restreint rien, garde le composeur habituel ;
// un invité restreint (World Wide : texte .txt et audio) ne voit QUE les portes
// dont la famille est ouverte, et la porte « Fichier » ouvre la feuille qui
// dit ce qui passe et pourquoi le reste ne passe pas. Le serveur reste juge
// du contenu réel ; son refus éventuel est expliqué à l'envoi
// (`GuestAttachmentRefusal`, `ConversationView+AttachmentHandlers`).
extension ConversationView {

    /// Ce que CET écrivain peut joindre — sans restriction pour un compte ; en
    /// E2EE, les pièces chiffrées sur l'appareil, sans lieu, fiche ni sticker (#10789).
    var guestAttachmentAllowance: GuestAttachmentAllowance {
        (anonymousSession?.attachmentAllowance ?? .unrestricted).sealedEndToEnd(viewModel.endToEndSealsPieces)
    }

    /// Une porte du composeur n'existe que si la famille qu'elle produit est
    /// ouverte : `nil` retire la tuile, jamais une porte inerte.
    func guestDoor(_ isOffered: Bool, _ open: @escaping () -> Void) -> (() -> Void)? {
        isOffered ? open : nil
    }

    // Les portes VISUELLES (photothèque, bande des médias récents, stickers)
    // produisent une image : nommées et typées ici, pour que l'appel du
    // composeur reste une liste d'identifiants que le compilateur résout vite.

    var recentMediaPickDoor: ((RecentMediaPick) -> Void)? {
        guard guestAttachmentAllowance.offersVisualMedia else { return nil }
        return { pick in ingestRecentMediaPick(pick) }
    }

    var recentMediaEditDoor: ((RecentMediaPick) -> Void)? {
        guard guestAttachmentAllowance.offersVisualMedia else { return nil }
        return { pick in editRecentMediaPick(pick) }
    }

    var recentLibraryAssetDoor: ((RecentMediaAsset) -> Void)? {
        guard guestAttachmentAllowance.offersVisualMedia else { return nil }
        return { asset in ingestRecentLibraryAsset(asset) }
    }

    var photoLibraryPreselectingDoor: (([String]) -> Void)? {
        guard guestAttachmentAllowance.offersVisualMedia else { return nil }
        return { ids in openPhotoLibraryPreselecting(ids) }
    }

    /// Cadre à mots (#5326) : il part comme une image de sticker.
    var textStickerDoor: ((StickerTemplate, String) -> Void)? {
        guard guestAttachmentAllowance.offersStickers else { return nil }
        return { gabarit, mots in
            sendTemplateSticker(gabarit, slots: [StickerSlotFiller.textSlot: mots])
        }
    }

    /// La porte « Fichier » : le sélecteur libre, ou la feuille de l'invité.
    func openFileDoor() {
        guard guestAttachmentAllowance.isRestricted else {
            composerState.showFilePicker = true
            return
        }
        composerState.showGuestAttachmentSheet = true
    }

    /// Dépôt et collage suivent la MÊME loi que la feuille : un fichier hors
    /// des familles ouvertes ne rejoint pas le composeur, et le refus se dit.
    func ingestRespectingGuestAllowance(_ items: [ComposerIngest]) {
        let screened = GuestAttachmentScreening.screenIngest(
            items,
            allowance: guestAttachmentAllowance,
            byteCount: { url in Int64(getFileSize(url)) }
        )
        for item in items where !screened.kept.contains(item) {
            if case .file(let url, _, _) = item {
                try? FileManager.default.removeItem(at: url)
            }
        }
        if let refusal = screened.refusals.first {
            FeedbackToastManager.shared.showError(
                viewModel.endToEndPieceRefusal?.userMessage ?? GuestAttachmentCopy.refusal(
                    fileName: refusal.fileName,
                    reason: refusal.reason,
                    kinds: guestAttachmentAllowance.kinds ?? []
                )
            )
        }
        guard !screened.kept.isEmpty else { return }
        handleComposerIngest(screened.kept)
    }
}

/// La feuille de l'invité restreint : un maillon NOMINAL de la chaîne du
/// composer (`ConversationComposerLayers`).
struct ConversationComposerGuestSheet: ViewModifier {
    @Binding var composerState: ConversationComposerState
    let conversationTitle: String
    let allowance: GuestAttachmentAllowance
    let onAccepted: ([URL]) -> Void

    func body(content: Content) -> some View {
        content.sheet(isPresented: $composerState.showGuestAttachmentSheet) {
            GuestAttachmentSheet(
                conversationTitle: conversationTitle,
                allowance: allowance,
                onAccepted: onAccepted
            )
        }
    }
}
