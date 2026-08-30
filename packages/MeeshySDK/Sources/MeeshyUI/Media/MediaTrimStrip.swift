import SwiftUI
import UIKit
import MeeshySDK

/// **La bande de rognage d'un média posé sur une scène (#4082).**
///
/// Elle montre la source ENTIÈRE et laisse deux poignées désigner ce qu'on
/// garde. Montrer seulement la portion retenue serait plus simple et beaucoup
/// moins utile : on rogne en regardant ce qu'on RETIRE — le plan de trop au
/// début, le silence à la fin. Les zones écartées restent donc visibles,
/// assombries.
///
/// **Elle n'encode rien.** Les trois éditeurs de média du dépôt
/// (`MeeshyVideoEditorView`, `MeeshyAudioEditorView`, `AudioEditEngine`) cuisent
/// un nouveau fichier au confirm ; c'est juste pour une pièce jointe de
/// conversation, et faux pour une story, dont la doctrine de publication veut
/// que le serveur reçoive la source d'origine et les objets qui la décrivent.
/// Cette bande ne produit donc qu'une paire de bornes, remises à chaque image du
/// geste (loi 7 du milestone : ce qu'on modifie se voit IMMÉDIATEMENT, sans
/// « Appliquer »).
///
/// **Elle ne décide de rien non plus.** Le clamp, le plancher de durée et la
/// conversion points → secondes vivent dans `MediaTrimRule`, hors de toute vue :
/// une poignée qui traverse l'autre ou une fenêtre qui sort du fichier sont des
/// défauts qui ne se voient pas sur une capture et se prouvent en une ligne de
/// test.
public struct MediaTrimStrip: View {

    /// Ce que la bande donne à VOIR au milieu — la nature du média, pas son
    /// stockage. Un son n'a pas de vignettes ; une vidéo en a, et porte en plus
    /// une onde quand sa piste audio a été analysée.
    public enum Content: Equatable, Sendable {
        case video(URL)
        case audio
    }

    private let content: Content
    private let sourceDuration: Double
    private let bounds: MediaTrimBounds
    private let waveform: [Float]
    private let accent: Color
    private let onChange: (MediaTrimBounds) -> Void
    private let onCommit: (() -> Void)?

    @State private var frames: [UIImage] = []

    public init(content: Content,
                sourceDuration: Double,
                bounds: MediaTrimBounds,
                waveform: [Float] = [],
                accent: Color = MeeshyColors.brandPrimary,
                onChange: @escaping (MediaTrimBounds) -> Void,
                onCommit: (() -> Void)? = nil) {
        self.content = content
        self.sourceDuration = sourceDuration
        self.bounds = bounds
        self.waveform = waveform
        self.accent = accent
        self.onChange = onChange
        self.onCommit = onCommit
    }

    private static let hauteur: CGFloat = 56

    public var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            GeometryReader { geo in
                piste(largeur: geo.size.width)
            }
            .frame(height: Self.hauteur)
            legende
        }
        .task(id: taskKey) { await chargerLesVignettes() }
    }

    // MARK: - La piste

    private func piste(largeur: CGFloat) -> some View {
        let debut = position(ofSecond: bounds.start, in: largeur)
        let fin = position(ofSecond: bounds.end, in: largeur)

        return ZStack(alignment: .leading) {
            source
                .frame(width: largeur, height: Self.hauteur)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

            // Ce qu'on RETIRE, assombri mais lisible : c'est en le voyant qu'on
            // sait si la poignée est au bon endroit.
            voile(largeur: debut, decalage: 0)
            voile(largeur: max(0, largeur - fin), decalage: fin)

            fenetre(x: debut, largeur: max(0, fin - debut), pisteLargeur: largeur)
        }
    }

    @ViewBuilder
    private var source: some View {
        switch content {
        case .video:
            if frames.isEmpty {
                enAttente
            } else {
                HStack(spacing: 0) {
                    ForEach(frames.indices, id: \.self) { i in
                        Image(uiImage: frames[i])
                            .resizable()
                            .scaledToFill()
                            .frame(maxWidth: .infinity)
                            .clipped()
                    }
                }
                .overlay(alignment: .bottom) {
                    if !waveform.isEmpty {
                        WaveformStrip(samples: waveform, tint: .white.opacity(0.75))
                            .frame(height: Self.hauteur * 0.34)
                    }
                }
            }
        case .audio:
            if waveform.isEmpty {
                enAttente
            } else {
                WaveformStrip(samples: waveform, tint: accent)
                    .background(Color.black.opacity(0.28))
            }
        }
    }

    /// **L'attente est DESSINÉE, jamais un rectangle gris** (loi 6 du
    /// milestone : toute vignette montre la donnée en visuel). Tant que la
    /// donnée n'est pas là, on montre qu'on l'attend — et on le DIT, pour que
    /// l'absence ne se lise pas comme un média vide.
    private var enAttente: some View {
        ZStack {
            LinearGradient(colors: [accent.opacity(0.18), accent.opacity(0.06)],
                           startPoint: .leading, endPoint: .trailing)
            ProgressView()
                .progressViewStyle(.circular)
                .tint(.white.opacity(0.8))
        }
        .accessibilityLabel(Self.chargementLabel)
    }

    private func voile(largeur: CGFloat, decalage: CGFloat) -> some View {
        Rectangle()
            .fill(Color.black.opacity(0.62))
            .frame(width: max(0, largeur), height: Self.hauteur)
            .offset(x: decalage)
            .allowsHitTesting(false)
    }

    /// La fenêtre gardée : un cadre à l'accent, et les DEUX poignées de
    /// précision posées à ses extrémités. `ClipTrimHandles` est le composant que
    /// les trois barres de la timeline partagent déjà — il convertit la
    /// translation CUMULÉE du geste en deltas INCRÉMENTAUX, sans quoi la dérive
    /// composerait quadratiquement à chaque image.
    private func fenetre(x: CGFloat, largeur: CGFloat, pisteLargeur: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: 8, style: .continuous)
            .strokeBorder(accent, lineWidth: 2.5)
            .frame(width: largeur, height: Self.hauteur)
            .overlay {
                ClipTrimHandles(
                    laneHeight: Self.hauteur,
                    onTrimStartDelta: { points in appliquer(points, surLeDebut: true, pisteLargeur: pisteLargeur) },
                    onTrimEndDelta: { points in appliquer(points, surLeDebut: false, pisteLargeur: pisteLargeur) }
                )
                .frame(width: largeur, height: Self.hauteur)
            }
            .offset(x: x)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(Self.fenetreLabel)
            .accessibilityValue(Self.duree(bounds.duration))
    }

    private var legende: some View {
        HStack(spacing: 8) {
            Text(Self.duree(bounds.duration))
                .font(MeeshyFont.relative(12, weight: .semibold))
                .foregroundStyle(accent)
            Text(Self.surLabel(Self.duree(sourceDuration)))
                .font(MeeshyFont.relative(12, weight: .regular))
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
        }
    }

    // MARK: - Le geste

    /// **La largeur rendue représente la source ENTIÈRE** — c'est cette
    /// convention, et elle seule, qui rend la conversion points → secondes
    /// exacte. La changer (montrer une fenêtre zoomée) demanderait de passer
    /// l'échelle à `MediaTrimRule`, pas de la recalculer ici.
    private func appliquer(_ points: CGFloat, surLeDebut: Bool, pisteLargeur: CGFloat) {
        guard pisteLargeur > 0 else { return }
        let delta = MediaTrimRule.seconds(forHandleDelta: points,
                                          stripWidth: pisteLargeur,
                                          sourceDuration: sourceDuration)
        let suivant = surLeDebut
            ? MediaTrimRule.movingStart(bounds, by: delta, sourceDuration: sourceDuration)
            : MediaTrimRule.movingEnd(bounds, by: delta, sourceDuration: sourceDuration)
        guard suivant != bounds else { return }
        onChange(suivant)
        onCommit?()
    }

    /// **La largeur voyage en ARGUMENT, jamais dans un `@State`.** La retenir
    /// obligerait à l'écrire pendant le calcul du corps — un `DispatchQueue.main.async`
    /// au milieu d'un rendu, donc un rendu de plus à chaque mesure, et une boucle
    /// dès que la mesure varie d'un point. Le `GeometryReader` la DONNE déjà : il
    /// suffit de la passer jusqu'à la poignée qui en a besoin.
    private func position(ofSecond seconde: Double, in largeur: CGFloat) -> CGFloat {
        guard sourceDuration > 0 else { return 0 }
        return CGFloat(seconde / sourceDuration) * largeur
    }

    // MARK: - Les vignettes

    private var taskKey: String {
        switch content {
        case .video(let url): return url.absoluteString
        case .audio: return "audio"
        }
    }

    private func chargerLesVignettes() async {
        guard case .video(let url) = content else { return }
        // `VideoFilmstrip` cache par URL + compte + hauteur : rouvrir la bande
        // sur le même clip ne relance aucune extraction.
        frames = await VideoFilmstrip.frames(url: url, count: 8, maxHeight: Self.hauteur)
    }

    // MARK: - Les mots

    static func duree(_ secondes: Double) -> String {
        let total = max(0, Int(secondes.rounded()))
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    static let chargementLabel = String(
        localized: "media.trim.loading",
        defaultValue: "Chargement de l'aperçu",
        bundle: .module)

    static let fenetreLabel = String(
        localized: "media.trim.window",
        defaultValue: "Portion conservée",
        bundle: .module)

    static func surLabel(_ total: String) -> String {
        String(format: String(localized: "media.trim.of_total",
                              defaultValue: "sur %@",
                              bundle: .module), total)
    }
}
