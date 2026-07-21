import SwiftUI
import MeeshySDK
import MeeshyUI

/// Result of an edit: the body plus the two structural fields the gateway lets
/// an author change. `language`/`type` are non-nil ONLY when actually changed,
/// so an unchanged edit never triggers a re-translation or a type switch.
struct EditPostDraft {
    let content: String
    /// Non-nil only when the source language changed → re-runs the Prisme
    /// translation pipeline server-side.
    let language: String?
    /// Non-nil only when the author switched between "POST" and "REEL".
    let type: String?
    /// Ids of attached media the author chose to remove. Empty when none.
    let removeMediaIds: [String]
}

/// Lightweight, presentation-only view of an attached media item for the edit
/// sheet — maps from the SDK `FeedMedia` to just what the thumbnail strip needs.
struct EditablePostMedia: Identifiable, Equatable {
    enum Kind { case image, video, audio, document, location }
    let id: String
    let kind: Kind
    let previewURL: URL?

    init(id: String, kind: Kind, previewURL: URL?) {
        self.id = id
        self.kind = kind
        self.previewURL = previewURL
    }

    init(_ media: FeedMedia) {
        self.id = media.id
        switch media.type {
        case .image: self.kind = .image
        case .video: self.kind = .video
        case .audio: self.kind = .audio
        case .document: self.kind = .document
        case .location: self.kind = .location
        }
        let raw = media.thumbnailUrl ?? media.url
        self.previewURL = raw.flatMap { MeeshyConfig.resolveMediaURL($0) }
    }
}

/// Sheet for editing an authored post: body text, source language (with
/// re-translation), and POST <-> REEL type. The parent owns persistence
/// (`ViewModel.updatePost`) so this sheet stays presentation-only and reusable.
struct EditPostSheet: View {
    let originalContent: String
    var originalLanguage: String? = nil
    var originalType: String? = nil
    /// The post carries media → switching to REEL is allowed (a reel needs
    /// something to show on the immersive surface).
    var canBeReel: Bool = false
    /// Attached media shown with a remove control. Removing here sends the ids
    /// in `removeMediaIds`; the gateway detaches them.
    var media: [EditablePostMedia] = []
    /// A repost mirrors its source; its type is not editable.
    var isRepost: Bool = false
    var maxLength: Int = 5000
    let onSave: (EditPostDraft) async -> Void
    let onDismiss: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    @State private var draftContent: String = ""
    @State private var selectedLanguage: String = ""
    @State private var selectedType: String = "POST"
    @State private var showLanguagePicker = false
    @FocusState private var isFocused: Bool
    @State private var isSaving: Bool = false
    @State private var removedMediaIds: Set<String> = []

    private var trimmedContent: String {
        draftContent.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var normalizedOriginalType: String { (originalType ?? "POST").uppercased() }

    /// Only meaningful when not a repost and the post can actually be a reel
    /// (carries media) or already is one (allowing the reverse switch).
    private var showTypePicker: Bool {
        !isRepost && (canBeReel || normalizedOriginalType == "REEL")
    }

    private var contentChanged: Bool {
        trimmedContent != originalContent.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    private var languageChanged: Bool { selectedLanguage != (originalLanguage ?? "") }
    private var typeChanged: Bool { showTypePicker && selectedType != normalizedOriginalType }
    private var mediaChanged: Bool { !removedMediaIds.isEmpty }
    private var hasChanges: Bool { contentChanged || languageChanged || typeChanged || mediaChanged }

    private var remainingMediaCount: Int { media.count - removedMediaIds.count }

    private var isValid: Bool {
        guard trimmedContent.count <= maxLength else { return false }
        // A media-only post (no text) stays valid as long as media remains.
        return !trimmedContent.isEmpty || remainingMediaCount > 0
    }

    private var remainingChars: Int {
        max(0, maxLength - draftContent.count)
    }

    private var selectedLanguageInfo: LanguageInfo? {
        LanguageData.allLanguages.first { $0.code == selectedLanguage }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundPrimary.ignoresSafeArea()

                VStack(alignment: .leading, spacing: 12) {
                    TextEditor(text: $draftContent)
                        .focused($isFocused)
                        .font(MeeshyFont.relative(17))
                        .foregroundColor(theme.textPrimary)
                        .accessibilityLabel(String(localized: "feed.post.edit.body.a11y", defaultValue: "Contenu du post", bundle: .main))
                        .scrollContentBackground(.hidden)
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 14)
                                .fill(theme.inputBackground)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 14)
                                        .stroke(theme.inputBorder, lineWidth: 1)
                                )
                        )
                        .padding(.horizontal, 16)
                        .frame(maxHeight: .infinity)

                    mediaSection

                    metadataSection

                    HStack {
                        Spacer()
                        Text("\(remainingChars)")
                            .font(MeeshyFont.relative(12, weight: .medium))
                            .foregroundColor(remainingChars < 100 ? MeeshyColors.warning : theme.textMuted)
                            .accessibilityLabel(String(format: String(localized: "feed.post.edit.remaining.a11y", defaultValue: "%d caractères restants", bundle: .main), remainingChars))
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 12)
                }
            }
            .navigationTitle(String(localized: "feed.post.edit.title", defaultValue: "Modifier le post", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)) {
                        onDismiss()
                    }
                    .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if isSaving {
                            ProgressView()
                                .tint(MeeshyColors.indigo300)
                                .scaleEffect(0.85)
                        } else {
                            Text(String(localized: "feed.post.edit.publish", defaultValue: "Publier", bundle: .main))
                                .font(MeeshyFont.relative(16, weight: .semibold))
                        }
                    }
                    .disabled(!isValid || !hasChanges || isSaving)
                }
            }
            .sheet(isPresented: $showLanguagePicker) {
                ProfileLanguagePickerSheet(
                    title: String(localized: "feed.post.edit.language", defaultValue: "Langue du contenu", bundle: .main),
                    languages: LanguageData.allLanguages,
                    selectedCode: selectedLanguage,
                    allowClear: false,
                    onSelect: { code in
                        selectedLanguage = code
                        showLanguagePicker = false
                    }
                )
            }
        }
        .onAppear {
            draftContent = originalContent
            selectedLanguage = originalLanguage ?? ""
            selectedType = normalizedOriginalType
            // Defer focus slightly so the keyboard rises after the sheet
            // present animation settles — otherwise the appearance jolts.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                isFocused = true
            }
        }
        .interactiveDismissDisabled(isSaving)
    }

    // MARK: - Language + type controls

    @ViewBuilder
    private var metadataSection: some View {
        VStack(spacing: 10) {
            Button {
                isFocused = false
                showLanguagePicker = true
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "globe")
                        .foregroundColor(theme.textSecondary)
                        .accessibilityHidden(true)
                    Text(String(localized: "feed.post.edit.language", defaultValue: "Langue du contenu", bundle: .main))
                        .font(MeeshyFont.relative(15))
                        .foregroundColor(theme.textPrimary)
                    Spacer()
                    if let info = selectedLanguageInfo {
                        Text("\(info.flag) \(info.name)")
                            .font(MeeshyFont.relative(15, weight: .medium))
                            .foregroundColor(theme.textSecondary)
                    } else {
                        Text(String(localized: "feed.post.edit.language.auto", defaultValue: "Auto", bundle: .main))
                            .font(MeeshyFont.relative(15))
                            .foregroundColor(theme.textMuted)
                    }
                    Image(systemName: "chevron.right")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                        .accessibilityHidden(true)
                }
                .padding(.vertical, 10)
                .padding(.horizontal, 14)
                .background(
                    RoundedRectangle(cornerRadius: 12).fill(theme.inputBackground)
                )
            }
            .buttonStyle(.plain)
            .disabled(isSaving)

            if showTypePicker {
                Picker(String(localized: "feed.post.edit.type", defaultValue: "Type", bundle: .main), selection: $selectedType) {
                    Text(String(localized: "feed.post.edit.type.post", defaultValue: "Post", bundle: .main)).tag("POST")
                    Text(String(localized: "feed.post.edit.type.reel", defaultValue: "Réel", bundle: .main)).tag("REEL")
                }
                .pickerStyle(.segmented)
                .disabled(isSaving)
            }
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Attached media

    @ViewBuilder
    private var mediaSection: some View {
        if !media.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(media) { item in
                        mediaThumbnail(item)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 2)
            }
        }
    }

    @ViewBuilder
    private func mediaThumbnail(_ item: EditablePostMedia) -> some View {
        let removed = removedMediaIds.contains(item.id)
        let blockRemoval = selectedType == "REEL" && !removed && remainingMediaCount <= 1
        ZStack(alignment: .topTrailing) {
            Group {
                if let url = item.previewURL, item.kind == .image || item.kind == .video {
                    // CachedAsyncImage : la vignette d'un média distant existant
                    // réutilise le DiskCacheStore déjà peuplé par le feed (et
                    // gère aussi les URLs file:// des brouillons locaux).
                    CachedAsyncImage(url: url.absoluteString) {
                        mediaIcon(item.kind)
                    }
                    .scaledToFill()
                } else {
                    mediaIcon(item.kind)
                }
            }
            .frame(width: 64, height: 64)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(theme.inputBorder, lineWidth: 1))
            .opacity(removed ? 0.35 : 1)

            Button {
                toggleRemove(item.id)
            } label: {
                // Glyphe de contrôle épinglé au coin d'une vignette 64×64 fixe :
                // gardé à taille fixe (doctrine — un glyphe dans un cadre rigide
                // crève sa frame s'il scale), mais doté d'un label VoiceOver
                // (auparavant absent) pour l'action retirer / restaurer.
                Image(systemName: removed ? "arrow.uturn.backward.circle.fill" : "xmark.circle.fill")
                    .font(.system(size: 18))
                    .foregroundColor(removed ? MeeshyColors.indigo300 : .white)
                    .shadow(radius: 1)
            }
            .buttonStyle(.plain)
            .offset(x: 6, y: -6)
            .disabled(blockRemoval || isSaving)
            .accessibilityLabel(removed
                ? String(localized: "feed.post.edit.media.restore.a11y", defaultValue: "Restaurer le média", bundle: .main)
                : String(localized: "feed.post.edit.media.remove.a11y", defaultValue: "Retirer le média", bundle: .main))
        }
    }

    @ViewBuilder
    private func mediaIcon(_ kind: EditablePostMedia.Kind) -> some View {
        ZStack {
            theme.inputBackground
            Image(systemName: mediaSymbol(kind))
                .font(.system(size: 22))
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)
        }
    }

    private func mediaSymbol(_ kind: EditablePostMedia.Kind) -> String {
        switch kind {
        case .video: return "film"
        case .audio: return "music.note"
        case .image: return "photo"
        case .document: return "doc"
        case .location: return "mappin.and.ellipse"
        }
    }

    private func toggleRemove(_ id: String) {
        if removedMediaIds.contains(id) {
            removedMediaIds.remove(id)
        } else {
            // A reel must keep at least one media — block removing the last one.
            if selectedType == "REEL" && remainingMediaCount <= 1 { return }
            removedMediaIds.insert(id)
        }
    }

    private func save() async {
        guard isValid, !isSaving else { return }
        isSaving = true
        let draft = EditPostDraft(
            content: trimmedContent,
            language: languageChanged ? selectedLanguage : nil,
            type: typeChanged ? selectedType : nil,
            removeMediaIds: Array(removedMediaIds)
        )
        await onSave(draft)
        isSaving = false
        onDismiss()
    }
}
