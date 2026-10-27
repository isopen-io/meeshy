import Foundation
import Combine

final class CallQualityDetailViewModel: ObservableObject {
    @Published private(set) var rows: [CallQualityRow] = []
    @Published private(set) var network: CallQualityNetworkContext?

    private let feed: CallQualityStatsProviding
    private let locale: Locale
    private var readingSubscription: AnyCancellable?

    init(feed: CallQualityStatsProviding? = nil, locale: Locale = .autoupdatingCurrent) {
        self.feed = feed ?? CallQualityStatsFeed.shared
        self.locale = locale
    }

    nonisolated deinit {}

    var overall: CallQualityGrade? {
        CallQualityRows.overall(rows)
    }

    var isWaitingForFirstReading: Bool {
        rows.isEmpty
    }

    func start() {
        guard readingSubscription == nil else { return }
        readingSubscription = feed.readings.sink { [weak self] reading in
            self?.apply(reading)
        }
    }

    func stop() {
        readingSubscription = nil
    }

    private func apply(_ reading: CallQualityReading?) {
        let nextNetwork = CallQualityNetworkContext.from(reading)
        if nextNetwork != network { network = nextNetwork }
        let next = CallQualityRows.rows(for: reading, locale: locale)
        guard next != rows else { return }
        rows = next
    }
}
