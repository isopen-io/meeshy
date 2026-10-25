import Foundation

extension APIMessage {
    /// `preferredLanguages` — le prisme ORDONNÉ du lecteur
    /// (`MeeshyUser.preferredContentLanguages`), par lequel la CITATION descend
    /// le Prisme au moment où elle est gravée. Vide ⇒ l'original, comme pour
    /// un participant anonyme.
    public func toMessage(
        currentUserId: String,
        currentUsername: String? = nil,
        currentUserDisplayName: String? = nil,
        preferredLanguages: [String] = []
    ) -> MeeshyMessage {
        let msgType: MeeshyMessage.MessageType = {
            switch messageType?.lowercased() {
            case "image": return .image
            case "file": return .file
            case "audio": return .audio
            case "video": return .video
            case "location": return .location
            default: return .text
            }
        }()

        let msgSource: MeeshyMessage.MessageSource = {
            switch messageSource?.lowercased() {
            case "system": return .system
            case "ads": return .ads
            case "app": return .app
            case "agent": return .agent
            case "authority": return .authority
            default: return .user
            }
        }()

        let senderDisplayName = sender?.name
        let senderColor = senderDisplayName.map { DynamicColorGenerator.colorForName($0) }
        let thumbnailColor = senderColor ?? DynamicColorGenerator.colorForName("?")

        let uiAttachments: [MeeshyMessageAttachment] = (attachments ?? []).map { apiAtt in
            let embeddedTranscription: MeeshyMessageAttachment.EmbeddedTranscription? = apiAtt.transcription.map { t in
                MeeshyMessageAttachment.EmbeddedTranscription(
                    text: t.resolvedText,
                    language: t.language ?? "und",
                    confidence: t.confidence,
                    durationMs: t.durationMs,
                    speakerCount: t.speakerCount,
                    segments: t.segments?.map { s in
                        MeeshyMessageAttachment.EmbeddedTranscription.TranscriptionSegmentData(
                            text: s.text,
                            startTime: s.startTime,
                            endTime: s.endTime,
                            speakerId: s.speakerId
                        )
                    }
                )
            }
            let embeddedAudioTranslations: [String: MeeshyMessageAttachment.EmbeddedAudioTranslation]? = apiAtt.translations.flatMap { dict in
                let mapped = dict.compactMapValues { t -> MeeshyMessageAttachment.EmbeddedAudioTranslation? in
                    guard let url = t.url else { return nil }
                    return MeeshyMessageAttachment.EmbeddedAudioTranslation(
                        url: url,
                        transcription: t.transcription,
                        durationMs: t.durationMs,
                        format: t.format,
                        cloned: t.cloned,
                        quality: t.quality,
                        voiceModelId: t.voiceModelId,
                        ttsModel: t.ttsModel,
                        segments: t.segments?.map { s in
                            MeeshyMessageAttachment.EmbeddedTranscription.TranscriptionSegmentData(
                                text: s.text,
                                startTime: s.startTime,
                                endTime: s.endTime,
                                speakerId: s.speakerId
                            )
                        }
                    )
                }
                return mapped.isEmpty ? nil : mapped
            }
            return MeeshyMessageAttachment(
                id: apiAtt.id, fileName: apiAtt.fileName ?? "", originalName: apiAtt.originalName ?? "",
                mimeType: apiAtt.mimeType ?? "application/octet-stream", fileSize: apiAtt.fileSize ?? 0,
                fileUrl: apiAtt.fileUrl ?? "",
                alt: apiAtt.alt,
                forwardedFromAttachmentId: apiAtt.forwardedFromAttachmentId, isForwarded: apiAtt.isForwarded == true,
                capturedInApp: apiAtt.capturedInApp == true,
                isViewOnce: apiAtt.isViewOnce == true, maxViewOnceCount: apiAtt.maxViewOnceCount,
                viewOnceCount: apiAtt.viewOnceCount ?? 0, isBlurred: apiAtt.isBlurred == true,
                effectFlags: apiAtt.effectFlags,
                width: apiAtt.width, height: apiAtt.height,
                thumbnailUrl: apiAtt.thumbnailUrl, thumbHash: apiAtt.thumbHash, duration: apiAtt.duration, uploadedBy: senderId,
                isEncrypted: apiAtt.isEncrypted == true, encryptionMode: apiAtt.encryptionMode,
                latitude: apiAtt.latitude, longitude: apiAtt.longitude,
                thumbnailColor: thumbnailColor,
                transcription: embeddedTranscription,
                audioTranslations: embeddedAudioTranslations,
                imageVariants: apiAtt.imageVariants,
                // #6793 — les réactions par PIÈCE remontent AVEC la pièce. Elles
                // manquaient ici et dans la projection du cache, si bien que la
                // seule surface qui les affiche (la tuile de la bulle) ne voyait
                // jamais que ce que l'appareil venait d'écrire lui-même.
                reactionSummary: apiAtt.reactionSummary,
                currentUserReactions: apiAtt.currentUserReactions,
                deliveredToAllAt: apiAtt.deliveredToAllAt, viewedByAllAt: apiAtt.viewedByAllAt,
                downloadedByAllAt: apiAtt.downloadedByAllAt, listenedByAllAt: apiAtt.listenedByAllAt,
                watchedByAllAt: apiAtt.watchedByAllAt, viewedCount: apiAtt.viewedCount,
                downloadedCount: apiAtt.downloadedCount, consumedCount: apiAtt.consumedCount,
                currentUserConsumption: apiAtt.currentUserConsumption,
                altLanguage: apiAtt.altLanguage,
                altTranslations: apiAtt.altTranslations
            )
        }

        let uiReactions = MeeshyReaction.reconstructFromSummary(
            messageId: id,
            reactionSummary: reactionSummary,
            currentUserReactions: currentUserReactions,
            currentUserId: currentUserId
        )

        let uiReplyTo: ReplyReference? = {
            if let reply = replyTo {
                // Site UNIQUE, partagé avec le jumeau CACHE
                // (`MessagePersistenceActor.replyToJson`) : média représentatif,
                // protection, Prisme et faits gravés y sont décidés une fois.
                return reply.toReplyReference(currentUserId: currentUserId, preferredLanguages: preferredLanguages)
            }
            // Snapshot figé du post cité (vignette + compteurs like/commentaire/
            // partage + date, ou emoji+contenu+date pour un mood) — la citation
            // affiche le vrai aperçu et survit à l'expiration du post.
            if let target = postReplyTo {
                // #7950 — retirée par son auteur : plus rien à montrer ni à ouvrir.
                if target.deletedAt != nil { return .unavailableStory(storyId: target.id) }
                // Réponse à un mood : rendu dédié (emoji + contenu + date).
                if let emoji = target.moodEmoji {
                    // `authorAvatarUrl` reste nil, DELIBEREMENT : le snapshot
                    // `postReplyTo` ne porte aucun avatar d'auteur, et une
                    // citation de mood n'ouvre aucun profil (elle saute au post).
                    return ReplyReference(
                        messageId: target.id,
                        // Le nom vient du snapshot serveur. Vide sur un snapshot
                        // legacy : `quotedTitle` retombe alors sur « Humeur »,
                        // filet et non cas nominal.
                        authorName: target.authorName ?? "",
                        previewText: target.previewText,
                        isStoryReply: true,
                        storyPublishedAt: target.createdAt,
                        moodEmoji: emoji
                    )
                }
                // Idem : aucun avatar dans le snapshot `postReplyTo`, et
                // `authorName` vaut litteralement "Story" — il n'y a pas de
                // personne a ouvrir depuis cette citation.
                return ReplyReference(
                    messageId: target.id, authorName: "Story",
                    previewText: target.previewText.isEmpty ? "\u{1F4F7} Story" : target.previewText,
                    isStoryReply: true,
                    storyPublishedAt: target.createdAt,
                    storyReactionCount: target.reactionCount,
                    storyCommentCount: target.commentCount,
                    storyShareCount: target.shareCount,
                    storyThumbnailUrl: target.thumbnailUrl
                )
            }
            if let storyId = storyReplyToId, !storyId.isEmpty {
                // Aucun instantané servi : la story a disparu (#7895). La
                // citation subsiste, compacte et sans porte.
                return .unavailableStory(storyId: storyId)
            }
            return nil
        }()

        let uiForwardRef: ForwardReference? = {
            guard let fwd = forwardedFrom else { return nil }
            let fwdSenderName = fwd.sender?.name ?? "?"
            let firstAtt = fwd.attachments?.first
            // Same mime → short kind contract as `uiReplyTo` above —
            // single source of truth is `AttachmentKind`.
            let fwdKindRaw = firstAtt?.mimeType.map { AttachmentKind(mimeType: $0).rawValue }
            return ForwardReference(
                originalMessageId: fwd.id,
                senderName: fwdSenderName,
                senderAvatar: fwd.sender?.avatar,
                previewText: fwd.content ?? "",
                conversationId: forwardedFromConversation?.id,
                // Même repli que `MeeshyConversation.name` : un public sans
                // titre garde un nom affichable via son identifier.
                conversationName: forwardedFromConversation?.title ?? forwardedFromConversation?.identifier,
                attachmentType: fwdKindRaw,
                attachmentThumbnailUrl: firstAtt?.thumbnailUrl,
                conversationType: forwardedFromConversation?.type,
                senderUserId: fwd.sender?.resolvedUserId
            )
        }()
        let resolvedUsername = sender?.username ?? sender?.user?.username
        let isMe = (sender?.resolvedUserId ?? senderId) == currentUserId
            || (currentUsername != nil && resolvedUsername?.lowercased() == currentUsername?.lowercased())

        // Un écho socket allégé peut omettre l'enveloppe expéditeur. Pour MON
        // propre message, l'identité de la session est déjà la vérité en local :
        // s'en servir évite que l'aperçu de la liste perde le nom de l'auteur
        // entre l'insertion optimiste et le prochain resync REST. Repli
        // strictement borné à `isMe` — jamais deviner le nom d'un autre.
        let effectiveSenderName = senderDisplayName ?? (isMe ? currentUserDisplayName : nil)
        let effectiveSenderUsername = resolvedUsername ?? (isMe ? currentUsername : nil)

        var effects: MessageEffects = .none
        if let flags = effectFlags, flags > 0 {
            effects.flags = MessageEffectFlags(rawValue: flags)
        } else {
            if isBlurred == true { effects.flags.insert(.blurred) }
            if isViewOnce == true { effects.flags.insert(.viewOnce) }
            if expiresAt != nil { effects.flags.insert(.ephemeral) }
        }
        // #7452 — la DURÉE voyage désormais avec le message, et c'est elle qui
        // fait l'échéance quand elle est combinée à la réception LOCALE. Sans
        // cette ligne, `message:new` (qui ne porte plus d'`expiresAt` pour un
        // éphémère, contrat #7451 point 4) laisserait un message éphémère sans
        // aucune horloge.
        if let ephemeralDuration, ephemeralDuration > 0 {
            effects.ephemeralDuration = ephemeralDuration
            effects.flags.insert(.ephemeral)
        }

        if let username = resolvedUsername, let displayName = senderDisplayName, displayName != username {
            UserDisplayNameCache.shared.track(username: username, displayName: displayName)
        }

        let computedDeliveryStatus: MeeshyMessage.DeliveryStatus = {
            if (readCount ?? 0) > 0 || readByAllAt != nil { return .read }
            if (deliveredCount ?? 0) > 0 || deliveredToAllAt != nil { return .delivered }
            return .sent
        }()

        return MeeshyMessage(
            id: id, clientMessageId: clientMessageId,
            conversationId: conversationId, senderId: senderId,
            content: content ?? "",
            originalLanguage: originalLanguage ?? "fr", messageType: msgType, messageSource: msgSource,
            isEdited: isEdited ?? false, editedById: editedById, deletedAt: deletedAt, replyToId: replyToId,
            storyReplyToId: storyReplyToId,
            forwardedFromId: forwardedFromId, forwardedFromConversationId: forwardedFromConversationId,
            expiresAt: expiresAt, effects: effects,
            pinnedAt: pinnedAt.flatMap(WireDate.date(from:)),
            pinnedBy: pinnedBy,
            isEncrypted: isEncrypted ?? false, encryptionMode: encryptionMode,
            createdAt: createdAt, updatedAt: updatedAt ?? createdAt,
            attachments: uiAttachments, reactions: uiReactions, replyTo: uiReplyTo,
            forwardedFrom: uiForwardRef,
            senderName: effectiveSenderName, senderUsername: effectiveSenderUsername, senderColor: senderColor,
            senderAvatarURL: sender?.resolvedAvatar, senderUserId: sender?.resolvedUserId,
            senderIsAnonymous: sender?.isAnonymous ?? false,
            senderHasAccount: sender.map(\.hasAccount) ?? (isMe || msgSource != .user),
            senderRing: sender?.profileDecor?.avatarRing,
            deliveryStatus: computedDeliveryStatus,
            isMe: isMe,
            deliveredToAllAt: deliveredToAllAt, readByAllAt: readByAllAt,
            deliveredCount: deliveredCount ?? 0, readCount: readCount ?? 0,
            recipientCount: recipientCount ?? 0,
            callSummary: callSummary,
            joinNotice: joinNotice,
            captureNotice: captureNotice,
            arrivalsNotice: arrivalsNotice, encryptionSwitchNotice: encryptionSwitchNotice,
            sticker: sticker,
            trackedLinkMap: trackedLinkMap
        )
    }
}
