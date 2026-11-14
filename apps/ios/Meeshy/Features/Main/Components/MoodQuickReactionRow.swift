import SwiftUI
import MeeshyUI

/// La rangée d'emojis rapides qui réagit à l'humeur d'un autre (#18110), montée
/// par la bulle d'humeur et par la page plein écran. Un emoji déjà posé se lit
/// sélectionné et ne repart pas.
struct MoodQuickReactionRow: View {
    let placed: Set<String>
    let tint: Color
    let onReact: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(MoodReactionSelection.emojis, id: \.self) { emoji in
                    emojiButton(emoji)
                }
            }
        }
    }

    private func emojiButton(_ emoji: String) -> some View {
        let isPlaced = placed.contains(emoji)
        return Button {
            guard !isPlaced else { return }
            HapticFeedback.light()
            onReact(emoji)
        } label: {
            Text(verbatim: emoji)
                .font(MeeshyFont.emoji(22))
                .frame(width: 44, height: 44)
                .background(Circle().fill(tint.opacity(isPlaced ? 0.28 : 0)))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Self.accessibilityLabel(for: emoji))
        .accessibilityAddTraits(isPlaced ? .isSelected : [])
        .accessibilityIdentifier("mood.react.\(emoji)")
    }

    static func accessibilityLabel(for emoji: String) -> String {
        String(localized: "mood.react.with", defaultValue: "Réagir avec \(emoji)", bundle: .main)
    }
}
