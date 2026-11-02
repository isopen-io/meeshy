import SwiftUI
import os
import MeeshySDK
import MeeshyUI

// MARK: - Envoi depuis la palette

extension ConversationView {

    /// Sticker emoji : le glyphe rendu en PNG + `MessageSticker.emoji`.
    func sendEmojiSticker(_ emoji: String) {
        guard let image = ConversationStickerRendering.emojiImage(emoji) else { return }
        sendStickerImage(image, sticker: .emoji(emoji))
    }

    /// Sticker gabarit : le gabarit rendu en PNG + `MessageSticker.template`.
    /// Un gabarit que ce binaire ne dessine pas part comme son emoji de repli
    /// — le même que verrait un lecteur ancien, pour que l'auteur et lui
    /// voient la même chose.
    func sendTemplateSticker(_ template: StickerTemplate, slots: [String: String]) {
        guard let image = ConversationStickerRendering.templateImage(templateID: template.id, slots: slots) else {
            sendEmojiSticker(template.fallbackEmoji)
            return
        }
        sendStickerImage(image, sticker: .template(template, slots: slots))
    }

    /// Lieu décoré : un gabarit de la famille `location` rempli depuis le
    /// lieu. Dans une conversation le sticker EST le message — le lieu n'est
    /// pas partagé comme position (ce serait `handleLocationSelection`), il
    /// n'est que le texte du cartouche.
    func sendLocationTemplateSticker(place: SharedPlace, template: StickerTemplate) {
        sendTemplateSticker(template, slots: ConversationStickerRendering.locationSlots(for: place))
    }

    /// Mee ou Meo (#9053) : la première image du film en PNG — le repli des
    /// clients qui ne le redessinent pas — et `templateId: "mee.<id>"`, que le
    /// web et iOS rejouent animé. Le contrat est celui du web.
    func sendMeeSticker(_ mee: MeeSticker) {
        guard let image = MeeStickerCatalog.stillImage(mee) else {
            sendEmojiSticker(mee.emoji)
            return
        }
        sendStickerImage(image, sticker: mee.messageSticker)
    }

    /// Un Instant (#9069) : la première image du film avec le texte saisi
    /// posé dessus — le repli des clients qui ne le redessinent pas — et
    /// `templateId: "mee.<id>"` avec ses emplacements, que le web et iOS
    /// rejouent animés. Le contrat est celui du web.
    func sendMeeInstant(_ instant: MeeInstant, slots: [MeeSlot: String]) {
        guard let image = instant.stillImage(slots: slots) else {
            sendEmojiSticker(instant.emoji)
            return
        }
        sendStickerImage(image, sticker: instant.messageSticker(slots: slots))
    }

    /// « Mes stickers » : le PNG collé EST le sticker — aucun gabarit à
    /// redessiner, donc une image ordinaire qui porte seulement l'identifiant
    /// de bibliothèque (`stickerId`), ce que la passerelle compte pour le défi
    /// des stickers (#9635). Un identifiant local non synchronisé ne part pas.
    func sendLibrarySticker(_ item: StoryStickerLibraryItem) {
        sendStickerImage(item.thumbnail, sticker: MessageSticker.library(item.id))
    }

    /// Le chemin d'envoi d'UNE image, réduit à ce qu'un sticker demande — la
    /// même discipline que `sendMessageWithAttachments` pour un groupe visuel
    /// (bulle optimiste persistée AVANT l'upload, cache amorcé sous la clé que
    /// le rendu résout, hors-ligne et échec d'upload vers l'outbox durable),
    /// sans la préparation de tuiles ni la barre de progression : il n'y a
    /// qu'un fichier.
    ///
    /// **La bulle part AVANT les octets** (#4947). Ce chemin postulait « un
    /// fichier déjà prêt, déjà en mémoire » : vrai pour un sticker de la
    /// librairie, faux pour un emoji ou un gabarit, dont le PNG n'existe pas
    /// encore au moment du tap. Encoder puis écrire sur le fil principal
    /// séparait donc le tap du premier pixel. L'image, elle, EST déjà
    /// rasterisée : elle amorce le cache d'aperçu sous l'URL locale — connue
    /// avant que le fichier existe — et la bulle peint sans rien attendre.
    ///
    /// **Un sticker ANIMÉ part avec son fichier d'origine** (#9210) : `original`
    /// porte les octets et le type du pack cinématique, écrits tels quels ;
    /// `image`, sa première image, ne sert qu'à peindre la bulle tout de suite.
    func sendStickerImage(_ image: UIImage, sticker: MessageSticker?,
                          original: StickerSendPipeline.OriginalFile? = nil) {
        let attachmentId = UUID().uuidString
        let directory = FileManager.default.temporaryDirectory
        let mimeType = original?.mimeType ?? StickerSendPipeline.pngMimeType
        let fileURL = StickerSendPipeline.fileURL(id: attachmentId, in: directory, mimeType: mimeType)

        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        let senderColor = DynamicColorGenerator.colorForName(AuthManager.shared.currentUser?.displayName ?? "?")
        let localKey = fileURL.absoluteString
        let local = StickerOptimisticAttachment.make(
            image: image, attachmentId: attachmentId, mimeType: mimeType, fileURL: fileURL,
            sticker: sticker, uploadedBy: currentUserId, color: senderColor
        )
        // La bulle optimiste lit `file://…` : amorcer le cache MÉMOIRE sous
        // cette clé AVANT de la poser pour qu'elle peigne l'image déjà rendue,
        // sans relire le disque ni le réseau. Le cache DISQUE, lui, attend les
        // octets — il est amorcé à la suite de l'encodage.
        DiskCacheStore.cacheImageForPreview(image, key: localKey)

        let route = outgoingReplyRoute
        let replyId = route.replyToId
        let storyReplyId = route.storyReplyToId
        let storyRef = route.storyReference
        let lang = composerState.selectedLanguage
        let tempId = ClientMessageId.generate()
        // Un sticker est un ENVOI comme un autre : la protection armée le suit
        // (#7498), et la rangée se désarme au tap, ici comme ailleurs.
        let protection = viewModel.captureArmedProtection(replyingTo: replyId)

        viewModel.insertOptimisticMediaMessage(
            tempId: tempId, content: "", attachments: [local], messageType: .image,
            replyToId: replyId, storyReplyToId: storyReplyId, replyReference: storyRef,
            originalLanguage: lang, sticker: sticker, protection: protection
        )
        ReplyContextCleaner(conversationId: viewModel.conversationId)
            .clear(pendingReplyReference: &composerState.pendingReplyReference)
        viewModel.stopTypingEmission()
        HapticFeedback.light()

        Task {
            await encodeWriteAndSendSticker(
                image: image, original: original, attachmentId: attachmentId, directory: directory,
                localKey: localKey, tempId: tempId, sticker: sticker,
                relation: ComposerSendRelation.of(route, citing: nil),
                originalLanguage: lang, currentUserId: currentUserId, protection: protection
            )
        }
    }

    /// Encodage PNG et écriture disque, HORS du fil principal, puis l'upload. Un échec d'encodage
    /// ou d'écriture est un échec d'ENVOI (bulle en échec, jamais un spinner fantôme) ; dans une
    /// conversation chiffrée, rien ne s'écrit ni ne se téléverse en clair (#11379).
    private func encodeWriteAndSendSticker(
        image: UIImage, original: StickerSendPipeline.OriginalFile?,
        attachmentId: String, directory: URL, localKey: String,
        tempId: String, sticker: MessageSticker?,
        relation: MessageRelation,
        originalLanguage: String, currentUserId: String, protection: MessageProtectionIntent
    ) async {
        if await EndToEndPieceGuard.refuses([tempId], on: viewModel, toast: { FeedbackToastManager.shared.showError($0) }) { return }
        let written: StickerSendPipeline.WrittenSticker
        do {
            if let original {
                written = try await StickerSendPipeline.prepare(original, id: attachmentId, directory: directory)
            } else {
                written = try await StickerSendPipeline.prepare(image, id: attachmentId, directory: directory)
            }
        } catch {
            Logger.messages.error("Sticker temp write failed: \(error.localizedDescription, privacy: .public)")
            await viewModel.markOptimisticMediaFailed(tempId: tempId, reason: error.localizedDescription)
            FeedbackToastManager.shared.showError("Échec de l'envoi de la pièce jointe")
            return
        }
        // Le cache DISQUE s'amorce EN PARALLÈLE de l'envoi : l'attendre
        // retarderait l'upload d'une seconde écriture des mêmes octets, alors
        // que la bulle peint déjà depuis le cache mémoire.
        Task { await CacheCoordinator.shared.images.save(written.data, for: localKey) }
        await uploadAndSendSticker(
            fileURL: written.url, data: written.data, mimeType: original?.mimeType ?? StickerSendPipeline.pngMimeType,
            image: image, tempId: tempId, sticker: sticker,
            relation: relation,
            originalLanguage: originalLanguage, currentUserId: currentUserId, protection: protection
        )
    }

    /// Upload TUS puis `sendMessage` avec le `tempId` de la bulle déjà posée.
    /// Hors-ligne, ou si l'upload échoue, le PNG rejoint l'outbox durable AVEC
    /// son `sticker` : le dispatcher le rejoue sur `message:send-with-attachments`
    /// à côté de l'id remonté — sans lui, le destinataire recevrait une image
    /// muette.
    private func uploadAndSendSticker(
        fileURL: URL, data: Data, mimeType: String, image: UIImage, tempId: String, sticker: MessageSticker?,
        relation: MessageRelation,
        originalLanguage: String, currentUserId: String, protection: MessageProtectionIntent
    ) async {
        if NetworkMonitor.shared.isOffline {
            await enqueueStickerOffline(fileURL: fileURL, mimeType: mimeType, tempId: tempId, sticker: sticker,
                                        replyId: relation.replyToId, originalLanguage: originalLanguage)
            return
        }
        // Une pièce jointe de MESSAGE ne demande pas de compte : un invité de
        // lien partagé a le droit d'envoyer un sticker (même règle que
        // `sendMessageWithAttachments`).
        guard let baseURL = URL(string: MeeshyConfig.shared.serverOrigin),
              let credential = APIClient.shared.requestCredential else {
            FeedbackToastManager.shared.showError("Échec de l'envoi de la pièce jointe")
            return
        }
        let uploader = TusUploadManager(baseURL: baseURL)
        do {
            let result = try await uploader.uploadFile(fileURL: fileURL, mimeType: mimeType, credential: credential)
            // Amorcer sous la clé que le rendu résout : la transition bulle
            // optimiste → confirmée (file:// → URL serveur) lit un cache chaud
            // et ne retélécharge jamais notre propre upload.
            let renderKey = MeeshyConfig.resolveMediaURL(result.fileUrl)?.absoluteString ?? result.fileUrl
            await CacheCoordinator.shared.images.store(data, for: renderKey)
            DiskCacheStore.cacheImageForPreview(image, key: renderKey)
            _ = await viewModel.send(OutgoingMessage(
                conversationId: ConversationID(viewModel.conversationId),
                content: "",
                relation: relation,
                attachments: OutgoingAttachments(ids: [result.id], previews: [result.toMessageAttachment(uploadedBy: currentUserId)]),
                protection: protection,
                originalLanguage: originalLanguage,
                reusedClientMessageId: MessageID(tempId),
                sticker: sticker
            ))
            // Le fichier a fini son travail : le serveur porte l'image, et un
            // échec d'envoi APRÈS l'upload est rejoué par `sendMessage` avec
            // l'id remonté, jamais depuis ce fichier.
            try? FileManager.default.removeItem(at: fileURL)
        } catch {
            Logger.messages.error("Sticker upload failed: \(error.localizedDescription, privacy: .public)")
            // Même contrat que le groupe visuel : la bulle passe `.sending` →
            // `.queued` (horloge conservée) et l'outbox rejoue l'upload.
            await viewModel.recordSendFailure(tempId: tempId, error: error)
            await enqueueStickerOffline(fileURL: fileURL, mimeType: mimeType, tempId: tempId, sticker: sticker,
                                        replyId: relation.replyToId, originalLanguage: originalLanguage)
        }
    }

    /// Le PNG rejoint l'outbox durable (`enqueueMedia` déplace le fichier sous
    /// `pending-media/`), AVEC son `sticker` — c'est l'exigence de protocole
    /// qui le garantit, pas un défaut concret (voir `OfflineMessageQueueing`).
    private func enqueueStickerOffline(
        fileURL: URL, mimeType: String, tempId: String, sticker: MessageSticker?,
        replyId: String?, originalLanguage: String
    ) async {
        do {
            _ = try await OfflineQueue.shared.enqueueMedia(
                sourceMediaURLs: [fileURL],
                kinds: [AttachmentKind(mimeType: mimeType).rawValue],
                conversationId: viewModel.conversationId,
                content: nil,
                clientMessageId: tempId,
                originalLanguage: originalLanguage,
                replyToId: replyId,
                sticker: sticker
            )
        } catch {
            Logger.messages.error("Sticker offline enqueue failed: \(error.localizedDescription, privacy: .public)")
            FeedbackToastManager.shared.showError("Échec de la mise en file du média")
        }
    }
}
