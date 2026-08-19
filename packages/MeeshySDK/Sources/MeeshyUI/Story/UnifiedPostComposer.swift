import SwiftUI
import Combine
import PhotosUI
import PencilKit
import MeeshySDK

// MARK: - Unified Post Composer

public struct UnifiedPostComposer: View {
    @State private var selectedType: PostType = .post
    @State private var content = ""
    /// Handle `@…` en cours de frappe, `nil` quand il n'y en a pas. Dérivé du
    /// texte par la règle PURE partagée avec le canevas de story, jamais
    /// recopié sur place — deux extractions divergeraient au premier pseudo
    /// contenant un point.
    @State private var mentionQuery: String?
    /// Les personnes que ce post nomme, et COMMENT. Aucune n'est INLINE : le
    /// texte porte les siennes, et le serveur les en relit lui-même.
    @State private var references: [ComposerReference] = []
    @State private var showMentionPicker = false
    @State private var moodEmoji: String? = nil
    @State private var visibility = "PUBLIC"
    /// Écrite par `storyPlaceholder.onTapGesture` — plus lue par personne
    /// depuis que S6 a retiré le `.fullScreenCover` mort qui l'affichait
    /// (`selectedType` ne peut plus jamais valoir `.story` : `typeSelector`,
    /// seul point capable de le faire varier, a été retiré à la même passe,
    /// gaté par `lockedType == nil` qui ne vaut plus jamais vrai). Écriture
    /// morte inoffensive, laissée en l'état — cascade documentée au-dessus de
    /// `contentArea`.
    @State private var showStoryComposer = false
    @State private var selectedPhotoItem: PhotosPickerItem? = nil
    @State private var selectedImage: UIImage? = nil
    @State private var selectedVideoURL: URL? = nil
    @State private var isPublishing = false
    @State private var showImagePreview = false
    @State private var showVideoPreview = false

    /// Source story when in repost mode (nil for normal compose).
    @State private var repostSourceStory: StoryItem? = nil

    /// Warnings raised by the most recent reprojection from a repost source.
    /// Surfaced via `reprojectionBannerView` in the body when non-empty.
    @State private var reprojectionWarnings: [CanvasReprojector.ReprojectionWarning] = []

    /// Tracks whether the auto-import has already fired for the current
    /// repost source — prevents repeated execution on body re-evaluation.
    @State private var hasImportedRepostSource = false

    /// When non-nil, the type selector is locked to this value (B.7 = `.post`).
    private let lockedType: PostType?

    /// Test-only mirror of the repost source story. Captured at init time so tests
    /// can verify the value without traversing the `@State` storage (whose
    /// `wrappedValue` is only safe to access while the view body is being evaluated).
    /// Marked `internal` so it stays inside the package.
    internal let repostSourceForTests: StoryItem?

    @ObservedObject private var theme = ThemeManager.shared

    /// Async-throwing publish handler used internally by the Publish button.
    /// Set by every public init — the sync overloads adapt their closures into
    /// this contract so the button has a single code path that can `try await`
    /// and rollback `isPublishing` on failure.
    ///
    /// `mentions` porte les modes DÉCLARÉS (badge, note, silence) — jamais
    /// INLINE, que le serveur relit du texte. C'est `POST /posts` qui les
    /// accepte, donc ce chemin-ci et lui seul : une republication part par
    /// `POST /posts/:id/repost`, qui n'en accepte aucune (cf.
    /// `declaresReferences`).
    private let publishHandler: (PostType, String, String?, StoryEffects?, UIImage?, [PostMentionInput]) async throws -> Void

    /// Async-throwing repost-mode publish handler. Nil when not in repost mode.
    /// When set, takes precedence over `publishHandler` in the Publish button.
    /// `(contenu, story source, audience choisie)`. L'audience était le
    /// paramètre manquant : le sélecteur s'affichait mais sa valeur n'allait
    /// nulle part — tout repost sortait avec la visibilité de l'original.
    private let repostPublishHandler: ((String, StoryItem, String) async throws -> Void)?

    public var onDismiss: () -> Void

    /// Repost-mode import callback: fires once when the source story is shown
    /// inside the composer, after reprojecting its canvas items to the target
    /// post aspect ratio. Callers wire the result into their own post-canvas
    /// destination (since `UnifiedPostComposer` currently has no canvas-overlay
    /// state of its own — only the embedded reader). Nil = no-op.
    public var onStoryImported: ((RepostImportResult) -> Void)?

    // MARK: - Public initializers

    /// Initializes the composer in repost-as-post mode with an embedded story preview.
    ///
    /// - Parameters:
    ///   - story: The source `StoryItem` being reposted. Rendered inside the composer
    ///     via `StoryReaderRepresentable` so the user sees exactly what they are sharing.
    ///   - authorHandle: The original author's handle (accepted for symmetry with the
    ///     `StoryComposerViewModel` init introduced in B.6 — not displayed here because
    ///     the embedded `StoryReaderRepresentable` already shows the original story with
    ///     its locked badge and metadata).
    ///   - onPublishRepost: Sync-callback variant. Called when the user taps Publish.
    ///     Receives the typed commentary plus the source story. Use the `async throws`
    ///     variant below if your publish flow can fail and you want the composer to
    ///     re-enable the Publish button automatically.
    ///   - onStoryImported: Optional callback fired once after the source story's
    ///     canvas items are reprojected to the target post aspect ratio. Use this to
    ///     forward the structured `RepostImportResult` to whatever destination the
    ///     caller manages (post canvas, draft store, analytics).
    ///   - onDismiss: Called when the user cancels.
    public init(
        repostingStory story: StoryItem,
        authorHandle: String,
        onPublishRepost: @escaping (_ content: String, _ sourceStory: StoryItem, _ visibility: String) -> Void,
        onStoryImported: ((RepostImportResult) -> Void)? = nil,
        onDismiss: @escaping () -> Void
    ) {
        self._selectedType = State(initialValue: .post)
        self.lockedType = .post
        self._repostSourceStory = State(initialValue: story)
        self.repostSourceForTests = story
        self.repostPublishHandler = { content, source, visibility in
            onPublishRepost(content, source, visibility)
        }
        self.onStoryImported = onStoryImported
        self.onDismiss = onDismiss
        // Default no-op for the non-repost callback so existing call sites keep working.
        self.publishHandler = { _, _, _, _, _, _ in }
        _ = authorHandle
    }

    /// Repost-mode init with an `async throws` publish callback. The Publish
    /// button awaits the closure and resets `isPublishing` to `false` if it
    /// throws, so the user can retry after a transient network failure.
    public init(
        repostingStory story: StoryItem,
        authorHandle: String,
        onPublishRepost: @escaping (_ content: String, _ sourceStory: StoryItem, _ visibility: String) async throws -> Void,
        onStoryImported: ((RepostImportResult) -> Void)? = nil,
        onDismiss: @escaping () -> Void
    ) {
        self._selectedType = State(initialValue: .post)
        self.lockedType = .post
        self._repostSourceStory = State(initialValue: story)
        self.repostSourceForTests = story
        self.repostPublishHandler = onPublishRepost
        self.onStoryImported = onStoryImported
        self.onDismiss = onDismiss
        self.publishHandler = { _, _, _, _, _, _ in }
        _ = authorHandle
    }

    /// Test-only entry point for invoking the publish action without driving the
    /// SwiftUI button hierarchy. Mirrors the production publish behavior:
    /// when in repost mode, calls the repost handler; otherwise the regular one.
    /// Marked `internal` so it stays inside the package.
    internal func triggerPublishForTests(content: String) {
        if let story = repostSourceForTests, let repostPublishHandler {
            Task {
                try? await repostPublishHandler(content, story, visibility)
            }
        } else {
            Task {
                try? await publishHandler(selectedType, content, moodEmoji, nil, selectedImage, ComposerReferences.payload(references))
            }
        }
    }

    /// Test-only async variant that lets tests `await` the publish path and
    /// observe whether the handler threw. Returns `true` on success and
    /// `false` if the handler threw. Marked `internal` so it stays in-package.
    internal func triggerPublishForTestsAwaiting(content: String) async -> Bool {
        do {
            if let story = repostSourceForTests, let repostPublishHandler {
                try await repostPublishHandler(content, story, visibility)
            } else {
                try await publishHandler(selectedType, content, moodEmoji, nil, selectedImage, ComposerReferences.payload(references))
            }
            return true
        } catch {
            return false
        }
    }

    /// Test-only accessor for `isPublishing`. Reflects the live `@State` value
    /// at the moment of the call. Marked `internal` so it stays in-package.
    internal var isPublishingForTests: Bool { isPublishing }

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                contentArea
                Spacer()
                bottomBar
            }
            .background(theme.backgroundPrimary.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(String(localized: "story.post.cancel", defaultValue: "Cancel", bundle: .module)) { onDismiss() }
                        .foregroundColor(.white.opacity(0.7))
                }
                ToolbarItem(placement: .principal) {
                    Text(String(localized: "story.post.create", defaultValue: "Create", bundle: .module))
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    publishButton
                }
            }
        }
        // S6 — le cover story (`.fullScreenCover(isPresented: $showStoryComposer)`)
        // a été retiré : SUPPRIMÉ, pas juste documenté comme inerte (S3/S5
        // l'avaient déjà réduit à un no-op — `onPublishAllInBackground` figé à
        // `false`, `onPublishSlide` jamais atteint). Sa SEULE porte d'entrée
        // était `typeSelector` (retiré ci-dessus, gaté par `lockedType == nil`)
        // et `storyPlaceholder.onTapGesture` (conservé — `contentArea`/
        // `storyPlaceholder` restent inatteignables en pratique, cf. note sur
        // `showStoryComposer` ci-dessus). Sans ce cover, ce tap ne fait plus
        // que poser un `@State` que plus aucune vue ne lit — écriture morte
        // inoffensive, cohérente avec le reste de la cascade documentée.
        .adaptiveOnChange(of: content) { _, newValue in
            mentionQuery = ComposerMentionQuery.trailingHandle(in: newValue)
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: mentionQuery != nil)
        .sheet(isPresented: $showMentionPicker) {
            // Un post n'a AUCUNE couche de positionnement sur ses médias : le
            // badge n'y est pas proposé, un mode qui ne s'afficherait nulle
            // part valant moins que l'absence de l'option.
            StoryMentionPickerSheet(references: references,
                                    modes: Self.modes(forCanvas: false)) { updated in
                references = updated
            }
        }
        .adaptiveOnChange(of: selectedPhotoItem) { _, newItem in
            loadImage(from: newItem)
        }
        .fullScreenCover(isPresented: $showImagePreview) {
            if let image = selectedImage {
                MeeshyImageEditorView(image: image, context: .post) { editedImage in
                    selectedImage = editedImage
                    showImagePreview = false
                } onCancel: {
                    showImagePreview = false
                }
            }
        }
        .fullScreenCover(isPresented: $showVideoPreview) {
            if let url = selectedVideoURL {
                MeeshyVideoEditorView(
                    url: url,
                    context: .post,
                    onComplete: { result in
                        selectedVideoURL = result.url
                        showVideoPreview = false
                    },
                    onCancel: {
                        showVideoPreview = false
                    }
                )
            }
        }
    }

    // MARK: - Content Area

    /// S6 — `selectedType` is initialized to `.post` and, since the generic
    /// (non-repost) inits + `typeSelector` were removed, nothing can mutate
    /// it anymore: both surviving `repostingStory:` inits pin `lockedType`
    /// (and `selectedType`) to `.post` unconditionally. `.status`/`.story`
    /// branches below — along with `statusComposer`, `storyPlaceholder`,
    /// `moodEmojiPicker` — are therefore unreachable in practice, though the
    /// compiler cannot prove it statically. Deliberately left as compiling
    /// dead code rather than cascaded away in this pass (mandate was the
    /// generic init + `typeSelector` + the dead story cover, not a full
    /// `PostType` surface audit) — flagged here for a dedicated future pass.
    @ViewBuilder
    private var contentArea: some View {
        switch selectedType {
        case .post, .reel:
            postComposer
        case .status:
            statusComposer
        case .story:
            storyPlaceholder
        }
    }

    /// Les modes proposables selon que le contenu a un canevas ou non.
    ///
    /// PINNED n'a de sens que là où une couche de positionnement existe —
    /// aujourd'hui la seule STORY. Proposer un badge sur un POST promettrait un
    /// affichage qui n'arriverait jamais ; l'option revient quand la convergence
    /// des composers aura donné un canevas à tous les types.
    static func modes(forCanvas hasCanvas: Bool) -> [PostReferenceDisplay] {
        hasCanvas ? [.pinned, .note, .silent] : [.note, .silent]
    }

    /// Ce que l'appui long propose depuis la liste `@`. INLINE en tête, parce
    /// que c'est ce que le tap fait déjà : le nommer est ce qui rend le reste
    /// du menu compréhensible.
    static var textListModes: [PostReferenceDisplay] { [.inline] + modes(forCanvas: false) }

    /// Le mode DÉCLARÉ (badge, note, silence) n'a de destination que par
    /// `POST /posts`, seule route qui accepte `mentions`. Une republication
    /// part par `POST /posts/:id/repost`, qui n'en accepte aucune : y proposer
    /// le choix promettrait une notification que rien n'enverrait. Le texte,
    /// lui, reste offert dans les deux cas — c'est le contenu qui le porte.
    private var declaresReferences: Bool { repostSourceStory == nil }

    /// Suggestions pendant qu'un `@…` est en cours de frappe.
    ///
    /// Le champ de saisie n'en savait rien : on pouvait écrire `@alice` dans un
    /// post sans qu'aucune liste n'apparaisse (retour user 2026-08-18), donc
    /// sans jamais vérifier que le pseudo existe — et le serveur, lui, n'a rien
    /// à résoudre quand il se trompe d'une lettre.
    ///
    /// Posé SOUS le champ et non au-dessus : le composer est une page, pas une
    /// barre de conversation ; la liste suit la ligne qu'on est en train
    /// d'écrire au lieu de recouvrir ce qui précède.
    @ViewBuilder
    private var mentionSuggestions: some View {
        if let query = mentionQuery {
            mentionList(for: query)
                .background(RoundedRectangle(cornerRadius: 12).fill(theme.inputBackground))
                .padding(.horizontal, 16)
                .transition(.opacity)
        }
    }

    @ViewBuilder
    private func mentionList(for query: String) -> some View {
        if declaresReferences {
            MentionSuggestionList(query: query) { user in
                insertHandle(of: user)
            } contextMenu: { user in
                ReferenceModeMenu(modes: Self.textListModes) { mode in
                    choose(mode, for: user)
                }
            }
        } else {
            MentionSuggestionList(query: query) { user in
                insertHandle(of: user)
            }
        }
    }

    /// Tap = INLINE : comportement historique, inchangé.
    private func insertHandle(of user: UserSearchResult) {
        content = ComposerMentionQuery.replacingTrailingHandle(in: content, with: user.username)
        mentionQuery = nil
    }

    private func choose(_ mode: PostReferenceDisplay, for user: UserSearchResult) {
        // Le fragment en cours de frappe (`@ali`) est d'abord complété : c'est
        // la seule forme que la règle de retrait sache reconnaître, et les deux
        // règles pures se composent ainsi sans qu'aucune ne connaisse l'autre.
        let inserted = ComposerMentionQuery.replacingTrailingHandle(in: content, with: user.username)
        if mode == .inline {
            content = inserted
        } else {
            // Tout sauf INLINE retire le `@handle` du texte : c'est exactement
            // l'intérêt du geste.
            content = ComposerReferences.removingHandle(user.username, from: inserted)
            references = ReferencePickerLogic.apply(
                .choose(mode), username: user.username, userId: user.id,
                to: references, context: .textList
            )
        }
        mentionQuery = nil
    }

    private var postComposer: some View {
        // Valeurs `@MainActor` hissées hors de la closure de label `PhotosPicker`
        // (inférée `@Sendable`) en constantes Sendable — voir
        // `ConversationSettingsView.visualSection`.
        let mediaPickerLabel = String(localized: "story.post.media", defaultValue: "Média", bundle: .module)
        let mediaPickerColor = theme.textSecondary
        return VStack(spacing: 12) {
            TextField(String(localized: "story.post.whatOnYourMind", defaultValue: "What's on your mind?", bundle: .module), text: $content, axis: .vertical)
                .font(.system(size: 16))
                .foregroundColor(theme.textPrimary)
                .lineLimit(3...12)
                .padding(16)

            mentionSuggestions

            if let story = repostSourceStory {
                // Repost mode: embed the source story canvas instead of the
                // image-attachment slot. The composer is interactive, so audio
                // is desired (mute=false).
                StoryReaderRepresentable(story: story, mute: false)
                    .aspectRatio(9.0 / 16.0, contentMode: .fit)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal, 16)
                    .onAppear {
                        autoImportFromRepostSource(story)
                    }

                reprojectionBannerView

                HStack(spacing: 16) {
                    visibilityPicker
                    Spacer()
                }
                .padding(.horizontal, 16)
            } else {
                if let image = selectedImage {
                    imagePreview(image)
                } else if let videoURL = selectedVideoURL {
                    videoPreview(videoURL)
                }

                HStack(spacing: 16) {
                    PhotosPicker(selection: $selectedPhotoItem, matching: .any(of: [.images, .videos])) {
                        Label(mediaPickerLabel, systemImage: "photo.on.rectangle")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(mediaPickerColor)
                    }

                    mentionChip
                    visibilityPicker
                    Spacer()
                }
                .padding(.horizontal, 16)

                referenceRow
            }
        }
    }

    /// La seconde porte : nommer quelqu'un SANS l'écrire. La première reste la
    /// frappe `@`, dont la liste sert le même choix.
    @ViewBuilder
    private var mentionChip: some View {
        if declaresReferences {
            Button {
                showMentionPicker = true
                HapticFeedback.light()
            } label: {
                Label(String(localized: "reference.sheet.title", defaultValue: "Mentionner", bundle: .module),
                      systemImage: "at")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(theme.textSecondary)
            }
            .buttonStyle(.plain)
        }
    }

    /// L'unique état visible des références, quel que soit le nombre de modes
    /// en jeu — et le seul endroit d'où une SILENCIEUSE se voit, donc le seul
    /// d'où elle se retire.
    @ViewBuilder
    private var referenceRow: some View {
        if !references.isEmpty {
            HStack {
                ReferenceChipRow(references: references,
                                 accentColor: MeeshyColors.indigo500) {
                    showMentionPicker = true
                }
                Spacer()
            }
            .padding(.horizontal, 16)
        }
    }

    // MARK: - Repost reprojection banner

    @ViewBuilder
    private var reprojectionBannerView: some View {
        if !reprojectionWarnings.isEmpty {
            HStack(spacing: 8) {
                Image(systemName: "rectangle.and.text.magnifyingglass")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(MeeshyColors.warning)
                Text(String(format: String(localized: "story.repost.reprojected",
                                           defaultValue: "%d item(s) repositioned for the new aspect ratio",
                                           bundle: .module),
                           reprojectionWarnings.count))
                    .font(.system(size: 13))
                    .foregroundColor(theme.textSecondary)
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(MeeshyColors.warning.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .padding(.horizontal, 16)
            .accessibilityElement(children: .combine)
        }
    }

    /// Auto-imports the repost source story's canvas items into the composer
    /// the first time the embedded reader appears. Drops out early on
    /// subsequent invocations to avoid re-firing the callback. The composer
    /// itself has no canvas-overlay state — the structured `RepostImportResult`
    /// is forwarded to `onStoryImported` so callers can wire it into their own
    /// destination (post canvas, draft store, analytics).
    private func autoImportFromRepostSource(_ story: StoryItem) {
        guard !hasImportedRepostSource else { return }
        hasImportedRepostSource = true
        let payload = story.extractRepostPayload()
        let result = importFromStory(payload)
        reprojectionWarnings = result.warnings
        onStoryImported?(result)
    }

    private var statusComposer: some View {
        VStack(spacing: 16) {
            moodEmojiPicker
            TextField(String(localized: "story.post.howFeeling", defaultValue: "How are you feeling?", bundle: .module), text: $content, axis: .vertical)
                .font(.system(size: 16))
                .foregroundColor(theme.textPrimary)
                .lineLimit(2...4)
                .padding(.horizontal, 16)

            mentionSuggestions
            HStack(spacing: 16) {
                mentionChip
                visibilityPicker
                Spacer()
            }
            .padding(.horizontal, 16)

            referenceRow
        }
        .padding(.top, 16)
    }

    private var storyPlaceholder: some View {
        VStack(spacing: 12) {
            Image(systemName: "camera.fill")
                .font(.system(size: 40))
                .foregroundColor(.white.opacity(0.3))
            Text(String(localized: "story.post.tapStoryEditor", defaultValue: "Tap to open Story Editor", bundle: .module))
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .onTapGesture {
            showStoryComposer = true
        }
    }

    // MARK: - Image Preview

    private func imagePreview(_ image: UIImage) -> some View {
        ZStack(alignment: .topTrailing) {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(height: 200)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal, 16)
                .contentShape(Rectangle())
                .onTapGesture {
                    showImagePreview = true
                }

            Button {
                selectedImage = nil
                selectedPhotoItem = nil
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 22))
                    .foregroundColor(.white)
                    .shadow(radius: 4)
            }
            .padding(.trailing, 24)
            .padding(.top, 8)
        }
    }

    // MARK: - Mood Emoji Picker

    private var moodEmojiPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(moodEmojis, id: \.self) { emoji in
                    Button {
                        withAnimation(.spring(response: 0.2)) { moodEmoji = emoji }
                        HapticFeedback.light()
                    } label: {
                        Text(emoji)
                            .font(.system(size: 32))
                            .scaleEffect(moodEmoji == emoji ? 1.2 : 1)
                            .background(
                                Circle()
                                    .fill(moodEmoji == emoji ? Color(hex: "6366F1").opacity(0.2) : Color.clear)
                                    .frame(width: 50, height: 50)
                            )
                    }
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private var moodEmojis: [String] {
        ["\u{1F60A}", "\u{1F60E}", "\u{1F60D}", "\u{1F622}", "\u{1F621}", "\u{1F92F}", "\u{1F973}", "\u{1F634}",
         "\u{1F914}", "\u{1F60B}", "\u{1F4AA}", "\u{1F525}", "\u{2764}\u{FE0F}", "\u{1F31F}", "\u{1F389}"]
    }

    // MARK: - Visibility Picker

    private var visibilityPicker: some View {
        Menu {
            Button { visibility = "PUBLIC" } label: { Label(String(localized: "story.post.public", defaultValue: "Public", bundle: .module), systemImage: "globe") }
            Button { visibility = "FRIENDS" } label: { Label(String(localized: "story.post.friends", defaultValue: "Friends", bundle: .module), systemImage: "person.2") }
            Button { visibility = "PRIVATE" } label: { Label(String(localized: "story.post.private", defaultValue: "Private", bundle: .module), systemImage: "lock") }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: visibilityIcon)
                    .font(.system(size: 12))
                Text(visibility.capitalized)
                    .font(.system(size: 12, weight: .medium))
            }
            .foregroundColor(theme.textSecondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Capsule().fill(Color.white.opacity(0.08)))
        }
    }

    private var visibilityIcon: String {
        switch visibility {
        case "FRIENDS": return "person.2"
        case "PRIVATE": return "lock"
        default: return "globe"
        }
    }

    // MARK: - Bottom Bar

    private var bottomBar: some View {
        Divider()
            .overlay(Color.white.opacity(0.1))
    }

    // MARK: - Publish Button

    private var publishButton: some View {
        Button {
            guard canPublish else { return }
            guard !isPublishing else { return }
            isPublishing = true
            HapticFeedback.success()
            let typedContent = content
            let typedVisibility = visibility
            let typedType = selectedType
            let typedMood = moodEmoji
            let typedImage = selectedImage
            let typedMentions = ComposerReferences.payload(references)
            Task { @MainActor in
                do {
                    if let story = repostSourceStory, let repostPublishHandler {
                        try await repostPublishHandler(typedContent, story, typedVisibility)
                    } else {
                        try await publishHandler(typedType, typedContent, typedMood, nil, typedImage, typedMentions)
                    }
                    // On success, the caller typically dismisses the sheet via
                    // `onDismiss` — we still reset the flag defensively so that
                    // any caller that keeps the sheet open lands in a clean
                    // state (canPublish && !isPublishing).
                    isPublishing = false
                } catch {
                    // Rollback so the user can retry. The caller is responsible
                    // for surfacing the error (toast, banner, etc).
                    isPublishing = false
                }
            }
        } label: {
            Text(String(localized: "story.post.publish", defaultValue: "Post", bundle: .module))
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(canPublish ? .white : .white.opacity(0.5))
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
                .background(
                    Capsule().fill(canPublish
                        ? LinearGradient(colors: [Color(hex: "6366F1"), Color(hex: "4338CA")], startPoint: .leading, endPoint: .trailing)
                        : LinearGradient(colors: [Color.gray.opacity(0.3)], startPoint: .leading, endPoint: .trailing)
                    )
                )
        }
        .disabled(!canPublish || isPublishing)
    }

    private var canPublish: Bool {
        switch selectedType {
        case .post: return !content.isEmpty
        case .reel:
            // Règle produit 2026-08-02 : un REEL exige une composition
            // qualifiante (vidéo || audio || >= 2 images). Ce composer ne porte
            // qu'UNE image ou UNE vidéo — seule la vidéo peut qualifier ; une
            // image seule ou du texte seul ne publie jamais un réel. (.reel est
            // aujourd'hui inatteignable ici — S6 : `lockedType` épingle .post —
            // mais le prédicat ne doit pas mentir si la surface rouvre.)
            return selectedVideoURL != nil
        case .status: return moodEmoji != nil
        case .story: return true
        }
    }

    // MARK: - Video Preview

    private func videoPreview(_ url: URL) -> some View {
        ZStack(alignment: .topTrailing) {
            ZStack {
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.white.opacity(0.05))
                    .frame(height: 200)
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 48))
                    .foregroundColor(.white.opacity(0.7))
            }
            .padding(.horizontal, 16)
            .contentShape(Rectangle())
            .onTapGesture {
                showVideoPreview = true
            }

            Button {
                selectedVideoURL = nil
                selectedPhotoItem = nil
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 22))
                    .foregroundColor(.white)
                    .shadow(radius: 4)
            }
            .padding(.trailing, 24)
            .padding(.top, 8)
        }
    }

    // MARK: - Media Loading

    private func loadImage(from item: PhotosPickerItem?) {
        guard let item else { return }
        let isVideo = item.supportedContentTypes.contains { $0.conforms(to: .movie) }
        Task {
            if isVideo {
                if let data = try? await item.loadTransferable(type: Data.self) {
                    let tempURL = FileManager.default.temporaryDirectory
                        .appendingPathComponent("post_video_\(UUID().uuidString).mp4")
                    try? data.write(to: tempURL)
                    await MainActor.run {
                        selectedImage = nil
                        selectedVideoURL = tempURL
                    }
                }
            } else {
                if let data = try? await item.loadTransferable(type: Data.self),
                   let image = UIImage(data: data) {
                    await MainActor.run {
                        selectedVideoURL = nil
                        selectedImage = image
                    }
                }
            }
        }
    }
}

// MARK: - Story import (Phase 5 RepostPayload)

/// Structured result of reprojecting a RepostPayload to a target canvas size.
/// All collections are already reprojected to the target's [0,1] normalized
/// coordinate space (with center-anchored scale) and clamped into bounds when
/// necessary. `warnings` lists each item that was clamped so the composer can
/// surface a discreet banner inviting the user to fine-tune positioning.
public struct RepostImportResult: Sendable {
    public let texts: [StoryTextObject]
    public let media: [StoryMediaObject]
    public let stickers: [StorySticker]
    public let drawingData: Data?
    public let audios: [StoryAudioPlayerObject]
    public let locations: [StoryLocationObject]
    public let warnings: [CanvasReprojector.ReprojectionWarning]
    public let targetSize: CGSize

    public var hasClampedItems: Bool { !warnings.isEmpty }
}

extension UnifiedPostComposer {
    /// Reprojects all canvas objects from `payload` to `targetSize`.
    /// Returns the full reprojected items plus the list of clamping warnings.
    /// Audio objects are pass-through (no spatial position).
    /// The composer's body uses this via `.onAppear` in repost mode to populate
    /// the `reprojectionWarnings` banner state and invoke `onStoryImported` so
    /// the caller can wire the imported items into its own destination.
    public func importFromStory(_ payload: RepostPayload,
                                targetSize: CGSize = CGSize(width: 1080, height: 1080))
        -> RepostImportResult {
        let projector = CanvasReprojector(from: payload.sourceCanvasSize, to: targetSize)
        var warnings: [CanvasReprojector.ReprojectionWarning] = []
        var texts: [StoryTextObject] = []
        var media: [StoryMediaObject] = []
        var stickers: [StorySticker] = []
        var drawingData: Data? = nil
        var audios: [StoryAudioPlayerObject] = []
        var locations: [StoryLocationObject] = []

        for t in payload.textObjects {
            let r = projector.reproject(text: t)
            texts.append(r.value)
            if let w = r.warning { warnings.append(w) }
        }
        for m in payload.mediaObjects {
            let r = projector.reproject(media: m)
            media.append(r.value)
            if let w = r.warning { warnings.append(w) }
        }
        for s in payload.stickers {
            let r = projector.reproject(sticker: s)
            stickers.append(r.value)
            if let w = r.warning { warnings.append(w) }
        }
        if let data = payload.drawingData {
            let r = projector.reproject(drawingData: data)
            drawingData = r.value?.dataRepresentation()
            if let w = r.warning { warnings.append(w) }
        }
        for a in payload.audioPlayerObjects {
            // audio reprojection is identity (no spatial position)
            audios.append(projector.reproject(audio: a).value)
        }
        for l in payload.locationObjects {
            let r = projector.reproject(location: l)
            locations.append(r.value)
            if let w = r.warning { warnings.append(w) }
        }

        return RepostImportResult(
            texts: texts,
            media: media,
            stickers: stickers,
            drawingData: drawingData,
            audios: audios,
            locations: locations,
            warnings: warnings,
            targetSize: targetSize
        )
    }
}
