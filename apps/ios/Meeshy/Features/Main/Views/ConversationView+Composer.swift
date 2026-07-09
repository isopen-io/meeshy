// MARK: - Extracted from ConversationView.swift
import SwiftUI
import Combine
import PhotosUI
import AVFoundation
import MeeshySDK
import MeeshyUI

// MARK: - Composer text isolation
//
// Le texte du composer vivait en `@State` à la RACINE de ConversationView :
// chaque caractère tapé ré-évaluait l'arbre racine entier (~1500 lignes de
// body : header, bridge de liste, overlays, sheets) + re-exécutait
// `updateUIViewController` du bridge. En le déplaçant dans un ObservableObject
// tenu par la racine via `@State` (la racine ne LIT jamais `text` dans son
// body et ne s'abonne pas à `objectWillChange`), seul `ComposerTextHost`
// — l'unique `@ObservedObject` — se re-rend à la frappe.
//
// Le modèle porte aussi la persistance différée du brouillon : l'ancien
// `.adaptiveOnChange(of: messageText)` racine ne peut plus exister (la racine
// ne se ré-évalue plus à la frappe, donc `onChange` n'y fire plus).

/// Stockage du texte du composer, hors de l'arbre de dépendances de la racine.
///
/// Politique de persistance du brouillon (décision produit 2026-06-09) :
/// - **Fin de mot** (espace, retour ligne) ou **champ vidé** → persistance
///   IMMÉDIATE. Le brouillon est donc durable mot par mot.
/// - **Milieu de mot** → fenêtre de 400 ms (filet de sécurité pour une pause
///   de frappe) — jamais une écriture + re-tri de la liste par caractère.
/// - **Sortie de vue** (navigation, changement de conversation via `.id`,
///   perte de focus du clavier — appel entrant, sheet —, passage en
///   arrière-plan) → `flushPendingChange()` immédiat.
@MainActor
final class ConversationComposerTextModel: ObservableObject {
    @Published var text: String = ""

    /// Installé par la vue (onAppear) : reçoit le texte à persister —
    /// branché sur `persistDraft` côté ConversationView.
    var onPersistNeeded: ((String) -> Void)?
    private var debounceTask: Task<Void, Never>?
    private var textObservation: AnyCancellable?

    init() {
        textObservation = $text
            .dropFirst()
            .sink { [weak self] newValue in
                guard let self else { return }
                if newValue.isEmpty || newValue.last?.isWhitespace == true {
                    self.persistNow(newValue)
                } else {
                    self.scheduleDebouncedPersist(newValue)
                }
            }
    }

    private func persistNow(_ value: String) {
        debounceTask?.cancel()
        debounceTask = nil
        onPersistNeeded?(value)
    }

    private func scheduleDebouncedPersist(_ value: String) {
        debounceTask?.cancel()
        debounceTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            self?.onPersistNeeded?(value)
        }
    }

    /// Annule la fenêtre de débounce en vol et émet immédiatement la valeur
    /// courante. Appelé au disappear, à la perte de focus du clavier et au
    /// passage en arrière-plan pour ne jamais perdre la fin de saisie.
    func flushPendingChange() {
        persistNow(text)
    }
}

/// Unique abonné au texte du composer : la frappe re-rend CE sous-arbre
/// seulement. Le contenu reçoit un `Binding<String>` frais à chaque
/// ré-évaluation (équivalent de l'ancien `$messageText`).
struct ComposerTextHost<Content: View>: View {
    @ObservedObject var model: ConversationComposerTextModel
    @ViewBuilder let content: (Binding<String>) -> Content

    var body: some View {
        content($model.text)
    }
}

// MARK: - Composer, Attachments & Recording
extension ConversationView {

    // MARK: - Themed Composer (powered by UniversalComposerBar)
    var themedComposer: some View {
        ComposerTextHost(model: composerText) { textBinding in
            UniversalComposerBar(
            style: .light,
            mode: .message,
            accentColor: viewModel.ephemeralDuration != nil ? MeeshyColors.errorHex : viewModel.isBlurEnabled ? MeeshyColors.trackingAccentHex : viewModel.pendingEffects.hasAnyEffect ? MeeshyColors.brandPrimaryHex : accentColor,
            secondaryColor: secondaryColor,
            // Hide file/photo attachments in the notification preview composer
            // (declared before `selectedLanguage` → must appear here for the
            // synthesized memberwise initializer's argument order).
            forceHideAttachment: previewMode,
            selectedLanguage: composerState.selectedLanguage,
            onLanguageChange: { composerState.selectedLanguage = $0 },
            onFocusChange: { focused in
                isTyping = focused
                if focused {
                    withAnimation { composerState.showOptions = false }
                } else {
                    // Perte de focus du clavier (appel entrant, sheet,
                    // fermeture clavier) → sauvegarde immédiate du brouillon.
                    composerText.flushPendingChange()
                }
            },
            onLocationRequest: { composerState.showLocationPicker = true },
            textBinding: textBinding,
            editBanner: composerState.editingMessageId != nil
                ? AnyView(composerEditBanner)
                : nil,
            replyBanner: composerState.editingMessageId == nil
                ? composerState.pendingReplyReference.map { AnyView(composerReplyBanner($0)) }
                : nil,
            customAttachmentsPreview: (!composerState.pendingAttachments.isEmpty
                                        || !composerState.preparingAttachments.isEmpty
                                        || composerState.isLoadingMedia)
                ? AnyView(pendingAttachmentsRow)
                : nil,
            isEditMode: composerState.editingMessageId != nil,
            onCustomSend: {
                if composerState.editingMessageId != nil {
                    submitEdit()
                } else if audioRecorder.isRecording {
                    stopAndSendRecording()
                } else {
                    sendMessageWithAttachments()
                }
            },
            onTextChange: { viewModel.onTextChanged($0) },
            onStartRecording: { startRecording() },
            onStopRecordingToAttachment: { stopRecordingToAttachment() },
            onSendRecording: { stopAndSendRecording() },
            onCancelRecording: {
                audioRecorder.cancelRecording()
            },
            externalIsRecording: audioRecorder.isRecording,
            externalRecordingDuration: audioRecorder.duration,
            externalAudioLevels: audioRecorder.audioLevels,
            externalHasContent: !composerState.pendingAttachments.isEmpty || audioRecorder.isRecording,
            // ⚠️ NE PAS câbler `viewModel.isSending` ici : il reste true pendant
            // tout le cycle REST(12s)+fallback socket(10s) d'UN message — le
            // bouton d'envoi serait mort ~22s par message en réseau dégradé
            // (bug « ⏳ bloque le composer », 2026-07-02). Un vrai messenger
            // enchaîne les envois : chaque message a sa bulle + horloge, l'outbox
            // les rejoue FIFO. Les double-taps restent couverts par : champ vidé
            // synchrone (hasContent), guard isUploading (attachments), et le
            // dedup par contenu du VM (duplicateSendDebounce).
            onPhotoLibrary: { composerState.showPhotoPicker = true },
            onCamera: { composerState.showCamera = true },
            onFilePicker: { composerState.showFilePicker = true },
            onShowAttachments: {
                // Carrousel de pièces jointes ouvert → ferme le panneau emoji
                // pour ne jamais empiler deux surfaces d'entrée sous la barre.
                if composerState.showTextEmojiPicker {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        composerState.showTextEmojiPicker = false
                    }
                }
            },
            onRequestTextEmoji: {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    composerState.showTextEmojiPicker.toggle()
                }
            },
            onRecentMediaSelected: { pick in ingestRecentMediaPick(pick) },
            onRecentMediaEdit: { pick in editRecentMediaPick(pick) },
            onPhotoLibraryPreselecting: { ids in openPhotoLibraryPreselecting(ids) },
            injectedEmoji: $composerState.emojiToInject,
            ephemeralDuration: $viewModel.ephemeralDuration,
            hideEphemeral: composerState.editingMessageId != nil,
            isBlurEnabled: $viewModel.isBlurEnabled,
            hideBlur: composerState.editingMessageId != nil,
            // Notification preview composer: expose the view-once toggle (text /
            // voice / effects / blur / ephemeral stay available). No-op for the
            // full conversation. `forceHideAttachment` is passed earlier (its
            // property is declared before `selectedLanguage`, so the synthesized
            // memberwise initializer requires it in that position).
            isViewOnceEnabled: $viewModel.isViewOnceEnabled,
            showViewOnce: previewMode,
            pendingEffects: $viewModel.pendingEffects,
            onRequestEffectsPicker: { viewModel.showEffectsPicker = true },
            hideEffects: composerState.editingMessageId != nil
            )
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: viewModel.ephemeralDuration != nil)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: viewModel.isBlurEnabled)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: viewModel.pendingEffects.hasAnyEffect)
        .sheet(isPresented: $viewModel.showEffectsPicker) {
            EffectsPickerView(effects: $viewModel.pendingEffects, accentColor: accentColor)
        }
        // `photoLibrary: .shared()` est requis pour la présélection : les
        // PhotosPickerItem(itemIdentifier:) injectés depuis le strip ne
        // matchent les assets du picker que sur la photothèque partagée.
        .photosPicker(isPresented: $composerState.showPhotoPicker, selection: $composerState.selectedPhotoItems, maxSelectionCount: 10, matching: .any(of: [.images, .videos]), photoLibrary: .shared())
        .fileImporter(isPresented: $composerState.showFilePicker, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            handleFileImport(result)
        }
        .fullScreenCover(isPresented: $composerState.showCamera) {
            CameraView { result in
                switch result {
                case .photo(let image):
                    handleCameraCapture(image)
                case .video(let url):
                    handleCameraVideo(url)
                }
            }
            .ignoresSafeArea()
        }
        .sheet(isPresented: $composerState.showLocationPicker) {
            LocationPickerView(accentColor: accentColor) { coordinate, address in
                handleLocationSelection(coordinate: coordinate, address: address)
            }
        }
        .sheet(isPresented: $composerState.showContactPicker) {
            ContactPickerView(
                onSelect: { contact in
                    handleContactSelection(contact)
                    composerState.showContactPicker = false
                },
                onCancel: { composerState.showContactPicker = false }
            )
        }
        .adaptiveOnChange(of: composerState.selectedPhotoItems) { _, items in
            handlePhotoSelection(items)
        }
        // C. Tap pending image → MeeshyImageEditorView
        //
        // Bug fix (2026-07-09): `isPresented` used to be driven solely by
        // `editingPendingAttachmentId != nil` while the content required a
        // SEPARATE `pendingThumbnails[id]` lookup to succeed. Whenever that
        // dictionary lookup missed — a since-removed attachment, a thumbnail
        // that failed to generate, any race between the tap and the
        // dictionaries settling — the cover still presented (isPresented was
        // already true) but its content body evaluated to nothing, which
        // reads to the user as the composer "crashing" on tap: a full-screen
        // cover appears with no way to dismiss it from inside. The two must
        // share one source of truth so the cover can never present empty.
        .fullScreenCover(isPresented: Binding(
            get: { scrollState.editingPendingAttachmentId != nil },
            set: { if !$0 { scrollState.editingPendingAttachmentId = nil } }
        )) {
            if let id = scrollState.editingPendingAttachmentId,
               let thumb = composerState.pendingThumbnails[id] {
                MeeshyImageEditorView(image: thumb, context: .message, accentColor: accentColor) { editedImage in
                    composerState.pendingThumbnails[id] = editedImage
                    Task {
                        let result = await MediaCompressor.shared.compressImage(editedImage)
                        let fileName = "edited_\(UUID().uuidString).\(result.fileExtension)"
                        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
                        try? result.data.write(to: tempURL)
                        await MainActor.run {
                            if let oldURL = composerState.pendingMediaFiles[id] {
                                try? FileManager.default.removeItem(at: oldURL)
                            }
                            composerState.pendingMediaFiles[id] = tempURL
                            if let idx = composerState.pendingAttachments.firstIndex(where: { $0.id == id }) {
                                composerState.pendingAttachments[idx] = MessageAttachment(
                                    id: id, fileName: fileName, originalName: fileName,
                                    mimeType: result.mimeType, fileSize: result.data.count,
                                    fileUrl: tempURL.absoluteString,
                                    width: Int(editedImage.size.width),
                                    height: Int(editedImage.size.height),
                                    thumbnailColor: accentColor
                                )
                            }
                            scrollState.editingPendingAttachmentId = nil
                        }
                    }
                }
            } else {
                // The thumbnail vanished out from under the presentation
                // (attachment removed mid-race, or generation never
                // succeeded) — never present a silently-empty cover; give the
                // user a dismissable state instead.
                attachmentPreviewUnavailableFallback { scrollState.editingPendingAttachmentId = nil }
            }
        }
        // D. Tap pending video → VideoPreviewView
        .fullScreenCover(isPresented: Binding(
            get: { scrollState.videoToEdit != nil },
            set: { if !$0 { scrollState.videoToEdit = nil } }
        )) {
            if let url = scrollState.videoToEdit {
                MeeshyVideoEditorView(
                    url: url,
                    context: .message,
                    accentColor: accentColor,
                    onComplete: { _ in scrollState.videoToEdit = nil },
                    onCancel: { scrollState.videoToEdit = nil }
                )
            }
        }
        // D2. "Éditer" from the recent-media strip → the editor opens BEFORE
        // staging; the edited output goes through the same preparation pipeline
        // as a camera capture (the pre-edit original is never staged).
        .fullScreenCover(isPresented: Binding(
            get: { scrollState.recentImageToEdit != nil },
            set: { if !$0 { scrollState.recentImageToEdit = nil } }
        )) {
            if let image = scrollState.recentImageToEdit {
                MeeshyImageEditorView(image: image, context: .message, accentColor: accentColor, onAccept: { edited in
                    scrollState.recentImageToEdit = nil
                    handleCameraCapture(edited)
                }, onCancel: {
                    scrollState.recentImageToEdit = nil
                })
            }
        }
        .fullScreenCover(isPresented: Binding(
            get: { scrollState.recentVideoToEdit != nil },
            set: { if !$0 { scrollState.recentVideoToEdit = nil } }
        )) {
            if let url = scrollState.recentVideoToEdit {
                MeeshyVideoEditorView(
                    url: url,
                    context: .message,
                    accentColor: accentColor,
                    onComplete: { result in
                        scrollState.recentVideoToEdit = nil
                        handleCameraVideo(result.url)
                    },
                    onCancel: { scrollState.recentVideoToEdit = nil }
                )
            }
        }
        // E. Audio → MeeshyAudioEditorView
        .fullScreenCover(item: Binding(
            get: { scrollState.audioToEdit },
            set: { scrollState.audioToEdit = $0 }
        )) { target in
            MeeshyAudioEditorView(url: target.url, accentColor: accentColor, onConfirm: { acceptedURL, _, trimStart, trimEnd in
                let durationMs = Int((trimEnd - trimStart) * 1000)
                // Replace the edited audio chip in place — editing must never
                // spawn a second tray chip (same contract as image editing).
                let staleURL = composerState.applyEditedAudio(
                    attachmentId: target.id, editedURL: acceptedURL, durationMs: durationMs
                )
                if let staleURL {
                    try? FileManager.default.removeItem(at: staleURL)
                }
                scrollState.audioToEdit = nil
            }, onCancel: {
                scrollState.audioToEdit = nil
            })
        }
    }

    // MARK: - Recent Media Strip Selection

    /// Ingests a photo/video tapped in the composer's inline recent-media strip
    /// through the same preparation pipeline as a camera capture.
    func ingestRecentMediaPick(_ pick: RecentMediaPick) {
        switch pick {
        case .image(let image): handleCameraCapture(image)
        case .video(let url): handleCameraVideo(url)
        }
    }

    /// "Éditer" from the strip's long-press menu: opens the media editor on the
    /// resolved pick; the edited result is staged like a camera capture.
    func editRecentMediaPick(_ pick: RecentMediaPick) {
        switch pick {
        case .image(let image): scrollState.recentImageToEdit = image
        case .video(let url): scrollState.recentVideoToEdit = url
        }
    }

    /// Opens the full photo library with the strip's multi-selection already
    /// checked. The picker binding is primed with identifier-based items
    /// (`photoLibrary: .shared()` makes them match real assets); the priming
    /// echo on the selection onChange is swallowed via `photoPickerPriming`.
    /// The handoff is capped at the picker's `maxSelectionCount` (10). With no
    /// strip selection, stale primed items from a cancelled run are dropped so
    /// the picker opens clean.
    func openPhotoLibraryPreselecting(_ assetIds: [String]) {
        if !assetIds.isEmpty {
            let primed = assetIds.prefix(10).map { PhotosPickerItem(itemIdentifier: $0) }
            // Arm the echo-swallow ONLY when priming actually mutates the
            // binding — an unchanged binding (same picks re-handed after a
            // cancelled run) fires no onChange, and a stale armed flag would
            // swallow the user's real confirmation instead.
            composerState.photoPickerPriming = primed != composerState.selectedPhotoItems
            composerState.selectedPhotoItems = primed
        } else {
            composerState.selectedPhotoItems = []
        }
        composerState.showPhotoPicker = true
    }

    // MARK: - Contact Selection Handler

    func handleContactSelection(_ contact: SharedContact) {
        // For now, send the contact info as a text message
        var parts: [String] = [contact.fullName]
        for phone in contact.phoneNumbers { parts.append(phone) }
        for email in contact.emails { parts.append(email) }
        let contactText = parts.joined(separator: "\n")

        composerText.text = contactText
        HapticFeedback.success()
    }

    // MARK: - Pending Attachments Row (custom preview for UCB)
    private var pendingAttachmentsRow: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                pendingAttachmentsPreview
                if composerState.isLoadingMedia {
                    ProgressView()
                        .tint(Color(hex: accentColor))
                        .padding(.horizontal, 12)
                }
            }
            if composerState.isUploading, let progress = composerState.uploadProgress {
                UploadProgressBar(progress: progress, accentColor: accentColor)
                    .padding(.horizontal, 8)
                    .padding(.bottom, 4)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: composerState.isUploading)
    }

    // MARK: - Composer Reply Banner
    /// Titre du bandeau de réponse. Un mood échoé par le serveur peut avoir un
    /// `authorName` vide → libellé localisé "Humeur".
    func composerReplyTitle(_ reply: ReplyReference) -> String {
        if reply.isMe { return String(localized: "bubble.reply.you", defaultValue: "Vous", bundle: .main) }
        if !reply.authorName.isEmpty { return reply.authorName }
        if reply.moodEmoji != nil { return String(localized: "bubble.reply.mood", defaultValue: "Humeur", bundle: .main) }
        return reply.authorName
    }

    func composerReplyBanner(_ reply: ReplyReference) -> some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 2)
                .fill(Color(hex: reply.isMe ? accentColor : reply.authorColor))
                .frame(width: 3, height: 36)

            VStack(alignment: .leading, spacing: 2) {
                Text(composerReplyTitle(reply))
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .foregroundColor(Color(hex: reply.isMe ? accentColor : reply.authorColor))

                HStack(spacing: 4) {
                    if let emoji = reply.moodEmoji {
                        // Réponse à un mood : emoji + contenu entier + date.
                        Text(emoji)
                            .font(MeeshyFont.relative(12))
                        if let date = reply.storyPublishedAt {
                            Text(date, style: .relative)
                                .font(MeeshyFont.relative(11))
                                .foregroundColor(theme.textMuted)
                        }
                        if !reply.previewText.isEmpty {
                            Text(reply.previewText)
                                .font(MeeshyFont.relative(12))
                                .foregroundColor(theme.textSecondary)
                                .lineLimit(1)
                        }
                    } else {
                        if let attType = reply.attachmentType {
                            Image(systemName: composerReplyAttachmentIcon(attType))
                                .font(MeeshyFont.relative(10, weight: .medium))
                                .foregroundColor(theme.textSecondary)
                        }
                        Text(reply.previewText)
                            .font(MeeshyFont.relative(12))
                            .foregroundColor(theme.textSecondary)
                            .lineLimit(1)
                    }
                }
            }

            Spacer()

            // Rich attachment preview in composer reply banner
            if let attType = reply.attachmentType {
                composerReplyAttachmentPreview(type: attType, reply: reply)
            }

            Button {
                withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                    ReplyContextCleaner(conversationId: viewModel.conversationId)
                        .clear(pendingReplyReference: &composerState.pendingReplyReference)
                }
            } label: {
                Image(systemName: "xmark")
                    // Doctrine 82i : glyphe de chrome dans un cadre tap fixe 24×24 → figé.
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(theme.textMuted)
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(isDark ? Color.white.opacity(0.1) : Color.black.opacity(0.05)))
            }
            .accessibilityLabel(String(localized: "conversation.view.composer.cancel_reply", defaultValue: "Annuler la reponse", bundle: .main))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(theme.border(tint: accentColor, intensity: 0.3), lineWidth: 1)
                )
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "conversation.view.composer.reply_to", defaultValue: "Reponse a \(reply.isMe ? "vous" : reply.authorName): \(reply.previewText)", bundle: .main))
    }

    // MARK: - Edit Banner
    var composerEditBanner: some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 2)
                .fill(MeeshyColors.warning)
                .frame(width: 3, height: 36)

            Image(systemName: "pencil")
                .font(MeeshyFont.relative(14, weight: .semibold))
                .foregroundColor(MeeshyColors.warning)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(String(localized: "conversation.view.composer.edit_message", defaultValue: "Modifier le message", bundle: .main))
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .foregroundColor(MeeshyColors.warning)

                Text(composerState.editingOriginalContent ?? "")
                    .font(MeeshyFont.relative(12))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
            }

            Spacer()

            Button {
                cancelEdit()
            } label: {
                Image(systemName: "xmark")
                    // Doctrine 82i : glyphe de chrome dans un cadre tap fixe 24×24 → figé.
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(theme.textMuted)
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(isDark ? Color.white.opacity(0.1) : Color.black.opacity(0.05)))
            }
            .accessibilityLabel(String(localized: "conversation.view.composer.cancel_edit", defaultValue: "Annuler la modification", bundle: .main))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: MeeshyColors.warningHex))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(theme.border(tint: MeeshyColors.warningHex, intensity: 0.3), lineWidth: 1)
                )
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "conversation.view.composer.editing_in_progress", defaultValue: "Modification du message en cours", bundle: .main))
    }

    func submitEdit() {
        guard let messageId = composerState.editingMessageId else { return }
        let newContent = composerText.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !newContent.isEmpty else { return }

        // Don't send if content unchanged
        if newContent == composerState.editingOriginalContent {
            cancelEdit()
            return
        }

        let id = messageId
        cancelEdit()
        Task {
            await viewModel.editMessage(messageId: id, newContent: newContent)
        }
    }

    func cancelEdit() {
        withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
            composerState.editingMessageId = nil
            composerState.editingOriginalContent = nil
            composerText.text = ""
        }
    }

    func composerReplyAttachmentIcon(_ type: String) -> String {
        // Route through the SDK's canonical AttachmentKind (single
        // source of truth — see `AttachmentKind.swift`) instead of the
        // duplicated switch this method used to embed. Two-step fallback
        // so cached payloads carrying raw MIME (`"image/jpeg"`) still
        // resolve correctly until the next SDK round-trip rewrites
        // them as short kinds.
        if let exact = AttachmentKind(rawValue: type) { return exact.sfSymbolName }
        return AttachmentKind(mimeType: type).sfSymbolName
    }

    // MARK: - Rich Attachment Preview for Reply Banner
    @ViewBuilder
    func composerReplyAttachmentPreview(type: String, reply: ReplyReference) -> some View {
        let accent = Color(hex: reply.isMe ? accentColor : reply.authorColor)

        switch type {
        case "image":
            if let thumbUrl = reply.attachmentThumbnailUrl, !thumbUrl.isEmpty {
                CachedAsyncImage(url: thumbUrl, targetSize: CGSize(width: 40, height: 40)) {
                    accent.opacity(0.3)
                }
                .aspectRatio(contentMode: .fill)
                .frame(width: 40, height: 40)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .onTapGesture {
                    if let url = MeeshyConfig.resolveMediaURL(thumbUrl) {
                        composerState.previewMedia = PreviewMedia(url: url, type: "image")
                    }
                }
            }

        case "video":
            if let thumbUrl = reply.attachmentThumbnailUrl, !thumbUrl.isEmpty {
                ZStack {
                    CachedAsyncImage(url: thumbUrl, targetSize: CGSize(width: 40, height: 40)) {
                        accent.opacity(0.3)
                    }
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 40, height: 40)
                    .clipShape(RoundedRectangle(cornerRadius: 8))

                    Image(systemName: "play.circle.fill")
                        // Doctrine 86i : overlay play décoratif borné par la vignette fixe 40×40 → figé + masqué.
                        .font(.system(size: 18))
                        .foregroundStyle(.white, .black.opacity(0.4))
                        .accessibilityHidden(true)
                }
                .onTapGesture {
                    if let url = MeeshyConfig.resolveMediaURL(thumbUrl) {
                        composerState.previewMedia = PreviewMedia(url: url, type: "video")
                    }
                }
            } else {
                replyAttachmentFallbackBadge(icon: "video.fill", color: accent)
            }

        case "audio":
            HStack(spacing: 4) {
                Image(systemName: "play.fill")
                    // Doctrine 86i : glyphe décoratif du badge audio (waveform) → figé + masqué.
                    .font(.system(size: 8, weight: .bold))
                    .foregroundColor(accent.opacity(0.6))
                    .accessibilityHidden(true)

                HStack(spacing: 1.5) {
                    ForEach(0..<8, id: \.self) { i in
                        let h: CGFloat = [0.4, 0.7, 0.5, 1.0, 0.6, 0.9, 0.3, 0.5][i]
                        RoundedRectangle(cornerRadius: 1)
                            .fill(accent.opacity(0.35))
                            .frame(width: 2, height: 4 + 16 * h)
                    }
                }
                .frame(height: 22)
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(accent.opacity(0.08))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(accent.opacity(0.15), lineWidth: 0.5)
                    )
            )
            .onTapGesture {
                if let thumbUrl = reply.attachmentThumbnailUrl, let url = MeeshyConfig.resolveMediaURL(thumbUrl) {
                    composerState.previewMedia = PreviewMedia(url: url, type: "audio")
                }
            }

        case "location":
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(
                        LinearGradient(
                            colors: [MeeshyColors.success.opacity(0.15), MeeshyColors.success.opacity(0.08)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 40, height: 40)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(MeeshyColors.success.opacity(0.2), lineWidth: 0.5)
                    )

                VStack(spacing: 1) {
                    Image(systemName: "mappin.circle.fill")
                        // Doctrine 86i : glyphe décoratif borné par la vignette fixe 40×40 → figé + masqué.
                        .font(.system(size: 18))
                        .foregroundStyle(MeeshyColors.success, MeeshyColors.success.opacity(0.2))
                        .accessibilityHidden(true)
                    Circle()
                        .fill(MeeshyColors.success.opacity(0.3))
                        .frame(width: 6, height: 3)
                        .scaleEffect(x: 1.8, y: 1)
                }
            }

        case "file":
            replyAttachmentFallbackBadge(icon: "doc.fill", color: MeeshyColors.info)

        default:
            EmptyView()
        }
    }

    private func replyAttachmentFallbackBadge(icon: String, color: Color) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8)
                .fill(color.opacity(0.1))
                .frame(width: 40, height: 40)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(color.opacity(0.2), lineWidth: 0.5)
                )
            Image(systemName: icon)
                // Doctrine 86i : glyphe décoratif borné par le badge fixe 40×40 → figé + masqué.
                .font(.system(size: 16))
                .foregroundColor(color.opacity(0.7))
                .accessibilityHidden(true)
        }
    }

    // MARK: - Pending Attachments Preview
    var pendingAttachmentsPreview: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(composerState.preparingAttachments) { prep in
                    AttachmentLoadingTile(prep: prep) {
                        cancelPreparation(prep)
                    }
                }
                ForEach(composerState.pendingAttachments) { attachment in
                    attachmentPreviewTile(attachment)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
        .frame(height: 100)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(theme.border(tint: accentColor, intensity: 0.3), lineWidth: 1)
                )
        )
    }

    // MARK: - Attachment Preview Tile
    func attachmentPreviewTile(_ attachment: MessageAttachment) -> some View {
        VStack(spacing: 4) {
            ZStack(alignment: .topTrailing) {
                // Tappable preview area
                Button {
                    HapticFeedback.light()
                    handleAttachmentPreviewTap(attachment)
                } label: {
                    ZStack {
                        if let thumb = composerState.pendingThumbnails[attachment.id] {
                            Image(uiImage: thumb)
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                                .frame(width: 56, height: 56)
                                .clipShape(RoundedRectangle(cornerRadius: 10))

                            if attachment.type == .video {
                                Image(systemName: "play.circle.fill")
                                    // Doctrine 86i : overlay décoratif borné par la tuile fixe 56×56 → figé + masqué.
                                    .font(.system(size: 20))
                                    .foregroundStyle(.white, .black.opacity(0.4))
                                    .accessibilityHidden(true)
                            } else if attachment.type == .image {
                                Image(systemName: "eye.fill")
                                    // Doctrine 86i : indicateur décoratif borné par la tuile fixe 56×56 → figé + masqué.
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(.white)
                                    .padding(4)
                                    .background(Circle().fill(.black.opacity(0.4)))
                                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                                    .padding(3)
                                    .accessibilityHidden(true)
                            }
                        } else if attachment.type == .audio {
                            audioTileFallback(attachment)
                        } else if attachment.type == .location {
                            locationTileFallback()
                        } else {
                            RoundedRectangle(cornerRadius: 10)
                                .fill(
                                    LinearGradient(
                                        colors: [Color(hex: attachment.thumbnailColor), Color(hex: attachment.thumbnailColor).opacity(0.7)],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .frame(width: 56, height: 56)

                            Image(systemName: iconForAttachmentType(attachment.type))
                                // Doctrine 86i : glyphe de type décoratif borné par la tuile fixe 56×56 → figé + masqué
                                // (le libellé sous la tuile porte le nom du fichier).
                                .font(.system(size: 22))
                                .foregroundColor(.white)
                                .accessibilityHidden(true)
                        }
                    }
                    .frame(width: 56, height: 56)
                }

                // Delete button — top-right corner
                Button {
                    removePendingAttachment(attachment)
                } label: {
                    Image(systemName: "xmark")
                        // Doctrine 82i : glyphe de suppression dans un cadre tap fixe 18×18 → figé.
                        .font(.system(size: 8, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 18, height: 18)
                        .background(
                            Circle()
                                .fill(MeeshyColors.error)
                                .shadow(color: MeeshyColors.error.opacity(0.4), radius: 3, y: 1)
                        )
                }
                .accessibilityLabel(String(localized: "conversation.view.composer.delete_attachment", defaultValue: "Supprimer \(labelForAttachment(attachment))", bundle: .main))
                .offset(x: 5, y: -5)
            }

            Text(labelForAttachment(attachment))
                .font(MeeshyFont.relative(10, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .lineLimit(1)
                .frame(width: 60)
        }
        // Long-press → full-screen quick-look (image enlarged / video playing),
        // mirroring the recent-media strip's context-menu preview pattern
        // (RecentMediaStrip.swift). Staged attachments already have their
        // media locally (pendingMediaFiles), so this needs no PHAsset
        // resolution — it's a much lighter version of the same idea.
        .contextMenu {
            Button(role: .destructive) {
                removePendingAttachment(attachment)
            } label: {
                Label(
                    String(localized: "conversation.view.composer.delete_attachment", defaultValue: "Supprimer \(labelForAttachment(attachment))", bundle: .main),
                    systemImage: "trash"
                )
            }
        } preview: {
            if attachment.type == .image || attachment.type == .video {
                AttachmentQuickLookPreview(
                    kind: attachment.type == .video ? .video : .image,
                    fileURL: composerState.pendingMediaFiles[attachment.id],
                    thumbnail: composerState.pendingThumbnails[attachment.id]
                )
            }
        }
    }

    /// Removes a staged attachment: drops it from the tray, deletes its temp
    /// file, and stops playback if it was the currently-playing audio note.
    /// Shared by the tile's delete button and its long-press menu action.
    private func removePendingAttachment(_ attachment: MessageAttachment) {
        HapticFeedback.light()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            let id = attachment.id
            if pendingAudioPlayer.isPlaying { pendingAudioPlayer.stop() }
            composerState.pendingAttachments.removeAll { $0.id == id }
            if let url = composerState.pendingMediaFiles.removeValue(forKey: id) {
                try? FileManager.default.removeItem(at: url)
            }
            composerState.pendingThumbnails.removeValue(forKey: id)
        }
    }

    // MARK: - Preparation Cancellation
    func cancelPreparation(_ prep: PreparingAttachment) {
        // Mark the in-flight prep as failed so any waiter resumes immediately
        // and the observation task drops it from `preparingAttachments`. The
        // Task spawned inside `AttachmentPreparationService` keeps running but
        // can no longer write back because the handle is gone from state.
        composerState.preparingAttachments.removeAll { $0.id == prep.id }
    }

    // MARK: - Attachment Preview Tap Handler
    func handleAttachmentPreviewTap(_ attachment: MessageAttachment) {
        switch attachment.type {
        case .image:
            // Guard at the source: only open the editor when a thumbnail
            // genuinely exists to show. The fullScreenCover below has its own
            // defense-in-depth fallback for the (rarer) case where the
            // thumbnail vanishes AFTER presentation starts, but there is no
            // reason to open the cover at all for an id that has none now.
            guard composerState.pendingThumbnails[attachment.id] != nil else { return }
            scrollState.editingPendingAttachmentId = attachment.id
        case .video:
            if let url = composerState.pendingMediaFiles[attachment.id] {
                scrollState.videoToEdit = url
            }
        case .audio:
            if let url = composerState.pendingMediaFiles[attachment.id] {
                scrollState.audioToEdit = PendingAudioEdit(id: attachment.id, url: url)
            }
        default:
            break
        }
    }

    /// Dismissable full-screen fallback for the (rare) race where a pending
    /// attachment's thumbnail is gone by the time its editor cover presents —
    /// see the doc-comment on the "C. Tap pending image" fullScreenCover.
    private func attachmentPreviewUnavailableFallback(onDismiss: @escaping () -> Void) -> some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "photo.badge.exclamationmark")
                    .font(.system(size: 40))
                    .foregroundColor(.white.opacity(0.7))
                Text(String(localized: "conversation.view.composer.attachmentUnavailable",
                            defaultValue: "Pi\u{00E8}ce jointe indisponible", bundle: .main))
                    .font(MeeshyFont.relative(15, weight: .medium))
                    .foregroundColor(.white)
                Button(action: onDismiss) {
                    Text(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
                        .font(MeeshyFont.relative(14, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 10)
                        .background(Capsule().fill(.white.opacity(0.15)))
                }
            }
        }
    }

    // MARK: - Rich Tile Fallbacks

    private func audioTileFallback(_ attachment: MessageAttachment) -> some View {
        let color = Color(hex: attachment.thumbnailColor)
        let isPlaying = pendingAudioPlayer.isPlaying
        return ZStack {
            RoundedRectangle(cornerRadius: 10)
                .fill(
                    LinearGradient(
                        colors: [color, color.opacity(0.7)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 56, height: 56)

            VStack(spacing: 3) {
                HStack(spacing: 1.5) {
                    ForEach(0..<7, id: \.self) { i in
                        let h: CGFloat = [0.3, 0.8, 0.5, 1.0, 0.4, 0.9, 0.6][i]
                        RoundedRectangle(cornerRadius: 1)
                            .fill(Color.white.opacity(isPlaying ? 0.9 : 0.6))
                            .frame(width: 2, height: 4 + 14 * h)
                    }
                }
                .frame(height: 20)

                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    // Doctrine 86i : glyphe décoratif borné par la tuile fixe 56×56 → figé + masqué.
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white.opacity(0.8))
                    .accessibilityHidden(true)
            }
        }
    }

    private func locationTileFallback() -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10)
                .fill(
                    LinearGradient(
                        colors: [MeeshyColors.success, MeeshyColors.successDeep],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 56, height: 56)

            VStack(spacing: 2) {
                Image(systemName: "mappin.circle.fill")
                    // Doctrine 86i : glyphe décoratif borné par la tuile fixe 56×56 → figé + masqué.
                    .font(.system(size: 22))
                    .foregroundStyle(.white, .white.opacity(0.3))
                    .accessibilityHidden(true)
                Circle()
                    .fill(Color.white.opacity(0.3))
                    .frame(width: 8, height: 4)
                    .scaleEffect(x: 1.8, y: 1)
            }
        }
    }

    func iconForAttachmentType(_ type: MessageAttachment.AttachmentType) -> String {
        switch type {
        case .image: return "photo.fill"
        case .video: return "video.fill"
        case .audio: return "waveform"
        case .file: return "doc.fill"
        case .location: return "location.fill"
        }
    }

    func labelForAttachment(_ attachment: MessageAttachment) -> String {
        switch attachment.type {
        case .image: return String(localized: "attachment.label.photo", defaultValue: "Photo", bundle: .main)
        case .video: return String(localized: "attachment.label.video", defaultValue: "Video", bundle: .main)
        case .audio: return attachment.durationFormatted ?? String(localized: "attachment.label.audio", defaultValue: "Audio", bundle: .main)
        case .file: return attachment.originalName.isEmpty ? String(localized: "attachment.label.file", defaultValue: "File", bundle: .main) : attachment.originalName
        case .location: return String(localized: "attachment.label.location", defaultValue: "Location", bundle: .main)
        }
    }

    // See ConversationView+AttachmentHandlers.swift for: startRecording, stopAndPreviewRecording, stopAndSendRecording, sendMessageWithAttachments, formatRecordingTime, handlePhotoSelection, generateVideoThumbnail, handleFileImport, mimeTypeForURL, getFileSize, addCurrentLocation, handleCameraCapture, sendMessage
}

