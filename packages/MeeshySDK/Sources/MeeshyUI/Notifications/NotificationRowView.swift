import SwiftUI
import Combine
import MeeshySDK

public struct NotificationRowView: View, Equatable {
    public let notification: APINotification
    public var onTap: (() -> Void)?
    public var onMarkRead: (() -> Void)?
    public var onDelete: (() -> Void)?
    /// Les gestes de la rangée (`APINotification.quickActions`) — exécutés par
    /// l'hôte. `nil` : la rangée n'en propose aucun.
    public var onQuickAction: ((NotificationQuickAction) -> Void)?
    /// « Se connecter » déjà envoyé depuis cette rangée : le bouton le dit.
    public var isConnectRequested: Bool
    /// L'acteur est déjà un ami : « Se connecter » ne se propose pas (#8724).
    public var isFriend: Bool

    /// Les closures capturent la notification par valeur : à contenu égal
    /// (`APINotification` Equatable synthétisé), leur comportement est
    /// identique — la comparaison porte donc sur la donnée + la présence
    /// des callbacks, jamais sur leur identité.
    public static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.notification == rhs.notification &&
        (lhs.onTap == nil) == (rhs.onTap == nil) &&
        (lhs.onMarkRead == nil) == (rhs.onMarkRead == nil) &&
        (lhs.onDelete == nil) == (rhs.onDelete == nil) &&
        (lhs.onQuickAction == nil) == (rhs.onQuickAction == nil) &&
        lhs.isConnectRequested == rhs.isConnectRequested &&
        lhs.isFriend == rhs.isFriend
    }

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme

    /// STOCKÉE à la construction (#8724) : la règle de la ligne
    /// (`APINotification.rowPresentation`) ne se rejoue pas à chaque rendu.
    private let presentation: NotificationRowPresentation

    public init(
        notification: APINotification,
        onTap: (() -> Void)? = nil,
        onMarkRead: (() -> Void)? = nil,
        onDelete: (() -> Void)? = nil,
        onQuickAction: ((NotificationQuickAction) -> Void)? = nil,
        isConnectRequested: Bool = false,
        isFriend: Bool = false,
        copy: @escaping NotificationCopyLookup = NotificationCopy.appCatalog
    ) {
        self.notification = notification
        self.onTap = onTap
        self.onMarkRead = onMarkRead
        self.onDelete = onDelete
        self.onQuickAction = onQuickAction
        self.isConnectRequested = isConnectRequested
        self.isFriend = isFriend
        self.presentation = notification.rowPresentation(copy: copy)
    }

    private var notifType: MeeshyNotificationType { notification.notificationType }
    private var accentColor: Color { Color(hex: notifType.accentHex) }
    private var isDark: Bool { colorScheme == .dark }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            rowButton
            quickActionsRow
        }
        .background(notification.isRead ? Color.clear : accentColor.opacity(isDark ? 0.07 : 0.05))
    }

    private var rowButton: some View {
        Button { onTap?() } label: {
            HStack(alignment: .top, spacing: MeeshySpacing.md) {
                leadingView
                contentView
                Spacer(minLength: 4)
                if let thumb = notification.postThumbnailURLString {
                    postThumbnail(thumb)
                }
                timestampView
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.md)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        // Pas de `.swipeActions` ici : ce modifier n'a d'effet que dans une
        // `List`, or la rangée vit dans la `LazyVStack` de
        // `NotificationListView` — les actions étaient du code mort évalué à
        // chaque render. `onMarkRead`/`onDelete` restent dans l'API pour un
        // futur hôte `List`.
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityDescription)
    }

    // MARK: - Gestes de la rangée (#8105, #8724)

    /// Hors du bouton de la rangée : un bouton dans un bouton ne reçoit pas
    /// ses touches. Aligné sur le texte, sous l'avatar.
    @ViewBuilder
    private var quickActionsRow: some View {
        let actions = notification.quickActions(isFriend: isFriend)
        if let onQuickAction, !actions.isEmpty {
            HStack(spacing: MeeshySpacing.sm) {
                ForEach(actions, id: \.self) { action in
                    quickActionButton(action, perform: onQuickAction)
                }
            }
            .padding(.leading, 16 + 44 + 12)
            .padding(.trailing, MeeshySpacing.lg)
            .padding(.bottom, MeeshySpacing.md)
        }
    }

    private func quickActionButton(_ action: NotificationQuickAction,
                                   perform: @escaping (NotificationQuickAction) -> Void) -> some View {
        let label: String
        let icon: String
        let isPrimary: Bool
        switch action {
        case .connect:
            label = isConnectRequested
                ? String(localized: "notifications.quick.connect.sent", defaultValue: "Demande envoyée", bundle: .module)
                : String(localized: "notifications.quick.connect", defaultValue: "Se connecter", bundle: .module)
            icon = isConnectRequested ? "checkmark" : "person.badge.plus"
            isPrimary = !isConnectRequested
        case .write:
            label = String(localized: "notifications.quick.write", defaultValue: "Écrire", bundle: .module)
            icon = "bubble.left.fill"
            isPrimary = false
        }
        return Button {
            if case .connect = action, isConnectRequested { return }
            perform(action)
        } label: {
            Label(label, systemImage: icon)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                .foregroundColor(isPrimary ? .white : (isDark ? MeeshyColors.indigo300 : MeeshyColors.indigo600))
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .frame(minHeight: 44)
                .background(Capsule().fill(isPrimary ? MeeshyColors.indigo600 : MeeshyColors.indigo500.opacity(MeeshyOpacity.light)))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(quickActionIdentifier(action))
    }

    private func quickActionIdentifier(_ action: NotificationQuickAction) -> String {
        switch action {
        case .connect: return "notification.quick.connect.\(notification.id)"
        case .write: return "notification.quick.write.\(notification.id)"
        }
    }

    // MARK: - Leading

    @ViewBuilder
    private var leadingView: some View {
        ZStack(alignment: .topTrailing) {
            switch presentation.leading {
            case .avatar:
                MeeshyAvatar(
                    name: notification.senderName ?? notifType.rawValue,
                    context: .notification,
                    accentColor: notifType.accentHex,
                    avatarURL: notification.senderAvatar
                )
            case .milestone(let symbol):
                milestoneMedallion(symbol)
            }

            if !notification.isRead {
                Circle()
                    .fill(accentColor)
                    .frame(width: 9, height: 9)
                    .offset(x: 2, y: -2)
            }
        }
    }

    /// Le médaillon d'un palier : l'icône du badge sur un disque en relief,
    /// teinté de l'accent du type — la ligne dit QUEL badge avant de le lire.
    private func milestoneMedallion(_ symbol: String) -> some View {
        Circle()
            .fill(
                LinearGradient(
                    colors: [accentColor.opacity(isDark ? 0.55 : 0.30), accentColor.opacity(isDark ? 0.22 : 0.12)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(Circle().strokeBorder(accentColor.opacity(MeeshyOpacity.strong), lineWidth: 1))
            .overlay(
                Image(systemName: symbol)
                    .font(.system(size: MeeshyIconSize.lg, weight: .semibold))
                    .foregroundColor(isDark ? .white : accentColor)
            )
            .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
            .shadow(color: accentColor.opacity(MeeshyOpacity.medium), radius: 6, y: 3)
            .accessibilityHidden(true)
    }

    // MARK: - Content

    private var contentView: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
            Text(presentation.title)
                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: notification.isRead ? .medium : .semibold))
                .foregroundColor(theme.textPrimary)
                .lineLimit(2)

            if let body = presentation.body {
                Text(body)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(2)
            }

            if let quote = presentation.quote {
                Text(quote)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize))
                    .italic()
                    .foregroundColor(theme.textMuted)
                    .lineLimit(1)
            }

            if let footer = presentation.footer {
                footerView(footer)
                    .padding(.top, MeeshySpacing.xxs)
            }
        }
    }

    /// Le pied de ligne : OÙ ça s'est passé — le groupe d'un message, le post
    /// d'une réaction ou d'un commentaire. Même gabarit pour tous : icône +
    /// une ligne de texte discret.
    @ViewBuilder
    private func footerView(_ footer: NotificationRowPresentation.Footer) -> some View {
        switch footer {
        case .conversation(let title):
            footerLabel(title, symbol: "bubble.left.and.bubble.right", tint: theme.textMuted)
        case .content(let symbol, let text, let isExpired):
            footerLabel(text,
                        symbol: isExpired ? "clock.badge.xmark" : symbol,
                        tint: isExpired ? MeeshyColors.error : theme.textMuted)
        case .plain(let text):
            Text(text)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                .foregroundColor(theme.textMuted)
                .lineLimit(1)
        }
    }

    private func footerLabel(_ text: String, symbol: String, tint: Color) -> some View {
        HStack(spacing: MeeshySpacing.xs) {
            Image(systemName: symbol)
                .font(MeeshyFont.relative(11, weight: .semibold))
                .accessibilityHidden(true)
            Text(text)
                .lineLimit(1)
        }
        .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
        .foregroundColor(tint)
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
                .fill(accentColor.opacity(MeeshyOpacity.light))
        }
        .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))
        .overlay(
            RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                .stroke(theme.textMuted.opacity(MeeshyOpacity.light), lineWidth: MeeshyBorder.hairline)
        )
        .accessibilityHidden(true)
    }

    // MARK: - Timestamp

    private var timestampView: some View {
        Text(relativeTime)
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
            .foregroundColor(theme.textMuted)
    }

    // MARK: - Computed

    /// Une date du fil, avec ou sans fractions de seconde (`WireDate`, #6611).
    static func parseISODate(_ string: String) -> Date? {
        WireDate.date(from: string)
    }

    private var relativeTime: String {
        Self.parseISODate(notification.createdAt)
            .map { RelativeTimeFormatter.shortString(for: $0) } ?? ""
    }

    /// Ce que VoiceOver lit : les mêmes textes que l'œil, dans le même ordre,
    /// sans répétition — la règle qui les a dédoublonnés vaut pour l'oreille.
    private var accessibilityDescription: String {
        let readState = notification.isRead ? "" : "Non lu. "
        let footerText: String? = {
            switch presentation.footer {
            case .conversation(let title): return title
            case .content(_, let text, _): return text
            case .plain(let text): return text
            case nil: return nil
            }
        }()
        let parts = [presentation.title, presentation.body, presentation.quote, footerText, relativeTime]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
        return readState + parts.joined(separator: ". ")
    }
}
