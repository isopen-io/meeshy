import SwiftUI
import MeeshySDK
import MeeshyUI

// **La porte de la RETOUCHE d'une image du fil** (#8416) — le composer plein
// écran semé de l'image, qui ne publie rien : « Terminé » rend l'image composée
// au brouillon du message (`MeeshyComposerHost.onReturnMedia`). Une porte à
// part, comme toutes celles qui montent le meuble.

/// **La porte de la retouche** : le composer semé de l'image, qui ne publie rien.
struct ConversationImageSceneEditor: View {
    let onDone: (UIImage) -> Void
    let onCancel: () -> Void
    @StateObject private var graine: ConversationImageSeed

    init(image: UIImage, onDone: @escaping (UIImage) -> Void, onCancel: @escaping () -> Void) {
        self.onDone = onDone
        self.onCancel = onCancel
        _graine = StateObject(wrappedValue: ConversationImageSeed(image: image))
    }

    var body: some View {
        MeeshyComposerHost(
            intent: ComposerIntent(origin: .conversationDraftImage),
            initialVisibility: "PUBLIC",
            onPublishAllInBackground: { _, _, _, _, _, _, _, _, _, _, _, _, _ in false },
            onPublishDocument: { _ in false },
            moodSeed: nil,
            mediaSeed: graine.seed,
            onPreview: { _, _, _, _, _ in },
            onDismiss: onCancel,
            onReturnMedia: { media in
                guard case .image(let image) = media else { return }
                onDone(image)
            }
        )
    }
}

/// **La porte de la caméra de la barre** (#9123) : le composer plein écran,
/// VIDE et viseur armé ; « Terminé » rend la prise — retouchée ou telle
/// quelle — au message en attente.
struct ConversationCaptureSceneEditor: View {
    let onDone: (ComposerReturnedMedia) -> Void
    let onCancel: () -> Void

    var body: some View {
        MeeshyComposerHost(
            intent: ComposerIntent(origin: .conversationCapture),
            initialVisibility: "PUBLIC",
            onPublishAllInBackground: { _, _, _, _, _, _, _, _, _, _, _, _, _ in false },
            onPublishDocument: { _ in false },
            moodSeed: nil,
            mediaSeed: nil,
            onPreview: { _, _, _, _, _ in },
            onDismiss: onCancel,
            onReturnMedia: onDone
        )
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
