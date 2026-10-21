// MARK: - Extracted from ConversationView.swift
import SwiftUI
import UIKit
import PhotosUI
import AVFoundation
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
        guard let first = transcriptions.first else { return }
        for transcription in transcriptions {
            viewModel.messageTranscriptionsByAttachment[transcription.attachmentId] = transcription
        }
        viewModel.messageTranscriptions[tempId] = first
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
        let composerTrimmed = composerText.text.trimmingCharacters(in: .whitespacesAndNewlines)
        Logger.messages.info("SendTap composer tap convId=\(viewModel.conversationId, privacy: .public) isUploading=\(composerState.isUploading, privacy: .public) textLen=\(composerTrimmed.count, privacy: .public) pendingAttachments=\(composerState.pendingAttachments.count, privacy: .public) vmInFlightSends=\(viewModel.sendActivity.inFlight, privacy: .public)")
        guard !composerState.isUploading else {
            Logger.messages.error("SendTap BLOCKED guard=isUploading convId=\(viewModel.conversationId, privacy: .public)")
            return
        }
        let text = composerText.text.trimmingCharacters(in: .whitespacesAndNewlines)
        // Snapshot du lieu AVANT toute remise à zéro : la tuile disparaît AU
        // TAP, avec le texte (`SendPlaceTileLaw`), et n'est restaurée que si
        // l'envoi qui la porte échoue — sans re-choisir son lieu (lot 2, spec
        // 2026-07-30 pour la restauration ; #4948 pour le retrait immédiat).
        let place = composerState.pendingPlace
        // Garde partagé avec `ConversationViewModel.sendMessage` : un message
        // « lieu seul » est un envoi valide.
        guard SendEligibility.canSend(text: text, attachmentIds: composerState.pendingAttachments.map(\.id), location: place) else {
            Logger.messages.error("SendTap BLOCKED guard=emptyContent convId=\(viewModel.conversationId, privacy: .public)")
            return
        }

        let route = outgoingReplyRoute
        let replyAnchor = outgoingAttachmentAnchor
        let replyId = route.replyToId
        let storyReplyId = route.storyReplyToId
        let storyRef = route.storyReference

        let attachments = composerState.pendingAttachments
        let mediaFiles = composerState.pendingMediaFiles
        let lang = composerState.selectedLanguage

        let plan = MultiAttachmentSendPlanner.plan(
            attachments: attachments,
            text: text,
            hasReply: route.hasReply
        )

        // Popup consentement vocal (2026-07-08) : un envoi contenant de
        // l'audio sans consentement vocal validé propose UNE fois par session
        // la traduction automatique (profil vocal + traduction avec la voix).
        // On interrompt AVANT toute mutation du composer : la décision du
        // popup relance ce même send avec un état intact.
        if OutgoingAttachmentRules.shouldPromptVoiceConsent(
            hasAudio: plan.contains { $0.kind == .audio },
            consentMissing: viewModel.voiceConsentMissing,
            alreadyPrompted: composerState.voiceConsentPromptedThisSession
        ) {
            composerState.voiceConsentPromptedThisSession = true
            composerState.showVoiceAutoTranslateConsent = true
            return
        }

        // La protection armée est saisie UNE fois, ici, et la rangée se
        // désarme dans le même tour (#7498). Elle voyage ensuite jusqu'à
        // CHAQUE message de cet envoi — un par groupe de pièces jointes, plus
        // le texte en dernier. Relue à chaque envoi et désarmée au premier
        // acquittement, elle ne couvrait que le premier message : « cela ne
        // fonctionne que sur les textes » de la recette 1.1.0 était exactement
        // cela, vu de l'utilisateur.
        //
        // Saisie APRÈS tous les chemins qui REVIENNENT sans rien envoyer
        // (garde d'éligibilité, popup de consentement vocal) : désarmer avant
        // eux perdrait la protection sans qu'aucun message ne parte, et le
        // popup relance ce même tap sur un état qu'il doit retrouver intact.
        let protection = viewModel.captureArmedProtection(replyingTo: replyId)
        let relation = MessageRelation.legacy(replyToId: replyId, storyReplyToId: storyReplyId, storyReference: storyRef, forwardedFromId: nil, forwardedFromConversationId: nil, attachmentReplyTo: replyAnchor)

        if attachments.isEmpty {
            // Text-only send: clear UI immediately
            composerState.pendingAttachments.removeAll()
            composerState.pendingMediaFiles.removeAll()
            composerState.pendingThumbnails.removeAll()
            purgeDraftAttachmentMedia()
            composerText.text = ""
            withAnimation { composerState.pendingPlace = nil }
            ReplyContextCleaner(conversationId: viewModel.conversationId)
                .clear(pendingReplyReference: &composerState.pendingReplyReference)
            viewModel.stopTypingEmission()
            HapticFeedback.light()
            Logger.messages.info("SendTap text-only dispatch convId=\(viewModel.conversationId, privacy: .public) textLen=\(text.count, privacy: .public) — field cleared, launching sendMessage Task")
            Task {
                let ok = await viewModel.send(OutgoingMessage(conversationId: ConversationID(viewModel.conversationId), content: text, relation: relation, attachments: .none, protection: protection, originalLanguage: lang, location: place)).isAccepted
                restorePlaceTile(place, sent: ok)
            }
            return
        }

        // File upload flow: keep attachments visible, show progress
        composerText.text = ""
        withAnimation { composerState.pendingPlace = nil }
        ReplyContextCleaner(conversationId: viewModel.conversationId)
            .clear(pendingReplyReference: &composerState.pendingReplyReference)
        viewModel.stopTypingEmission()
        composerState.isUploading = true
        HapticFeedback.light()

        // --- Precompute sendable media groups: each paired with a stable tempId ---
        // Both the optimistic phase and the upload phase iterate this SAME list
        // so that tempIds never desync (Issue 1: empty-locals groups must be
        // excluded from BOTH phases, not just the optimistic insert).
        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        let senderName = AuthManager.shared.currentUser?.displayName
        let senderColor = DynamicColorGenerator.colorForName(senderName ?? "?")
        let thumbnails = composerState.pendingThumbnails

        // Build the list once. Side effects (image cache seeding) happen there.
        let mediaGroupSends = OutgoingMediaGroup.sendable(
            plan: plan, mediaFiles: mediaFiles, thumbnails: thumbnails,
            currentUserId: currentUserId, senderColor: senderColor
        )

        // --- Optimistic media insert: one bubble per sendable group ---
        // Persist via GRDB (insertOptimisticMediaMessage) so the row survives
        // the next MessageStore observation refresh. A direct
        // `viewModel.messages.append` would only live in memory and be wiped
        // the moment any other GRDB write fires `messagesDidChange`.
        for send in mediaGroupSends {
            let msgType = OutgoingAttachmentRules.optimisticMessageType(
                isAudioGroup: send.group.kind == .audio,
                mimeTypes: send.locals.map(\.mimeType)
            )
            viewModel.insertOptimisticMediaMessage(
                tempId: send.tempId,
                content: send.group.messageContent,
                attachments: send.locals,
                messageType: msgType,
                replyToId: send.group.carriesReply ? replyId : nil,
                storyReplyToId: send.group.carriesReply ? storyReplyId : nil,
                replyReference: send.group.carriesReply ? storyRef : nil,
                originalLanguage: lang,
                protection: protection
            )
            // Atomicity : la transcription locale déjà connue est posée dans le
            // MÊME slice que la bulle — aucun `await` entre les deux.
            if send.group.kind == .audio {
                attachLocalTranscriptions(
                    voiceNoteTranscriber.knownTranscriptions(for: send.locals.map(\.id)),
                    tempId: send.tempId
                )
            }
        }

        // --- Optimistic TEXT insert: upfront, like every media group ---
        // La légende d'un lot VISUEL voyage avec ses pièces, dans le même
        // message (#9860) : le plan n'a alors pas de groupe texte. Sans pièce
        // visuelle (vocaux seuls), le texte reste son propre message, ENVOYÉ
        // en dernier (règle A2.2 de la spec multi-pièces). Mais son insert
        // optimiste vivait À L'INTÉRIEUR de `sendMessage`, appelé après la
        // boucle d'upload : la bulle texte n'apparaissait donc qu'une fois le
        // DERNIER octet du dernier fichier monté — l'utilisateur voyait « les pièces d'abord, le message
        // ensuite ». On pose la ligne ici, dans le même tour MainActor que les
        // bulles média, en conservant l'ordre d'affichage : `createdAt` est
        // postérieur aux groupes média puisque l'insert suit, et l'envoi réel
        // reste en dernier via `existingTempId`.
        //
        // `insertOptimisticMediaMessage` n'a de « Media » que le nom : avec
        // `attachments: []` et `messageType: .text` il construit un
        // `MessageRecord` texte ordinaire (`attachmentsJson` reste nil) et
        // `LastMessageFacet.sent` porte déjà sa légende.
        let textGroupPlan = plan.first(where: { $0.kind == .text })
        let textTempId: String? = {
            let hasText = !(textGroupPlan?.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            guard hasText || (textGroupPlan == nil && place != nil) else { return nil }
            return ClientMessageId.generate()
        }()
        if let textTempId {
            viewModel.insertOptimisticMediaMessage(
                tempId: textTempId,
                content: textGroupPlan?.text ?? "",
                attachments: [],
                messageType: .text,
                replyToId: textGroupPlan?.carriesReply == true ? replyId : nil,
                storyReplyToId: textGroupPlan?.carriesReply == true ? storyReplyId : nil,
                replyReference: textGroupPlan?.carriesReply == true ? storyRef : nil,
                originalLanguage: lang,
                protection: protection
            )
        }

        composerState.pendingAttachments.removeAll()
        composerState.pendingThumbnails.removeAll()
        // --- End optimistic media insert ---

        Task {
            defer {
                Task { @MainActor in
                    composerState.pendingMediaFiles.removeAll()
                    composerState.uploadProgress = nil
                    composerState.isUploading = false
                    // APRÈS l'upload : un brouillon restauré envoie depuis les
                    // copies du dossier draft — purger avant les aurait
                    // supprimées sous les pieds de l'upload.
                    purgeDraftAttachmentMedia()
                }
            }
            let serverOrigin = MeeshyConfig.shared.serverOrigin
            // Une pièce jointe de MESSAGE ne demande pas de compte : un invité
            // de lien partagé a le droit d'en envoyer (le gateway le lui
            // accorde), et exiger `authToken` ici lui affichait « Échec de
            // l'envoi » sans qu'aucune requête ne parte.
            guard let baseURL = URL(string: serverOrigin),
                  let credential = APIClient.shared.requestCredential else {
                await MainActor.run {
                    composerState.isUploading = false
                    FeedbackToastManager.shared.showError("Échec de l'envoi de la pièce jointe")
                    // Aucun envoi n'a eu lieu : la tuile de lieu retirée au tap
                    // revient, comme sur tout échec (`SendPlaceTileLaw`). Sans
                    // cette ligne, le retrait immédiat FERAIT PERDRE le lieu sur
                    // le seul chemin qui ne rejoint jamais `restorePlaceTile`.
                    restorePlaceTile(place, sent: false)
                }
                return
            }
            let uploader = TusUploadManager(baseURL: baseURL)
            var progressCancellable: AnyCancellable?
            progressCancellable = uploader.progressPublisher
                .receive(on: DispatchQueue.main)
                .sink { progress in
                    composerState.uploadProgress = progress
                }

            let outbox = AttachmentGroupOutbox(
                conversationId: viewModel.conversationId, originalLanguage: lang,
                replyToId: replyId, protection: protection
            )
            var anySuccess = false

            // Upload media groups — same iteration order as the optimistic phase,
            // using the precomputed tempId for each (Issue 1 fix: no tempIdx desync).
            for send in mediaGroupSends {
                // A3 / S7b ST2 — offline write-ahead (audio and visual media):
                // short-circuit to the durable OfflineQueue instead of a TUS
                // upload that would fail immediately.
                if NetworkMonitor.shared.isOffline {
                    if await outbox.enqueueOffline(send, mediaFiles: mediaFiles) { anySuccess = true }
                    continue   // skip the online TUS path for this group
                }

                do {
                    var uploadedIds: [String] = []
                    var localAttachments: [MeeshyMessageAttachment] = []
                    // Transcription locale arrivée APRÈS l'insert optimiste
                    // (`stopAndSendRecording` envoie dans la foulée) : attente
                    // bornée par le budget d'ENVOI — jamais par le plafond du
                    // MOTEUR, qui aurait retenu le fichier jusqu'à 8 s par
                    // vocal — pose idempotente, puis le texte VOYAGE avec
                    // l'upload (`Upload-Metadata`). Au-delà, Whisper reprend.
                    var localTranscriptions: [String: MessageTranscription] = [:]
                    if send.group.kind == .audio {
                        let awaited = await voiceNoteTranscriber.awaitTranscriptions(
                            for: send.group.attachments.map(\.id),
                            within: VoiceNoteLocalTranscriber.sendWaitBudget
                        )
                        attachLocalTranscriptions(awaited, tempId: send.tempId)
                        localTranscriptions = Dictionary(awaited.map { ($0.attachmentId, $0) }, uniquingKeysWith: { first, _ in first })
                    }
                    // Upload PARALLÈLE borné.
                    //
                    // `TusUploadManager` porte déjà un pool (`maxConcurrent = 3`)
                    // et une file d'attente, mais la boucle séquentielle qui
                    // vivait ici ne lui confiait QU'UN fichier à la fois : le
                    // pool ne dépassait jamais un actif, sa file restait vide, et
                    // 199 photos (`maxMediaSelection`) partaient l'une après
                    // l'autre. Le commentaire de `maxMediaSelection` promettait
                    // pourtant une borne par la concurrence d'upload — elle
                    // existait, elle n'était simplement jamais atteinte.
                    // On confie désormais tout le groupe d'un coup ; c'est
                    // l'acteur qui borne.
                    //
                    // Seules des valeurs `Sendable` franchissent la frontière de
                    // tâche (URL, String, String?) — l'amorçage de cache, qui lit
                    // les octets, touche `UIImage` et les stores
                    // `CacheCoordinator`, reste SÉQUENTIEL en aval : il préserve
                    // l'ordre des pièces et ne tient qu'un fichier en mémoire à
                    // la fois (199 photos lues d'un bloc feraient exploser
                    // l'empreinte mémoire).
                    let pendingUploads: [(attachment: MeeshyMessageAttachment, fileURL: URL, mimeType: String, thumbHash: String?, transcription: TusUploadTranscriptionMetadata?)] =
                        send.group.attachments.compactMap { att in
                            guard let fileURL = mediaFiles[att.id] else { return nil }
                            return (
                                att,
                                fileURL,
                                send.group.kind == .audio ? "audio/mp4" : att.mimeType,
                                thumbnails[att.id]?.toThumbHash(),
                                localTranscriptions[att.id]?.tusUploadMetadata
                            )
                        }
                    let uploadItems = pendingUploads.map {
                        (fileURL: $0.fileURL, mimeType: $0.mimeType, thumbHash: $0.thumbHash,
                         transcription: $0.transcription, capturedInApp: $0.attachment.capturedInApp)
                    }

                    // Déclarer le lot complet AVANT de lancer les uploads, pour
                    // que la barre de progression affiche d'emblée le vrai total
                    // fichiers/octets au lieu d'osciller à mesure des
                    // enregistrements un par un. `pendingUploads` porte
                    // exactement les pièces qui vont monter — ce filtre vivait
                    // ici en double, au risque de diverger de la liste
                    // réellement uploadée.
                    let plannedBytes = pendingUploads.reduce(Int64(0)) { acc, item in
                        let size = (try? FileManager.default.attributesOfItem(atPath: item.fileURL.path))?[.size] as? Int64
                        return acc + (size ?? 0)
                    }
                    await uploader.setExpectedBatch(totalFiles: pendingUploads.count, totalBytes: plannedBytes)

                    // Contrat de reprise INCHANGÉ : la première erreur sort du
                    // groupe (les tâches restantes sont annulées) et rejoint le
                    // `catch` ci-dessous, qui renvoie le groupe entier vers
                    // l'outbox durable. Le dedup par `clientMessageId` côté
                    // gateway couvre le rejeu des pièces déjà montées.
                    // L'ORDRE DU COMPOSEUR (#9776) : les fichiers finissent dans
                    // le désordre, les ids partent dans l'ordre des pièces — la
                    // passerelle en fait le rang de chacune.
                    let uploadResults = try await OrderedParallelUpload.run(uploadItems) { item in
                        try await uploader.uploadFile(
                            fileURL: item.fileURL, mimeType: item.mimeType, credential: credential,
                            thumbHash: item.thumbHash, transcription: item.transcription,
                            capturedInApp: item.capturedInApp
                        )
                    }

                    for (item, result) in zip(pendingUploads, uploadResults) {
                        let att = item.attachment
                        let fileURL = item.fileURL
                        uploadedIds.append(result.id)
                        // #9875 — le fichier est DÉJÀ dans le cache typé, copié
                        // par `TusUploadManager` sous la clé de rendu : aucun
                        // octet n'est relu ici. L'aperçu décodé de la bulle
                        // optimiste change seulement de clé, et le vocal reste
                        // lisible sous son adresse `file://` le temps de la
                        // réconciliation.
                        let renderKey = TusUploadManager.renderCacheKey(forFileUrl: result.fileUrl)
                        let effectiveType: MeeshyMessageAttachment.AttachmentType = send.group.kind == .audio ? .audio : att.type
                        if effectiveType == .audio {
                            await CacheCoordinator.shared.audio.seed(copyingLocalFile: fileURL, for: fileURL.absoluteString)
                        }
                        if effectiveType == .image, let preview = DiskCacheStore.cachedImage(for: fileURL.absoluteString) {
                            DiskCacheStore.cacheImageForPreview(preview, key: renderKey)
                        }
                        // Seed server-returned thumbnail so the confirmed
                        // bubble renders from cache (no network flash on
                        // optimistic→server URL reconciliation). Only for
                        // non-audio groups which carry a thumbnailUrl.
                        if effectiveType != .audio,
                           let thumbUrl = result.thumbnailUrl,
                           let thumbImage = thumbnails[att.id],
                           let thumbData = await ImageCompressor.jpegOffMain(thumbImage, quality: 0.8) {
                            let thumbKey = MeeshyConfig.resolveMediaURL(thumbUrl)?.absoluteString ?? thumbUrl
                            await CacheCoordinator.shared.thumbnails.store(thumbData, for: thumbKey)
                            DiskCacheStore.cacheImageForPreview(thumbImage, key: thumbKey)
                        }
                        localAttachments.append(PreparationTracking.promoted(
                            result.toMessageAttachment(uploadedBy: currentUserId), capturedInApp: att.capturedInApp))
                        // La bulle réconciliée porte l'id SERVEUR de la pièce :
                        // la transcription locale la suit sous cet id, le temps
                        // que `transcription:completed` la confirme.
                        if let transcription = localTranscriptions[att.id] {
                            viewModel.messageTranscriptionsByAttachment[result.id] = transcription.rekeyed(attachmentId: result.id)
                            voiceNoteTranscriber.discard(attachmentId: att.id)
                        }
                    }
                    let ok = await viewModel.send(OutgoingMessage(
                        conversationId: ConversationID(viewModel.conversationId),
                        content: send.group.messageContent,
                        relation: send.group.carriesReply ? relation : .none,
                        attachments: OutgoingAttachments(ids: uploadedIds.isEmpty ? nil : uploadedIds, previews: localAttachments.isEmpty ? nil : localAttachments),
                        protection: protection,
                        originalLanguage: lang,
                        reusedClientMessageId: MessageID(send.tempId)
                    )).isAccepted
                    anySuccess = anySuccess || ok
                } catch {
                    Logger.messages.error("Group upload failed (\(String(describing: send.group.kind))): \(error.localizedDescription)")
                    // Spec 2026-07-08 (message-send-failure-retry-flow, règle 4) :
                    // un échec d'upload EN LIGNE rejoint l'outbox durable —
                    // mêmes re-tentatives automatiques avec backoff que le
                    // texte — au lieu de basculer la bulle directement en
                    // `.failed`. `.sendFailed` fait transiter la ligne
                    // optimiste `.sending` → `.queued` (horloge conservée) ;
                    // l'indicateur d'échec reste un état terminal atteint par
                    // `retryExhausted`. Les fichiers déjà uploadés avant
                    // l'échec seront ré-uploadés au rejeu (le dedup message
                    // par clientMessageId côté gateway évite tout doublon).
                    await viewModel.recordSendFailure(tempId: send.tempId, error: error)
                    // #10006 — le refus d'une pièce d'INVITÉ est définitif :
                    // l'outbox le rejouerait en vain. La bulle dit pourquoi.
                    if let refusal = error as? GuestAttachmentRefusal {
                        await viewModel.markOptimisticMediaFailed(
                            tempId: send.tempId,
                            reason: GuestAttachmentCopy.serverRefusal(refusal, kinds: anonymousSession?.allowedAttachmentKinds)
                        )
                        continue
                    }
                    let requeued = await outbox.requeueAfterOnlineFailure(send, mediaFiles: mediaFiles)
                    if requeued {
                        anySuccess = true
                        Logger.messages.info("Group upload failed online — requeued to durable outbox \(send.tempId)")
                    } else {
                        // Ré-enfilage impossible (fichiers sources disparus,
                        // disque plein, encodage) : état terminal, retry manuel.
                        // L'utilisateur ne rejouera pas le même envoi à
                        // l'identique s'il sait que le volume est en cause —
                        // parité avec le message d'échec du composer web.
                        await viewModel.markOptimisticMediaFailed(
                            tempId: send.tempId,
                            reason: OutgoingAttachmentRules.uploadFailureReason(
                                error: error,
                                attachmentCount: send.group.attachments.count
                            )
                        )
                    }
                }
            }

            // Send text group last (preserves original planner ordering intent).
            // Le lieu voyage avec le message texte (envoyé en dernier, comme la
            // tuile l'annonce dans le composer) ; sans texte, il part comme
            // message « lieu seul » après les médias. Dans les deux cas la
            // tuile a disparu AU TAP (`SendPlaceTileLaw`) et n'est restaurée
            // que si l'envoi qui la porte échoue.
            // `existingTempId` réutilise la ligne optimiste déjà posée en amont
            // (voir « Optimistic TEXT insert ») : `sendMessage` la fait avancer
            // au lieu d'en créer une nouvelle, donc la bulle ne bouge pas et
            // n'apparaît pas une seconde fois.
            if let textGroup = textGroupPlan {
                let ok = await viewModel.send(OutgoingMessage(
                    conversationId: ConversationID(viewModel.conversationId),
                    content: textGroup.text ?? "",
                    relation: textGroup.carriesReply ? relation : .none,
                    attachments: .none,
                    protection: protection,
                    originalLanguage: lang,
                    reusedClientMessageId: textTempId.map { MessageID($0) },
                    location: place
                )).isAccepted
                restorePlaceTile(place, sent: ok)
                anySuccess = anySuccess || ok
            } else if place != nil {
                let ok = await viewModel.send(OutgoingMessage(
                    conversationId: ConversationID(viewModel.conversationId),
                    content: "",
                    relation: .none,
                    attachments: .none,
                    protection: protection,
                    originalLanguage: lang,
                    reusedClientMessageId: textTempId.map { MessageID($0) },
                    location: place
                )).isAccepted
                restorePlaceTile(place, sent: ok)
                anySuccess = anySuccess || ok
            }

            progressCancellable?.cancel()

            // Clean up local files. Audio: defer disk deletion — the optimistic
            // GRDB row carries the file:// URL until the socket echo flips it to
            // https (~100-500ms); the play tap reads from disk in that window.
            let audioURLs = plan.filter { $0.kind == .audio }.flatMap { $0.attachments }.compactMap { mediaFiles[$0.id] }
            let visualURLs = plan.filter { $0.kind == .visual }.flatMap { $0.attachments }.compactMap { mediaFiles[$0.id] }
            await MainActor.run {
                for url in visualURLs { try? FileManager.default.removeItem(at: url) }
                if !audioURLs.isEmpty {
                    Task {
                        try? await Task.sleep(nanoseconds: 10_000_000_000)
                        for url in audioURLs { try? FileManager.default.removeItem(at: url) }
                    }
                }
                if anySuccess {
                    HapticFeedback.success()
                } else {
                    HapticFeedback.error()
                    FeedbackToastManager.shared.showError("Échec de l'envoi de la pièce jointe")
                }
            }
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
            guard let data, let image = UIImage(data: data) else {
                // Pas de tuile fantôme : on refuse et on le dit.
                Logger.messages.error("Ingestion image impossible (lecture ou décodage) pour \(name, privacy: .public)")
                ComposerIngestFeedback.showFailure(names: [name])
                return
            }
            let prep = AttachmentPreparationService.shared.prepareImage(
                image,
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

    func handleCameraCapture(_ image: UIImage, capturedInApp: Bool = false) {
        let prep = AttachmentPreparationService.shared.prepareImage(
            image,
            context: .message,
            accentColor: accentColor
        )
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
