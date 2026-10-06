import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le bas de la capture** (#9351, spec § 3.1 / § 3.2) : les crans du zoom, la
/// bande ou la seule miniature choisie — qui sert de déclencheur —, le cadenas à
/// DROITE, la phrase du geste ; le rail vertical au-dessus, à gauche.
///
/// **Pendant l'enregistrement, seule la miniature choisie reste** (décision
/// porteur 2026-10-05), avec le direct, son point rouge et son chrono, et le
/// cadenas tant que la prise n'est pas verrouillée : le zoom passe au glissé
/// vertical, la phrase se tait, le rail s'efface et se désactive. Un look figé
/// par des segments en attente garde le rail visible mais DÉSACTIVÉ, et
/// VoiceOver le dit.
struct ComposerCaptureBottomRow: View {
    @ObservedObject var session: ComposerCaptureSession
    let context: ComposerCaptureGestureContext

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var capture: ComposerSceneCameraBar.Capture { session.barCapture }

    private var recording: Bool { session.stage == .recording }

    private var showsLock: Bool {
        ComposerCaptureHold.showsLock(stage: session.stage, holding: capture.holding, locked: capture.locked)
    }

    /// La table dit si le rail ouvre une famille ; sinon il reste là, éteint.
    private var railEnabled: Bool {
        ComposerCaptureGesture.action(zone: .rail, gesture: .tap, context: context) == .openFamily
    }

    var body: some View {
        VStack(spacing: MeeshySpacing.sm) {
            if !recording { zoom }
            ZStack {
                ComposerLookStrip(session: session, source: session.camera.liveFeed, context: context,
                                  recordingTime: session.camera.recordingDuration)
                HStack {
                    Spacer(minLength: 0)
                    if showsLock {
                        ComposerCaptureLockTrack(progress: capture.lockProgress)
                            .padding(.trailing, MeeshySpacing.mdPlus)
                    }
                }
                .environment(\.layoutDirection, .leftToRight)
            }
            if !recording {
                Text(showsLock ? ComposerSceneCameraCopy.lockHint
                               : ComposerSceneCameraCopy.hint(mode: session.mode ?? .photo, stage: session.stage))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.85))
                    .shadow(color: .black.opacity(0.6), radius: 3, y: 1)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.75)
                    .padding(.horizontal, MeeshySpacing.mdPlus)
                    .accessibilityHidden(true)
            }
        }
        .padding(.bottom, MeeshySpacing.lg)
        .overlay(alignment: .bottomLeading) {
            ComposerLookRail(open: session.openFamily) { famille in session.toggleFamily(famille) }
                .disabled(!railEnabled)
                .opacity(recording ? 0 : (railEnabled ? 1 : 0.4))
                .padding(.leading, MeeshySpacing.mdPlus)
                .padding(.bottom, ComposerLookStripRule.cellSize.height + MeeshySpacing.xxxl * 2)
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: showsLock)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: recording)
        .animation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.85), value: session.openFamily)
    }

    @ViewBuilder
    private var zoom: some View {
        if capture.zoomPresets.count > 1 {
            ComposerCaptureZoomPresets(factor: capture.zoomFactor, presets: capture.zoomPresets,
                                       onSelect: { session.controls.setZoom($0) })
        } else if ComposerCaptureZoom.showsBadge(capture.zoomFactor) {
            ComposerCaptureZoomChip(factor: capture.zoomFactor, onStep: { session.stepZoom(up: $0) })
        }
    }
}
