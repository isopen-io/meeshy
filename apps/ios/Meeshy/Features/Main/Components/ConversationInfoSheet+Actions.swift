import SwiftUI
import MeeshySDK
import os
import MeeshyUI

extension ConversationInfoSheet {

    // MARK: - Action Buttons

    var actionButtons: some View {
        HStack(spacing: MeeshySpacing.md) {
            actionButton(
                icon: "link.badge.plus",
                label: String(localized: "common.share", defaultValue: "Partager", bundle: .main),
                color: MeeshyColors.shareAccentHex,
                isLoading: isCreatingShareLink
            ) {
                Task { await createShareLink() }
            }

            actionButton(
                icon: "rectangle.portrait.and.arrow.right",
                label: String(localized: "conversation.info.leave.confirm", defaultValue: "Quitter", bundle: .main),
                color: MeeshyColors.errorHex
            ) {
                showLeaveConfirmation = true
            }
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.vertical, MeeshySpacing.md)
        .opacity(appearAnimation ? 1 : 0)
        .animation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.03), value: appearAnimation)
    }

    private func actionButton(
        icon: String,
        label: String,
        color: String,
        isLoading: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: MeeshySpacing.sm) {
                if isLoading {
                    ProgressView()
                        .scaleEffect(0.8)
                        .tint(Color(hex: color))
                } else {
                    Image(systemName: icon)
                        .font(MeeshyFont.relative(13, weight: .semibold))
                }
                Text(label)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
            }
            .foregroundColor(Color(hex: color))
            .frame(maxWidth: .infinity)
            .padding(.vertical, MeeshySpacing.smPlus)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                    .fill(Color(hex: color).opacity(isDark ? 0.12 : 0.08))
            )
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                    .strokeBorder(Color(hex: color).opacity(MeeshyOpacity.light), lineWidth: 1)
            )
        }
        .disabled(isLoading)
    }

    // MARK: - Share Link Actions

    private func createShareLink() async {
        isCreatingShareLink = true
        defer { isCreatingShareLink = false }

        do {
            let request = CreateShareLinkRequest(
                conversationId: conversation.id,
                name: conversation.name,
                allowAnonymousMessages: true
            )
            let result = try await ShareLinkService.shared.createShareLink(request: request)
            guard let shareURL = URL(string: result.joinUrl) else {
                throw URLError(.badURL)
            }
            shareableLink = ShareableLink(url: shareURL)
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "conversation.info.share.error", defaultValue: "Erreur lors de la création du lien", bundle: .main))
        }
    }

    func leaveConversation() async {
        do {
            try await ConversationService.shared.leave(conversationId: conversation.id)
            dismiss()
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "conversation.info.leave.error", defaultValue: "Erreur lors du départ de la conversation", bundle: .main))
        }
    }

    // MARK: - Block Button

    var blockUserButton: some View {
        Button {
            HapticFeedback.medium()
            showBlockConfirm = true
        } label: {
            HStack(spacing: MeeshySpacing.sm) {
                if isBlocking {
                    ProgressView()
                        .tint(MeeshyColors.error)
                        .scaleEffect(0.8)
                } else {
                    Image(systemName: "exclamationmark.shield")
                        .font(MeeshyFont.relative(13, weight: .semibold))
                }
                Text(String(localized: "conversation.info.block.title", defaultValue: "Bloquer cet utilisateur", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
            }
            .foregroundColor(MeeshyColors.error)
            .frame(maxWidth: .infinity)
            .padding(.vertical, MeeshySpacing.smPlus)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                    .fill(MeeshyColors.error.opacity(isDark ? 0.12 : 0.08))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                            .stroke(MeeshyColors.error.opacity(MeeshyOpacity.light), lineWidth: 1)
                    )
            )
        }
        .disabled(isBlocking)
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.bottom, MeeshySpacing.md)
        .accessibilityLabel(String(format: String(localized: "conversation.info.block.a11y", defaultValue: "Bloquer %@", bundle: .main), conversation.name))
    }

    // MARK: - Block Action

    func blockOtherUser() {
        guard let userId = otherUserId else { return }
        isBlocking = true
        Task { [weak blockService = BlockService.shared] in
            do {
                try await blockService?.blockUser(userId: userId)
                HapticFeedback.success()
                FeedbackToastManager.shared.showSuccess(String(localized: "conversation.info.block.success", defaultValue: "Utilisateur bloqué", bundle: .main))
                dismiss()
            } catch {
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(String(localized: "conversation.info.block.error", defaultValue: "Erreur lors du blocage", bundle: .main))
                Self.logger.error("Failed to block user: \(error.localizedDescription)")
            }
            isBlocking = false
        }
    }
}
