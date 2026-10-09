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
    /// Offre la caméra au composeur de commentaire : le viseur s'ouvre seul,
    /// en plein écran, et la prise rejoint `attachments`. `onOpen` laisse
    /// l'hôte se préparer à être recouvert (la story s'y met en pause).
    func commentCamera(attachments: Binding<[ComposerAttachment]>, limit: Int = MAX_POST_MEDIA,
                       onOpen: @escaping () -> Void = {}) -> some View {
        modifier(CommentCameraModifier(attachments: attachments, limit: limit, onOpen: onOpen))
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
