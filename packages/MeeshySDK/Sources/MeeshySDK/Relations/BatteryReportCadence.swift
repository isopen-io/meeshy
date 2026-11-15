import Foundation

/// Un relevé de l'appareil, tel que la plateforme le donne. iOS ne connaît le niveau qu'au pas de 5 % — ce pas est
/// rendu tel quel, jamais affiné.
public struct BatteryReading: Sendable, Equatable {
    public let level: Int
    public let charging: Bool
    public let lowPower: Bool

    public init(level: Int, charging: Bool, lowPower: Bool) {
        self.level = BatteryPercent.clamped(level)
        self.charging = charging
        self.lowPower = lowPower
    }
}

/// QUAND le téléphone émetteur remonte un relevé (#14147, décision du porteur). Le client n'exécute pas
/// l'épisode — le serveur seul décide des paliers et des annonces ; cette loi ne dit que la CADENCE :
///
/// - au-dessus de 30 %, à chaque changement de tranche de 5 % ;
/// - de 30 % à 10 %, à chaque palier (30, 25, 20, 15, 10) franchi ;
/// - à 5 % et dessous, à chaque relevé, plus un battement toutes les 60 s tant que l'app a du temps d'exécution ;
/// - toujours au premier relevé, à chaque branchement ou débranchement et à chaque bascule du mode économie ;
/// - et sur demande (`battery:pull-requested`, push silencieux), hors de cette loi.
public enum BatteryReportCadence {

    /// Les paliers sous le seuil, du plus haut au plus bas (`BATTERY_CONFIG.lowThreshold` puis `steps`).
    public static let steps: [Int] = [30, 25, 20, 15, 10]
    /// Le battement en zone critique.
    public static let criticalHeartbeat: TimeInterval = 60

    /// Le relevé `current` doit-il partir, sachant le dernier relevé ENVOYÉ ?
    public static func shouldReport(lastSent: BatteryReading?, current: BatteryReading) -> Bool {
        guard let lastSent else { return true }
        if lastSent.charging != current.charging || lastSent.lowPower != current.lowPower { return true }
        if current.level <= BatteryContract.criticalThreshold { return true }
        return band(of: lastSent.level) != band(of: current.level)
    }

    /// Le battement à armer après ce relevé : 60 s en zone critique sur batterie, aucun sinon.
    public static func heartbeat(after reading: BatteryReading) -> TimeInterval? {
        guard !reading.charging, reading.level <= BatteryContract.criticalThreshold else { return nil }
        return criticalHeartbeat
    }

    /// La tranche d'un niveau : au-dessus du seuil, le pas de 5 % ; sous le seuil, le palier le plus bas encore
    /// au-dessus ou égal ; en critique, le niveau lui-même.
    static func band(of level: Int) -> Int {
        if level <= BatteryContract.criticalThreshold { return level }
        if level <= BatteryContract.lowThreshold {
            return steps.last { level <= $0 } ?? BatteryContract.lowThreshold
        }
        return 1_000 + level / 5
    }
}
