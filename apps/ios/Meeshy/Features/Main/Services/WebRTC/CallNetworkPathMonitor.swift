import Combine
import Foundation
import MeeshySDK

protocol CallNetworkPathProviding: AnyObject {
    func start(onChange: @escaping @MainActor @Sendable (CallNetworkPath) -> Void)
    func stop()
}

extension CallNetworkPath {
    init(snapshot: NetworkPathSnapshot) {
        self.init(isExpensive: snapshot.isExpensive, isConstrained: snapshot.isConstrained)
    }
}

/// Watches the OS path for the length of one call (#8697), through the SDK's
/// single `NetworkPathSource` rather than a second `NWPathMonitor`. `start`
/// hands over the path already known, so the first offer — built right after
/// `configure` — carries the right Opus fmtp instead of the Wi-Fi one.
final class CallNetworkPathMonitor: CallNetworkPathProviding {
    nonisolated deinit {}

    private let source: NetworkPathSource
    private var subscription: AnyCancellable?

    init(source: NetworkPathSource = .shared) {
        self.source = source
    }

    func start(onChange: @escaping @MainActor @Sendable (CallNetworkPath) -> Void) {
        stop()
        onChange(CallNetworkPath(snapshot: source.current))
        subscription = source.publisher
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { snapshot in
                onChange(CallNetworkPath(snapshot: snapshot))
            }
    }

    func stop() {
        subscription?.cancel()
        subscription = nil
    }
}
