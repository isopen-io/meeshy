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

    /// « Mes stickers » : le PNG collé EST le sticker — aucun gabarit à
    /// redessiner, donc `sticker: nil` et une image ordinaire.
    func sendLibrarySticker(_ item: StoryStickerLibraryItem) {
        sendStickerImage(item.thumbnail, sticker: nil)
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
    func sendStickerImage(_ image: UIImage, sticker: MessageSticker?) {
        let attachmentId = UUID().uuidString
        let directory = FileManager.default.temporaryDirectory
        let fileName = StickerSendPipeline.fileName(for: attachmentId)
        let fileURL = StickerSendPipeline.fileURL(id: attachmentId, in: directory)

        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        let senderColor = DynamicColorGenerator.colorForName(AuthManager.shared.currentUser?.displayName ?? "?")
        let localKey = fileURL.absoluteString
        let local = MeeshyMessageAttachment(
            id: attachmentId,
            fileName: fileName, originalName: fileName,
            // Le poids n'est pas encore connu — il naîtra de l'encodage, et
            // toutes les surfaces le taisent quand il vaut zéro. L'ESTIMER
            // afficherait un chiffre faux sous une image que le serveur
            // remplacera par sa propre pièce jointe deux secondes plus tard.
            mimeType: "image/png", fileSize: 0,
            fileUrl: localKey,
            width: Int(image.size.width * image.scale),
            height: Int(image.size.height * image.scale),
            thumbnailUrl: localKey,
            uploadedBy: currentUserId,
            thumbnailColor: senderColor
        )
        // La bulle optimiste lit `file://…` : amorcer le cache MÉMOIRE sous
        // cette clé AVANT de la poser pour qu'elle peigne l'image déjà rendue,
        // sans relire le disque ni le réseau. Le cache DISQUE, lui, attend les
        // octets — il est amorcé à la suite de l'encodage.
        DiskCacheStore.cacheImageForPreview(image, key: localKey)

        let pendingRef = composerState.pendingReplyReference
        let isStory = pendingRef?.isStoryReply == true
        let refId = pendingRef?.messageId.isEmpty == false ? pendingRef?.messageId : nil
        let replyId = isStory ? nil : refId
        let storyReplyId = isStory ? refId : nil
        let storyRef = isStory ? pendingRef : nil
        let lang = composerState.selectedLanguage
        let tempId = ClientMessageId.generate()

        viewModel.insertOptimisticMediaMessage(
            tempId: tempId, content: "", attachments: [local], messageType: .image,
            replyToId: replyId, storyReplyToId: storyReplyId, replyReference: storyRef,
            originalLanguage: lang, sticker: sticker
        )
        ReplyContextCleaner(conversationId: viewModel.conversationId)
            .clear(pendingReplyReference: &composerState.pendingReplyReference)
        viewModel.stopTypingEmission()
        HapticFeedback.light()

        Task {
            await encodeWriteAndSendSticker(
                image: image, attachmentId: attachmentId, directory: directory, localKey: localKey,
                tempId: tempId, sticker: sticker,
                replyId: replyId, storyReplyId: storyReplyId, storyRef: storyRef,
                originalLanguage: lang, currentUserId: currentUserId
            )
        }
    }

    /// Encodage PNG et écriture disque, HORS du fil principal, puis l'upload.
    ///
    /// La bulle est déjà là : ce qui suit ne se voit pas. Un échec — un encodage
    /// qui ne rend rien, un disque plein — est un échec d'ENVOI : la bulle
    /// bascule en échec (`markOptimisticMediaFailed`) au lieu de rester un
    /// spinner fantôme pour un fichier qui n'existera jamais.
    private func encodeWriteAndSendSticker(
        image: UIImage, attachmentId: String, directory: URL, localKey: String,
        tempId: String, sticker: MessageSticker?,
        replyId: String?, storyReplyId: String?, storyRef: ReplyReference?,
        originalLanguage: String, currentUserId: String
    ) async {
        let écrit: StickerSendPipeline.WrittenSticker
        do {
            écrit = try await StickerSendPipeline.prepare(image, id: attachmentId, directory: directory)
        } catch {
            Logger.messages.error("Sticker temp write failed: \(error.localizedDescription, privacy: .public)")
            await viewModel.markOptimisticMediaFailed(tempId: tempId, reason: error.localizedDescription)
            FeedbackToastManager.shared.showError("Échec de l'envoi de la pièce jointe")
            return
        }
        // Le cache DISQUE s'amorce EN PARALLÈLE de l'envoi : l'attendre
        // retarderait l'upload d'une seconde écriture des mêmes octets, alors
        // que la bulle peint déjà depuis le cache mémoire.
        Task { await CacheCoordinator.shared.images.save(écrit.data, for: localKey) }
        await uploadAndSendSticker(
            fileURL: écrit.url, data: écrit.data, image: image, tempId: tempId, sticker: sticker,
            replyId: replyId, storyReplyId: storyReplyId, storyRef: storyRef,
            originalLanguage: originalLanguage, currentUserId: currentUserId
        )
    }

    /// Upload TUS puis `sendMessage` avec le `tempId` de la bulle déjà posée.
    /// Hors-ligne, ou si l'upload échoue, le PNG rejoint l'outbox durable AVEC
    /// son `sticker` : le dispatcher le rejoue sur `message:send-with-attachments`
    /// à côté de l'id remonté — sans lui, le destinataire recevrait une image
    /// muette.
    private func uploadAndSendSticker(
        fileURL: URL, data: Data, image: UIImage, tempId: String, sticker: MessageSticker?,
        replyId: String?, storyReplyId: String?, storyRef: ReplyReference?,
        originalLanguage: String, currentUserId: String
    ) async {
        if NetworkMonitor.shared.isOffline {
            await enqueueStickerOffline(fileURL: fileURL, tempId: tempId, sticker: sticker,
                                        replyId: replyId, originalLanguage: originalLanguage)
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
            let result = try await uploader.uploadFile(fileURL: fileURL, mimeType: "image/png", credential: credential)
            // Amorcer sous la clé que le rendu résout : la transition bulle
            // optimiste → confirmée (file:// → URL serveur) lit un cache chaud
            // et ne retélécharge jamais notre propre upload.
            let renderKey = MeeshyConfig.resolveMediaURL(result.fileUrl)?.absoluteString ?? result.fileUrl
            await CacheCoordinator.shared.images.store(data, for: renderKey)
            DiskCacheStore.cacheImageForPreview(image, key: renderKey)
            _ = await viewModel.sendMessage(
                content: "",
                replyToId: replyId,
                storyReplyToId: storyReplyId,
                storyReplyReference: storyRef,
                attachmentIds: [result.id],
                localAttachments: [result.toMessageAttachment(uploadedBy: currentUserId)],
                originalLanguage: originalLanguage,
                existingTempId: tempId,
                sticker: sticker
            )
            // Le fichier a fini son travail : le serveur porte l'image, et un
            // échec d'envoi APRÈS l'upload est rejoué par `sendMessage` avec
            // l'id remonté, jamais depuis ce fichier.
            try? FileManager.default.removeItem(at: fileURL)
        } catch {
            Logger.messages.error("Sticker upload failed: \(error.localizedDescription, privacy: .public)")
            // Même contrat que le groupe visuel : la bulle passe `.sending` →
            // `.queued` (horloge conservée) et l'outbox rejoue l'upload.
            _ = try? await viewModel.messagePersistence.applyEvent(localId: tempId, event: .sendFailed(error))
            await enqueueStickerOffline(fileURL: fileURL, tempId: tempId, sticker: sticker,
                                        replyId: replyId, originalLanguage: originalLanguage)
        }
    }

    /// Le PNG rejoint l'outbox durable (`enqueueMedia` déplace le fichier sous
    /// `pending-media/`), AVEC son `sticker` — c'est l'exigence de protocole
    /// qui le garantit, pas un défaut concret (voir `OfflineMessageQueueing`).
    private func enqueueStickerOffline(
        fileURL: URL, tempId: String, sticker: MessageSticker?,
        replyId: String?, originalLanguage: String
    ) async {
        do {
            _ = try await OfflineQueue.shared.enqueueMedia(
                sourceMediaURLs: [fileURL],
                kinds: [AttachmentKind(mimeType: "image/png").rawValue],
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
