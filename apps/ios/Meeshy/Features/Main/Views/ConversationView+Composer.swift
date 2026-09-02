// MARK: - Extracted from ConversationView.swift
import SwiftUI
import Combine
import PhotosUI
import AVFoundation
import MeeshySDK
import MeeshyUI

// MARK: - Composer, Attachments & Recording
extension ConversationView {

    // MARK: - Themed Composer (powered by UniversalComposerBar)
    //
    // Garde anti-débordement de pile (2026-08-16) : cette propriété empilait
    // ~13 modificateurs système (.sheet ×2, .fullScreenCover ×6, .photosPicker,
    // .fileImporter, .animation ×3, .adaptiveOnChange) sur UN SEUL `some View`.
    // Chaque modificateur ajoute un niveau de générique `ModifiedContent<…>`
    // distinct ; à la profondeur atteinte, la résolution runtime du type opaque
    // (swift_getTypeByMangledName, récursive) dépassait la pile du thread
    // principal — crash reproductible EXC_BAD_ACCESS / « Could not determine
    // thread index for stack guard region » à CHAQUE ouverture de conversation
    // (7 crashs le 2026-08-16, même frame faulting : themedComposer.getter →
    // __swift_instantiateConcreteTypeFromMangledNameV2). Fractionner en
    // plusieurs propriétés `some View` distinctes donne à chacune son propre
    // accesseur de type opaque au lieu d'un mangled name unique géant — la
    // récursion runtime se répartit sur plusieurs appels bornés au lieu d'un
    // seul appel non borné.
    var themedComposer: AnyView {
        AnyView(composerEditingCovers(composerStickerSheet(composerPickersAndSheets(composerCore))))
    }

    /// Accent RÉSOLU du composer : substitué (éphémère → rouge d'alerte, flou →
    /// accent de traçage, effet en attente → bleu de marque) sinon celui de la
    /// conversation. Sans dériver `composerSecondaryColor` de CETTE valeur, le
    /// second arrêt du dégradé reste `secondaryColor` (celui de la conversation)
    /// pendant que le premier bascule sur une teinte de garde — un dégradé
    /// HYBRIDE qui a l'air d'un bug de teinte plutôt que d'un état volontaire.
    private var composerAccent: String {
        viewModel.ephemeralDuration != nil ? MeeshyColors.errorHex
        : viewModel.isBlurEnabled ? MeeshyColors.trackingAccentHex
        : viewModel.pendingEffects.hasAnyEffect ? MeeshyColors.brandPrimaryHex
        : accentColor
    }

    /// Second arrêt du dégradé servi au composer. Dérivé de `composerAccent`
    /// par la formule de palette du SDK (`secondary = shiftHue(primary, +30°)`)
    /// dès que l'accent est substitué ; sinon on garde `secondaryColor` de la
    /// conversation (déjà cohérent avec `accentColor`, pas besoin de le recalculer).
    private var composerSecondaryColor: String {
        composerAccent == accentColor
            ? secondaryColor
            : DynamicColorGenerator.hueShiftedHex(composerAccent, degrees: 30)
    }

    private var composerCore: some View {
        ComposerTextHost(model: composerText) { textBinding in
            UniversalComposerBar(
            style: .light,
            mode: .message,
            // Dépôt (Files / Finder) et collage d'URL `file://` résolus par la
            // barre : chaque `.file` est DÉJÀ copié dans notre conteneur, cette
            // surface en devient propriétaire et route vers ses pipelines
            // existants (déclaré avant `accentColor` → doit apparaître ici pour
            // l'ordre d'arguments de l'initialiseur memberwise synthétisé).
            onIngest: { items in handleComposerIngest(items) },
            accentColor: composerAccent,
            secondaryColor: composerSecondaryColor,
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
                                        || composerState.isLoadingMedia
                                        || composerState.pendingPlace != nil)
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
            // `pendingPlace` inclus (parité PostDetailView / StoryViewerView) :
            // sans lui le bouton d'envoi reste inactif pour un message
            // « lieu seul », que les gardes acceptent pourtant désormais.
            externalHasContent: !composerState.pendingAttachments.isEmpty || audioRecorder.isRecording || composerState.pendingPlace != nil,
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
            // Tuile « Sticker » (#4823) : la palette monte en feuille ; ce
            // qu'elle rend part comme un MESSAGE (`ConversationView+Sticker`).
            onRequestStickerPicker: { composerState.showStickerPicker = true },
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
    }

    /// 2e maillon de la chaîne (voir garde anti-débordement sur `themedComposer`) :
    /// pickers, sheets légers et l'unique fullScreenCover caméra.
    private func composerPickersAndSheets<Content: View>(_ content: Content) -> some View {
        content
        .sheet(isPresented: $viewModel.showEffectsPicker) {
            EffectsPickerView(effects: $viewModel.pendingEffects, accentColor: accentColor)
        }
        // `photoLibrary: .shared()` est requis pour la présélection : les
        // PhotosPickerItem(itemIdentifier:) injectés depuis le strip ne
        // matchent les assets du picker que sur la photothèque partagée.
        .photosPicker(isPresented: $composerState.showPhotoPicker, selection: $composerState.selectedPhotoItems, maxSelectionCount: ConversationComposerState.maxMediaSelection, matching: .any(of: [.images, .videos]), photoLibrary: .shared())
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
            LocationPickerView(accentColor: accentColor) { place in
                handleLocationSelection(place)
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
    }

    /// Maillon dédié de la chaîne (voir garde anti-débordement sur
    /// `themedComposer`) : la palette de stickers (#4823). Un maillon à part
    /// plutôt qu'un huitième modificateur sur le précédent — chaque maillon
    /// garde son propre accesseur de type opaque, borné.
    ///
    /// La feuille se FERME au choix : dans une conversation un sticker est un
    /// message à part entière, pas une décoration qu'on empile sur une scène.
    /// Les trois injecteurs sont ceux du composer de story
    /// (`MeeshyComposerHost+Surfaces`) — sans `storyStickerLibraryProvided`,
    /// l'onglet « Mes stickers » n'est pas rendu ; sans `storyPasteProvided`,
    /// sa capsule « Coller » non plus ; sans `stickerNearbyPlacesProvided`,
    /// l'onglet « Lieu » est absent (loi 4, jamais grisé).
    private func composerStickerSheet<Content: View>(_ content: Content) -> some View {
        content
        .sheet(isPresented: $composerState.showStickerPicker) {
            StickerPickerView(onStickerSelected: { emoji in
                composerState.showStickerPicker = false
                sendEmojiSticker(emoji)
            }, onLibraryStickerSelected: { item in
                composerState.showStickerPicker = false
                sendLibrarySticker(item)
            }, onTemplateSelected: { gabarit, emplacements in
                composerState.showStickerPicker = false
                sendTemplateSticker(gabarit, slots: emplacements)
            }, onLocationTemplateSelected: { lieu, gabarit in
                composerState.showStickerPicker = false
                sendLocationTemplateSticker(place: lieu, template: gabarit)
            })
            .storyPasteProvided()
            .storyStickerLibraryProvided()
            .stickerNearbyPlacesProvided()
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }

    /// 3e maillon de la chaîne (voir garde anti-débordement sur `themedComposer`) :
    /// les 5 fullScreenCover d'édition de pièces jointes en attente — le groupe
    /// le plus dense en types de closures distincts (un par éditeur média).
    private func composerEditingCovers<Content: View>(_ content: Content) -> some View {
        content
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
    /// The handoff is capped at the picker's `maxSelectionCount`
    /// (`ConversationComposerState.maxMediaSelection`). With no strip
    /// selection, stale primed items from a cancelled run are dropped so
    /// the picker opens clean.
    func openPhotoLibraryPreselecting(_ assetIds: [String]) {
        if !assetIds.isEmpty {
            let primed = assetIds.prefix(ConversationComposerState.maxMediaSelection).map { PhotosPickerItem(itemIdentifier: $0) }
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
}
