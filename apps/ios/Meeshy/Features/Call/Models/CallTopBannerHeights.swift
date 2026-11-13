import SwiftUI

/// #17791 — chaque bandeau de la pile rend sa hauteur réelle à l'écran d'appel, qui en déduit
/// la place de ma vignette (`CallTopBannerStack.selfTileClearance`). `nonisolated`, comme les
/// autres clés de l'appel : la cible isole par défaut sur le MainActor, `PreferenceKey` non.
nonisolated struct CallTopBannerHeightsKey: PreferenceKey {
    static let defaultValue: [CallTopBanner: CGFloat] = [:]

    static func reduce(value: inout [CallTopBanner: CGFloat], nextValue: () -> [CallTopBanner: CGFloat]) {
        value.merge(nextValue()) { _, new in new }
    }
}

struct CallTopBannerHeightReporter: ViewModifier {
    let banner: CallTopBanner

    func body(content: Content) -> some View {
        content.background(GeometryReader { proxy in
            Color.clear.preference(key: CallTopBannerHeightsKey.self, value: [banner: proxy.size.height])
        })
    }
}

/// #17833 (L4.11) — la réserve haute de la grille de groupe : l'espace sous l'en-tête, plus la place
/// que la pile des bandeaux prend (même loi que ma vignette de duo). Vue à part : elle observe seule le
/// partage, l'enregistrement et la capture, sans réévaluer tout l'écran d'appel ; la grille glisse avec
/// la pile, et « Réduire les animations » la remplace par un fondu court.
struct CallGroupStageTopReserve: View {
    @ObservedObject var screenShare: CallScreenShareController
    @ObservedObject var recording: CallRecordingController
    @ObservedObject var captureJournal: CallCaptureJournal
    let hasLiveFrameStatus: Bool
    let heights: [CallTopBanner: CGFloat]
    let base: CGFloat
    let isStageFullScreen: Bool
    let reduceMotion: Bool

    var body: some View {
        Color.clear
            .frame(height: base + clearance)
            .animation(CallChromeStow.animation(reduceMotion: reduceMotion), value: clearance)
    }

    private var clearance: CGFloat {
        CallTopBannerStack.groupGridClearance(
            present: CallTopBannerStack.present(
                isScreenShareShown: screenShare.isSharing || screenShare.isRemoteSharing,
                isRecordingShown: recording.phase != .idle || recording.notice != nil,
                isCaptureAlertShown: captureJournal.alert != nil,
                isLiveFrameShown: hasLiveFrameStatus
            ),
            heights: heights,
            isStageFullScreen: isStageFullScreen
        )
    }
}
