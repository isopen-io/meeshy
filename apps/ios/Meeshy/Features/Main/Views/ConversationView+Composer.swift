// MARK: - Extracted from ConversationView.swift
import SwiftUI
import Combine
import PhotosUI
import AVFoundation
import Contacts
import os
import MeeshySDK
import MeeshyUI

// MARK: - Composer, Attachments & Recording
extension ConversationView {

    // MARK: - Themed Composer (powered by UniversalComposerBar)
    //
    // Garde anti-débordement de pile : chaque modificateur système ajoute un
    // niveau de générique `ModifiedContent<…>`, et la résolution runtime du type
    // opaque (`swift_getTypeByMangledName`, ~17 Ko de pile par niveau) dépassait
    // les 1008 Ko du thread principal (device iPhone 16 Pro Max, 2026-09-03).
    // DÉCOUPER DES PROPRIÉTÉS NE DÉCOUPE PAS LE TYPE. La chaîne est donc faite de
    // frontières NOMINALES : une vue (`ConversationComposerCore`) et quatre
    // `ViewModifier` (`ConversationComposerLayers.swift`, `+GuestAttachments`),
    // chacun une struct à son propre nœud d'attribut, au `body` borné. Garde :
    // `ConversationComposerChainErasureSourceGuardTests`.
    var themedComposer: some View {
        ConversationComposerCore(
            recorder: audioRecorder,
            composerText: composerText,
            isFocusedOrRequested: isTyping || composerState.focusRequested,
            replyToId: outgoingReplyRoute.replyToId,
            animationKeys: composerAnimationKeys,
            bar: { composerBar(textBinding: $0, isRecording: $1, recordingDuration: $2, audioLevels: $3) },
            onReplyRoute: { viewModel.armReplyContagion(quoting: $0) },
            onFold: { closeComposerEmojiPanel() }
        )
        .modifier(ConversationComposerPickers(
            composerState: $composerState, accentColor: accentColor,
            onFileImport: { handleFileImport($0) }, onCapture: { stageCapture($0) },
            onLocation: { handleLocationSelection($0) }, onContact: { handleContactSelection($0) },
            onPhotos: { handlePhotoSelection($0) }))
        .modifier(ConversationComposerGuestSheet(
            composerState: $composerState, conversationTitle: liveConversation?.name ?? "",
            allowance: guestAttachmentAllowance, onAccepted: { handleFileImport(.success($0)) }))
        .modifier(ConversationComposerStickerSheet(
            composerState: $composerState, accentColor: accentColor, onChoice: { sendStickerChoice($0) }))
        .modifier(ConversationComposerEditingCovers(
            composerState: $composerState, scrollState: $scrollState, accentColor: accentColor,
            onRetouched: { replacePendingWithRetouchedPieces($0) }, onSceneMedia: { stageSceneMedia($0) },
            onRemovePiece: { detachPendingPieces([$0]) }))
    }

    /// Accent RÉSOLU que l'hôte remet au composer : le bleu de marque quand un
    /// effet est en attente, sinon celui de la conversation. Sans dériver
    /// `composerSecondaryColor` de CETTE valeur, le second arrêt du dégradé
    /// resterait `secondaryColor` pendant que le premier bascule — un dégradé
    /// HYBRIDE qui a l'air d'un bug de teinte plutôt que d'un état volontaire.
    ///
    /// Les PROTECTIONS ne se substituent plus ici (#7667) : la barre lit ses
    /// propres bascules et prend la teinte de la plus forte (éphémère > vue
    /// unique > flou, `ComposerProtection.dominant`). Substituer chez l'hôte
    /// laissait la vue unique sans couleur et les quatre autres hôtes de la
    /// barre sans aucune.
    private var composerAccent: String {
        viewModel.pendingEffects.hasAnyEffect ? MeeshyColors.brandPrimaryHex : accentColor
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

    private var composerAnimationKeys: ComposerBarAnimationKeys {
        ComposerBarAnimationKeys(
            ephemeralArmed: viewModel.ephemeralChoice != nil,
            blurArmed: viewModel.isBlurEnabled,
            viewOnceArmed: viewModel.isViewOnceEnabled,
            hasAnyEffect: viewModel.pendingEffects.hasAnyEffect,
            armedReplyContagion: viewModel.armedReplyContagion
        )
    }

    /// **LE VUMÈTRE NE FAIT PLUS BATTRE TOUTE LA CONVERSATION** (#6226).
    ///
    /// `AudioRecorderManager` publie `duration` ET `audioLevels` vingt fois par
    /// seconde : tenu en `@StateObject` par la racine, il ré-évaluait tout
    /// l'écran à cette cadence pendant un vocal. La racine le POSSÈDE (`@State`)
    /// sans s'y ABONNER ; `ComposerAudioHost` en est l'unique observateur, comme
    /// `ComposerTextHost` pour la frappe (#4105). Appeler `startRecording` ou
    /// `stopRecording` n'exige aucun abonnement.
    ///
    /// ⚠️ NE PAS câbler `viewModel.isSending` ici : il reste true pendant tout le
    /// cycle REST(12 s)+repli socket(10 s) d'UN message — le bouton d'envoi serait
    /// mort ~22 s par message en réseau dégradé (2026-07-02). Les double-taps
    /// restent couverts par le champ vidé synchrone et la garde `isUploading`.
    /// Aucun dédoublonnage par CONTENU : des emojis identiques partent en série (#7985).
    func composerBar(
        textBinding: Binding<String>,
        isRecording: Bool,
        recordingDuration: TimeInterval,
        audioLevels: [CGFloat]
    ) -> UniversalComposerBar {
        let isEditing = composerState.editingMessageId != nil
        return UniversalComposerBar(
            style: .light,
            mode: .message,
            onIngest: { items in ingestRespectingGuestAllowance(items) },
            accentColor: composerAccent,
            secondaryColor: composerSecondaryColor,
            forceHideAttachment: previewMode,
            voiceDoor: guestAttachmentAllowance.offersVoiceRecording ? .byMode : .closed,
            selectedLanguage: composerState.selectedLanguage,
            onLanguageChange: { composerState.selectedLanguage = $0 },
            onFocusChange: { composerFocusChanged($0) },
            onLocationRequest: guestDoor(guestAttachmentAllowance.offersContactsAndPlaces) { composerState.showLocationPicker = true },
            textBinding: textBinding,
            editBanner: isEditing ? ComposerBarSlot.erase(composerEditBanner) : nil,
            replyBanner: isEditing ? nil : composerState.pendingReplyReference.map { ComposerBarSlot.erase(composerReplyBanner($0)) },
            customAttachmentsPreview: showsPendingAttachmentsRow ? ComposerBarSlot.erase(pendingAttachmentsRow) : nil,
            isEditMode: isEditing,
            onCustomSend: { composerCustomSend() },
            onTextChange: { viewModel.onTextChanged($0) },
            onStartRecording: { startRecording() },
            onStopRecordingToAttachment: { stopRecordingToAttachment() },
            onSendRecording: { stopAndSendRecording() },
            onCancelRecording: { audioRecorder.cancelRecording() },
            externalIsRecording: isRecording,
            externalRecordingDuration: recordingDuration,
            externalAudioLevels: audioLevels,
            externalHasContent: !composerState.pendingAttachments.isEmpty || isRecording || composerState.pendingPlace != nil,
            onPhotoLibrary: guestDoor(guestAttachmentAllowance.offersVisualMedia) { openPhotoLibraryPreselecting([]) },
            onCamera: guestDoor(guestAttachmentAllowance.offersVisualMedia) { composerState.showCamera = true },
            onFilePicker: guestDoor(guestAttachmentAllowance.offersFiles) { openFileDoor() },
            onContactPicker: guestDoor(guestAttachmentAllowance.offersContactsAndPlaces) { composerState.showContactPicker = true },
            onShowAttachments: { closeComposerEmojiPanel() },
            onRequestTextEmoji: { toggleComposerEmojiPanel() },
            onRequestStickerPicker: guestDoor(guestAttachmentAllowance.offersVisualMedia) { composerState.showStickerPicker = true },
            onSendTextSticker: textStickerDoor,
            onRecentMediaSelected: recentMediaPickDoor,
            onRecentMediaEdit: recentMediaEditDoor,
            onRecentLibraryAssetSelected: recentLibraryAssetDoor,
            recentAttachedAssetIds: Set(composerState.attachedLibraryAssetIds),
            onPhotoLibraryPreselecting: photoLibraryPreselectingDoor,
            injectedEmoji: $composerState.emojiToInject,
            ephemeralChoice: $viewModel.composerEphemeralChoice,
            hideEphemeral: isEditing,
            isBlurEnabled: $viewModel.composerBlurEnabled,
            hideBlur: isEditing,
            isViewOnceEnabled: $viewModel.composerViewOnceEnabled,
            hideViewOnce: isEditing,
            imposedProtection: isEditing ? .none : viewModel.replyImposedProtection,
            pendingEffects: $viewModel.pendingEffects,
            hideEffects: isEditing,
            focusTrigger: $composerState.focusRequested
        )
    }

    private var showsPendingAttachmentsRow: Bool {
        !composerState.pendingAttachments.isEmpty
            || !composerState.preparingAttachments.isEmpty
            || composerState.isLoadingMedia
            || composerState.pendingPlace != nil
    }

    private func composerFocusChanged(_ focused: Bool) {
        isTyping = focused
        if focused {
            withAnimation { composerState.showOptions = false }
        } else {
            composerText.flushPendingChange()
        }
    }

    private func composerCustomSend() {
        if composerState.editingMessageId != nil {
            submitEdit()
        } else if audioRecorder.isRecording {
            stopAndSendRecording()
        } else {
            sendMessageWithAttachments()
        }
    }

    /// Le carrousel de pièces jointes, le repli de la barre et le recul du fil
    /// referment le panneau emoji : jamais deux surfaces d'entrée empilées sous
    /// la barre.
    func closeComposerEmojiPanel() {
        guard composerState.showTextEmojiPicker else { return }
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            composerState.showTextEmojiPicker = false
        }
    }

    private func toggleComposerEmojiPanel() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            composerState.showTextEmojiPicker.toggle()
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

    /// Un média de la grille entre dans la zone d'attachement AVEC son
    /// identifiant (#9683) : sa tuile se marque, et ne se reprend pas tant
    /// que la pièce reste dans la zone. Une photo est préparée depuis ses
    /// octets d'origine, comme une photo du sélecteur système.
    func ingestRecentLibraryAsset(_ asset: RecentMediaAsset) {
        guard !composerState.attachedLibraryAssetIds.contains(asset.assetId) else {
            if case .video(let url) = asset.payload { try? FileManager.default.removeItem(at: url) }
            return
        }
        let prep: PreparingAttachment
        switch asset.payload {
        case .imageData(let data):
            prep = AttachmentPreparationService.shared.prepareImageData(data, context: .message, accentColor: accentColor)
            trackPreparation(prep)
        case .video(let url):
            prep = handleCameraVideo(url)
        }
        composerState.linkLibraryAsset(asset.assetId, to: prep.id)
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
    ///
    /// **Les assets déjà joints sont présélectionnés AVANT la sélection de la
    /// grille** (#9683) : le sélecteur les montre cochés, et ne les rend pas
    /// comme une sélection nouvelle — `handlePhotoSelection` écarte, à
    /// l'ingestion, tout identifiant déjà dans la zone.
    func openPhotoLibraryPreselecting(_ assetIds: [String]) {
        let preselection = composerState.primePickerPreselection(selection: assetIds)
        if !preselection.isEmpty {
            let primed = preselection.map { PhotosPickerItem(itemIdentifier: $0) }
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

    /// Le contact choisi part en PIÈCE JOINTE vCard (#8101) — plus jamais en
    /// texte collé. Il rejoint le tiroir par la même voie qu'un fichier
    /// importé : bulle optimiste, brouillon durable et envoi inchangés.
    func handleContactSelection(_ contact: CNContact) {
        guard let export = ContactCardExporter.export(contact) else {
            FeedbackToastManager.shared.showError(
                String(localized: "contact-card.export-failed", defaultValue: "Ce contact ne peut pas être partagé", bundle: .main)
            )
            return
        }
        do {
            let url = try ContactCardExporter.writeTemporaryFile(export)
            appendPendingFileAttachment(tempURL: url, fileName: export.fileName, mimeType: ContactCardMime.mimeType, fileSize: export.data.count)
            HapticFeedback.light()
        } catch {
            Logger.messages.error("Contact card export failed: \(error.localizedDescription, privacy: .public)")
            FeedbackToastManager.shared.showError(
                String(localized: "contact-card.export-failed", defaultValue: "Ce contact ne peut pas être partagé", bundle: .main)
            )
        }
    }
}
