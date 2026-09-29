import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

extension CallView {
    @ViewBuilder
    var callModeLayer: some View {
        if let mode = layer.activeMode {
            ZStack(alignment: .bottom) {
                modeStage(mode)
                LinearGradient(colors: [.clear, .black.opacity(0.75)], startPoint: .center, endPoint: .bottom)
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                VStack(spacing: 14) {
                    if mode == .effects {
                        effectsCompanions
                    }
                    if showTranscript {
                        captionsBand(hasOwnGlass: true, opensJournal: false)
                            .padding(.horizontal, 16)
                    }
                    modeControls(mode)
                }
                .padding(.bottom, Self.chromeBottomInset)
                CallModeRecordingOverlay(capture: capture)
            }
            .transition(.opacity)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(CallModeCopy.title(mode))
        }
    }

    @ViewBuilder
    private func modeStage(_ mode: CallScreenMode) -> some View {
        switch mode {
        case .effects:
            videoStream(local: true, contentMode: .scaleAspectFill)
                .ignoresSafeArea()
                .accessibilityHidden(true)
        case .montage:
            CallMontageLiveStage(capture: capture)
        }
    }

    /// #8737 — les autres restent visibles pendant qu'on applique un effet. Posé
    /// dans la pile des commandes, le bloc prend la bande libre au-dessus d'elles.
    private var effectsCompanions: some View {
        CallEffectsCompanionStrip(
            tiles: effectsCompanionTiles,
            track: { effectsTrack(for: $0) },
            intendedFront: callManager.isUsingFrontCamera,
            topInset: Self.chromeTopInset
        )
    }

    @ViewBuilder
    private func modeControls(_ mode: CallScreenMode) -> some View {
        switch mode {
        case .effects:
            CallEffectsModeControls(callManager: callManager, capture: capture, subjects: myImageCaptureSubjects, tracks: myImageCaptureTracks, onExit: exitMode)
        case .montage:
            CallMontageModeControls(capture: capture, subjects: captureSubjects, tracks: captureTracks, onExit: exitMode)
        }
    }

    func enterMode(_ mode: CallScreenMode) {
        withAnimation(reduceMotion ? .easeInOut(duration: 0.2) : .easeInOut(duration: 0.3)) {
            layer = layer.entering(mode)
        }
        HapticFeedback.light()
        UIAccessibility.post(notification: .screenChanged, argument: CallModeCopy.title(mode))
    }

    func exitMode() {
        withAnimation(reduceMotion ? .easeInOut(duration: 0.2) : .easeInOut(duration: 0.3)) {
            layer = layer.exitingMode()
            showControls = true
        }
        UIAccessibility.post(notification: .screenChanged, argument: nil)
    }
}
