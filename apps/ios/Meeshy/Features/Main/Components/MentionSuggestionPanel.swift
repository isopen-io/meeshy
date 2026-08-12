import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - MentionSuggestionPanel

/// Reusable autocomplete panel rendered above any composer when
/// `MentionComposerController.activeQuery` is non-nil.
/// Callers pass the controller and an `onSelect` closure that receives
/// the updated text after insertion.
struct MentionSuggestionPanel: View {
    @ObservedObject var controller: MentionComposerController
    let accentColor: String
    let currentText: String
    let onSelect: (String) -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    /// Top-rounded surface: the panel is pinned to the top edge of the composer,
    /// so only the leading/trailing top corners are rounded — it reads as a card
    /// rising above the input rather than a detached pill.
    private var panelShape: UnevenRoundedRectangle {
        UnevenRoundedRectangle(
            topLeadingRadius: 16,
            bottomLeadingRadius: 0,
            bottomTrailingRadius: 0,
            topTrailingRadius: 16,
            style: .continuous
        )
    }

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 0) {
                if controller.suggestions.isEmpty {
                    mentionSkeletonRows
                } else {
                    ForEach(controller.suggestions) { candidate in
                        Button {
                            let updated = controller.insertMention(candidate, into: currentText)
                            onSelect(updated)
                        } label: {
                            HStack(spacing: 10) {
                                MeeshyAvatar(
                                    name: candidate.displayName,
                                    context: .userListItem,
                                    accentColor: accentColor,
                                    avatarURL: candidate.avatarURL
                                )
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(candidate.displayName)
                                        .font(MeeshyFont.relative(14, weight: .semibold))
                                        .foregroundColor(theme.textPrimary)
                                    Text("@\(candidate.username)")
                                        .font(MeeshyFont.relative(12))
                                        .foregroundColor(theme.textSecondary)
                                }
                                Spacer()
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                            .frame(minHeight: 44)
                        }
                        .accessibilityLabel("\(String(localized: "composer.mention.label", defaultValue: "Mention", bundle: .main)) \(candidate.displayName)")

                        if candidate.id != controller.suggestions.last?.id {
                            Divider()
                                .padding(.leading, 58)
                        }
                    }
                }
            }
        }
        .frame(maxHeight: 200)
        // Neutral Liquid Glass (no accent tint): an autocomplete bar floating
        // above the composer is input-assistance chrome (like the QuickType
        // bar), not conversation content — an accent tint would read as content.
        // Accent tint stays reserved for message-content surfaces (e.g. the
        // long-press MessageActionsMenu).
        .adaptiveGlass(in: Rectangle())
    }

    /// Three shimmering placeholder rows shown while waiting for API results.
    /// Decorative — hidden from VoiceOver so the rotor never stops on empty
    /// shimmer shapes while results stream in.
    private var mentionSkeletonRows: some View {
        VStack(spacing: 0) {
            ForEach(0..<3, id: \.self) { _ in
                HStack(spacing: 10) {
                    Circle()
                        .fill(theme.inputBackground)
                        .frame(width: 36, height: 36)
                        .shimmer()
                    VStack(alignment: .leading, spacing: 4) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(theme.inputBackground)
                            .frame(width: 100, height: 12)
                            .shimmer()
                        RoundedRectangle(cornerRadius: 4)
                            .fill(theme.inputBackground)
                            .frame(width: 70, height: 10)
                            .shimmer()
                    }
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .frame(minHeight: 44)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "composer.mention.loading", defaultValue: "Loading mentions", bundle: .main))
    }
}
