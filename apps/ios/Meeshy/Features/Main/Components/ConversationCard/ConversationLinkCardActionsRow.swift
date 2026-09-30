import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les boutons de la carte, choisis par la règle pure du SDK
/// (`ConversationCardActions`) :
/// - non-membre ⇒ **Rejoindre ?** puis **Anonyme** (quand le lien l'autorise)
///   | le **compte connecté**, nommé (#8726) ;
/// - membre ⇒ **Quitter** EN PREMIER, puis **Ouvrir** ;
/// - lien expiré ⇒ la mention « Lien expiré », aucun bouton.
struct ConversationLinkCardActionsRow: View {
    let actions: ConversationCardActions
    let isExpired: Bool
    let pending: ConversationLinkCardViewModel.Pending
    let errorMessage: String?
    let accentHex: String
    let isDark: Bool
    var joinAccount: ConversationCardJoinAccount? = nil
    let onJoin: () -> Void
    let onJoinAnonymously: () -> Void
    let onLeave: () -> Void
    let onOpen: () -> Void

    private var accent: Color { Color(hex: accentHex) }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
            buttons
            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                    .foregroundColor(MeeshyColors.error)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("conversation-link-card-error")
            }
        }
    }

    @ViewBuilder
    private var buttons: some View {
        if isExpired {
            Label(ConversationLinkCardCopy.expiredTitle, systemImage: "clock.badge.xmark")
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                .foregroundColor(isDark ? MeeshyColors.indigo300 : MeeshyColors.neutral500)
                .frame(maxWidth: .infinity, minHeight: 44)
                .accessibilityIdentifier("conversation-link-card-expired")
        } else {
            switch actions {
            case .none:
                EmptyView()
            case .join(_, let allowsAnonymous):
                // « Rejoindre ? » puis « Anonyme » | le compte, dans le gabarit
                // arrondi de Quitter | Ouvrir (#8726, correction porteur
                // 2026-09-29) : côte à côte quand ils tiennent, empilés sinon.
                VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
                    joinPrompt
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: MeeshySpacing.sm) { joinChoices(allowsAnonymous: allowsAnonymous) }
                        VStack(spacing: MeeshySpacing.sm) { joinChoices(allowsAnonymous: allowsAnonymous) }
                    }
                }
            case .leaveOrOpen:
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: MeeshySpacing.sm) { memberButtons }
                    VStack(spacing: MeeshySpacing.sm) { memberButtons }
                }
            }
        }
    }

    /// Quitter EN PREMIER, puis Ouvrir (directive porteur 2026-09-26).
    @ViewBuilder
    private var memberButtons: some View {
        secondary(ConversationLinkCardCopy.leave, icon: "rectangle.portrait.and.arrow.right",
                  tint: MeeshyColors.error, busy: pending == .leaving,
                  id: "conversation-link-card-leave", action: onLeave)
        primary(ConversationLinkCardCopy.open, icon: "arrow.up.forward",
                busy: false, id: "conversation-link-card-open", action: onOpen)
    }

    private var joinPrompt: some View {
        Text(ConversationLinkCardCopy.joinPrompt)
            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
            .foregroundColor(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
            .lineLimit(1)
            .fixedSize()
            .accessibilityAddTraits(.isHeader)
    }

    /// « Anonyme » (quand le lien l'autorise) puis le COMPTE, nommé par son nom
    /// d'affichage ou son pseudo — « Mon compte » seulement faute de nom.
    /// VoiceOver lit la phrase entière : un « Anonyme » ou un nom lu hors de sa
    /// question ne dit pas ce qu'il fait.
    @ViewBuilder
    private func joinChoices(allowsAnonymous: Bool) -> some View {
        if allowsAnonymous {
            secondary(ConversationLinkCardCopy.joinAsGuest, icon: "theatermasks.fill", tint: accent,
                      a11yLabel: ConversationLinkCardCopy.joinAnonymously,
                      id: "conversation-link-card-join-anonymous", action: onJoinAnonymously)
        }
        primary(joinAccount?.title ?? ConversationLinkCardCopy.joinWithAccount, icon: "person.crop.circle",
                busy: pending == .joining, truncates: joinAccount != nil,
                a11yLabel: ConversationLinkCardCopy.joinWithAccountA11y(joinAccount?.handle ?? joinAccount?.title),
                id: "conversation-link-card-join", action: onJoin)
    }

    private func primary(_ title: String, icon: String, busy: Bool, truncates: Bool = false,
                         a11yLabel: String? = nil, id: String,
                         action: @escaping () -> Void) -> some View {
        Button(action: action) {
            label(title, icon: icon, busy: busy, foreground: .white, truncates: truncates)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous)
                        .fill(LinearGradient(colors: [accent, accent.opacity(0.8)],
                                             startPoint: .leading, endPoint: .trailing))
                )
        }
        .buttonStyle(.plain)
        .disabled(pending != .none)
        .accessibilityLabel(busy ? ConversationLinkCardCopy.inProgress : (a11yLabel ?? title))
        .accessibilityIdentifier(id)
    }

    private func secondary(_ title: String, icon: String, tint: Color, busy: Bool = false,
                           a11yLabel: String? = nil, id: String,
                           action: @escaping () -> Void) -> some View {
        Button(action: action) {
            label(title, icon: icon, busy: busy, foreground: tint)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous)
                        .stroke(tint.opacity(0.7), lineWidth: MeeshyBorder.emphasis)
                )
        }
        .buttonStyle(.plain)
        .disabled(pending != .none)
        .accessibilityLabel(busy ? ConversationLinkCardCopy.inProgress : (a11yLabel ?? title))
        .accessibilityIdentifier(id)
    }

    /// `truncates` : un NOM de compte peut être long ; il se coupe en fin de
    /// ligne au lieu de déborder du bouton empilé.
    private func label(_ title: String, icon: String, busy: Bool, foreground: Color,
                       truncates: Bool = false) -> some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            if busy {
                ProgressView()
                    .tint(foreground)
                    .controlSize(.small)
            } else {
                Image(systemName: icon)
                    .accessibilityHidden(true)
            }
            Text(title)
                .lineLimit(1)
                .truncationMode(.tail)
                .fixedSize(horizontal: !truncates, vertical: false)
        }
        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold))
        .foregroundColor(foreground)
        .padding(.horizontal, MeeshySpacing.sm)
        .frame(maxWidth: .infinity, minHeight: 44)
        .contentShape(Rectangle())
    }
}
