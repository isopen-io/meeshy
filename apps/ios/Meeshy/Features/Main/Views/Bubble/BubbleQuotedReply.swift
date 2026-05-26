import SwiftUI
import MeeshySDK
import MeeshyUI

/// Reply preview affichee a l'interieur d'une bulle (citation du message
/// auquel on repond). Delegue a `BubbleStoryReplyPreview` quand la cible
/// est une story.
///
/// Was: ThemedMessageBubble.quotedReplyView (lines 961-1031) +
/// storyReplyPreview (lines 1034-1086) + replyAttachmentIcon (lines 1088-1097).
///
/// `ReplyReference` n'est ni Equatable ni Hashable cote SDK
/// (Codable & Sendable seulement), donc on projette les champs
/// rendus dans `ReplySlice` pour comparer manuellement.
struct BubbleQuotedReply: View, Equatable {
    /// Style d'enveloppe de la citation.
    /// - `.card` : variante historique — RR12 + bgColor teinté + paddings extérieurs (top 6, horizontal 6). Hôte = bulle chat colorée.
    /// - `.inline` : sans RR12 ni paddings extérieurs — la surface vient du parent (widget audio `playerBackground` ou conteneur unifié média+reply).
    /// Spec : `docs/superpowers/specs/2026-05-20-ios-reply-no-bubble-around-media-design.md` §4.2
    enum Style: Equatable {
        case card
        case inline
    }

    var style: Style = .card
    let reply: ReplyReference
    let parentIsMe: Bool
    let accentHex: String
    let isDark: Bool
    let mentionDisplayNames: [String: String]

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.style == rhs.style &&
        lhs.parentIsMe == rhs.parentIsMe &&
        lhs.accentHex == rhs.accentHex &&
        lhs.isDark == rhs.isDark &&
        lhs.mentionDisplayNames == rhs.mentionDisplayNames &&
        Self.replySlice(lhs.reply) == Self.replySlice(rhs.reply)
    }

    /// Champs effectivement lus par le body. Tout changement dans le rendu
    /// doit synchroniser cette projection.
    private static func replySlice(_ reply: ReplyReference) -> ReplySlice {
        ReplySlice(
            messageId: reply.messageId,
            authorName: reply.authorName,
            authorColor: reply.authorColor,
            previewText: reply.previewText,
            isMe: reply.isMe,
            attachmentType: reply.attachmentType,
            attachmentThumbnailUrl: reply.attachmentThumbnailUrl,
            isStoryReply: reply.isStoryReply,
            storyPublishedAt: reply.storyPublishedAt,
            storyReactionCount: reply.storyReactionCount,
            storyCommentCount: reply.storyCommentCount,
            storyThumbnailUrl: reply.storyThumbnailUrl
        )
    }

    fileprivate struct ReplySlice: Equatable {
        let messageId: String
        let authorName: String
        let authorColor: String
        let previewText: String
        let isMe: Bool
        let attachmentType: String?
        let attachmentThumbnailUrl: String?
        let isStoryReply: Bool
        let storyPublishedAt: Date?
        let storyReactionCount: Int?
        let storyCommentCount: Int?
        let storyThumbnailUrl: String?
    }

    private var theme: ThemeManager { ThemeManager.shared }

    private var mentionTint: Color {
        Color(hex: "818CF8") // indigo400 — distinct des liens URL
    }

    var body: some View {
        let accentBarColor = Color(hex: reply.isMe ? accentHex : reply.authorColor)
        let nameColor: Color = parentIsMe
            ? .white.opacity(0.9)
            : Color(hex: reply.isMe ? accentHex : reply.authorColor)
        let previewColor: Color = parentIsMe
            ? .white.opacity(0.65)
            : theme.textMuted
        let bgColor: Color = parentIsMe
            ? Color.white.opacity(0.15)
            : (isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05))

        let contentBody = HStack(spacing: 0) {
            // Left accent bar
            RoundedRectangle(cornerRadius: 2)
                .fill(parentIsMe ? Color.white.opacity(0.7) : accentBarColor)
                .frame(width: 4)

            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(reply.isMe ? String(localized: "bubble.reply.you", defaultValue: "Vous", bundle: .main) : reply.authorName)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(nameColor)
                        .lineLimit(1)

                    if reply.isStoryReply {
                        BubbleStoryReplyPreview(reply: reply, previewColor: previewColor)
                    } else {
                        HStack(spacing: 5) {
                            let attachmentKind = BubbleQuotedReply.resolveAttachmentKind(reply.attachmentType)
                            if let kind = attachmentKind {
                                Image(systemName: kind.sfSymbolName)
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(previewColor)
                            }

                            // Empty preview text + attachment → use the kind's
                            // localized short label ("Photo", "Vidéo", ...)
                            // instead of the hardcoded "Media" fallback that
                            // surfaced before the AttachmentKind plumbing fix.
                            let fallback = attachmentKind?.shortLabel ?? String(localized: "bubble.reply.media", defaultValue: "Media", bundle: .main)
                            MessageTextRenderer.render(
                                reply.previewText.isEmpty ? fallback : reply.previewText,
                                fontSize: 12, color: previewColor,
                                mentionColor: mentionTint, accentColor: previewColor,
                                mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames
                            )
                            .lineLimit(2)
                            .tint(previewColor)
                        }
                    }
                }

                Spacer(minLength: 0)

                // Attachment thumbnail or story thumbnail
                if let thumbUrl = (reply.isStoryReply ? reply.storyThumbnailUrl : reply.attachmentThumbnailUrl), !thumbUrl.isEmpty {
                    CachedAsyncImage(url: thumbUrl, targetSize: CGSize(width: 38, height: 38)) {
                        Color(hex: reply.authorColor).opacity(0.3)
                    }
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 38, height: 38)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                }
            }
            .padding(.leading, 8)
            .padding(.trailing, 10)
        }
        .padding(.vertical, 8)
        .contentShape(Rectangle())

        switch style {
        case .card:
            contentBody
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(bgColor)
                )
                .padding(.horizontal, 6)
                .padding(.top, 6)
        case .inline:
            contentBody
        }
    }

    // MARK: - Attachment kind resolution

    /// Decodes `ReplyReference.attachmentType` to the canonical
    /// `AttachmentKind` (single source of truth — see
    /// `AttachmentKind.swift`).
    ///
    /// Two-step fallback for forward-compat with any cached payload that
    /// still carries the raw MIME (`"image/jpeg"`) instead of the short
    /// kind rawValue (`"image"`):
    ///   1. try `AttachmentKind(rawValue:)` — new payloads
    ///   2. fall back to `AttachmentKind(mimeType:)` — legacy / cached
    ///
    /// Returns `nil` only when the input is `nil`. Unknown values still
    /// resolve to `.other` (paperclip + "Fichier") so the UI never shows
    /// an unlabeled glyph.
    static func resolveAttachmentKind(_ type: String?) -> AttachmentKind? {
        guard let type, !type.isEmpty else { return nil }
        if let exact = AttachmentKind(rawValue: type) { return exact }
        return AttachmentKind(mimeType: type)
    }
}

// MARK: - Story reply preview

/// Was: ThemedMessageBubble.storyReplyPreview(_:previewColor:) (lines 1034-1086).
///
/// `previewColor` est derive du contexte parent (white.opacity(0.65) si
/// `parentIsMe`, sinon `theme.textMuted`) — il n'est pas reductible a un
/// hex de la couleur de contact, donc on garde `Color` directement.
/// SwiftUI.Color est Hashable depuis iOS 13+ (synthese Equatable OK).
struct BubbleStoryReplyPreview: View, Equatable {
    let reply: ReplyReference
    let previewColor: Color

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.previewColor == rhs.previewColor &&
        Self.previewSlice(lhs.reply) == Self.previewSlice(rhs.reply)
    }

    private static func previewSlice(_ reply: ReplyReference) -> PreviewSlice {
        PreviewSlice(
            storyPublishedAt: reply.storyPublishedAt,
            storyReactionCount: reply.storyReactionCount,
            storyCommentCount: reply.storyCommentCount
        )
    }

    fileprivate struct PreviewSlice: Equatable {
        let storyPublishedAt: Date?
        let storyReactionCount: Int?
        let storyCommentCount: Int?
    }

    @ViewBuilder
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "camera.fill")
                .font(.system(size: 9, weight: .medium))
                .foregroundColor(previewColor)
            Text(String(localized: "bubble.reply.story", defaultValue: "Story", bundle: .main))
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(previewColor)

            if let date = reply.storyPublishedAt {
                Text("\u{2022}")
                    .font(.system(size: 8))
                    .foregroundColor(previewColor.opacity(0.6))
                Text(date, style: .relative)
                    .font(.system(size: 10))
                    .foregroundColor(previewColor.opacity(0.8))
            }

            let reactions = reply.storyReactionCount ?? 0
            let comments = reply.storyCommentCount ?? 0
            if reactions > 0 || comments > 0 {
                Text("(")
                    .font(.system(size: 10))
                    .foregroundColor(previewColor.opacity(0.6))
                if reactions > 0 {
                    HStack(spacing: 2) {
                        Image(systemName: "heart.fill")
                            .font(.system(size: 8))
                        Text("\(reactions)")
                            .font(.system(size: 10, weight: .medium))
                    }
                    .foregroundColor(previewColor.opacity(0.8))
                }
                if reactions > 0 && comments > 0 {
                    Text("\u{2022}")
                        .font(.system(size: 6))
                        .foregroundColor(previewColor.opacity(0.5))
                }
                if comments > 0 {
                    HStack(spacing: 2) {
                        Image(systemName: "bubble.right.fill")
                            .font(.system(size: 8))
                        Text("\(comments)")
                            .font(.system(size: 10, weight: .medium))
                    }
                    .foregroundColor(previewColor.opacity(0.8))
                }
                Text(")")
                    .font(.system(size: 10))
                    .foregroundColor(previewColor.opacity(0.6))
            }
        }
    }
}
