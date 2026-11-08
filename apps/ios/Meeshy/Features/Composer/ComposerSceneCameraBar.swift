import AVFoundation
import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La rangée haute du viseur et la bande de ses segments** (#4080, vue `2b`
/// — directive porteur 2026-09-04 ; #9351).
///
/// > « Les contrôles sont apparus mais hors de la zone scène alors que tout
/// > doit être dans la scène ! Et la gestion photo vidéo ou mains libres se
/// > fait par la gestuelle uniquement et non des boutons disponibles. »
///
/// Un VISEUR n'est pas un aperçu de composition — c'est un instrument de
/// cadrage, et son chrome ne part avec aucune publication : la planche `2b` le
/// dessine par-dessus l'image. Il n'y a plus de déclencheur ( o ) (#9351) : la
/// scène et la miniature choisie, en bas, prennent la photo et la vidéo ; le
/// rail, en bas à gauche, ouvre les filtres et les cadres.
///
/// **La croix en haut à GAUCHE, suivie de la puce du chrono ; à DROITE les
/// contrôleurs de segment, le flash et, au bord, le retournement ; sous le
/// flash — allumé, et 2 s après la dernière interaction — le curseur vertical
/// de son intensité** (porteur 2026-10-05, 2026-10-07 #9566, 2026-10-09 #9753 —
/// la disposition est la loi `ComposerCaptureTopRow`).
struct ComposerSceneCameraBar: View {

    let stage: ComposerSceneCameraStage

    let flashMode: AVCaptureDevice.FlashMode
    let onCycleFlash: () -> Void
    let onFlipCamera: () -> Void
    let onDisarm: () -> Void

    /// La taille courante, et ce qu'un appui sur `[ ]` produit. La règle
    /// (`ComposerSceneCameraSize`) décide du glyphe ; cette vue peint.
    let size: ComposerSceneCameraSize
    let onToggleSize: () -> Void
    /// Le viseur servi SEUL en plein écran (#9125) n'a pas de carte où
    /// rentrer : il ne montre pas `[ ]`. La croix, elle, reste.
    var offersSizeToggle = true

    let segments: [ComposerCaptureSegment]
    let onDropLastSegment: () -> Void
    let onValidateSegments: () -> Void

    /// **La durée de la prise EN COURS**, distincte des `segments` : un segment
    /// est une prise CLOSE, ceci une horloge qui court. Les additionner est la
    /// règle (`ComposerCaptureSegments.elapsed`).
    var liveDuration: TimeInterval = 0
    var flashIntensity: Double = ComposerFlashIntensity.defaultLevel
    var onFlashIntensity: (Double) -> Void = { _ in }
    /// Une bascule d'objectif est en cours, ou la prise précédente se
    /// finalise : le bouton se tait (#9464, #9351).
    var flipping = false
    /// **On retouche** (#9352) : l'objectif se repose, donc ni flash ni
    /// retournement — et la croix abandonne la retouche.
    var editing = false
    /// « Terminé » rend : il attend, et le dit.
    var rendering = false
    var onDone: () -> Void = {}
    /// **La flèche ⬇︎ de la retouche** (#9684) : la prise, avec ses effets et
    /// son cadre, rejoint Photos ; déjà enregistrée avec ce cadre, la flèche
    /// disparaît, et revient quand le cadre change (#10284).
    var saveState = ComposerTakeSaveState.idle
    var onSave: (() -> Void)?

    /// **Ce que la machine sait du doigt, du zoom et de la lumière** (#8671) —
    /// lu par le bas de la capture (`ComposerCaptureBottomRow`).
    struct Capture: Equatable {
        var holding = false
        var lockProgress: Double = 0
        var locked = false
        var zoomFactor: CGFloat = 1
        /// Les crans du zoom que l'objectif sert (#9350) — vide sans zoom.
        var zoomPresets: [CGFloat] = []
        var flipping = false
        /// L'objectif bascule — la barre des zooms morphe (#9753).
        var switchingCamera = false
        var flashIntensity: Double = ComposerFlashIntensity.defaultLevel
    }

    /// **Reduce Motion coupe le battement, jamais le témoin** : le point rouge
    /// PLEIN dit déjà « ça enregistre ».
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOverEnabled

    @AppStorage(ComposerCaptureGrid.storageKey) private var gridEnabled = false
    @AppStorage(ComposerCaptureSelfTimerDelay.storageKey) private var selfTimerDelay = 0
    @State private var recordingBlink: Double = 1
    /// Le curseur du flash paraît à l'interaction et s'efface 2 s après (#9753).
    @State private var sliderTimer = ComposerFlashSliderTimer()

    private var row: ComposerCaptureTopRow.Input {
        ComposerCaptureTopRow.Input(stage: stage, editing: editing, pendingSegments: segments.count,
                                    offersSizeToggle: offersSizeToggle, offersSave: onSave != nil && saveState.showsSave)
    }

    private var trailingItems: [ComposerCaptureTopItem] { ComposerCaptureTopRow.trailing(row) }

    private var showsFlashSlider: Bool {
        trailingItems.contains(.flash) && ComposerFlashIntensity.showsSlider(flash: flashMode) && sliderTimer.visible
    }

    var body: some View {
        VStack(spacing: 0) {
            topControls
            if !segments.isEmpty, !editing { segmentBar }
            if showsFlashSlider {
                HStack {
                    Spacer(minLength: 0)
                    ComposerFlashIntensitySlider(level: flashIntensity, onChange: onFlashIntensity,
                                                 onInteraction: { sliderTimer.hold($0) })
                }
                .padding(.trailing, ComposerCaptureTopRow.flashSliderTrailingInset(
                    trailingItems, tapTarget: MeeshyControlSize.tapTarget))
                .padding(.top, MeeshySpacing.sm)
                .transition(.opacity)
            }
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.top, MeeshySpacing.md)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: showsFlashSlider)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: trailingItems)
        .adaptiveOnChange(of: flashMode) { _, mode in
            guard ComposerFlashIntensity.showsSlider(flash: mode) else { return sliderTimer.hide() }
            sliderTimer.touch()
        }
        .task(id: sliderTimer.generation) { @MainActor in
            let echeance = sliderTimer.generation
            guard await cancellableSleep(for: .seconds(ComposerFlashSliderTimer.lifetime)), !Task.isCancelled else { return }
            sliderTimer.expire(echeance, voiceOver: voiceOverEnabled)
        }
    }

    // MARK: - En tête de la carte

    /// **La rangée haute, disposée par sa loi** (#9753) : (x) puis le chrono à
    /// gauche ; à droite `[ ]`, les contrôleurs de segment, le flash et, au
    /// bord, le retournement. **La croix est TOUJOURS là** (#8653 : « permettre
    /// de quitter à tout moment »), pendant l'enregistrement compris.
    private var topControls: some View {
        HStack(spacing: ComposerCaptureTopRow.spacing) {
            ForEach(ComposerCaptureTopRow.leading(row), id: \.self) { control($0) }
            Spacer(minLength: 0)
            ForEach(trailingItems, id: \.self) { control($0) }
        }
    }

    @ViewBuilder
    private func control(_ item: ComposerCaptureTopItem) -> some View {
        switch item {
        case .close:
            glassControl(symbol: "xmark",
                         label: editing ? ComposerCaptureCopy.cancelEdit : ComposerSceneCameraCopy.disarmLabel,
                         tint: .white, action: onDisarm)
        case .chrono:
            chronoChip
        case .size:
            glassControl(symbol: size.toggleSymbol, label: ComposerSceneCameraCopy.sizeLabel(size),
                         tint: .white, action: onToggleSize)
        case .more:
            moreMenu
        case .dropSegment:
            glassControl(symbol: "delete.left", label: ComposerSceneCameraCopy.dropSegmentLabel,
                         tint: .white.opacity(0.9), action: onDropLastSegment)
        case .validate:
            glassControl(symbol: "checkmark", label: ComposerSceneCameraCopy.validateLabel,
                         tint: .white, action: onValidateSegments)
        case .flash:
            flashCluster
        case .flip:
            glassControl(symbol: "arrow.triangle.2.circlepath.camera", label: ComposerSceneCameraCopy.flipLabel,
                         tint: .white, action: onFlipCamera)
                .disabled(flipping)
        case .save:
            if let onSave { saveButton(onSave) }
        case .done:
            doneButton
        }
    }

    /// **Le flash.** Le toucher change son mode et, allumé, fait paraître le
    /// curseur d'intensité SOUS lui (#9566) pour 2 s (#9753).
    private var flashCluster: some View {
        glassControl(symbol: ComposerCameraFlash.symbol(for: flashMode),
                     label: ComposerCameraFlash.label(for: flashMode),
                     tint: flashMode == .off ? .white.opacity(0.75) : .yellow,
                     action: onCycleFlash)
    }

    /// **✓ Terminé, en haut à droite, aligné sur la croix** (porteur 2026-10-07,
    /// #9567) : les deux sont au-dessus du sol, jamais sur la scène retouchée.
    /// Pendant le rendu il attend : un second toucher ne remet rien.
    private var doneButton: some View {
        Button {
            HapticFeedback.light()
            onDone()
        } label: {
            Label(ComposerCaptureCopy.done, systemImage: "checkmark")
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, MeeshySpacing.lg)
                .frame(minHeight: 40)
                .adaptiveGlassProminent(in: Capsule(), tint: MeeshyColors.indigo500)
                .opacity(rendering ? 0.5 : 1)
                .frame(minHeight: MeeshyControlSize.tapTarget)
        }
        .buttonStyle(ComposerBounceButtonStyle())
        .disabled(rendering)
        .accessibilityLabel(ComposerCaptureCopy.done)
    }

    /// **⬇︎ Enregistrer dans Photos**, à gauche de « Terminé » : la flèche, puis
    /// une roue pendant l'écriture (le rendu d'une vidéo prend du temps) ; une
    /// fois la prise dans Photos avec ce cadre, le bouton s'en va (#10284).
    /// Pendant « Terminé », elle attend.
    private func saveButton(_ action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            ZStack {
                switch saveState {
                case .idle:
                    Image(systemName: "arrow.down.to.line")
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundStyle(.white)
                case .saving:
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(.white)
                case .saved:
                    Image(systemName: "checkmark")
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                        .foregroundStyle(MeeshyColors.success)
                }
            }
            .frame(width: 40, height: 40)
            .adaptiveLiquidGlass(in: Circle(), interactive: true)
            .opacity(rendering && saveState.offersSave ? 0.5 : 1)
            .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
            .contentShape(Circle())
        }
        .buttonStyle(ComposerBounceButtonStyle())
        .disabled(!saveState.offersSave || rendering)
        .accessibilityLabel(saveLabel)
        .accessibilityAddTraits(saveState == .saving ? .updatesFrequently : [])
    }

    private var saveLabel: String {
        switch saveState {
        case .idle: return ComposerCaptureCopy.saveToPhotos
        case .saving: return ComposerCaptureCopy.savingToPhotos
        case .saved: return ComposerCaptureCopy.savedToPhotos
        }
    }

    /// **`⋯` : la grille et la taille, sans huitième contrôle** (décision porteur,
    /// OPUS-6). La loi `ComposerCaptureMoreMenu` dit ce qu'il porte.
    private var moreMenu: some View {
        Menu {
            ForEach(ComposerCaptureMoreMenu.items(offersSizeToggle: offersSizeToggle), id: \.self) { item in
                switch item {
                case .grid:
                    Toggle(isOn: $gridEnabled) {
                        Label(ComposerSceneCameraCopy.gridLabel, systemImage: "grid")
                    }
                case .selfTimer:
                    Picker(selection: $selfTimerDelay) {
                        ForEach(ComposerCaptureSelfTimerDelay.allCases, id: \.self) { delai in
                            Text(ComposerSceneCameraCopy.selfTimerOption(delai)).tag(delai.rawValue)
                        }
                    } label: {
                        Label(ComposerSceneCameraCopy.selfTimerLabel, systemImage: "timer")
                    }
                    .pickerStyle(.menu)
                case .size:
                    Button(action: onToggleSize) {
                        Label(ComposerSceneCameraCopy.sizeLabel(size), systemImage: size.toggleSymbol)
                    }
                }
            }
        } label: {
            glassGlyph(symbol: "ellipsis", tint: .white)
        }
        .accessibilityLabel(ComposerSceneCameraCopy.moreLabel)
    }

    /// **Sur du verre, jamais à nu.** Ces contrôles flottent sur une image que
    /// l'objectif choisit : une glyphe blanche posée sur un mur clair
    /// disparaîtrait.
    private func glassControl(symbol: String,
                              label: String,
                              tint: Color,
                              action: @escaping () -> Void) -> some View {
        Button {
            action()
            HapticFeedback.light()
        } label: {
            glassGlyph(symbol: symbol, tint: tint)
        }
        .buttonStyle(ComposerBounceButtonStyle())
        .accessibilityLabel(label)
    }

    private func glassGlyph(symbol: String, tint: Color) -> some View {
        Image(systemName: symbol)
            // **Un glyphe de contrôle SUIT le Dynamic Type.**
            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 40, height: 40)
            .adaptiveLiquidGlass(in: Circle(), interactive: true)
            .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
            .contentShape(Circle())
    }

    // MARK: - La bande des segments (#4099, vue `4b`) et la puce du chrono (#9753)

    /// La part de chaque segment, sous la rangée haute ; le dernier en rouge.
    private var segmentBar: some View {
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
        .padding(.top, MeeshySpacing.smPlus)
        .accessibilityHidden(true)
    }

    private var elapsed: TimeInterval {
        ComposerCaptureSegments.elapsed(segments: segments, live: liveDuration, recording: stage == .recording)
    }

    /// **La puce du chrono et de l'indicateur de segment, à DROITE de (x)**
    /// (#9753). **Le témoin d'enregistrement BAT** : un point rouge fixe ne
    /// distingue pas « ça tourne » de « il y a des segments ».
    private var chronoChip: some View {
        let compte = ComposerCaptureTopRow.segmentCount(pending: segments.count, recording: stage == .recording)
        return HStack(spacing: MeeshySpacing.xs) {
            Circle()
                .fill(MeeshyColors.error)
                .frame(width: 6, height: 6)
                .opacity(stage == .recording && !reduceMotion ? recordingBlink : 1)
                .animation(stage == .recording && !reduceMotion
                           ? .easeInOut(duration: 0.55).repeatForever(autoreverses: true)
                           : .default,
                           value: recordingBlink)
                .onAppear { if !reduceMotion { recordingBlink = 0.25 } }
            Text(MediaFormat.duration(elapsed))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold, design: .monospaced))
                .foregroundStyle(.white)
            Text(ComposerCaptureTopRow.segmentBadge(compte))
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .bold))
                .foregroundStyle(.white.opacity(0.85))
        }
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .padding(.horizontal, MeeshySpacing.sm)
        .frame(height: 32)
        .adaptiveLiquidGlass(in: Capsule())
        .frame(minHeight: MeeshyControlSize.tapTarget)
        // L'écran montre « 3 – » ; VoiceOver dit « 3 segments » (#10310), puis
        // la minuterie EN MOTS — il lirait « 0:12 » comme une heure.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ComposerSceneCameraCopy.segmentCount(compte))
        .accessibilityValue(MediaFormat.duration(elapsed, style: .spoken))
        .accessibilityAddTraits(.updatesFrequently)
    }
}

// MARK: - Le badge du zoom (#8671)

/// Le facteur courant, avec la flèche du geste qui le change. Ajustable à la
/// voix : un lecteur d'écran ne glisse pas.
/// **La grille des tiers, peinte au viseur** (CAM-2) : fine, blanche sur une
/// ombre légère pour rester visible sur un mur clair, muette à VoiceOver et
/// transparente au toucher. Elle n'est qu'une vue : la prise ne la voit pas.
struct ComposerCaptureGridOverlay: View {
    var body: some View {
        Canvas { context, size in
            let lignes = ComposerCaptureGrid.lines(in: CGRect(origin: .zero, size: size))
            let trace = Path { path in
                lignes.vertical.forEach { x in
                    path.move(to: CGPoint(x: x, y: 0))
                    path.addLine(to: CGPoint(x: x, y: size.height))
                }
                lignes.horizontal.forEach { y in
                    path.move(to: CGPoint(x: 0, y: y))
                    path.addLine(to: CGPoint(x: size.width, y: y))
                }
            }
            context.stroke(trace, with: .color(.black.opacity(0.2)), lineWidth: 1.5)
            context.stroke(trace, with: .color(.white.opacity(0.35)), lineWidth: 0.5)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// **Le compte à rebours du retardateur** (CAM-4) : un appui sur la prise
/// pendant le compte l'annule. Chaque seconde se dit à VoiceOver et se sent au
/// doigt ; le chiffre se lit au centre du viseur.
@MainActor
final class ComposerCaptureSelfTimer: ObservableObject {
    @Published private(set) var remaining: Int?

    private var countdown: Task<Void, Never>?
    private let defaults: UserDefaults
    private let tick: Duration

    init(defaults: UserDefaults = .standard, tick: Duration = .seconds(1)) {
        self.defaults = defaults
        self.tick = tick
    }

    nonisolated deinit {}

    var delay: ComposerCaptureSelfTimerDelay {
        ComposerCaptureSelfTimerDelay(stored: defaults.integer(forKey: ComposerCaptureSelfTimerDelay.storageKey))
    }

    var isCounting: Bool { countdown != nil }

    /// Prend tout de suite, ou après le compte ; un compte en cours s'annule.
    func run(_ shoot: @escaping @MainActor () -> Void) {
        guard countdown == nil else { return cancel() }
        let secondes = delay.ticks
        guard !secondes.isEmpty else { return shoot() }
        let pas = tick
        show(secondes[0])
        countdown = Task { [weak self] in
            for (rang, seconde) in secondes.enumerated() {
                if rang > 0 { self?.show(seconde) }
                guard await cancellableSleep(for: pas), !Task.isCancelled else { return }
            }
            self?.finish()
            shoot()
        }
    }

    func cancel() {
        countdown?.cancel()
        finish()
    }

    private func show(_ seconde: Int) {
        remaining = seconde
        HapticFeedback.light()
        UIAccessibility.post(notification: .announcement, argument: LocalizedNumber.exact(seconde))
    }

    private func finish() {
        countdown = nil
        remaining = nil
    }
}

struct ComposerCaptureCountdown: View {
    @ObservedObject var timer: ComposerCaptureSelfTimer
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            if let seconde = timer.remaining {
                Text(LocalizedNumber.exact(seconde))
                    .font(MeeshyFont.relative(96, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.45), radius: 10)
                    .id(seconde)
                    .transition(reduceMotion ? .opacity : .scale(scale: 1.4).combined(with: .opacity))
                    .accessibilityHidden(true)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.25), value: timer.remaining)
        .allowsHitTesting(false)
    }
}

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
        .adaptiveLiquidGlass(in: Capsule())
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

/// **Les crans du zoom** (#9350) : ×0,5 / ×1 / ×2, ceux que l'objectif sert. Le
/// cran courant est jaune ; chacun est une cible de 44 pt, nommée à la voix.
struct ComposerCaptureZoomPresets: View {
    let factor: CGFloat
    let presets: [CGFloat]
    let onSelect: (CGFloat) -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach(presets, id: \.self) { cran in
                Button {
                    onSelect(cran)
                    HapticFeedback.light()
                } label: {
                    Text(ComposerSceneCameraCopy.zoomPresetValue(cran))
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold, design: .rounded))
                        .foregroundStyle(abs(factor - cran) < 0.05 ? Color.yellow : .white)
                        .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(ComposerSceneCameraCopy.zoomLabel)
                .accessibilityValue(ComposerSceneCameraCopy.zoomValue(cran))
                .accessibilityAddTraits(abs(factor - cran) < 0.05 ? .isSelected : [])
            }
        }
        .adaptiveLiquidGlass(in: Capsule())
    }
}
