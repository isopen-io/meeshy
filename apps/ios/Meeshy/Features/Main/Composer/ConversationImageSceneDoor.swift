import SwiftUI
import MeeshySDK
import MeeshyUI

// **Les portes de la SCÈNE d'une conversation** (#8416, #9123, #9124) — le
// composer plein écran, qui ne publie rien : « Terminé » rend le média composé
// au brouillon du message (`MeeshyComposerHost.onReturnMedia`). Des portes à
// part, comme toutes celles qui montent le meuble.

/// **La retouche d'une IMAGE** : le composer semé de l'image.
struct ConversationImageSceneEditor: View {
    let staged: Bool
    let onDone: (ComposerReturnedMedia) -> Void
    let onCancel: () -> Void
    @StateObject private var graine: ConversationImageSeed

    init(image: UIImage, staged: Bool,
         onDone: @escaping (ComposerReturnedMedia) -> Void, onCancel: @escaping () -> Void) {
        self.staged = staged
        self.onDone = onDone
        self.onCancel = onCancel
        _graine = StateObject(wrappedValue: ConversationImageSeed(image: image))
    }

    var body: some View {
        ConversationSceneHost(origin: .conversationDraftMedia(staged: staged), seed: graine.seed,
                              onDone: onDone, onCancel: onCancel)
    }
}

/// **La retouche d'une VIDÉO** (#9124) — elle remplace `MeeshyVideoEditorView`
/// dans la conversation : la vidéo est le fond de la scène, et « Terminé » la
/// rend bakée (`StoryVideoExportService`) si l'auteur l'a retouchée.
struct ConversationVideoSceneEditor: View {
    let staged: Bool
    let onDone: (ComposerReturnedMedia) -> Void
    let onCancel: () -> Void
    @StateObject private var graine: ConversationVideoSeed

    init(url: URL, staged: Bool,
         onDone: @escaping (ComposerReturnedMedia) -> Void, onCancel: @escaping () -> Void) {
        self.staged = staged
        self.onDone = onDone
        self.onCancel = onCancel
        _graine = StateObject(wrappedValue: ConversationVideoSeed(url: url))
    }

    var body: some View {
        ConversationSceneHost(origin: .conversationDraftMedia(staged: staged), seed: graine.seed,
                              onDone: { media in
                                  graine.handOff(media)
                                  onDone(media)
                              }, onCancel: onCancel)
    }
}

/// **La porte de la caméra de la barre** (#9123) : le composer plein écran,
/// VIDE et viseur armé ; « Terminé » rend la prise — retouchée ou telle
/// quelle — au message en attente.
struct ConversationCaptureSceneEditor: View {
    let onDone: (ComposerReturnedMedia) -> Void
    let onCancel: () -> Void

    var body: some View {
        ConversationSceneHost(origin: .conversationCapture, seed: nil, onDone: onDone, onCancel: onCancel)
    }
}

/// Le meuble monté pour une porte du fil : il ne publie jamais.
private struct ConversationSceneHost: View {
    let origin: ComposerOrigin
    let seed: StoryComposerSeed?
    let onDone: (ComposerReturnedMedia) -> Void
    let onCancel: () -> Void

    var body: some View {
        MeeshyComposerHost(
            intent: ComposerIntent(origin: origin),
            initialVisibility: "PUBLIC",
            onPublishAllInBackground: { _, _, _, _, _, _, _, _, _, _, _, _, _ in false },
            onPublishDocument: { _ in false },
            moodSeed: nil,
            mediaSeed: seed,
            onPreview: { _, _, _, _, _ in },
            onDismiss: onCancel,
            onReturnMedia: onDone
        )
    }
}

/// **La graine d'une retouche VIDÉO** (#9124) : la copie sous la convention du
/// composer (`StoryComposerSeed.video(copying:)`), PURGÉE à la fermeture — sauf
/// si c'est elle que « Terminé » a rendue telle quelle au message.
final class ConversationVideoSeed: ObservableObject {
    let seed: StoryComposerSeed?
    private let copyURL: URL?
    private nonisolated(unsafe) var keepsCopy = false

    init(url: URL) {
        seed = StoryComposerSeed.video(copying: url, declaredMimeType: MimeTypeResolver.mimeType(forURL: url))
        copyURL = seed?.origin?.fileURL
    }

    func handOff(_ media: ComposerReturnedMedia) {
        if case .video(let rendu) = media, rendu == copyURL { keepsCopy = true }
    }

    // Sous l'isolation MainActor par défaut, la deinit synthétisée est isolée
    // et double-libère sur iOS 26.1 (`MainActorDeinitSourceGuardTests`).
    nonisolated deinit {
        guard !keepsCopy, let copyURL else { return }
        try? FileManager.default.removeItem(at: copyURL)
    }
}

/// **La graine d'une retouche, écrite UNE fois** : elle NOMME son fichier, ce
/// qui la fait adopter comme fond de la scène (`ComposerSeedIngestion.plan`
/// exige une origine). Un `@StateObject` la construit une seule fois par
/// présentation, quel que soit le nombre de rendus du fil derrière.
final class ConversationImageSeed: ObservableObject {
    let seed: StoryComposerSeed
    /// Le temporaire de la graine, PURGÉ quand la retouche se ferme (#8524) :
    /// chaque ouverture en laissait un de plus dans `tmp/`.
    let fileURL: URL

    init(image: UIImage) {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("retouche-\(UUID().uuidString).jpg")
        fileURL = url
        if let data = image.jpegData(compressionQuality: 0.92), (try? data.write(to: url)) != nil {
            seed = StoryComposerSeed(payload: .image(image),
                                     origin: StoryComposerSeed.Origin(fileURL: url, mimeType: "image/jpeg"))
        } else {
            seed = StoryComposerSeed(payload: .image(image))
        }
    }

    // Sous l'isolation MainActor par défaut, la deinit synthétisée est isolée
    // et double-libère sur iOS 26.1 (`MainActorDeinitSourceGuardTests`).
    nonisolated deinit {
        try? FileManager.default.removeItem(at: fileURL)
    }
}
