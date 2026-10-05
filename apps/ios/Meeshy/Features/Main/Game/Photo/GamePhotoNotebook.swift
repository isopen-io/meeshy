import Foundation

/// Comment la photo du moment a été faite.
nonisolated enum PhotoMode: String, Codable, Sendable, Equatable {
    case selfie
    case card
    case gallery
}

nonisolated enum NotebookStatus: String, Codable, Sendable, Equatable {
    case pending
    case kept
}

/// UNE ENTRÉE du carnet : une par MOMENT (son identité, `GamePhotoMoments`).
nonisolated struct NotebookEntry: Codable, Equatable, Identifiable, Sendable {
    let momentId: String
    let emblem: PhotoEmblem
    let kicker: String
    let title: String
    let status: NotebookStatus
    let createdAt: Date
    /// Seule une entrée en attente expire.
    let expiresAt: Date?
    let mode: PhotoMode?
    let storyFile: String?
    let squareFile: String?

    var id: String { momentId }
}

/// Les deux images d'une photo gardée (9:16 pour la story, 1:1 pour le profil).
nonisolated struct KeptPhoto: Sendable, Equatable {
    let story: Data
    let square: Data
    let mode: PhotoMode
}

/// LE CARNET DE PROGRESSION (#9382) — conception, partie VI : « le carnet de
/// progression garde ces photos et montre le chemin parcouru ». Il vit sur
/// l'appareil (Application Support) : « la photo reste sur l'appareil tant
/// qu'on ne la partage pas » — aucune image n'est jamais envoyée au serveur.
protocol GamePhotoNotebooking: AnyObject {
    /// « Plus tard » : le moment reste en attente sept jours.
    func postpone(_ moment: PhotoMoment) async -> Bool
    func keep(_ moment: PhotoMoment, photo: KeptPhoto) async -> Bool
    func list() async -> [NotebookEntry]
    func remove(momentId: String) async -> Bool
    func imageData(for entry: NotebookEntry, square: Bool) async -> Data?
}

/// Miroir de `apps/web/src/lib/game-photo/notebook.ts`.
///
/// Une entrée par MOMENT : garder une photo prend la place de l'attente du même
/// moment, une reprise de la photo remplace la précédente. « Plus tard » laisse
/// le moment en attente SEPT JOURS ; passé ce délai la lecture le purge. Une
/// photo GARDÉE ne s'efface jamais toute seule.
///
/// Chaque accès au disque est sous `try` : un disque refusé se lit « carnet
/// vide » à la lecture et « non gardé » à l'écriture — jamais une exception qui
/// remonterait jusqu'à l'écran. La réponse booléenne est ce que l'écran affiche.
@MainActor
final class GamePhotoNotebook: GamePhotoNotebooking {
    nonisolated deinit {}

    static let pendingDays = 7

    private let directory: URL
    private let now: () -> Date

    init(directory: URL, now: @escaping () -> Date = { Date() }) {
        self.directory = directory
        self.now = now
    }

    /// Le carnet d'un compte : `Application Support/MeeshyGame/<userId>/Notebook`.
    static func standard(userId: String) -> GamePhotoNotebook {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        let safeUser = userId.isEmpty ? "anonymous" : sanitized(userId)
        return GamePhotoNotebook(
            directory: base.appendingPathComponent("MeeshyGame", isDirectory: true)
                .appendingPathComponent(safeUser, isDirectory: true)
                .appendingPathComponent("Notebook", isDirectory: true)
        )
    }

    // MARK: - API

    func postpone(_ moment: PhotoMoment) async -> Bool {
        let directory = self.directory
        let created = now()
        let entry = NotebookEntry(
            momentId: moment.id, emblem: moment.emblem, kicker: moment.kicker, title: moment.title,
            status: .pending, createdAt: created,
            expiresAt: created.addingTimeInterval(TimeInterval(Self.pendingDays) * 86_400),
            mode: nil, storyFile: nil, squareFile: nil
        )
        return await Task.detached(priority: .utility) {
            do {
                var entries = try Self.readIndex(in: directory)
                // Une entrée déjà là (en attente ou gardée) ne se remplace pas par une attente.
                guard !entries.contains(where: { $0.momentId == entry.momentId }) else { return true }
                entries.append(entry)
                try Self.writeIndex(entries, in: directory)
                return true
            } catch {
                return false
            }
        }.value
    }

    func keep(_ moment: PhotoMoment, photo: KeptPhoto) async -> Bool {
        let directory = self.directory
        let created = now()
        let stem = Self.sanitized(moment.id)
        let storyName = "\(stem)-story.jpg"
        let squareName = "\(stem)-square.jpg"
        let entry = NotebookEntry(
            momentId: moment.id, emblem: moment.emblem, kicker: moment.kicker, title: moment.title,
            status: .kept, createdAt: created, expiresAt: nil, mode: photo.mode,
            storyFile: storyName, squareFile: squareName
        )
        return await Task.detached(priority: .utility) {
            do {
                try Self.ensureDirectory(directory)
                try photo.story.write(to: directory.appendingPathComponent(storyName), options: [.atomic, .completeFileProtection])
                try photo.square.write(to: directory.appendingPathComponent(squareName), options: [.atomic, .completeFileProtection])
                var entries = try Self.readIndex(in: directory).filter { $0.momentId != entry.momentId }
                entries.append(entry)
                try Self.writeIndex(entries, in: directory)
                return true
            } catch {
                return false
            }
        }.value
    }

    func list() async -> [NotebookEntry] {
        let directory = self.directory
        let current = now()
        return await Task.detached(priority: .utility) {
            guard let entries = try? Self.readIndex(in: directory) else { return [] }
            let stale = entries.filter { Self.isExpired($0, at: current) }
            if !stale.isEmpty {
                let fresh = entries.filter { !Self.isExpired($0, at: current) }
                try? Self.writeIndex(fresh, in: directory)
                stale.forEach { Self.removeFiles(of: $0, in: directory) }
            }
            return entries
                .filter { !Self.isExpired($0, at: current) }
                .sorted { $0.createdAt > $1.createdAt }
        }.value
    }

    func remove(momentId: String) async -> Bool {
        let directory = self.directory
        return await Task.detached(priority: .utility) {
            do {
                let entries = try Self.readIndex(in: directory)
                guard let target = entries.first(where: { $0.momentId == momentId }) else { return true }
                try Self.writeIndex(entries.filter { $0.momentId != momentId }, in: directory)
                Self.removeFiles(of: target, in: directory)
                return true
            } catch {
                return false
            }
        }.value
    }

    func imageData(for entry: NotebookEntry, square: Bool) async -> Data? {
        let directory = self.directory
        guard let name = square ? entry.squareFile : entry.storyFile else { return nil }
        return await Task.detached(priority: .utility) {
            try? Data(contentsOf: directory.appendingPathComponent(name))
        }.value
    }

    // MARK: - Disque (hors du fil principal)

    nonisolated static func sanitized(_ text: String) -> String {
        String(text.map { $0.isLetter || $0.isNumber || $0 == "-" ? $0 : "_" })
    }

    nonisolated static func isExpired(_ entry: NotebookEntry, at date: Date) -> Bool {
        entry.status == .pending && (entry.expiresAt.map { $0 <= date } ?? false)
    }

    private nonisolated static func indexURL(in directory: URL) -> URL {
        directory.appendingPathComponent("index.json")
    }

    private nonisolated static func ensureDirectory(_ directory: URL) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    private nonisolated static func readIndex(in directory: URL) throws -> [NotebookEntry] {
        let url = indexURL(in: directory)
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([NotebookEntry].self, from: Data(contentsOf: url))
    }

    private nonisolated static func writeIndex(_ entries: [NotebookEntry], in directory: URL) throws {
        try ensureDirectory(directory)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        try encoder.encode(entries).write(to: indexURL(in: directory), options: [.atomic, .completeFileProtection])
    }

    private nonisolated static func removeFiles(of entry: NotebookEntry, in directory: URL) {
        [entry.storyFile, entry.squareFile].compactMap { $0 }.forEach {
            try? FileManager.default.removeItem(at: directory.appendingPathComponent($0))
        }
    }
}
