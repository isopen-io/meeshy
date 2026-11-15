import Combine
import MeeshySDK
import UIKit

extension ListeningSharePreference {
    /// Le câblage de production : le choix suit le compte connecté.
    static let shared = ListeningSharePreference(
        userId: { AuthManager.shared.currentUser?.id },
        requestAuthorization: { await ListeningSharePreference.requestMediaLibrary() }
    )
}

extension ListeningBroadcaster {
    private static let appleMusic = AppleMusicListeningSource()

    /// Le câblage de production : le seul endroit qui nomme les singletons.
    static let shared: ListeningBroadcaster = {
        let preference = ListeningSharePreference.shared
        let account = AuthManager.shared.currentUserPublisher
            .map { $0?.id }
            .removeDuplicates()
            .handleEvents(receiveOutput: { _ in preference.refresh() })
        let enabled = account
            .combineLatest(preference.$enabled)
            .map { userId, enabled in userId != nil && enabled }
        let center = NotificationCenter.default
        let visible = Publishers.Merge(
            center.publisher(for: UIApplication.didBecomeActiveNotification).map { _ in true },
            center.publisher(for: UIApplication.didEnterBackgroundNotification).map { _ in false }
        )
        .prepend(UIApplication.shared.applicationState != .background)
        return ListeningBroadcaster(
            emitter: NowPlayingSocketEmitter.shared,
            tracks: appleMusic.tracks,
            enabled: enabled.eraseToAnyPublisher(),
            visible: visible.eraseToAnyPublisher(),
            connected: MessageSocketManager.shared.$isConnected.eraseToAnyPublisher(),
            ticks: Timer.publish(every: 60, on: .main, in: .common).autoconnect().map { _ in () }.eraseToAnyPublisher()
        )
    }()

    /// Dès l'ouverture de l'app : un morceau qui joue déjà part dès que le choix est fait.
    static func start() {
        _ = shared
    }
}
