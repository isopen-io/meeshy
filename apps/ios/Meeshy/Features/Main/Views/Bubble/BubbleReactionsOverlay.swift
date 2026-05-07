import SwiftUI
import MeeshySDK
import MeeshyUI

/// Bande de reactions affichee sous la bulle. Stateless cote rendu — les
/// callbacks ne participent PAS a Equatable (cf. BubbleCallbacks).
///
/// Was: ThemedMessageBubble.reactionsOverlay + helpers
/// (`addReactionButton`, `overflowPill`, `reactionPill`,
/// `reactionPillAccessibilityLabel`) — anciennes lignes 1183-1325.
///
/// `MeeshyReactionSummary` n'est pas Equatable cote SDK, donc on projette
/// chaque resume en tuple (emoji, count, includesMe) pour comparer manuellement.
struct BubbleReactionsOverlay: View, Equatable {
    static let maxVisible = 4

    let messageId: String
    let summaries: [ReactionSummary]
    let isMe: Bool
    let isDark: Bool
    let isLastReceivedMessage: Bool
    let accentHex: String

    /// Excluded from Equatable: les callbacks ne changent pas le rendu.
    /// Le `String` passe a `onToggleReaction` est l'emoji (pas le messageId).
    var onAddReaction: ((String) -> Void)? = nil
    var onToggleReaction: ((String) -> Void)? = nil
    var onOpenReactPicker: ((String) -> Void)? = nil
    var onShowReactions: ((String) -> Void)? = nil

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.messageId == rhs.messageId &&
        lhs.isMe == rhs.isMe &&
        lhs.isDark == rhs.isDark &&
        lhs.isLastReceivedMessage == rhs.isLastReceivedMessage &&
        lhs.accentHex == rhs.accentHex &&
        lhs.summaries.map(Self.summarySlice) == rhs.summaries.map(Self.summarySlice)
    }

    private static func summarySlice(_ summary: ReactionSummary) -> SummarySlice {
        SummarySlice(emoji: summary.emoji, count: summary.count, includesMe: summary.includesMe)
    }

    private struct SummarySlice: Equatable {
        let emoji: String
        let count: Int
        let includesMe: Bool
    }

    @ViewBuilder
    var body: some View {
        let accent = Color(hex: accentHex)
        let visible = Array(summaries.prefix(Self.maxVisible))
        let overflowCount = summaries.count - visible.count
        let hasReactions = !summaries.isEmpty

        if isMe {
            if hasReactions {
                HStack(spacing: 3) {
                    ForEach(visible, id: \.emoji) { reaction in
                        pill(reaction: reaction, accent: accent)
                    }
                    if overflowCount > 0 {
                        overflowPill(count: overflowCount, accent: accent)
                    }
                }
            }
        } else {
            HStack(spacing: 3) {
                if overflowCount > 0 {
                    overflowPill(count: overflowCount, accent: accent)
                } else if isLastReceivedMessage {
                    addButton(accent: accent)
                }

                ForEach(visible, id: \.emoji) { reaction in
                    pill(reaction: reaction, accent: accent)
                }
            }
        }
    }

    // MARK: - Add reaction button (was: addReactionButton)

    private func addButton(accent: Color) -> some View {
        Image(systemName: "face.smiling")
            .font(.system(size: 10, weight: .medium))
            .foregroundColor(isDark ? accent.opacity(0.6) : accent.opacity(0.5))
            .frame(width: 22, height: 22)
            .background(
                Circle()
                    .fill(isDark ? accent.opacity(0.1) : accent.opacity(0.06))
                    .overlay(
                        Circle()
                            .stroke(accent.opacity(isDark ? 0.2 : 0.12), lineWidth: 0.5)
                    )
                    .shadow(color: accent.opacity(0.1), radius: 3, y: 1)
            )
            .contentShape(Circle())
            .onTapGesture {
                HapticFeedback.light()
                onAddReaction?(messageId)
            }
            .onLongPressGesture(minimumDuration: 0.4) {
                HapticFeedback.medium()
                onOpenReactPicker?(messageId)
            }
            .accessibilityLabel("Ajouter une reaction")
            .accessibilityHint("Appuyer pour reagir rapidement, maintenir pour choisir un emoji")
    }

    // MARK: - Overflow pill (was: overflowPill)

    private func overflowPill(count: Int, accent: Color) -> some View {
        Button {
            HapticFeedback.light()
            onShowReactions?(messageId)
        } label: {
            Text("+\(count)")
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundColor(accent)
        }
        .frame(height: 22)
        .padding(.horizontal, 6)
        .background(
            Capsule()
                .fill(isDark ? accent.opacity(0.12) : accent.opacity(0.08))
                .overlay(
                    Capsule()
                        .stroke(accent.opacity(isDark ? 0.25 : 0.15), lineWidth: 0.5)
                )
        )
        .accessibilityLabel("\(count) reactions supplementaires")
        .accessibilityHint("Voir toutes les reactions")
    }

    // MARK: - Reaction pill (was: reactionPill)

    private func pill(reaction: ReactionSummary, accent: Color) -> some View {
        let pillContent = HStack(spacing: 2) {
            Text(reaction.emoji)
                .font(.system(size: 11))
            if reaction.count > 1 {
                Text("\(reaction.count)")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(
                        reaction.includesMe
                            ? (isDark ? .white : .white)
                            : (isDark ? .white.opacity(0.7) : accent)
                    )
            }
        }
        .padding(.horizontal, reaction.count > 1 ? 6 : 5)
        .frame(height: 22)

        let fillColor: Color = reaction.includesMe
            ? (isDark ? accent.opacity(0.5) : accent.opacity(0.35))
            : (isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))

        let strokeColor: Color = reaction.includesMe
            ? accent.opacity(isDark ? 0.8 : 0.6)
            : accent.opacity(isDark ? 0.15 : 0.1)

        let strokeWidth: CGFloat = reaction.includesMe ? 1.5 : 0.5

        let shadowColor: Color = reaction.includesMe ? accent.opacity(0.3) : .clear

        return pillContent
            .background(
                Capsule()
                    .fill(fillColor)
                    .overlay(
                        Capsule()
                            .stroke(strokeColor, lineWidth: strokeWidth)
                    )
                    .shadow(color: shadowColor, radius: 4, y: 2)
            )
            .onTapGesture {
                HapticFeedback.light()
                onToggleReaction?(reaction.emoji)
            }
            .onLongPressGesture(minimumDuration: 0.4) {
                HapticFeedback.medium()
                onShowReactions?(messageId)
            }
            .accessibilityLabel(Self.pillAccessibilityLabel(reaction))
            .accessibilityHint("Appuyer pour basculer la reaction")
    }

    // MARK: - Accessibility helper (was: reactionPillAccessibilityLabel)

    private static func pillAccessibilityLabel(_ reaction: ReactionSummary) -> String {
        let countLabel = reaction.count == 1 ? "reaction" : "reactions"
        let meLabel = reaction.includesMe ? ", vous avez reagi" : ""
        return "\(reaction.emoji) \(reaction.count) \(countLabel)\(meLabel)"
    }
}
