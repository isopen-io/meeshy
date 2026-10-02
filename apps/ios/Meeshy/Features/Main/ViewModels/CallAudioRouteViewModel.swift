import Foundation
import Combine
import os

final class CallAudioRouteViewModel: ObservableObject {
    @Published private(set) var state: CallAudioRouteState = .empty

    private let service: CallAudioRouteProviding
    private var routeSubscription: AnyCancellable?
    private(set) var refreshTask: Task<Void, Never>?
    private(set) var selectionTask: Task<Void, Never>?

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
        selectionTask?.cancel()
        selectionTask = Task { [weak self, service] in
            do {
                try await service.selectInput(id: id)
            } catch {
                Logger.callAudioRoute.error("Preferred input change failed: \(error.localizedDescription)")
                guard !Task.isCancelled else { return }
                self?.state = snapshot
            }
        }
    }

    /// #8989 — la lecture de la route part HORS du fil principal ; seul
    /// l'état résultant y revient.
    private func refresh() {
        refreshTask?.cancel()
        refreshTask = Task { [weak self, service] in
            let route = await service.currentRoute()
            guard !Task.isCancelled, let self, route != self.state else { return }
            self.state = route
        }
    }
}

private extension Logger {
    static let callAudioRoute = Logger(subsystem: "me.meeshy.app", category: "calls")
}
