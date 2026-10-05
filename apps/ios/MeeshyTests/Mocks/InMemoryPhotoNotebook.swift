import Foundation
@testable import Meeshy

/// Un carnet en mémoire : ce que les propositions et le déroulé y écrivent se lit,
/// sans disque.
@MainActor
final class InMemoryPhotoNotebook: GamePhotoNotebooking {
    nonisolated deinit {}

    private(set) var entries: [NotebookEntry] = []
    var keepSucceeds = true
    private(set) var postponed: [PhotoMoment] = []
    private(set) var kept: [(moment: PhotoMoment, photo: KeptPhoto)] = []

    func postpone(_ moment: PhotoMoment) async -> Bool {
        postponed.append(moment)
        guard !entries.contains(where: { $0.momentId == moment.id }) else { return true }
        entries.append(NotebookEntry(
            momentId: moment.id, emblem: moment.emblem, kicker: moment.kicker, title: moment.title,
            status: .pending, createdAt: Date(), expiresAt: Date().addingTimeInterval(7 * 86_400),
            mode: nil, storyFile: nil, squareFile: nil
        ))
        return true
    }

    func keep(_ moment: PhotoMoment, photo: KeptPhoto) async -> Bool {
        guard keepSucceeds else { return false }
        kept.append((moment, photo))
        entries.removeAll { $0.momentId == moment.id }
        entries.append(NotebookEntry(
            momentId: moment.id, emblem: moment.emblem, kicker: moment.kicker, title: moment.title,
            status: .kept, createdAt: Date(), expiresAt: nil, mode: photo.mode, storyFile: "s", squareFile: "q"
        ))
        return true
    }

    func list() async -> [NotebookEntry] { entries }

    func remove(momentId: String) async -> Bool {
        entries.removeAll { $0.momentId == momentId }
        return true
    }

    func imageData(for entry: NotebookEntry, square: Bool) async -> Data? { nil }
}
