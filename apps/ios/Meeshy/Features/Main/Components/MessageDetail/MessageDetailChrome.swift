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
        HStack(spacing: MeeshySpacing.smPlus) {
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
                    .padding(.horizontal, MeeshySpacing.sm)
                    .padding(.vertical, MeeshySpacing.xxs)
                    .background(
                        Capsule()
                            .fill(accent.opacity(MeeshyOpacity.light))
                    )
                    // Numeric badge duplicates the count already spelled out in
                    // `detail` ("3 versions précédentes") — hidden from VoiceOver.
                    .accessibilityHidden(true)
            }
        }
        .padding(MeeshySpacing.md)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                .fill(accent.opacity(colorScheme == .dark ? 0.06 : 0.04))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                        .stroke(accent.opacity(MeeshyOpacity.light), lineWidth: MeeshyBorder.hairline)
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
        VStack(spacing: MeeshySpacing.sm) {
            // Decorative empty-state glyph — kept at a fixed 28pt (illustration,
            // not text) and hidden from VoiceOver via the `.combine` parent.
            Image(systemName: icon)
                .font(.system(size: MeeshyIconSize.xxxl, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.4))
                .accessibilityHidden(true)
            Text(text)
                .font(.footnote.weight(.medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, MeeshySpacing.xxxl)
        .accessibilityElement(children: .combine)
    }
}

enum MessageDetailClock {
    static func hourMinute(_ date: Date) -> String {
        date.formatted(.dateTime.hour().minute())
    }
}
