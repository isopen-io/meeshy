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
                text: revisions.isEmpty ? "Aucune modification" : "Historique",
                detail: revisions.isEmpty ? "Ce message n'a pas ete modifie" : "\(revisions.count) version\(revisions.count > 1 ? "s" : "") precedente\(revisions.count > 1 ? "s" : "")",
                count: revisions.isEmpty ? nil : "\(revisions.count)",
                accent: accent
            )

            if revisions.isEmpty {
                emptyStateView(
                    icon: "pencil.slash",
                    text: "L'historique des modifications apparait ici",
                    accent: accent
                )
            } else {
                // Current (post-edit) version rendered first so the user
                // sees the "as-is" content as the anchor, then the
                // chronological revisions below it.
                editRevisionRow(
                    header: "Actuel",
                    content: message.content,
                    timestamp: message.editedAt ?? message.updatedAt,
                    accent: accent,
                    isCurrent: true
                )

                ForEach(Array(revisions.enumerated()), id: \.element.id) { index, revision in
                    editRevisionRow(
                        header: "Version \(revisions.count - index)",
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
    }

    // MARK: - Shared Components (copied from MessageDetailSheet)

    private func timelineBanner(icon: String, text: String, detail: String, count: String? = nil, accent: Color) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(accent)

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
    }

    private func emptyStateView(icon: String, text: String, accent: Color) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 28, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.4))
            Text(text)
                .font(.footnote.weight(.medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 30)
    }

    // MARK: - Formatting

    private func formatTimeFR(_ date: Date) -> String {
        date.formatted(.dateTime.hour().minute())
    }
}
