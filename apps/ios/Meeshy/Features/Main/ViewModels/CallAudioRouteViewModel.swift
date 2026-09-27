import Foundation
import Combine
import os

final class CallAudioRouteViewModel: ObservableObject {
    @Published private(set) var state: CallAudioRouteState = .empty

    private let service: CallAudioRouteProviding
    private var routeSubscription: AnyCancellable?

    init(service: CallAudioRouteProviding? = nil) {
        self.service = service ?? CallAudioRouteService.shared
    }

    nonisolated deinit {}

    func start() {
        refresh()
        guard routeSubscription == nil else { return }
        routeSubscription = service.routeChanges.sink { [weak self] in
            self?.refresh()
        }
    }

    func stop() {
        routeSubscription = nil
    }

    func selectInput(id: String) {
        let snapshot = state
        state = state.selecting(inputId: id)
        do {
            try service.selectInput(id: id)
        } catch {
            Logger.callAudioRoute.error("Preferred input change failed: \(error.localizedDescription)")
            state = snapshot
        }
    }

    private func refresh() {
        let route = service.currentRoute()
        guard route != state else { return }
        state = route
    }
}

private extension Logger {
    static let callAudioRoute = Logger(subsystem: "me.meeshy.app", category: "calls")
}
