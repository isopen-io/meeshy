import Foundation
import MeeshySDK
import MeeshyUI

extension BubbleContent {
    /// Construit le BubbleContent depuis un Message + son contexte de traduction.
    /// Centralise toute la logique aujourd'hui inline dans ThemedMessageBubble :
    /// effectiveContent, currentDisplayLangCode, hasAnyTranslation, isEmojiOnly,
    /// reactionSummaries, etc. Aucune sous-vue n'a besoin de refaire ces calculs.
    init(
        message: Message,
        translations: [MessageTranslation],
        preferredTranslation: MessageTranslation?,
        translatedAudios: [MessageTranslatedAudio] = [],
        userLanguages: (regional: String?, custom: String?) = (nil, nil),
        secondaryLangCode: String? = nil,
        activeDisplayLangCode: String? = nil,
        // Langue de la piste AUDIO préférée du Prisme (résolue en amont via
        // `AudioTrackLanguageResolver` — le builder ne connaît pas la langue
        // primaire de l'utilisateur). Repli de `activeLang` et de
        // `preferredLangCode` quand le message n'a AUCUNE traduction texte :
        // sans lui, le drapeau-toggle d'un vocal traduit restait inerte
        // (`preferredLangCode` nil ⇒ tap sans effet) et affichait la
        // mauvaise face (user 2026-08-18 : le drapeau doit switcher l'audio).
        preferredAudioLangCode: String? = nil,
        currentUserId: String,
        timeString: String? = nil,
        isEditSaving: Bool = false,
        hasEditHistory: Bool = false,
        recipientCount: Int = 1,
        // 4th axis of the Prisme étendu (2026-05-26) — device locale, gated
        // identically to `regional`/`custom` in `buildAvailableFlags` (only
        // surfaced when a translation actually exists for it). Default `nil`
        // keeps every existing call site (none of which pass this yet)
        // unchanged. See CLAUDE.md "Prisme Linguistique" for resolution order.
        deviceLocale: String? = nil
    ) {
        self.messageId = message.id
        self.isMe = message.isMe
        self.senderName = message.senderName

        // --- Kind ---
        // Note: `.burned` does NOT exclude `isMe`. The sender also sees the
        // "Vu et efface" state once their view-once message has been consumed,
        // matching the legacy `ThemedMessageBubble.isViewOnceBurned` semantics
        // (the wrapper additionally gates on `blurController.isRevealed`,
        // which is a runtime concern handled in the wrapper, not in BubbleContent).
        // System messages (call summaries: "Appel vidéo · 04:32", "Appel
        // refusé", …) render as a centered notice, never as a chat bubble.
        // Checked first so a system message is never mistaken for a deleted /
        // view-once bubble.
        if message.messageSource == .system {
            self.kind = .system
        } else if message.isDeleted {
            self.kind = .deleted
        } else if message.isViewOnce && message.viewOnceCount > 0 {
            self.kind = .burned
        } else {
            self.kind = .standard
        }

        // Resolved once — the compact call bubble and the standard bubble's meta
        // row share the exact same clock label.
        let resolvedTimeString = timeString
            ?? message.cachedTimeString
            ?? MessageRecord.computeTimeString(for: message.createdAt)

        // --- Call notice (rich call-summary system message) ---
        // When a system message carries structured call metadata, resolve the
        // per-viewer direction now (outgoing iff the current user initiated) so
        // the leaf view stays primitive. Absent metadata (legacy summaries) →
        // nil, and the `.system` path falls back to the plain centered notice.
        if message.messageSource == .system, let summary = message.callSummary {
            self.callNotice = CallNotice(
                summary: summary,
                isOutgoing: summary.isOutgoing(currentUserId: currentUserId),
                fallbackText: message.content,
                timeString: resolvedTimeString,
                timestamp: message.createdAt
            )
        } else {
            self.callNotice = nil
        }

        // --- Avis d'arrivée ---
        // Une arrivée n'est PAS une prise de parole : sans branche dédiée elle
        // se rendrait comme un message signé de l'arrivant, et le fil
        // raconterait que le premier mot de chaque nouveau venu est l'annonce
        // de sa propre venue. Le texte vient du CATALOGUE au rendu, jamais du
        // `content` stocké — celui-ci n'est qu'un repli français, et le Prisme
        // Linguistique veut que chaque lecteur voie sa langue.
        if message.messageSource == .system, let notice = message.joinNotice {
            self.joinNotice = JoinNotice(
                participantId: notice.participantId,
                displayName: notice.displayName,
                isAnonymous: notice.isAnonymous,
                viaShareLink: notice.viaShareLink,
                fallbackText: message.content,
                username: notice.username,
                givenName: notice.givenName,
                linkRules: notice.linkRules
            )
        } else {
            self.joinNotice = nil
        }

        // --- Text + emoji ---
        let activeLang = activeDisplayLangCode
            ?? preferredTranslation?.targetLanguage
            ?? preferredAudioLangCode
            ?? message.originalLanguage
        let effective = Self.resolveEffectiveContent(
            message: message,
            translations: translations,
            preferredTranslation: preferredTranslation,
            activeLangCode: activeLang
        )
        // Emoji-only detection MUST analyze the original `message.content`,
        // not the post-translation `effective`. Translated text may add
        // words for an emoji-only original (or vice-versa); the visual
        // rendering decision tracks the source. We still display `effective`
        // (post-translation) in `text.raw` below.
        //
        // Detection is reply-agnostic: an emoji sent as a reply stays
        // emoji-only. `BubbleStandardLayout` branches on `content.reply` —
        // no reply → free-floating large emoji (no bubble); reply → emoji
        // hosted in the bubble above the quoted-reply card, large & centered.
        let emojiResult: EmojiDetector.EmojiOnlyResult = {
            // `message.location` compte comme une pièce jointe pour cette
            // détection : un emoji accompagné d'un lieu doit rendre la bulle
            // (qui héberge LocationMessageView), pas l'emoji libre hors bulle —
            // même sémantique qu'avec l'ancienne pièce jointe `.location`.
            guard !message.content.isEmpty,
                  message.attachments.isEmpty,
                  message.location == nil else {
                return .notEmojiOnly
            }
            return EmojiDetector.analyze(message.content)
        }()
        let isEmojiOnly = emojiResult != .notEmojiOnly
        let firstLinkURL = LinkPreviewFetcher.firstURL(in: effective)
        // Outbound-link tracking: resolve the embed façade destination ONCE here
        // (firstLinkURL → token → /l/<token>) so the leaf views stay primitive.
        let embedTrackedURL: URL? = firstLinkURL
            .flatMap { message.trackedLinkMap[$0] }
            .flatMap { URL(string: "https://meeshy.me/l/\($0)") }
        self.text = effective.isEmpty ? nil : Text(
            raw: effective,
            isEmojiOnly: isEmojiOnly,
            emojiFontSize: emojiResult.fontSize,
            // Précalcul unique du lien (NSDataDetector) — réutilisé par
            // `hasBubbleBodyContent` et le rendu du link preview sans re-scan.
            firstLinkURL: firstLinkURL,
            // Résolution embed vidéo (YouTube) au même endroit, une seule fois.
            embeddedVideo: firstLinkURL.flatMap { EmbeddableVideoResolver.resolve(urlString: $0) },
            trackedLinks: message.trackedLinkMap,
            embedTrackedURL: embedTrackedURL
        )

        // --- Translation panel ---
        let hasAny = !translations.isEmpty || !translatedAudios.isEmpty
        if hasAny && !isEmojiOnly {
            let flags = Self.buildAvailableFlags(
                activeLang: activeLang.lowercased(),
                originalLang: message.originalLanguage.lowercased(),
                preferredLang: preferredTranslation?.targetLanguage.lowercased(),
                regional: userLanguages.regional?.lowercased(),
                custom: userLanguages.custom?.lowercased(),
                deviceLocale: deviceLocale?.lowercased(),
                translations: translations,
                translatedAudios: translatedAudios
            )
            let secondaryContent: String? = {
                guard let code = secondaryLangCode else { return nil }
                let lower = code.lowercased()
                if lower == message.originalLanguage.lowercased() { return message.content }
                return translations.first(where: { $0.targetLanguage.lowercased() == lower })?.translatedContent
            }()
            self.translation = Translation(
                preferredContent: preferredTranslation?.translatedContent,
                activeLangCode: activeLang,
                originalLangCode: message.originalLanguage,
                preferredLangCode: preferredTranslation?.targetLanguage ?? preferredAudioLangCode,
                availableFlags: flags,
                secondaryLangCode: secondaryLangCode,
                secondaryContent: secondaryContent
            )
        } else {
            self.translation = nil
        }

        // --- Reply ---
        if let replyRef = message.replyTo {
            self.reply = Reply(reference: replyRef, isStory: replyRef.isStoryReply)
        } else {
            self.reply = nil
        }

        // --- Lieu partagé ---
        // `message.location` est la voie serveur actuelle (colonne
        // `locationJson`, hissée par le gateway) : `MessageAttachment` n'a
        // aucun champ géographique en Prisma, le serveur ne peut plus produire
        // de pièce jointe `.location`. Celles-ci ne subsistent que dans
        // d'anciennes lignes du cache local — la branche par pièce jointe
        // reste donc en place pour elles (filtre `nonMedia` ci-dessous).
        self.location = message.location

        // --- Sticker (#4823) ---
        // Un message-sticker arrive avec `content == ""`, UNE pièce jointe
        // image (le PNG rendu, repli des lecteurs qui ne dessinent pas le
        // gabarit) et `message.sticker`. Le PNG est rattaché au sticker et
        // RETIRÉ de la grille visuelle : sans cette exclusion, la bulle
        // rendrait le sticker natif ET, dessous, son propre repli en photo.
        // Un sticker non rendable vaut absent (`ifRenderable`) et laisse la
        // pièce jointe à la grille — mieux vaut la photo qu'un vide.
        let sticker = Self.resolveSticker(message.sticker, attachments: message.attachments)
        self.sticker = sticker
        let stickerPictureId = sticker?.picture?.attachmentId

        // --- Attachments ---
        let visual = message.attachments.filter {
            ($0.type == .image || $0.type == .video) && $0.id != stickerPictureId
        }
        let audio = message.attachments.filter { $0.type == .audio }
        // Exclusivité du rendu de lieu : quand `message.location` est présent,
        // une éventuelle pièce jointe `.location` (doublon hérité du cache)
        // est écartée pour que le lieu ne soit rendu qu'UNE fois.
        let nonMedia = message.attachments.filter {
            $0.type == .file || ($0.type == .location && message.location == nil)
        }

        // Pure single-category cases route to dedicated enum variants. Anything
        // mixing two-or-more categories falls into `.mixed` which carries audio
        // alongside visual/nonMedia so legacy "image + audio + file" rendering
        // is preserved. `audio` carries ALL audio tracks of the message: one
        // renders as the existing widget, several as `AudioCarouselView`.
        switch (visual.isEmpty, audio.isEmpty, nonMedia.isEmpty) {
        case (true, true, true):
            self.attachments = .none
        case (false, true, true):
            self.attachments = .visualGrid(visual)
        case (true, false, true):
            self.attachments = .audio(audio)
        case (true, true, false):
            self.attachments = .nonMedia(nonMedia)
        default:
            self.attachments = .mixed(visual: visual, audio: audio, nonMedia: nonMedia)
        }

        // --- Ephemeral ---
        if let exp = message.expiresAt, exp.timeIntervalSinceNow > 0 {
            self.ephemeral = Ephemeral(expiresAt: exp)
        } else {
            self.ephemeral = nil
        }

        // --- Other flags ---
        self.isBlurred = message.isBlurred
        self.isViewOnce = message.isViewOnce
        self.isPinned = message.pinnedAt != nil
        // **Le site UNIQUE où l'attribution d'un transfert se tranche** (#5058).
        //
        // `forwardedFromId` dit QUE le message est un transfert ;
        // `ForwardBadgePolicy` dit QUI a le droit d'être nommé — un groupe au
        // moins public, l'auteur en tête-à-tête, personne sinon. Les deux
        // doivent être lus ENSEMBLE : une référence absente sur un transfert
        // avéré rend `.anonymous`, qui est un badge, pas une absence de badge.
        self.forwardAttribution = message.forwardedFromId == nil
            ? nil
            : ForwardBadgePolicy.attribution(for: message.forwardedFrom)
        self.editedAt = message.isEdited ? message.updatedAt : nil
        self.isEditSaving = isEditSaving
        self.hasEditHistory = hasEditHistory

        // --- Reactions ---
        self.reactions = Self.summarizeReactions(message.reactions, currentUserId: currentUserId)

        // --- Meta ---
        // The footer checkmark must EXACTLY represent the real state of every
        // other interlocutor. `message.deliveryStatus` is promoted to
        // delivered/read as soon as a SINGLE recipient does so — correct for a
        // 1:1 but misleading in a group. Re-resolve with the recipient count so
        // ✓✓ (delivered) / indigo ✓✓ (read) only light up once ALL recipients
        // have received / read. `recipientCount <= 1` trusts the stored status.
        self.meta = Meta(
            timeString: resolvedTimeString,
            deliveryStatus: message.isMe
                ? DeliveryStatusResolver.resolve(
                    status: message.deliveryStatus,
                    deliveredCount: message.deliveredCount,
                    readCount: message.readCount,
                    recipientCount: recipientCount,
                    deliveredToAllAt: message.deliveredToAllAt,
                    readByAllAt: message.readByAllAt,
                    // Réciprocité, appliquée UNIQUEMENT ici : c'est le site
                    // d'AFFICHAGE. Les deux autres appelants du résolveur
                    // (ConversationSyncEngine, ConversationSocketHandler) sont
                    // des chemins de persistance — les gater corromprait l'état
                    // stocké, qui doit rester vrai quelle que soit la préférence.
                    // @see docs/superpowers/specs/2026-07-24-read-exactness-design.md
                    showReadReceipts: UserPreferencesManager.shared.privacy.showReadReceipts)
                : nil
        )
    }

    // MARK: - Pure helpers (testables)

    /// Le sticker que la bulle dessine, avec le PNG qui l'accompagne — `nil`
    /// quand le message n'en porte pas, ou en porte un NON rendable (ni
    /// gabarit ni emoji : rien à peindre, `MessageSticker.ifRenderable`).
    ///
    /// Le PNG est la PREMIÈRE pièce jointe image : le composer n'en envoie
    /// qu'une, et un lecteur qui en verrait deux n'aurait aucun moyen de dire
    /// laquelle est le repli. La projection en `Picture` est faite ICI, une
    /// fois, pour que la feuille ne relise jamais `MeeshyMessageAttachment`.
    static func resolveSticker(
        _ sticker: MessageSticker?,
        attachments: [MeeshyMessageAttachment]
    ) -> Sticker? {
        guard let sticker = sticker?.ifRenderable else { return nil }
        let picture = attachments.first(where: { $0.type == .image }).map {
            Sticker.Picture(
                attachmentId: $0.id,
                fileUrl: $0.fileUrl,
                thumbnailUrl: $0.thumbnailUrl,
                thumbHash: $0.thumbHash,
                thumbnailColor: $0.thumbnailColor
            )
        }
        return Sticker(
            templateId: sticker.templateId,
            slots: sticker.slots,
            animation: sticker.animation,
            emoji: sticker.emoji,
            picture: picture
        )
    }

    static func resolveEffectiveContent(
        message: Message,
        translations: [MessageTranslation] = [],
        preferredTranslation: MessageTranslation?,
        activeLangCode: String
    ) -> String {
        let active = activeLangCode.lowercased()
        if active == message.originalLanguage.lowercased() {
            return message.content
        }
        if let direct = translations.first(where: { $0.targetLanguage.lowercased() == active }) {
            return direct.translatedContent
        }
        if let pref = preferredTranslation,
           pref.targetLanguage.lowercased() == active {
            return pref.translatedContent
        }
        // Prisme rule #1 — no translation matches the active language, which means
        // the content is already in that language (or no translation exists for it):
        // return the ORIGINAL. Never fall back to the preferred-language translation,
        // which would show content in a language the user did not select.
        // Source: apps/ios/CLAUDE.md "Régles critiques du Prisme".
        return message.content
    }

    static func buildAvailableFlags(
        activeLang: String,
        originalLang: String,
        preferredLang: String?,
        regional: String?,
        custom: String?,
        // 4th axis of the Prisme étendu (2026-05-26) — gated identically to
        // `regional`/`custom`: only surfaced when a translation (text or
        // audio) actually exists for it. Never supplants the first 3 axes.
        deviceLocale: String? = nil,
        translations: [MessageTranslation],
        translatedAudios: [MessageTranslatedAudio]
    ) -> [String] {
        let hasTranslation: (String) -> Bool = { code in
            translations.contains(where: { $0.targetLanguage.lowercased() == code })
            || translatedAudios.contains(where: { $0.targetLanguage.lowercased() == code })
        }
        var all: [String] = [originalLang]
        var seen: Set<String> = [originalLang]
        if let p = preferredLang, !seen.contains(p) {
            all.append(p); seen.insert(p)
        }
        if let r = regional, !seen.contains(r), hasTranslation(r) {
            all.append(r); seen.insert(r)
        }
        if let c = custom, !seen.contains(c), hasTranslation(c) {
            all.append(c); seen.insert(c)
        }
        if let d = deviceLocale, !seen.contains(d), hasTranslation(d) {
            all.append(d); seen.insert(d)
        }
        return all.filter { $0 != activeLang }
    }

    /// Aggregates raw reactions into stable-ordered summaries.
    ///
    /// Tri stable garanti : chaque emoji est positionne selon sa PLUS ANCIENNE
    /// `createdAt` parmi les reactions de cet emoji. Ainsi, meme si le backend
    /// renvoie `message.reactions` dans un ordre different apres un socket
    /// update (re-sync, edit, etc.), l'ordre d'affichage reste celui de la
    /// premiere apparition chronologique reelle. C'est la condition pour que
    /// les pills ne "dansent" pas pendant que l'utilisateur scroll ou
    /// manipule la bulle.
    static func summarizeReactions(
        _ reactions: [MeeshyReaction],
        currentUserId: String
    ) -> [MeeshyReactionSummary] {
        var emojiData: [String: (count: Int, includesMe: Bool, firstSeen: Date)] = [:]
        for reaction in reactions {
            let isMe = reaction.participantId == currentUserId
            if var existing = emojiData[reaction.emoji] {
                existing.count += 1
                existing.includesMe = existing.includesMe || isMe
                if reaction.createdAt < existing.firstSeen {
                    existing.firstSeen = reaction.createdAt
                }
                emojiData[reaction.emoji] = existing
            } else {
                emojiData[reaction.emoji] = (count: 1, includesMe: isMe, firstSeen: reaction.createdAt)
            }
        }
        // Tri primaire par `firstSeen` asc ; tie-break par emoji pour stabilite
        // totale si deux emojis ont exactement la meme date (cas de double-tap).
        return emojiData
            .map { (emoji: $0.key, data: $0.value) }
            .sorted { lhs, rhs in
                if lhs.data.firstSeen == rhs.data.firstSeen {
                    return lhs.emoji < rhs.emoji
                }
                return lhs.data.firstSeen < rhs.data.firstSeen
            }
            .map { entry in
                MeeshyReactionSummary(
                    emoji: entry.emoji,
                    count: entry.data.count,
                    includesMe: entry.data.includesMe
                )
            }
    }
}
