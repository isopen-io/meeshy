import CoreImage
import SwiftUI

/// **Le chrome du viseur reste lisible sur un cadre clair** (#9777) — la croix, le flash, la
/// bascule, les zooms, « Filtres / Cadres » et le nom du cadre sont BLANCS : posés sur un
/// Photomaton, une Carte postale ou un Faire-part, ils disparaissaient. Sous un cadre, un voile
/// sombre passe derrière la rangée haute et le bas de la capture, juste assez dense pour que le
/// blanc garde 4,5:1 (WCAG AA) sur la bande du cadre qu'il couvre, mesurée : nul sur un cadre
/// sombre, 55 % au plus sur un fond blanc pur. Sans cadre, rien ne change.
nonisolated enum ComposerCaptureChromeLegibility {
    static let minimumContrast: Double = 4.5
    static let veilOpacity: Double = 0.55
    /// Le fondu du voile, AU-DELÀ des contrôles : ils restent posés sur sa partie pleine.
    static let feather: CGFloat = 28

    static func veilOpacity(framed: Bool) -> Double {
        framed ? veilOpacity : 0
    }

    /// Luminance relative WCAG d'une composante sRGB (0…1).
    static func linear(_ channel: Double) -> Double {
        channel <= 0.04045 ? channel / 12.92 : pow((channel + 0.055) / 1.055, 2.4)
    }

    /// Le contraste de l'encre BLANCHE sur un fond gris `background` (0…1) recouvert d'un voile noir d'opacité `veil`.
    static func whiteInkContrast(background: Double, veil: Double) -> Double {
        let seen = background * (1 - veil)
        return (1.0 + 0.05) / (linear(seen) + 0.05)
    }

    // MARK: - Le voile mesuré sur la bande (#9777, recette #9755)

    /// Les parts de la hauteur que le chrome couvre : la rangée haute, puis le bas
    /// (zooms, « Filtres / Cadres », nom du cadre, déclencheur).
    static let topBand: CGFloat = 0.16
    static let bottomBand: CGFloat = 0.32
    /// La moyenne LOCALE qu'on mesure : une étincelle isolée ne noircit pas le viseur.
    static let sampleRadius: Double = 12
    private static let margin = 0.01

    /// Composante sRGB d'une luminance relative (0…1).
    static func encoded(_ luminance: Double) -> Double {
        luminance <= 0.0031308 ? luminance * 12.92 : 1.055 * pow(luminance, 1 / 2.4) - 0.055
    }

    /// Le voile le plus LÉGER qui garde 4,5:1 à l'encre blanche sur une bande de
    /// luminance relative `bandLuminance` : nul sur un cadre sombre, jamais plus
    /// dense que le voile fixe d'avant.
    static func veilOpacity(bandLuminance: Double) -> Double {
        let plafond = encoded(1.05 / minimumContrast - 0.05)
        let fond = encoded(min(max(bandLuminance, 0), 1))
        guard fond > plafond else { return 0 }
        return min(veilOpacity, 1 - plafond / fond + margin)
    }

    /// Sans cadre, aucun voile ; sous un cadre que la mesure n'a pas encore lu,
    /// le voile plein.
    static func veilOpacity(framed: Bool, bandLuminance: Double?) -> Double {
        guard framed else { return 0 }
        return bandLuminance.map(veilOpacity(bandLuminance:)) ?? veilOpacity
    }

    /// La luminance relative des zones les plus claires des deux bandes du cadre
    /// peint (moyennes locales). Une case vide (la caméra) compte pour du noir :
    /// sans cadre, le viseur n'a jamais eu de voile. À appeler HORS du fil principal.
    static func bands(of scene: CallLiveFrameScene, context: CIContext = ComposerLookGPU.context) -> ComposerCaptureChromeBands? {
        let hauteur = scene.size.height
        let largeur = scene.size.width
        let peint = scene.overlay.composited(over: scene.backdrop)
        let haut = CGRect(x: 0, y: hauteur * (1 - topBand), width: largeur, height: hauteur * topBand)
        let bas = CGRect(x: 0, y: 0, width: largeur, height: hauteur * bottomBand)
        guard let clairHaut = brightest(peint, in: haut, context: context),
              let clairBas = brightest(peint, in: bas, context: context) else { return nil }
        return ComposerCaptureChromeBands(top: clairHaut, bottom: clairBas)
    }

    private static func brightest(_ image: CIImage, in band: CGRect, context: CIContext) -> Double? {
        guard band.width >= 1, band.height >= 1 else { return nil }
        let luma = CIVector(x: 0.2126, y: 0.7152, z: 0.0722, w: 0)
        let maximum = image.cropped(to: band).clampedToExtent()
            .applyingFilter("CIColorMatrix", parameters: ["inputRVector": luma, "inputGVector": luma,
                                                          "inputBVector": luma])
            .applyingFilter("CIBoxBlur", parameters: [kCIInputRadiusKey: sampleRadius])
            .cropped(to: band)
            .applyingFilter("CIAreaMaximum", parameters: [kCIInputExtentKey: CIVector(cgRect: band)])
        var pixel = [Float](repeating: 0, count: 4)
        context.render(maximum, toBitmap: &pixel, rowBytes: 16, bounds: CGRect(origin: maximum.extent.origin, size: CGSize(width: 1, height: 1)),
                       format: .RGBAf, colorSpace: nil)
        return pixel[0].isFinite ? min(max(Double(pixel[0]), 0), 1) : nil
    }
}

/// La luminance relative (0…1) des bandes du cadre que le chrome du viseur couvre,
/// et le cadre qu'elle mesure : une mesure ne règle jamais le voile d'un AUTRE cadre.
nonisolated struct ComposerCaptureChromeBands: Equatable, Sendable {
    let top: Double
    let bottom: Double
    var frame: String = ""

    func measuring(_ frame: ComposerPhotoFrame) -> ComposerCaptureChromeBands? {
        self.frame == ComposerLookSceneKey.token(frame) ? self : nil
    }
}

/// Le voile derrière un bord du chrome : plein sous les contrôles, fondu au-delà.
struct ComposerCaptureChromeVeil: View {
    let edge: VerticalEdge
    let opacity: Double

    var body: some View {
        let dense = Color.black.opacity(opacity)
        let fade = LinearGradient(colors: [dense, .clear],
                                  startPoint: edge == .top ? .top : .bottom,
                                  endPoint: edge == .top ? .bottom : .top)
            .frame(height: ComposerCaptureChromeLegibility.feather)
        VStack(spacing: 0) {
            if edge == .bottom { fade }
            dense
            if edge == .top { fade }
        }
        .padding(edge == .top ? Edge.Set.bottom : Edge.Set.top, -ComposerCaptureChromeLegibility.feather)
        .ignoresSafeArea(edges: edge == .top ? Edge.Set.top : Edge.Set.bottom)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

// MARK: - La mesure, à côté du viseur

extension ComposerCaptureChromeLegibility {
    /// La scène que l'aperçu peint ou va peindre : le cache la cuit une fois pour les deux.
    static func scene(for key: ComposerLookSceneKey,
                      cache: any ComposerLookSceneProviding = ComposerLookSceneCache.shared) async -> CallLiveFrameScene? {
        if let scene = cache.cached(key) { return scene }
        await withCheckedContinuation { (fin: CheckedContinuation<Void, Never>) in
            cache.prepare(key) { fin.resume() }
        }
        return cache.cached(key)
    }

    @concurrent
    static func measuredBands(of scene: CallLiveFrameScene) async -> ComposerCaptureChromeBands? {
        bands(of: scene)
    }
}

/// Mesure le cadre sous le chrome à chaque changement de look, puis anime le voile.
/// Un filtre changé garde la mesure du même cadre ; un autre cadre attend la sienne
/// sous le voile plein (`ComposerCaptureChromeBands.measuring`).
struct ComposerCaptureChromeBandWatch: ViewModifier {
    let key: ComposerLookSceneKey?
    @Binding var bands: ComposerCaptureChromeBands?
    let veils: [Double]
    let animation: Animation?

    func body(content: Content) -> some View {
        content
            .animation(animation, value: veils)
            .task(id: key) {
                guard let key else { return }
                guard let scene = await ComposerCaptureChromeLegibility.scene(for: key),
                      let mesure = await ComposerCaptureChromeLegibility.measuredBands(of: scene),
                      !Task.isCancelled else { return }
                bands = ComposerCaptureChromeBands(top: mesure.top, bottom: mesure.bottom,
                                                   frame: ComposerLookSceneKey.token(key.look.frame))
            }
    }
}
