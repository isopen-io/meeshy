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
    @Environment(\.routerCommands) private var router
    @Environment(\.meeshyConversationList) private var conversationListViewModel

    /// Surfaces the failed-publish history (`failedItems`) in the drafts tab
    /// with resume/retry/discard — the tray badge (`StoryUploadOverlay`) is
    /// purely informative (`allowsHitTesting(false)`, directive 2026-08-01) :
    /// this panel is the ONLY action surface for failed publishes.
    @StateObject private var publishService = StoryPublishService.shared

    /// Source de vérité des exports story → photothèque en vol
    /// (`StoryPhotoSaveService.shared`), même source que le rail du lecteur
    /// (`StoryViewerView+Sidebar`) : un export lancé depuis l'une des deux
    /// surfaces progresse sur les deux. `@ObservedObject`, pas une simple
    /// lecture de `progress(for:)` — sinon la grille ne se redessinerait
    /// jamais quand la progression change.
    @ObservedObject private var saveService = StoryPhotoSaveService.shared

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

    /// I9/I10 — TOUTE suppression confirme (copies : `MyStoriesDeleteConfirmation`).
    /// Un brouillon est le dernier état local du travail ; un échec de
    /// publication en est la DERNIÈRE copie (médias locaux inclus).
    @State private var draftDeleteCandidate: StoryDraftSummary?
    @State private var failedDeleteCandidate: StoryPublishQueueItem?
    /// Reprise d'un échec en cours — verrouille les boutons « Reprendre »
    /// le temps de la copie des médias (une seule reprise à la fois).
    @State private var isResumingFailedItem = false

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

    /// Stories de l'utilisateur, plus récentes d'abord — actives ET
    /// expirées confondues (l'archive drainée par `loadMyStoriesArchive`
    /// rejoint le même groupe, cf. `StoryViewModel.loadMyStoriesArchive`).
    private var stories: [StoryItem] {
        (viewModel.storyGroupForUser(userId: userId)?.stories ?? [])
            .sorted { $0.createdAt > $1.createdAt }
    }

    /// Onglet « Publiées » : stories actives seulement — une story expirée
    /// n'est plus « publiée » au présent, elle est de l'historique.
    private var activeStories: [StoryItem] {
        stories.filter { !$0.isExpired() }
    }

    /// Onglet « Archive » : stories déjà expirées (C7a — sorties de
    /// « Publiées », où elles étaient mélangées aux stories actives).
    private var archivedStories: [StoryItem] {
        stories.filter { $0.isExpired() }
    }

    private var hasQueueWork: Bool {
        !viewModel.activeUploads.isEmpty || !publishService.failedItems.isEmpty
    }

    private var visibleTabs: [MyStoriesTab] {
        MyStoriesTabResolver.visibleTabs(hasQueueWork: hasQueueWork, hasArchivedStories: !archivedStories.isEmpty)
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
                    case .queue:     queueTab
                    case .drafts:    draftsTab
                    case .archive:   archiveTab
                    }
                }
            }
            .task {
                draftsViewModel.reload()
                // Archive complète (stories en cours ET passées) : les stories
                // ne sont plus jamais détruites — cette page liste l'historique
                // au-delà de la fenêtre de 7 j que la page du tray borne.
                await viewModel.loadMyStoriesArchive()
                guard !hasSeededTab else { return }
                hasSeededTab = true
                tab = MyStoriesTabResolver.initialTab(
                    hasPublishedStories: !activeStories.isEmpty,
                    hasQueueWork: hasQueueWork,
                    hasDraftWork: !draftsViewModel.drafts.isEmpty)
            }
            // Un onglet qui perd sa matière (dernier upload réglé, dernière
            // story expirée quittant l'archive côté serveur) ne doit jamais
            // laisser l'utilisateur planté sur un onglet devenu invisible.
            .adaptiveOnChange(of: hasQueueWork) { _, isPresent in
                if !isPresent, tab == .queue { tab = .published }
            }
            .adaptiveOnChange(of: archivedStories.isEmpty) { _, isEmpty in
                if isEmpty, tab == .archive { tab = .published }
            }
            .navigationTitle(String(localized: "story.mine.title", defaultValue: "Mes stories"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        onCreateStory()
                    } label: {
                        Image(systemName: "plus")
                            .font(.system(size: MeeshyIconSize.sm, weight: .semibold))
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
                                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                                .padding(.horizontal, MeeshySpacing.md)
                                .padding(.vertical, MeeshySpacing.xsPlus)
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
                            .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, MeeshySpacing.mdPlus)
                            .padding(.vertical, MeeshySpacing.xsPlus)
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
            // `CommentsSheetView` ne déclare plus d'`@EnvironmentObject` : son
            // chrome social passe par des EnvironmentValues, dont une feuille
            // hérite (cf. SocialChromeEnvironment.swift). Les injections
            // ci-dessous restent pour les vues internes qui en dépendraient.
            CommentsSheetView(post: target.post, accentColor: target.post.authorColor)
                .environmentObject(statusViewModel)
                .environmentObject(viewModel)
        }
        .sheet(item: $forwardStory) { story in
            ShareSheetView(
                subject: .story(
                    id: story.id,
                    authorName: AuthManager.shared.currentUser?.displayName
                        ?? AuthManager.shared.currentUser?.username ?? ""
                ),
                actions: ShareSheetHostActions(onOpenConversation: { router.navigateToConversation($0) }),
                onDismiss: { forwardStory = nil }
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
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
        .myStoriesDeleteAlerts(
            deleteCandidate: $deleteCandidate,
            draftDeleteCandidate: $draftDeleteCandidate,
            failedDeleteCandidate: $failedDeleteCandidate,
            isBulkDeleteConfirming: $isBulkDeleteConfirming,
            onConfirmDeleteStory: { story in delete(story) },
            onConfirmDeleteDraft: { draft in draftsViewModel.delete(draft.id) },
            onConfirmDeleteFailed: { item in discardFailedItem(item) },
            onConfirmBulkDelete: { bulkDelete() }
        )
    }

    /// Deux onglets COMPLÈTEMENT distincts (directive user 2026-08-01). Un
    /// `Picker` segmenté plutôt qu'un `TabView` paginé : le geste horizontal
    /// d'un `TabView` entre en concurrence avec le balayage de fermeture de la
    /// sheet, et les deux onglets y seraient instanciés en permanence.
    private var tabPicker: some View {
        Picker("", selection: $tab) {
            ForEach(visibleTabs) { tab in
                Text(tab.title).tag(tab)
            }
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.sm)
    }

    // MARK: - Onglet « Publiées »

    @ViewBuilder
    private var publishedTab: some View {
        if MyStoriesTabResolver.shouldShowEmptyState(
            tab: .published,
            hasPublishedStories: !activeStories.isEmpty,
            hasDrafts: !draftsViewModel.drafts.isEmpty,
            hasActiveUpload: !viewModel.activeUploads.isEmpty,
            hasFailedItems: !publishService.failedItems.isEmpty,
            hasArchivedStories: !archivedStories.isEmpty
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
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: MeeshySpacing.md)], spacing: MeeshySpacing.md) {
                ForEach(activeStories) { story in
                    MyStoryCard(
                        model: publishedCardModel(for: story),
                        now: Date(),
                        accentColor: accentColor,
                        isDark: isDark,
                        onOpen: { handleRowTap(story) },
                        onGlyph: { glyph in handlePublishedGlyph(glyph, for: story) },
                        moreMenu: AnyView(actionMenu(for: story)),
                        isSelecting: isSelecting,
                        isSelected: selectedStoryIDs.contains(story.id)
                    )
                    .accessibilityAction(named: String(localized: "common.delete", defaultValue: "Supprimer")) {
                        deleteCandidate = story
                    }
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.bottom, MeeshySpacing.xxl)
        }
    }

    private func publishedCardModel(for story: StoryItem) -> MyStoryCardModel {
        MyStoryCardModelRules.published(
            story,
            saveProgress: saveService.progress(for: story.id),
            saveIsCancellable: saveService.isCancellable(storyId: story.id))
    }

    private func handlePublishedGlyph(_ glyph: MyStoryGlyph, for story: StoryItem) {
        switch glyph {
        case .viewsAndReactions: viewersStory = story
        case .comments:          openComments(for: story)
        case .reactions, .more, .publish: break
        }
    }

    // MARK: - Onglet « File » (C7a — sorti de « Brouillons »)

    /// Uploads actifs + échecs de publication. Reste de la matière RÉSEAU
    /// (rien de local, contrairement à « Brouillons ») ; visible seulement
    /// quand `hasQueueWork`, donc pas d'état vide à câbler ici.
    @ViewBuilder
    private var queueTab: some View {
        if MyStoriesTabResolver.shouldShowEmptyState(
            tab: .queue,
            hasPublishedStories: !activeStories.isEmpty,
            hasDrafts: !draftsViewModel.drafts.isEmpty,
            hasActiveUpload: !viewModel.activeUploads.isEmpty,
            hasFailedItems: !publishService.failedItems.isEmpty,
            hasArchivedStories: !archivedStories.isEmpty
        ) {
            EmptyStateView(
                icon: "arrow.triangle.2.circlepath",
                title: String(localized: "story.mine.queue.empty.title", defaultValue: "Rien en file"),
                subtitle: String(localized: "story.mine.queue.empty.subtitle",
                                 defaultValue: "Vos publications en cours ou en échec apparaîtront ici.")
            )
        } else {
            queueContent
        }
    }

    private var queueContent: some View {
        ScrollView {
            VStack(spacing: MeeshySpacing.md) {
                // C5 — TOUTES les publications en cours/en attente sont
                // listées, pas seulement celle mise en avant sur l'avatar :
                // c'est la surface où l'on gère la file.
                ForEach(viewModel.activeUploads) { upload in
                    ActiveUploadRow(
                        upload: upload,
                        progress: viewModel.uploadProgress,
                        onRetry: { viewModel.retryUpload(id: upload.id) },
                        onCancel: { viewModel.cancelUpload(id: upload.id) }
                    )
                    .padding(.horizontal, MeeshySpacing.lg)
                }
                if !publishService.failedItems.isEmpty {
                    // Les échecs vivent ici : un onglet « Publiées » ne peut
                    // pas contenir du non-publié.
                    sectionHeader(String(localized: "story.mine.failed.header",
                                         defaultValue: "Échecs de publication"))
                    ForEach(publishService.failedItems) { item in
                        FailedStoryRow(
                            item: item,
                            isResuming: isResumingFailedItem,
                            onResume: { resumeFailedItem(item) },
                            onRetry: { retryFailedItem(item) }
                        )
                            .padding(.horizontal, MeeshySpacing.lg)
                            .contextMenu {
                                Button { resumeFailedItem(item) } label: {
                                    Label(Self.resumeActionTitle, systemImage: "square.and.pencil")
                                }
                                Button(role: .destructive) { failedDeleteCandidate = item } label: {
                                    Label(String(localized: "common.delete", defaultValue: "Supprimer"),
                                          systemImage: "trash")
                                }
                            }
                            .accessibilityAction(named: Self.resumeActionTitle) {
                                resumeFailedItem(item)
                            }
                            .accessibilityAction(named: String(localized: "common.delete", defaultValue: "Supprimer")) {
                                failedDeleteCandidate = item
                            }
                    }
                }
            }
            .padding(.bottom, MeeshySpacing.xxl)
        }
    }

    // MARK: - Onglet « Brouillons »

    @ViewBuilder
    private var draftsTab: some View {
        if MyStoriesTabResolver.shouldShowEmptyState(
            tab: .drafts,
            hasPublishedStories: !activeStories.isEmpty,
            hasDrafts: !draftsViewModel.drafts.isEmpty,
            hasActiveUpload: !viewModel.activeUploads.isEmpty,
            hasFailedItems: !publishService.failedItems.isEmpty,
            hasArchivedStories: !archivedStories.isEmpty
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
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: MeeshySpacing.md)], spacing: MeeshySpacing.md) {
                ForEach(draftsViewModel.drafts) { draft in
                    MyStoryCard(
                        model: draftCardModel(for: draft),
                        now: Date(),
                        accentColor: accentColor,
                        isDark: isDark,
                        onOpen: { onResumeDraft(draft.id) },
                        onGlyph: { glyph in handleDraftGlyph(glyph, for: draft) },
                        moreMenu: AnyView(draftMenu(for: draft)))
                    .accessibilityAction(named: String(localized: "common.delete", defaultValue: "Supprimer")) {
                        draftDeleteCandidate = draft
                    }
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.bottom, MeeshySpacing.xxl)
        }
    }

    // MARK: - Onglet « Archive » (C7a — sorti de « Publiées »)

    /// Stories publiées déjà expirées : le même rendu de carte que
    /// « Publiées » (`publishedCardModel`), simplement filtré sur
    /// `isExpired()` plutôt que mélangé aux stories actives.
    @ViewBuilder
    private var archiveTab: some View {
        if MyStoriesTabResolver.shouldShowEmptyState(
            tab: .archive,
            hasPublishedStories: !activeStories.isEmpty,
            hasDrafts: !draftsViewModel.drafts.isEmpty,
            hasActiveUpload: !viewModel.activeUploads.isEmpty,
            hasFailedItems: !publishService.failedItems.isEmpty,
            hasArchivedStories: !archivedStories.isEmpty
        ) {
            EmptyStateView(
                icon: "clock.arrow.circlepath",
                title: String(localized: "story.mine.archive.empty.title", defaultValue: "Aucune archive"),
                subtitle: String(localized: "story.mine.archive.empty.subtitle",
                                 defaultValue: "Vos stories expirées rejoindront cette archive.")
            )
        } else {
            archiveGrid
        }
    }

    private var archiveGrid: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: MeeshySpacing.md)], spacing: MeeshySpacing.md) {
                ForEach(archivedStories) { story in
                    MyStoryCard(
                        model: publishedCardModel(for: story),
                        now: Date(),
                        accentColor: accentColor,
                        isDark: isDark,
                        onOpen: { handleRowTap(story) },
                        onGlyph: { glyph in handlePublishedGlyph(glyph, for: story) },
                        moreMenu: AnyView(actionMenu(for: story)),
                        isSelecting: isSelecting,
                        isSelected: selectedStoryIDs.contains(story.id)
                    )
                    .accessibilityAction(named: String(localized: "common.delete", defaultValue: "Supprimer")) {
                        deleteCandidate = story
                    }
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.bottom, MeeshySpacing.xxl)
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        HStack {
            Text(title)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                .foregroundColor(.secondary)
            Spacer()
        }
        .padding(.horizontal, MeeshySpacing.lg)
    }

    private func draftCardModel(for draft: StoryDraftSummary) -> MyStoryCardModel {
        MyStoryCardModelRules.draft(
            draft,
            saveProgress: saveService.progress(for: draft.id),
            saveIsCancellable: saveService.isCancellable(storyId: draft.id))
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
                    draftDeleteCandidate = draft
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
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, MeeshySpacing.mdPlus)
                .adaptiveGlassProminent(in: Capsule(), tint: MeeshyColors.error)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.sm)
        .accessibilityLabel(String(localized: "story.mine.delete.selected",
                                    defaultValue: "Supprimer (\(selectedStoryIDs.count))"))
        .accessibilityHint(String(localized: "story.mine.delete.selected.hint",
                                   defaultValue: "Supprime définitivement les stories cochées"))
    }

    // MARK: Menu

    private func actionMenu(for story: StoryItem) -> some View {
        MyStoryActionMenu(
            story: story,
            isReposting: isReposting,
            actions: MyStoryMenuActions(
                onOpen: { onOpen(story) },
                onViewers: { viewersStory = story },
                onEdit: { onEditStory(story) },
                onSelectVisibility: { mode in selectVisibility(mode, for: story) },
                onExport: { exportStory = story },
                onForward: { forwardStory = story },
                onRepost: { repost(story) },
                onDelete: { deleteCandidate = story }))
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
                // `POST /posts/:id/republish` : la MÊME story repart avec une
                // date de publication fraîche et un engagement remis à zéro.
                // L'ancien chemin `repost` échouait STRUCTURELLEMENT ici :
                // 404 sur toute story expirée (le repost refuse un original
                // périmé) et 403 sur toute story FRIENDS (le repost exige
                // PUBLIC) — le toast d'échec était le comportement nominal.
                let post = try await StoryService.shared.republish(storyId: story.id)
                await MainActor.run {
                    isReposting = false
                    viewModel.applyRepublishedStory(post)
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

    /// Libellé unique de « Reprendre » (bouton de ligne, menu contextuel,
    /// action VoiceOver) — trois surfaces, une seule chaîne.
    static var resumeActionTitle: String {
        String(localized: "story.mine.failed.resume", defaultValue: "Reprendre")
    }

    /// Incrément 5 — « Reprendre » : convertit l'échec en brouillon éditable
    /// (orchestration dans `StoryViewModel.resumeFailedItem` : médias copiés
    /// et persistance VÉRIFIÉE avant tout retrait de l'item), puis route vers
    /// le composer par le MÊME chemin différé que les brouillons
    /// (`onResumeDraft` → followUp de la sheet → `openComposer(resumingDraftId:)`)
    /// — un fullScreenCover posé pendant que la sheet est encore ouverte
    /// entrerait en course avec elle.
    private func resumeFailedItem(_ item: StoryPublishQueueItem) {
        guard !isResumingFailedItem else { return }
        isResumingFailedItem = true
        Task {
            if let draftId = await viewModel.resumeFailedItem(item) {
                draftsViewModel.reload()
                onResumeDraft(draftId)
            }
            isResumingFailedItem = false
        }
    }

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
