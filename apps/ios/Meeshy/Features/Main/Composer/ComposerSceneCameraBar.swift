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
/// **La croix en haut à GAUCHE, le flash en haut à DROITE, et sous lui le
/// curseur vertical de la luminosité** (décision porteur 2026-10-05).
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
    var exposureBias: Float = ComposerExposureRule.neutral
    var onExposureBias: (Float) -> Void = { _ in }
    /// **On retouche** (#9352) : l'objectif se repose, donc ni flash, ni
    /// retournement, ni luminosité — et la croix abandonne la retouche.
    var editing = false

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
        var flashIntensity: Double = ComposerFlashIntensity.defaultLevel
    }

    /// **Reduce Motion coupe le battement, jamais le témoin** : le point rouge
    /// PLEIN dit déjà « ça enregistre ».
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var recordingBlink: Double = 1

    var body: some View {
        VStack(spacing: 0) {
            topControls
            if !segments.isEmpty, !editing { segmentStrip }
            if ComposerExposureRule.shows(stage: stage, editing: editing) {
                HStack {
                    Spacer(minLength: 0)
                    ComposerExposureSlider(bias: exposureBias, onChange: onExposureBias)
                }
                .padding(.top, MeeshySpacing.sm)
                .transition(.opacity)
            }
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.top, MeeshySpacing.md)
    }

    // MARK: - En tête de la carte

    private var topControls: some View {
        HStack(spacing: MeeshySpacing.sm) {
            // **La croix est TOUJOURS là** (#8653 : « permettre de quitter à
            // tout moment »), en haut à gauche (porteur 2026-10-05).
            glassControl(symbol: "xmark",
                         label: editing ? ComposerCaptureCopy.cancelEdit : ComposerSceneCameraCopy.disarmLabel,
                         tint: .white,
                         action: onDisarm)
            Spacer(minLength: 0)
            if offersSizeToggle {
                glassControl(symbol: size.toggleSymbol,
                             label: ComposerSceneCameraCopy.sizeLabel(size),
                             tint: .white,
                             action: onToggleSize)
            }
            if !editing {
                glassControl(symbol: "arrow.triangle.2.circlepath.camera",
                             label: ComposerSceneCameraCopy.flipLabel,
                             tint: .white,
                             action: onFlipCamera)
                    .disabled(flipping)
                flashCluster
            }
        }
    }

    /// **Le flash et son curseur, dans UNE capsule de verre** (#8671). Le flash
    /// vit au bord droit : son curseur d'intensité s'allonge à sa GAUCHE quand
    /// il s'allume, et se replie quand il s'éteint.
    private var flashCluster: some View {
        HStack(spacing: 0) {
            if ComposerFlashIntensity.showsSlider(flash: flashMode) {
                ComposerFlashIntensitySlider(level: flashIntensity,
                                             onChange: onFlashIntensity)
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            }
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
        }
        .clipShape(Capsule())
        .adaptiveLiquidGlass(in: Capsule(), interactive: true)
        .animation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.82),
                   value: ComposerFlashIntensity.showsSlider(flash: flashMode))
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
            Image(systemName: symbol)
                // **Un glyphe de contrôle SUIT le Dynamic Type.**
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 40, height: 40)
                .adaptiveLiquidGlass(in: Circle(), interactive: true)
                .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                .contentShape(Circle())
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
                HStack(spacing: MeeshySpacing.xs) {
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
                .padding(.horizontal, MeeshySpacing.sm)
                .frame(height: 24)
                .adaptiveLiquidGlass(in: Capsule())
                // VoiceOver lit « 0:12 » comme une heure : la minuterie se DIT
                // en mots (#9125 — elle remplace celle de l'ancienne vue).
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(LocalizedNumber.spokenDuration(
                    seconds: ComposerCaptureSegments.elapsed(
                        segments: segments,
                        live: liveDuration,
                        recording: stage == .recording)))
                .accessibilityAddTraits(.updatesFrequently)

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
        .padding(.leading, MeeshySpacing.mdPlus)
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
