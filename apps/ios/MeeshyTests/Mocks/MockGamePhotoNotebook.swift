import Foundation
@testable import Meeshy

/// Un carnet en mémoire : ce que les propositions et le déroulé y écrivent se lit,
/// sans disque.
@MainActor
final class MockGamePhotoNotebook: GamePhotoNotebooking {
    nonisolated deinit {}

    private(set) var entries: [NotebookEntry] = []
    var keepSucceeds = true
    /// Ce que « Garder » rend ; `nil` : `keepSucceeds` décide (`.kept` ou `.unavailable`).
    var keepOutcome: NotebookKeepOutcome?
    private(set) var postponed: [PhotoMoment] = []
    private(set) var kept: [(moment: PhotoMoment, photo: KeptPhoto)] = []

    func postpone(_ moment: PhotoMoment) async -> Bool {
        postponed.append(moment)
        guard !entries.contains(where: { $0.momentId == moment.id }) else { return true }
        entries.append(NotebookEntry(
            momentId: moment.id, emblem: moment.emblem, kicker: moment.kicker, title: moment.title,
            status: .pending, createdAt: Date()
        ))
        return true
    }

    func keep(_ moment: PhotoMoment, photo: KeptPhoto) async -> NotebookKeepOutcome {
        let outcome = keepOutcome ?? (keepSucceeds ? .kept : .unavailable)
        guard outcome == .kept else { return outcome }
        kept.append((moment, photo))
        entries.removeAll { $0.momentId == moment.id }
        entries.append(NotebookEntry(
            momentId: moment.id, emblem: moment.emblem, kicker: moment.kicker, title: moment.title,
            status: .kept, createdAt: Date(), mode: photo.mode, storyFile: "s",
            sourceFile: photo.source == nil ? nil : "src", recipe: photo.recipe
        ))
        return .kept
    }

    func list() async -> [NotebookEntry] { entries }

    func remove(momentId: String) async -> Bool {
        entries.removeAll { $0.momentId == momentId }
        return true
    }

    func imageData(for entry: NotebookEntry, square: Bool) async -> Data? { nil }

    func sourceData(for entry: NotebookEntry) async -> Data? { nil }

    var bytes: Int64 = 0
    func occupiedBytes() async -> Int64 { bytes }
}
