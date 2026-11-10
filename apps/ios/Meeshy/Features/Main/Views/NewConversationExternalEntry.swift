import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// MARK: - « Écrire à un ami WhatsApp » (#17118)

/// La rangée de la nouvelle conversation qui ouvre, ou retrouve, une
/// conversation chiffrée de bout en bout avec un ami WhatsApp, par son numéro.
/// L'hôte ne la monte que si `ExternalConversationEntry.isVisible` l'autorise :
/// jamais en production, et au staging pour l'équipe seulement.
///
/// Chemin nominal : toucher la rangée, saisir le numéro, « Écrire » — le fil
/// s'ouvre. Avant l'envoi, elle dit ce qu'est la conversation (chiffrée,
/// traduite sur l'appareil, sans les fonctions qui exigent le clair côté
/// serveur) ; après, chaque refus est dit, et un numéro non vérifié se vérifie
/// sur place.
struct NewConversationExternalEntry: View {
    @ObservedObject var model: ExternalConversationEntryModel
    let onOpened: (String) -> Void

    @State private var showsPhoneVerification = false
    @FocusState private var handleFocused: Bool
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            toggleRow
            if model.isExpanded { form }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: model.isExpanded)
        .adaptiveOnChange(of: model.openedConversationId) { _, conversationId in
            guard let conversationId else { return }
            HapticFeedback.success()
            model.consumeOpened()
            onOpened(conversationId)
        }
        .adaptiveOnChange(of: model.phase) { _, phase in
            guard let message = ExternalConversationEntryCopy.message(for: phase) else { return }
            HapticFeedback.error()
            UIAccessibility.post(notification: .announcement, argument: message)
        }
        .sheet(isPresented: $showsPhoneVerification) {
            PhonePromptSheet()
        }
    }

    // MARK: - La rangée

    private var toggleRow: some View {
        Button {
            HapticFeedback.light()
            model.toggle()
            handleFocused = model.isExpanded
        } label: {
            HStack(spacing: MeeshySpacing.md) {
                Image(systemName: "phone.bubble.fill")
                    .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .medium))
                    .foregroundStyle(MeeshyColors.success)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(MeeshyColors.success.opacity(0.12)))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    Text(String(localized: "conversation.external.entry.title", defaultValue: "Écrire à un ami WhatsApp", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundStyle(theme.textPrimary)
                    Text(String(localized: "conversation.external.entry.detail", defaultValue: "Par son numéro, chiffré de bout en bout", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                        .foregroundStyle(theme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: MeeshySpacing.sm)
                Image(systemName: model.isExpanded ? "chevron.up" : "chevron.down")
                    .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .semibold))
                    .foregroundStyle(theme.textMuted)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: 44)
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(model.isExpanded ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("new-conversation-external-toggle")
    }

    // MARK: - Le formulaire

    private var form: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(String(localized: "conversation.external.handle.label", defaultValue: "Numéro WhatsApp de votre ami", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                .foregroundStyle(theme.textSecondary)
            handleField
            Text(String(localized: "conversation.external.handle.hint", defaultValue: "Au format international, avec l’indicatif du pays : +33 6 12 34 56 78.", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.smallSize))
                .foregroundStyle(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
            if let message = ExternalConversationEntryCopy.message(for: model.phase) {
                refusal(message)
            }
            if model.offersPhoneVerification { verifyPhoneButton }
            encryptedNotice
            submitButton
        }
        .padding(.horizontal, MeeshySpacing.lg + MeeshySpacing.mdPlus)
        .padding(.bottom, MeeshySpacing.sm)
        .transition(.opacity.combined(with: .move(edge: .top)))
    }

    private var handleField: some View {
        TextField(text: $model.handle, prompt: Text(verbatim: "+33 6 12 34 56 78")) {
            Text(String(localized: "conversation.external.handle.label", defaultValue: "Numéro WhatsApp de votre ami", bundle: .main))
        }
            .keyboardType(.phonePad)
            .textContentType(.telephoneNumber)
            .focused($handleFocused)
            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
            .foregroundStyle(theme.textPrimary)
            .environment(\.layoutDirection, .leftToRight)
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.smPlus)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                    .stroke(model.phase == .malformed ? MeeshyColors.error : theme.border(tint: MeeshyColors.brandDeepHex), lineWidth: 1)
            )
            .accessibilityIdentifier("new-conversation-external-handle")
    }

    private func refusal(_ message: String) -> some View {
        Text(message)
            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
            .foregroundStyle(MeeshyColors.error)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("new-conversation-external-refusal")
    }

    private var verifyPhoneButton: some View {
        Button {
            HapticFeedback.light()
            showsPhoneVerification = true
        } label: {
            Text(String(localized: "conversation.external.verifyPhone", defaultValue: "Vérifier mon numéro", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .bold))
                .foregroundStyle(MeeshyColors.indigo400)
                .frame(minHeight: 44)
        }
        .accessibilityIdentifier("new-conversation-external-verify-phone")
    }

    private var encryptedNotice: some View {
        HStack(alignment: .top, spacing: MeeshySpacing.sm) {
            Image(systemName: "lock.fill")
                .font(MeeshyFont.relative(MeeshyIconSize.xs))
                .foregroundStyle(theme.textMuted)
                .accessibilityHidden(true)
            Text(String(localized: "conversation.external.encrypted", defaultValue: "Chiffré de bout en bout : Meeshy ne lit pas vos messages. La traduction se fait sur votre appareil, et les fonctions qui exigent de lire le message sur nos serveurs n’existent pas dans cette conversation.", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.smallSize))
                .foregroundStyle(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    private var submitButton: some View {
        Button {
            HapticFeedback.medium()
            Task { await model.submit() }
        } label: {
            HStack(spacing: MeeshySpacing.sm) {
                if model.phase == .opening {
                    ProgressView().tint(.white)
                }
                Text(String(localized: "conversation.external.submit", defaultValue: "Écrire", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .bold))
                    .foregroundStyle(.white)
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus).fill(MeeshyColors.indigo400))
        }
        .buttonStyle(.plain)
        .disabled(!model.canSubmit)
        .opacity(model.canSubmit ? 1 : 0.5)
        .accessibilityIdentifier("new-conversation-external-submit")
    }
}
