import SwiftUI
import MeeshySDK
import MeeshyUI

// Extrait de `ConversationInfoSheet.swift` (budget de taille) : la rangée de
// sécurité de la fiche (#12880). Tout membre y lit, sans jargon, comment la
// conversation est chiffrée, et ouvre la fiche Chiffrement qui l'explique ; la
// bascule n'y est proposée qu'au rôle autorisé, en tête-à-tête. Un groupe
// chiffré garde en plus l'entrée de vérification du numéro de sécurité (la
// feuille reste présentée par la fiche, qui reçoit l'action).

struct ConversationInfoSecurityRow: View {
    let conversationId: String
    let accentColor: String
    let isDirect: Bool
    let encryptionMode: String?
    let isDark: Bool
    let appearAnimation: Bool
    let onVerifySafetyNumber: () -> Void
    /// Le contact d'un tête-à-tête, pour ouvrir l'autre fil de la paire (#12966).
    var peer: ConversationEncryptionPeer?
    var onOpenConversation: (String) -> Void = { _ in }
    var mayToggleEncryption: Bool = ConversationEncryptionActivationPolicy.mayToggle(
        served: nil, platformRole: AuthManager.shared.currentUser?.role
    )

    @State private var showEncryptionDetail = false

    private var theme: ThemeManager { ThemeManager.shared }

    private var regime: ConversationEncryptionRegime { ConversationEncryptionRegime(mode: encryptionMode) }

    private var content: ConversationSecurityRowContent {
        .resolve(isDirect: isDirect, isEncrypted: regime != .none, mayToggle: mayToggleEncryption)
    }

    @ViewBuilder
    var body: some View {
        switch content {
        case .directEntry(let offersToggle):
            explanationEntry(offersToggle: offersToggle)
        case .groupEntry(let showsSafetyNumber):
            explanationEntry(offersToggle: false)
            if showsSafetyNumber { safetyNumberEntry }
        }
    }

    private var regimeSymbol: String {
        switch regime {
        case .none: "lock.open"
        case .server, .hybrid: "lock.icloud"
        case .endToEnd: "lock.shield.fill"
        }
    }

    private var regimeTint: Color {
        regime == .endToEnd ? MeeshyColors.success : Color(hex: accentColor)
    }

    // L'entrée ouvre la fiche Chiffrement ; la bascule n'y est proposée qu'au
    // rôle autorisé (#12517, #12588, #12522), jamais pour un groupe (#12844).
    private func explanationEntry(offersToggle: Bool) -> some View {
        Button {
            HapticFeedback.light()
            showEncryptionDetail = true
        } label: {
            HStack(spacing: MeeshySpacing.md) {
                Image(systemName: regimeSymbol)
                    .font(MeeshyFont.relative(MeeshyIconSize.md))
                    .foregroundColor(regimeTint)
                    .frame(width: 24)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    Text(String(localized: "conversation.encryption.detail.title",
                                defaultValue: "Chiffrement",
                                bundle: .main))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(theme.textPrimary)

                    Text(regime.summary)
                        .font(.caption)
                        .foregroundStyle(theme.textMuted)
                        .lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer()

                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    .foregroundStyle(theme.textMuted)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.mdPlus)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                    .fill(isDark ? theme.textPrimary.opacity(MeeshyOpacity.faint) : theme.textPrimary.opacity(MeeshyOpacity.faint))
            )
            .contentShape(Rectangle())
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("conversation-encryption-row")
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.bottom, MeeshySpacing.md)
        .opacity(appearAnimation ? 1 : 0)
        .animation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.04), value: appearAnimation)
        .sheet(isPresented: $showEncryptionDetail) {
            ConversationEncryptionDetailSheet(
                conversationId: conversationId,
                accentColor: accentColor,
                fallbackMayToggle: offersToggle,
                isDirect: isDirect,
                peer: isDirect ? peer : nil,
                onOpenConversation: onOpenConversation
            )
        }
    }

    // Groupe chiffré : l'entrée de vérification du numéro de sécurité.
    private var safetyNumberEntry: some View {
        Button {
            HapticFeedback.light()
            onVerifySafetyNumber()
        } label: {
            HStack(spacing: MeeshySpacing.md) {
                Image(systemName: "lock.fill")
                    .font(MeeshyFont.relative(MeeshyIconSize.md))
                    .foregroundStyle(MeeshyColors.indigo400)
                    .frame(width: 24)

                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    Text(String(localized: "conversation.encryption.legacy.title",
                                defaultValue: "Chiffrement de bout en bout",
                                bundle: .main))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(theme.textPrimary)

                    Text(String(localized: "conversation.encryption.legacy.subtitle",
                                defaultValue: "Appuyez pour vérifier le numéro de sécurité",
                                bundle: .main))
                        .font(.caption)
                        .foregroundStyle(theme.textMuted)
                        .lineLimit(1)
                }

                Spacer()

                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    .foregroundStyle(theme.textMuted)
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.mdPlus)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                    .fill(isDark ? theme.textPrimary.opacity(MeeshyOpacity.faint) : theme.textPrimary.opacity(MeeshyOpacity.faint))
            )
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.bottom, MeeshySpacing.md)
        .opacity(appearAnimation ? 1 : 0)
        .animation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.04), value: appearAnimation)
    }
}
