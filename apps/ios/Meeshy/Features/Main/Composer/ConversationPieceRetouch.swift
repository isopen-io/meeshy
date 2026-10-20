import SwiftUI
import MeeshySDK
import MeeshyUI

// **La retouche UNIQUE d'une image ou d'une vidéo** (#11133, #11170, décision
// porteur 2026-10-20 : « un seul éditeur ») — la conversation, les
// commentaires, la bande des récents et la feuille de création d'un post du
// fil ouvrent tous ce montage. Les anciennes portes de scène
// (`ConversationImageSceneEditor`, `ConversationVideoSceneEditor`) ont quitté
// le dépôt avec leur dernier appelant.

/// **La retouche de la caméra, ouverte sur une pièce à envoyer** (#11133) —
/// le même montage (`ComposerCaptureMount`), les mêmes outils et le même
/// chrome que la retouche d'une prise : outils visibles d'emblée, (x) et
/// « Terminé » cachés tant qu'un outil est ouvert, lecture et volume en haut à
/// droite. « Terminé » rend la pièce retouchée ; « Abandonner » la retire.
/// Le média choisi ne repart pas en galerie : il y est déjà.
struct ConversationPieceRetouch: View {
    let source: ConversationRetouchSource
    let onDone: (ComposerReturnedMedia) -> Void
    let onRemove: () -> Void
    let onCancel: () -> Void

    @StateObject private var session: ComposerCaptureSession
    @State private var size = ComposerSceneCameraSize.card
    @State private var settled = false

    init(piece: ComposerRetouchPiece, onDone: @escaping (ComposerReturnedMedia) -> Void,
         onRemove: @escaping () -> Void, onCancel: @escaping () -> Void) {
        self.init(source: .piece(piece), onDone: onDone, onRemove: onRemove, onCancel: onCancel)
    }

    /// Un média de la bande des récents, retouché AVANT la pose : rien n'est
    /// encore au message, « Abandonner » referme simplement.
    init(source: ConversationRetouchSource, onDone: @escaping (ComposerReturnedMedia) -> Void,
         onRemove: @escaping () -> Void, onCancel: @escaping () -> Void) {
        self.source = source
        self.onDone = onDone
        self.onRemove = onRemove
        self.onCancel = onCancel
        _session = StateObject(wrappedValue: ConversationPieceRetouchOpening.session())
    }

    var body: some View {
        ComposerCaptureMount(session: session, size: $size, offersSizeToggle: false,
                             onDisarm: { close(removing: false) },
                             onDeliver: { resultat in
                                 guard !settled else { return }
                                 settled = true
                                 onDone(ComposerReturnedMedia(capture: resultat))
                             }) {
            Color.black
                .ignoresSafeArea()
                .anchorPreference(key: ComposerSceneCameraFrameKey.self, value: .bounds) { $0 }
        }
        .task {
            guard await ConversationPieceRetouchOpening.open(source, in: session) else { return close(removing: false) }
        }
        .adaptiveOnChange(of: session.phase.isEditing) { avant, apres in
            guard ConversationPieceRetouchOpening.abandoned(wasEditing: avant, isEditing: apres,
                                                             settled: settled) else { return }
            close(removing: true)
        }
        .onDisappear {
            settled = true
            session.disarm()
        }
        .statusBarHidden()
    }

    private func close(removing: Bool) {
        guard !settled else { return }
        settled = true
        removing ? onRemove() : onCancel()
    }
}

/// Ce que la retouche ouvre (#11133, « un seul éditeur ») : une pièce déjà au
/// message, ou un média des récents avant sa pose.
enum ConversationRetouchSource {
    case piece(ComposerRetouchPiece)
    case image(UIImage)
    case video(URL)
}

/// Les règles de la retouche d'une pièce (#11133), pures ou presque.
@MainActor
enum ConversationPieceRetouchOpening {

    /// Une session de retouche sans objectif : jamais d'enregistrement
    /// automatique en galerie, le média choisi y est déjà.
    static func session(gallery: any ComposerGalleryProviding = ComposerGallery.shared,
                        loopPlayerFactory: (@MainActor (URL) async -> (any ComposerLoopPlayerProviding)?)? = nil)
        -> ComposerCaptureSession {
        guard let loopPlayerFactory else {
            return ComposerCaptureSession(stage: .armed, gallery: gallery, savePolicy: { .standard })
        }
        return ComposerCaptureSession(stage: .armed, gallery: gallery, savePolicy: { .standard },
                                      loopPlayerFactory: loopPlayerFactory)
    }

    /// La pièce entre en retouche. Une vidéo y entre par une COPIE : la retouche
    /// abandonnée efface son fichier, jamais celui de la pièce en attente.
    static func open(_ piece: ComposerRetouchPiece, in session: ComposerCaptureSession) async -> Bool {
        await open(.piece(piece), in: session)
    }

    static func open(_ source: ConversationRetouchSource, in session: ComposerCaptureSession) async -> Bool {
        switch source {
        case .piece(let piece) where piece.kind == .image:
            guard let image = await ConversationImageRetouche.loadSource(fileURL: piece.fileURL) else { return false }
            session.beginEditing(photo: image)
        case .piece(let piece):
            guard let copie = copy(piece.fileURL) else { return false }
            await session.beginEditing(video: copie)
        case .image(let image):
            session.beginEditing(photo: image)
        case .video(let url):
            guard let copie = copy(url) else { return false }
            await session.beginEditing(video: copie)
        }
        return session.phase.isEditing
    }

    private static func copy(_ url: URL) -> URL? {
        let copie = FileManager.default.temporaryDirectory
            .appendingPathComponent("retouche-\(UUID().uuidString).\(url.pathExtension)")
        return (try? FileManager.default.copyItem(at: url, to: copie)) != nil ? copie : nil
    }

    /// La retouche quittée sans rien remettre — « Abandonner » : la pièce part.
    static func abandoned(wasEditing: Bool, isEditing: Bool, settled: Bool) -> Bool {
        wasEditing && !isEditing && !settled
    }
}
