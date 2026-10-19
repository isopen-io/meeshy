import SwiftUI
import MeeshySDK

/// Les quatre confirmations de suppression de « Mes stories » (story
/// publiée, brouillon, échec de publication, lot sélectionné). Les candidats
/// restent possédés par la vue (ses menus et ses actions VoiceOver les
/// posent) ; ce modificateur ne fait que présenter l'alerte et remettre le
/// candidat confirmé au propriétaire — seul site d'invocation de l'effet
/// destructif.
private struct MyStoriesDeleteAlerts: ViewModifier {
    @Binding var deleteCandidate: StoryItem?
    @Binding var draftDeleteCandidate: StoryDraftSummary?
    @Binding var failedDeleteCandidate: StoryPublishQueueItem?
    @Binding var isBulkDeleteConfirming: Bool
    let onConfirmDeleteStory: (StoryItem) -> Void
    let onConfirmDeleteDraft: (StoryDraftSummary) -> Void
    let onConfirmDeleteFailed: (StoryPublishQueueItem) -> Void
    let onConfirmBulkDelete: () -> Void

    func body(content: Content) -> some View {
        content
            .alert(
                MyStoriesDeleteConfirmation.title(for: .publishedStory),
                isPresented: Binding(get: { deleteCandidate != nil }, set: { if !$0 { deleteCandidate = nil } })
            ) {
                Button(String(localized: "common.cancel", defaultValue: "Annuler"), role: .cancel) {
                    deleteCandidate = nil
                }
                Button(String(localized: "common.delete", defaultValue: "Supprimer"), role: .destructive) {
                    if let story = deleteCandidate { onConfirmDeleteStory(story) }
                    deleteCandidate = nil
                }
            } message: {
                Text(MyStoriesDeleteConfirmation.message(for: .publishedStory))
            }
            .alert(
                MyStoriesDeleteConfirmation.title(for: .draft),
                isPresented: Binding(get: { draftDeleteCandidate != nil }, set: { if !$0 { draftDeleteCandidate = nil } })
            ) {
                Button(String(localized: "common.cancel", defaultValue: "Annuler"), role: .cancel) {
                    draftDeleteCandidate = nil
                }
                Button(String(localized: "common.delete", defaultValue: "Supprimer"), role: .destructive) {
                    if let draft = draftDeleteCandidate { onConfirmDeleteDraft(draft) }
                    draftDeleteCandidate = nil
                }
            } message: {
                Text(MyStoriesDeleteConfirmation.message(for: .draft))
            }
            .alert(
                MyStoriesDeleteConfirmation.title(for: .failedItem),
                isPresented: Binding(get: { failedDeleteCandidate != nil }, set: { if !$0 { failedDeleteCandidate = nil } })
            ) {
                Button(String(localized: "common.cancel", defaultValue: "Annuler"), role: .cancel) {
                    failedDeleteCandidate = nil
                }
                Button(String(localized: "common.delete", defaultValue: "Supprimer"), role: .destructive) {
                    if let item = failedDeleteCandidate { onConfirmDeleteFailed(item) }
                    failedDeleteCandidate = nil
                }
            } message: {
                Text(MyStoriesDeleteConfirmation.message(for: .failedItem))
            }
            .alert(
                String(localized: "story.mine.delete.selected.title", defaultValue: "Supprimer les stories sélectionnées ?"),
                isPresented: $isBulkDeleteConfirming
            ) {
                Button(String(localized: "common.cancel", defaultValue: "Annuler"), role: .cancel) {}
                Button(String(localized: "common.delete", defaultValue: "Supprimer"), role: .destructive) {
                    onConfirmBulkDelete()
                }
            } message: {
                Text(String(localized: "story.mine.delete.selected.message",
                            defaultValue: "Cette action est définitive. Ces stories ne seront plus visibles par personne."))
            }
    }
}

extension View {
    func myStoriesDeleteAlerts(
        deleteCandidate: Binding<StoryItem?>,
        draftDeleteCandidate: Binding<StoryDraftSummary?>,
        failedDeleteCandidate: Binding<StoryPublishQueueItem?>,
        isBulkDeleteConfirming: Binding<Bool>,
        onConfirmDeleteStory: @escaping (StoryItem) -> Void,
        onConfirmDeleteDraft: @escaping (StoryDraftSummary) -> Void,
        onConfirmDeleteFailed: @escaping (StoryPublishQueueItem) -> Void,
        onConfirmBulkDelete: @escaping () -> Void
    ) -> some View {
        modifier(MyStoriesDeleteAlerts(
            deleteCandidate: deleteCandidate,
            draftDeleteCandidate: draftDeleteCandidate,
            failedDeleteCandidate: failedDeleteCandidate,
            isBulkDeleteConfirming: isBulkDeleteConfirming,
            onConfirmDeleteStory: onConfirmDeleteStory,
            onConfirmDeleteDraft: onConfirmDeleteDraft,
            onConfirmDeleteFailed: onConfirmDeleteFailed,
            onConfirmBulkDelete: onConfirmBulkDelete))
    }
}
