import AVFoundation
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les mots de la découpe (#9353)

extension ComposerCaptureCopy {
    static var trimPrecisionHint: String {
        String(localized: "composer.capture.trim.precisionHint",
               defaultValue: "Maintenir pour régler à la milliseconde", bundle: .main)
    }

    static var playhead: String {
        String(localized: "composer.capture.trim.playhead", defaultValue: "Tête de lecture", bundle: .main)
    }

    static var trimStart: String {
        String(localized: "composer.object.editor.start", defaultValue: "Début", bundle: .main)
    }

    static var trimEnd: String {
        String(localized: "composer.object.editor.end", defaultValue: "Fin", bundle: .main)
    }
}

/// Les deux bornes de la plage gardée.
nonisolated enum ComposerTrimHandle: Equatable, Sendable {
    case start
    case end
}

/// Où la piste pose le temps : les vignettes occupent `width`, en retrait de
/// `inset` — la place d'une poignée et de sa cible de 44 pt de chaque côté.
nonisolated struct ComposerTrimTrackGeometry: Equatable, Sendable {
    let inset: CGFloat
    let width: CGFloat
    let duration: TimeInterval

    init(totalWidth: CGFloat, inset: CGFloat, duration: TimeInterval) {
        self.inset = inset
        self.width = max(1, totalWidth - inset * 2)
        self.duration = duration
    }

    var pointsPerSecond: CGFloat {
        duration > 0 ? width / CGFloat(duration) : 0
    }

    /// L'abscisse d'un instant sur les vignettes, depuis leur bord gauche.
    func offset(for time: TimeInterval) -> CGFloat {
        CGFloat(time) * pointsPerSecond
    }

    /// L'abscisse d'un instant dans la piste entière.
    func x(for time: TimeInterval) -> CGFloat {
        inset + offset(for: time)
    }
}

/// Les vignettes du clip entier, UNE fois : la plage est une fenêtre posée
/// dessus, la régler ne les change pas (spec § 3.3 : jamais pendant un geste).
nonisolated enum ComposerTrimThumbnails {
    @concurrent
    static func images(url: URL, count: Int) async -> [CGImage] {
        let asset = AVURLAsset(url: url)
        guard let duree = try? await asset.load(.duration).seconds, duree > 0, count > 0 else { return [] }
        let generateur = AVAssetImageGenerator(asset: asset)
        generateur.appliesPreferredTrackTransform = true
        generateur.maximumSize = CGSize(width: 120, height: 120)
        let instants = (0..<count).map {
            CMTime(seconds: duree * (Double($0) + 0.5) / Double(count), preferredTimescale: 600)
        }
        var tirees: [(instant: CMTime, image: CGImage)] = []
        for await resultat in generateur.images(for: instants) {
            if let image = try? resultat.image { tirees.append((resultat.requestedTime, image)) }
        }
        return tirees.sorted { $0.instant < $1.instant }.map { $0.image }
    }
}

/// **La piste de découpe** (#9353, spec § 3.3) : `[poignée] ── vignettes (forme
/// d'onde en filigrane) ── [poignée]`, une tête de lecture qui parcourt la plage
/// en boucle ; toucher les vignettes y place la tête. Les deux poignées et le
/// liseré ferment UN cadre arrondi autour de la plage gardée, et ses bornes se
/// lisent en permanence au-dessus, à la milliseconde (porteur 2026-10-07, #9567).
///
/// **Appui long sur une poignée ⇒ précision à la milliseconde** : la piste se
/// dilate autour d'elle sous un trait FIXE, et le doigt fait défiler la bande —
/// on AMÈNE l'instant, on ne le vise pas (principe de `MeeshyAudioTrimmer`,
/// #4657). Le temps se lit au-dessus, `0:03.482`.
///
/// Pendant un geste, seule la plage bouge ; à sa fin — levée du doigt ou geste
/// annulé par le système — la boucle repart sur elle. Le temps ne se met pas en
/// miroir : la piste se lit de gauche à droite dans toutes les langues.
struct ComposerTrimTrack: View {
    @ObservedObject var session: ComposerCaptureSession
    let url: URL
    let duration: TimeInterval

    static let height: CGFloat = 52
    private static let boundsHeight: CGFloat = 16
    private static let handleWidth: CGFloat = 18
    private static let frameRadius: CGFloat = 10
    private static let thumbnailCount = 12
    private static let waveformSamples = 256
    /// Le pas d'un balayage VoiceOver sur une poignée, et sur la tête.
    private static let accessibleStep: TimeInterval = 0.1
    private static let accessiblePlayheadStep: TimeInterval = 1

    @State private var frames: [CGImage] = []
    @State private var samples: [Float] = []
    /// L'instant de la poignée au début du geste en cours.
    @State private var origin: TimeInterval?
    /// Retombent d'eux-mêmes quand le système annule le geste sans `onEnded`.
    @GestureState private var precise: ComposerTrimHandle?
    @GestureState private var dragging: ComposerTrimHandle?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var range: ClosedRange<TimeInterval> {
        session.trim ?? ComposerTrimRule.initialRange(duration: duration)
    }

    private var trimmable: Bool { ComposerTrimRule.canTrim(duration: duration) }

    private func time(of poignee: ComposerTrimHandle) -> TimeInterval {
        poignee == .start ? range.lowerBound : range.upperBound
    }

    var body: some View {
        VStack(spacing: MeeshySpacing.xs) {
            bounds
            GeometryReader { proxy in
                let piste = ComposerTrimTrackGeometry(totalWidth: proxy.size.width,
                                                      inset: MeeshySpacing.mdPlus + Self.handleWidth,
                                                      duration: duration)
                ZStack(alignment: .leading) {
                    strip(piste)
                    selectionEdges(piste)
                    playheadLine(piste)
                    handle(.start, piste)
                    handle(.end, piste)
                }
                .frame(width: proxy.size.width, height: Self.height, alignment: .leading)
            }
            .frame(height: Self.height)
            .overlay(alignment: .top) { readout }
        }
        .environment(\.layoutDirection, .leftToRight)
        .disabled(!trimmable)
        .opacity(trimmable ? 1 : 0.4)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: precise)
        .adaptiveOnChange(of: precise) { _, tenue in
            guard tenue == nil else { return }
            settle()
        }
        .adaptiveOnChange(of: dragging) { _, tenue in
            guard tenue == nil else { return }
            settle()
        }
        .task(id: url) { @MainActor in await load() }
    }

    /// Les vignettes puis l'onde, hors du fil principal ; un clip muet n'a pas d'onde.
    private func load() async {
        frames = await ComposerTrimThumbnails.images(url: url, count: Self.thumbnailCount)
        samples = (try? await WaveformCache.shared.samples(from: url, count: Self.waveformSamples)) ?? []
    }

    /// Le geste est fini : la boucle joue la plage choisie.
    private func settle() {
        origin = nil
        session.setTrim(range, committed: true)
    }

    // MARK: - Les bornes

    /// **Le début, la durée gardée, la fin — toujours lisibles**, à la
    /// milliseconde : on rogne en lisant, pas en devinant. Pendant un réglage
    /// de précision, le temps de la poignée tenue prend leur place.
    private var bounds: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Text(ComposerTrimRule.millisecondText(range.lowerBound))
            Spacer(minLength: 0)
            Text(ComposerTrimRule.millisecondText(range.upperBound - range.lowerBound))
                .foregroundStyle(Color.yellow)
            Spacer(minLength: 0)
            Text(ComposerTrimRule.millisecondText(range.upperBound))
        }
        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold, design: .monospaced))
        .foregroundStyle(.white.opacity(0.9))
        .shadow(color: .black.opacity(0.6), radius: 2, y: 1)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .padding(.horizontal, MeeshySpacing.mdPlus + Self.handleWidth)
        .frame(height: Self.boundsHeight)
        .opacity(precise == nil ? 1 : 0)
        .accessibilityHidden(true)
    }

    // MARK: - La bande

    /// La piste à l'échelle 1 ; en précision, une LOUPE par-dessus — jamais la
    /// piste dilatée 40 fois (≈ 14 000 pt, au-delà d'une texture).
    private func strip(_ piste: ComposerTrimTrackGeometry) -> some View {
        ZStack(alignment: .leading) {
            Color.white.opacity(0.12)
            HStack(spacing: 0) {
                ForEach(Array(frames.enumerated()), id: \.offset) { _, image in
                    Image(decorative: image, scale: 1)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: piste.width / CGFloat(max(1, frames.count)), height: Self.height)
                        .clipped()
                }
            }
            waveform(width: piste.width).opacity(0.25)
            Color.black.opacity(0.55)
                .frame(width: max(0, piste.offset(for: range.lowerBound)), height: Self.height)
            Color.black.opacity(0.55)
                .frame(width: max(0, piste.width - piste.offset(for: range.upperBound)), height: Self.height)
                .offset(x: piste.offset(for: range.upperBound))
            if let precise { loupe(precise, piste) }
        }
        .frame(width: piste.width, height: Self.height, alignment: .leading)
        .contentShape(Rectangle())
        .gesture(SpatialTapGesture(count: 1, coordinateSpace: .local).onEnded { toucher in
            HapticFeedback.light()
            session.seekPlayhead(to: ComposerTrimRule.time(atX: toucher.location.x, width: piste.width,
                                                           duration: duration))
        })
        .offset(x: piste.inset)
        .accessibilityElement()
        .accessibilityLabel(ComposerCaptureCopy.playhead)
        .accessibilityValue(ComposerTrimRule.millisecondText(currentPlayhead))
        .accessibilityAdjustableAction { sens in
            switch sens {
            case .increment: session.seekPlayhead(to: currentPlayhead + Self.accessiblePlayheadStep)
            case .decrement: session.seekPlayhead(to: currentPlayhead - Self.accessiblePlayheadStep)
            @unknown default: break
            }
        }
    }

    private var currentPlayhead: TimeInterval {
        ComposerTrimRule.playhead(session.loopPlayer?.currentTime ?? range.lowerBound, in: range)
    }

    /// **La loupe de précision** : une règle de la SEULE fenêtre visible (un trait
    /// toutes les 10 ms, un grand toutes les 100 ms), qui défile sous un trait fixe
    /// au centre ; le temps exact se lit au-dessus, à la milliseconde.
    private func loupe(_ poignee: ComposerTrimHandle, _ piste: ComposerTrimTrackGeometry) -> some View {
        let echelle = ComposerTrimRule.precisePointsPerSecond(piste.pointsPerSecond)
        let instant = time(of: poignee)
        let fenetre = ComposerTrimRule.precisionWindow(anchor: instant, width: piste.width, pointsPerSecond: echelle)
        let fin = duration
        return Canvas { contexte, taille in
            contexte.fill(Path(CGRect(origin: .zero, size: taille)), with: .color(.black.opacity(0.78)))
            let premier = Int((max(0, fenetre.lowerBound) * 100).rounded(.up))
            let dernier = Int((min(fin, fenetre.upperBound) * 100).rounded(.down))
            guard premier <= dernier else { return }
            for centieme in premier...dernier {
                let posX = taille.width / 2 + CGFloat(TimeInterval(centieme) / 100 - instant) * echelle
                let grand = centieme % 10 == 0
                let hauteur = taille.height * (grand ? 0.6 : 0.3)
                contexte.fill(Path(CGRect(x: posX, y: taille.height - hauteur, width: 1, height: hauteur)),
                              with: .color(.white.opacity(grand ? 0.9 : 0.5)))
            }
            contexte.fill(Path(CGRect(x: taille.width / 2 - 1, y: 0, width: 2, height: taille.height)),
                          with: .color(.yellow))
        }
        .frame(width: piste.width, height: Self.height)
        .allowsHitTesting(false)
        .transition(.opacity)
    }

    private func waveform(width: CGFloat) -> some View {
        let releve = samples
        return Path { chemin in
            guard !releve.isEmpty else { return }
            let pas = width / CGFloat(releve.count)
            for (index, valeur) in releve.enumerated() {
                let hauteur = max(2, CGFloat(valeur) * Self.height)
                chemin.addRect(CGRect(x: CGFloat(index) * pas, y: (Self.height - hauteur) / 2,
                                      width: max(1, pas - 1), height: hauteur))
            }
        }
        .fill(Color.white)
        .frame(width: width, height: Self.height)
    }

    /// Le liseré de la plage gardée, d'une poignée à l'autre.
    private func selectionEdges(_ piste: ComposerTrimTrackGeometry) -> some View {
        let largeur = max(0, piste.offset(for: range.upperBound) - piste.offset(for: range.lowerBound))
        return VStack(spacing: 0) {
            Color.yellow.frame(height: 3)
            Spacer(minLength: 0)
            Color.yellow.frame(height: 3)
        }
        .frame(width: largeur, height: Self.height)
        .offset(x: piste.x(for: range.lowerBound))
        .opacity(precise == nil ? 1 : 0)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    /// Le temps de la poignée tenue, au-dessus du trait fixe.
    @ViewBuilder
    private var readout: some View {
        if let precise {
            Text(ComposerTrimRule.millisecondText(time(of: precise)))
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .bold, design: .monospaced))
                .foregroundStyle(.white)
                .padding(.horizontal, MeeshySpacing.sm)
                .padding(.vertical, MeeshySpacing.xxs)
                .background(Color.black.opacity(0.6), in: Capsule())
                .alignmentGuide(.top) { $0[.bottom] + MeeshySpacing.xs }
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }

    /// La tête suit la boucle au rythme du palier thermique, et s'efface pendant
    /// un réglage de précision (la loupe la remplace).
    private func playheadLine(_ piste: ComposerTrimTrackGeometry) -> some View {
        let cadence = 1.0 / Double(ComposerCaptureSurfaceRule.editFPS(session.thermalBudget))
        return TimelineView(.animation(minimumInterval: cadence, paused: precise != nil)) { _ in
            Capsule()
                .fill(Color.white)
                .frame(width: 2, height: Self.height)
                .shadow(color: .black.opacity(0.5), radius: 1)
                .offset(x: piste.x(for: currentPlayhead) - 1)
        }
        .opacity(precise == nil ? 1 : 0)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    // MARK: - Les poignées

    /// Une poignée : sa barre jaune au bord de la plage, arrondie vers
    /// l'extérieur, une prise sobre en son milieu, dans une cible de 44 pt.
    /// Tenue en précision, elle se range sous le trait fixe, au centre ; l'autre
    /// s'efface, la loupe ne montrant que les abords de la première.
    private func handle(_ poignee: ComposerTrimHandle, _ piste: ComposerTrimTrackGeometry) -> some View {
        let temps = time(of: poignee)
        let bord = precise == poignee ? piste.inset + piste.width / 2 : piste.x(for: temps)
        let centre = poignee == .start ? bord - Self.handleWidth / 2 : bord + Self.handleWidth / 2
        let dehors = Self.frameRadius
        return UnevenRoundedRectangle(topLeadingRadius: poignee == .start ? dehors : 0,
                                      bottomLeadingRadius: poignee == .start ? dehors : 0,
                                      bottomTrailingRadius: poignee == .end ? dehors : 0,
                                      topTrailingRadius: poignee == .end ? dehors : 0,
                                      style: .continuous)
            .fill(Color.yellow)
            .overlay(Capsule().fill(Color.black.opacity(0.55)).frame(width: 3, height: 18))
            .shadow(color: .black.opacity(0.35), radius: 2, y: 1)
            .frame(width: Self.handleWidth, height: Self.height)
            .frame(width: MeeshyControlSize.tapTarget, height: Self.height)
            .contentShape(Rectangle())
            .offset(x: centre - MeeshyControlSize.tapTarget / 2)
            .opacity(precise != nil && precise != poignee ? 0 : 1)
            .gesture(precisionGesture(poignee, piste).exclusively(before: coarseGesture(poignee, piste)))
            .accessibilityElement()
            .accessibilityLabel(poignee == .start ? ComposerCaptureCopy.trimStart : ComposerCaptureCopy.trimEnd)
            .accessibilityValue(ComposerTrimRule.millisecondText(temps))
            .accessibilityHint(ComposerCaptureCopy.trimPrecisionHint)
            .accessibilityAdjustableAction { sens in
                switch sens {
                case .increment: move(poignee, to: temps + Self.accessibleStep, committed: true)
                case .decrement: move(poignee, to: temps - Self.accessibleStep, committed: true)
                @unknown default: break
                }
            }
    }

    /// Le glissé simple : la poignée suit le doigt, à l'échelle de la piste. La
    /// course se mesure dans le repère GLOBAL — la poignée bouge sous le doigt,
    /// et son propre repère avec elle.
    private func coarseGesture(_ poignee: ComposerTrimHandle, _ piste: ComposerTrimTrackGeometry) -> some Gesture {
        DragGesture(minimumDistance: 2, coordinateSpace: .global)
            .updating($dragging) { _, tenue, _ in tenue = poignee }
            .onChanged { valeur in
                guard piste.pointsPerSecond > 0 else { return }
                let depart = origin ?? time(of: poignee)
                if origin == nil { origin = depart }
                move(poignee, to: depart + TimeInterval(valeur.translation.width / piste.pointsPerSecond),
                     committed: false)
            }
    }

    /// **L'appui long dilate la piste autour de la poignée** ; le doigt fait
    /// défiler la bande sous le trait fixe — on AMÈNE l'instant, on ne le vise pas.
    private func precisionGesture(_ poignee: ComposerTrimHandle, _ piste: ComposerTrimTrackGeometry) -> some Gesture {
        LongPressGesture(minimumDuration: 0.4, maximumDistance: 4)
            .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .global))
            .updating($precise) { valeur, tenue, _ in
                guard case .second(true, _) = valeur else { return }
                tenue = poignee
            }
            .onChanged { valeur in
                guard case .second(true, let glisse) = valeur else { return }
                let depart = origin ?? time(of: poignee)
                if origin == nil {
                    origin = depart
                    HapticFeedback.medium()
                }
                let temps = ComposerTrimRule.preciseTime(
                    anchor: depart, translationX: glisse?.translation.width ?? 0,
                    pointsPerSecond: ComposerTrimRule.precisePointsPerSecond(piste.pointsPerSecond))
                move(poignee, to: temps, committed: false)
            }
    }

    /// **Pendant le geste, l'aperçu montre la frame EXACTE sous la poignée**
    /// (#9754) ; sa fin relance la boucle sur la plage gardée (`settle`).
    private func move(_ poignee: ComposerTrimHandle, to temps: TimeInterval, committed: Bool) {
        let nouvelle = poignee == .start
            ? ComposerTrimRule.movedStart(temps, range: range)
            : ComposerTrimRule.movedEnd(temps, range: range, duration: duration)
        session.setTrim(nouvelle, committed: committed)
        guard !committed else { return }
        session.scrubTrim(to: ComposerTrimRule.scrubTime(handle: poignee, range: nouvelle))
    }
}
