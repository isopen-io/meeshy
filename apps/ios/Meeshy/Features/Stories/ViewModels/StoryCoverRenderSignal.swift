import Foundation
import Combine

@MainActor
final class StoryCoverRenderSignal: ObservableObject {
    nonisolated deinit {}

    @Published private(set) var generation = 0

    func bump() {
        StoryCoverURLMemo.bumpGeneration()
        generation += 1
    }
}
