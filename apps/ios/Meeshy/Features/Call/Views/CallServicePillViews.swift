import SwiftUI
import MeeshyUI

extension CallServicePills {
    /// #18227 — les pastilles de service de cet instant de l'appel, par la loi pure : l'attente vient
    /// de CallKit (`CXSetHeldCallAction`, l'appel mobile qui prend la main), l'avis vidéo de l'état
    /// thermique que l'encodeur suit déjà (`VideoThermalProfile`). L'image dans l'image compte la
    /// fenêtre système comme la bulle réduite. La faible lumière n'a pas encore de signal publié.
    @MainActor static func live(_ manager: CallManager, isConnectedLayout: Bool) -> CallServicePills {
        CallServicePillLaw.of(CallServicePillSignals(
            isConnectedLayout: isConnectedLayout,
            isPictureInPicture: manager.isSystemPiPActive || manager.displayMode != .fullScreen,
            isOnHold: manager.isOnHold,
            isVideoCall: manager.isVideoUIActive,
            isCameraOn: manager.isVideoEnabled,
            videoNotice: CallVideoNotice.of(thermal: manager.thermalMonitor.currentState, isLowLight: false)
        ))
    }
}

/// E3 (#18227) — « En attente » : un maillon de la pile des bannières du haut, après la capture.
struct CallHoldPill: View, Equatable {
    var body: some View {
        CallServicePillLabel(text: String(localized: "liveActivity.call.onHold"), banner: .hold, font: .subheadline.weight(.semibold))
    }
}

/// E4 (#18227) — l'avis sur ma vidéo : image réduite pour laisser refroidir le téléphone, ou
/// lumière insuffisante. Il disparaît de lui-même au retour à la normale.
struct CallVideoNoticePill: View, Equatable {
    let notice: CallVideoNotice

    var body: some View {
        if let text {
            CallServicePillLabel(text: text, banner: .videoNotice, font: .footnote.weight(.semibold))
        }
    }

    private var text: String? {
        switch notice {
        case .none: return nil
        case .reduced: return String(localized: "call.video.notice.reduced")
        case .lowLight: return String(localized: "call.video.notice.lowLight")
        }
    }
}

/// Une capsule du verre des bandeaux de la pile (loi 18.1), centrée, deux lignes au plus en grande
/// police. Elle dit sa hauteur pour que ma vignette descende dessous, et s'annonce poliment à
/// VoiceOver, à la suite de ce qu'il lit déjà.
private struct CallServicePillLabel: View {
    let text: String
    let banner: CallTopBanner
    let font: Font

    var body: some View {
        Text(text)
            .font(font)
            .foregroundStyle(Color.white)
            .multilineTextAlignment(.center)
            .lineLimit(2)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.sm)
            .frame(minHeight: CallTopBannerStack.bannerMinimumHeight)
            .modifier(CallBannerGlass(shape: Capsule()))
            .modifier(CallTopBannerHeightReporter(banner: banner))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(text)
            .task(id: text) { AdaptiveAccessibility.announce(text, priority: .low) }
    }
}
