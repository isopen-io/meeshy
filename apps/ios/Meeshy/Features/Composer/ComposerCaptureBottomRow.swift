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
/// **En édition, les outils gardent la colonne du viseur** (#18638, qui retourne la rangée
/// de #9567) : « Effets » (#18639), « Recadrer », « Texte » et, pour une
/// vidéo, « Couper » et « Son », en colonne en bas à gauche, sur la prise ; sous elle les
/// panneaux des outils ACTIFS — le spectre du son, la piste de découpe (#9353) —, ou la bande
/// ouverte (ses miniatures se peignent sur le média retouché), qui les replie.
/// Ni miniature seule, ni zoom, ni phrase du geste ; « Terminé » est en haut,
/// aligné sur la croix.
struct ComposerCaptureBottomRow: View {
    @ObservedObject var session: ComposerCaptureSession
    let context: ComposerCaptureGestureContext
    /// Le rail au repos retombe avec la rangée haute (CAM-8).
    var railOpacity: Double = 1

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Les entrées de scène, posées par le composer seul (#17432).
    @Environment(\.composerViewfinderSceneEntry) private var sceneEntry
    /// Le cadenas qui se ferme, élastique, avant de partir (#9753).
    @State private var lockSeal = ComposerLockSeal()
    /// Le tri de la bande ouverte (#17267), partagé par la bande et ses puces.
    @State private var lookFilter = ComposerLookStripFilter()

    private var capture: ComposerSceneCameraBar.Capture { session.barCapture }

    private var recording: Bool { session.stage == .recording }

    private var editing: Bool { session.phase.isEditing }

    /// Ce que les miniatures peignent : le média retouché, l'objectif sinon.
    private var source: any ComposerFrameSourcing {
        session.editSource ?? session.camera.liveFeed
    }

    /// La colonne de scène du viseur (#17432) — vide sans composer derrière.
    private var sceneEntries: [ComposerViewfinderEntry] {
        ComposerViewfinderColumn.entries(composesScene: sceneEntry != nil, context: context)
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
            try? await Task.sleep(for: .seconds(duree))
            guard !Task.isCancelled else { return }
            lockSeal.finish(scellement)
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: recording)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: editing)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: ComposerCaptureGesture.offersRail(context))
        .animation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.85), value: session.openFamily)
        .adaptiveOnChange(of: session.openFamily) { avant, apres in
            lookFilter = lookFilter.following(open: avant, to: apres)
        }
        .animation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.85), value: session.editPanels)
    }

    private var captureRow: some View {
        VStack(spacing: MeeshySpacing.sm) {
            if !recording { zoom }
            ZStack {
                ComposerLookStrip(session: session, source: source, context: context,
                                  recordingTime: session.camera.recordingDuration, filter: lookFilter)
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
            .overlay(alignment: .bottomLeading) {
                VStack(alignment: .leading, spacing: ComposerLookStripRule.spacing) {
                    // **Galerie · Texte · Fond · Stickers AVANT « Effets »** (#17432, #18639).
                    ComposerViewfinderColumnView(entries: sceneEntries) { sceneEntry?($0) }
                    if ComposerViewfinderColumn.separatesLooks(sceneEntries: sceneEntries,
                                                               offersLooks: ComposerCaptureGesture.offersRail(context)) {
                        ComposerViewfinderRailSeparator()
                    }
                    if ComposerCaptureGesture.offersRail(context) {
                        ComposerLookRail(open: session.openFamily != nil) {
                            session.toggleFamily(ComposerLookStripRule.railFamily)
                        }
                        .transition(.opacity)
                    }
                }
                .opacity(railOpacity)
                .padding(.leading, MeeshySpacing.mdPlus)
                .padding(.bottom, ComposerLookStripRule.railBottomInset)
            }
            if session.openFamily != nil && ComposerCaptureGesture.offersRail(context) {
                lookChips
            }
        }
        .padding(.bottom, MeeshySpacing.lg)
    }

    /// **Les puces qui trient la bande ouverte, juste sous elle** (#17267) :
    /// Tout · Filtres · Cadres · Effets image · Effets visage, puis les ambiances.
    private var lookChips: some View {
        ComposerLookFilterChips(filter: lookFilter) { lookFilter = $0 }
            .transition(.opacity)
    }

    /// **Au bas de la retouche : la colonne des outils, puis les panneaux** (#18638,
    /// #9754) — « Effets », « Recadrer », « Texte », « Couper »,
    /// « Son » à gauche : chaque outil se retire ou revient d'un toucher, sans fermer les
    /// autres. Dessous, un panneau par outil ACTIF : la piste de découpe portant le spectre
    /// du son (#10341), ou le spectre seul quand la coupe est retirée. La bande ouverte prend la place de tout cela,
    /// sa bande au niveau de son rail (#10311).
    private var editTools: some View {
        VStack(spacing: ComposerEditScene.gap) {
            if session.openFamily != nil {
                familyRow
            } else {
                editPanelsAndTools
            }
        }
        .padding(.bottom, ComposerEditScene.gap)
    }

    @ViewBuilder
    private var editPanelsAndTools: some View {
        ComposerEditRailGate(board: session.retouchTexts) { editRail }
        ForEach(session.editPanels, id: \.self) { panneau in
            switch panneau {
            case .trim:
                if let trimClip {
                    // **Le son se pose PAR-DESSUS la bande vidéo** (#10341) :
                    // spectre et volume quand « Son » est actif, sans réserver
                    // de hauteur (#10356). Le bouton du son, lui, est monté sur
                    // la scène, à côté de la lecture.
                    ComposerTrimTrack(session: session, url: trimClip.url, duration: trimClip.duration)
                        .overlay(alignment: .bottom) {
                            if session.takeHasAudio, session.shownEditTools.contains(.sound) {
                                ComposerSoundTrack(session: session, url: trimClip.url, overlaid: true)
                                    .padding(.horizontal, ComposerTrimTrack.trackInset)
                            }
                        }
                        .transition(.opacity)
                }
            case .sound:
                // Seul quand la coupe est retirée : il garde alors sa piste.
                if let trimClip {
                    mediaTrack { ComposerSoundTrack(session: session, url: trimClip.url) }
                }
            case .presets, .band, .none:
                // Les proportions flottent sur le cadre (`ComposerEditPresetsLayout`).
                EmptyView()
            }
        }
    }

    /// **La colonne du viseur, gardée après la prise** (#18638, #18654, porteur 2026-11-15) :
    /// Galerie · Texte · Stickers · Son, un trait, Effets · Recadrer · Couper, en bas à gauche,
    /// posés SUR la prise comme le rail de la capture — plus de rangée en bas.
    private var editRail: some View {
        ComposerLookRail(open: session.openFamily != nil,
                         items: ComposerRetouchRail.items(composesScene: sceneEntry != nil, tools: session.editTools),
                         shownTools: session.shownEditTools, onTool: { session.toggleEditTool($0) },
                         onScene: { sceneEntry?($0) }) {
            session.toggleFamily(ComposerLookStripRule.railFamily)
        }
        .padding(.leading, MeeshySpacing.mdPlus)
        .padding(.bottom, ComposerEditScene.railBottomInset(framed: session.editFramesScene))
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// **La bande ouverte, au niveau de son rail** (#10311) : « Effets » à gauche,
    /// la bande à sa droite — jamais un panneau qui flotte au-dessus des outils.
    /// Retoucher « Effets » rend les outils.
    private var familyRow: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: MeeshySpacing.sm) {
                // Le haut de « Effets » sur le haut des cases (#10339).
                ComposerLookRail(open: session.openFamily != nil) {
                    session.toggleFamily(ComposerLookStripRule.railFamily)
                }
                .padding(.leading, MeeshySpacing.mdPlus)
                .padding(.top, ComposerTriggerOutline.outset)
                ComposerLookStrip(session: session, source: source, context: context, recordingTime: 0,
                                  filter: lookFilter)
            }
            lookChips
        }
        .frame(height: ComposerEditScene.familyRow)
        .transition(.opacity)
    }

    /// Une piste du temps seule — le spectre quand la coupe est retirée. Le
    /// bouton muet n'est plus à côté d'elle : il est sur la scène (#10356).
    private func mediaTrack<Track: View>(@ViewBuilder _ track: () -> Track) -> some View {
        track()
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

/// **La phrase du geste, centrée sur la scène** (A8, #17109 : « Touchez deux
/// fois pour une photo · maintenez pour filmer »). Elle se tait pendant la
/// prise et la retouche, sous un cadre, dont le bas porte sa propre écriture
/// (#9557), bande ouverte, dont les noms des cases prennent sa place (#18639), et dès
/// qu'une prise a été faite (#16482). Elle ne prend aucun doigt : la scène
/// sous elle vise et photographie.
struct ComposerCaptureGestureHint: View {
    @ObservedObject var session: ComposerCaptureSession

    /// La phrase du geste a servi : une prise a été faite (#16482).
    @AppStorage(ComposerShutterFeedback.hintSeenKey) private var hintSeen = false

    private var recording: Bool { session.stage == .recording }

    private var showsHint: Bool {
        ComposerShutterFeedback.showsHint(
            base: !recording && !session.phase.isEditing && session.look.frame == ComposerPhotoFrame.none
                && session.openFamily == nil,
            hasTakenAPhoto: hintSeen)
    }

    private var showsLock: Bool {
        let capture = session.barCapture
        return ComposerCaptureHold.showsLock(stage: session.stage, holding: capture.holding, locked: capture.locked)
    }

    var body: some View {
        ZStack {
            if showsHint {
                Text(showsLock ? ComposerSceneCameraCopy.lockHint
                               : ComposerSceneCameraCopy.hint(mode: session.mode ?? .photo, stage: session.stage))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.6), radius: 4, y: 1)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
                    .minimumScaleFactor(0.75)
                    .padding(.horizontal, MeeshySpacing.xl)
                    .transition(.opacity)
                    .accessibilityHidden(true)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .allowsHitTesting(false)
        .animation(.easeOut(duration: 0.2), value: showsHint)
        .adaptiveOnChange(of: session.camera.shutterPresses) { _, _ in hintSeen = true }
        .adaptiveOnChange(of: recording) { _, enregistre in if enregistre { hintSeen = true } }
    }
}

/// **« Annuler », à la place de « Terminé », pendant le recadrage** (porteur 2026-11-15, #18654) :
/// il rend le format et le cadrage d'avant l'outil et le range. Fermer l'outil les garde.
struct ComposerCropCancelButton: View {
    @ObservedObject var session: ComposerCaptureSession
    /// Le recadrage qu'on avait en ouvrant l'outil, tenu tant qu'il est actif.
    @State private var before: ComposerCropSnapshot?

    private var cropActive: Bool { session.activeEditTools.contains(.crop) }

    var body: some View {
        ZStack { button }
            .onAppear { hold(cropActive) }
            .adaptiveOnChange(of: cropActive) { _, actif in hold(actif) }
    }

    private func hold(_ active: Bool) {
        before = ComposerCropSnapshot.held(before, cropActive: active, current: ComposerCropFlow.snapshot(of: session))
    }

    @ViewBuilder
    private var button: some View {
        if ComposerCropSnapshot.offersCancel(shownTools: session.shownEditTools), !session.isRenderingLook {
            Button { ComposerCropFlow.cancel(before, in: session) } label: {
                Text(ComposerCaptureCopy.cancelCrop)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .frame(minHeight: 40)
                    .adaptiveLiquidGlass(in: Capsule())
                    .frame(minHeight: MeeshyControlSize.tapTarget)
            }
            .buttonStyle(ComposerBounceButtonStyle())
            .accessibilityLabel(ComposerCaptureCopy.cancelCropLabel)
            .accessibilityIdentifier("composer.capture.crop.cancel")
            .padding(.trailing, MeeshySpacing.mdPlus)
            .padding(.top, MeeshySpacing.md)
            .transition(.opacity)
        }
    }
}

/// **La colonne cède à la barre du texte** (#18638) : pendant qu'un texte de la retouche se
/// saisit, sa barre de style prend le bas — comme au viseur, où le rail se retire à la frappe.
struct ComposerEditRailGate<Rail: View>: View {
    @ObservedObject var board: ComposerRetouchTextBoard
    @ViewBuilder let rail: Rail

    var body: some View {
        if ComposerViewfinderScene.servesCaptureControls(typing: board.typingId != nil) {
            rail.transition(.opacity)
        }
    }
}

/// **Les entrées de scène du viseur** (#17432) : un glyphe et son nom, comme les
/// familles de look qu'elles précèdent ; 44 pt, nommées à VoiceOver.
struct ComposerViewfinderColumnView: View {
    let entries: [ComposerViewfinderEntry]
    let onSelect: (ComposerViewfinderEntry) -> Void

    var body: some View {
        if !entries.isEmpty {
            VStack(alignment: .leading, spacing: ComposerLookStripRule.spacing) {
                ForEach(entries, id: \.self) { entree in
                    Button { onSelect(entree) } label: {
                        HStack(spacing: MeeshySpacing.xs) {
                            Image(systemName: entree.symbol)
                                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                            Text(ComposerViewfinderColumn.label(entree))
                                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                        }
                        .foregroundStyle(.white)
                        .shadow(color: .black.opacity(0.6), radius: 3, y: 1)
                        .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget,
                               alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(ComposerBounceButtonStyle())
                    .accessibilityLabel(ComposerViewfinderColumn.label(entree))
                    .accessibilityIdentifier(entree.accessibilityIdentifier)
                }
            }
            .transition(.opacity)
        }
    }
}

/// Le trait du rail bas gauche entre Texte · Fond · Galerie · Sticker et les looks (planche, vue A8).
struct ComposerViewfinderRailSeparator: View {
    var body: some View {
        Rectangle()
            .fill(Color.white.opacity(0.35))
            .frame(width: MeeshyControlSize.tapTarget, height: 1)
            .accessibilityHidden(true)
    }
}

/// **Qui reçoit une entrée de scène du viseur** (#17432) : le composer la pose sur
/// son montage ; la caméra de conversation n'en pose pas, et n'a pas de colonne.
private struct ComposerViewfinderSceneEntryKey: EnvironmentKey {
    static let defaultValue: (@MainActor (ComposerViewfinderEntry) -> Void)? = nil
}

extension EnvironmentValues {
    var composerViewfinderSceneEntry: (@MainActor (ComposerViewfinderEntry) -> Void)? {
        get { self[ComposerViewfinderSceneEntryKey.self] }
        set { self[ComposerViewfinderSceneEntryKey.self] = newValue }
    }
}
