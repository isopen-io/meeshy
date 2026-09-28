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
                    if showTranscript {
                        captionsBand(hasOwnGlass: true, opensJournal: false)
                            .padding(.horizontal, 16)
                    }
                    modeControls(mode)
                }
                .padding(.bottom, Self.chromeBottomInset)
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
            CallMontageStage(
                image: capture.preview,
                styleName: CallCaptureCopy.styleName(capture.style),
                isWorking: capture.status == .working
            )
        }
    }

    @ViewBuilder
    private func modeControls(_ mode: CallScreenMode) -> some View {
        switch mode {
        case .effects:
            CallEffectsModeControls(callManager: callManager, onExit: exitMode)
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
