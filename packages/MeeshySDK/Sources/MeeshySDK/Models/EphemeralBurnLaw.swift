import Foundation

/// De quel côté de l'écran la bulle vit : la mienne à droite, celle d'un autre à gauche.
public enum EphemeralBurnSide: Sendable, Equatable {
    case mine
    case theirs

    /// Le côté d'une bulle dont on sait seulement si elle est « à moi ».
    public init(isMine: Bool) {
        self = isMine ? .mine : .theirs
    }
}

/// Les trois temps de la combustion, parcourus par un même `progress` 0 → 1.
public enum EphemeralBurnPhase: Sendable, Equatable {
    case ignition
    case spread
    case ashes
}

/// **La loi de la combustion d'un éphémère** (#17938) — MIROIR Swift de
/// `packages/shared/utils/ephemeral-burn.ts`, la source. Toute évolution touche
/// les trois miroirs (TS, Swift, Kotlin), et les vecteurs de
/// `ephemeral-burn.test.ts` se rejouent dans `EphemeralBurnLawTests`.
///
/// Elle ne peint rien. Elle rend ce sur quoi la vue qui brûle, l'hôte qui
/// retire la ligne et le capteur de l'app doivent s'accorder :
///
/// - le **vent** — ce que l'appareil dit (roulis en tours × 4, accélération
///   latérale en g × 2, borné à ±1, `+1` vers la droite de l'écran), sa zone
///   morte (un téléphone tenu en main n'est jamais à zéro), et ce qu'on en
///   fait quand il ne dit rien : le bord EXTÉRIEUR de la bulle, à 0,35 ;
/// - le **sens du front** — le feu s'allume du côté D'OÙ vient le vent et
///   avance avec lui ; figé à l'allumage par l'hôte (un vent qui change de
///   signe à mi-combustion ne fait pas renaître des lettres déjà brûlées),
///   tandis que la DÉRIVE suit le vent en direct ;
/// - les **trois temps** : ignition, propagation, cendres.
///
/// La durée vit à côté, dans `EphemeralBurn` (#7467) : c'est elle que l'hôte
/// attend avant de retirer la ligne.
public enum EphemeralBurnLaw {

    /// Sous cette valeur absolue, le geste n'en est pas un : le vent par défaut joue.
    public static let windDeadZone: Double = 0.08

    /// Le vent sans geste, vers le bord extérieur de la bulle.
    public static let defaultWind: Double = 0.35

    public static let ignitionEnd: Double = 0.15
    public static let spreadEnd: Double = 0.8

    private static let rollWeight: Double = 4
    private static let lateralWeight: Double = 2

    /// Le vent BRUT lu de l'appareil, borné à ±1 ; `nil` sans capteur ou sous la zone morte.
    public static func rawWind(rollTurns: Double?, lateralG: Double?) -> Double? {
        let roll = finite(rollTurns)
        let lateral = finite(lateralG)
        guard roll != nil || lateral != nil else { return nil }
        let raw = (roll ?? 0) * rollWeight + (lateral ?? 0) * lateralWeight
        guard abs(raw) >= windDeadZone else { return nil }
        return min(1, max(-1, raw))
    }

    /// Le vent EFFECTIF : le geste quand il existe, sinon ±0,35 vers le bord extérieur. Jamais nul.
    public static func wind(raw: Double?, side: EphemeralBurnSide) -> Double {
        if let raw { return raw }
        return side == .mine ? defaultWind : -defaultWind
    }

    /// `+1` quand le feu part du bord gauche et avance vers la droite, `-1` sinon.
    public static func frontDirection(wind: Double) -> Double {
        wind >= 0 ? 1 : -1
    }

    public static func phase(progress: Double) -> EphemeralBurnPhase {
        if progress < ignitionEnd { return .ignition }
        if progress < spreadEnd { return .spread }
        return .ashes
    }

    private static func finite(_ value: Double?) -> Double? {
        guard let value, value.isFinite else { return nil }
        return value
    }
}
