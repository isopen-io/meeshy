import UIKit
import QuartzCore
import AVFoundation
import MeeshySDK

// MARK: - Le texte en feu (#17112, L10)

/// **Les flammes de l'effet Flamme brûlent SUR les lettres** (retour porteur du
/// 2026-11-08 : « les flammes doivent être sur les lettres pour le texte en
/// feu »). Ce n'est ni une bande de feu posée derrière le texte, ni une teinte :
///
/// 1. la **silhouette** naît de la couverture des glyphes — pleine dans chaque
///    lettre, elle monte au-dessus d'elle en s'éteignant, colonne par colonne,
///    avec des langues de hauteurs différentes (`flameSilhouette`) ;
/// 2. un **feu** — une texture de bruit qui boucle sans couture verticalement
///    (`textureAlpha`) — défile vers le haut À TRAVERS cette silhouette ;
/// 3. la **chaleur** colore le tout, blanc-jaune à la base des lettres, rouge
///    et transparent à la pointe des flammes (`heatStops`).
///
/// Les trois rendus partagent ces fonctions : le canvas et le lecteur
/// (`StoryFlameLayer`, animée par Core Animation hors du fil principal — rien à
/// recalculer pendant la frappe), l'éditeur en ligne, et l'image fixe de la
/// couverture, du thumbHash et de l'export (`drawStill`). Tout est
/// DÉTERMINISTE : la même phase rend les mêmes pixels, et la phase 0 est
/// l'image fixe des vignettes et du mouvement réduit.
public nonisolated enum StoryFlameTextRenderer {

    /// Hauteur des flammes au-dessus des lettres, en fraction de la taille de
    /// police : l'effet grandit avec le texte, comme toute la table des effets.
    public static let lickHeightEm: CGFloat = 0.9

    /// Durée d'une montée complète du feu.
    public static let cycleDuration: CFTimeInterval = 1.4

    /// La seconde nappe de feu monte plus lentement : leur somme ne se répète
    /// jamais à l'œil, ce qui fait danser les langues.
    static let swayRatio: Double = 1.37
    static let swayOpacity: Double = 0.65

    static let textureWidth = 64
    static let texturePeriod = 128
    static let riseSeed: UInt32 = 0x5EED_F1A3
    static let swaySeed: UInt32 = 0x0B1A_2E57

    /// Densité plafond des masques : les flammes sont douces, et le glyphe net
    /// reste peint dessous — plus fin coûterait sans se voir.
    static let maxMaskScale: CGFloat = 1.5
    static let maxMaskPixels = 4_000_000

    public static func lickHeight(fontSize: CGFloat) -> CGFloat {
        max(0, fontSize * lickHeightEm)
    }

    /// Le mouvement réduit fige le feu sur sa phase 0 — le contenu reste, le
    /// mouvement part, comme pour un sticker animé.
    @MainActor
    public static var motionAllowed: Bool { !UIAccessibility.isReduceMotionEnabled }

    /// Phase d'un cycle (0..<1) à `elapsed` secondes — l'horloge de l'export.
    public static func phase(atElapsed elapsed: Double, duration: Double) -> Double {
        guard duration > 0 else { return 0 }
        let wrapped = elapsed.truncatingRemainder(dividingBy: duration)
        return (wrapped < 0 ? wrapped + duration : wrapped) / duration
    }

    // MARK: - La silhouette

    /// **La flamme naît des lettres et ne descend jamais.** Chaque rangée
    /// reprend la rangée du DESSOUS, adoucie latéralement et atténuée par un
    /// facteur propre à la colonne : les langues montent à des hauteurs
    /// différentes et s'éteignent en `lickRows` rangées environ. La couverture
    /// d'origine reste pleine à l'intérieur des glyphes.
    ///
    /// `coverage` est rangé de haut en bas (rangée 0 = sommet), comme la
    /// mémoire d'un `CGContext` bitmap.
    public static func flameSilhouette(coverage: [UInt8], width: Int, height: Int,
                                       lickRows: Int) -> [UInt8] {
        guard width > 0, height > 1, lickRows > 0, coverage.count == width * height else {
            return coverage
        }
        let decays = (0..<width).map { columnDecay(x: $0, width: width, lickRows: lickRows) }
        var flames = coverage
        for y in stride(from: height - 2, through: 0, by: -1) {
            let below = (y + 1) * width
            let here = y * width
            for x in 0..<width {
                let left = Double(flames[below + max(x - 1, 0)])
                let centre = Double(flames[below + x])
                let right = Double(flames[below + min(x + 1, width - 1)])
                let rising = (left + 6 * centre + right) / 8 * decays[x]
                flames[here + x] = max(coverage[here + x], UInt8(min(255, rising.rounded(.down))))
            }
        }
        return flames
    }

    /// Atténuation par rangée d'une colonne : 255 tombe vers ~8 au bout de sa
    /// portée, qui varie de 45 % à 100 % de `lickRows` le long du texte.
    static func columnDecay(x: Int, width: Int, lickRows: Int) -> Double {
        let u = Double(x) / Double(max(width, 1))
        let reach = Double(lickRows) * (0.45 + 0.55 * tongue(u))
        return pow(0.03, 1 / max(reach, 1))
    }

    /// Hauteur relative de la langue de feu au point `u` (0…1) du texte.
    static func tongue(_ u: Double) -> Double {
        let x = u * 11
        let i = Int(floor(x))
        let f = x - floor(x)
        let s = f * f * (3 - 2 * f)
        return hash(i, 0, seed: riseSeed) * (1 - s) + hash(i + 1, 0, seed: riseSeed) * s
    }

    // MARK: - Le feu

    /// Intensité du feu (0…1) au pixel `(px, py)` de la texture : un bruit à
    /// trois octaves, PÉRIODIQUE sur `texturePeriod` rangées, seuillé pour
    /// laisser des trous entre les langues.
    public static func fireIntensity(px: Int, py: Int, seed: UInt32) -> Double {
        let octaves = (0..<3).map { octave -> (value: Double, weight: Double) in
            let cellsX = 3 << octave
            let cellsY = 4 << octave
            let u = Double(px) / Double(textureWidth) * Double(cellsX)
            let v = Double(py) / Double(texturePeriod) * Double(cellsY)
            let weight = 1 / Double(1 << octave)
            return (valueNoise(x: u, y: v, periodY: cellsY, seed: seed &+ UInt32(octave)), weight)
        }
        let total = octaves.reduce(0) { $0 + $1.weight }
        let n = octaves.reduce(0) { $0 + $1.value * $1.weight } / total
        return min(1, max(0, (n - 0.30) / 0.45))
    }

    /// Couverture du feu, deux périodes empilées (rangée 0 = sommet) : la
    /// nappe défile d'une période et retombe exactement sur elle-même.
    public static func textureAlpha(seed: UInt32) -> [UInt8] {
        let period = (0..<(textureWidth * texturePeriod)).map { index -> UInt8 in
            let value = fireIntensity(px: index % textureWidth, py: index / textureWidth, seed: seed)
            return UInt8((value * 255).rounded())
        }
        return period + period
    }

    /// L'image fixe du feu, à la phase de chaque nappe, sur une grille
    /// `width × height` : la composition « source-over » des deux nappes que
    /// la calque superpose.
    static func stillFire(width: Int, height: Int, risePhase: Double, swayPhase: Double) -> [UInt8] {
        (0..<(width * height)).map { index in
            let x = index % width, y = index / width
            let tx = x * textureWidth / max(width, 1)
            let row = Double(y) / Double(max(height, 1))
            let riseRow = Int((row + risePhase) * Double(texturePeriod)) % texturePeriod
            let swayRow = Int((row + swayPhase) * Double(texturePeriod)) % texturePeriod
            let a = fireIntensity(px: tx, py: riseRow, seed: riseSeed)
            let b = fireIntensity(px: tx, py: swayRow, seed: swaySeed) * swayOpacity
            return UInt8(((a + b * (1 - a)) * 255).rounded())
        }
    }

    // MARK: - La chaleur

    /// Un arrêt du dégradé de chaleur, du SOMMET des flammes (0) à la base des
    /// lettres (1).
    public struct HeatStop: Equatable, Sendable {
        public let location: Double
        public let hex: String
        public let alpha: Double
    }

    /// `lickFraction` : part de la hauteur occupée par les flammes au-dessus
    /// des lettres — un arrêt tombe exactement sur le sommet des glyphes.
    public static func heatStops(lickFraction: Double) -> [HeatStop] {
        let f = min(1, max(0, lickFraction))
        return [
            HeatStop(location: 0, hex: "B91C1C", alpha: 0),
            HeatStop(location: f * 0.45, hex: "EA580C", alpha: 0.75),
            HeatStop(location: f, hex: "F97316", alpha: 0.95),
            HeatStop(location: f + (1 - f) * 0.45, hex: "FBBF24", alpha: 1),
            HeatStop(location: 1, hex: "FEF3C7", alpha: 1),
        ]
    }

    static func heatColors(lickFraction: Double) -> [CGColor] {
        heatStops(lickFraction: lickFraction).map { stop in
            (HexColor(hex: stop.hex)?.uiColor ?? .orange).withAlphaComponent(stop.alpha).cgColor
        }
    }

    // MARK: - Bruit

    static func hash(_ x: Int, _ y: Int, seed: UInt32) -> Double {
        var h = (UInt32(truncatingIfNeeded: x) &* 0x8DA6_B343)
            ^ (UInt32(truncatingIfNeeded: y) &* 0xD816_3841)
            ^ (seed &* 0xCB1A_B31F)
        h = (h ^ (h >> 13)) &* 0x5BD1_E995
        h ^= h >> 15
        return Double(h) / Double(UInt32.max)
    }

    static func valueNoise(x: Double, y: Double, periodY: Int, seed: UInt32) -> Double {
        let x0 = Int(floor(x)), y0 = Int(floor(y))
        let fx = x - floor(x), fy = y - floor(y)
        let sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
        let lattice = { (i: Int, j: Int) in hash(i, wrap(j, periodY), seed: seed) }
        let top = lattice(x0, y0) * (1 - sx) + lattice(x0 + 1, y0) * sx
        let bottom = lattice(x0, y0 + 1) * (1 - sx) + lattice(x0 + 1, y0 + 1) * sx
        return top * (1 - sy) + bottom * sy
    }

    static func wrap(_ value: Int, _ period: Int) -> Int {
        guard period > 0 else { return value }
        return ((value % period) + period) % period
    }
}

// MARK: - Images

extension StoryFlameTextRenderer {

    /// Une grille de couverture prête à masquer.
    struct Coverage {
        let bytes: [UInt8]
        let width: Int
        let height: Int
    }

    /// **La silhouette de feu d'un bloc de glyphes**, sur `size` points dont
    /// les `lick` premiers sont la place des flammes au-dessus des lettres.
    /// `drawGlyphs` peint les lettres dans un contexte UIKit (y vers le bas)
    /// dont l'origine est le coin haut-gauche des GLYPHES ; seule leur
    /// couverture compte, jamais leur couleur.
    @MainActor
    static func silhouette(size: CGSize, lick: CGFloat, scale: CGFloat,
                           drawGlyphs: (CGContext) -> Void) -> Coverage? {
        let maskScale = min(max(scale, 0.25), maxMaskScale)
        let width = Int(ceil(size.width * maskScale)), height = Int(ceil(size.height * maskScale))
        guard width > 0, height > 0, width * height <= maxMaskPixels,
              let glyphs = glyphCoverage(width: width, height: height, scale: maskScale,
                                         lick: lick, drawGlyphs: drawGlyphs) else { return nil }
        let lickRows = Int((lick * maskScale).rounded())
        return Coverage(bytes: flameSilhouette(coverage: glyphs, width: width, height: height,
                                               lickRows: lickRows),
                        width: width, height: height)
    }

    @MainActor
    private static func glyphCoverage(width: Int, height: Int, scale: CGFloat, lick: CGFloat,
                                      drawGlyphs: (CGContext) -> Void) -> [UInt8]? {
        guard let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
                                  bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
              let data = ctx.data else { return nil }
        ctx.translateBy(x: 0, y: CGFloat(height))
        ctx.scaleBy(x: scale, y: -scale)
        ctx.translateBy(x: 0, y: lick)
        UIGraphicsPushContext(ctx)
        drawGlyphs(ctx)
        UIGraphicsPopContext()
        let stride = ctx.bytesPerRow
        let pixels = data.bindMemory(to: UInt8.self, capacity: stride * height)
        return (0..<(width * height)).map { index in
            pixels[(index / width) * stride + (index % width) * 4 + 3]
        }
    }

    /// Une couverture en niveaux de gris SANS alpha — la forme qu'attend
    /// `CGContext.clip(to:mask:)`, où le blanc peint.
    static func grayMask(_ coverage: Coverage) -> CGImage? {
        guard let provider = CGDataProvider(data: Data(coverage.bytes) as CFData) else { return nil }
        return CGImage(width: coverage.width, height: coverage.height, bitsPerComponent: 8,
                       bitsPerPixel: 8, bytesPerRow: coverage.width,
                       space: CGColorSpaceCreateDeviceGray(),
                       bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue),
                       provider: provider, decode: nil, shouldInterpolate: true,
                       intent: .defaultIntent)
    }

    /// La même couverture portée par l'ALPHA d'une image blanche prémultipliée
    /// — la forme que lit le `mask` d'une calque.
    static func alphaImage(_ coverage: Coverage) -> CGImage? {
        let rgba = [UInt8](unsafeUninitializedCapacity: coverage.bytes.count * 4) { buffer, count in
            for (index, value) in coverage.bytes.enumerated() {
                (0..<4).forEach { buffer[index * 4 + $0] = value }
            }
            count = coverage.bytes.count * 4
        }
        guard let provider = CGDataProvider(data: Data(rgba) as CFData) else { return nil }
        return CGImage(width: coverage.width, height: coverage.height, bitsPerComponent: 8,
                       bitsPerPixel: 32, bytesPerRow: coverage.width * 4,
                       space: CGColorSpaceCreateDeviceRGB(),
                       bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                       provider: provider, decode: nil, shouldInterpolate: true,
                       intent: .defaultIntent)
    }

    // MARK: - L'image fixe

    /// **Peint les flammes d'un texte, figées à `phase`**, par-dessus des
    /// glyphes déjà dessinés dans `ctx` (contexte UIKit, y vers le bas). La
    /// couverture, le thumbHash et l'export passent ici ; la phase 0 est
    /// l'image des vignettes et du mouvement réduit.
    @MainActor
    public static func drawStill(in ctx: CGContext, glyphRect: CGRect, fontSize: CGFloat,
                                 maskScale: CGFloat = 1, phase: Double = 0,
                                 drawGlyphs: (CGContext) -> Void) {
        let lick = lickHeight(fontSize: fontSize)
        let flameRect = CGRect(x: glyphRect.minX, y: glyphRect.minY - lick,
                               width: glyphRect.width, height: glyphRect.height + lick)
        guard let flames = silhouette(size: flameRect.size, lick: lick, scale: maskScale,
                                      drawGlyphs: drawGlyphs) else { return }
        let fire = stillFire(width: flames.width, height: flames.height,
                             risePhase: phase, swayPhase: phase / swayRatio)
        let burning = Coverage(bytes: zip(flames.bytes, fire).map { UInt8((Int($0) * Int($1)) / 255) },
                               width: flames.width, height: flames.height)
        guard let mask = grayMask(burning),
              let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                                        colors: heatColors(lickFraction: lick / flameRect.height) as CFArray,
                                        locations: heatStops(lickFraction: lick / flameRect.height)
                                            .map { CGFloat($0.location) }) else { return }
        ctx.saveGState()
        ctx.translateBy(x: flameRect.minX, y: flameRect.maxY)
        ctx.scaleBy(x: 1, y: -1)
        let local = CGRect(origin: .zero, size: flameRect.size)
        ctx.clip(to: local, mask: mask)
        ctx.drawLinearGradient(gradient,
                               start: CGPoint(x: local.midX, y: local.maxY),
                               end: CGPoint(x: local.midX, y: local.minY),
                               options: [])
        ctx.restoreGState()
    }
}

// MARK: - La calque de flamme

/// La clé d'une silhouette : tant que les glyphes, leur cadre et la densité
/// ne changent pas, la silhouette n'est pas recalculée.
public struct StoryFlameGlyphKey: Equatable {
    public let glyphs: NSAttributedString
    public let size: CGSize
    public let scale: CGFloat

    public init(glyphs: NSAttributedString, size: CGSize, scale: CGFloat) {
        self.glyphs = glyphs
        self.size = size
        self.scale = scale
    }
}

/// **Le feu animé d'un texte**, posé AU-DESSUS de ses glyphes. Son `mask` est
/// la silhouette de feu des lettres ; dedans, le dégradé de chaleur est
/// lui-même masqué par deux nappes de bruit qui montent à deux vitesses.
/// Tout le mouvement est une `CABasicAnimation` jouée par le serveur de rendu
/// — aucune image ne se calcule sur le fil principal, la frappe ne perd rien.
public final class StoryFlameLayer: CALayer {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au
    // démontage hors d'une tâche. Garde : MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    private var heat: CAGradientLayer?
    private var riseNappe: CALayer?
    private var swayNappe: CALayer?
    private var silhouetteMask: CALayer?
    private var silhouetteKey: StoryFlameGlyphKey?
    public var isAnimating: Bool { riseNappe?.animation(forKey: Self.riseKey) != nil }

    static let riseKey = "flame.rise"
    static let swayKey = "flame.sway"
    static let flickerKey = "flame.flicker"

    public override nonisolated init() { super.init() }
    public override nonisolated init(layer: Any) { super.init(layer: layer) }

    @available(*, unavailable)
    public required nonisolated init?(coder: NSCoder) {
        fatalError("StoryFlameLayer does not support NSCoder")
    }

    /// Toutes les animations de la calque et de ses nappes.
    var allAnimationKeys: [String] {
        ([self, heat, riseNappe, swayNappe] as [CALayer?])
            .compactMap { $0?.animationKeys() }
            .flatMap { $0 }
    }

    /// Cadre la flamme sur `glyphFrame` (les lettres) prolongé vers le haut de
    /// la hauteur des flammes, recalcule la silhouette si les glyphes ont
    /// changé, et lance — ou fige — le feu.
    @MainActor
    public func configure(glyphFrame: CGRect, fontSize: CGFloat, key: StoryFlameGlyphKey,
                          animates: Bool, drawGlyphs: (CGContext) -> Void) {
        let lick = StoryFlameTextRenderer.lickHeight(fontSize: fontSize)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        frame = CGRect(x: glyphFrame.minX, y: glyphFrame.minY - lick,
                       width: glyphFrame.width, height: glyphFrame.height + lick)
        installNappesIfNeeded()
        layoutNappes(lickFraction: lick / max(bounds.height, 1))
        if key != silhouetteKey {
            silhouetteMask?.contents = StoryFlameTextRenderer
                .silhouette(size: bounds.size, lick: lick, scale: key.scale, drawGlyphs: drawGlyphs)
                .flatMap(StoryFlameTextRenderer.alphaImage)
            silhouetteKey = key
        }
        CATransaction.commit()
        animates ? startBurning() : stopBurning()
    }

    /// **Pose sur la calque MODÈLE le feu à `elapsed`** — `layer.render(in:)`
    /// (export MP4) peint la calque modèle et ignore les animations.
    @MainActor
    public func show(atElapsed elapsed: TimeInterval) {
        let rise = StoryFlameTextRenderer.phase(atElapsed: elapsed,
                                                duration: StoryFlameTextRenderer.cycleDuration)
        let sway = StoryFlameTextRenderer.phase(
            atElapsed: elapsed,
            duration: StoryFlameTextRenderer.cycleDuration * StoryFlameTextRenderer.swayRatio)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        riseNappe?.contentsRect = Self.window(phase: rise)
        swayNappe?.contentsRect = Self.window(phase: sway)
        CATransaction.commit()
    }

    /// La fenêtre de la texture (deux périodes empilées) visible à `phase` :
    /// une demi-hauteur qui DESCEND dans l'image, donc un feu qui MONTE.
    /// En unités de texture et non en points — l'animation ne dépend pas de la
    /// taille du texte, et un pincement ne la relance pas.
    static func window(phase: Double) -> CGRect {
        CGRect(x: 0, y: 0.5 * phase, width: 1, height: 0.5)
    }

    @MainActor
    private func installNappesIfNeeded() {
        guard heat == nil else { return }
        let gradient = CAGradientLayer()
        gradient.startPoint = CGPoint(x: 0.5, y: 0)
        gradient.endPoint = CGPoint(x: 0.5, y: 1)
        let nappes = CALayer()
        let rise = Self.nappe(seed: StoryFlameTextRenderer.riseSeed, opacity: 1)
        let sway = Self.nappe(seed: StoryFlameTextRenderer.swaySeed,
                              opacity: Float(StoryFlameTextRenderer.swayOpacity))
        nappes.addSublayer(rise)
        nappes.addSublayer(sway)
        gradient.mask = nappes
        addSublayer(gradient)
        let silhouette = CALayer()
        silhouette.contentsGravity = .resize
        mask = silhouette
        heat = gradient
        riseNappe = rise
        swayNappe = sway
        silhouetteMask = silhouette
    }

    @MainActor
    private func layoutNappes(lickFraction: Double) {
        heat?.frame = bounds
        heat?.colors = StoryFlameTextRenderer.heatColors(lickFraction: lickFraction)
        heat?.locations = StoryFlameTextRenderer.heatStops(lickFraction: lickFraction)
            .map { NSNumber(value: $0.location) }
        heat?.mask?.frame = bounds
        riseNappe?.frame = bounds
        swayNappe?.frame = bounds
        silhouetteMask?.frame = bounds
    }

    @MainActor
    private static func nappe(seed: UInt32, opacity: Float) -> CALayer {
        let layer = CALayer()
        layer.contentsGravity = .resize
        layer.contentsRect = window(phase: 0)
        layer.opacity = opacity
        layer.contents = StoryFlameTextRenderer.alphaImage(.init(
            bytes: StoryFlameTextRenderer.textureAlpha(seed: seed),
            width: StoryFlameTextRenderer.textureWidth,
            height: StoryFlameTextRenderer.texturePeriod * 2))
        return layer
    }

    /// `AVCoreAnimationBeginTimeAtZero` : une animation commencée à 0 se lit
    /// « maintenant » à l'écran et « au début de la vidéo » sous
    /// `AVSynchronizedLayer` — sans lui, le lecteur synchronisé repousserait
    /// le feu à une date qui n'arrive jamais. Déjà en cours, le feu n'est pas
    /// relancé : une nouvelle frappe ou un pincement ne le fait pas sauter.
    @MainActor
    private func startBurning() {
        guard !isAnimating, let riseNappe, let swayNappe, let heat else { return }
        riseNappe.add(Self.rise(duration: StoryFlameTextRenderer.cycleDuration), forKey: Self.riseKey)
        swayNappe.add(Self.rise(duration: StoryFlameTextRenderer.cycleDuration * StoryFlameTextRenderer.swayRatio),
                      forKey: Self.swayKey)
        let flicker = CAKeyframeAnimation(keyPath: "opacity")
        flicker.values = [1, 0.86, 0.97, 0.9, 1]
        flicker.keyTimes = [0, 0.23, 0.5, 0.71, 1]
        flicker.duration = 0.9
        flicker.repeatCount = .infinity
        flicker.beginTime = AVCoreAnimationBeginTimeAtZero
        flicker.isRemovedOnCompletion = false
        heat.add(flicker, forKey: Self.flickerKey)
    }

    @MainActor
    private func stopBurning() {
        riseNappe?.removeAnimation(forKey: Self.riseKey)
        swayNappe?.removeAnimation(forKey: Self.swayKey)
        heat?.removeAnimation(forKey: Self.flickerKey)
        show(atElapsed: 0)
    }

    private static func rise(duration: CFTimeInterval) -> CABasicAnimation {
        let rise = CABasicAnimation(keyPath: "contentsRect")
        rise.fromValue = NSValue(cgRect: window(phase: 0))
        rise.toValue = NSValue(cgRect: window(phase: 1))
        rise.duration = duration
        rise.repeatCount = .infinity
        rise.beginTime = AVCoreAnimationBeginTimeAtZero
        rise.isRemovedOnCompletion = false
        return rise
    }
}
