import Foundation

/// L'ALARME d'un Bring (#17442, essai AlarmKit). Sans l'entitlement Critical Alerts, qu'Apple n'a pas accordé, un push
/// `time-sensitive` ne sonne pas sur un iPhone en silencieux : seule une alarme système (AlarmKit, iOS 26+) le fait,
/// en Concentration comme en silencieux. Ce fichier est la LOI de cette alarme, partagée par les deux endroits qui
/// peuvent la poser — l'app vivante (`BringCenter`) et l'extension de notification, sur le push `bring` — pour qu'ils
/// visent la MÊME alarme : même identifiant, même échéance, même arrêt.
///
/// Foundation seul, compilé dans l'app ET dans la NSE (`project.yml`) : c'est ce qui le rend éprouvable par
/// `MeeshyTests` (`BringAlarmPlanTests`). Rien ici ne parle à AlarmKit.
nonisolated enum BringAlarmPlan {

    /// `data.type` des pushes du Bring (`BRING_PUSH_TYPES`, `BringContract`).
    static let ringPushType = "bring"
    static let stoppedPushType = "bring_stopped"

    /// La fenêtre du contrat (`BRING_RING_WINDOW_MS`) : une échéance illisible n'ouvre jamais une alarme sans fin.
    static let ringWindow: TimeInterval = 120

    /// Le son de l'alarme : la sonnerie d'appel du bundle, celle du push `bring` (`BRING_IOS_SOUND`).
    static let soundName = "Ringtone.caf"

    /// L'essai vit derrière un drapeau LOCAL : ouvert en Debug, fermé en Release, forçable par l'environnement
    /// (`1` / `0`) puis par le groupe d'apps — que l'app et la NSE lisent toutes deux.
    static let flagEnvironmentKey = "MEESHY_FLAG_BRING_ALARM"
    static let flagDefaultsKey = "meeshy.flag.bring_alarm"
    static let appGroupSuite = "group.me.meeshy.apps"

    static var isDebugBuild: Bool {
        #if DEBUG
        true
        #else
        false
        #endif
    }

    static func isEnabled(environment: [String: String], storedValue: Bool?, debugBuild: Bool) -> Bool {
        switch environment[flagEnvironmentKey] {
        case "1": return true
        case "0": return false
        default: return storedValue ?? debugBuild
        }
    }

    /// Le drapeau au vrai domaine — jamais dans un test.
    static var isEnabled: Bool {
        let stored = UserDefaults(suiteName: appGroupSuite)?.object(forKey: flagDefaultsKey) as? Bool
        return isEnabled(environment: ProcessInfo.processInfo.environment, storedValue: stored, debugBuild: isDebugBuild)
    }

    /// Ce que demande une alarme de Bring : le texte que l'écran verrouillé montre, et rien d'autre — ni avatar,
    /// ni identifiant de l'expéditeur.
    struct Request: Equatable, Sendable {
        let bringId: String
        let title: String
        let stopLabel: String
        let deadline: Date

        var alarmID: UUID { BringAlarmPlan.alarmID(bringId: bringId) }
    }

    /// Ce qu'un push fait à l'alarme.
    enum Action: Equatable, Sendable {
        case ring(Request)
        case silence(bringId: String)
        case none
    }

    /// L'alarme d'un push `bring` (titre et libellé d'arrêt déjà localisés par la passerelle) ou l'arrêt d'un push
    /// `bring_stopped`. Une échéance passée ne sonne pas ; tout autre push ne touche à rien.
    static func action(push userInfo: [AnyHashable: Any], now: Date) -> Action {
        let type = userInfo["type"] as? String
        guard let bringId = nonEmpty(userInfo["bringId"]) else { return .none }
        if type == stoppedPushType { return .silence(bringId: bringId) }
        guard type == ringPushType, let title = nonEmpty(userInfo["title"]) else { return .none }
        let deadline = deadline(expiresAt: userInfo["expiresAt"] as? String, now: now)
        guard deadline > now else { return .none }
        let stopLabel = nonEmpty(userInfo["stopLabel"]) ?? "Stop"
        return .ring(Request(bringId: bringId, title: title, stopLabel: stopLabel, deadline: deadline))
    }

    /// L'app au premier plan sonne elle-même (`BringTone`, `.playback` ignore déjà le silencieux) et retire l'alarme
    /// qu'une NSE aurait posée : jamais deux sonneries. Hors premier plan, c'est l'alarme qui sonne.
    static func appShouldRingAlarm(enabled: Bool, appIsActive: Bool) -> Bool {
        enabled && !appIsActive
    }

    static func deadline(expiresAt: String?, now: Date) -> Date {
        expiresAt.flatMap(parseInstant) ?? now.addingTimeInterval(ringWindow)
    }

    /// L'identifiant de l'alarme, DÉRIVÉ du `bringId` : l'app et la NSE posent ou retirent la même sans se parler.
    /// Deux FNV-1a 64 bits (graines distinctes) font les 16 octets — stable d'un processus à l'autre, à la
    /// différence de `Hasher`.
    static func alarmID(bringId: String) -> UUID {
        let bytes = Array(bringId.utf8)
        let high = fnv1a(bytes, seed: 0xcbf2_9ce4_8422_2325)
        let low = fnv1a(bytes, seed: 0x8422_2325_cbf2_9ce4)
        let octets = (0..<8).map { UInt8(truncatingIfNeeded: high >> (56 - 8 * $0)) }
            + (0..<8).map { UInt8(truncatingIfNeeded: low >> (56 - 8 * $0)) }
        return UUID(uuid: (
            octets[0], octets[1], octets[2], octets[3], octets[4], octets[5], octets[6], octets[7],
            octets[8], octets[9], octets[10], octets[11], octets[12], octets[13], octets[14], octets[15]
        ))
    }

    private static func fnv1a(_ bytes: [UInt8], seed: UInt64) -> UInt64 {
        bytes.reduce(seed) { ($0 ^ UInt64($1)) &* 0x0000_0100_0000_01b3 }
    }

    private static func nonEmpty(_ value: Any?) -> String? {
        guard let string = value as? String, !string.isEmpty else { return nil }
        return string
    }

    private static func parseInstant(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}
