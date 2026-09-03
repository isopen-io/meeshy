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

    /// Décision pure et testable du popup de consentement vocal à l'envoi
    /// (2026-07-08) : uniquement quand le send contient de l'audio, que le
    /// consentement vocal manque, et qu'on n'a pas déjà proposé cette session.
    nonisolated static func shouldPromptVoiceConsent(
        hasAudio: Bool,
        consentMissing: Bool,
        alreadyPrompted: Bool
    ) -> Bool {
        hasAudio && consentMissing && !alreadyPrompted
    }

    /// Read a local attachment's bytes off the MainActor. `Data(contentsOf:)`
    /// is a synchronous read; a multi-attachment send (dozens of MB of video)
    /// previously read every file inline on the MainActor — either while
    /// building the optimistic-send plan or inside the upload loop's `Task`
    /// (which inherits MainActor isolation by default) — freezing the UI for
    /// the whole read duration. Hops to a detached background Task — the
    /// same technique previously implemented in `AttachmentSendService.swift`
    /// (removed as dead code, 0 call sites) but never applied to this, the
    /// actually-live send path.
    nonisolated static func readAttachmentFileBytes(_ url: URL) async -> Data? {
        await Task.detached(priority: .utility) { try? Data(contentsOf: url) }.value
    }

    /// Motif d'échec d'un envoi de pièces jointes, complété d'un conseil
    /// actionnable quand plusieurs pièces sont en jeu : réduire le nombre de
    /// pièces et réessayer. Un échec sur un envoi de 150 photos n'a pas le
    /// même remède qu'un échec sur une pièce isolée, et sans le dire on laisse
    /// l'utilisateur rejouer à l'identique le même envoi trop lourd.
    ///
    /// Silencieux sur une pièce unique — « réduire » n'y veut rien dire.
    /// Miroir du `withReduceAttachmentsHint` du composer web.
    nonisolated static func uploadFailureReason(error: Error, attachmentCount: Int) -> String {
        guard attachmentCount > 1 else { return error.localizedDescription }
        return "\(error.localizedDescription) Réduisez le nombre de pièces jointes (\(attachmentCount) en cours) et réessayez."
    }

    /// Type de la bulle OPTIMISTE d'un groupe média, lu sur TOUTES ses pièces.
    /// Un document partait typé `.image` (la liste disait « Photo » jusqu'à
    /// l'écho serveur) parce que seule la première pièce était regardée, et
    /// seulement pour distinguer vidéo de « tout le reste ».
    ///
    /// Miroir EXACT de `messageTypeForClientAttachments`
    /// (`packages/shared/utils/attachment-message-type.ts`), la source unique
    /// de cette règle : une seule catégorie présente ⇒ cette catégorie,
    /// plusieurs catégories mélangées ⇒ `.file`. Le groupe `.visual` du
    /// planificateur mêle images, vidéos ET documents, donc le cas hétérogène
    /// est le cas NOMINAL — et ce que le client DÉCLARE, le serveur ne le
    /// corrige pas (`deriveMessageTypeForAttachments` est additive). Une règle
    /// manuscrite qui divergerait ici ferait sauter l'aperçu de liste de
    /// « Vidéo » à « Document » à la réconciliation, sans que rien ne le dise.
    nonisolated static func optimisticMessageType(isAudioGroup: Bool, mimeTypes: [String]) -> Message.MessageType {
        if isAudioGroup { return .audio }
        let buckets = mimeTypes.map { Self.attachmentBucket(forMime: $0) }
        guard let first = buckets.first, buckets.allSatisfy({ $0 == first }) else { return .file }
        return first
    }

    /// La catégorie d'un MIME — jamais `.text` : un `.txt` joint est une PIÈCE
    /// JOINTE, pas un message texte (même repli que `bucketForMime` côté
    /// partagé, y compris pour un MIME vide ou inconnu).
    nonisolated private static func attachmentBucket(forMime mimeType: String) -> Message.MessageType {
        let mime = mimeType.lowercased()
        if mime.hasPrefix("image/") { return .image }
        if mime.hasPrefix("audio/") { return .audio }
        if mime.hasPrefix("video/") { return .video }
        return .file
    }

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
        Logger.messages.info("SendTap composer tap convId=\(viewModel.conversationId, privacy: .public) isUploading=\(composerState.isUploading, privacy: .public) textLen=\(composerTrimmed.count, privacy: .public) pendingAttachments=\(composerState.pendingAttachments.count, privacy: .public) vmIsSending=\(viewModel.isSending, privacy: .public)")
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

        let pendingRef = composerState.pendingReplyReference
        let isStory = pendingRef?.isStoryReply == true
        let refId = pendingRef?.messageId.isEmpty == false ? pendingRef?.messageId : nil
        let replyId = isStory ? nil : refId
        let storyReplyId = isStory ? refId : nil
        let storyRef = isStory ? pendingRef : nil

        let attachments = composerState.pendingAttachments
        let mediaFiles = composerState.pendingMediaFiles
        let lang = composerState.selectedLanguage

        let plan = MultiAttachmentSendPlanner.plan(
            attachments: attachments,
            text: text,
            hasReply: refId != nil
        )

        // Popup consentement vocal (2026-07-08) : un envoi contenant de
        // l'audio sans consentement vocal validé propose UNE fois par session
        // la traduction automatique (profil vocal + traduction avec la voix).
        // On interrompt AVANT toute mutation du composer : la décision du
        // popup relance ce même send avec un état intact.
        if Self.shouldPromptVoiceConsent(
            hasAudio: plan.contains { $0.kind == .audio },
            consentMissing: viewModel.voiceConsentMissing,
            alreadyPrompted: composerState.voiceConsentPromptedThisSession
        ) {
            composerState.voiceConsentPromptedThisSession = true
            composerState.showVoiceAutoTranslateConsent = true
            return
        }

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
                let ok = await viewModel.sendMessage(content: text, replyToId: replyId, storyReplyToId: storyReplyId, storyReplyReference: storyRef, originalLanguage: lang, location: place)
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
        struct MediaGroupSend {
            let group: MultiAttachmentSendPlanner.PlannedMessage
            let tempId: String
            let locals: [MeeshyMessageAttachment]   // non-empty; already cache-seeded
        }

        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        let senderName = AuthManager.shared.currentUser?.displayName
        let senderColor = DynamicColorGenerator.colorForName(senderName ?? "?")
        let thumbnails = composerState.pendingThumbnails

        // Build the list once. Side effects (image cache seeding) happen here.
        let mediaGroupSends: [MediaGroupSend] = plan.filter { $0.kind != .text }.compactMap { group in
            let locals: [MeeshyMessageAttachment] = group.attachments.compactMap { att in
                guard let fileURL = mediaFiles[att.id] else { return nil }
                let isImage = att.mimeType.hasPrefix("image/")
                if isImage {
                    // Seed in-memory NSCache + on-disk image cache so the
                    // optimistic bubble keeps the picture across navigation
                    // until the server `message:new` reconciliation lands.
                    // The read hops off the MainActor (readAttachmentFileBytes)
                    // — this compactMap runs synchronously on the tap-Send
                    // call stack, so a raw `Data(contentsOf:)` here froze the
                    // UI for the whole read of every selected photo/video.
                    let persistKey = fileURL.absoluteString
                    Task {
                        guard let data = await ConversationView.readAttachmentFileBytes(fileURL),
                              let image = UIImage(data: data) else { return }
                        DiskCacheStore.cacheImageForPreview(image, key: persistKey)
                        await CacheCoordinator.shared.images.save(data, for: persistKey)
                    }
                }
                // A video/audio file:// URL cannot be decoded as a still — seed
                // a ThumbHash from the generated thumbnail so the bubble shows a
                // recognisable preview instantly. Images render from the cache.
                let optimisticThumbHash = isImage ? nil : thumbnails[att.id]?.toThumbHash()
                return MeeshyMessageAttachment(
                    id: att.id,
                    mimeType: att.mimeType.isEmpty ? "application/octet-stream" : att.mimeType,
                    fileUrl: fileURL.absoluteString,
                    width: att.width,
                    height: att.height,
                    thumbnailUrl: isImage ? fileURL.absoluteString : nil,
                    thumbHash: optimisticThumbHash,
                    duration: att.duration,
                    uploadedBy: currentUserId,
                    thumbnailColor: senderColor
                )
            }
            guard !locals.isEmpty else { return nil }
            // Phase 4 §6.2 — `cid_<uuid v4 lowercase>` so the gateway accepts
            // the value as `clientMessageId` (the legacy `temp_<UUID>` prefix
            // fails the strict wire regex).
            return MediaGroupSend(group: group, tempId: ClientMessageId.generate(), locals: locals)
        }

        // --- Optimistic media insert: one bubble per sendable group ---
        // Persist via GRDB (insertOptimisticMediaMessage) so the row survives
        // the next MessageStore observation refresh. A direct
        // `viewModel.messages.append` would only live in memory and be wiped
        // the moment any other GRDB write fires `messagesDidChange`.
        for send in mediaGroupSends {
            let msgType = Self.optimisticMessageType(
                isAudioGroup: send.group.kind == .audio,
                mimeTypes: send.locals.map(\.mimeType)
            )
            viewModel.insertOptimisticMediaMessage(
                tempId: send.tempId,
                content: "",
                attachments: send.locals,
                messageType: msgType,
                replyToId: send.group.carriesReply ? replyId : nil,
                storyReplyToId: send.group.carriesReply ? storyReplyId : nil,
                replyReference: send.group.carriesReply ? storyRef : nil,
                originalLanguage: lang
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
        // Le groupe texte est ENVOYÉ en dernier (règle A2.2 de la spec
        // multi-pièces : le texte est toujours son propre message, après les
        // pièces). Mais son insert optimiste vivait À L'INTÉRIEUR de
        // `sendMessage`, appelé après la boucle d'upload : la bulle texte
        // n'apparaissait donc qu'une fois le DERNIER octet du dernier fichier
        // monté — l'utilisateur voyait « les pièces d'abord, le message
        // ensuite ». On pose la ligne ici, dans le même tour MainActor que les
        // bulles média, en conservant l'ordre d'affichage : `createdAt` est
        // postérieur aux groupes média puisque l'insert suit, et l'envoi réel
        // reste en dernier via `existingTempId`.
        //
        // `insertOptimisticMediaMessage` n'a de « Media » que le nom : avec
        // `attachments: []` et `messageType: .text` il construit un
        // `MessageRecord` texte ordinaire (`attachmentsJson` reste nil) et
        // `optimisticListPreview` gère déjà `.text`.
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
                originalLanguage: lang
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
                .sink { [progressCancellable] progress in
                    _ = progressCancellable
                    composerState.uploadProgress = progress
                }

            var anySuccess = false

            // Upload media groups — same iteration order as the optimistic phase,
            // using the precomputed tempId for each (Issue 1 fix: no tempIdx desync).
            for send in mediaGroupSends {
                // A3 — Audio offline write-ahead: short-circuit to OfflineQueue
                // when the device is offline, instead of attempting a TUS upload
                // that will fail immediately.
                if send.group.kind == .audio, NetworkMonitor.shared.isOffline {
                    let urls = send.group.attachments.compactMap { mediaFiles[$0.id] }
                    // Offline: NEVER fall through to the TUS path (it would just
                    // fail). A race-to-online between this check and the GRDB
                    // write is handled by the flusher, which drains the queue
                    // on the next cycle.
                    guard !urls.isEmpty else {
                        Logger.messages.warning("Audio group offline but no source URLs — skipping \(send.tempId)")
                        continue
                    }
                    do {
                        _ = try await OfflineQueue.shared.enqueueAudios(
                            sourceAudioURLs: urls,
                            conversationId: viewModel.conversationId,
                            content: nil,
                            clientMessageId: send.tempId,
                            originalLanguage: lang,
                            replyToId: send.group.carriesReply ? replyId : nil
                        )
                        anySuccess = true
                        Logger.messages.info("Audio group queued offline for \(send.tempId)")
                    } catch {
                        Logger.messages.error("Audio offline enqueue failed: \(error.localizedDescription)")
                        await MainActor.run {
                            FeedbackToastManager.shared.showError("Échec de la mise en file du message vocal")
                        }
                    }
                    continue   // skip the online TUS path for this group
                }

                // S7b ST2 — visual-media (photo/video/file) offline write-ahead:
                // short-circuit to enqueueMedia (durable — survives an app kill
                // and auto-resends on flush via the ST3 dispatcher branch)
                // instead of the TUS path that throws offline. Mirrors the audio
                // branch; the optimistic bubble stays durably `.sending`.
                if send.group.kind == .visual, NetworkMonitor.shared.isOffline {
                    let pairs: [(url: URL, kind: String)] = send.group.attachments.compactMap { att in
                        guard let url = mediaFiles[att.id] else { return nil }
                        let kind = AttachmentKind(mimeType: MimeTypeResolver.mimeType(forURL: url)).rawValue
                        return (url, kind)
                    }
                    guard !pairs.isEmpty else {
                        Logger.messages.warning("Visual group offline but no source URLs — skipping \(send.tempId)")
                        continue
                    }
                    do {
                        _ = try await OfflineQueue.shared.enqueueMedia(
                            sourceMediaURLs: pairs.map { $0.url },
                            kinds: pairs.map { $0.kind },
                            conversationId: viewModel.conversationId,
                            content: nil,
                            clientMessageId: send.tempId,
                            originalLanguage: lang,
                            replyToId: send.group.carriesReply ? replyId : nil
                        )
                        anySuccess = true
                        Logger.messages.info("Visual group queued offline for \(send.tempId)")
                    } catch {
                        // enqueueMedia's copy-error path already flips the bubble
                        // (emits retryExhausted) + marks the row terminal; surface
                        // a toast too. Mirrors the audio offline branch.
                        Logger.messages.error("Visual offline enqueue failed: \(error.localizedDescription)")
                        await MainActor.run {
                            FeedbackToastManager.shared.showError("Échec de la mise en file du média")
                        }
                    }
                    continue   // skip the online TUS path for this group
                }

                do {
                    var uploadedIds: [String] = []
                    var localAttachments: [MeeshyMessageAttachment] = []
                    // Transcription locale arrivée APRÈS l'insert optimiste
                    // (`stopAndSendRecording` envoie dans la foulée) : attente
                    // bornée par le délai du transcripteur, pose idempotente,
                    // puis le texte VOYAGE avec l'upload (`Upload-Metadata`).
                    var localTranscriptions: [String: MessageTranscription] = [:]
                    if send.group.kind == .audio {
                        let awaited = await voiceNoteTranscriber.awaitTranscriptions(for: send.group.attachments.map(\.id))
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
                    var uploadResults = [TusUploadResult?](repeating: nil, count: pendingUploads.count)
                    try await withThrowingTaskGroup(of: (Int, TusUploadResult).self) { group in
                        for (index, item) in pendingUploads.enumerated() {
                            let fileURL = item.fileURL
                            let mime = item.mimeType
                            let thumbHash = item.thumbHash
                            let transcription = item.transcription
                            group.addTask {
                                let result = try await uploader.uploadFile(
                                    fileURL: fileURL, mimeType: mime, credential: credential,
                                    thumbHash: thumbHash, transcription: transcription
                                )
                                return (index, result)
                            }
                        }
                        for try await (index, result) in group {
                            uploadResults[index] = result
                        }
                    }

                    for (index, item) in pendingUploads.enumerated() {
                        guard let result = uploadResults[index] else { continue }
                        let att = item.attachment
                        let fileURL = item.fileURL
                        // Off-MainActor read: this `Task` inherits the
                        // MainActor isolation of `sendMessageWithAttachments`
                        // (project default actor isolation), so a raw
                        // `Data(contentsOf:)` here froze the UI for the
                        // duration of every large video/photo read on send.
                        let fileData = await ConversationView.readAttachmentFileBytes(fileURL)
                        uploadedIds.append(result.id)
                        if let fileData {
                            // Seed under the exact key the renderer resolves to
                            // so the optimistic→confirmed transition (file:// →
                            // server URL) reads a hot cache and never
                            // re-downloads our own upload. See RC3.3.
                            let renderKey = MeeshyConfig.resolveMediaURL(result.fileUrl)?.absoluteString ?? result.fileUrl
                            let effectiveType: MeeshyMessageAttachment.AttachmentType = send.group.kind == .audio ? .audio : att.type
                            switch effectiveType {
                            case .audio:
                                await CacheCoordinator.shared.audio.store(fileData, for: renderKey)
                                await CacheCoordinator.shared.audio.store(fileData, for: fileURL.absoluteString)
                            case .image:
                                await CacheCoordinator.shared.images.store(fileData, for: renderKey)
                                if let image = UIImage(data: fileData) {
                                    DiskCacheStore.cacheImageForPreview(image, key: renderKey)
                                }
                            default:
                                await CacheCoordinator.shared.video.store(fileData, for: renderKey)
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
                        }
                        localAttachments.append(result.toMessageAttachment(uploadedBy: currentUserId))
                        // La bulle réconciliée porte l'id SERVEUR de la pièce :
                        // la transcription locale la suit sous cet id, le temps
                        // que `transcription:completed` la confirme.
                        if let transcription = localTranscriptions[att.id] {
                            viewModel.messageTranscriptionsByAttachment[result.id] = transcription.rekeyed(attachmentId: result.id)
                            voiceNoteTranscriber.discard(attachmentId: att.id)
                        }
                    }
                    let ok = await viewModel.sendMessage(
                        content: "",
                        replyToId: send.group.carriesReply ? replyId : nil,
                        storyReplyToId: send.group.carriesReply ? storyReplyId : nil,
                        storyReplyReference: send.group.carriesReply ? storyRef : nil,
                        attachmentIds: uploadedIds.isEmpty ? nil : uploadedIds,
                        localAttachments: localAttachments.isEmpty ? nil : localAttachments,
                        originalLanguage: lang,
                        existingTempId: send.tempId
                    )
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
                    _ = try? await viewModel.messagePersistence.applyEvent(
                        localId: send.tempId, event: .sendFailed(error))
                    var requeued = false
                    if send.group.kind == .audio {
                        let urls = send.group.attachments.compactMap { mediaFiles[$0.id] }
                        if !urls.isEmpty {
                            requeued = (try? await OfflineQueue.shared.enqueueAudios(
                                sourceAudioURLs: urls,
                                conversationId: viewModel.conversationId,
                                content: nil,
                                clientMessageId: send.tempId,
                                originalLanguage: lang,
                                replyToId: send.group.carriesReply ? replyId : nil
                            )) != nil
                        }
                    } else {
                        let pairs: [(url: URL, kind: String)] = send.group.attachments.compactMap { att in
                            guard let url = mediaFiles[att.id] else { return nil }
                            let kind = AttachmentKind(mimeType: MimeTypeResolver.mimeType(forURL: url)).rawValue
                            return (url, kind)
                        }
                        if !pairs.isEmpty {
                            requeued = (try? await OfflineQueue.shared.enqueueMedia(
                                sourceMediaURLs: pairs.map { $0.url },
                                kinds: pairs.map { $0.kind },
                                conversationId: viewModel.conversationId,
                                content: nil,
                                clientMessageId: send.tempId,
                                originalLanguage: lang,
                                replyToId: send.group.carriesReply ? replyId : nil
                            )) != nil
                        }
                    }
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
                            reason: Self.uploadFailureReason(
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
                let ok = await viewModel.sendMessage(
                    content: textGroup.text ?? "",
                    replyToId: textGroup.carriesReply ? replyId : nil,
                    storyReplyToId: textGroup.carriesReply ? storyReplyId : nil,
                    storyReplyReference: textGroup.carriesReply ? storyRef : nil,
                    originalLanguage: lang,
                    existingTempId: textTempId,
                    location: place
                )
                restorePlaceTile(place, sent: ok)
                anySuccess = anySuccess || ok
            } else if place != nil {
                let ok = await viewModel.sendMessage(
                    content: "",
                    originalLanguage: lang,
                    existingTempId: textTempId,
                    location: place
                )
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
        guard !items.isEmpty else { return }
        // Priming echo (strip multi-selection injected before presenting the
        // picker) — not a user confirmation, nothing to ingest yet.
        if composerState.photoPickerPriming {
            composerState.photoPickerPriming = false
            return
        }
        composerState.selectedPhotoItems.removeAll()
        HapticFeedback.light()
        for item in items {
            let prep = AttachmentPreparationService.shared.preparePhotosPickerItem(
                item,
                context: .message,
                accentColor: accentColor
            )
            trackPreparation(prep)
        }
    }

    func handleFileImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            var importedAny = false
            for url in urls {
                guard url.startAccessingSecurityScopedResource() else { continue }
                defer { url.stopAccessingSecurityScopedResource() }

                let fileName = url.lastPathComponent
                let fileSize = getFileSize(url)
                let mimeType = mimeTypeForURL(url)

                // Copy to temp directory (security-scoped resource expires).
                // A silent `try?` here previously let a failed copy through:
                // the attachment was added to the composer pointing at a
                // tempURL that never existed, only failing at the very end
                // of the send pipeline with no diagnosable cause. Skip this
                // file and surface the failure instead of adding a phantom
                // attachment.
                let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("file_\(UUID().uuidString)_\(fileName)")
                do {
                    try FileManager.default.copyItem(at: url, to: tempURL)
                } catch {
                    Logger.messages.error("File import copy failed for \(fileName, privacy: .public): \(error.localizedDescription, privacy: .public)")
                    FeedbackToastManager.shared.showError("Échec de l'import de \(fileName)")
                    continue
                }

                appendPendingFileAttachment(
                    tempURL: tempURL,
                    fileName: fileName,
                    mimeType: mimeType,
                    fileSize: fileSize
                )
                importedAny = true
            }
            if importedAny { HapticFeedback.light() }
        case .failure:
            composerState.actionAlert = "Erreur lors de l'import"
        }
    }

    func mimeTypeForURL(_ url: URL) -> String {
        // Single source of truth lives in `MimeTypeResolver` (MeeshySDK).
        // See its `forwardTable` for the full extension → mime mapping.
        MimeTypeResolver.mimeType(forURL: url)
    }

    func getFileSize(_ url: URL) -> Int {
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
              let size = attributes[.size] as? Int else {
            return 0
        }
        return size
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
            let data = await ConversationView.readAttachmentFileBytes(url)
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
        if isTyping, let field = Self.currentKeyInputResponder() {
            field.insertText(snippet)
            return
        }
        composerText.text += snippet
    }

    /// Premier répondant de la scène active s'il accepte la saisie clavier.
    ///
    /// La scène passe par `DeviceLayout.activeWindowScene`, jamais par un
    /// parcours de `connectedScenes` fait ici : cet ensemble n'est pas
    /// ordonné, et sous Split View / Slide Over / Stage Manager la scène qui
    /// en sort est régulièrement une scène d'ARRIÈRE-PLAN. Insérer le texte
    /// déposé dans le champ d'une autre fenêtre serait invisible à
    /// l'utilisateur.
    private static func currentKeyInputResponder() -> (UIView & UIKeyInput)? {
        guard let scene = DeviceLayout.activeWindowScene else { return nil }
        for window in scene.windows {
            if let responder = firstResponderKeyInput(in: window) { return responder }
        }
        return nil
    }

    private static func firstResponderKeyInput(in view: UIView) -> (UIView & UIKeyInput)? {
        if view.isFirstResponder { return view as? (UIView & UIKeyInput) }
        for subview in view.subviews {
            if let found = firstResponderKeyInput(in: subview) { return found }
        }
        return nil
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

    func handleCameraVideo(_ url: URL) {
        let prep = AttachmentPreparationService.shared.prepareVideo(
            sourceURL: url,
            deleteSourceAfterCompression: true,
            context: .message,
            accentColor: MeeshyColors.errorHex
        )
        trackPreparation(prep)
    }

    func handleCameraCapture(_ image: UIImage) {
        let prep = AttachmentPreparationService.shared.prepareImage(
            image,
            context: .message,
            accentColor: accentColor
        )
        trackPreparation(prep)
    }

    /// Wire a `PreparingAttachment` into the composer:
    /// 1. Append the in-flight handle so the tray shows a loading tile.
    /// 2. Observe the handle and, when it reaches `.ready`, promote the
    ///    result into the legacy pending dicts the send pipeline already
    ///    knows how to consume. `.failed` simply drops the tile + toasts.
    func trackPreparation(_ prep: PreparingAttachment) {
        composerState.preparingAttachments.append(prep)
        observePreparation(prep)
    }

    private func observePreparation(_ prep: PreparingAttachment) {
        Task { @MainActor [prep] in
            let result = await prep.awaitCompletion()
            switch result {
            case .success(let prepared):
                composerState.pendingMediaFiles[prepared.attachment.id] = prepared.fileURL
                if let thumb = prep.thumbnail {
                    composerState.pendingThumbnails[prepared.attachment.id] = thumb
                }
                composerState.pendingAttachments.append(prepared.attachment)
                HapticFeedback.success()
            case .failure(.preparationFailed(let message)):
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(message)
            }
            composerState.preparingAttachments.removeAll { $0.id == prep.id }
        }
    }

    func sendMessage() {
        guard !composerText.text.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        let text = composerText.text
        let lang = composerState.selectedLanguage
        composerText.text = ""
        viewModel.stopTypingEmission()
        HapticFeedback.light()
        Task {
            await viewModel.sendMessage(content: text, originalLanguage: lang)
        }
    }

    /// Purge les copies durables des pièces jointes du brouillon — à l'envoi
    /// réussi (le brouillon n'existe plus) et au clear explicite. Idempotent.
    func purgeDraftAttachmentMedia() {
        guard let userId = AuthManager.shared.currentUser?.id else { return }
        MessageDraftMediaStore.purge(userId: userId, conversationId: viewModel.conversationId)
    }
}
