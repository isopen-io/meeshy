import SwiftUI
import MeeshySDK
import MeeshyUI

// Extrait de `ConversationInfoSheet.swift` (budget de taille) : la rangée de
// sécurité de la fiche — l'entrée « Chiffrement de bout en bout » d'une
// conversation directe (feuille de détail, état propre à la rangée) et, pour un
// groupe chiffré, l'entrée de vérification du numéro de sécurité (la feuille
// reste présentée par la fiche, qui reçoit l'action).

struct ConversationInfoSecurityRow: View {
    let conversationId: String
    let accentColor: String
    let isDirect: Bool
    let isEncrypted: Bool
    let encryptionModeLabel: String
    let isDark: Bool
    let appearAnimation: Bool
    let onVerifySafetyNumber: () -> Void

    @State private var showEncryptionDetail = false

    private var theme: ThemeManager { ThemeManager.shared }

    @ViewBuilder
    var body: some View {
        if isDirect {
            // Direct conversations: always expose End-to-End Encryption menu item
            Button {
                HapticFeedback.light()
                showEncryptionDetail = true
            } label: {
                HStack(spacing: MeeshySpacing.md) {
                    Image(systemName: isEncrypted ? "lock.shield.fill" : "lock.shield")
                        .font(MeeshyFont.relative(MeeshyIconSize.md))
                        .foregroundColor(isEncrypted ? MeeshyColors.success : Color(hex: accentColor))
                        .frame(width: 24)

                    VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                        Text(String(localized: "conversation.encryption.menu.title",
                                    defaultValue: "Chiffrement de bout en bout",
                                    bundle: .main))
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(theme.textPrimary)

                        Text(isEncrypted
                             ? String(localized: "conversation.encryption.menu.active",
                                      defaultValue: "Chiffrement actif — \(encryptionModeLabel)",
                                      bundle: .main)
                             : String(localized: "conversation.encryption.menu.inactive",
                                      defaultValue: "Conversation non chiffrée — appuyez pour activer",
                                      bundle: .main))
                            .font(.caption)
                            .foregroundColor(theme.textMuted)
                            .lineLimit(1)
                    }

                    Spacer()

                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                        .foregroundColor(theme.textMuted)
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
            .sheet(isPresented: $showEncryptionDetail) {
                ConversationEncryptionDetailSheet(
                    conversationId: conversationId,
                    accentColor: accentColor
                )
            }
        } else if isEncrypted {
            // Groups: keep legacy safety-number verification entry when encryption is active
            Button {
                HapticFeedback.light()
                onVerifySafetyNumber()
            } label: {
                HStack(spacing: MeeshySpacing.md) {
                    Image(systemName: "lock.fill")
                        .font(MeeshyFont.relative(MeeshyIconSize.md))
                        .foregroundColor(MeeshyColors.indigo400)
                        .frame(width: 24)

                    VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                        Text(String(localized: "conversation.encryption.legacy.title",
                                    defaultValue: "Chiffrement de bout en bout",
                                    bundle: .main))
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(theme.textPrimary)

                        Text(String(localized: "conversation.encryption.legacy.subtitle",
                                    defaultValue: "Appuyez pour vérifier le numéro de sécurité",
                                    bundle: .main))
                            .font(.caption)
                            .foregroundColor(theme.textMuted)
                            .lineLimit(1)
                    }

                    Spacer()

                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                        .foregroundColor(theme.textMuted)
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
}
