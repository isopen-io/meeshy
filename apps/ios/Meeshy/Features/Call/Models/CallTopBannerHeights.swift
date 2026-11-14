import SwiftUI
import MeeshyUI

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

/// #17833 (L4.11) — la réserve haute de la grille de groupe : la place que la pile des bandeaux prend
/// (même loi que ma vignette de duo), sous l'en-tête ou, en portrait sans bandeau, rien que la zone
/// sûre : l'en-tête flotte alors sur la grille (P11.1). Vue à part : elle observe seule le partage,
/// l'enregistrement et la capture, sans réévaluer tout l'écran d'appel ; la grille glisse avec la pile
/// et sous l'en-tête, et « Réduire les animations » la remplace par un fondu court.
struct CallGroupStageTopReserve: View {
    @ObservedObject var screenShare: CallScreenShareController
    @ObservedObject var recording: CallRecordingController
    @ObservedObject var captureJournal: CallCaptureJournal
    let hasLiveFrameStatus: Bool
    let heights: [CallTopBanner: CGFloat]
    let safeAreaTop: CGFloat
    let chromeTopInset: CGFloat
    let headerFloats: Bool
    let isStageFullScreen: Bool
    let reduceMotion: Bool
    /// #18227 — les pastilles de service montrées (`CallServicePills.banners`) : la grille leur cède aussi sa place.
    var service: Set<CallTopBanner> = []

    var body: some View {
        Color.clear
            .frame(height: base + clearance)
            .animation(CallChromeStow.animation(reduceMotion: reduceMotion), value: clearance)
            .animation(CallChromeStow.animation(reduceMotion: reduceMotion), value: base)
    }

    private var present: Set<CallTopBanner> {
        CallTopBannerStack.present(
            isScreenShareShown: screenShare.isSharing || screenShare.isRemoteSharing,
            isRecordingShown: recording.phase != .idle || recording.notice != nil,
            isCaptureAlertShown: captureJournal.alert != nil,
            isLiveFrameShown: hasLiveFrameStatus,
            service: service
        )
    }

    private var base: CGFloat {
        CallTopBannerStack.groupStageTopBase(safeAreaTop: safeAreaTop, chromeTopInset: chromeTopInset, stageSpacing: MeeshySpacing.sm,
                                             headerFloats: headerFloats, hasBanners: !present.isEmpty, isStageFullScreen: isStageFullScreen)
    }

    private var clearance: CGFloat {
        CallTopBannerStack.groupGridClearance(present: present, heights: heights, isStageFullScreen: isStageFullScreen)
    }
}

nonisolated extension CallTopBannerStack {
    /// P11.1 (#18206) — en groupe, l'en-tête flotte sur la grille (planche P11). Pas en hauteur
    /// compacte (L4, #17885 : la rangée de quatre reste entre l'en-tête et la pilule), ni sur la une
    /// (P14 : sa capsule et la puce d'écran se posent au haut de sa vignette, sous l'en-tête).
    static func headerFloatsOverGroupStage(isGrid: Bool, isCompactHeight: Bool) -> Bool {
        isGrid && !isCompactHeight
    }

    /// La réserve au-dessus de la scène de groupe, avant la place de la pile (la scène suit à
    /// `stageSpacing`). L'en-tête flotte : la grille part de la zone sûre, sa rangée se pose 8 pt
    /// plus bas sur les vignettes (P11). Plein écran : la zone sûre. Sinon, sous la rangée d'en-tête.
    /// Un bandeau présent se pose sous l'en-tête et la grille lui cède sa place (L4.11).
    static func groupStageTopBase(safeAreaTop: CGFloat, chromeTopInset: CGFloat, stageSpacing: CGFloat, headerFloats: Bool, hasBanners: Bool, isStageFullScreen: Bool) -> CGFloat {
        if isStageFullScreen { return safeAreaTop }
        if headerFloats && !hasBanners { return max(0, safeAreaTop - stageSpacing) }
        return topInset(chromeTopInset: chromeTopInset)
    }
}
