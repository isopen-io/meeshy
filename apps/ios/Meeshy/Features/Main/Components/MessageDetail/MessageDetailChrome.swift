import SwiftUI
import MeeshySDK
import MeeshyUI

/// Chrome partagé par les vues de détail de message (éditions, accusés de
/// réception) — extrait de la duplication entre `MessageEditsDetailView` et
/// `MessageViewsDetailView` (« copied from MessageDetailSheet », disaient les
/// deux MARK d'origine). Comportement inchangé : corps EXACT des fonctions
/// d'origine (celles de `MessageEditsDetailView`, la variante la plus
/// accessible des deux copies).
struct MessageDetailTimelineBanner: View {
    let icon: String
    let text: String
    let detail: String
    var count: String? = nil
    let accent: Color

    @Environment(\.colorScheme) private var colorScheme
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(accent)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 1) {
                Text(text)
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                Text(detail)
                    .font(.caption2)
                    .foregroundColor(theme.textMuted)
            }

            Spacer()

            if let count {
                Text(count)
                    .font(.system(.caption, design: .monospaced).weight(.bold))
                    .foregroundColor(accent)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(
                        Capsule()
                            .fill(accent.opacity(0.12))
                    )
                    // Numeric badge duplicates the count already spelled out in
                    // `detail` ("3 versions précédentes") — hidden from VoiceOver.
                    .accessibilityHidden(true)
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(accent.opacity(colorScheme == .dark ? 0.06 : 0.04))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(accent.opacity(0.12), lineWidth: 0.5)
                )
        )
        // Header banner reads as one stop: title + detail sentence.
        .accessibilityElement(children: .combine)
    }
}

struct MessageDetailEmptyState: View {
    let icon: String
    let text: String

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(spacing: 8) {
            // Decorative empty-state glyph — kept at a fixed 28pt (illustration,
            // not text) and hidden from VoiceOver via the `.combine` parent.
            Image(systemName: icon)
                .font(.system(size: 28, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.4))
                .accessibilityHidden(true)
            Text(text)
                .font(.footnote.weight(.medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 30)
        .accessibilityElement(children: .combine)
    }
}

enum MessageDetailClock {
    static func hourMinute(_ date: Date) -> String {
        date.formatted(.dateTime.hour().minute())
    }
}
