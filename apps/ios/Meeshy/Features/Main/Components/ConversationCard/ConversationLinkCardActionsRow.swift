import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les boutons de la carte, choisis par la règle pure du SDK
/// (`ConversationCardActions`) :
/// - non-membre ⇒ **Rejoindre** pleine largeur, ou **Rejoindre en anonyme** |
///   **Rejoindre** quand le lien l'autorise ;
/// - membre ⇒ **Quitter** EN PREMIER, puis **Ouvrir** ;
/// - lien expiré ⇒ la mention « Lien expiré », aucun bouton.
struct ConversationLinkCardActionsRow: View {
    let actions: ConversationCardActions
    let isExpired: Bool
    let pending: ConversationLinkCardViewModel.Pending
    let errorMessage: String?
    let accentHex: String
    let isDark: Bool
    let onJoin: () -> Void
    let onJoinAnonymously: () -> Void
    let onLeave: () -> Void
    let onOpen: () -> Void

    private var accent: Color { Color(hex: accentHex) }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            buttons
            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                    .font(MeeshyFont.relative(12, weight: .semibold))
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
                // Côte à côte quand les deux libellés tiennent entiers ; sinon
                // empilés, « Rejoindre en anonyme » toujours en premier.
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: MeeshySpacing.sm) { joinButtons(allowsAnonymous: allowsAnonymous) }
                    VStack(spacing: MeeshySpacing.sm) { joinButtons(allowsAnonymous: allowsAnonymous) }
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

    @ViewBuilder
    private func joinButtons(allowsAnonymous: Bool) -> some View {
        if allowsAnonymous {
            secondary(ConversationLinkCardCopy.joinAnonymously, icon: "theatermasks.fill",
                      tint: accent, id: "conversation-link-card-join-anonymous", action: onJoinAnonymously)
        }
        primary(ConversationLinkCardCopy.join, icon: "person.badge.plus",
                busy: pending == .joining, id: "conversation-link-card-join", action: onJoin)
    }

    private func primary(_ title: String, icon: String, busy: Bool, id: String,
                         action: @escaping () -> Void) -> some View {
        Button(action: action) {
            label(title, icon: icon, busy: busy, foreground: .white)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(LinearGradient(colors: [accent, accent.opacity(0.8)],
                                             startPoint: .leading, endPoint: .trailing))
                )
        }
        .buttonStyle(.plain)
        .disabled(pending != .none)
        .accessibilityLabel(busy ? ConversationLinkCardCopy.inProgress : title)
        .accessibilityIdentifier(id)
    }

    private func secondary(_ title: String, icon: String, tint: Color, busy: Bool = false, id: String,
                           action: @escaping () -> Void) -> some View {
        Button(action: action) {
            label(title, icon: icon, busy: busy, foreground: tint)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(tint.opacity(0.7), lineWidth: 1.5)
                )
        }
        .buttonStyle(.plain)
        .disabled(pending != .none)
        .accessibilityLabel(busy ? ConversationLinkCardCopy.inProgress : title)
        .accessibilityIdentifier(id)
    }

    private func label(_ title: String, icon: String, busy: Bool, foreground: Color) -> some View {
        HStack(spacing: 6) {
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
                .fixedSize()
        }
        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold))
        .foregroundColor(foreground)
        .padding(.horizontal, MeeshySpacing.sm)
        .frame(maxWidth: .infinity, minHeight: 44)
        .contentShape(Rectangle())
    }
}
