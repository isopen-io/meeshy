import SwiftUI
import Combine
import MeeshySDK

/// **L'ATOME du vent** (#17938) — une valeur observable, SANS capteur.
///
/// L'app y écrit ce que CoreMotion lui dit (`EphemeralBurnWindSource`, côté
/// `apps/ios`) ; le modificateur de combustion la lit par l'environnement et en
/// déduit la dérive des flammes et des étincelles. Le SDK ne tourne aucun
/// capteur : il reçoit une valeur et la rend observable, rien d'autre — même
/// grain que `GameShaders`, qui reçoit une inclinaison et ne sait pas d'où
/// elle vient.
///
/// `raw` est le vent BRUT de `EphemeralBurnLaw.rawWind` : `nil` quand aucun
/// capteur ne parle ou que le geste est sous la zone morte. Le modificateur y
/// applique le défaut du côté de la bulle (`EphemeralBurnLaw.wind(raw:side:)`).
public final class EphemeralBurnWind: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut du module) — `nonisolated` pour un démontage hors tâche.
    nonisolated deinit {}

    @Published public var raw: Double?

    public init(raw: Double? = nil) {
        self.raw = raw
    }
}

private struct EphemeralBurnWindKey: EnvironmentKey {
    static let defaultValue: EphemeralBurnWind? = nil
}

public extension EnvironmentValues {
    /// Le vent de l'appareil, posé par le fil sur ses cellules ; `nil` ⇒ le
    /// vent par défaut du côté de la bulle.
    var ephemeralBurnWind: EphemeralBurnWind? {
        get { self[EphemeralBurnWindKey.self] }
        set { self[EphemeralBurnWindKey.self] = newValue }
    }
}

/// **Ce que l'allumage FIGE** — pur et testable. Le sens du front est décidé
/// une fois, au moment où `isBurning` passe à vrai : un vent qui change de
/// signe à mi-combustion ne fait pas renaître des lettres déjà brûlées. La
/// graine distingue deux éphémères qui brûlent ensemble : sans elle, les mêmes
/// étincelles partiraient des mêmes endroits sur les deux bulles.
public struct EphemeralBurnIgnition: Equatable, Sendable {
    public let frontDirection: Double
    public let seed: Double

    public static func ignite(rawWind: Double?, side: EphemeralBurnSide, seed: Double) -> EphemeralBurnIgnition {
        let wind = EphemeralBurnLaw.wind(raw: rawWind, side: side)
        return EphemeralBurnIgnition(frontDirection: EphemeralBurnLaw.frontDirection(wind: wind), seed: seed)
    }
}
