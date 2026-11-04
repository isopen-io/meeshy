import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La porte de la CITATION d'un post ou d'un réel** — le compositeur unifié,
/// la carte de la source posée sur sa scène, et l'écrivain du repost.
///
/// « Citer » ouvrait une feuille à part, qui ne savait publier que le
/// commentaire et jetait sans un mot ce qu'on y joignait d'autre. La citation se
/// compose désormais dans la même vue que le reste : l'éventail miroite le
/// format de la source (un réel cité peut s'ancrer en post), l'audience se
/// plafonne à celle de l'original, et la scène n'offre que l'écriture — une
/// citation n'emporte que son commentaire.
///
/// L'envoi passe par `ComposerQuotePublisher` : hors ligne la citation est
/// gravée dans la file durable, en ligne un refus laisse le compositeur ouvert.
struct QuoteComposerDoor: View {

    let quoted: FeedPost
    let storyViewModel: StoryViewModel
    let router: Router
    let conversationListViewModel: ConversationListViewModel?
    let statusViewModel: StatusViewModel
    let onFinish: () -> Void

    @State private var previewAssets: StoryPreviewAssets?

    var body: some View {
        MeeshyComposerHost(
            intent: ComposerQuoteDoor.intent(quoting: quoted),
            initialVisibility: quoted.visibility ?? PostVisibility.public.rawValue,
            hydration: .quotingPublication(ComposerQuotedPublication(quoting: quoted)),
            onPublishAllInBackground: { _, _, _, _, _, _, _, _, _, _, _, _, _ in
                refuse(ComposerDocumentCopy.publishError)
            },
            onPublishDocument: { draft in await publish(draft) },
            moodSeed: nil,
            mediaSeed: nil,
            onPreview: { slides, images, loadedImgs, videoURLs, audioURLs in
                previewAssets = StoryPreviewAssets(slides: slides, backgroundImages: images, loadedImages: loadedImgs,
                                                   videoURLs: videoURLs, audioURLs: audioURLs)
            },
            onDismiss: onFinish
        )
        .modifier(StoryPreviewReaderCover(
            assets: $previewAssets,
            storyViewModel: storyViewModel,
            statusViewModel: statusViewModel,
            router: router,
            conversationList: conversationListViewModel
        ))
    }

    private func publish(_ draft: ComposerDocumentDraft) async -> Bool {
        switch await ComposerQuotePublisher().publish(draft) {
        case .accepted:
            HapticFeedback.success()
            return true
        case .refused(.carriesMoreThanText):
            return refuse(ComposerQuoteCopy.textOnly)
        case .refused, .alreadyPending:
            return refuse(ComposerDocumentCopy.publishError)
        case .failed:
            return refuse(ComposerQuoteCopy.failed)
        }
    }

    private func refuse(_ message: String) -> Bool {
        HapticFeedback.error()
        FeedbackToastManager.shared.showError(message)
        return false
    }
}

nonisolated enum ComposerQuoteCopy {
    static var textOnly: String {
        String(localized: "composer.quote.refusal.textOnly",
               defaultValue: "Une citation ne porte que du texte", bundle: .main)
    }

    static var failed: String {
        String(localized: "feed.repost.error", defaultValue: "Erreur lors du repost", bundle: .main)
    }
}
