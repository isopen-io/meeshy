import Foundation
import MeeshyCore
import os
#if canImport(AlarmKit)
import ActivityKit
import AlarmKit
import AppIntents
import SwiftUI
#endif

/// L'autorisation AlarmKit telle que la voit l'app : `unavailable` avant iOS 26 (ou sans le framework).
nonisolated enum BringAlarmAuthorization: Equatable, Sendable {
    case unavailable, notDetermined, denied, authorized
}

/// La COUTURE entre le Bring et AlarmKit (#17442) : tout ce que l'app et l'extension de notification demandent à une
/// alarme système passe par ce protocole, et rien d'autre ne nomme AlarmKit. Un double la remplace dans les tests.
nonisolated protocol BringAlarmScheduling: Sendable {
    func authorization() async -> BringAlarmAuthorization
    /// Affiche la demande système (une fois : au premier Bring reçu, app ouverte). Jamais depuis l'extension.
    func requestAuthorization() async -> BringAlarmAuthorization
    /// Programme la sonnerie IMMÉDIATE ; vrai si l'alarme est posée.
    func schedule(_ request: BringAlarmPlan.Request) async -> Bool
    /// Arrête l'alarme qui sonne et retire celle qui attend.
    func cancel(bringId: String) async
}

/// Ce que l'app et l'extension font d'une `BringAlarmPlan.Action` : la LOI (drapeau, autorisation) en un endroit, le
/// système derrière `scheduler`. `nil` / drapeau fermé : inerte.
nonisolated struct BringAlarmCoordinator: Sendable {
    let scheduler: BringAlarmScheduling?
    let enabled: Bool

    /// Le câblage de production : AlarmKit sur iOS 26+, inerte avant, et derrière le drapeau.
    static var system: BringAlarmCoordinator {
        BringAlarmCoordinator(scheduler: BringAlarmSchedulers.system(), enabled: BringAlarmPlan.isEnabled)
    }

    /// Inerte : le défaut de tout ce qui n'est pas la production.
    static let inert = BringAlarmCoordinator(scheduler: nil, enabled: false)

    private var active: BringAlarmScheduling? { enabled ? scheduler : nil }

    /// Sonner. `mayAsk` : l'app ouverte peut montrer la demande système ; l'extension, jamais.
    @discardableResult
    func apply(_ action: BringAlarmPlan.Action, mayAsk: Bool) async -> Bool {
        guard let scheduler = active else {
            if case .ring(let request) = action {
                BringAlarmLog.note("bring \(request.bringId) : essai AlarmKit inerte (drapeau \(enabled), AlarmKit \(scheduler != nil))")
            }
            return false
        }
        switch action {
        case .none:
            return false
        case .silence(let bringId):
            await scheduler.cancel(bringId: bringId)
            return false
        case .ring(let request):
            var state = await scheduler.authorization()
            if state == .notDetermined, mayAsk { state = await scheduler.requestAuthorization() }
            guard state == .authorized else {
                BringAlarmLog.note("bring \(request.bringId) : alarme non posée, autorisation \(String(describing: state))")
                return false
            }
            return await scheduler.schedule(request)
        }
    }

    func cancel(bringId: String) async {
        await active?.cancel(bringId: bringId)
    }

    /// Demande l'autorisation une fois, au premier Bring reçu app ouverte — jamais au lancement.
    func primeAuthorization() async {
        guard let scheduler = active, await scheduler.authorization() == .notDetermined else { return }
        _ = await scheduler.requestAuthorization()
    }
}

/// Le journal de l'essai AlarmKit (#17475) : sans lui, un refus du système était avalé et l'alarme manquait en silence.
nonisolated enum BringAlarmLog {
    static let logger = MeeshyLog.logger(.bringAlarm)
    private static let journalLimit = 200

    /// Le journal, et en Debug sa copie dans le groupe d'apps (`Library/Caches/bring-alarm.log`, 200 lignes) : l'app et
    /// l'extension y écrivent, et `devicectl device copy from` la relit sur un iPhone réel sans Console.
    static func note(_ message: String) {
        logger.notice("\(message, privacy: .public)")
        #if DEBUG
        append(message)
        #endif
    }

    private static func append(_ message: String) {
        guard let caches = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: BringAlarmPlan.appGroupSuite)?
            .appendingPathComponent("Library/Caches", isDirectory: true) else { return }
        try? FileManager.default.createDirectory(at: caches, withIntermediateDirectories: true)
        let file = caches.appendingPathComponent("bring-alarm.log")
        let previous = (try? String(contentsOf: file, encoding: .utf8))?.split(separator: "\n").map(String.init) ?? []
        let line = "\(ISO8601DateFormatter().string(from: Date())) [\(ProcessInfo.processInfo.processName)] \(message)"
        try? (previous + [line]).suffix(journalLimit).joined(separator: "\n").write(to: file, atomically: true, encoding: .utf8)
    }
}

nonisolated enum BringAlarmSchedulers {
    static func system() -> BringAlarmScheduling? {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) { return AlarmKitBringAlarmScheduler() }
        #endif
        return nil
    }
}

/// Ce que le bouton « Arrêter » de l'alarme demande à l'app : arrêter le Bring (`DELETE /bring/:id`). Le système
/// exécute l'intention dans le processus de l'APP ; l'app branche `handler` au lancement. Sans handler, l'alarme se
/// tait quand même (c'est le système) et le Bring s'éteint à son échéance.
@MainActor
enum BringAlarmStopRouter {
    static var handler: ((String) -> Void)?

    @discardableResult
    static func dispatch(bringId: String) -> Bool {
        guard let handler else { return false }
        handler(bringId)
        return true
    }
}

#if canImport(AlarmKit)

@available(iOS 26.0, *)
nonisolated struct BringAlarmMetadata: AlarmMetadata {
    let bringId: String
}

@available(iOS 26.0, *)
struct BringAlarmStopIntent: nonisolated LiveActivityIntent {
    static let title: LocalizedStringResource = "Meeshy"
    static let isDiscoverable = false

    @Parameter(title: "Bring")
    var bringId: String

    init() {
        bringId = ""
    }

    init(bringId: String) {
        self.bringId = bringId
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        BringAlarmStopRouter.dispatch(bringId: bringId)
        return .result()
    }
}

/// L'alarme système (AlarmKit, iOS 26+) : elle sonne même en mode silencieux et en Concentration, ce qu'un push
/// `time-sensitive` ne fait pas sans l'entitlement Critical Alerts.
@available(iOS 26.0, *)
nonisolated struct AlarmKitBringAlarmScheduler: BringAlarmScheduling {

    /// Une alarme à date fixe doit être dans le futur : la sonnerie part une seconde après.
    private static let lead: TimeInterval = 1

    func authorization() async -> BringAlarmAuthorization {
        Self.map(AlarmManager.shared.authorizationState)
    }

    func requestAuthorization() async -> BringAlarmAuthorization {
        guard let state = try? await AlarmManager.shared.requestAuthorization() else { return .denied }
        return Self.map(state)
    }

    func schedule(_ request: BringAlarmPlan.Request) async -> Bool {
        let configuration = AlarmManager.AlarmConfiguration<BringAlarmMetadata>.alarm(
            schedule: .fixed(Date().addingTimeInterval(Self.lead)),
            attributes: Self.attributes(for: request),
            stopIntent: BringAlarmStopIntent(bringId: request.bringId),
            sound: .named(BringAlarmPlan.soundName)
        )
        do {
            _ = try await AlarmManager.shared.schedule(id: request.alarmID, configuration: configuration)
            BringAlarmLog.note("bring \(request.bringId) : alarme posée")
            return true
        } catch {
            BringAlarmLog.note("bring \(request.bringId) : AlarmKit refuse l'alarme — \(String(describing: error))")
            return false
        }
    }

    func cancel(bringId: String) async {
        let id = BringAlarmPlan.alarmID(bringId: bringId)
        try? AlarmManager.shared.stop(id: id)
        try? AlarmManager.shared.cancel(id: id)
    }

    private static func attributes(for request: BringAlarmPlan.Request) -> AlarmAttributes<BringAlarmMetadata> {
        let title = LocalizedStringResource(String.LocalizationValue(request.title))
        let alert: AlarmPresentation.Alert
        if #available(iOS 26.1, *) {
            alert = AlarmPresentation.Alert(title: title)
        } else {
            let stop = AlarmButton(
                text: LocalizedStringResource(String.LocalizationValue(request.stopLabel)),
                textColor: .white,
                systemImageName: "stop.circle"
            )
            alert = AlarmPresentation.Alert(title: title, stopButton: stop)
        }
        return AlarmAttributes(
            presentation: AlarmPresentation(alert: alert),
            metadata: BringAlarmMetadata(bringId: request.bringId),
            tintColor: .red
        )
    }

    private static func map(_ state: AlarmManager.AuthorizationState) -> BringAlarmAuthorization {
        switch state {
        case .notDetermined: .notDetermined
        case .denied: .denied
        case .authorized: .authorized
        @unknown default: .denied
        }
    }
}

#endif
