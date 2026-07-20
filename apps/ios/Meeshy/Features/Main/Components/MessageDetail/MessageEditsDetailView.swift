import SwiftUI
import MeeshySDK
import MeeshyUI

/// Historique d'edition d'un message — extrait de l'ancien
/// `MessageDetailSheet.editsTabContent`. Les revisions sont injectees via
/// `editRevisions` (aucun etat reseau). Aucun changement de comportement.
struct MessageEditsDetailView: View {
    let message: Message
    var editRevisions: [EditRevision] = []

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    @ViewBuilder
    var body: some View {
        let accent = Color(hex: message.senderColor ?? "#6366F1")
        let revisions = editRevisions.sorted { $0.editedAt > $1.editedAt }

        VStack(alignment: .leading, spacing: 14) {
            timelineBanner(
                icon: "pencil.and.list.clipboard",
                text: revisions.isEmpty
                    ? String(localized: "message-detail.edits.none-title", defaultValue: "Aucune modification", bundle: .main)
                    : String(localized: "message-detail.edits.history-title", defaultValue: "Historique", bundle: .main),
                detail: revisions.isEmpty
                    ? String(localized: "message-detail.edits.none-detail", defaultValue: "Ce message n'a pas été modifié", bundle: .main)
                    : previousVersionsDetail(revisions.count),
                count: revisions.isEmpty ? nil : "\(revisions.count)",
                accent: accent
            )

            if revisions.isEmpty {
                emptyStateView(
                    icon: "pencil.slash",
                    text: String(localized: "message-detail.edits.empty", defaultValue: "L'historique des modifications apparaît ici", bundle: .main),
                    accent: accent
                )
            } else {
                // Current (post-edit) version rendered first so the user
                // sees the "as-is" content as the anchor, then the
                // chronological revisions below it.
                editRevisionRow(
                    header: String(localized: "message-detail.edits.current", defaultValue: "Actuel", bundle: .main),
                    content: message.content,
                    timestamp: message.editedAt ?? message.updatedAt,
                    accent: accent,
                    isCurrent: true
                )

                ForEach(Array(revisions.enumerated()), id: \.element.id) { index, revision in
                    editRevisionRow(
                        header: String(format: String(localized: "message-detail.edits.version-n", defaultValue: "Version %d", bundle: .main), revisions.count - index),
                        content: revision.content,
                        timestamp: revision.editedAt,
                        accent: accent,
                        isCurrent: false
                    )
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Rows

    private func editRevisionRow(header: String, content: String, timestamp: Date, accent: Color, isCurrent: Bool) -> some View {
        HStack(alignment: .top, spacing: 10) {
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(isCurrent ? accent : accent.opacity(0.4))
                .frame(width: 3)
                .padding(.vertical, 2)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(header)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(isCurrent ? accent : theme.textSecondary)
                        .textCase(.uppercase)
                        .tracking(0.4)
                    Spacer(minLength: 4)
                    Text(formatTimeFR(timestamp))
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(theme.textMuted)
                }
                Text(content)
                    .font(.subheadline)
                    .foregroundStyle(theme.textPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.03))
        )
        // Single VoiceOver stop per revision: "Actuel, 14:30, <contenu>".
        // The colored rail is decorative (state is carried by the header text,
        // never by color alone).
        .accessibilityElement(children: .combine)
    }

    // MARK: - Shared Components (copied from MessageDetailSheet)

    private func timelineBanner(icon: String, text: String, detail: String, count: String? = nil, accent: Color) -> some View {
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
                .fill(accent.opacity(isDark ? 0.06 : 0.04))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(accent.opacity(0.12), lineWidth: 0.5)
                )
        )
        // Header banner reads as one stop: title + detail sentence.
        .accessibilityElement(children: .combine)
    }

    private func emptyStateView(icon: String, text: String, accent: Color) -> some View {
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

    // MARK: - Formatting

    private func previousVersionsDetail(_ count: Int) -> String {
        let format = count == 1
            ? String(localized: "message-detail.edits.previous-one", defaultValue: "%d version précédente", bundle: .main)
            : String(localized: "message-detail.edits.previous-other", defaultValue: "%d versions précédentes", bundle: .main)
        return String(format: format, count)
    }

    private func formatTimeFR(_ date: Date) -> String {
        date.formatted(.dateTime.hour().minute())
    }
}
