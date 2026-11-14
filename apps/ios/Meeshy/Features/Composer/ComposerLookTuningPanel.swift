import SwiftUI
import MeeshyUI

// MARK: - Les mots du réglage (OPUS-2)

extension ComposerCaptureCopy {
    static var ambianceControl: String {
        String(localized: "composer.capture.ambiance.control", defaultValue: "Ambiance", bundle: .main)
    }

    static var ambianceTune: String {
        String(localized: "composer.capture.ambiance.tune", defaultValue: "Régler l'ambiance", bundle: .main)
    }

    static var ambianceIntensity: String {
        String(localized: "composer.capture.ambiance.intensity", defaultValue: "Intensité", bundle: .main)
    }

    static var ambianceWarmth: String {
        String(localized: "composer.capture.ambiance.warmth", defaultValue: "Chaleur", bundle: .main)
    }

    static var ambianceContrast: String {
        String(localized: "composer.capture.ambiance.contrast", defaultValue: "Contraste", bundle: .main)
    }

    static var ambiancePad: String {
        String(localized: "composer.capture.ambiance.pad", defaultValue: "Chaleur et contraste", bundle: .main)
    }

    static var ambianceReset: String {
        String(localized: "composer.capture.ambiance.reset", defaultValue: "Revenir au neutre", bundle: .main)
    }
}

// MARK: - Le bouton qui ouvre le réglage

/// Posé à côté du nom de la case choisie : le réglage s'ouvre et se referme d'un
/// toucher, sans jamais prendre les gestes de la miniature, qui déclenche.
struct ComposerLookTuningToggle: View {
    let open: Bool
    let tuned: Bool
    let onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            Image(systemName: "slider.horizontal.3")
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundStyle(open || tuned ? Color.yellow : .white)
                .shadow(color: .black.opacity(0.6), radius: 3, y: 1)
                .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(ComposerBounceButtonStyle())
        .accessibilityLabel(ComposerCaptureCopy.ambianceTune)
        .accessibilityAddTraits(open ? .isSelected : [])
    }
}

// MARK: - Le réglage : la dose et le pavé

/// **La dose de l'ambiance et le pavé chaleur × contraste** (OPUS-2, doc 08 § R6).
/// Le look en direct suit chaque mouvement : le viseur EST l'aperçu du réglage.
struct ComposerLookTuningPanel: View {
    let look: ComposerPhotoLook
    let onChange: (ComposerLookTuning) -> Void

    static let padSide: CGFloat = 96

    var body: some View {
        HStack(alignment: .center, spacing: MeeshySpacing.md) {
            ComposerLookTuningPad(tuning: look.tuning) { chaleur, contraste in
                onChange(look.tuning.with(warmth: chaleur, contrast: contraste))
            }
            .frame(width: Self.padSide, height: Self.padSide)
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                if ComposerPhotoLookRule.grades(look.filter) {
                    Text(ComposerCaptureCopy.ambianceIntensity)
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                        .foregroundStyle(.white)
                    Slider(value: Binding(get: { look.tuning.intensity },
                                          set: { onChange(look.tuning.with(intensity: $0)) }),
                           in: 0...1)
                        .tint(.white)
                        .accessibilityLabel(ComposerCaptureCopy.ambianceIntensity)
                        .accessibilityValue(look.tuning.intensity.formatted(.percent.precision(.fractionLength(0))))
                }
                if look.tuning != .neutral {
                    Button(ComposerCaptureCopy.ambianceReset) { onChange(.neutral) }
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(minHeight: MeeshyControlSize.tapTarget)
                }
            }
            .frame(maxWidth: 180, alignment: .leading)
        }
        .padding(MeeshySpacing.sm)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous)
            .fill(Color.black.opacity(0.5)))
    }
}

/// **Le pavé** : vers la droite, plus chaud ; vers le haut, plus contrasté. Le
/// centre est neutre, et le doigt y revient sans viser (`deadZone`). VoiceOver le
/// lit comme deux curseurs.
struct ComposerLookTuningPad: View {
    let tuning: ComposerLookTuning
    let onChange: (Double, Double) -> Void

    var body: some View {
        GeometryReader { proxy in
            let taille = proxy.size
            ZStack {
                RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
                    .fill(LinearGradient(colors: [Color.cyan.opacity(0.45), Color.orange.opacity(0.45)],
                                         startPoint: .leading, endPoint: .trailing))
                RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.5), lineWidth: 1)
                Path { trace in
                    trace.move(to: CGPoint(x: taille.width / 2, y: 0))
                    trace.addLine(to: CGPoint(x: taille.width / 2, y: taille.height))
                    trace.move(to: CGPoint(x: 0, y: taille.height / 2))
                    trace.addLine(to: CGPoint(x: taille.width, y: taille.height / 2))
                }
                .stroke(Color.white.opacity(0.3), lineWidth: 1)
                Circle()
                    .fill(Color.white)
                    .frame(width: 14, height: 14)
                    .shadow(color: .black.opacity(0.5), radius: 2)
                    .position(ComposerLookTuningRule.point(warmth: tuning.warmth, contrast: tuning.contrast,
                                                           in: taille))
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onChanged { glisse in
                let reglage = ComposerLookTuningRule.values(at: glisse.location, in: taille)
                onChange(reglage.warmth, reglage.contrast)
            })
        }
        .accessibilityRepresentation {
            VStack {
                Slider(value: Binding(get: { tuning.warmth }, set: { onChange($0, tuning.contrast) }),
                       in: -1...1, step: ComposerLookTuningRule.accessibilityStep) {
                    Text(ComposerCaptureCopy.ambianceWarmth)
                }
                Slider(value: Binding(get: { tuning.contrast }, set: { onChange(tuning.warmth, $0) }),
                       in: -1...1, step: ComposerLookTuningRule.accessibilityStep) {
                    Text(ComposerCaptureCopy.ambianceContrast)
                }
            }
            .accessibilityLabel(ComposerCaptureCopy.ambiancePad)
        }
    }
}

// MARK: - Le bouton Camera Control suit le look (OPUS-9)

/// **Le sélecteur « Ambiance » du bouton latéral, relié à la session** : il
/// montre l'ambiance du look, et son choix rejoint le look comme un choix de la
/// bande — seulement quand la bande choisirait ; sinon il revient en place.
enum ComposerCameraAmbiance {

    static func follow(_ ambiance: VideoFilterPreset, session: ComposerCaptureSession) {
        session.camera.ambianceLink.connect(title: ComposerCaptureCopy.ambianceControl,
                                            titles: CameraSystemControlsRule.ambiances.map(CallEffectsCopy.presetName)) {
            [weak session] preset in
            guard let session else { return }
            pick(preset, session: session)
        }
        session.camera.ambianceLink.show(ambiance)
    }

    static func pick(_ preset: VideoFilterPreset, session: ComposerCaptureSession) {
        guard let look = picked(preset, look: session.look, context: session.gestureContext) else {
            return session.camera.ambianceLink.show(session.look.filter)
        }
        session.look = look
    }

    /// Le look qu'un choix du bouton donne ; `nil` quand la bande ne choisirait
    /// pas (pendant une prise, segments en attente).
    static func picked(_ preset: VideoFilterPreset, look: ComposerPhotoLook,
                       context: ComposerCaptureGestureContext) -> ComposerPhotoLook? {
        guard ComposerCaptureGesture.action(zone: .otherThumbnail, gesture: .tap, context: context) == .select else {
            return nil
        }
        return ComposerLookStripRule.look(of: .filter(preset), combinedWith: look)
    }
}

/// Relie le bouton latéral au look tant que la bande est à l'écran.
struct ComposerCameraAmbianceFollow: ViewModifier {
    @ObservedObject var session: ComposerCaptureSession

    func body(content: Content) -> some View {
        content.adaptiveOnChange(of: session.look.filter, initial: true) { _, ambiance in
            ComposerCameraAmbiance.follow(ambiance, session: session)
        }
    }
}
