import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Par e-mail » / « Inviter quelqu'un » (planche `Parrainage`, #19507) : une adresse, un bouton. L'invitation
/// porte le lien de parrainage ; la passerelle la masque dans « Invitations envoyées », l'appareil ne la garde pas.
struct ReferralInviteSheet: View {
    let onSend: @MainActor (String) async -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var isSending = false

    private var canSend: Bool { ReferralInviteRule.isPlausibleEmail(email.trimmingCharacters(in: .whitespacesAndNewlines)) }

    var body: some View {
        LinksPage(title: ReferralCopy.inviteTitle, accent: MeeshyColors.brandPrimary, glyph: .close) {
            VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
                LinksFormField(label: ReferralCopy.emailField, prompt: ReferralCopy.emailPrompt, text: $email,
                               input: .token, caption: ReferralCopy.inviteHint)
                MeeshyButton(ReferralCopy.send, systemImage: "paperplane", kind: .primary, width: .fill,
                             tint: MeeshyColors.brandPrimary, isPending: isSending, action: { send() })
                    .disabled(!canSend || isSending)
                    .accessibilityIdentifier("referral.invite.send")
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.lg)
        }
    }

    private func send() {
        guard canSend, !isSending else { return }
        isSending = true
        HapticFeedback.light()
        Task {
            let sent = await onSend(email)
            isSending = false
            guard sent else {
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(ReferralCopy.sendFailed)
                return
            }
            HapticFeedback.success()
            FeedbackToastManager.shared.showSuccess(ReferralCopy.sent)
            dismiss()
        }
    }
}
