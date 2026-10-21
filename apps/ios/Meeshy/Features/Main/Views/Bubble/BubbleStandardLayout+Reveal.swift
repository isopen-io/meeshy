// Extrait de BubbleStandardLayout.swift (#10678) : voile, drapeaux de langue, révélation et auteur vidéo.
// Découpe par responsabilité, sans changement de comportement.

import SwiftUI
import MeeshySDK
import MeeshyUI

extension BubbleStandardLayout {

    // MARK: - Fog overlay (blur reveal disappearance)

    @ViewBuilder
    var fogOverlay: some View {
        ZStack {
            RadialGradient(
                gradient: Gradient(colors: [
                    Color.white.opacity(0.35),
                    Color.white.opacity(MeeshyOpacity.light),
                    Color.clear
                ]),
                center: .center,
                startRadius: 5,
                endRadius: 120
            )
            .blur(radius: 18)
            .scaleEffect(1.3)

            Circle()
                .fill(Color.white.opacity(MeeshyOpacity.light))
                .blur(radius: 25)
                .frame(width: 70, height: 70)
                .offset(x: -25, y: -18)

            Circle()
                .fill(Color.white.opacity(MeeshyOpacity.light))
                .blur(radius: 30)
                .frame(width: 55, height: 55)
                .offset(x: 20, y: 12)
        }
        .opacity(blurController.fogOpacity)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lgPlus))
        .allowsHitTesting(false)
    }

    // MARK: - Language flag handling

    /// Returns the available language flags for the language strip.
    /// Reads from `content.translation.availableFlags` when BubbleContent
    /// has populated them (live binding to active lang), with a fallback
    /// for the cold-cache cases where Translation is nil. Mirrors legacy
    /// ThemedMessageBubble.buildAvailableFlags exactly.
    func buildAvailableFlags() -> [String] {
        if let flags = content.translation?.availableFlags {
            return flags
        }
        return []
    }

    func handleFlagTap(_ code: String) {
        let outcome = BubbleLanguageFlagController.handleTap(
            code: code,
            current: BubbleLanguageFlagController.Context(
                activeDisplayLangCode: activeDisplayLangCode,
                secondaryLangCode: secondaryLangCode
            ),
            messageOriginalLang: message.originalLanguage,
            translations: textTranslations
        )
        HapticFeedback.light()
        switch outcome.action {
        case .switchPrimary:
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                activeDisplayLangCode = outcome.activeDisplayLangCode
                secondaryLangCode = outcome.secondaryLangCode
            }
        case .openSecondary, .closeSecondary:
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                secondaryLangCode = outcome.secondaryLangCode
            }
        case .requestTranslation(let target):
            onRequestTranslation?(content.messageId, target)
        }
    }

    // MARK: - Blur reveal action (delegated to controller)

    /// #8389 — le voile se lève SUR PLACE, médias compris : chaque case
    /// révélée ouvre ensuite son plein écran par son propre toucher.
    func revealBlurredContent() {
        HapticFeedback.medium()
        blurController.requestReveal(
            request: BubbleBlurRevealLifecycle.RevealRequest(
                messageId: content.messageId,
                isViewOnce: content.veilConsumesViewOnce
            ),
            consumeViewOnce: onConsumeViewOnce
        )
    }

    // MARK: - Fullscreen video author chip

    func makeFullscreenVideoAuthor() -> MeeshyVideoPlayer.VideoAuthor? {
        let name = message.senderName ?? ""
        guard !name.isEmpty else { return nil }
        return MeeshyVideoPlayer.VideoAuthor(
            displayName: name,
            avatarUrl: message.senderAvatarURL,
            userId: message.senderUserId ?? message.senderId
        )
    }
}
