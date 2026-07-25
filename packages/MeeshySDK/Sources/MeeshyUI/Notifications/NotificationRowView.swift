import SwiftUI
import Combine
import MeeshySDK

public struct NotificationRowView: View {
    public let notification: APINotification
    public var onTap: (() -> Void)?
    public var onMarkRead: (() -> Void)?
    public var onDelete: (() -> Void)?

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme

    public init(
        notification: APINotification,
        onTap: (() -> Void)? = nil,
        onMarkRead: (() -> Void)? = nil,
        onDelete: (() -> Void)? = nil
    ) {
        self.notification = notification
        self.onTap = onTap
        self.onMarkRead = onMarkRead
        self.onDelete = onDelete
    }

    private var notifType: MeeshyNotificationType { notification.notificationType }
    private var accentColor: Color { Color(hex: notifType.accentHex) }

    public var body: some View {
        Button { onTap?() } label: {
            HStack(alignment: .top, spacing: 12) {
                iconView
                contentView
                Spacer(minLength: 4)
                if let thumb = notification.postThumbnailURLString {
                    postThumbnail(thumb)
                }
                timestampView
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(notification.isRead ? Color.clear : accentColor.opacity(0.05))
        }
        .buttonStyle(.plain)
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            if let onDelete {
                Button(role: .destructive) { onDelete() } label: {
                    Label("Supprimer", systemImage: "trash")
                }
            }
        }
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            if !notification.isRead, let onMarkRead {
                Button { onMarkRead() } label: {
                    Label("Lu", systemImage: "envelope.open")
                }
                .tint(Color(hex: "4338CA"))
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityDescription)
    }

    // MARK: - Icon

    private var iconView: some View {
        ZStack(alignment: .topTrailing) {
            MeeshyAvatar(
                name: notification.senderName ?? notifType.rawValue,
                context: .notification,
                accentColor: notifType.accentHex,
                avatarURL: notification.senderAvatar
            )

            if !notification.isRead {
                Circle()
                    .fill(accentColor)
                    .frame(width: 9, height: 9)
                    .offset(x: 2, y: -2)
            }
        }
    }

    // MARK: - Content

    private var contentView: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(notification.formattedTitle)
                .font(MeeshyFont.relative(14, weight: notification.isRead ? .medium : .semibold))
                .foregroundColor(theme.textPrimary)
                .lineLimit(2)

            if let body = notification.formattedBody, !body.isEmpty {
                Text(body)
                    .font(MeeshyFont.relative(13))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(2)
            }

            // Social entity context + lifecycle (« Story · « aperçu » · expirée »,
            // « En réponse à « … » »). Surfaces WHICH content the notification
            // concerns and why it may no longer be accessible (expired story).
            if let context = notification.formattedContext, !context.isEmpty {
                Label {
                    Text(context).lineLimit(1)
                } icon: {
                    if notification.isLinkedContentExpired {
                        Image(systemName: "clock.badge.xmark")
                    }
                }
                .font(MeeshyFont.relative(11))
                .foregroundColor(notification.isLinkedContentExpired ? MeeshyColors.error : theme.textMuted)
                .padding(.top, 1)
            }

            if let conversationTitle = notification.context?.conversationTitle,
               notification.context?.conversationType != "direct" {
                Label(conversationTitle, systemImage: "bubble.left.and.bubble.right")
                    .font(MeeshyFont.relative(11))
                    .foregroundColor(theme.textMuted)
                    .lineLimit(1)
                    .padding(.top, 1)
            }
        }
    }

    // MARK: - Post thumbnail

    /// Vignette du contenu social lié (post/story/réel) — donne le contexte
    /// visuel de CE qui a été commenté / réagi, sans ouvrir l'app. 44×44,
    /// coins arrondis, alignée sur l'avatar en tête de ligne.
    private func postThumbnail(_ urlString: String) -> some View {
        // showsStatusOverlays: false — echec silencieux vers le fond teinte
        // deja fourni ; pas de bouton retry sur une vignette 44pt.
        CachedAsyncImage(url: urlString, targetSize: CGSize(width: 44, height: 44), showsStatusOverlays: false) {
            RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                .fill(accentColor.opacity(0.12))
        }
        .frame(width: 44, height: 44)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))
        .overlay(
            RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                .stroke(theme.textMuted.opacity(0.15), lineWidth: 0.5)
        )
        .accessibilityHidden(true)
    }

    // MARK: - Timestamp

    private var timestampView: some View {
        Text(relativeTime)
            .font(MeeshyFont.relative(11, weight: .medium))
            .foregroundColor(theme.textMuted)
    }

    // MARK: - Computed

    /// Parse an ISO-8601 timestamp, accepting either fractional or whole-second
    /// `withInternetDateTime`.
    static func parseISODate(_ string: String) -> Date? {
        if let date = try? Date(string, strategy: .iso8601) {
            return date
        }
        return try? Date(string, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true))
    }

    private var relativeTime: String {
        Self.parseISODate(notification.createdAt)
            .map { RelativeTimeFormatter.shortString(for: $0) } ?? ""
    }

    private var accessibilityDescription: String {
        let readState = notification.isRead ? "" : "Non lu. "
        let body = notification.formattedBody.map { ". \($0)" } ?? ""
        return "\(readState)\(notification.formattedTitle)\(body). \(relativeTime)"
    }
}
