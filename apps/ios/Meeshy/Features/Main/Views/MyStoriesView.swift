import SwiftUI
import MeeshySDK
import MeeshyUI
import os

// MARK: - MyStoriesView
//
// Liste des stories ENVOYÉES par l'utilisateur courant, avec un menu « ... »
// par story : Ouvrir (= toucher, ouvre le viewer), Listing des vues (stats
// « vu par »), Modifier la visibilité, Partager (export MP4 auteur),
// Enregistrer, Transférer, Republier, Supprimer.
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
    /// Édition d'une story publiée, gérée par le tray (même raison : le
    /// composer se présente en fullScreenCover APRÈS fermeture de la sheet).
    /// L'édition remet vues/réactions à zéro côté serveur — la story
    /// « recommence » pour tous, seule la date de publication ne bouge pas.
    let onEditStory: (StoryItem) -> Void
    /// Reprise d'un brouillon dans le composer, gérée par le tray — même
    /// raison que `onCreateStory` : un `fullScreenCover` posé sur une sheet
    /// encore ouverte entre en course avec elle.
    let onResumeDraft: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    // Réinjectés par le tray sur la sheet (même raison que ses covers : la
    // sheet interne SharePickerView crasherait sur un env object manquant).
    @EnvironmentObject private var router: Router
    @EnvironmentObject private var conversationListViewModel: ConversationListViewModel

    /// Surfaces `activeUpload`'s failure history so it can be listed
    /// alongside published stories with a direct retry — the tray badge
    /// (`StoryUploadOverlay`) only shows the SINGLE current attempt.
    @StateObject private var publishService = StoryPublishService.shared

    @State private var viewersStory: StoryItem?
    @State private var exportStory: StoryItem?
    @State private var forwardStory: StoryItem?
    @State private var deleteCandidate: StoryItem?
    @State private var isReposting = false
    @StateObject private var exportViewModel = StoryExportShareViewModel()

    /// Cible du picker d'audience — un SEUL état porte la story et le mode,
    /// pour qu'ils ne puissent pas se désynchroniser.
    @State private var audienceTarget: AudienceTarget?

    @State private var isSelecting = false
    @State private var selectedIDs: Set<String> = []
    @State private var isBulkDeleteConfirming = false

    /// Cible de la sheet de commentaires (celle des posts, réutilisée telle
    /// quelle — jamais l'overlay incrusté du reader, hors périmètre).
    @State private var commentTarget: MyStoriesCommentTarget?
    @State private var isResolvingComments = false

    /// Onglet courant. Semé une seule fois à l'apparition par
    /// `MyStoriesTabResolver` — pas à chaque évaluation du corps, sinon
    /// publier une story ramènerait l'utilisateur de force sur « Publiées ».
    @State private var tab: MyStoriesTab = .published
    @State private var hasSeededTab = false
    @StateObject private var draftsViewModel = StoryDraftsViewModel()

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
            VStack(spacing: 0) {
                tabPicker
                Group {
                    switch tab {
                    case .published: publishedTab
                    case .drafts:    draftsTab
                    }
                }
            }
            .task {
                draftsViewModel.reload()
                guard !hasSeededTab else { return }
                hasSeededTab = true
                tab = MyStoriesTabResolver.initialTab(
                    hasPublishedStories: !stories.isEmpty,
                    hasPendingWork: !draftsViewModel.drafts.isEmpty
                        || !viewModel.activeUploads.isEmpty
                        || !publishService.failedItems.isEmpty)
            }
            .navigationTitle(String(localized: "story.mine.title", defaultValue: "Mes stories"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        onCreateStory()
                    } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(width: 32, height: 32)
                            .adaptiveGlassProminent(in: Circle(), tint: accentColor)
                    }
                    .buttonStyle(.plain)
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
                                .font(MeeshyFont.relative(14, weight: .semibold))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .adaptiveGlass(in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(isSelecting
                            ? String(localized: "story.mine.select.cancel", defaultValue: "Annuler la sélection")
                            : String(localized: "story.mine.select", defaultValue: "Sélectionner"))
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        dismiss()
                    } label: {
                        Text(String(localized: "common.ok", defaultValue: "OK"))
                            .font(MeeshyFont.relative(14, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 6)
                            .adaptiveGlassProminent(in: Capsule(), tint: accentColor)
                    }
                    .buttonStyle(.plain)
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
        // `onDismiss` aligné sur le lecteur (`StoryViewerView`, sheet
        // « Partager ») : sans lui, swiper la sheet depuis la liste laissait le
        // bake tourner jusqu'au bout et orphelinait le MP4 temporaire. Pas de
        // `resumeTimer()` ici — il n'y a pas de lecture à reprendre dans la
        // liste, c'est la seule différence assumée avec le lecteur.
        .sheet(item: $exportStory, onDismiss: { exportViewModel.cancel() }) { story in
            StoryExportShareSheet(story: story, viewModel: exportViewModel)
        }
        .sheet(item: $commentTarget) { target in
            // Sheet des posts, réutilisée telle quelle (composeur de réponse
            // déjà fonctionnel par défaut) — jamais l'overlay incrusté du
            // reader (`StoryViewerView.showCommentsOverlay`), hors périmètre.
            // Une sheet crée un environnement neuf : `statusViewModel` et
            // `storyViewModel` doivent être réinjectés, sinon la présentation
            // crashe (piège connu du projet, cf. RootView.swift).
            CommentsSheetView(post: target.post, accentColor: target.post.authorColor)
                .environmentObject(statusViewModel)
                .environmentObject(viewModel)
        }
        .sheet(item: $forwardStory) { story in
            SharePickerView(
                sharedContent: .story(
                    item: story,
                    authorName: AuthManager.shared.currentUser?.displayName
                        ?? AuthManager.shared.currentUser?.username ?? ""
                ),
                onDismiss: { forwardStory = nil },
                onShareToConversation: nil
            )
            .environmentObject(router)
            .environmentObject(conversationListViewModel)
            .environmentObject(statusViewModel)
            .presentationDetents([.medium, .large])
        }
        .sheet(item: $audienceTarget) { target in
            AudienceUserPickerView(
                mode: target.mode,
                initialSelection: target.story.visibilityUserIds ?? []
            ) { ids in
                audienceTarget = nil
                guard !ids.isEmpty else { return }
                applyVisibility(target.mode, for: target.story, userIds: ids)
            }
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

    /// Deux onglets COMPLÈTEMENT distincts (directive user 2026-08-01). Un
    /// `Picker` segmenté plutôt qu'un `TabView` paginé : le geste horizontal
    /// d'un `TabView` entre en concurrence avec le balayage de fermeture de la
    /// sheet, et les deux onglets y seraient instanciés en permanence.
    private var tabPicker: some View {
        Picker("", selection: $tab) {
            ForEach(MyStoriesTab.allCases) { tab in
                Text(tab.title).tag(tab)
            }
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    // MARK: - Onglet « Publiées »

    @ViewBuilder
    private var publishedTab: some View {
        if MyStoriesTabResolver.shouldShowEmptyState(
            tab: .published,
            hasPublishedStories: !stories.isEmpty,
            hasDrafts: !draftsViewModel.drafts.isEmpty,
            hasActiveUpload: !viewModel.activeUploads.isEmpty,
            hasFailedItems: !publishService.failedItems.isEmpty
        ) {
            EmptyStateView(
                icon: "rectangle.stack.badge.xmark",
                title: String(localized: "story.mine.empty.title", defaultValue: "Aucune story envoyée"),
                subtitle: String(localized: "story.mine.empty.subtitle",
                                 defaultValue: "Vos stories publiées apparaîtront ici tant qu'elles sont actives.")
            )
        } else {
            publishedGrid
        }
    }

    /// Grille verticale, triée par date de publication décroissante.
    ///
    /// `LazyVGrid` n'offre PAS de `swipeActions` : la suppression passe par le
    /// menu « … » et par une action d'accessibilité explicite, sinon le chemin
    /// VoiceOver du balayage disparaîtrait sans remplaçant.
    private var publishedGrid: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                ForEach(stories) { story in
                    MyStoryCard(
                        model: publishedCardModel(for: story),
                        now: Date(),
                        accentColor: accentColor,
                        isDark: isDark,
                        onOpen: { handleRowTap(story) },
                        onGlyph: { glyph in handlePublishedGlyph(glyph, for: story) },
                        moreMenu: AnyView(actionMenu(for: story))
                    )
                    .accessibilityAction(named: String(localized: "common.delete", defaultValue: "Supprimer")) {
                        deleteCandidate = story
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
    }

    private func publishedCardModel(for story: StoryItem) -> MyStoryCardModel {
        MyStoryCardModel(
            id: story.id,
            kind: .published,
            thumbnailURL: story.media.first?.thumbnailUrl ?? story.media.first?.url,
            thumbHash: story.storyEffects?.thumbHash,
            localCoverPath: nil,
            backgroundHex: story.storyEffects?.background,
            date: story.createdAt,
            expiresAt: story.expiresAt,
            counts: [
                .viewsAndReactions: story.viewCount ?? 0,
                .reactions: story.reactionCount,
                .comments: story.commentCount,
            ],
            title: nil)
    }

    private func handlePublishedGlyph(_ glyph: MyStoryGlyph, for story: StoryItem) {
        switch glyph {
        case .viewsAndReactions: viewersStory = story
        case .comments:          openComments(for: story)
        case .reactions, .more, .publish: break
        }
    }

    // MARK: - Onglet « Brouillons »

    @ViewBuilder
    private var draftsTab: some View {
        if MyStoriesTabResolver.shouldShowEmptyState(
            tab: .drafts,
            hasPublishedStories: !stories.isEmpty,
            hasDrafts: !draftsViewModel.drafts.isEmpty,
            hasActiveUpload: !viewModel.activeUploads.isEmpty,
            hasFailedItems: !publishService.failedItems.isEmpty
        ) {
            EmptyStateView(
                icon: "square.and.pencil",
                title: String(localized: "story.mine.drafts.empty.title", defaultValue: "Aucun brouillon"),
                subtitle: String(localized: "story.mine.drafts.empty.subtitle",
                                 defaultValue: "Une story fermée sans être publiée vous attend ici.")
            )
        } else {
            draftsContent
        }
    }

    private var draftsContent: some View {
        ScrollView {
            VStack(spacing: 12) {
                // C5 — TOUTES les publications en cours/en attente sont
                // listées, pas seulement celle mise en avant sur l'avatar :
                // c'est la surface où l'on gère la file.
                ForEach(viewModel.activeUploads) { upload in
                    ActiveUploadRow(
                        upload: upload,
                        onRetry: { viewModel.retryUpload(id: upload.id) },
                        onCancel: { viewModel.cancelUpload(id: upload.id) }
                    )
                    .padding(.horizontal, 16)
                }
                if !publishService.failedItems.isEmpty {
                    // Les échecs vivent ici : un onglet « Publiées » ne peut
                    // pas contenir du non-publié.
                    sectionHeader(String(localized: "story.mine.failed.header",
                                         defaultValue: "Échecs de publication"))
                    ForEach(publishService.failedItems) { item in
                        FailedStoryRow(item: item, onRetry: { retryFailedItem(item) })
                            .padding(.horizontal, 16)
                            .contextMenu {
                                Button(role: .destructive) { discardFailedItem(item) } label: {
                                    Label(String(localized: "common.delete", defaultValue: "Supprimer"),
                                          systemImage: "trash")
                                }
                            }
                    }
                }
                if !draftsViewModel.drafts.isEmpty {
                    sectionHeader(String(localized: "story.mine.drafts.header",
                                         defaultValue: "Brouillons"))
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                        ForEach(draftsViewModel.drafts) { draft in
                            MyStoryCard(
                                model: draftCardModel(for: draft),
                                now: Date(),
                                accentColor: accentColor,
                                isDark: isDark,
                                onOpen: { onResumeDraft(draft.id) },
                                onGlyph: { glyph in handleDraftGlyph(glyph, for: draft) },
                                moreMenu: AnyView(draftMenu(for: draft)))
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }
            .padding(.bottom, 24)
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        HStack {
            Text(title)
                .font(MeeshyFont.relative(13, weight: .semibold))
                .foregroundColor(.secondary)
            Spacer()
        }
        .padding(.horizontal, 16)
    }

    private func draftCardModel(for draft: StoryDraftSummary) -> MyStoryCardModel {
        MyStoryCardModel(
            id: draft.id,
            kind: .draft,
            thumbnailURL: nil,
            thumbHash: draft.thumbHash,
            localCoverPath: draft.coverFileURL?.path,
            backgroundHex: draft.backgroundHex,
            date: draft.updatedAt,
            expiresAt: nil,
            counts: [:],
            title: draft.title)
    }

    private func handleDraftGlyph(_ glyph: MyStoryGlyph, for draft: StoryDraftSummary) {
        switch glyph {
        case .publish: onResumeDraft(draft.id)
        default:       break
        }
    }

    @ViewBuilder
    private func draftMenu(for draft: StoryDraftSummary) -> some View {
        ForEach(MyStoryCardPresentation.moreActions(for: .draft), id: \.self) { action in
            switch action {
            case .edit:
                Button {
                    onResumeDraft(draft.id)
                } label: {
                    Label(String(localized: "common.edit", defaultValue: "Modifier"), systemImage: "pencil")
                }
            case .delete:
                Button(role: .destructive) {
                    draftsViewModel.delete(draft.id)
                } label: {
                    Label(String(localized: "common.delete", defaultValue: "Supprimer"), systemImage: "trash")
                }
            case .schedule, .share, .viewers:
                EmptyView()
            }
        }
    }

    // MARK: - Row tap

    private func handleRowTap(_ story: StoryItem) {
        guard isSelecting else {
            onOpen(story)
            return
        }
        if selectedIDs.contains(story.id) {
            selectedIDs.remove(story.id)
        } else {
            selectedIDs.insert(story.id)
        }
    }

    // MARK: - Bulk delete bar

    private var bulkDeleteBar: some View {
        Button {
            isBulkDeleteConfirming = true
        } label: {
            Text(String(localized: "story.mine.delete.selected",
                        defaultValue: "Supprimer (\(selectedStoryIDs.count))"))
                .font(MeeshyFont.relative(15, weight: .semibold))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .adaptiveGlassProminent(in: Capsule(), tint: MeeshyColors.error)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .accessibilityLabel(String(localized: "story.mine.delete.selected",
                                    defaultValue: "Supprimer (\(selectedStoryIDs.count))"))
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
            Label(String(localized: "story.mine.viewers", defaultValue: "Listing des vues"), systemImage: "eye")
        }
        Button {
            onEditStory(story)
        } label: {
            Label(String(localized: "story.mine.edit", defaultValue: "Modifier"), systemImage: "pencil")
        }
        Menu {
            ForEach(PostVisibility.composerSelectableCases) { mode in
                Button {
                    selectVisibility(mode, for: story)
                } label: {
                    Label(mode.label,
                          systemImage: StoryVisibilityMenuResolver.symbol(
                            for: mode, currentRawValue: story.visibility))
                }
            }
        } label: {
            Label(String(localized: "story.mine.visibility", defaultValue: "Visibilité"),
                  systemImage: "lock.rotation")
        }
        Button {
            exportStory = story
        } label: {
            Label(String(localized: "story.mine.share", defaultValue: "Partager"), systemImage: "square.and.arrow.up")
        }
        Button {
            StoryPhotoSaveService.shared.save(story: story)
        } label: {
            Label(String(localized: "story.mine.save", defaultValue: "Enregistrer"), systemImage: "square.and.arrow.down")
        }
        Button {
            forwardStory = story
        } label: {
            Label(String(localized: "story.mine.forward", defaultValue: "Transférer"), systemImage: "arrowshape.turn.up.right")
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

    /// `EXCEPT` / `ONLY` demandent une sélection d'utilisateurs — le picker
    /// s'ouvre pré-coché sur la sélection actuelle. Les autres modes partent
    /// directement au serveur.
    private func selectVisibility(_ mode: PostVisibility, for story: StoryItem) {
        switch StoryVisibilityMenuResolver.route(to: mode, current: story.visibility) {
        case .ignored:
            return
        case .openAudiencePicker:
            audienceTarget = AudienceTarget(story: story, mode: mode)
        case .applyDirectly(let userIds):
            applyVisibility(mode, for: story, userIds: userIds)
        }
    }

    /// `userIds` n'est PAS optionnel : ce chemin envoie toujours une liste, y
    /// compris vide, pour que le serveur nettoie une audience orpheline plutôt
    /// que de conserver l'ancienne (`nil` serait omis du JSON — voir
    /// `StoryVisibilityMenuResolver.Route.applyDirectly`).
    private func applyVisibility(_ mode: PostVisibility, for story: StoryItem, userIds: [String]) {
        HapticFeedback.medium()
        Task {
            let ok = await viewModel.applyVisibility(
                storyId: story.id, visibility: mode.rawValue, userIds: userIds)
            if ok {
                FeedbackToastManager.shared.showSuccess(
                    String(localized: "story.mine.visibility.success", defaultValue: "Visibilité mise à jour"))
            } else {
                FeedbackToastManager.shared.showError(
                    String(localized: "story.mine.visibility.error", defaultValue: "Échec de la mise à jour"))
            }
        }
    }

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
                // Retire uniquement les ids traités : si l'utilisateur a
                // sélectionné une nouvelle story pendant les appels réseau,
                // cette sélection survit au lieu d'être effacée en silence.
                selectedIDs.subtract(ids)
                if selectedIDs.isEmpty { isSelecting = false }
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

    // MARK: - Comments

    /// Résout le `FeedPost` derrière une story pour alimenter la sheet de
    /// commentaires des posts. Cache d'abord — une story fraîchement listée
    /// est déjà dans `StoryService.cachedPost`, inutile de payer un
    /// aller-retour réseau pour l'ouvrir.
    private func openComments(for story: StoryItem) {
        guard !isResolvingComments else { return }
        let preferred = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
        let cached = StoryService.shared.cachedPost(id: story.id)
        if MyStoriesCommentsResolver.shouldUseCache(cachedPost: cached), let cached {
            commentTarget = MyStoriesCommentTarget(post: cached.toFeedPost(preferredLanguages: preferred))
            return
        }
        isResolvingComments = true
        Task {
            do {
                let post = try await StoryService.shared.fetchPost(id: story.id)
                commentTarget = MyStoriesCommentTarget(post: post.toFeedPost(preferredLanguages: preferred))
            } catch {
                Logger.stories.error(
                    "openComments failed for \(story.id, privacy: .public): \(error.localizedDescription, privacy: .public)")
                FeedbackToastManager.shared.showError(
                    String(localized: "story.mine.comments.error", defaultValue: "Commentaires indisponibles"))
            }
            isResolvingComments = false
        }
    }

    // MARK: - Failed publish history actions

    private func retryFailedItem(_ item: StoryPublishQueueItem) {
        Task {
            await StoryPublishService.shared.retry(item)
        }
    }

    /// Abandons the failed item AND clears its optimistic `pending_<uuid>`
    /// placeholder from the tray/story groups — otherwise a discarded item
    /// would leave a dead row behind that never resolves (StoryViewModel only
    /// removes the placeholder on a SUCCESSFUL reconciliation).
    private func discardFailedItem(_ item: StoryPublishQueueItem) {
        Task {
            await StoryPublishService.shared.discard(item)
        }
        viewModel.removeOptimisticStories(tempStoryId: item.tempStoryId)
    }
}

// MARK: - Row accessibility

/// Composition du libellé VoiceOver de la ligne.
///
/// La ligne est `.accessibilityElement(children: .ignore)` : l'anneau de
/// progression, posé en enfant, serait invisible au rotor. Sa valeur remonte
/// donc ici, en suffixe du libellé de la ligne.
enum MyStoryRowAccessibility {

    static func label(base: String, saveProgress: Double?) -> String {
        guard let saveProgress else { return base }
        // Même fonction pure que celle qui alimente le chiffre affiché dans
        // l'anneau (`StorySaveProgressRing.percent(_:)`) — pas une seconde
        // formule de clamp/arrondi qui pourrait diverger silencieusement
        // (revue Task 7, finding Minor).
        let percent = StorySaveProgressRing.percent(saveProgress)
        let suffix = String(
            localized: "story.mine.save.progress.a11y",
            defaultValue: "Enregistrement \(percent) %"
        )
        return "\(base) \(suffix)"
    }
}

// MARK: - Comments sheet resolution

/// Résolution cache-first du `FeedPost` derrière une story pour la sheet de
/// commentaires (`CommentsSheetView`, celle des posts). Une story fraîchement
/// listée dans « Mes stories » est déjà dans `StoryService.cachedPost` —
/// inutile de payer un aller-retour réseau pour ouvrir ses commentaires.
/// Générique : garde pure, aucune dépendance sur `APIPost` pour rester
/// testable sans construire le modèle SDK complet.
enum MyStoriesCommentsResolver {
    static func shouldUseCache<T>(cachedPost: T?) -> Bool {
        cachedPost != nil
    }
}

// MARK: - Visibility menu

/// Marquage du mode de visibilité courant dans le sous-menu « Modifier la
/// visibilité ». Le mode actif porte un `checkmark` à la place de son icône.
///
/// Pourquoi pas un `Picker` inline (qui coche nativement) : sous iOS 26, un
/// `.tint(.clear)` fait disparaître toutes les icônes d'un menu — on garde donc
/// la main sur le symbole rendu.
enum StoryVisibilityMenuResolver {

    /// Ce que déclenche le tap sur une entrée du sous-menu.
    enum Route: Equatable {
        /// Mode déjà actif : ne rien faire (ni réseau, ni picker).
        case ignored
        /// Écriture directe — aucune sélection d'utilisateurs requise.
        ///
        /// `userIds` vaut `[]`, **jamais `nil`**, et c'est le cœur de la
        /// correction : `UpdatePostRequest` encode ses optionnels via
        /// l'`Encodable` synthétisé, donc un `nil` est simplement OMIS du JSON
        /// — et le gateway ne touche le champ que s'il est présent
        /// (`PostService.updatePost` : `if (data.visibilityUserIds !==
        /// undefined)`). Passer de `EXCEPT[a,b,c]` à Public en envoyant `nil`
        /// vidait donc la liste LOCALEMENT pendant que la base gardait
        /// `[a,b,c]` : au refresh suivant, rouvrir « Sauf… » repré-cochait
        /// a/b/c. `[]` est accepté par le schéma Zod du gateway pour toutes
        /// les visibilités sans sélection (le `refine` ne rejette une liste
        /// vide que pour `EXCEPT`/`ONLY`) et nettoie réellement le champ.
        ///
        /// Le payload est porté par le cas plutôt que décidé au site d'appel :
        /// un retour à `nil` ne compile plus.
        case applyDirectly(userIds: [String])
        /// `EXCEPT` / `ONLY` : le gateway rejette un envoi sans `visibilityUserIds`.
        case openAudiencePicker
    }

    static func isCurrent(_ candidate: PostVisibility, rawValue: String?) -> Bool {
        guard let rawValue else { return false }
        return rawValue.uppercased() == candidate.rawValue
    }

    static func symbol(for candidate: PostVisibility, currentRawValue: String?) -> String {
        isCurrent(candidate, rawValue: currentRawValue) ? "checkmark" : candidate.icon
    }

    static func route(to candidate: PostVisibility, current rawValue: String?) -> Route {
        if isCurrent(candidate, rawValue: rawValue) { return .ignored }
        // `[]` et non `nil` — voir la doc de `Route.applyDirectly` : c'est ce
        // qui nettoie RÉELLEMENT une liste d'audience orpheline côté serveur.
        return candidate.requiresUserSelection ? .openAudiencePicker : .applyDirectly(userIds: [])
    }
}

// MARK: - Row

private struct MyStoryRow<MenuContent: View>: View {
    let story: StoryItem
    let accentColor: Color
    let isDark: Bool
    let isSelecting: Bool
    let isSelected: Bool
    @ObservedObject var saveService: StoryPhotoSaveService
    let menuContent: () -> MenuContent
    let onTap: () -> Void
    let onOpenComments: () -> Void
    let onOpenViewers: () -> Void

    init(story: StoryItem, accentColor: Color, isDark: Bool,
         isSelecting: Bool = false, isSelected: Bool = false,
         saveService: StoryPhotoSaveService = .shared,
         @ViewBuilder menuContent: @escaping () -> MenuContent,
         onTap: @escaping () -> Void,
         onOpenComments: @escaping () -> Void,
         onOpenViewers: @escaping () -> Void) {
        self.story = story
        self.accentColor = accentColor
        self.isDark = isDark
        self.isSelecting = isSelecting
        self.isSelected = isSelected
        self.saveService = saveService
        self.menuContent = menuContent
        self.onTap = onTap
        self.onOpenComments = onOpenComments
        self.onOpenViewers = onOpenViewers
    }

    /// URL brute (résolue en interne par `CachedAsyncImage` via `MeeshyConfig`).
    private var thumbnailURLString: String? {
        story.media.first?.thumbnailUrl ?? story.media.first?.url
    }

    var body: some View {
        HStack(spacing: 12) {
            // Zone principale = Button « ouvrir » (ou toggle en sélection).
            // Un `.onTapGesture` posé sur toute la ligne interceptait AUSSI le
            // tap destiné au Menu « … » (le viewer s'ouvrait à la place du
            // menu) — le Button borne la zone tappable au contenu, le Menu
            // reste seul maître de son ellipsis.
            Button(action: onTap) {
                HStack(spacing: 12) {
                    if isSelecting {
                        selectionCircle
                    }
                    thumbnail
                    VStack(alignment: .leading, spacing: 4) {
                        Text(story.timeAgo)
                            .font(MeeshyFont.relative(15, weight: .semibold))
                            .foregroundColor(isDark ? .white : MeeshyColors.indigo950)
                        // Cœur UNIQUEMENT si au moins une réaction — jamais de
                        // « 0 » décoratif sous l'heure (directive 2026-07-29).
                        // Le compteur de vues a migré vers le bouton œil dédié,
                        // à gauche du bouton commentaires.
                        if story.reactionCount > 0 {
                            metric(icon: "heart.fill", value: story.reactionCount)
                        }
                    }
                    Spacer()
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            // Icône vues + compteur, immédiatement à gauche du bouton
            // commentaires (même patron visuel) — ouvre le « Listing des
            // vues » (`StoryViewersSheet`, la même sheet que l'entrée du menu
            // `⋯`). Masquée du rotor : l'accès VoiceOver passe par une action
            // de ligne (cf. .accessibilityActions ci-dessous).
            if !isSelecting {
                Button {
                    onOpenViewers()
                } label: {
                    HStack(spacing: 3) {
                        Image(systemName: "eye")
                            .font(.system(size: 15, weight: .semibold))
                        if (story.viewCount ?? 0) > 0 {
                            Text("\(story.viewCount ?? 0)")
                                .font(MeeshyFont.relative(12, weight: .medium))
                        }
                    }
                    .foregroundColor(.secondary)
                    .padding(8)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHidden(true)
            }
            // Icône commentaire + compteur, immédiatement à gauche de
            // l'anneau/« … » — ouvre `CommentsSheetView` (celle des posts) sur
            // les commentaires de la story. Masquée du rotor comme le reste de
            // cette zone : la ligne compose déjà son propre libellé
            // (children: .ignore), l'accès VoiceOver passe par une action de
            // ligne (cf. .accessibilityActions ci-dessous).
            if !isSelecting {
                Button {
                    onOpenComments()
                } label: {
                    HStack(spacing: 3) {
                        Image(systemName: "bubble.left")
                            .font(.system(size: 15, weight: .semibold))
                        if story.commentCount > 0 {
                            Text("\(story.commentCount)")
                                .font(MeeshyFont.relative(12, weight: .medium))
                        }
                    }
                    .foregroundColor(.secondary)
                    .padding(8)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHidden(true)
            }
            if !isSelecting {
                if let progress = saveService.progress(for: story.id) {
                    saveRing(progress: progress)
                } else {
                    // « … » ouvre le MÊME menu d'actions que le long-press
                    // (Partager, Enregistrer, Transférer, Republier, Supprimer) —
                    // un tap suffit (bug : l'affordance était décorative). VoiceOver
                    // garde ses chemins existants (`.contextMenu` + `.swipeActions`
                    // de la ligne) : le glyphe reste masqué du rotor, la ligne
                    // compose déjà son propre libellé (children: .ignore).
                    Menu {
                        menuContent()
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.secondary)
                            .padding(8)
                            .contentShape(Rectangle())
                    }
                    .accessibilityHidden(true)
                }
            }
        }
        .padding(.vertical, 4)
        // VoiceOver : la ligne empile un tampon temporel + trois compteurs nus
        // (12 / 5 / 3) sans contexte. On la compose en UN élément labellisé —
        // « il y a 2h. 12 vues, 5 réactions, 3 commentaires » — plutôt que de
        // laisser lire trois nombres orphelins. La coche reste transmise via la
        // trait `.isSelected` de la ligne (même pattern que NewConversationView).
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(rowAccessibilityLabel)
        .accessibilityAddTraits(.isButton)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        // `.accessibilityActions` est TOUJOURS attaché (jamais posé derrière
        // un `if/else` au niveau de la vue) : SwiftUI ne démonte donc jamais
        // la ligne entière (vignette, bouton d'ouverture, élément
        // d'accessibilité) quand un job démarre ou se termine — seul le
        // contenu du ViewBuilder varie, exactement comme un `Menu { if … }`
        // qui n'ajoute pas d'entrée quand sa condition est fausse. Round 1
        // conditionnait `body` lui-même (if/else autour de toute la ligne) :
        // deux types de vue concrets différents selon la branche, donc
        // démontage/remontage complet à chaque bascule — régression
        // d'identité de vue relevée en revue. Finding Task 3, round 2.
        .accessibilityActions {
            // Même condition que le tap de l'anneau : proposer « Annuler
            // l'enregistrement » quand l'écriture photothèque a déjà commencé
            // annoncerait une action que le service refuse — voir
            // `StoryPhotoSaveService.isCancellable(storyId:)`.
            if saveService.isCancellable(storyId: story.id) {
                Button(String(
                    localized: "story.mine.save.cancel.a11y",
                    defaultValue: "Annuler l'enregistrement"
                )) {
                    saveService.cancel(storyId: story.id)
                }
            }
            // Même visibilité que les boutons (masqués du rotor, `if !isSelecting`
            // ci-dessus) : le contenu du builder varie, le modifier lui-même
            // reste TOUJOURS attaché — jamais de if/else autour de body.
            if !isSelecting {
                Button(String(
                    localized: "story.mine.viewers.a11y",
                    defaultValue: "Listing des vues"
                )) {
                    onOpenViewers()
                }
                Button(String(
                    localized: "story.mine.comments.a11y",
                    defaultValue: "Afficher les commentaires"
                )) {
                    onOpenComments()
                }
            }
        }
    }

    /// Libellé VoiceOver composé : tampon temporel + les trois compteurs
    /// d'engagement rendus visuellement par des icônes muettes, plus la
    /// progression de sauvegarde quand un export est en vol.
    private var rowAccessibilityLabel: String {
        let base = String(
            localized: "story.mine.row.a11y",
            defaultValue: "\(story.timeAgo). \(story.viewCount ?? 0) vues, \(story.reactionCount) réactions, \(story.commentCount) commentaires"
        )
        return MyStoryRowAccessibility.label(base: base, saveProgress: saveService.progress(for: story.id))
    }

    private var selectionCircle: some View {
        Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
            .font(MeeshyFont.relative(22))
            .foregroundColor(isSelected ? accentColor : Color.secondary.opacity(0.4))
            .accessibilityHidden(true)
    }

    /// Anneau de progression de la sauvegarde photothèque, à la place du « … ».
    /// Tap = annulation. Masqué du rotor : la valeur et l'action d'annulation
    /// remontent sur la LIGNE (children: .ignore l'avalerait sinon).
    ///
    /// Le dessin lui-même est délégué à `StorySaveProgressRing` — partagé
    /// avec le rail d'actions du reader (`StoryActionSidebarView`) — pour que
    /// les deux surfaces ne divergent jamais (épaisseur, arrondi, sens de
    /// rotation).
    ///
    /// Le tap cesse d'être actif dès que l'écriture photothèque a commencé
    /// (`isCancellable(storyId:)`) : `PHPhotoLibrary.performChanges` n'est pas
    /// annulable, et un tap y affichait « Export annulé » sur une vidéo qui
    /// atterrissait quand même.
    ///
    /// Le MÊME booléen pilote le rendu de l'anneau (`isCancellable:`) et le
    /// `.disabled` du bouton : `.buttonStyle(.plain)` + `.disabled` ne changent
    /// rien visuellement sur des `Shape` à couleur explicite, donc le
    /// basculement serait autrement totalement muet.
    private func saveRing(progress: Double) -> some View {
        let canCancel = saveService.isCancellable(storyId: story.id)
        return Button {
            HapticFeedback.medium()
            saveService.cancel(storyId: story.id)
        } label: {
            StorySaveProgressRing(progress: progress, tint: accentColor, isCancellable: canCancel)
                .padding(8)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!canCancel)
        .accessibilityHidden(true)
    }

    /// Cascade : composite ThumbHash (inclut texte/dessin/stickers, seule
    /// représentation client du VRAI contenu composé — cf.
    /// `MyStoryThumbnailResolver`) → miniature brute du média de fond
    /// (stories legacy sans thumbHash) → icône générique (story vide).
    @ViewBuilder
    private var thumbnail: some View {
        let width = StoryThumbnailSizing.width(forAspectRatio: story.media.first?.aspectRatio)
        let shape = RoundedRectangle(cornerRadius: 10, style: .continuous)
        Group {
            switch MyStoryThumbnailResolver.resolve(thumbHash: story.storyEffects?.thumbHash, remoteURL: thumbnailURLString) {
            case .composite(let hash):
                if let img = UIImage.fromThumbHash(hash) {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFill()
                } else if let urlString = thumbnailURLString, !urlString.isEmpty {
                    CachedAsyncImage(url: urlString, targetSize: CGSize(width: width, height: 64)) {
                        shape.fill(accentColor.opacity(0.25))
                    }
                } else {
                    shape.fill(accentColor.opacity(0.25))
                        .overlay(Image(systemName: "photo").foregroundColor(accentColor))
                }
            case .remoteURL(let urlString):
                CachedAsyncImage(url: urlString, targetSize: CGSize(width: width, height: 64)) {
                    shape.fill(accentColor.opacity(0.25))
                }
            case .placeholder:
                shape.fill(accentColor.opacity(0.25))
                    .overlay(Image(systemName: "photo").foregroundColor(accentColor))
            }
        }
        .frame(width: width, height: 64)
        .clipShape(shape)
        .overlay(textObjectsOverlay(width: width))
        .overlay(shape.stroke(accentColor.opacity(0.3), lineWidth: 1))
    }

    /// Le texte composé n'est PAS visible dans le composite ThumbHash (résolution
    /// ~18×32px — les glyphes se noient dans le flou, cf. `MyStoryThumbnailResolver`
    /// doc). Contrairement au média de fond, le texte ne nécessite aucun chargement
    /// réseau : on le rejoue directement depuis `storyEffects.textObjects`, même
    /// positionnement normalisé que `SlideMiniPreview.textItem` (composer), à cette
    /// échelle miniature.
    @ViewBuilder
    private func textObjectsOverlay(width: CGFloat) -> some View {
        let size = CGSize(width: width, height: 64)
        ForEach(story.storyEffects?.textObjects ?? []) { text in
            let fontSize = max(3, CGFloat(text.fontSize) * width / CGFloat(CanvasGeometry.designWidth))
            // FIGÉ à dessein : rendu miniature fidèle du texte composé de la
            // story, mis à l'échelle proportionnellement à la largeur du
            // thumbnail (64pt). Un scaling Dynamic Type casserait la fidélité
            // visuelle du composite — ce n'est pas un libellé lisible mais un
            // aperçu graphique (cf. MyStoryThumbnailResolver).
            Text(text.text)
                .font(.system(size: fontSize, weight: .semibold))
                .foregroundColor(Color(hex: text.textColor ?? "FFFFFF"))
                .lineLimit(1)
                .shadow(color: .black.opacity(0.6), radius: 1)
                .position(x: CGFloat(text.x) * size.width, y: CGFloat(text.y) * size.height)
        }
    }

    @ViewBuilder
    private func metric(icon: String, value: Int) -> some View {
        HStack(spacing: 3) {
            Image(systemName: icon).font(MeeshyFont.relative(11))
            Text("\(value)").font(MeeshyFont.relative(13, weight: .medium))
        }
        .foregroundColor(.secondary)
    }
}

// MARK: - Active Upload Row

/// Same `StoryViewModel.StoryUploadState` the tray's `StoryUploadOverlay`
/// renders as a circular badge, shown here as a list row so it sits directly
/// above the failed-items history and the published stories — reachable even
/// while the badge's own tap is mid-upload (see `StoryUploadOverlay`'s
/// `.allowsHitTesting(isFailed)`).
private struct ActiveUploadRow: View {
    let upload: StoryViewModel.StoryUploadState
    let onRetry: () -> Void
    let onCancel: () -> Void

    private var isFailed: Bool { upload.phase.isFailed }

    private var isWaiting: Bool { upload.phase.isWaiting }

    var body: some View {
        HStack(spacing: 12) {
            Image(uiImage: upload.thumbnailImage)
                .resizable()
                .scaledToFill()
                .frame(width: 44, height: 44)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(isFailed ? MeeshyColors.error : MeeshyColors.indigo400, lineWidth: 1)
                )

            VStack(alignment: .leading, spacing: 4) {
                Text(StoryUploadPresentation.statusTitle(for: upload.phase))
                    .font(MeeshyFont.relative(15, weight: .semibold))
                if !isFailed, !isWaiting {
                    Text("\(Int(upload.progress * 100))%")
                        .font(MeeshyFont.relative(12))
                        .foregroundColor(.secondary)
                }
            }

            Spacer()

            if isFailed {
                Button(action: onRetry) {
                    Label(String(localized: "story.tray.retry", defaultValue: "Reessayer", bundle: .main), systemImage: "arrow.clockwise")
                        .font(MeeshyFont.relative(13, weight: .semibold))
                }
                .buttonStyle(.bordered)
                Button(role: .destructive, action: onCancel) {
                    Image(systemName: "xmark")
                }
                .buttonStyle(.bordered)
                .accessibilityLabel(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main))
            } else {
                ProgressView()
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Failed Story Row

/// One entry in the permanently-failed publish history
/// (`StoryPublishService.failedItems`). No rich thumbnail for the MVP — the
/// local media backing `item` is preserved on disk (so retry can reuse it)
/// but decoding a preview frame from it is a separate feature; a generic
/// warning glyph keeps this scoped to the retry/discard behavior requested.
private struct FailedStoryRow: View {
    let item: StoryPublishQueueItem
    let onRetry: () -> Void

    private var relativeTime: String {
        RelativeDateTimeFormatter().localizedString(for: item.createdAt, relativeTo: Date())
    }

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(MeeshyColors.error.opacity(0.15))
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(MeeshyColors.error)
            }
            .frame(width: 44, height: 44)

            VStack(alignment: .leading, spacing: 4) {
                Text(String(localized: "story.mine.failed.title", defaultValue: "Story non publiée"))
                    .font(MeeshyFont.relative(15, weight: .semibold))
                if let lastError = item.lastError {
                    Text(lastError)
                        .font(MeeshyFont.relative(12))
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                }
                Text(relativeTime)
                    .font(MeeshyFont.relative(11))
                    .foregroundColor(.secondary)
            }

            Spacer()

            Button(action: onRetry) {
                Label(String(localized: "story.tray.retry", defaultValue: "Reessayer", bundle: .main), systemImage: "arrow.clockwise")
                    .font(MeeshyFont.relative(13, weight: .semibold))
            }
            .buttonStyle(.bordered)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            String(
                localized: "story.mine.failed.a11y",
                defaultValue: "Story non publiée, il y a \(relativeTime). \(item.lastError ?? "")"
            )
        )
    }
}

// MARK: - Audience target

/// Story + mode en attente d'une sélection d'utilisateurs (`EXCEPT` / `ONLY`).
private struct AudienceTarget: Identifiable {
    let story: StoryItem
    let mode: PostVisibility
    var id: String { "\(story.id)-\(mode.rawValue)" }
}

// MARK: - Comments target

/// `FeedPost` résolu pour la sheet de commentaires d'une story.
private struct MyStoriesCommentTarget: Identifiable {
    let post: FeedPost
    var id: String { post.id }
}
