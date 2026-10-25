// MARK: - Extracted from ConversationView.swift
import SwiftUI
import UIKit
import PhotosUI
import AVFoundation
import ImageIO
import Combine
import MeeshySDK
import MeeshyUI
import os

// MARK: - Recording, Sending & Attachment Handlers
extension ConversationView {

    /// Transcription locale des vocaux (#4948) — singleton app, comme
    /// `presenceManager` : l'extension ne peut pas déclarer de stockage.
    var voiceNoteTranscriber: any VoiceNoteLocalTranscribing { VoiceNoteLocalTranscriber.shared }

    /// Pose les transcriptions locales sur la bulle `tempId` — par pièce ET
    /// par message (le chemin mono-audio lit `messageTranscriptions[msg.id]`).
    /// Idempotent : appelé dans le slice de l'insert optimiste pour ce qui est
    /// déjà connu, puis à l'envoi pour ce qui est arrivé entre-temps.
    func attachLocalTranscriptions(_ transcriptions: [MessageTranscription], tempId: String) {
        LocalTranscriptionPlacement.place(transcriptions, tempId: tempId, on: viewModel)
    }

    /// Rollback de la tuile de lieu (`SendPlaceTileLaw`) : retirée AU TAP
    /// avec le texte, elle ne revient que si l'envoi qui la porte a échoué.
    func restorePlaceTile(_ snapshot: SharedPlace?, sent: Bool) {
        guard let restored = SendPlaceTileLaw.restoration(of: snapshot, sent: sent, current: composerState.pendingPlace) else { return }
        withAnimation { composerState.pendingPlace = restored }
    }

    // MARK: - Recording Functions
    func startRecording() {
        audioRecorder.startRecording()
        HapticFeedback.medium()
        // #9784 — la prise se suit dans l'îlot quand on quitte l'app, et s'y
        // arrête par les MÊMES gestes que le composeur.
        let recorder = audioRecorder
        VoiceRecordingLiveActivityCoordinator.shared.track(
            recorder: recorder,
            conversationId: viewModel.conversationId,
            title: viewModel.currentConversationName,
            onStop: { _ = stopRecordingToAttachment() },
            onCancel: { recorder.cancelRecording() }
        )
    }

    /// Stop the recorder and drop the audio into the composer's attachment
    /// tray — editable before sending (tap the tray chip to trim/preview).
    /// Nothing is sent. A recording shorter than 0.5 s is discarded instead.
    /// Returns `true` when an attachment was placed.
    @discardableResult
    func stopRecordingToAttachment() -> Bool {
        guard audioRecorder.duration > 0.5 else {
            audioRecorder.cancelRecording()
            return false
        }
        let durationMs = Int(audioRecorder.duration * 1000)
        let url = audioRecorder.stopRecording()
        let audioAttachment = MessageAttachment.audio(durationMs: durationMs, color: accentColor)
        composerState.pendingMediaFiles[audioAttachment.id] = url
        composerState.pendingAttachments.append(audioAttachment)
        // Transcription SUR L'APPAREIL dès l'arrêt (#4948, D-AUDIO-01) : elle
        // tourne pendant que l'utilisateur relit ou tape, pour que la bulle
        // parte avec son texte et que le serveur n'ait plus qu'à confirmer.
        if let url {
            voiceNoteTranscriber.beginTranscription(
                attachmentId: audioAttachment.id, audioURL: url,
                durationMs: durationMs, languageCode: composerState.selectedLanguage
            )
        }
        return true
    }

    /// Stop the recorder and send the voice message immediately (raw).
    func stopAndSendRecording() {
        guard stopRecordingToAttachment() else { return }
        sendMessageWithAttachments()
    }

    func sendMessageWithAttachments() {
        let text = composerText.text.trimmingCharacters(in: .whitespacesAndNewlines)
        Logger.messages.info("SendTap composer tap convId=\(viewModel.conversationId, privacy: .public) isUploading=\(composerState.isUploading, privacy: .public) textLen=\(text.count, privacy: .public) pendingAttachments=\(composerState.pendingAttachments.count, privacy: .public) vmInFlightSends=\(viewModel.sendActivity.inFlight, privacy: .public)")
        guard !composerState.isUploading else {
            Logger.messages.error("SendTap BLOCKED guard=isUploading convId=\(viewModel.conversationId, privacy: .public)")
            return
        }
        let place = composerState.pendingPlace
        guard SendEligibility.canSend(text: text, attachmentIds: composerState.pendingAttachments.map(\.id), location: place) else {
            Logger.messages.error("SendTap BLOCKED guard=emptyContent convId=\(viewModel.conversationId, privacy: .public)")
            return
        }

        let route = outgoingReplyRoute
        let attachments = composerState.pendingAttachments
        let plan = MultiAttachmentSendPlanner.plan(attachments: attachments, text: text, hasReply: route.hasReply)
        guard !promptsVoiceConsent(for: plan) else { return }

        let intent = AttachmentSendIntent(
            plan: plan,
            route: route,
            relation: ComposerSendRelation.of(route, citing: outgoingAttachmentAnchor),
            protection: viewModel.captureArmedProtection(replyingTo: route.replyToId),
            language: composerState.selectedLanguage,
            place: place,
            mediaFiles: composerState.pendingMediaFiles
        )
        guard !attachments.isEmpty else {
            dispatchTextOnly(text: text, intent: intent)
            return
        }
        launchAttachmentSend(stageAttachmentBubbles(intent))
    }

    /// Un envoi contenant de l'audio sans consentement vocal validé propose UNE fois par
    /// session la traduction automatique. L'interruption précède toute mutation du composer :
    /// la décision du popup relance ce même tap sur un état intact.
    private func promptsVoiceConsent(for plan: [MultiAttachmentSendPlanner.PlannedMessage]) -> Bool {
        guard OutgoingAttachmentRules.shouldPromptVoiceConsent(
            hasAudio: plan.contains { $0.kind == .audio },
            consentMissing: viewModel.voiceConsentMissing,
            alreadyPrompted: composerState.voiceConsentPromptedThisSession
        ) else { return false }
        composerState.voiceConsentPromptedThisSession = true
        composerState.showVoiceAutoTranslateConsent = true
        return true
    }

    private func dispatchTextOnly(text: String, intent: AttachmentSendIntent) {
        composerState.pendingAttachments.removeAll()
        composerState.pendingMediaFiles.removeAll()
        composerState.pendingThumbnails.removeAll()
        purgeDraftAttachmentMedia()
        clearComposerForSend()
        Logger.messages.info("SendTap text-only dispatch convId=\(viewModel.conversationId, privacy: .public) textLen=\(text.count, privacy: .public) — field cleared, launching sendMessage Task")
        let outgoing = OutgoingMessage(
            conversationId: ConversationID(viewModel.conversationId), content: text, relation: intent.relation,
            attachments: .none, protection: intent.protection, originalLanguage: intent.language, location: intent.place
        )
        Task {
            let ok = await viewModel.send(outgoing).isAccepted
            restorePlaceTile(intent.place, sent: ok)
        }
    }

    private func clearComposerForSend() {
        composerText.text = ""
        withAnimation { composerState.pendingPlace = nil }
        ReplyContextCleaner(conversationId: viewModel.conversationId)
            .clear(pendingReplyReference: &composerState.pendingReplyReference)
        viewModel.stopTypingEmission()
        HapticFeedback.light()
    }

    /// Les pièces restent visibles pendant l'envoi ; chaque bulle est posée dans le MÊME tour
    /// MainActor que sa transcription locale, sans `await` entre les deux.
    private func stageAttachmentBubbles(_ intent: AttachmentSendIntent) -> AttachmentSendBatch {
        clearComposerForSend()
        composerState.isUploading = true
        let currentUser = AuthManager.shared.currentUser
        let thumbnails = composerState.pendingThumbnails
        let mediaGroupSends = OutgoingMediaGroup.sendable(
            plan: intent.plan, mediaFiles: intent.mediaFiles, thumbnails: thumbnails,
            currentUserId: currentUser?.id ?? "",
            senderColor: DynamicColorGenerator.colorForName(currentUser?.displayName ?? "?"),
            seedsPreviewCache: !viewModel.endToEndSealsPieces
        )
        insertOptimisticMediaBubbles(mediaGroupSends, intent: intent)
        let textGroup = intent.plan.first(where: { $0.kind == .text })
        let textTempId = AttachmentSendBatch.textTempId(textGroup: textGroup, place: intent.place, generate: ClientMessageId.generate)
        insertOptimisticTextBubble(textGroup: textGroup, tempId: textTempId, intent: intent)
        composerState.pendingAttachments.removeAll()
        composerState.pendingThumbnails.removeAll()
        return AttachmentSendBatch(
            plan: intent.plan, mediaGroupSends: mediaGroupSends, mediaFiles: intent.mediaFiles,
            thumbnails: thumbnails, textGroup: textGroup, textTempId: textTempId, place: intent.place,
            relation: intent.relation, replyToId: intent.route.replyToId, protection: intent.protection,
            language: intent.language, currentUserId: currentUser?.id ?? "",
            guestAllowedKinds: anonymousSession?.allowedAttachmentKinds
        )
    }

    private func insertOptimisticMediaBubbles(_ sends: [OutgoingMediaGroup], intent: AttachmentSendIntent) {
        for send in sends {
            viewModel.insertOptimisticMediaMessage(
                tempId: send.tempId,
                content: send.group.messageContent,
                attachments: send.locals,
                messageType: OutgoingAttachmentRules.optimisticMessageType(
                    isAudioGroup: send.group.kind == .audio,
                    mimeTypes: send.locals.map(\.mimeType)
                ),
                replyToId: send.group.carriesReply ? intent.route.replyToId : nil,
                storyReplyToId: send.group.carriesReply ? intent.route.storyReplyToId : nil,
                replyReference: send.group.carriesReply ? intent.route.storyReference : nil,
                originalLanguage: intent.language,
                protection: intent.protection
            )
            guard send.group.kind == .audio else { continue }
            attachLocalTranscriptions(
                voiceNoteTranscriber.knownTranscriptions(for: send.locals.map(\.id)),
                tempId: send.tempId
            )
        }
    }

    /// La bulle texte d'un lot vocal (ou d'un lieu seul) est posée dès le tap, après les bulles
    /// média, pour que l'ordre d'affichage soit celui de l'envoi : le texte part en dernier.
    private func insertOptimisticTextBubble(
        textGroup: MultiAttachmentSendPlanner.PlannedMessage?, tempId: String?, intent: AttachmentSendIntent
    ) {
        guard let tempId else { return }
        let carriesReply = textGroup?.carriesReply == true
        viewModel.insertOptimisticMediaMessage(
            tempId: tempId,
            content: textGroup?.text ?? "",
            attachments: [],
            messageType: .text,
            replyToId: carriesReply ? intent.route.replyToId : nil,
            storyReplyToId: carriesReply ? intent.route.storyReplyToId : nil,
            replyReference: carriesReply ? intent.route.storyReference : nil,
            originalLanguage: intent.language,
            protection: intent.protection
        )
    }

    private func launchAttachmentSend(_ batch: AttachmentSendBatch) {
        let runner = AttachmentSendRunner(host: viewModel, callbacks: AttachmentSendCallbacks(
            restorePlace: { place, sent in restorePlaceTile(place, sent: sent) },
            setProgress: { progress in composerState.uploadProgress = progress },
            abortUpload: { composerState.isUploading = false }
        ))
        Task {
            defer {
                Task { @MainActor in
                    composerState.pendingMediaFiles.removeAll()
                    composerState.uploadProgress = nil
                    composerState.isUploading = false
                    purgeDraftAttachmentMedia()
                }
            }
            await runner.run(batch)
        }
    }

    // `formatRecordingTime(_:)` a vécu ici sans site d'appel. Le compteur de
    // l'enregistrement vivant est `UniversalComposerBar+Recording`, et son
    // formatage `ComposerModels.swift`.

    // MARK: - Attachment Handlers
    func handlePhotoSelection(_ items: [PhotosPickerItem]) {
        // Une sélection VIDE n'est une confirmation que si le sélecteur a été
        // ouvert avec des pièces jointes cochées (#9697) : tout décocher puis
        // valider les retire. Sinon c'est l'écho d'une remise à zéro.
        guard !items.isEmpty || !composerState.pickerPreselectedAttached.isEmpty else { return }
        // Priming echo (strip multi-selection injected before presenting the
        // picker) — not a user confirmation, nothing to ingest yet.
        if composerState.photoPickerPriming, !items.isEmpty {
            composerState.photoPickerPriming = false
            return
        }
        // #9697 — décocher dans le sélecteur une image déjà jointe la retire
        // de la zone. Lu AVANT la remise à zéro, dont l'écho ne retire rien.
        detachPendingPieces(composerState.consumePickerDeselection(returned: items.map(\.itemIdentifier)))
        composerState.selectedPhotoItems.removeAll()
        // #9683 — ce qui est déjà dans la zone (présélectionné à l'ouverture)
        // n'est pas une sélection nouvelle : écarté, comme les doublons.
        let fresh = RecentMediaAttachmentLink.ingestibleIndices(
            of: items.map(\.itemIdentifier),
            excluding: Set(composerState.attachedLibraryAssetIds)
        )
        guard !fresh.isEmpty else { return }
        HapticFeedback.light()
        for item in fresh.map({ items[$0] }) {
            let prep = AttachmentPreparationService.shared.preparePhotosPickerItem(
                item,
                context: .message,
                accentColor: accentColor
            )
            trackPreparation(prep)
            if let assetId = item.itemIdentifier { composerState.linkLibraryAsset(assetId, to: prep.id) }
        }
    }

    func handleFileImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            let importedAny = ComposerFileImporter.importFiles(urls) { copy in
                appendPendingFileAttachment(
                    tempURL: copy.tempURL,
                    fileName: copy.fileName,
                    mimeType: copy.mimeType,
                    fileSize: copy.fileSize
                )
            }
            if importedAny { HapticFeedback.light() }
        case .failure:
            composerState.actionAlert = "Erreur lors de l'import"
        }
    }

    func getFileSize(_ url: URL) -> Int {
        ComposerFileImporter.fileSize(of: url)
    }

    // MARK: - Ingestion par dépôt & collage (UniversalComposerBar.onIngest)

    /// Ajoute au tiroir une pièce jointe « fichier » dont la copie temporaire
    /// existe DÉJÀ dans notre conteneur. Cœur commun entre l'importateur de
    /// documents (`handleFileImport`) et l'ingestion par dépôt / collage
    /// (`handleComposerIngest`) : une seule voie vers `pendingAttachments` /
    /// `pendingMediaFiles`, pas de variante qui divergerait.
    func appendPendingFileAttachment(tempURL: URL, fileName: String, mimeType: String, fileSize: Int) {
        let attachmentId = UUID().uuidString
        let attachment = MessageAttachment(
            id: attachmentId,
            fileName: fileName,
            originalName: fileName,
            mimeType: mimeType,
            fileSize: fileSize,
            fileUrl: tempURL.absoluteString,
            thumbnailColor: MeeshyColors.infoHex
        )
        composerState.pendingMediaFiles[attachmentId] = tempURL
        composerState.pendingAttachments.append(attachment)
    }

    /// Contenu déposé ou collé dans la bande du composer (rappel `onIngest`
    /// de `UniversalComposerBar`). Chaque `.file` pointe un fichier DÉJÀ
    /// copié dans notre conteneur : cette surface en devient propriétaire
    /// (les pipelines réutilisés le consomment, ou on le supprime).
    ///
    /// Réutiliser exactement les pipelines existants est délibéré : toute
    /// nouvelle voie d'ingestion contournerait l'amorçage du cache de
    /// vignettes, la bulle optimiste et le magasin de brouillons durable —
    /// trois choses qui ne se voient pas casser.
    func handleComposerIngest(_ items: [ComposerIngest]) {
        var textParts: [String] = []
        var ingestedAny = false

        for item in items {
            switch item {
            case .text(let snippet):
                textParts.append(snippet)
            case .file(let url, let name, let mime):
                ingestedAny = true
                switch ComposerIngestRouter.route(mime: mime) {
                case .image:
                    ingestImageFile(at: url, name: name)
                case .video:
                    let prep = AttachmentPreparationService.shared.prepareVideo(
                        sourceURL: url,
                        deleteSourceAfterCompression: true,
                        context: .message,
                        accentColor: accentColor
                    )
                    trackPreparation(prep)
                case .audio, .file:
                    appendPendingFileAttachment(
                        tempURL: url,
                        fileName: name,
                        mimeType: mime,
                        fileSize: getFileSize(url)
                    )
                }
            }
        }

        // Plusieurs `.text` d'un même dépôt : concaténés par un saut de
        // ligne, dans l'ordre, en UNE SEULE insertion — pas N insertions
        // successives, qui feraient N fois le tour de l'analyseur de langue
        // et de la détection de collage.
        if !textParts.isEmpty {
            insertComposerText(textParts.joined(separator: "\n"))
            ingestedAny = true
        }

        if ingestedAny { HapticFeedback.light() }
    }

    /// Image déposée / collée : octets lus hors du main, puis remise au
    /// pipeline de préparation standard (tuile éditable + compression +
    /// suivi), exactement comme une capture caméra.
    private func ingestImageFile(at url: URL, name: String) {
        Task { @MainActor in
            let data = await OutgoingAttachmentRules.readAttachmentFileBytes(url)
            // Le fichier nous appartient ; une fois les octets en mémoire
            // (ou le décodage refusé), la copie disque ne sert plus.
            try? FileManager.default.removeItem(at: url)
            guard let data, let source = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(source) > 0 else {
                // Pas de tuile fantôme : on refuse et on le dit.
                Logger.messages.error("Ingestion image impossible (lecture ou décodage) pour \(name, privacy: .public)")
                ComposerIngestFeedback.showFailure(names: [name])
                return
            }
            let prep = AttachmentPreparationService.shared.prepareImageData(
                data,
                context: .message,
                accentColor: accentColor
            )
            trackPreparation(prep)
        }
    }

    /// Insère du texte déposé / collé dans le champ de saisie : à la position
    /// du curseur quand le champ a le focus (le premier répondant est alors
    /// le champ du composer — `insertText` insère au curseur ou remplace la
    /// sélection, et la synchro de binding de la barre répercute la valeur),
    /// sinon à la fin du texte courant.
    private func insertComposerText(_ snippet: String) {
        if isTyping, let field = KeyInputResponderLocator.current() {
            field.insertText(snippet)
            return
        }
        composerText.text += snippet
    }

    // `addCurrentLocation()` a vécu ici sans site d'appel : elle ne faisait que
    // poser `composerState.showLocationPicker = true`, ce que le composeur fait
    // lui-même via `onLocationRequest` (`ConversationView+Composer.swift`).

    /// Le picker émet désormais un `SharedPlace` complet (nom + adresse +
    /// catégorie) — `MessageAttachment.location` ne portait ni l'un ni
    /// l'autre et n'est plus le véhicule (Task 11/12, 2026-07-29). Le lieu
    /// reste en attente jusqu'au prochain envoi : `sendMessageWithAttachments`
    /// le capture et le passe aux trois transports (lot 2, spec 2026-07-30).
    func handleLocationSelection(_ place: SharedPlace) {
        withAnimation {
            composerState.pendingPlace = place
        }
        HapticFeedback.light()
    }

    @discardableResult
    func handleCameraVideo(_ url: URL, capturedInApp: Bool = false) -> PreparingAttachment {
        let prep = AttachmentPreparationService.shared.prepareVideo(
            sourceURL: url,
            deleteSourceAfterCompression: true,
            context: .message,
            accentColor: MeeshyColors.errorHex
        )
        trackPreparation(prep, capturedInApp: capturedInApp)
        return prep
    }

    /// Les OCTETS de la prise, quand l'objectif les a rendus, partent sans seconde génération d'encodage (#9885).
    func handleCameraCapture(_ image: UIImage, data: Data? = nil, capturedInApp: Bool = false) {
        let prep = AttachmentPreparationService.shared.prepareCapture(image, data: data, context: .message, accentColor: accentColor)
        trackPreparation(prep, capturedInApp: capturedInApp)
    }

    /// Wire a `PreparingAttachment` into the composer:
    /// 1. Append the in-flight handle so the tray shows a loading tile.
    /// 2. Observe the handle and, when it reaches `.ready`, promote the
    ///    result into the legacy pending dicts the send pipeline already
    ///    knows how to consume. `.failed` simply drops the tile + toasts.
    func trackPreparation(_ prep: PreparingAttachment, capturedInApp: Bool = false) {
        PreparationTracking.track(prep, preparing: $composerState.preparingAttachments, attachments: $composerState.pendingAttachments,
                                  mediaFiles: $composerState.pendingMediaFiles, thumbnails: $composerState.pendingThumbnails,
                                  capturedInApp: capturedInApp)
    }

    func sendMessage() {
        guard !composerText.text.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        let text = composerText.text
        let lang = composerState.selectedLanguage
        composerText.text = ""
        viewModel.stopTypingEmission()
        HapticFeedback.light()
        Task {
            _ = await viewModel.send(OutgoingMessage(conversationId: ConversationID(viewModel.conversationId), content: text, relation: .none, attachments: .none, originalLanguage: lang))
        }
    }

    /// Purge les copies durables des pièces jointes du brouillon — à l'envoi
    /// réussi (le brouillon n'existe plus) et au clear explicite. Idempotent.
    func purgeDraftAttachmentMedia() {
        guard let userId = AuthManager.shared.currentUser?.id else { return }
        MessageDraftMediaStore.purge(userId: userId, conversationId: viewModel.conversationId)
    }
}
