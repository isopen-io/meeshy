import SwiftUI
import os
import MeeshySDK
import MeeshyUI

// MARK: - Rendu d'un sticker en image

/// **Ce qu'un lecteur VOIT d'un sticker de conversation** (#4823, moitié ENVOI).
///
/// Le fil transporte deux choses : un PNG — pièce jointe image ORDINAIRE, la
/// seule que voit un lecteur qui ne sait pas dessiner un gabarit — et, à côté,
/// `MessageSticker`, qui dit ce que l'image REPRÉSENTE pour qu'un lecteur
/// capable la redessine en vectoriel. Ce type produit le PNG ; il est PUR
/// (une entrée, une image) pour que les tests le mesurent sans simulateur.
///
/// Trois entrées, trois formes :
/// - un EMOJI se rasterise seul, centré dans un carré transparent — pas
///   `StoryStickerRasterizer`, dont l'image colle au glyphe et dont le cache
///   NSCache n'a rien à faire d'un rendu qui ne sert qu'une fois ;
/// - un GABARIT passe par `StickerTemplateRenderer`, le MÊME moteur que la
///   scène et la vignette de palette (exigence #4110) — la mesure d'abord, pour
///   ramener un cartouche long sous le côté maximal sans le tronquer ;
/// - un LIEU décoré remplit ses emplacements comme `StoryLocationLayer`, repli
///   « Ici » compris, puis suit le chemin du gabarit.
enum ConversationStickerRendering {

    /// Côté du carré emoji, en points — assez pour rester net dans une bulle
    /// à 2× sans peser plus qu'une vignette.
    static let emojiSide: CGFloat = 256
    /// Corps du glyphe : il remplit le carré en laissant l'air qu'Apple laisse
    /// autour de ses propres emojis dans Messages.
    static let emojiFontSize: CGFloat = 200
    /// Côté maximal d'un gabarit rendu, en points.
    static let templateMaxSide: CGFloat = 512
    /// Échelle de rasterisation FIXE : le PNG voyage vers d'autres appareils,
    /// son échelle ne doit pas dépendre de l'écran de l'auteur.
    static let renderScale: CGFloat = 2

    /// Le PNG d'un sticker emoji — carré, transparent, `nil` pour une chaîne
    /// vide (rien à peindre, donc rien à envoyer).
    static func emojiImage(_ emoji: String) -> UIImage? {
        let glyphe = emoji.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !glyphe.isEmpty else { return nil }
        let format = UIGraphicsImageRendererFormat()
        format.opaque = false
        format.scale = renderScale
        let côté = emojiSide
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: côté, height: côté), format: format)
        let attributed = NSAttributedString(string: glyphe,
                                            attributes: [.font: UIFont.systemFont(ofSize: emojiFontSize)])
        let mesure = attributed.size()
        let origine = CGPoint(x: (côté - mesure.width) / 2, y: (côté - mesure.height) / 2)
        return renderer.image { _ in attributed.draw(at: origine) }
    }

    /// Le PNG d'un gabarit, ou `nil` si ce binaire ne sait pas le dessiner —
    /// l'appelant choisit alors son repli (l'emoji du gabarit), comme la scène.
    static func templateImage(templateID: String, slots: [String: String]) -> UIImage? {
        let base = StickerTemplateMetrics.preview(side: templateMaxSide)
        guard let mesure = StickerTemplateRenderer.measuredSize(templateID: templateID, slots: slots, metrics: base),
              mesure.width > 0, mesure.height > 0 else { return nil }
        // Un cartouche mesure son contenu : un nom de lieu long dépasse le
        // côté visé. Les mesures sont proportionnelles au corps, donc réduire
        // le corps du même rapport ramène la boîte sous le plafond.
        let plusLong = max(mesure.width, mesure.height)
        let metrics = plusLong > templateMaxSide
            ? StickerTemplateMetrics.preview(side: templateMaxSide * (templateMaxSide / plusLong))
            : base
        guard let rendu = StickerTemplateRenderer.image(templateID: templateID, slots: slots,
                                                        metrics: metrics, screenScale: renderScale),
              rendu.1.width > 0, rendu.1.height > 0 else { return nil }
        return rendu.0
    }

    /// Les emplacements d'un gabarit de LIEU — même dépouillement que la
    /// scène (`StickerSlotFiller.placeSlots`), même repli localisé « Ici » que
    /// `StoryLocationLayer` pour un lieu sans nom ni adresse.
    static func locationSlots(for place: SharedPlace) -> [String: String] {
        var emplacements = StickerSlotFiller.placeSlots(for: place)
        if (emplacements[StickerSlotFiller.placeNameSlot] ?? "").isEmpty {
            emplacements[StickerSlotFiller.placeNameSlot] = StoryLocationLayer.resolvedLabel(for: place)
        }
        return emplacements
    }
}

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
    /// qu'un fichier, déjà prêt, déjà en mémoire.
    func sendStickerImage(_ image: UIImage, sticker: MessageSticker?) {
        guard let data = image.pngData() else { return }
        let attachmentId = UUID().uuidString
        let fileName = "sticker_\(attachmentId).png"
        let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
        do {
            try data.write(to: fileURL)
        } catch {
            Logger.messages.error("Sticker temp write failed: \(error.localizedDescription, privacy: .public)")
            FeedbackToastManager.shared.showError("Échec de l'envoi de la pièce jointe")
            return
        }

        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        let senderColor = DynamicColorGenerator.colorForName(AuthManager.shared.currentUser?.displayName ?? "?")
        let localKey = fileURL.absoluteString
        let local = MeeshyMessageAttachment(
            id: attachmentId,
            fileName: fileName, originalName: fileName,
            mimeType: "image/png", fileSize: data.count,
            fileUrl: localKey,
            width: Int(image.size.width * image.scale),
            height: Int(image.size.height * image.scale),
            thumbnailUrl: localKey,
            uploadedBy: currentUserId,
            thumbnailColor: senderColor
        )
        // La bulle optimiste lit `file://…` : amorcer les deux caches sous cette
        // clé pour qu'elle peigne sans relire le disque ni le réseau.
        DiskCacheStore.cacheImageForPreview(image, key: localKey)
        Task { await CacheCoordinator.shared.images.save(data, for: localKey) }

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
            await uploadAndSendSticker(
                fileURL: fileURL, data: data, image: image, tempId: tempId, sticker: sticker,
                replyId: replyId, storyReplyId: storyReplyId, storyRef: storyRef,
                originalLanguage: lang, currentUserId: currentUserId
            )
        }
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
