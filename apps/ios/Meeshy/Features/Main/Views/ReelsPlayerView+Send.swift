import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - « Envoyer » et « Partager » un réel (#14310, #14311)
//
// Deux gestes, deux feuilles, un vocabulaire commun à la story, au réel et au
// post : « Envoyer » (rail) reste DANS Meeshy — la feuille de partage unique,
// qui crée le lien de l'utilisateur dès son ouverture ; « Partager » (menu
// « … ») en SORT — la feuille du système, avec ce même lien.

/// La carte qu'« Envoyer » remet à la feuille Meeshy.
@MainActor
enum ReelSend {
    static func subject(for reel: FeedPost) -> ShareSubject {
        .publication(reel, isReel: true)
    }

    /// Le toucher : retour haptique, engagement compté, feuille ouverte
    /// AUSSITÔT — le lien se frappe pendant que la feuille charge.
    static func open(_ reel: FeedPost) -> SharedContentWrapper {
        HapticFeedback.light()
        EngagementTracker.shared.recordAction(.shared, surface: .reels)
        return SharedContentWrapper(subject: subject(for: reel))
    }
}

/// Les deux feuilles du lecteur de réels, présentées par sa racine stable.
struct ReelShareSheets: ViewModifier {
    @Binding var outgoing: ShareableLink?
    @Binding var sent: SharedContentWrapper?
    let onClose: () -> Void
    @Environment(\.routerCommands) private var router

    func body(content: Content) -> some View {
        content
            .sheet(item: $outgoing) { link in
                ShareSheet(activityItems: link.activityItems)
            }
            .sheet(item: $sent) { wrapper in
                ShareSheetView(
                    subject: wrapper.subject,
                    actions: ShareSheetHostActions(onOpenConversation: { conversation in
                        onClose()
                        router.navigateToConversation(conversation)
                    }),
                    onDismiss: { sent = nil }
                )
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
    }
}
