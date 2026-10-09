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
/// porteur 2026-10-07, #9567, 2026-10-09 #9754) : « Filtres », « Cadres »,
/// « Recadrer » et, pour une vidéo, « Couper » et « Son », en rangée ; au-dessus
/// d'eux UN panneau, celui de l'outil ouvert — la bande (ses miniatures se
/// peignent sur le média retouché), les proportions, la piste de découpe
/// (#9353) ou le spectre du son. Ni miniature seule, ni zoom, ni phrase
/// du geste ; « Terminé » est en haut, aligné sur la croix.
struct ComposerCaptureBottomRow: View {
    @ObservedObject var session: ComposerCaptureSession
    let context: ComposerCaptureGestureContext

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Le cadenas qui se ferme, élastique, avant de partir (#9753).
    @State private var lockSeal = ComposerLockSeal()

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

    private var showsLockTrack: Bool {
        ComposerLockSeal.showsTrack(showsLock: showsLock, seal: lockSeal)
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
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: showsLockTrack)
        .adaptiveOnChange(of: capture.locked) { avant, apres in
            let affiche = ComposerCaptureHold.showsLock(stage: session.stage, holding: capture.holding, locked: false)
            lockSeal.lockChanged(from: avant, to: apres, wasShowing: affiche)
        }
        .task(id: lockSeal.generation) { @MainActor in
            guard lockSeal.sealing else { return }
            let scellement = lockSeal.generation
            let duree = ComposerLockSeal.holdDuration(reduceMotion: reduceMotion)
            try? await Task.sleep(nanoseconds: UInt64(duree * 1_000_000_000))
            guard !Task.isCancelled else { return }
            lockSeal.finish(scellement)
        }
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
                    if showsLockTrack {
                        ComposerCaptureLockTrack(progress: lockSeal.sealing ? 1 : capture.lockProgress,
                                                 sealed: lockSeal.sealing)
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

    /// **Sous la scène de retouche : un panneau, puis les outils** (#9567,
    /// #9754) — la piste de découpe ou le spectre du son d'une vidéo, flanqués
    /// à DROITE du bouton muet ; la bande ouverte ; ou les proportions. Puis
    /// « Filtres », « Cadres », « Recadrer », « Couper », « Son » : chaque outil
    /// affiche ou masque sa surface.
    private var editTools: some View {
        VStack(spacing: ComposerEditScene.gap) {
            switch session.editPanel {
            case .trim:
                if let trimClip {
                    mediaTrack { ComposerTrimTrack(session: session, url: trimClip.url, duration: trimClip.duration) }
                }
            case .sound:
                if let trimClip {
                    mediaTrack { ComposerSoundTrack(session: session, url: trimClip.url) }
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
            ComposerLookRail(open: session.openFamily, axis: .horizontal, editTools: session.editTools,
                             openTool: session.editTool, onTool: { session.toggleEditTool($0) }) { famille in
                session.toggleFamily(famille)
            }
            .frame(height: ComposerEditScene.toolsRow)
        }
        .padding(.bottom, ComposerEditScene.gap)
    }

    /// Une piste de la prise, et le bouton muet à sa DROITE quand elle a un son.
    private func mediaTrack<Track: View>(@ViewBuilder _ track: () -> Track) -> some View {
        HStack(spacing: MeeshySpacing.xs) {
            track()
            if ComposerEditTools.offersMuteSwitch(panel: session.editPanel, hasAudio: session.takeHasAudio) {
                ComposerTakeMuteButton(muted: session.takeSound.muted) { session.toggleTakeMute() }
                    .padding(.trailing, MeeshySpacing.sm)
            }
        }
        .environment(\.layoutDirection, .leftToRight)
        .transition(.opacity)
    }

    /// Les crans sont ceux de l'OBJECTIF ; pendant sa bascule, ils morphent (#9753).
    private var zoom: some View {
        ComposerCaptureZoomBar(factor: capture.zoomFactor, presets: capture.zoomPresets,
                               switching: capture.switchingCamera,
                               onSelect: { session.controls.setZoom($0) },
                               onStep: { session.stepZoom(up: $0) })
    }
}
