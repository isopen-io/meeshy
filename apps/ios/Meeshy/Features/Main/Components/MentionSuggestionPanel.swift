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
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundColor(theme.textPrimary)
                                    Text("@\(candidate.username)")
                                        .font(.system(size: 12))
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
        .background(.ultraThinMaterial)
    }

    /// Three shimmering placeholder rows shown while waiting for API results.
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
    }
}
