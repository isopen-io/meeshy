import AVFoundation
import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Les contrôles du viseur vivent DANS la scène, et le mode se lit du GESTE**
/// (#4080, vue `2b` — directive porteur 2026-09-04).
///
/// > « Les contrôles sont apparus mais hors de la zone scène alors que tout
/// > doit être dans la scène ! Et la gestion photo vidéo ou mains libres se
/// > fait par la gestuelle uniquement et non des boutons disponibles. »
///
/// ## Deux corrections, et la première renverse une doctrine
///
/// **La géographie.** Le lot précédent posait cette barre dans le couloir bas
/// du plateau, au nom de la loi 6 — « aucun contrôle sur le canvas, le player
/// EST l'aperçu ». C'était une mauvaise lecture : cette loi protège l'APERÇU
/// d'une composition, pour qu'il ne mente pas sur le rendu. Un VISEUR n'est pas
/// un aperçu de composition — c'est un instrument de cadrage, et son chrome ne
/// part avec aucune publication. La planche `2b` le dessine d'ailleurs
/// par-dessus l'image, et le porteur le confirme.
///
/// **Le geste.** Trois pastilles à choisir AVANT de déclencher demandaient une
/// décision avant l'intention. Le geste la lit APRÈS — appuyer prend, tenir
/// filme, remonter verrouille — ce qui est l'ordre dans lequel elle vient. Les
/// seuils vivent dans `ComposerShutterGesture`, hors du corps de cette vue.
struct ComposerSceneCameraBar: View {

    let stage: ComposerSceneCameraStage
    let mode: ComposerSceneCameraMode

    /// Un appui bref : une photo.
    let onPhoto: () -> Void
    /// Le doigt a tenu : la prise commence.
    let onStartFilming: () -> Void
    /// Le doigt a remonté sans relâcher : la prise continue sans lui.
    let onLock: () -> Void
    /// La prise se clôt — relâchement d'une prise tenue, ou appui sur une
    /// prise verrouillée.
    let onCloseTake: () -> Void

    let flashMode: AVCaptureDevice.FlashMode
    let onCycleFlash: () -> Void
    let onFlipCamera: () -> Void
    let onDisarm: () -> Void

    /// La taille courante, et ce qu'un appui sur `[ ]` produit. La règle
    /// (`ComposerSceneCameraSize`) décide du glyphe et de qui montre la croix ;
    /// cette vue peint.
    let size: ComposerSceneCameraSize
    let onToggleSize: () -> Void

    let segments: [ComposerCaptureSegment]
    let onDropLastSegment: () -> Void
    let onValidateSegments: () -> Void

    /// **La durée de la prise EN COURS**, remise par le meuble depuis
    /// `CameraModel.recordingDuration`.
    ///
    /// Elle est distincte des `segments` parce qu'elle n'a pas la même NATURE :
    /// un segment est une prise CLOSE, avec un fichier et une durée arrêtée ;
    /// ceci est une horloge qui court. Les additionner est la règle
    /// (`ComposerCaptureSegments.elapsed`), et la barre ne fait que l'appeler —
    /// le « + » écrit ici n'aurait été éprouvable qu'en montant une vue.
    var liveDuration: TimeInterval = 0

    /// **Ce que l'HÔTE sait du doigt et de la lumière** (#8671) : l'appui long
    /// de la scène commence AVANT que cette barre existe, donc son cadenas,
    /// son zoom et l'intensité du flash lui sont remis d'en haut.
    struct Capture: Equatable {
        var holding = false
        var lockProgress: Double = 0
        var locked = false
        var zoomFactor: CGFloat = 1
        var flashIntensity: Double = ComposerFlashIntensity.defaultLevel
    }

    var capture = Capture()
    /// La course verticale du doigt pendant une prise — le zoom.
    var onZoomDrag: (CGFloat) -> Void = { _ in }
    var onZoomDragEnded: () -> Void = {}
    /// Un pas de zoom VoiceOver : `true` rapproche.
    var onZoomStep: (Bool) -> Void = { _ in }
    var onFlashIntensity: (Double) -> Void = { _ in }
    var onShutterTouched: () -> Void = {}

    /// L'instant du poser de doigt. `nil` ⇒ aucun doigt. C'est lui qui fait la
    /// différence entre une photo et une prise, et il ne peut pas vivre
    /// ailleurs : la vue est le seul endroit qui voit le doigt.
    /// La pulsation du témoin d'enregistrement. Elle vit dans la vue parce
    /// qu'elle ne décrit RIEN du modèle : c'est une animation, et une animation
    /// rangée dans l'état métier se rejoue à chaque changement de ce dernier.
    /// **Reduce Motion coupe le battement, jamais le témoin** (dimension 5 du
    /// `CLAUDE.md` racine). Une boucle sans fin doit choisir : se taire, ou se
    /// poser sur une valeur qui DIT encore ce que le mouvement disait. Ici le
    /// point rouge PLEIN le dit déjà — c'est sa couleur qui porte « ça
    /// enregistre », le battement ne faisait que le rendre impossible à
    /// confondre avec un état figé.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var recordingBlink: Double = 1

    @State private var pressedAt: Date?
    @State private var locked = false
    @State private var holdTask: Task<Void, Never>?
    /// Où en est le glissement vers le verrou, de 0 à 1. Rendu pendant le
    /// geste : la directive du 2026-08-30 veut qu'un glissement se VOIE
    /// pendant qu'il se fait, et reste annulable jusqu'au bout.
    @State private var lockProgress: Double = 0

    var body: some View {
        VStack(spacing: 0) {
            topControls
            if !segments.isEmpty { segmentStrip }
            Spacer(minLength: 0)
            shutterRow
            hint
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.top, MeeshySpacing.md)
        .padding(.bottom, MeeshySpacing.lg)
    }

    // MARK: - En tête de la carte

    private var topControls: some View {
        HStack(spacing: MeeshySpacing.sm) {
            flashCluster
            Spacer(minLength: 0)
            // **La croix est TOUJOURS là** (#8653, directive porteur
            // 2026-09-29 : « permettre de quitter à tout moment »), en carte
            // comme en plein écran. Quitter ne perd rien du brouillon.
            glassControl(symbol: "xmark",
                         label: ComposerSceneCameraCopy.disarmLabel,
                         tint: .white,
                         action: onDisarm)
            glassControl(symbol: size.toggleSymbol,
                         label: ComposerSceneCameraCopy.sizeLabel(size),
                         tint: .white,
                         action: onToggleSize)
            glassControl(symbol: "arrow.triangle.2.circlepath.camera",
                         label: ComposerSceneCameraCopy.flipLabel,
                         tint: .white,
                         action: onFlipCamera)
        }
    }

    /// **Le flash et son curseur, dans UNE capsule de verre** (#8671). Le
    /// curseur s'allonge à droite, collé au bouton, quand le flash s'allume, et
    /// se replie quand il s'éteint — la capsule grandit avec lui.
    private var flashCluster: some View {
        HStack(spacing: 0) {
            Button {
                onCycleFlash()
                HapticFeedback.light()
            } label: {
                Image(systemName: ComposerCameraFlash.symbol(for: flashMode))
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    .foregroundStyle(flashMode == .off ? .white.opacity(0.75) : .yellow)
                    .frame(width: 44, height: 44)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(ComposerCameraFlash.label(for: flashMode))
            if ComposerFlashIntensity.showsSlider(flash: flashMode) {
                ComposerFlashIntensitySlider(level: capture.flashIntensity,
                                             onChange: onFlashIntensity)
                    .transition(.move(edge: .leading).combined(with: .opacity))
            }
        }
        .adaptiveGlass(in: Capsule())
        .clipShape(Capsule())
        .animation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.82),
                   value: ComposerFlashIntensity.showsSlider(flash: flashMode))
    }

    /// **Sur du verre, jamais à nu.** Ces contrôles flottent sur une image que
    /// l'objectif choisit : une glyphe blanche posée sur un mur clair
    /// disparaîtrait. Même arbitrage que la description du volet de scène.
    private func glassControl(symbol: String,
                              label: String,
                              tint: Color,
                              action: @escaping () -> Void) -> some View {
        Button {
            action()
            HapticFeedback.light()
        } label: {
            Image(systemName: symbol)
                // **Un glyphe de contrôle SUIT le Dynamic Type.** `.system(size:)`
                // le fige : à la plus grande taille système, la rangée du viseur
                // resterait minuscule pendant que tout le reste grandit — et une
                // cible de 40 pt avec un glyphe de 15 pt est illisible pour qui
                // a besoin de la grande taille.
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 40, height: 40)
                .adaptiveGlass(in: Circle())
                .contentShape(Circle().inset(by: -2))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    // MARK: - La bande des segments (#4099, vue `4b`)

    private var segmentStrip: some View {
        VStack(spacing: MeeshySpacing.xsPlus) {
            GeometryReader { geo in
                HStack(spacing: MeeshySpacing.xxs) {
                    ForEach(Array(zip(segments, ComposerCaptureSegments.shares(segments))),
                            id: \.0.id) { segment, part in
                        Capsule()
                            .fill(segment.id == segments.last?.id
                                  ? MeeshyColors.error : Color.white.opacity(0.8))
                            .frame(width: max(2, geo.size.width * part - 2))
                    }
                }
            }
            .frame(height: 3)

            HStack(spacing: MeeshySpacing.sm) {
                HStack(spacing: 5) {
                    // **Le témoin d'enregistrement BAT.** Un point rouge fixe
                    // ne distingue pas « ça tourne » de « il y a des segments »
                    // — et c'est précisément la confusion que le chrono figé
                    // entretenait.
                    Circle()
                        .fill(MeeshyColors.error)
                        .frame(width: 6, height: 6)
                        .opacity(stage == .recording && !reduceMotion ? recordingBlink : 1)
                        .animation(stage == .recording && !reduceMotion
                                   ? .easeInOut(duration: 0.55).repeatForever(autoreverses: true)
                                   : .default,
                                   value: recordingBlink)
                        .onAppear { if !reduceMotion { recordingBlink = 0.25 } }
                    Text(LocalizedNumber.duration(
                        seconds: ComposerCaptureSegments.elapsed(
                            segments: segments,
                            live: liveDuration,
                            recording: stage == .recording)))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold, design: .monospaced))
                        .foregroundStyle(.white)
                }
                .padding(.horizontal, 9)
                .frame(height: 24)
                .adaptiveGlass(in: Capsule())

                Text(ComposerSceneCameraCopy.segmentCount(segments.count))
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .bold))
                    .foregroundStyle(.white.opacity(0.85))

                Spacer(minLength: 4)

                glassControl(symbol: "delete.left",
                             label: ComposerSceneCameraCopy.dropSegmentLabel,
                             tint: .white.opacity(0.9),
                             action: onDropLastSegment)
                if ComposerCaptureSegments.canValidate(segments) {
                    glassControl(symbol: "checkmark",
                                 label: ComposerSceneCameraCopy.validateLabel,
                                 tint: .white,
                                 action: onValidateSegments)
                }
            }
        }
        .padding(.top, MeeshySpacing.smPlus)
    }

    // MARK: - Le déclencheur — un seul, trois intentions

    /// **Le déclencheur et la PISTE de verrouillage, sur une rangée.**
    ///
    /// La piste ne paraît que pendant une prise non verrouillée — hors de ce
    /// moment elle n'a rien à dire, et un rail permanent laisserait croire à
    /// une commande qu'on peut presser.
    /// Verrouillée par ce déclencheur OU par l'appui long de la scène (#8671).
    private var isLocked: Bool { locked || capture.locked }

    private var showsLock: Bool {
        ComposerCaptureHold.showsLock(stage: stage, holding: capture.holding, locked: isLocked)
    }

    /// Le déclencheur au CENTRE, fixe : le zoom à sa gauche, le cadenas à sa
    /// droite, chacun dans un emplacement réservé — un cadenas qui paraît ne
    /// déplace pas le bouton sous le doigt.
    private var shutterRow: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            ZStack(alignment: .trailing) {
                Color.clear
                if stage == .recording || ComposerCaptureZoom.showsBadge(capture.zoomFactor) {
                    ComposerCaptureZoomChip(factor: capture.zoomFactor, onStep: onZoomStep)
                        .transition(.opacity)
                }
            }
            .frame(width: Self.sideSlot, height: 44)
            shutter
            ZStack(alignment: .leading) {
                Color.clear
                if showsLock { lockTrack }
            }
            .frame(width: Self.sideSlot, height: 44)
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: showsLock)
    }

    private static let sideSlot: CGFloat = 84

    /// **La clé du verrou** (#8671, directive porteur 2026-09-29 : « ajouter
    /// une clé pour la vidéo permettant de lock la vidéo »). Elle paraît dès
    /// que le doigt tient pour filmer, et se remplit pendant qu'il glisse ; à
    /// 1, le geste bascule et le déclencheur devient le bouton stop.
    private var lockTrack: some View {
        let progres = max(lockProgress, capture.lockProgress)
        return HStack(spacing: MeeshySpacing.xsPlus) {
            // `forward`, jamais `right` : ce chevron montre la direction du
            // GESTE — glisser vers le cadenas pour verrouiller la prise — et
            // en arabe la piste part de l'autre bord. Un côté physique y
            // pointerait à l'opposé du doigt.
            Image(systemName: "chevron.forward")
                .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .bold))
                .foregroundStyle(.white.opacity(0.45 + 0.55 * progres))
            Image(systemName: progres >= 1 ? "lock.fill" : "lock.open.fill")
                .font(MeeshyFont.relative(17, weight: .semibold))
                .foregroundStyle(.white)
                .scaleEffect(reduceMotion ? 1 : 1 + 0.15 * progres)
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .frame(height: 44)
        .adaptiveGlass(in: Capsule())
        .overlay(
            Capsule().strokeBorder(.white.opacity(0.3 + 0.5 * progres), lineWidth: MeeshyBorder.strong)
        )
        .accessibilityHidden(true)
        .transition(.opacity.combined(with: .scale(scale: 0.8, anchor: .leading)))
    }

    private var shutter: some View {
        ZStack {
            Circle()
                .stroke(isLocked ? MeeshyColors.error : .white, lineWidth: 4)
                .frame(width: 76, height: 76)
            if stage == .recording {
                RoundedRectangle(cornerRadius: 7)
                    .fill(MeeshyColors.error)
                    .frame(width: 30, height: 30)
            } else {
                Circle().fill(MeeshyColors.error).frame(width: 62, height: 62)
            }
        }
        .contentShape(Circle().inset(by: -10))
        .gesture(shutterGesture)
        .accessibilityElement()
        .accessibilityLabel(ComposerSceneCameraCopy.shutterLabel(mode: mode, stage: stage))
        .accessibilityAddTraits(.isButton)
        // VoiceOver ne TIENT pas un doigt : sans cette action, la vidéo serait
        // inatteignable au lecteur d'écran — une capacité offerte à la main et
        // refusée à la voix.
        .accessibilityAction(named: Text(ComposerSceneCameraCopy.filmActionLabel)) {
            stage == .recording ? onCloseTake() : onStartFilming()
        }
        // Le verrou, offert à la voix pendant une prise tenue (#8671).
        .accessibilityAction(named: Text(ComposerSceneCameraCopy.lockHint)) {
            guard stage == .recording, !isLocked else { return }
            locked = true
            onLock()
            UIAccessibility.post(notification: .announcement,
                                 argument: ComposerSceneCameraCopy.lockedAnnouncement)
        }
    }

    private var shutterGesture: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { valeur in
                if pressedAt == nil {
                    pressedAt = Date()
                    locked = false
                    // Un doigt sur le déclencheur n'est plus sur la scène :
                    // un appui long dont la levée s'est perdue se clôt ici.
                    onShutterTouched()
                    armHold()
                }
                guard stage == .recording else { return }
                // **Glisser vers le haut zoome, vers le bas dézoome** (#8671),
                // tenu comme verrouillé.
                onZoomDrag(valeur.translation.height)
                guard !locked else { return }
                // **Le geste se montre pendant qu'il se fait** — et revenir en
                // arrière l'annule, ce que la progression rend tout seul en
                // retombant à zéro.
                lockProgress = ComposerShutterGesture.lockProgress(
                    translationX: valeur.translation.width)
                guard ComposerCaptureHold.phase(
                    translation: CGPoint(x: valeur.translation.width, y: valeur.translation.height),
                    wasLocked: false) == .locked else { return }
                locked = true
                lockProgress = 1
                onLock()
                HapticFeedback.medium()
                UIAccessibility.post(notification: .announcement,
                                     argument: ComposerSceneCameraCopy.lockedAnnouncement)
            }
            .onEnded { _ in
                onZoomDragEnded()
                holdTask?.cancel()
                holdTask = nil
                let tenu = pressedAt.map { Date().timeIntervalSince($0) } ?? 0
                pressedAt = nil
                lockProgress = locked ? 1 : 0
                switch ComposerShutterGesture.outcome(heldFor: tenu, locked: locked) {
                case .photo:
                    // Une prise a pu démarrer et le doigt partir avant le seuil
                    // — la course est possible. Ce qui EST en train de s'écrire
                    // prime sur ce que la durée dit.
                    if stage == .recording { onCloseTake() } else { onPhoto() }
                case .closeTake:
                    onCloseTake()
                case .keepFilming:
                    break
                }
            }
    }

    /// **Le maintien se compte au temps, pas au mouvement.** `onChanged` ne
    /// refire que si le doigt BOUGE ; un doigt parfaitement immobile ne
    /// démarrerait jamais la prise. La tâche différée est ce qui rend le geste
    /// possible sans exiger un tremblement.
    private func armHold() {
        holdTask?.cancel()
        holdTask = Task {
            try? await Task.sleep(nanoseconds:
                UInt64(ComposerShutterGesture.holdToFilm * 1_000_000_000))
            guard !Task.isCancelled, pressedAt != nil, stage != .recording else { return }
            onStartFilming()
            HapticFeedback.medium()
        }
    }

    // MARK: - La phrase

    private var hint: some View {
        // Pendant que le doigt tient, la phrase dit le cadenas (#8671).
        Text(showsLock ? ComposerSceneCameraCopy.lockHint
                       : ComposerSceneCameraCopy.hint(mode: mode, stage: stage))
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, design: .monospaced))
            .foregroundStyle(.white.opacity(0.85))
            .shadow(color: .black.opacity(0.6), radius: 3, y: 1)
            .multilineTextAlignment(.center)
            .lineLimit(2)
            .minimumScaleFactor(0.75)
            .padding(.top, MeeshySpacing.smPlus)
            .accessibilityHidden(true)
    }
}

// MARK: - Le curseur d'intensité du flash (#8671)

/// **Le curseur de verre** : une piste que le doigt règle d'un glissé, et que
/// VoiceOver règle d'un balayage — un élément AJUSTABLE, jamais une piste
/// muette. La loi (`ComposerFlashIntensity`) convertit la position en niveau.
struct ComposerFlashIntensitySlider: View {
    let level: Double
    let onChange: (Double) -> Void

    private static let trackWidth: CGFloat = 96
    private static let thumb: CGFloat = 18

    var body: some View {
        let remplissage = CGFloat(ComposerFlashIntensity.fill(level))
        return ZStack(alignment: .leading) {
            Capsule()
                .fill(.white.opacity(0.28))
                .frame(height: 4)
            Capsule()
                .fill(Color.yellow)
                .frame(width: max(Self.thumb / 2, Self.trackWidth * remplissage), height: 4)
            Circle()
                .fill(Color.white)
                .frame(width: Self.thumb, height: Self.thumb)
                .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                .offset(x: (Self.trackWidth - Self.thumb) * remplissage)
        }
        .frame(width: Self.trackWidth, height: 44)
        // La piste se lit toujours du faible au fort dans le sens de la
        // position du doigt : sa géométrie ne se retourne pas en arabe, la
        // capsule qui la porte, si.
        .environment(\.layoutDirection, .leftToRight)
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { valeur in
                    onChange(ComposerFlashIntensity.level(atX: valeur.location.x,
                                                          width: Self.trackWidth))
                }
        )
        .padding(.trailing, MeeshySpacing.mdPlus)
        .accessibilityElement()
        .accessibilityLabel(ComposerSceneCameraCopy.flashIntensityLabel)
        .accessibilityValue(ComposerSceneCameraCopy.flashIntensityValue(level))
        .accessibilityAdjustableAction { sens in
            switch sens {
            case .increment: onChange(ComposerFlashIntensity.stepped(level, up: true))
            case .decrement: onChange(ComposerFlashIntensity.stepped(level, up: false))
            @unknown default: break
            }
        }
    }
}

// MARK: - Le badge du zoom (#8671)

/// Le facteur courant, avec la flèche du geste qui le change. Ajustable à la
/// voix : un lecteur d'écran ne glisse pas.
struct ComposerCaptureZoomChip: View {
    let factor: CGFloat
    let onStep: (Bool) -> Void

    var body: some View {
        HStack(spacing: MeeshySpacing.xs) {
            Image(systemName: "arrow.up.and.down")
                .font(MeeshyFont.relative(MeeshyIconSize.xxs, weight: .bold))
            Text(ComposerSceneCameraCopy.zoomValue(factor))
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold, design: .monospaced))
        }
        .foregroundStyle(ComposerCaptureZoom.showsBadge(factor) ? Color.yellow : .white)
        .padding(.horizontal, MeeshySpacing.smPlus)
        .frame(height: 32)
        .adaptiveGlass(in: Capsule())
        .accessibilityElement()
        .accessibilityLabel(ComposerSceneCameraCopy.zoomLabel)
        .accessibilityValue(ComposerSceneCameraCopy.zoomValue(factor))
        .accessibilityAdjustableAction { sens in
            switch sens {
            case .increment: onStep(true)
            case .decrement: onStep(false)
            @unknown default: break
            }
        }
    }
}
