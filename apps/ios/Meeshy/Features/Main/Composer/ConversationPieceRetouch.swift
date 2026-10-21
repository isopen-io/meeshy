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
    @State private var life = ComposerCaptureCoverLife()

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
                                 guard life.settle() else { return }
                                 onDone(ComposerReturnedMedia(capture: resultat))
                             }) {
            Color.black
                .ignoresSafeArea()
                .anchorPreference(key: ComposerSceneCameraFrameKey.self, value: .bounds) { $0 }
        }
        // **Une disparition n'est pas une fermeture** (#11347) : SwiftUI peut
        // détacher puis rattacher ce plein écran sans le détruire, et relance
        // alors cette tâche. La session désarmée se réarme et le média se rouvre.
        .task {
            if life.attach() { ComposerCaptureCoverLife.reattach(session) }
            guard !life.settled else { return }
            let ouverte = await ConversationPieceRetouchOpening.open(source, in: session)
            guard !ouverte, !Task.isCancelled else { return }
            close(removing: false)
        }
        .adaptiveOnChange(of: session.phase.isEditing) { avant, apres in
            guard life.abandoned(wasEditing: avant, isEditing: apres) else { return }
            close(removing: true)
        }
        .onDisappear {
            life.detach()
            session.disarm()
        }
        .statusBarHidden()
    }

    private func close(removing: Bool) {
        guard life.settle() else { return }
        removing ? onRemove() : onCancel()
    }
}

/// **La vie d'un plein écran de capture à l'écran** (#11347, #11352) — la
/// retouche d'une pièce ET le viseur servi seul : deux questions distinctes,
/// que le seul « réglée » confondait. L'hôte a-t-il sa réponse ? La vue
/// a-t-elle quitté l'écran ? Une vue détachée a sa session désarmée, mais
/// SwiftUI peut la rattacher avec son état : elle ne répond donc pas à l'hôte,
/// et son désarmement ne se lit pas comme « Abandonner ».
struct ComposerCaptureCoverLife: Equatable {
    private(set) var settled = false
    private(set) var detached = false

    mutating func detach() {
        detached = true
    }

    /// La vue (re)vient à l'écran ; vrai si elle revient d'une disparition,
    /// et que sa session, désarmée, doit se réarmer.
    mutating func attach() -> Bool {
        defer { detached = false }
        return detached
    }

    /// La réponse à l'hôte — « Terminé », « Abandonner » ou la croix — part
    /// une seule fois, et jamais d'une vue détachée.
    mutating func settle() -> Bool {
        guard !settled, !detached else { return false }
        settled = true
        return true
    }

    func abandoned(wasEditing: Bool, isEditing: Bool) -> Bool {
        ConversationPieceRetouchOpening.abandoned(wasEditing: wasEditing, isEditing: isEditing,
                                                  settled: settled || detached)
    }

    /// Le plein écran rattaché après une disparition : sa session, désarmée,
    /// se réarme dans l'état où l'hôte l'avait fait naître — le montage ne
    /// peint rien d'une session éteinte, ni l'aperçu, ni le média, ni la croix.
    static func reattach(_ session: ComposerCaptureSession, mode: ComposerSceneCameraMode? = nil) {
        guard session.stage == .off else { return }
        session.mode = mode
        session.stage = .armed
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
