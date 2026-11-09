import SwiftUI
import AVFoundation
import MeeshySDK
import MeeshyUI

/// **Ce qu'une barre MONTRE** (#14214) : une vidéo y déroule ses vignettes,
/// un son sa forme d'onde — les briques de l'atelier (`VideoFilmstrip`,
/// `WaveformCache`, `WaveformStrip`), en cache : rouvrir la frise ne relance
/// aucune extraction. Une autre famille ne montre rien de plus que sa couleur.
struct ComposerSceneFriseBarContent: View {
    let kind: SceneFriseTrack.Kind
    let url: URL?
    let publishedSamples: [Float]
    /// La fenêtre de source que le clip JOUE (#14268) : un clip coupé ne
    /// montre que ses vignettes et son onde. `nil` ⇒ la source entière.
    var window: ClosedRange<Double>?
    /// Ce que la barre ÉCRIT (#17110) : le texte, l'emoji, le lieu.
    var caption: String = ""

    @State private var vignettes: [UIImage] = []
    @State private var image: UIImage?
    @State private var mesure: [Float] = []
    @State private var duree: Double?
    @Environment(\.displayScale) private var echelle

    var body: some View {
        switch ComposerSceneFriseMetrics.barContent(kind: kind) {
        case .filmstrip: filmstrip
        case .waveform: onde
        case .picture: vignette
        case .caption: legende
        }
    }

    /// Le texte de l'objet, en clair dans sa barre.
    private var legende: some View {
        Text(caption)
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
            .foregroundStyle(Color.white)
            .lineLimit(1)
            .truncationMode(.tail)
            .padding(.horizontal, MeeshySpacing.sm)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }

    /// L'image posée, réduite UNE fois à la hauteur de la piste.
    private var vignette: some View {
        HStack(spacing: MeeshySpacing.xs) {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: ComposerSceneFriseMetrics.trackHeight, height: ComposerSceneFriseMetrics.trackHeight)
                    .clipped()
            }
            legende
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .task(id: url) {
            guard let url, url.isFileURL else { return }
            let cote = ComposerSceneFriseMetrics.trackHeight * echelle
            image = await Self.decode(url, cote: cote)
        }
    }

    @concurrent
    private static func decode(_ url: URL, cote: CGFloat) async -> UIImage? {
        SceneImageDownsampling.image(fileAt: url, maxPixelSize: cote)
    }

    private var filmstrip: some View {
        GeometryReader { geo in
            HStack(spacing: 0) {
                ForEach(vignettes.indices, id: \.self) { rang in
                    Image(uiImage: vignettes[rang])
                        .resizable()
                        .scaledToFill()
                        .frame(width: geo.size.width / CGFloat(max(vignettes.count, 1)), height: geo.size.height)
                        .clipped()
                }
            }
        }
        .opacity(0.85)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .task(id: ComposerSceneFriseBarKey(url: url, window: window)) {
            guard let url else { return }
            if let window {
                vignettes = await VideoFilmstrip.frames(url: url, count: ComposerSceneFriseMetrics.filmstripFrames,
                                                        window: window,
                                                        maxHeight: ComposerSceneFriseMetrics.trackHeight, scale: echelle)
            } else {
                vignettes = await VideoFilmstrip.frames(url: url, count: ComposerSceneFriseMetrics.filmstripFrames,
                                                        maxHeight: ComposerSceneFriseMetrics.trackHeight, scale: echelle)
            }
        }
    }

    private var onde: some View {
        // La mesure locale prime (haute résolution, amplitude réelle) ; le
        // champ publié reste le repli d'un brouillon rouvert (#9886).
        WaveformStrip(samples: mesure.isEmpty ? ComposerSceneFriseMetrics.samples(publishedSamples, window: window,
                                                                                 sourceDuration: duree) : mesure,
                      tint: Color.white.opacity(0.8),
                      reading: mesure.isEmpty ? .published : .measured)
            .allowsHitTesting(false)
            .task(id: ComposerSceneFriseBarKey(url: url, window: window)) {
                guard let url else { return }
                let source = try? await AVURLAsset(url: url).load(.duration).seconds
                duree = source
                let fines = (try? await WaveformCache.shared.samples(
                    from: url, count: ComposerSceneFriseMetrics.waveformSamples * 4)) ?? []
                mesure = ComposerSceneFriseMetrics.samples(fines, window: window, sourceDuration: source)
            }
    }
}

/// Ce qui relance l'extraction d'une barre : son fichier OU sa fenêtre coupée.
struct ComposerSceneFriseBarKey: Equatable {
    let url: URL?
    let window: ClosedRange<Double>?
}
