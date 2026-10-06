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
///
/// **En édition, la même rangée, et un seul ajout : ✓ « Terminé »** (#9352,
/// spec § 3.3). Les crans du zoom — ceux de l'objectif, qui se repose — lui
/// laissent leur place, au-dessus de la bande qu'il ne recouvre donc jamais ;
/// les miniatures se peignent sur le média retouché ; la phrase du geste, qui
/// parle de prises, se tait.
///
/// **Une vidéo retouchée reçoit sa piste de découpe** (#9353, spec § 3.3),
/// AU-DESSUS du rail et de la bande : elle se monte dans le couloir du rail, en
/// tête, sur toute la largeur — le rail ne bouge pas, « Terminé » non plus.
struct ComposerCaptureBottomRow: View {
    @ObservedObject var session: ComposerCaptureSession
    let context: ComposerCaptureGestureContext

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var capture: ComposerSceneCameraBar.Capture { session.barCapture }

    private var recording: Bool { session.stage == .recording }

    private var editing: Bool { session.phase.isEditing }

    /// Ce que les miniatures peignent : le média retouché, l'objectif sinon.
    private var source: any ComposerFrameSourcing {
        session.editSource ?? session.camera.liveFeed
    }

    private var showsLock: Bool {
        ComposerCaptureHold.showsLock(stage: session.stage, holding: capture.holding, locked: capture.locked)
    }

    /// La vidéo en retouche et la durée de sa boucle ; `nil` ⇒ pas de piste.
    private var trimClip: (url: URL, duration: TimeInterval)? {
        guard case .editing(.video(let url)) = session.phase, let lecteur = session.loopPlayer else { return nil }
        return (url, lecteur.duration)
    }

    /// La phrase du geste se tait pendant la prise et la retouche — et sous un
    /// cadre, dont le bas porte sa propre écriture (#9557).
    private var showsHint: Bool {
        !recording && !editing && session.look.frame == ComposerPhotoFrame.none
    }

    /// La table dit si le rail ouvre une famille ; sinon il reste là, éteint.
    private var railEnabled: Bool {
        ComposerCaptureGesture.action(zone: .rail, gesture: .tap, context: context) == .openFamily
    }

    var body: some View {
        VStack(spacing: MeeshySpacing.sm) {
            if !recording { zoom }
            if editing { done }
            ZStack {
                ComposerLookStrip(session: session, source: source, context: context,
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
            if showsHint {
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
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                if let trimClip {
                    ComposerTrimTrack(session: session, url: trimClip.url, duration: trimClip.duration)
                        .transition(.opacity)
                }
                ComposerLookRail(open: session.openFamily) { famille in session.toggleFamily(famille) }
                    .disabled(!railEnabled)
                    .opacity(recording ? 0 : (railEnabled ? 1 : 0.4))
                    .padding(.leading, MeeshySpacing.mdPlus)
            }
            .padding(.bottom, ComposerLookStripRule.cellSize.height + MeeshySpacing.xxxl * 2)
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: showsLock)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: recording)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: editing)
        .animation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.85), value: session.openFamily)
    }

    /// Les crans sont ceux de l'OBJECTIF : en édition, il se repose.
    @ViewBuilder
    private var zoom: some View {
        if !editing {
            if capture.zoomPresets.count > 1 {
                ComposerCaptureZoomPresets(factor: capture.zoomFactor, presets: capture.zoomPresets,
                                           onSelect: { session.controls.setZoom($0) })
            } else if ComposerCaptureZoom.showsBadge(capture.zoomFactor) {
                ComposerCaptureZoomChip(factor: capture.zoomFactor, onStep: { session.stepZoom(up: $0) })
            }
        }
    }

    /// **✓ Terminé**, du côté où la lecture finit. Pendant le rendu il attend, et
    /// le dit : un second toucher ne remet rien.
    private var done: some View {
        HStack {
            Spacer(minLength: 0)
            Button {
                HapticFeedback.light()
                session.finishEditing()
            } label: {
                Label(ComposerCaptureCopy.done, systemImage: "checkmark")
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .frame(minHeight: MeeshyControlSize.tapTarget)
                    .adaptiveGlassProminent(in: Capsule(), tint: MeeshyColors.indigo500)
                    .opacity(session.isRenderingLook ? 0.5 : 1)
            }
            .buttonStyle(.plain)
            .disabled(session.isRenderingLook)
            .accessibilityLabel(ComposerCaptureCopy.done)
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .transition(.opacity)
    }
}
