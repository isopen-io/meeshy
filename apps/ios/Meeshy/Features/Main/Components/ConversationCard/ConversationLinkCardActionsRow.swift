import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les boutons de la carte, choisis par la règle pure du SDK
/// (`ConversationCardActions`) :
/// - non-membre ⇒ **Rejoindre ?** suivi de deux choix compacts, **Anonyme**
///   (quand le lien l'autorise) et **Mon compte** (#8726) ;
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
                // « Rejoindre ? » puis deux choix COMPACTS (directive porteur
                // 2026-09-29, #8726) : question et réponses sur une ligne quand
                // elles tiennent, la question au-dessus sinon.
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: MeeshySpacing.sm) {
                        joinPrompt
                        Spacer(minLength: 0)
                        joinChoices(allowsAnonymous: allowsAnonymous)
                    }
                    VStack(alignment: .leading, spacing: 0) {
                        joinPrompt
                        HStack(spacing: MeeshySpacing.sm) { joinChoices(allowsAnonymous: allowsAnonymous) }
                    }
                    VStack(alignment: .leading, spacing: 0) {
                        joinPrompt
                        joinChoices(allowsAnonymous: allowsAnonymous)
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

    /// « Anonyme » (quand le lien l'autorise) puis « Mon compte ». Des capsules
    /// légères, plus petites que les boutons pleine largeur de Quitter | Ouvrir ;
    /// la cible reste de 44 pt par la zone de contact, pas par le dessin.
    @ViewBuilder
    private func joinChoices(allowsAnonymous: Bool) -> some View {
        if allowsAnonymous {
            compactChoice(ConversationLinkCardCopy.joinAsGuest, icon: "theatermasks.fill", filled: false,
                          busy: false, a11yLabel: ConversationLinkCardCopy.joinAnonymously,
                          id: "conversation-link-card-join-anonymous", action: onJoinAnonymously)
        }
        compactChoice(ConversationLinkCardCopy.joinWithAccount, icon: "person.crop.circle", filled: true,
                      busy: pending == .joining, a11yLabel: ConversationLinkCardCopy.joinWithAccountA11y,
                      id: "conversation-link-card-join", action: onJoin)
    }

    private func compactChoice(_ title: String, icon: String, filled: Bool, busy: Bool, a11yLabel: String,
                               id: String, action: @escaping () -> Void) -> some View {
        let foreground: Color = filled ? .white : accent
        return Button(action: action) {
            HStack(spacing: 4) {
                if busy {
                    ProgressView()
                        .tint(foreground)
                        .controlSize(.mini)
                } else {
                    Image(systemName: icon)
                        .accessibilityHidden(true)
                }
                Text(title)
                    .lineLimit(1)
                    .fixedSize()
            }
            .font(MeeshyFont.relative(13, weight: .semibold))
            .foregroundColor(foreground)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Capsule().fill(filled ? accent : accent.opacity(isDark ? 0.18 : 0.10)))
            .overlay(Capsule().stroke(accent.opacity(filled ? 0 : 0.55), lineWidth: 1))
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(pending != .none)
        .accessibilityLabel(busy ? ConversationLinkCardCopy.inProgress : a11yLabel)
        .accessibilityIdentifier(id)
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
