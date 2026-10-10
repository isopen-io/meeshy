import Foundation
import Combine
import MeeshySDK

/// **Un déclencheur de RECETTE pour la pastille et la Live Activity d'envoi**
/// (#9680), en build Debug seulement.
///
/// Juger la position de la pastille ou voir la Live Activity exigeait un envoi
/// réellement bloqué — relais coupé, socket resté connecté, et une entrée de
/// frappe ou de texte qui s'efface au bout de 6 s. Une notification Darwin,
/// postée depuis l'hôte, injecte un envoi FACTICE dans la file que lisent la
/// pastille ET la Live Activity (aucune ligne n'est écrite dans l'outbox) :
///
/// ```
/// xcrun simctl spawn <udid> notifyutil -p me.meeshy.debug.syncpill.failed   # pastille persistante (point rouge)
/// xcrun simctl spawn <udid> notifyutil -p me.meeshy.debug.syncpill.sending  # envoi d'image en vol → Live Activity
/// xcrun simctl spawn <udid> notifyutil -p me.meeshy.debug.syncpill.offline  # même envoi, réseau forcé hors ligne
/// xcrun simctl spawn <udid> notifyutil -p me.meeshy.debug.syncpill.clear    # file vidée → l'activité se ferme sur « Envoyé »
/// ```
///
/// En Release, `items` et `isOffline` rendent leur source telle quelle.
///
/// **`nonisolated`, et ce n'est pas décoratif** : la file émet hors du fil
/// principal (observation GRDB), et `items`/`isOffline` composent AVANT le
/// `receive(on: .main)` de leurs consommateurs. Sous l'isolation MainActor par
/// défaut de la cible, une fermeture `map` écrite ici était inférée
/// `@MainActor` — Swift 6 y pose une vérification d'exécuteur, et l'app
/// trappait au lancement (CI 37828648127, « signal trap while preparing to run
/// tests »).
nonisolated enum SyncPillDebugFeed {
    static func items(_ base: AnyPublisher<[OutboxUIItem], Never>) -> AnyPublisher<[OutboxUIItem], Never> {
        #if DEBUG
        return base.combineLatest(fakeItems).map { $0 + $1 }.eraseToAnyPublisher()
        #else
        return base
        #endif
    }

    static func isOffline(_ base: AnyPublisher<Bool, Never>) -> AnyPublisher<Bool, Never> {
        #if DEBUG
        return base.combineLatest(forcedOffline).map { $0 || $1 }.eraseToAnyPublisher()
        #else
        return base
        #endif
    }

    #if DEBUG
    enum Scenario: String, CaseIterable {
        case sending, failed, offline, clear

        var darwinName: String { "me.meeshy.debug.syncpill.\(rawValue)" }
    }

    private nonisolated(unsafe) static let fakeItems = CurrentValueSubject<[OutboxUIItem], Never>([])
    private nonisolated(unsafe) static let forcedOffline = CurrentValueSubject<Bool, Never>(false)
    @MainActor private static var isArmed = false

    @MainActor
    static func arm() {
        guard !isArmed else { return }
        isArmed = true
        for scenario in Scenario.allCases {
            CFNotificationCenterAddObserver(
                CFNotificationCenterGetDarwinNotifyCenter(),
                nil,
                { _, _, name, _, _ in
                    let raw = name?.rawValue as String?
                    DispatchQueue.main.async {
                        MainActor.assumeIsolated {
                            guard let scenario = Scenario.allCases.first(where: { $0.darwinName == raw }) else { return }
                            SyncPillDebugFeed.play(scenario)
                        }
                    }
                },
                scenario.darwinName as CFString,
                nil,
                .deliverImmediately
            )
        }
    }

    @MainActor
    static func play(_ scenario: Scenario) {
        switch scenario {
        case .sending:
            forcedOffline.send(false)
            fakeItems.send([fakeImageSend(status: .inflight)])
        case .failed:
            forcedOffline.send(false)
            fakeItems.send([fakeImageSend(status: .exhausted)])
        case .offline:
            forcedOffline.send(true)
            fakeItems.send([fakeImageSend(status: .pending)])
        case .clear:
            forcedOffline.send(false)
            fakeItems.send([])
        }
    }

    private static func fakeImageSend(status: OutboxStatus) -> OutboxUIItem {
        OutboxUIItem(
            id: "debug.syncpill.\(status.rawValue)",
            kind: .message,
            titlePreview: "📷 Image",
            iconKind: .image,
            attachmentCount: 1,
            source: .unknown,
            status: status,
            createdAt: Date()
        )
    }
    #endif
}
