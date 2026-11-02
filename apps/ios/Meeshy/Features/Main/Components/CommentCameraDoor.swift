import SwiftUI
import MeeshySDK
import MeeshyUI

// **LA CAMÉRA DES COMMENTAIRES** (#9736, décision porteur 2026-10-09 :
// « il faut activer à droite la caméra pour les commentaires »).
//
// La porte est celle de la barre du message — même verre, même glyphe, même
// place à droite de « Photos » (`UniversalComposerBar+Toolbar`,
// `ComposerGlassDoors`). Elle ouvre le même viseur (`ComposerViewfinder`, qui
// obéit à `CaptureSavePolicy`), et la prise retombe dans la même zone
// d'aperçu, par la même entrée que toute autre pièce
// (`CommentAttachmentIntake`) — donc sous le même plafond.
//
// Elle est CONFIÉE à la barre par l'environnement, comme le ⌄ du repli
// (`composerFoldControl`) : l'hôte ne porte ni état de présentation ni
// couverture, il pose un modificateur.

/// La porte caméra qu'un hôte confie à la barre sans passer par son
/// initialiseur. `UniversalComposerBar.onCamera`, quand l'hôte le fournit,
/// l'emporte.
struct ComposerCameraDoor {
    let open: () -> Void
}

private struct ComposerCameraDoorKey: EnvironmentKey {
    static let defaultValue: ComposerCameraDoor? = nil
}

extension EnvironmentValues {
    var composerCameraDoor: ComposerCameraDoor? {
        get { self[ComposerCameraDoorKey.self] }
        set { self[ComposerCameraDoorKey.self] = newValue }
    }
}

extension View {
    /// Caméra et sticker du composeur de commentaire ; `onOpen` prépare l'hôte à être recouvert.
    func commentMediaDoors(attachments: Binding<[ComposerAttachment]>, limit: Int = MAX_POST_MEDIA,
                           accentColor: String = MeeshyColors.brandPrimaryHex, onOpen: @escaping () -> Void = {}) -> some View {
        modifier(CommentCameraModifier(attachments: attachments, limit: limit, onOpen: onOpen))
            .modifier(CommentStickerModifier(attachments: attachments, limit: limit, accentColor: accentColor, onOpen: onOpen))
    }
}

private struct CommentCameraModifier: ViewModifier {
    @Binding var attachments: [ComposerAttachment]
    let limit: Int
    let onOpen: () -> Void

    @State private var isPresented = false

    func body(content: Content) -> some View {
        content
            .environment(\.composerCameraDoor, ComposerCameraDoor(open: {
                onOpen()
                isPresented = true
            }))
            .fullScreenCover(isPresented: $isPresented) {
                ComposerViewfinder { capture in
                    CommentAttachmentIntake.stage(capture: capture, into: $attachments, limit: limit)
                }
            }
    }
}

// MARK: - Le sticker des commentaires (#14335)

// **Le composeur de commentaire offre le sticker, comme Android** (décision
// porteur #14320). La porte est celle de la barre du message
// (`UniversalComposerBar+Toolbar`), confiée par l'environnement comme la
// caméra ; elle ouvre la feuille unique du produit (#9189), et le sticker
// choisi rejoint la zone d'aperçu comme une IMAGE du commentaire
// (`CommentAttachmentIntake.stage(sticker:)`) — même plafond, même envoi.

/// La porte sticker qu'un hôte confie à la barre sans passer par son
/// initialiseur. `UniversalComposerBar.onRequestStickerPicker`, quand l'hôte
/// le fournit (la conversation), l'emporte.
struct ComposerStickerDoor {
    let open: () -> Void
}

private struct ComposerStickerDoorKey: EnvironmentKey {
    static let defaultValue: ComposerStickerDoor? = nil
}

extension EnvironmentValues {
    var composerStickerDoor: ComposerStickerDoor? {
        get { self[ComposerStickerDoorKey.self] }
        set { self[ComposerStickerDoorKey.self] = newValue }
    }
}

private struct CommentStickerModifier: ViewModifier {
    @Binding var attachments: [ComposerAttachment]
    let limit: Int
    let accentColor: String
    let onOpen: () -> Void

    @State private var isPresented = false

    func body(content: Content) -> some View {
        content
            .environment(\.composerStickerDoor, ComposerStickerDoor(open: {
                onOpen()
                isPresented = true
            }))
            .sheet(isPresented: $isPresented) {
                MeeshyStickerSheet(destination: StickerSheetDestination(diesCut: true) { choice in
                    isPresented = false
                    if case .emoji(let emoji) = choice { RecentEmojiStore.record([emoji]) }
                    CommentAttachmentIntake.stage(sticker: choice, into: $attachments, limit: limit)
                }, accentColor: accentColor)
            }
    }
}
