import BackgroundTasks
import Foundation
import MeeshySDK
import os

private let logger = MeeshyLog.logger(.background)

/// Le réveil d'arrière-plan de l'émetteur (#14147) : iOS rend du temps à l'app quand il le juge bon, et le téléphone
/// en profite pour relever sa batterie hors cadence. iOS ne garantit ni l'heure ni la fréquence de ce réveil : la
/// batterie d'un téléphone fermé reste connue par le push silencieux `battery_pull` et par le dernier relevé.
enum BatteryBackgroundRefresh {

    static let taskId = "me.meeshy.app.battery-refresh"
    /// La fréquence demandée ; iOS l'arrondit à sa guise.
    static let interval: TimeInterval = 30 * 60

    /// À l'ouverture du processus, comme les autres tâches (`using: .main` : le gestionnaire est isolé au fil
    /// principal).
    static func register(scheduler: BGTaskScheduler = .shared) {
        scheduler.register(forTaskWithIdentifier: taskId, using: .main) { task in
            guard let refresh = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            handle(refresh)
        }
    }

    /// Au passage en arrière-plan, sur un téléphone seulement : une tablette n'émet jamais.
    static func schedule(isAvailable: Bool = BatteryCenter.shared.reporter.isAvailable) {
        guard isAvailable else { return }
        let request = BGAppRefreshTaskRequest(identifier: taskId)
        request.earliestBeginDate = Date(timeIntervalSinceNow: interval)
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            logger.error("Battery refresh not scheduled: \(error.localizedDescription)")
        }
    }

    static func cancel() {
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: taskId)
    }

    /// Un relevé tient sous l'échéance de l'accusé socket (10 s) ou d'une requête REST : la tâche se rend dès qu'il
    /// est parti, sans attendre d'expiration.
    private static func handle(_ task: BGAppRefreshTask) {
        guard AuthManager.shared.authToken != nil else {
            task.setTaskCompleted(success: false)
            return
        }
        Task { @MainActor in
            let outcome = await BatteryCenter.shared.reportNow()
            schedule()
            task.setTaskCompleted(success: outcome == .tracked || outcome == .ignored)
        }
    }
}
