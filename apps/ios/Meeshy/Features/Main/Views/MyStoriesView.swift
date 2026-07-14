import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - MyStoriesView
//
// Liste des stories ENVOYÉES par l'utilisateur courant, avec un menu « ... »
// par story : Ouvrir (= toucher, ouvre le viewer), Éditer les vues (stats
// « vu par »), Partager (export MP4 auteur), Republier, Supprimer.
// Directive user 2026-07-14. Présentée en sheet depuis le tray « Moi ».
//
// L'ouverture du viewer est déléguée au parent (`onOpen`) : le tray possède le
// `StoryViewerCoordinator` et enchaîne proprement fermeture-sheet → fullScreenCover.
// Les autres actions restent self-contained. Toute action serveur passe par
// `StoryViewModel` (delete) ou `PostService` (repost) — jamais le SDK depuis la vue.

struct MyStoriesView: View {
    @ObservedObject var viewModel: StoryViewModel
    let userId: String
    @ObservedObject var statusViewModel: StatusViewModel
    /// Ouverture du viewer, gérée par le tray (possède le coordinator).
    let onOpen: (StoryItem) -> Void
    /// Création d'une nouvelle story, gérée par le tray (ferme cette sheet
    /// avant de présenter le composer — évite la course sheet/fullScreenCover).
    let onCreateStory: () -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    @State private var viewersStory: StoryItem?
    @State private var exportStory: StoryItem?
    @State private var deleteCandidate: StoryItem?
    @State private var isReposting = false
    @StateObject private var exportViewModel = StoryExportShareViewModel()

    /// Mode sélection multiple (suppression groupée). Directive user 2026-07-14.
    @State private var isSelecting = false
    @State private var selectedIDs: Set<String> = []
    @State private var isBulkDeleteConfirming = false

    private var isDark: Bool { colorScheme == .dark }
    private var accentColor: Color {
        Color(hex: DynamicColorGenerator.colorForName(AuthManager.shared.currentUser?.username ?? ""))
    }

    /// Stories de l'utilisateur, plus récentes d'abord.
    private var stories: [StoryItem] {
        (viewModel.storyGroupForUser(userId: userId)?.stories ?? [])
            .sorted { $0.createdAt > $1.createdAt }
    }

    /// `selectedIDs` filtré contre les stories réellement affichées — une
    /// story supprimée en temps réel (autre appareil) pendant la sélection
    /// disparaît de ce set sans jamais être relue brute.
    private var selectedStoryIDs: Set<String> {
        StorySelectionResolver.liveSelection(selectedIDs: selectedIDs, liveIDs: stories.map(\.id))
    }

    var body: some View {
        NavigationStack {
            Group {
                if stories.isEmpty {
                    EmptyStateView(
                        icon: "rectangle.stack.badge.xmark",
                        title: String(localized: "story.mine.empty.title", defaultValue: "Aucune story envoyée"),
                        subtitle: String(localized: "story.mine.empty.subtitle",
                                         defaultValue: "Vos stories publiées apparaîtront ici tant qu'elles sont actives.")
                    )
                } else {
                    List {
                        ForEach(stories) { story in
                            MyStoryRow(
                                story: story,
                                accentColor: accentColor,
                                isDark: isDark,
                                isSelecting: isSelecting,
                                isSelected: selectedStoryIDs.contains(story.id)
                            )
                            .contentShape(Rectangle())
                            .onTapGesture { handleRowTap(story) }
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                if !isSelecting {
                                    Button(role: .destructive) { deleteCandidate = story } label: {
                                        Label(String(localized: "common.delete", defaultValue: "Supprimer"),
                                              systemImage: "trash")
                                    }
                                }
                            }
                            .contextMenu {
                                if !isSelecting {
                                    actionMenu(for: story)
                                }
                            }
                            .listRowBackground(Color.clear)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle(String(localized: "story.mine.title", defaultValue: "Mes stories"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        onCreateStory()
                    } label: {
                        Image(systemName: "plus.circle.fill")
                    }
                    .accessibilityLabel(String(localized: "story.mine.create", defaultValue: "Créer une story"))
                }
                if !stories.isEmpty {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button {
                            isSelecting.toggle()
                            if !isSelecting { selectedIDs.removeAll() }
                        } label: {
                            Text(isSelecting
                                 ? String(localized: "common.cancel", defaultValue: "Annuler")
                                 : String(localized: "story.mine.select", defaultValue: "Sélectionner"))
                        }
                        .accessibilityLabel(isSelecting
                            ? String(localized: "story.mine.select.cancel", defaultValue: "Annuler la sélection")
                            : String(localized: "story.mine.select", defaultValue: "Sélectionner"))
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done", defaultValue: "OK")) { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom) {
                if isSelecting && !selectedStoryIDs.isEmpty {
                    bulkDeleteBar
                }
            }
        }
        .sheet(item: $viewersStory) { story in
            StoryViewersSheet(
                story: story,
                accentColor: accentColor,
                statusViewModel: statusViewModel,
                onOpenProfile: { _ in }
            )
        }
        .sheet(item: $exportStory) { story in
            StoryExportShareSheet(story: story, viewModel: exportViewModel)
        }
        .alert(
            String(localized: "story.mine.delete.title", defaultValue: "Supprimer la story ?"),
            isPresented: Binding(get: { deleteCandidate != nil }, set: { if !$0 { deleteCandidate = nil } })
        ) {
            Button(String(localized: "common.cancel", defaultValue: "Annuler"), role: .cancel) {
                deleteCandidate = nil
            }
            Button(String(localized: "common.delete", defaultValue: "Supprimer"), role: .destructive) {
                if let story = deleteCandidate { delete(story) }
                deleteCandidate = nil
            }
        } message: {
            Text(String(localized: "story.mine.delete.message",
                        defaultValue: "Cette action est définitive. La story ne sera plus visible par personne."))
        }
        .alert(
            String(localized: "story.mine.delete.selected.title", defaultValue: "Supprimer les stories sélectionnées ?"),
            isPresented: $isBulkDeleteConfirming
        ) {
            Button(String(localized: "common.cancel", defaultValue: "Annuler"), role: .cancel) {}
            Button(String(localized: "common.delete", defaultValue: "Supprimer"), role: .destructive) {
                bulkDelete()
            }
        } message: {
            Text(String(localized: "story.mine.delete.selected.message",
                        defaultValue: "Cette action est définitive. Ces stories ne seront plus visibles par personne."))
        }
    }

    // MARK: - Row tap

    private func handleRowTap(_ story: StoryItem) {
        if isSelecting {
            if selectedIDs.contains(story.id) {
                selectedIDs.remove(story.id)
            } else {
                selectedIDs.insert(story.id)
            }
        } else {
            onOpen(story)
        }
    }

    // MARK: - Bulk delete bar

    private var bulkDeleteBar: some View {
        Button {
            isBulkDeleteConfirming = true
        } label: {
            Text(String(localized: "story.mine.delete.selected",
                        defaultValue: "Supprimer (\(selectedStoryIDs.count))"))
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Capsule().fill(MeeshyColors.error))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
        .accessibilityHint(String(localized: "story.mine.delete.selected.hint",
                                   defaultValue: "Supprime définitivement les stories cochées"))
    }

    // MARK: Menu

    @ViewBuilder
    private func actionMenu(for story: StoryItem) -> some View {
        Button {
            onOpen(story)
        } label: {
            Label(String(localized: "story.mine.open", defaultValue: "Ouvrir"), systemImage: "play.circle")
        }
        Button {
            viewersStory = story
        } label: {
            Label(String(localized: "story.mine.viewers", defaultValue: "Éditer les vues"), systemImage: "eye")
        }
        Button {
            exportStory = story
        } label: {
            Label(String(localized: "story.mine.share", defaultValue: "Partager"), systemImage: "square.and.arrow.up")
        }
        Button {
            repost(story)
        } label: {
            Label(String(localized: "story.mine.repost", defaultValue: "Republier"), systemImage: "arrow.2.squarepath")
        }
        .disabled(isReposting)
        Divider()
        Button(role: .destructive) {
            deleteCandidate = story
        } label: {
            Label(String(localized: "common.delete", defaultValue: "Supprimer"), systemImage: "trash")
        }
    }

    // MARK: Actions

    private func delete(_ story: StoryItem) {
        Task {
            let ok = await viewModel.deleteStory(storyId: story.id)
            await MainActor.run {
                if ok {
                    FeedbackToastManager.shared.showSuccess(
                        String(localized: "story.mine.delete.success", defaultValue: "Story supprimée"))
                } else {
                    FeedbackToastManager.shared.showError(
                        String(localized: "story.mine.delete.error", defaultValue: "Échec de la suppression"))
                }
            }
        }
    }

    private func bulkDelete() {
        let ids = selectedStoryIDs
        Task {
            var failures = 0
            for id in ids {
                let ok = await viewModel.deleteStory(storyId: id)
                if !ok { failures += 1 }
            }
            await MainActor.run {
                selectedIDs.removeAll()
                isSelecting = false
                if failures == 0 {
                    FeedbackToastManager.shared.showSuccess(
                        String(localized: "story.mine.delete.selected.success", defaultValue: "Stories supprimées"))
                } else {
                    FeedbackToastManager.shared.showError(
                        String(localized: "story.mine.delete.selected.error",
                               defaultValue: "\(failures) suppression(s) ont échoué"))
                }
            }
        }
    }

    private func repost(_ story: StoryItem) {
        guard !isReposting else { return }
        isReposting = true
        HapticFeedback.medium()
        Task {
            do {
                _ = try await PostService.shared.repost(
                    postId: story.id, targetType: .story, content: nil, isQuote: false)
                await MainActor.run {
                    isReposting = false
                    FeedbackToastManager.shared.showSuccess(
                        String(localized: "story.mine.repost.success", defaultValue: "Story republiée"))
                }
            } catch {
                await MainActor.run {
                    isReposting = false
                    FeedbackToastManager.shared.showError(
                        String(localized: "story.mine.repost.error", defaultValue: "Échec de la republication"))
                }
            }
        }
    }
}

// MARK: - Row

private struct MyStoryRow: View {
    let story: StoryItem
    let accentColor: Color
    let isDark: Bool
    var isSelecting: Bool = false
    var isSelected: Bool = false

    /// URL brute (résolue en interne par `CachedAsyncImage` via `MeeshyConfig`).
    private var thumbnailURLString: String? {
        story.media.first?.thumbnailUrl ?? story.media.first?.url
    }

    var body: some View {
        HStack(spacing: 12) {
            if isSelecting {
                selectionCircle
            }
            thumbnail
            VStack(alignment: .leading, spacing: 4) {
                Text(story.timeAgo)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(isDark ? .white : MeeshyColors.indigo950)
                HStack(spacing: 12) {
                    metric(icon: "eye.fill", value: story.viewCount ?? 0)
                    metric(icon: "heart.fill", value: story.reactionCount)
                    metric(icon: "bubble.left.fill", value: story.commentCount)
                }
            }
            Spacer()
            if !isSelecting {
                Image(systemName: "ellipsis")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.secondary)
                    .padding(8)
            }
        }
        .padding(.vertical, 4)
    }

    private var selectionCircle: some View {
        Circle()
            .strokeBorder(accentColor, lineWidth: isSelected ? 0 : 1.5)
            .background(Circle().fill(isSelected ? accentColor : Color.clear))
            .overlay {
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.white)
                }
            }
            .frame(width: 22, height: 22)
            .accessibilityLabel(isSelected
                ? String(localized: "story.mine.selected", defaultValue: "Sélectionné")
                : String(localized: "story.mine.notSelected", defaultValue: "Non sélectionné"))
            .accessibilityAddTraits(.isButton)
    }

    @ViewBuilder
    private var thumbnail: some View {
        let width = StoryThumbnailSizing.width(forAspectRatio: story.media.first?.aspectRatio)
        let shape = RoundedRectangle(cornerRadius: 10, style: .continuous)
        Group {
            if let urlString = thumbnailURLString, !urlString.isEmpty {
                CachedAsyncImage(url: urlString, targetSize: CGSize(width: width, height: 64)) {
                    shape.fill(accentColor.opacity(0.25))
                }
            } else {
                shape.fill(accentColor.opacity(0.25))
                    .overlay(Image(systemName: "photo").foregroundColor(accentColor))
            }
        }
        .frame(width: width, height: 64)
        .clipShape(shape)
        .overlay(shape.stroke(accentColor.opacity(0.3), lineWidth: 1))
    }

    @ViewBuilder
    private func metric(icon: String, value: Int) -> some View {
        HStack(spacing: 3) {
            Image(systemName: icon).font(.system(size: 11))
            Text("\(value)").font(.system(size: 13, weight: .medium))
        }
        .foregroundColor(.secondary)
    }
}
