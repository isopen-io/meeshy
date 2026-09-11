import SwiftUI
import PhotosUI
import AVFoundation
import Combine
import MeeshySDK
import MeeshyUI

// **La feuille PLEIN ÉCRAN du composer du fil** (#6040).
//
// Elle vivait dans `FeedView+Attachments.swift` — un fichier qui annonce une
// EXTENSION de `FeedView` et qui en contenait, pour l'essentiel, tout autre
// chose : 1 136 lignes de feuille contre 199 d'extension. Le retrait du
// composer inline mort (#6016) a fait tomber ce fichier de 2 018 à 1 391
// lignes, toujours au-dessus du plafond dur de 1 200 : il ne POUVAIT pas
// suffire, parce que ce qui restait n'était pas gros par accident mais DEUX
// choses dans un même fichier.
//
// **Le retrait de la feuille, lui, reste INTERDIT** tant que cinq capacités
// n'ont pas rejoint le meuble — progression, références, dépôt, éditeur
// d'image, son emprunté. `FeedComposerSheetRetirementInventoryTests` les tient
// nommément, et sait désormais QUEL fichier porte chaque ancre : quatre ici,
// une restée dans l'extension (`feedDeclaredReferences`, que les deux
// publications audio survivantes lisent).

// MARK: - Feed Composer Sheet (Fullscreen from ThemedFeedOverlay)
struct FeedComposerSheet: View {
    @ObservedObject var viewModel: FeedViewModel
    let initialText: String
    let pendingAttachmentType: String?
    var quotePost: FeedPost? = nil
    let onDismiss: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @ObservedObject private var authManager = AuthManager.shared
    @State private var composerText = ""
    @FocusState private var isFocused: Bool
    @State private var editingAttachmentId: String?
    @State private var videosToPreview: [URL] = []
    @State private var editingVideoURL: URL?

    @State private var pendingAttachments: [MessageAttachment] = []
    /// Lieu choisi via le picker, en attente d'envoi (Task 11/12,
    /// 2026-07-29) — `SharedPlace` porte le nom, `MessageAttachment.location`
    /// ne le portait pas et n'est plus le véhicule.
    @State private var pendingPlace: SharedPlace? = nil
    /// Le SECOND opt-in de position (spec du 2026-08-02 §2), jumeau de celui
    /// du composer en ligne de `FeedView` — même règle, même composant, deux
    /// hôtes. La feuille étant démontée à la publication, il n'y a rien à
    /// remettre à zéro ici : l'état repart `.disabled` à chaque ouverture.
    @State private var nearbyDiscoverability: NearbyDiscoverabilityChoice = .disabled
    @State private var pendingMediaFiles: [String: URL] = [:]
    @State private var pendingThumbnails: [String: UIImage] = [:]
    @State private var pendingAudioURL: URL?
    @State private var preparingAttachments: [PreparingAttachment] = []
    @State private var showPhotoPicker = false
    @State private var selectedPhotoItems: [PhotosPickerItem] = []
    @State private var showCamera = false
    @State private var showFilePicker = false
    @State private var showLocationPicker = false
    @State private var isUploading = false
    @State private var uploadProgress: UploadQueueProgress?
    @State private var isLoadingMedia = false
    @State private var postVisibility: String = "PUBLIC"
    /// Audience nommée de la publication en cours (EXCEPT/ONLY) et le
    /// sélecteur de personnes qui la remplit. Vides tant que l'auteur reste
    /// sur une visibilité qui n'en demande pas.
    @State private var postVisibilityUserIds: [String] = []
    @State private var audiencePickerMode: PostVisibility? = nil

    /// La visibilité choisie, relue comme un mode du modèle — un `rawValue`
    /// inconnu (état corrompu) retombe sur PUBLIC, le défaut produit.
    private var selectedPostVisibility: PostVisibility {
        PostVisibility(rawValue: postVisibility) ?? .public
    }

    /// EXCEPT sans exclus = privé fantôme ; ONLY sans inclus = invisible pour
    /// tous. Le gateway les REFUSE (`CreatePostSchema`) : mieux vaut retenir
    /// l'envoi ici que le laisser échouer après coup.
    private var postAudienceIncomplete: Bool {
        selectedPostVisibility.requiresUserSelection && postVisibilityUserIds.isEmpty
    }

    /// A QUALIFYING composition (video || audio || >= 2 images —
    /// `ReelComposition.qualifiesAsReel`) defaults to a REEL; the author can
    /// flip this to keep it a plain POST. A non-qualifying composition (single
    /// image, documents) is ALWAYS a POST — the toggle hides and
    /// `defaultType` ignores this flag.
    @State private var forcePlainPost = false
    @State private var showEmojiPicker = false
    @State private var showAudioComposer = false
    @State private var composerLanguage: String = DefaultComposerLanguage.resolve()
    @State private var showLanguagePicker = false
    /// Les personnes que ce post nomme SANS que son texte le dise. Aucune n'est
    /// INLINE : celles-là, le serveur les relit du contenu lui-même.
    @State private var references: [ComposerReference] = []

    /// Une citation part par `POST /posts/:id/repost`, qui n'accepte aucune
    /// `mentions` : y proposer le choix promettrait une notification que rien
    /// n'enverrait.
    private var declaresReferences: Bool { quotePost == nil }

    private var composerLanguageDisplayName: String {
        let name = Locale.current.localizedString(forLanguageCode: composerLanguage) ?? composerLanguage
        return name.prefix(1).uppercased() + name.dropFirst()
    }

    private var hasContent: Bool {
        // pendingPlace inclus : sinon le bouton Publier reste desactive pour une
        // position seule et publishPost() (dont le garde autorise deja ce cas)
        // ne devient jamais atteignable (Task 13, 2026-07-29).
        !composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !pendingAttachments.isEmpty || pendingPlace != nil
    }

    /// Reel ⇄ Post chip shown when the composition QUALIFIES as a reel (video
    /// || audio || >= 2 images). Tapping flips it to a plain post so it stays
    /// out of the reels surface.
    private var reelTypeToggle: some View {
        Button {
            forcePlainPost.toggle()
            HapticFeedback.light()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: forcePlainPost ? "doc.text" : "play.rectangle.on.rectangle.fill")
                    .font(MeeshyFont.relative(10))
                Text(forcePlainPost
                    ? String(localized: "feed.composer.type.post", defaultValue: "Publier", bundle: .main)
                    : String(localized: "feed.composer.type.reel", defaultValue: "Réel", bundle: .main))
                    .font(MeeshyFont.relative(12))
            }
            .foregroundColor(forcePlainPost ? theme.textMuted : MeeshyColors.indigo300)
        }
        .accessibilityHint(String(localized: "feed.composer.type.hint", defaultValue: "Bascule entre réel et post", bundle: .main))
        .padding(.leading, 12)
    }

    var body: some View {
        ZStack {
            theme.backgroundPrimary.ignoresSafeArea()

            VStack(spacing: 0) {
                // Header
                HStack {
                    Button {
                        cleanupAndDismiss()
                    } label: {
                        Text(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main))
                            .font(MeeshyFont.relative(15, weight: .medium))
                            .foregroundColor(theme.textSecondary)
                    }

                    Spacer()

                    Text(String(localized: "feed.post.composer.title", defaultValue: "Nouveau post", bundle: .main))
                        .font(MeeshyFont.relative(16, weight: .bold))
                        .foregroundColor(theme.textPrimary)

                    Spacer()

                    Button {
                        publishPost()
                    } label: {
                        if isUploading {
                            ProgressView()
                                .tint(MeeshyColors.indigo300)
                                .scaleEffect(0.8)
                        } else {
                            Text(String(localized: "feed.post.composer.publish", defaultValue: "Publier", bundle: .main))
                                .font(MeeshyFont.relative(15, weight: .bold))
                                .foregroundColor(hasContent ? MeeshyColors.indigo300 : theme.textMuted)
                        }
                    }
                    .disabled(!hasContent || isUploading || postAudienceIncomplete)
                }
                .padding(16)
                .background(theme.backgroundSecondary)

                Divider().background(theme.inputBorder)

                // User row
                HStack(spacing: 12) {
                    MeeshyAvatar(
                        name: getUserDisplayName(authManager.currentUser, fallback: "M"),
                        context: .feedComposer,
                        avatarURL: authManager.currentUser?.avatar
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(getUserDisplayName(authManager.currentUser, fallback: String(localized: "feed.composer.me", defaultValue: "Moi", bundle: .main)))
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(theme.textPrimary)

                        // Les SIX audiences du modèle, comme le composer story
                        // et l'éditeur : trois d'entre elles (COMMUNITY,
                        // EXCEPT, ONLY) étaient inatteignables à la création
                        // d'un post — offertes ailleurs, refusées ici.
                        Menu {
                            ForEach(PostVisibility.allCases) { mode in
                                Button {
                                    postVisibility = mode.rawValue
                                    // Un consentement de découvrabilité ne
                                    // survit pas à un resserrement d'audience
                                    // qu'il ne couvrait pas : le contrôle
                                    // disparaît hors PUBLIC, et un opt-in
                                    // resté ouvert derrière lui repartirait
                                    // au prochain élargissement sans que
                                    // personne ne l'ait réexaminé.
                                    if mode != .public {
                                        nearbyDiscoverability.reset()
                                    }
                                    if mode.requiresUserSelection {
                                        audiencePickerMode = mode
                                    } else {
                                        postVisibilityUserIds = []
                                    }
                                } label: {
                                    Label(mode.label, systemImage: mode.icon)
                                }
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: selectedPostVisibility.icon)
                                    .font(MeeshyFont.relative(10))
                                Text(selectedPostVisibility.label)
                                    .font(MeeshyFont.relative(12))
                            }
                            .foregroundColor(theme.textMuted)
                        }
                        .sheet(item: $audiencePickerMode) { mode in
                            AudienceUserPickerView(mode: mode, initialSelection: postVisibilityUserIds) { ids in
                                postVisibilityUserIds = ids
                            }
                        }
                    }
                    // Toggle visible SEULEMENT quand la composition qualifie
                    // (règle produit 2026-08-02 + directive durée minimale).
                    // Retirer une image (2→1) le fait disparaître et
                    // `defaultType` retombe sur POST — aucun REEL 1-image
                    // publiable, ni une vidéo/audio de moins de 3s.
                    if ReelComposition.qualifiesAsReel(
                        mimeTypes: pendingAttachments.map(\.mimeType)
                            + (pendingAudioURL != nil ? ["audio/mp4"] : []),
                        durationsMs: pendingAttachments.map(\.duration)
                    ) {
                        reelTypeToggle
                    }
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)

                // Text editor
                ZStack(alignment: .topLeading) {
                    if composerText.isEmpty {
                        Text(String(localized: "feed.post.composer.placeholder", defaultValue: "Qu'avez-vous en tête ?", bundle: .main))
                            .font(MeeshyFont.relative(17))
                            .foregroundColor(theme.textMuted)
                            .padding(.horizontal, 16)
                            .padding(.top, 12)
                    }
                    TextEditor(text: $composerText)
                        .focused($isFocused)
                        .scrollContentBackground(.hidden)
                        .foregroundColor(theme.textPrimary)
                        .font(MeeshyFont.relative(17))
                        .frame(minHeight: 120)
                        .padding(.horizontal, 12)
                        .padding(.top, 4)
                }

                // Première porte : la frappe `@`. Posée SOUS le champ — la
                // liste suit la ligne qu'on écrit au lieu de recouvrir ce qui
                // précède.
                if declaresReferences {
                    ReferenceMentionSuggestions(text: $composerText,
                                                references: $references,
                                                background: theme.inputBackground)
                        .padding(.horizontal, 16)
                }

                // Quoted post preview
                if let quoted = quotePost {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 8) {
                            MeeshyAvatar(
                                name: quoted.author,
                                context: .postComment,
                                accentColor: quoted.authorColor,
                                avatarURL: quoted.authorAvatarURL
                            )
                            Text(quoted.author)
                                .font(MeeshyFont.relative(13, weight: .semibold))
                                .foregroundColor(theme.accentText(quoted.authorColor))
                            MetaSeparator().foregroundColor(theme.textMuted)
                            Text(quoted.timestamp, style: .relative)
                                .font(MeeshyFont.relative(11))
                                .foregroundColor(theme.textMuted)
                        }
                        Text(quoted.displayContent)
                            .font(MeeshyFont.relative(14))
                            .foregroundColor(theme.textSecondary)
                            .lineLimit(4)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(theme.surfaceGradient(tint: quoted.authorColor))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(theme.border(tint: quoted.authorColor, intensity: 0.2), lineWidth: 1)
                            )
                    )
                    .padding(.horizontal, 16)
                }

                // Pending attachments
                if !pendingAttachments.isEmpty || !preparingAttachments.isEmpty || isLoadingMedia || pendingPlace != nil {
                    sheetAttachmentsRow
                }

                if offersNearbyDiscoverability {
                    NearbyDiscoverabilityControl(
                        choice: $nearbyDiscoverability,
                        accentColor: MeeshyColors.brandPrimaryHex,
                        placeName: MediaKindLabel.placeTitle(name: pendingPlace?.name, address: pendingPlace?.address),
                        offersDiscoverability: true,
                        onRemovePlace: { pendingPlace = nil }
                    )
                    .padding(.horizontal, 16)
                    .padding(.bottom, 10)
                }

                // Upload progress
                if isUploading, let progress = uploadProgress {
                    UploadProgressBar(progress: progress, accentColor: MeeshyColors.brandPrimaryHex)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 4)
                }

                Spacer(minLength: 0)

                // Seconde porte, plus l'unique état visible des références —
                // donc le seul endroit d'où une SILENCIEUSE se voit, et le seul
                // d'où elle se retire.
                if declaresReferences {
                    ReferenceComposerBar(references: $references,
                                         accentColor: MeeshyColors.indigo500)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 4)
                }

                // Toolbar
                HStack(spacing: 16) {
                    Button { showPhotoPicker = true; HapticFeedback.light() } label: {
                        Image(systemName: "photo.fill")
                            .font(.system(size: 20))
                            .foregroundColor(MeeshyColors.brandPrimary)
                    }
                    .accessibilityLabel(String(localized: "feed.attach.photo", defaultValue: "Ajouter une photo"))
                    Button { showCamera = true; HapticFeedback.light() } label: {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 20))
                            .foregroundColor(MeeshyColors.error)
                    }
                    .accessibilityLabel(String(localized: "feed.attach.take-photo", defaultValue: "Prendre une photo"))
                    Button { showEmojiPicker = true; HapticFeedback.light() } label: {
                        Image(systemName: "face.smiling.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(hex: "F8B500"))
                    }
                    .accessibilityLabel(String(localized: "feed.attach.emoji", defaultValue: "Ajouter un emoji"))
                    Button { showFilePicker = true; HapticFeedback.light() } label: {
                        Image(systemName: "doc.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(hex: "9B59B6"))
                    }
                    .accessibilityLabel(String(localized: "feed.attach.file", defaultValue: "Joindre un fichier"))
                    Button { showLocationPicker = true; HapticFeedback.light() } label: {
                        Image(systemName: "location.fill")
                            .font(.system(size: 20))
                            .foregroundColor(MeeshyColors.success)
                    }
                    .accessibilityLabel(String(localized: "feed.attach.location", defaultValue: "Partager la position"))
                    Button { showAudioComposer = true; HapticFeedback.light() } label: {
                        Image(systemName: "mic.fill")
                            .font(.system(size: 20))
                            .foregroundColor(MeeshyColors.errorStrong)
                    }
                    .accessibilityLabel(String(localized: "feed.attach.record-audio", defaultValue: "Enregistrer un audio"))

                    Spacer()

                    Button {
                        showLanguagePicker = true
                        HapticFeedback.light()
                    } label: {
                        Text(ComposerLanguageFlag.label(for: composerLanguage))
                            .font(MeeshyFont.relative(13, weight: .semibold))
                            .foregroundColor(MeeshyColors.indigo500)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(
                                Capsule()
                                    .fill(MeeshyColors.indigo100.opacity(isDark ? 0.15 : 1))
                                    .overlay(
                                        Capsule()
                                            .stroke(MeeshyColors.indigo300.opacity(0.3), lineWidth: 1)
                                    )
                            )
                    }
                    .accessibilityLabel(String(localized: "feed.post.language", defaultValue: "Langue du post"))
                    .accessibilityValue(composerLanguageDisplayName)
                }
                .padding(16)
                .background(theme.backgroundSecondary)
            }
        }
        // Cible de dépôt de la recette commune (Lot 1) : la feuille EST le
        // composer, la bande couvre donc tout son contenu. Même modificateur
        // que `UniversalComposerBar.body` — affordance et résolution partagées.
        .modifier(ComposerDropTargetModifier(
            accentColor: MeeshyColors.brandPrimaryHex,
            onIngest: { handleSheetComposerIngest($0) }
        ))
        .sheet(isPresented: $showAudioComposer) {
            AudioPostComposerView(
                onPublish: { audioURL, mimeType, durationMs, transcription in
                    showAudioComposer = false
                    Task {
                        await publishAudioFromSheet(audioURL: audioURL, mimeType: mimeType, durationMs: durationMs, transcription: transcription)
                    }
                },
                onPublishBorrowed: { sound, _ in
                    showAudioComposer = false
                    Task { await publishBorrowedSoundFromSheet(sound) }
                }
            )
        }
        .sheet(isPresented: $showLanguagePicker) {
            AudioLanguagePickerView(
                selectedLocale: Binding(
                    get: { Locale(identifier: composerLanguage) },
                    set: { newLocale in
                        let langCode = newLocale.language.languageCode?.identifier ?? newLocale.identifier
                        composerLanguage = langCode
                    }
                )
            )
        }
        .photosPicker(isPresented: $showPhotoPicker, selection: $selectedPhotoItems, maxSelectionCount: 10, matching: .any(of: [.images, .videos]))
        .fileImporter(isPresented: $showFilePicker, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            handleFileImport(result)
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraView { result in
                switch result {
                // Sixième et septième consommateurs de `CameraResult.photo`,
                // élargi le 2026-09-04 pour porter l'EXIF (#4080). Le fil du
                // feed ré-encode déjà l'image : les octets d'origine ne lui
                // servent pas, et il les jette explicitement.
                case .photo(let image, _):
                    handleCameraCapture(image)
                case .video(let url):
                    handleCameraVideo(url)
                }
            }
            .ignoresSafeArea()
        }
        .sheet(isPresented: $showLocationPicker) {
            LocationPickerView(accentColor: MeeshyColors.brandPrimaryHex) { place in
                handleLocationSelection(place)
            }
        }
        .fullScreenCover(item: Binding<EditingAttachmentItem?>(
            get: {
                guard let id = editingAttachmentId, let image = pendingThumbnails[id] else { return nil }
                return EditingAttachmentItem(id: id, image: image)
            },
            set: { editingAttachmentId = $0?.id }
        )) { item in
            MeeshyImageEditorView(image: item.image, context: .post) { editedImage in
                pendingThumbnails[item.id] = editedImage
                Task {
                    let result = await MediaCompressor.shared.compressImage(editedImage)
                    let fileName = "edited_\(UUID().uuidString).\(result.fileExtension)"
                    let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
                    try? result.data.write(to: tempURL)
                    await MainActor.run {
                        if let oldURL = pendingMediaFiles[item.id] {
                            try? FileManager.default.removeItem(at: oldURL)
                        }
                        pendingMediaFiles[item.id] = tempURL
                        if let idx = pendingAttachments.firstIndex(where: { $0.id == item.id }) {
                            pendingAttachments[idx] = MessageAttachment(
                                id: item.id,
                                fileName: fileName,
                                originalName: fileName,
                                mimeType: result.mimeType,
                                fileSize: result.data.count,
                                fileUrl: tempURL.absoluteString,
                                width: Int(editedImage.size.width),
                                height: Int(editedImage.size.height),
                                thumbnailColor: pendingAttachments[idx].thumbnailColor
                            )
                        }
                    }
                }
            }
            .ignoresSafeArea()
        }
        // PhotosPicker videos queue → VideoPreviewView
        .fullScreenCover(isPresented: Binding(
            get: { !videosToPreview.isEmpty },
            set: { if !$0 { videosToPreview.removeAll() } }
        )) {
            if let url = videosToPreview.first {
                MeeshyVideoEditorView(
                    url: url,
                    context: .post,
                    onComplete: { result in
                        handleCameraVideo(result.url)
                        videosToPreview.removeFirst()
                    },
                    onCancel: {
                        videosToPreview.removeFirst()
                    }
                )
            }
        }
        // Tap pending video → unified video editor
        .fullScreenCover(isPresented: Binding(
            get: { editingVideoURL != nil },
            set: { if !$0 { editingVideoURL = nil } }
        )) {
            if let url = editingVideoURL {
                MeeshyVideoEditorView(
                    url: url,
                    context: .post,
                    onComplete: { _ in editingVideoURL = nil },
                    onCancel: { editingVideoURL = nil }
                )
            }
        }
        .adaptiveOnChange(of: selectedPhotoItems) { _, items in
            handlePhotoSelection(items)
        }
        .onAppear {
            composerText = initialText
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                isFocused = true
                openInitialPicker()
            }
        }
    }

    // MARK: - Open Initial Picker
    private func openInitialPicker() {
        guard let type = pendingAttachmentType else { return }
        switch type {
        case "photo": showPhotoPicker = true
        case "camera": showCamera = true
        case "file": showFilePicker = true
        case "location": showLocationPicker = true
        default: break
        }
    }

    // MARK: - Attachments Row
    private var sheetAttachmentsRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(preparingAttachments) { prep in
                    AttachmentLoadingTile(prep: prep, size: 72) {
                        cancelSheetPreparation(prep)
                    }
                }
                ForEach(pendingAttachments) { attachment in
                    sheetAttachmentTile(attachment)
                }
                if let place = pendingPlace {
                    sheetPlaceTile(place)
                }
                if isLoadingMedia && preparingAttachments.isEmpty {
                    ProgressView()
                        .tint(MeeshyColors.brandPrimary)
                        .padding(.horizontal, 12)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .frame(height: 116)
    }

    private func sheetAttachmentTile(_ attachment: MessageAttachment) -> some View {
        VStack(spacing: 4) {
            ZStack {
                if let thumb = pendingThumbnails[attachment.id] {
                    Image(uiImage: thumb)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: 72, height: 72)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .onTapGesture {
                            if attachment.type == .image {
                                editingAttachmentId = attachment.id
                            } else if attachment.type == .video {
                                if let url = pendingMediaFiles[attachment.id] {
                                    editingVideoURL = url
                                }
                            }
                        }

                    if attachment.type == .video {
                        Image(systemName: "play.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(.white, .black.opacity(0.4))
                            .accessibilityHidden(true)
                    }
                } else if attachment.type == .location {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(LinearGradient(colors: [MeeshyColors.success, MeeshyColors.successDeep], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 72, height: 72)
                        .overlay(
                            Image(systemName: "mappin.circle.fill")
                                .font(.system(size: 26))
                                .foregroundStyle(.white, .white.opacity(0.3))
                                .accessibilityHidden(true)
                        )
                } else {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(LinearGradient(colors: [Color(hex: attachment.thumbnailColor), Color(hex: attachment.thumbnailColor).opacity(0.7)], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 72, height: 72)
                        .overlay(
                            Image(systemName: sheetIconForType(attachment.type))
                                .font(.system(size: 26))
                                .foregroundColor(.white)
                                .accessibilityHidden(true)
                        )
                }
            }
            .frame(width: 72, height: 72)
            .overlay(alignment: .topTrailing) {
                Button {
                    HapticFeedback.light()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        let id = attachment.id
                        pendingAttachments.removeAll { $0.id == id }
                        if let url = pendingMediaFiles.removeValue(forKey: id) {
                            try? FileManager.default.removeItem(at: url)
                        }
                        pendingThumbnails.removeValue(forKey: id)
                    }
                } label: {
                    // Glyphe chrome dans un cadre de tap fixe 20×20 : figé (doctrine 82i) ; le libellé porte le sens
                    Image(systemName: "xmark")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 20, height: 20)
                        .background(
                            Circle()
                                .fill(MeeshyColors.error)
                                .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                        )
                }
                .accessibilityLabel(String(localized: "feed.attachment.remove", defaultValue: "Retirer la pièce jointe", bundle: .main))
                .offset(x: 6, y: -6)
            }

            Text(sheetLabelForAttachment(attachment))
                .font(MeeshyFont.relative(10, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .lineLimit(1)
                .frame(width: 72)
        }
    }

    /// Depuis la Task 11/12, un lieu choisi ne vit plus dans `pendingAttachments`
    /// — cette tuile dédiée (même gabarit 72×72 pin-drop) est ce qui évite que
    /// le choix d'un lieu ne produise plus aucun retour visuel ici.
    private func sheetPlaceTile(_ place: SharedPlace) -> some View {
        VStack(spacing: 4) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(LinearGradient(colors: [MeeshyColors.success, MeeshyColors.successDeep], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 72, height: 72)
                    .overlay(
                        Image(systemName: "mappin.circle.fill")
                            .font(.system(size: 26))
                            .foregroundStyle(.white, .white.opacity(0.3))
                            .accessibilityHidden(true)
                    )
            }
            .frame(width: 72, height: 72)
            .overlay(alignment: .topTrailing) {
                Button {
                    HapticFeedback.light()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        pendingPlace = nil
                    }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 20, height: 20)
                        .background(
                            Circle()
                                .fill(MeeshyColors.error)
                                .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                        )
                }
                .accessibilityLabel(String(localized: "feed.attachment.remove", defaultValue: "Retirer la pièce jointe", bundle: .main))
                .offset(x: 6, y: -6)
            }

            Text(MediaKindLabel.placeLabel(place.name))
                .font(MeeshyFont.relative(10, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .lineLimit(1)
                .frame(width: 72)
        }
    }

    // MARK: - Handlers (delegated to AttachmentPreparationService)
    private func handlePhotoSelection(_ items: [PhotosPickerItem]) {
        guard !items.isEmpty else { return }
        selectedPhotoItems.removeAll()
        HapticFeedback.light()
        for item in items {
            let isVideo = item.supportedContentTypes.contains { $0.conforms(to: .movie) }
            if isVideo {
                // Videos go through the editor first — compress + queue the
                // compressed URL for the previewer. The editor is the source
                // of truth for trimming/cover selection; once the user
                // confirms there, `handleCameraVideo` (below) wires the
                // preparation into the loading tray.
                Task {
                    if let movieData = try? await item.loadTransferable(type: Data.self) {
                        let rawURL = FileManager.default.temporaryDirectory.appendingPathComponent("video_raw_\(UUID().uuidString).mp4")
                        try? movieData.write(to: rawURL)
                        let compressedURL: URL
                        do {
                            compressedURL = try await MediaCompressor.shared.compressVideo(rawURL, context: .feedPost)
                            try? FileManager.default.removeItem(at: rawURL)
                        } catch { compressedURL = rawURL }
                        await MainActor.run { videosToPreview.append(compressedURL) }
                    }
                }
            } else {
                let prep = AttachmentPreparationService.shared.preparePhotosPickerItem(
                    item, context: .feedPost, accentColor: MeeshyColors.brandPrimaryHex
                )
                trackSheetPreparation(prep)
            }
        }
    }

    private func handleCameraCapture(_ image: UIImage) {
        let prep = AttachmentPreparationService.shared.prepareImage(
            image, context: .feedPost, accentColor: MeeshyColors.brandPrimaryHex
        )
        trackSheetPreparation(prep)
    }

    private func handleCameraVideo(_ url: URL) {
        let prep = AttachmentPreparationService.shared.prepareVideo(
            sourceURL: url,
            deleteSourceAfterCompression: true,
            context: .feedPost
        )
        trackSheetPreparation(prep)
    }

    private func trackSheetPreparation(_ prep: PreparingAttachment) {
        preparingAttachments.append(prep)
        Task { @MainActor [prep] in
            let result = await prep.awaitCompletion()
            switch result {
            case .success(let prepared):
                pendingMediaFiles[prepared.attachment.id] = prepared.fileURL
                if let thumb = prep.thumbnail {
                    pendingThumbnails[prepared.attachment.id] = thumb
                }
                pendingAttachments.append(prepared.attachment)
                HapticFeedback.success()
            case .failure(.preparationFailed(let message)):
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(message)
            }
            preparingAttachments.removeAll { $0.id == prep.id }
        }
    }

    private func cancelSheetPreparation(_ prep: PreparingAttachment) {
        preparingAttachments.removeAll { $0.id == prep.id }
    }

    private func handleFileImport(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result else { return }
        for url in urls {
            guard url.startAccessingSecurityScopedResource() else { continue }
            defer { url.stopAccessingSecurityScopedResource() }
            let fileName = url.lastPathComponent
            let mimeType = mimeTypeForURL(url)
            let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("file_\(UUID().uuidString)_\(fileName)")
            try? FileManager.default.copyItem(at: url, to: tempURL)
            appendSheetFileAttachment(tempURL: tempURL, fileName: fileName, mimeType: mimeType)
        }
        HapticFeedback.light()
    }

    /// Cœur commun de l'importateur de documents et de l'ingestion dépôt :
    /// enregistre un fichier DÉJÀ dans notre conteneur comme pièce jointe en
    /// attente. `FeedView.appendFeedFileAttachment` en était la jumelle, sur le
    /// composer INLINE du fil ; celui-ci est retiré (#6016) et cette
    /// factorisation-ci n'a plus de miroir à tenir.
    private func appendSheetFileAttachment(tempURL: URL, fileName: String, mimeType: String) {
        let fileSize = (try? FileManager.default.attributesOfItem(atPath: tempURL.path)[.size] as? Int) ?? 0
        let attachmentId = UUID().uuidString
        let attachment = MessageAttachment(id: attachmentId, fileName: fileName, originalName: fileName, mimeType: mimeType, fileSize: fileSize, fileUrl: tempURL.absoluteString, thumbnailColor: "45B7D1")
        pendingMediaFiles[attachmentId] = tempURL
        pendingAttachments.append(attachment)
    }

    /// Recette commune des quatre hôtes, déclinée pour la feuille plein
    /// écran : mêmes pipelines que ses pickers (`trackSheetPreparation`,
    /// `handleFileImport`), même règle « une seule insertion » pour le texte.
    private func handleSheetComposerIngest(_ ingests: [ComposerIngest]) {
        guard !ingests.isEmpty else { return }
        var texts: [String] = []
        for ingest in ingests {
            switch ingest {
            case .text(let value):
                texts.append(value)
            case .file(let url, let name, let mime):
                switch ComposerIngestRouter.route(mime: mime) {
                case .image:
                    guard let image = UIImage(contentsOfFile: url.path) else {
                        // Pas de tuile fantôme : l'image illisible est nommée
                        // dans un toast et son fichier temporaire retiré.
                        ComposerIngestFeedback.showFailure(names: [name])
                        try? FileManager.default.removeItem(at: url)
                        continue
                    }
                    let prep = AttachmentPreparationService.shared.prepareImage(
                        image, context: .feedPost, accentColor: MeeshyColors.brandPrimaryHex
                    )
                    trackSheetPreparation(prep)
                    try? FileManager.default.removeItem(at: url)
                case .video:
                    let prep = AttachmentPreparationService.shared.prepareVideo(
                        sourceURL: url,
                        deleteSourceAfterCompression: true,
                        context: .feedPost
                    )
                    trackSheetPreparation(prep)
                case .audio, .file:
                    appendSheetFileAttachment(tempURL: url, fileName: name, mimeType: mime)
                }
            }
        }
        if !texts.isEmpty {
            // UNE seule insertion, `\n` entre éléments — le `TextEditor`
            // SwiftUI (cible iOS 16) n'expose pas le curseur : fin de champ.
            let joined = texts.joined(separator: "\n")
            composerText = composerText.isEmpty ? joined : composerText + "\n" + joined
        }
        HapticFeedback.light()
    }

    /// Le picker émet désormais un `SharedPlace` complet — `MessageAttachment.location`
    /// ne portait ni le nom ni l'adresse et n'est plus le véhicule (Task 11/12).
    private func handleLocationSelection(_ place: SharedPlace) {
        withAnimation {
            pendingPlace = place
            nearbyDiscoverability = FeedNearbyDiscoverability.choiceForNewPlace()
        }
        HapticFeedback.light()
    }

    /// La règle vient de `FeedNearbyDiscoverability.offers` — un seul site,
    /// testable sans monter de vue. Elle avait DEUX appelants ; le jumeau du
    /// composer inline (`feedOffersNearbyDiscoverability`) est parti avec lui
    /// (#6016), et le meuble a le sien (`documentOffersNearbyDiscoverability`).
    private var offersNearbyDiscoverability: Bool {
        FeedNearbyDiscoverability.offers(
            hasPlace: pendingPlace != nil,
            visibility: selectedPostVisibility
        )
    }

    // MARK: - Publish
    /// Ce que la publication DÉCLARE : les non-INLINE, et `nil` quand il n'y
    /// en a aucune — `[]` serait entendu par le serveur comme un effacement.
    private var declaredReferences: [PostMentionInput]? {
        let declared = ComposerReferences.payload(references)
        return declared.isEmpty ? nil : declared
    }

    private func publishPost() {
        let text = composerText.trimmingCharacters(in: .whitespacesAndNewlines)
        // Une position seule, sans texte ni piece jointe, doit pouvoir partir : sinon
        // handleLocationSelection() range le lieu dans pendingPlace et ce garde le
        // jette en silence (Task 13, 2026-07-29).
        guard !text.isEmpty || !pendingAttachments.isEmpty || pendingPlace != nil else { return }

        // Quote mode: repost with content instead of createPost
        if let quotePost {
            onDismiss()
            HapticFeedback.success()
            Task { await viewModel.repostPost(quotePost.id, content: text, isQuote: true) }
            return
        }

        let attachments = pendingAttachments
        let mediaFiles = pendingMediaFiles
        let hasFiles = !mediaFiles.isEmpty
        // Capturé avant `onDismiss()` : la feuille est démontée aussitôt, et
        // relire son `@State` depuis la Task ne déclarerait plus personne.
        let declared = declaredReferences
        // Même capture, même raison — et la mémoire locale du palier s'écrit
        // ICI, au moment où il SERT : la spec parle du dernier choix
        // « utilisé », pas du dernier survolé.
        let nearbyPrecision = offersNearbyDiscoverability
            ? nearbyDiscoverability.precisionToSend
            : nil
        // Le lieu, capturé pour la même raison que `declared` : la feuille est
        // démontée par `onDismiss()`, et une lecture tardive depuis la Task
        // d'envoi ne trouverait plus rien.
        let capturedPlace = pendingPlace
        if offersNearbyDiscoverability {
            FeedNearbyDiscoverability.remember(nearbyDiscoverability)
        }

        if !hasFiles || attachments.isEmpty {
            onDismiss()
            HapticFeedback.success()
            if !text.isEmpty || pendingPlace != nil {
                let lang = composerLanguage
                Task { await viewModel.createPost(content: text, visibility: postVisibility, visibilityUserIds: postVisibilityUserIds.isEmpty ? nil : postVisibilityUserIds, originalLanguage: lang, location: pendingPlace, mentions: declared, discoverabilityPrecision: nearbyPrecision) }
            }
            return
        }

        // U1b — offline: route the media post through the durable outbox instead
        // of the TUS upload (which throws offline → the post would be lost). The
        // post appears optimistically (local-media preview); the OutboxFlusher
        // uploads + creates on reconnect, and the cmid echo reconciles it
        // (U1 ST2). Mirrors the message offline-media gate. Text-only offline
        // posts are already durable via createPost above (U1 ST3).
        if NetworkMonitor.shared.isOffline {
            let sources = attachments.compactMap { mediaFiles[$0.id] }
            let lang = composerLanguage
            // Mirror the online classification (line below) so an offline media
            // post lands on the same surface (REEL for video / multi-image).
            let postType = ReelComposition.defaultType(
                mimeTypes: attachments.map(\.mimeType),
                durationsMs: attachments.map(\.duration),
                forcePlainPost: forcePlainPost
            ).rawValue
            onDismiss()
            HapticFeedback.success()
            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.toast.pendingOffline", defaultValue: "Publication en attente d'envoi", bundle: .main))
            Task {
                await viewModel.createOfflineMediaPost(
                    localMediaURLs: sources,
                    content: text,
                    visibility: postVisibility, visibilityUserIds: postVisibilityUserIds.isEmpty ? nil : postVisibilityUserIds,
                    originalLanguage: lang,
                    type: postType,
                    location: pendingPlace,
                    mentions: declared,
                    discoverabilityPrecision: nearbyPrecision,
                    mobileTranscription: nil,
                    storyEffects: nil,
                    mediaCaptions: nil,
                // **La feuille du FIL n'a ni éditeur d'objet ni scène** : pas
                // d'alternative textuelle à porter, aucun objet de canvas à
                // adopter. Écrit plutôt qu'omis — un défaut aurait couvert ce
                // site en silence, et rien n'aurait dit le jour où cette
                // feuille gagnerait un champ « Décrire ».
                mediaAlts: nil, mediaObjectIds: nil,
                // Même raison : aucun toggle de son sur cette feuille (#3996).
                allowSoundExtraction: nil
                )
            }
            return
        }

        isUploading = true
        HapticFeedback.light()

        Task {
            do {
                let serverOrigin = MeeshyConfig.shared.serverOrigin
                guard let baseURL = URL(string: serverOrigin),
                      let token = APIClient.shared.authToken else {
                    await MainActor.run { isUploading = false }
                    return
                }

                let uploader = TusUploadManager(baseURL: baseURL)
                var progressCancellable: AnyCancellable?
                progressCancellable = uploader.progressPublisher
                    .receive(on: DispatchQueue.main)
                    .sink { [progressCancellable] progress in
                        _ = progressCancellable
                        uploadProgress = progress
                    }

                var uploadedIds: [String] = []
                for attachment in attachments {
                    if let fileURL = mediaFiles[attachment.id] {
                        let thumbHash = pendingThumbnails[attachment.id]?.toThumbHash()
                        let result = try await uploader.uploadFile(fileURL: fileURL, mimeType: attachment.mimeType, credential: .bearer(token), uploadContext: "post", thumbHash: thumbHash)
                        uploadedIds.append(result.id)
                        try? FileManager.default.removeItem(at: fileURL)
                    }
                }
                progressCancellable?.cancel()

                await viewModel.createPost(content: text, type: ReelComposition.defaultType(mimeTypes: attachments.map(\.mimeType), durationsMs: attachments.map(\.duration), forcePlainPost: forcePlainPost).rawValue, visibility: postVisibility, visibilityUserIds: postVisibilityUserIds.isEmpty ? nil : postVisibilityUserIds, mediaIds: uploadedIds.isEmpty ? nil : uploadedIds, originalLanguage: composerLanguage, location: capturedPlace, mentions: declared, discoverabilityPrecision: nearbyPrecision)

                guard viewModel.publishError == nil else {
                    await MainActor.run {
                        isUploading = false
                        uploadProgress = nil
                        for (_, url) in mediaFiles { try? FileManager.default.removeItem(at: url) }
                        HapticFeedback.error()
                        FeedbackToastManager.shared.showError(String(localized: "feed.post.toast.publishError", defaultValue: "Échec de la publication du post", bundle: .main))
                    }
                    return
                }

                await MainActor.run {
                    isUploading = false
                    uploadProgress = nil
                    onDismiss()
                    HapticFeedback.success()
                    FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.toast.published", defaultValue: "Post publié", bundle: .main))
                }
            } catch {
                await MainActor.run {
                    isUploading = false
                    uploadProgress = nil
                    for (_, url) in mediaFiles { try? FileManager.default.removeItem(at: url) }
                    HapticFeedback.error()
                    FeedbackToastManager.shared.showError(String(localized: "feed.post.toast.publishError", defaultValue: "Échec de la publication du post", bundle: .main))
                }
            }
        }
    }

    /// Jumelle de `FeedView.publishAudioPost` — MÊME matière, composée par la
    /// MÊME fabrique. C'est tout l'objet du lot : les deux divergeaient sur la
    /// perte du fichier (celui-ci le laissait ORPHELIN au lieu de l'effacer),
    /// sur la LANGUE (il empruntait `composerLanguage` quand la transcription
    /// manquait — un vocal en wolof composé dans un composer réglé sur « fr »
    /// partait déclaré français, et le Prisme le servait au rang 0 sous une
    /// étiquette fausse) et sur les mentions.
    ///
    /// L'audience choisie voyage ici comme chez le jumeau. **Résidu nommé** :
    /// une audience INCOMPLÈTE (`ONLY`/`EXCEPT` sans destinataire — ce que
    /// `postAudienceIncomplete` retient sur le bouton d'envoi TEXTE) n'est pas
    /// retenue sur ce chemin ; le gateway la refuse alors (400), la ligne
    /// quitte la file et l'auteur est prévenu. Bruyant, mais jamais silencieux
    /// — c'est l'inverse exact du défaut d'hier, qui publiait PUBLIC sans rien
    /// dire.
    private func publishAudioFromSheet(audioURL: URL, mimeType: String, durationMs: Int, transcription: MobileTranscriptionPayload?) async {
        await MainActor.run { isUploading = true }

        await viewModel.publish(PublishIntent.audioRecording(
            fileURL: audioURL,
            mimeType: mimeType,
            durationMs: durationMs,
            transcription: transcription,
            forcePlainPost: forcePlainPost,
            content: nil,
            visibility: postVisibility,
            visibilityUserIds: postVisibilityUserIds.isEmpty ? nil : postVisibilityUserIds,
            mentions: declaredReferences,
            location: nil,
            discoverabilityPrecision: nil
        ))

        await MainActor.run {
            isUploading = false
            if viewModel.publishError != nil {
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(String(localized: "feed.post.toast.audioPublishError", defaultValue: "Échec de la publication du post audio", bundle: .main))
            } else {
                onDismiss()
                HapticFeedback.success()
                FeedbackToastManager.shared.showSuccess(
                    NetworkMonitor.shared.isOffline
                        ? String(localized: "feed.post.toast.pendingOffline", defaultValue: "Publication en attente d'envoi", bundle: .main)
                        : String(localized: "feed.post.toast.audioPublished", defaultValue: "Post audio publié", bundle: .main)
                )
            }
        }
    }

    /// Variante sheet de `FeedView.publishBorrowedSoundPost` — mêmes helpers
    /// purs (`BorrowedSoundPost`), mais l'état (`isUploading`, `forcePlainPost`,
    /// `onDismiss`) est celui du composer sheet.
    private func publishBorrowedSoundFromSheet(_ sound: APISound) async {
        await MainActor.run { isUploading = true }
        await viewModel.createBorrowedSoundPost(
            type: BorrowedSoundPost.type(for: sound, forcePlainPost: forcePlainPost),
            storyEffects: BorrowedSoundPost.effects(for: sound),
            mentions: declaredReferences
        )
        await MainActor.run {
            isUploading = false
            if viewModel.publishError == nil {
                onDismiss()
                HapticFeedback.success()
                FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.toast.audioPublished", defaultValue: "Post audio publié", bundle: .main))
            } else {
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(String(localized: "feed.post.toast.audioPublishError", defaultValue: "Échec de la publication du post audio", bundle: .main))
            }
        }
    }

    private func cleanupAndDismiss() {
        for (_, url) in pendingMediaFiles { try? FileManager.default.removeItem(at: url) }
        onDismiss()
    }

    // MARK: - Helpers
    private func generateVideoThumbnail(url: URL) async -> UIImage? {
        let asset = AVURLAsset(url: url)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 200, height: 200)
        return try? await UIImage(cgImage: generator.image(at: .zero).image)
    }

    private func mimeTypeForURL(_ url: URL) -> String {
        // Single source of truth lives in `MimeTypeResolver` (MeeshySDK).
        // Replaces a deliberately-narrow table that excluded several formats
        // (webp/heic/wav/audio/ogg/...) — the resolver covers all of them.
        MimeTypeResolver.mimeType(forURL: url)
    }

    private func sheetIconForType(_ type: MessageAttachment.AttachmentType) -> String {
        switch type {
        case .image: return "photo.fill"
        case .video: return "video.fill"
        case .audio: return "waveform"
        case .file: return "doc.fill"
        case .location: return "location.fill"
        }
    }

    private func sheetLabelForAttachment(_ attachment: MessageAttachment) -> String {
        MediaKindLabel.attachmentLabel(for: attachment)
    }
}

private struct EditingAttachmentItem: Identifiable {
    let id: String
    let image: UIImage
}
