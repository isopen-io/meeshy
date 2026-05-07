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
        currentUserId: String,
        timeString: String? = nil,
        isEditSaving: Bool = false,
        hasEditHistory: Bool = false
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
        if message.isDeleted {
            self.kind = .deleted
        } else if message.isViewOnce && message.viewOnceCount > 0 {
            self.kind = .burned
        } else {
            self.kind = .standard
        }

        // --- Text + emoji ---
        let activeLang = activeDisplayLangCode
            ?? preferredTranslation?.targetLanguage
            ?? message.originalLanguage
        let effective = Self.resolveEffectiveContent(
            message: message,
            translations: translations,
            preferredTranslation: preferredTranslation,
            activeLangCode: activeLang
        )
        // Emoji-only detection MUST analyze the original `message.content`,
        // not the post-translation `effective`, to mirror the legacy bubble
        // (ThemedMessageBubble.emojiOnlyResult, lines 157-164). Translated
        // text may add words for an emoji-only original (or vice-versa);
        // the visual rendering decision tracks the source. We still display
        // `effective` (post-translation) in `text.raw` below.
        let emojiResult: EmojiDetector.EmojiOnlyResult = {
            guard !message.content.isEmpty,
                  message.attachments.isEmpty,
                  message.replyTo == nil else {
                return .notEmojiOnly
            }
            return EmojiDetector.analyze(message.content)
        }()
        let isEmojiOnly = emojiResult != .notEmojiOnly
        self.text = effective.isEmpty ? nil : Text(
            raw: effective,
            isEmojiOnly: isEmojiOnly,
            emojiFontSize: emojiResult.fontSize
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

        // --- Attachments ---
        let visual = message.attachments.filter { $0.type == .image || $0.type == .video }
        let audio = message.attachments.first(where: { $0.type == .audio })
        let nonMedia = message.attachments.filter { $0.type == .file || $0.type == .location }

        // Pure single-category cases route to dedicated enum variants. Anything
        // mixing two-or-more categories falls into `.mixed` which carries audio
        // alongside visual/nonMedia so legacy "image + audio + file" rendering
        // is preserved. Audio is intentionally optional inside `.mixed` because
        // visual+nonMedia without audio is also a valid mix.
        switch (visual.isEmpty, audio == nil, nonMedia.isEmpty) {
        case (true, true, true):
            self.attachments = .none
        case (false, true, true):
            self.attachments = .visualGrid(visual)
        case (true, false, true):
            self.attachments = .audio(audio!)
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
        self.isForwarded = message.forwardedFromId != nil
        self.editedAt = message.isEdited ? message.updatedAt : nil
        self.isEditSaving = isEditSaving
        self.hasEditHistory = hasEditHistory

        // --- Reactions ---
        self.reactions = Self.summarizeReactions(message.reactions, currentUserId: currentUserId)

        // --- Meta ---
        let resolvedTimeString = timeString ?? message.cachedTimeString ?? ""
        self.meta = Meta(
            timeString: resolvedTimeString,
            deliveryStatus: message.isMe ? message.deliveryStatus : nil
        )
    }

    // MARK: - Pure helpers (testables)

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
        // TODO(prisme): the last-resort fallback to `preferredTranslation?.translatedContent`
        // diverges from the Prisme rule #1 ("if no translation matches the preferred
        // language, return the original content — never tomber sur translations.first").
        // We mirror legacy ThemedMessageBubble.effectiveContent for visual fidelity
        // during the bubble-decompose refactor; align with `resolveUserLanguage()`
        // in a separate audit. Source: apps/ios/CLAUDE.md "Régles critiques du Prisme".
        return preferredTranslation?.translatedContent ?? message.content
    }

    static func buildAvailableFlags(
        activeLang: String,
        originalLang: String,
        preferredLang: String?,
        regional: String?,
        custom: String?,
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
        return all.filter { $0 != activeLang }
    }

    /// Aggregates raw reactions into stable-ordered summaries (first-seen per emoji).
    /// Mirrors the legacy logic from ThemedMessageBubble.reactionSummaries.
    static func summarizeReactions(
        _ reactions: [MeeshyReaction],
        currentUserId: String
    ) -> [MeeshyReactionSummary] {
        var emojiCounts: [String: (count: Int, includesMe: Bool)] = [:]
        var emojiOrder: [String] = []
        for reaction in reactions {
            let isMe = reaction.participantId == currentUserId
            if var existing = emojiCounts[reaction.emoji] {
                existing.count += 1
                existing.includesMe = existing.includesMe || isMe
                emojiCounts[reaction.emoji] = existing
            } else {
                emojiCounts[reaction.emoji] = (count: 1, includesMe: isMe)
                emojiOrder.append(reaction.emoji)
            }
        }
        return emojiOrder.compactMap { emoji in
            guard let data = emojiCounts[emoji] else { return nil }
            return MeeshyReactionSummary(emoji: emoji, count: data.count, includesMe: data.includesMe)
        }
    }
}
