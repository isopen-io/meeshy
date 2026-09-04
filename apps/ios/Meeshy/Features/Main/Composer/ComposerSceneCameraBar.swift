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

    /// L'instant du poser de doigt. `nil` ⇒ aucun doigt. C'est lui qui fait la
    /// différence entre une photo et une prise, et il ne peut pas vivre
    /// ailleurs : la vue est le seul endroit qui voit le doigt.
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
        .padding(.horizontal, 14)
        .padding(.top, 12)
        .padding(.bottom, 16)
    }

    // MARK: - En tête de la carte

    private var topControls: some View {
        HStack(spacing: 8) {
            glassControl(symbol: ComposerCameraFlash.symbol(for: flashMode),
                         label: ComposerCameraFlash.label(for: flashMode),
                         tint: flashMode == .off ? .white.opacity(0.75) : .yellow,
                         action: onCycleFlash)
            Spacer(minLength: 0)
            // **`[ ]` a pris la place de `(x)`** (directive porteur
            // 2026-09-04). En carte, le plateau reste visible et le viseur a
            // déjà ses sorties — la croix y faisait double emploi et occupait
            // la place du seul contrôle que la carte ne peut pas offrir
            // autrement. En plein écran, il n'y a plus rien autour : la croix
            // revient, et c'est la règle qui le dit.
            if size.showsClose {
                glassControl(symbol: "xmark",
                             label: ComposerSceneCameraCopy.disarmLabel,
                             tint: .white,
                             action: onDisarm)
            }
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
                .font(.system(size: 15, weight: .semibold))
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
        VStack(spacing: 6) {
            GeometryReader { geo in
                HStack(spacing: 2) {
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

            HStack(spacing: 8) {
                HStack(spacing: 5) {
                    Circle().fill(MeeshyColors.error).frame(width: 6, height: 6)
                    Text(LocalizedNumber.duration(
                        seconds: ComposerCaptureSegments.totalDuration(segments)))
                        .font(MeeshyFont.relative(11, weight: .semibold, design: .monospaced))
                        .foregroundStyle(.white)
                }
                .padding(.horizontal, 9)
                .frame(height: 24)
                .adaptiveGlass(in: Capsule())

                Text(ComposerSceneCameraCopy.segmentCount(segments.count))
                    .font(MeeshyFont.relative(10, weight: .bold))
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
        .padding(.top, 10)
    }

    // MARK: - Le déclencheur — un seul, trois intentions

    /// **Le déclencheur et la PISTE de verrouillage, sur une rangée.**
    ///
    /// La piste ne paraît que pendant une prise non verrouillée — hors de ce
    /// moment elle n'a rien à dire, et un rail permanent laisserait croire à
    /// une commande qu'on peut presser.
    private var shutterRow: some View {
        HStack(spacing: 10) {
            shutter
            if stage == .recording && !locked { lockTrack }
        }
    }

    /// La cible du verrou, avec la progression du doigt. Le cadenas se
    /// remplit ; à 1, le geste bascule.
    private var lockTrack: some View {
        HStack(spacing: 6) {
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(.white.opacity(0.35 + 0.65 * lockProgress))
            Image(systemName: "lock.fill")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white.opacity(0.4 + 0.6 * lockProgress))
        }
        .padding(.horizontal, 12)
        .frame(height: 34)
        .adaptiveGlass(in: Capsule())
        .overlay(
            Capsule().strokeBorder(.white.opacity(0.25 * lockProgress), lineWidth: 2)
        )
        .accessibilityHidden(true)
        .transition(.opacity)
    }

    private var shutter: some View {
        ZStack {
            Circle()
                .stroke(locked ? MeeshyColors.error : .white, lineWidth: 4)
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
    }

    private var shutterGesture: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { valeur in
                if pressedAt == nil {
                    pressedAt = Date()
                    locked = false
                    armHold()
                }
                guard stage == .recording, !locked else { return }
                // **Le geste se montre pendant qu'il se fait** — et revenir en
                // arrière l'annule, ce que la progression rend tout seul en
                // retombant à zéro.
                lockProgress = ComposerShutterGesture.lockProgress(
                    translationX: valeur.translation.width)
                guard ComposerShutterGesture.locks(
                    translationX: valeur.translation.width) else { return }
                locked = true
                lockProgress = 1
                onLock()
                HapticFeedback.medium()
            }
            .onEnded { _ in
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
        Text(ComposerSceneCameraCopy.hint(mode: mode, stage: stage))
            .font(MeeshyFont.relative(11, design: .monospaced))
            .foregroundStyle(.white.opacity(0.85))
            .shadow(color: .black.opacity(0.6), radius: 3, y: 1)
            .multilineTextAlignment(.center)
            .lineLimit(2)
            .minimumScaleFactor(0.75)
            .padding(.top, 10)
            .accessibilityHidden(true)
    }
}
