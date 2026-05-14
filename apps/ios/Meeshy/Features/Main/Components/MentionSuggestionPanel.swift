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
                        .padding(.vertical, 8)
                    }
                    .accessibilityLabel("Mentionner \(candidate.displayName)")

                    if candidate.id != controller.suggestions.last?.id {
                        Divider()
                            .padding(.leading, 58)
                    }
                }
            }
        }
        .frame(maxHeight: 200)
        .background(.ultraThinMaterial)
    }
}
