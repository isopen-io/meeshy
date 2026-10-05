import SwiftUI

// MARK: - Les shaders du jeu, en modificateurs (#9381)
//
// Trois briques Metal (`Resources/Shaders/GameShaders.metal`) :
//
//   gameSpecularSheen    reflet spéculaire, `.layerEffect` — une bande de lumière
//                        qui accroche le relief déduit du calque
//   gameStrikeWave       onde de frappe, `.distortionEffect` — le calque frémit
//                        autour du point d'impact
//   gamePrismIridescence irisation du prisme, `.colorEffect` — un arc-en-ciel qui
//                        glisse selon l'inclinaison fournie par l'hôte
//
// ## Ce qui est ici, et ce qui ne l'est pas
//
// Ici : le shader et son modificateur. À l'app : QUAND (la frappe, le nouveau
// rang), COMBIEN DE TEMPS (le reflet s'arrête après trois passages), et D'OÙ vient
// l'inclinaison (CoreMotion). Un modificateur reçoit un `progress` ou un `tilt`
// que l'hôte anime ; il n'a ni horloge ni capteur.
//
// ## Les trois garanties
//
//  - iOS 17+ : Metal. iOS 16 : un dégradé qui joue le même rôle, sans shader.
//  - Reduce Motion : le reflet et l'onde ne jouent pas (le calque reste intact) ;
//    l'irisation se fige à une inclinaison fixe — la matière reste colorée, rien
//    ne bouge.
//  - Hors de son temps (`progress` ≤ 0 ou ≥ 1), le modificateur ne pose AUCUN
//    effet : un shader qui ne fait rien ne coûte pas une passe de rendu.

public enum GameShaders {

    /// Les shaders Metal sont disponibles (iOS 17+) ; sinon le repli en dégradé joue.
    public static var usesMetal: Bool {
        if #available(iOS 17.0, macOS 14.0, *) { return true }
        return false
    }

    /// Les noms des trois fonctions de `default.metallib`.
    public static let functionNames = ["meeshySpecularSheen", "meeshyStrikeWave", "meeshyPrismIridescence"]

    /// Compile les trois shaders AVANT la célébration : sans cela, la première
    /// frappe paie la compilation pendant l'animation. À appeler au démarrage de
    /// l'écran Progression ou de l'aperçu de frappe. Sans effet avant iOS 18 (le
    /// compilateur de SwiftUI n'est pas exposé), et jamais bloquant.
    public static func precompile() async {
        guard #available(iOS 18.0, macOS 15.0, *) else { return }
        let library = GameShaders.library
        let unit = CGSize(width: 1, height: 1)
        try? await library.meeshySpecularSheen(.float2(unit), .float(0.5), .float(0)).compile(as: .layerEffect)
        try? await library.meeshyStrikeWave(.float2(unit), .float2(unit), .float(0.5), .float(0), .float(1))
            .compile(as: .distortionEffect)
        try? await library.meeshyPrismIridescence(.float2(unit), .float(0), .float(0)).compile(as: .colorEffect)
    }

    /// La bibliothèque du module, lue UNE fois hors des fermetures `@Sendable` de
    /// `visualEffect` : `Bundle.module` est isolé au `MainActor` dans ce module.
    @available(iOS 17.0, macOS 14.0, *)
    static var library: ShaderLibrary { ShaderLibrary.bundle(.module) }

    /// La bibliothèque compilée qui porte les trois fonctions — `nil` si la
    /// ressource Metal n'a pas été compilée dans le module (le témoin
    /// `GameShadersTests` le dit avant que la célébration ne reste muette).
    static var metallibURL: URL? {
        Bundle.module.url(forResource: "default", withExtension: "metallib")
    }

    /// Le temps pendant lequel un `progress` anime vraiment l'effet.
    static func isActive(_ progress: Double) -> Bool { progress > 0 && progress < 1 }
}

extension View {

    /// Un reflet spéculaire qui traverse la vue. `progress` va de 0 à 1 (l'hôte
    /// l'anime) ; `intensity` de 0 à 1.
    public func gameSpecularSheen(progress: Double, intensity: Double = 0.9) -> some View {
        modifier(GameSpecularSheenModifier(progress: progress, intensity: min(max(intensity, 0), 1)))
    }

    /// Une onde de frappe qui part de `center` (un point de la vue, en
    /// coordonnées unitaires). `progress` va de 0 à 1.
    public func gameStrikeWave(progress: Double, center: UnitPoint = .center, amplitude: CGFloat = 5,
                               wavelength: CGFloat = 18) -> some View {
        modifier(GameStrikeWaveModifier(progress: progress, center: center, amplitude: max(0, amplitude),
                                        wavelength: max(1, wavelength)))
    }

    /// L'irisation du prisme selon l'inclinaison `tilt` (en tours, 0 au repos —
    /// l'hôte la tire de CoreMotion et la borne). `intensity` de 0 à 1.
    public func gamePrismIridescence(tilt: Double, intensity: Double = 0.6) -> some View {
        modifier(GamePrismIridescenceModifier(tilt: tilt, intensity: min(max(intensity, 0), 1)))
    }
}

// MARK: - Reflet

struct GameSpecularSheenModifier: ViewModifier, Animatable {
    var progress: Double
    let intensity: Double

    var animatableData: Double {
        get { progress }
        set { progress = newValue }
    }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @ViewBuilder
    func body(content: Content) -> some View {
        if reduceMotion || !GameShaders.isActive(progress) || intensity <= 0 {
            content
        } else if #available(iOS 17.0, macOS 14.0, *) {
            let library = GameShaders.library
            let progress = progress
            let intensity = intensity
            content.visualEffect { view, proxy in
                view.layerEffect(
                    library.meeshySpecularSheen(.float2(proxy.size), .float(progress), .float(intensity)),
                    maxSampleOffset: CGSize(width: 2, height: 2)
                )
            }
        } else {
            content.overlay(SheenBand(progress: progress, intensity: intensity).mask(content))
        }
    }
}

/// Le repli iOS 16 : la même bande, un dégradé qui glisse, additif.
struct SheenBand: View {
    let progress: Double
    let intensity: Double

    var body: some View {
        GeometryReader { proxy in
            let travel = proxy.size.width * 1.6
            LinearGradient(
                stops: [.init(color: .white.opacity(0), location: 0),
                        .init(color: .white.opacity(0.8 * intensity * sin(progress * .pi)), location: 0.5),
                        .init(color: .white.opacity(0), location: 1)],
                startPoint: .leading, endPoint: .trailing
            )
            .frame(width: proxy.size.width * 0.4)
            .rotationEffect(.degrees(20))
            .offset(x: -proxy.size.width * 0.5 + travel * progress)
            .frame(width: proxy.size.width, height: proxy.size.height, alignment: .leading)
            .blendMode(.plusLighter)
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Onde

struct GameStrikeWaveModifier: ViewModifier, Animatable {
    var progress: Double
    let center: UnitPoint
    let amplitude: CGFloat
    let wavelength: CGFloat

    var animatableData: Double {
        get { progress }
        set { progress = newValue }
    }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @ViewBuilder
    func body(content: Content) -> some View {
        if reduceMotion || !GameShaders.isActive(progress) || amplitude <= 0 {
            content
        } else if #available(iOS 17.0, macOS 14.0, *) {
            let library = GameShaders.library
            let progress = progress
            let center = center
            let amplitude = amplitude
            let wavelength = wavelength
            content.visualEffect { view, proxy in
                view.distortionEffect(
                    library.meeshyStrikeWave(
                        .float2(proxy.size),
                        .float2(CGPoint(x: center.x * proxy.size.width, y: center.y * proxy.size.height)),
                        .float(progress), .float(amplitude), .float(wavelength)),
                    maxSampleOffset: CGSize(width: amplitude, height: amplitude)
                )
            }
        } else {
            content.overlay(StrikeRing(progress: progress, center: center).allowsHitTesting(false))
        }
    }
}

/// Le repli iOS 16 : un anneau qui s'élargit et s'éteint depuis le point d'impact.
struct StrikeRing: View {
    let progress: Double
    let center: UnitPoint

    var body: some View {
        GeometryReader { proxy in
            let diameter = max(proxy.size.width, proxy.size.height) * 1.4 * progress
            Circle()
                .stroke(Color.white.opacity(0.6 * (1 - progress)), lineWidth: 3)
                .frame(width: diameter, height: diameter)
                .position(x: center.x * proxy.size.width, y: center.y * proxy.size.height)
        }
    }
}

// MARK: - Irisation

struct GamePrismIridescenceModifier: ViewModifier, Animatable {
    var tilt: Double
    let intensity: Double

    var animatableData: Double {
        get { tilt }
        set { tilt = newValue }
    }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Sous Reduce Motion l'irisation reste, figée à une inclinaison de repos.
    private var effectiveTilt: Double { reduceMotion ? 0.25 : tilt }

    @ViewBuilder
    func body(content: Content) -> some View {
        if intensity <= 0 {
            content
        } else if #available(iOS 17.0, macOS 14.0, *) {
            let library = GameShaders.library
            let tilt = effectiveTilt
            let intensity = intensity
            content.visualEffect { view, proxy in
                view.colorEffect(
                    library.meeshyPrismIridescence(.float2(proxy.size), .float(tilt), .float(intensity))
                )
            }
        } else {
            content.overlay(IridescentSheet(tilt: effectiveTilt, intensity: intensity).mask(content))
        }
    }
}

/// Le repli iOS 16 : le prisme en dégradé, qui glisse avec l'inclinaison.
struct IridescentSheet: View {
    let tilt: Double
    let intensity: Double

    var body: some View {
        LinearGradient(
            stops: GamePalette.prismStops,
            startPoint: UnitPoint(x: -0.5 + tilt, y: 0),
            endPoint: UnitPoint(x: 0.5 + tilt, y: 1)
        )
        .opacity(0.35 * intensity)
        .blendMode(.softLight)
        .allowsHitTesting(false)
    }
}
