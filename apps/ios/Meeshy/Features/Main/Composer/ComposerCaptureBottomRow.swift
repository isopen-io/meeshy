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
/// vertical, la phrase se tait, le rail disparaît. Un look figé par des
/// segments en attente le retire aussi (porteur 2026-10-07, #9576) : un rail
/// qu'on ne peut pas ouvrir n'est montré ni à l'œil ni à VoiceOver, et il
/// revient dès que les segments sont supprimés.
///
/// **En édition, les outils seuls, sous la scène posée sur le sol** (#9352,
/// porteur 2026-10-07, #9567) : « Filtres », « Cadres », « Recadrer », en
/// rangée, et au-dessus d'eux UN panneau — la bande ouverte (ses miniatures se
/// peignent sur le média retouché), les proportions par presets, ou, pour une
/// vidéo, sa piste de découpe (#9353). Ni miniature seule, ni zoom, ni phrase
/// du geste ; « Terminé » est en haut, aligné sur la croix.
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

    /// La phrase du geste se tait pendant la prise et la retouche, sous un
    /// cadre, dont le bas porte sa propre écriture (#9557) — et bande ouverte,
    /// où le nom du choix prend sa place (#9566).
    private var showsHint: Bool {
        !recording && !editing && session.look.frame == ComposerPhotoFrame.none && session.openFamily == nil
    }

    var body: some View {
        Group {
            if editing { editTools } else { captureRow }
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: showsLock)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: recording)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: editing)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: ComposerCaptureGesture.offersRail(context))
        .animation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.85), value: session.openFamily)
        .animation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.85), value: session.editPanel)
    }

    private var captureRow: some View {
        VStack(spacing: MeeshySpacing.sm) {
            if !recording { zoom }
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
            if ComposerCaptureGesture.offersRail(context) {
                ComposerLookRail(open: session.openFamily) { famille in session.toggleFamily(famille) }
                    .padding(.leading, MeeshySpacing.mdPlus)
                    .padding(.bottom, ComposerLookStripRule.cellSize.height + MeeshySpacing.xxxl * 2)
                    .transition(.opacity)
            }
        }
    }

    /// **Sous la scène de retouche : un panneau, puis les outils** (#9567) —
    /// la piste de découpe d'une vidéo, la bande ouverte ou les proportions ;
    /// puis « Filtres », « Cadres », « Recadrer », et rien d'autre.
    private var editTools: some View {
        VStack(spacing: ComposerEditScene.gap) {
            switch session.editPanel {
            case .trim:
                if let trimClip {
                    ComposerTrimTrack(session: session, url: trimClip.url, duration: trimClip.duration)
                        .transition(.opacity)
                }
            case .band:
                ComposerLookStrip(session: session, source: source, context: context, recordingTime: 0)
                    .transition(.opacity)
            case .presets:
                ComposerCropPresetBar(selected: session.cropPreset) { session.applyCropPreset($0) }
                    .transition(.opacity)
            case .none:
                EmptyView()
            }
            ComposerLookRail(open: session.openFamily, axis: .horizontal, cropOpen: session.cropPresetsOpen,
                             onCrop: { session.toggleCropPresets() }) { famille in session.toggleFamily(famille) }
                .frame(height: ComposerEditScene.toolsRow)
        }
        .padding(.bottom, ComposerEditScene.gap)
    }

    /// Les crans sont ceux de l'OBJECTIF.
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
