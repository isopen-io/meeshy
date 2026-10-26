import Foundation
import UIKit
import MeeshySDK

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

/// Le recadrage de la photo dans la fenêtre du cadre : décalage (fractions) et zoom.
nonisolated struct NotebookCrop: Codable, Equatable, Sendable {
    let x: Double
    let y: Double
    let zoom: Double
}

/// LA RECETTE d'une photo (§ 5.13, #10161) : de quoi la recomposer. Chaque champ est facultatif ;
/// une entrée écrite avant la recette se relit avec une recette vide.
nonisolated struct NotebookRecipe: Codable, Equatable, Sendable {
    var frameId: String?
    var pose: String?
    var message: String?
    var crop: NotebookCrop?
    /// Selfie : oui ; galerie : non.
    var mirror: Bool?
    var showFlame: Bool?
    var showLink: Bool?
    /// La date de l'étape.
    var momentAt: Date?

    init(
        frameId: String? = nil, pose: String? = nil, message: String? = nil, crop: NotebookCrop? = nil,
        mirror: Bool? = nil, showFlame: Bool? = nil, showLink: Bool? = nil, momentAt: Date? = nil
    ) {
        self.frameId = frameId
        self.pose = pose
        self.message = message
        self.crop = crop
        self.mirror = mirror
        self.showFlame = showFlame
        self.showLink = showLink
        self.momentAt = momentAt
    }
}

/// Ce qu'une entrée propose à la reprise : la même photo seulement si sa source est gardée.
nonisolated enum NotebookRetakeChoice: Equatable, Sendable {
    case samePhoto
    case selfie
    case card
}

/// UNE ENTRÉE du carnet : une par MOMENT (son identité, `GamePhotoMoments`).
nonisolated struct NotebookEntry: Codable, Equatable, Identifiable, Sendable {
    let momentId: String
    let emblem: PhotoEmblem
    let kicker: String
    let title: String
    let status: NotebookStatus
    let createdAt: Date
    /// Écrit par les versions d'avant #10161 ; plus jamais écrit ni relu.
    let expiresAt: Date?
    let mode: PhotoMode?
    let storyFile: String?
    /// Les anciennes entrées seulement : une entrée neuve recompose le 1:1 depuis sa recette.
    let squareFile: String?
    /// La photo d'origine réduite (1 440 px, JPEG q0,85) ; absente d'une carte seule et des anciennes entrées.
    let sourceFile: String?
    let recipe: NotebookRecipe

    var id: String { momentId }

    var retakeChoices: [NotebookRetakeChoice] {
        sourceFile == nil ? [.selfie, .card] : [.samePhoto, .selfie, .card]
    }

    init(
        momentId: String, emblem: PhotoEmblem, kicker: String, title: String, status: NotebookStatus, createdAt: Date,
        expiresAt: Date? = nil, mode: PhotoMode? = nil, storyFile: String? = nil, squareFile: String? = nil,
        sourceFile: String? = nil, recipe: NotebookRecipe = NotebookRecipe()
    ) {
        self.momentId = momentId
        self.emblem = emblem
        self.kicker = kicker
        self.title = title
        self.status = status
        self.createdAt = createdAt
        self.expiresAt = expiresAt
        self.mode = mode
        self.storyFile = storyFile
        self.squareFile = squareFile
        self.sourceFile = sourceFile
        self.recipe = recipe
    }

    private enum CodingKeys: String, CodingKey {
        case momentId, emblem, kicker, title, status, createdAt, expiresAt, mode, storyFile, squareFile, sourceFile, recipe
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        momentId = try container.decode(String.self, forKey: .momentId)
        emblem = try container.decode(PhotoEmblem.self, forKey: .emblem)
        kicker = try container.decode(String.self, forKey: .kicker)
        title = try container.decode(String.self, forKey: .title)
        status = try container.decode(NotebookStatus.self, forKey: .status)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        expiresAt = try container.decodeIfPresent(Date.self, forKey: .expiresAt)
        mode = try container.decodeIfPresent(PhotoMode.self, forKey: .mode)
        storyFile = try container.decodeIfPresent(String.self, forKey: .storyFile)
        squareFile = try container.decodeIfPresent(String.self, forKey: .squareFile)
        sourceFile = try container.decodeIfPresent(String.self, forKey: .sourceFile)
        recipe = try container.decodeIfPresent(NotebookRecipe.self, forKey: .recipe) ?? NotebookRecipe()
    }
}

/// Ce qu'on garde d'une photo (#10161) : l'image 9:16 composée, sa source réduite et sa recette.
/// Le 1:1 se recompose au partage.
nonisolated struct KeptPhoto: Sendable, Equatable {
    let story: Data
    let mode: PhotoMode
    let source: Data?
    let recipe: NotebookRecipe

    init(story: Data, mode: PhotoMode, source: Data? = nil, recipe: NotebookRecipe = NotebookRecipe()) {
        self.story = story
        self.mode = mode
        self.source = source
        self.recipe = recipe
    }
}

/// `noSpace` : le disque est plein, l'écran le dessine ; `unavailable` : l'écriture est refusée.
/// Dans les deux cas, AUCUNE entrée n'est créée et aucun fichier ne reste.
nonisolated enum NotebookKeepOutcome: Equatable, Sendable {
    case kept
    case noSpace
    case unavailable
}

/// LE CARNET DE PROGRESSION (#9382) — conception, partie VI : « le carnet de
/// progression garde ces photos et montre le chemin parcouru ». Il vit sur
/// l'appareil (Application Support) : « la photo reste sur l'appareil tant
/// qu'on ne la partage pas » — aucune image n'est jamais envoyée au serveur.
protocol GamePhotoNotebooking: AnyObject {
    /// « Plus tard » : le moment reste en attente, sans échéance (#10161). Une étape de piste ne s'y
    /// écrit pas : elle se rattrape.
    func postpone(_ moment: PhotoMoment) async -> Bool
    func keep(_ moment: PhotoMoment, photo: KeptPhoto) async -> NotebookKeepOutcome
    func list() async -> [NotebookEntry]
    func remove(momentId: String) async -> Bool
    func imageData(for entry: NotebookEntry, square: Bool) async -> Data?
    func sourceData(for entry: NotebookEntry) async -> Data?
    /// La place qu'occupent les images du carnet, en octets.
    func occupiedBytes() async -> Int64
}

/// Miroir de `apps/web/src/lib/game-photo/notebook.ts`.
///
/// Une entrée par MOMENT : garder une photo prend la place de l'attente du même
/// moment, une reprise de la photo remplace la précédente. Une entrée NEUVE garde
/// l'image 9:16, sa SOURCE (`<stem>-source.jpg`) et sa RECETTE ; les anciennes
/// entrées se relisent telles qu'écrites. « Plus tard » n'expire plus, et une
/// étape de piste reportée ne s'y écrit pas (elle se rattrape). Une photo GARDÉE
/// ne s'efface jamais toute seule.
///
/// Chaque accès au disque est sous `try` : un disque refusé se lit « carnet
/// vide » à la lecture ; à l'écriture, « disque plein » se distingue de « refusé »,
/// et une écriture qui échoue ne laisse ni entrée ni fichier.
@MainActor
final class GamePhotoNotebook: GamePhotoNotebooking {
    nonisolated deinit {}

    /// La source gardée : bornée à 1 440 px de grand côté, JPEG q0,85 (§ 5.13).
    nonisolated static let sourceMaxEdge: CGFloat = 1440
    nonisolated static let sourceQuality: CGFloat = 0.85

    /// Écrit un fichier du carnet ; injecté par les témoins pour simuler un disque plein ou un refus.
    typealias FileWriter = @Sendable (Data, URL) throws -> Void

    /// Chaque fichier du carnet est protégé tant que l'appareil est verrouillé.
    nonisolated static let protectedWrite: FileWriter = { data, url in
        try data.write(to: url, options: [.atomic, .completeFileProtection])
    }

    private let directory: URL
    private let now: () -> Date
    private let write: FileWriter

    init(directory: URL, now: @escaping () -> Date = { Date() }, write: @escaping FileWriter = GamePhotoNotebook.protectedWrite) {
        self.directory = directory
        self.now = now
        self.write = write
    }

    /// `Application Support/MeeshyGame` — un dossier par compte de l'appareil.
    nonisolated static func accountsRoot(base: URL? = nil) -> URL {
        (base ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory).appendingPathComponent("MeeshyGame", isDirectory: true)
    }

    /// Le dossier du jeu d'un compte : tout ce qu'il a gardé sur l'appareil (#10482).
    nonisolated static func accountFolder(userId: String, base: URL? = nil) -> URL {
        accountsRoot(base: base).appendingPathComponent(userId.isEmpty ? "anonymous" : sanitized(userId), isDirectory: true)
    }

    /// Le carnet d'un compte : `Application Support/MeeshyGame/<userId>/Notebook`.
    static func standard(userId: String) -> GamePhotoNotebook {
        GamePhotoNotebook(directory: accountFolder(userId: userId).appendingPathComponent("Notebook", isDirectory: true))
    }

    /// **Les cadres que les carnets de TOUS les comptes de l'appareil gardent dans
    /// une recette** — l'élagage des packs ne touche pas à leurs fichiers
    /// (§ 5.10.6). `nil` si un index ne se relit pas : dans le doute, on garde.
    nonisolated static func referencedFrameIdsOfEveryAccount(base: URL? = nil) async -> Set<String>? {
        let root = accountsRoot(base: base)
        let accounts = (try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? []
        var frames: Set<String> = []
        for account in accounts {
            let directory = root.appendingPathComponent(account, isDirectory: true)
                .appendingPathComponent("Notebook", isDirectory: true)
            guard let entries = try? readIndex(in: directory) else { return nil }
            frames.formUnion(entries.compactMap(\.recipe.frameId))
        }
        return frames
    }

    // MARK: - API

    /// Toute lecture et toute écriture de l'index passent par UN acteur par dossier : deux
    /// gestes concurrents (garder deux moments, garder pendant qu'on purge) ne relisent plus
    /// l'index chacun de leur côté pour le réécrire ensuite — l'un perdait son entrée (#9382).
    private var disk: NotebookDisk { NotebookDisk.shared(for: directory) }

    func postpone(_ moment: PhotoMoment) async -> Bool {
        if GamePhotoCatchUp.track(of: moment.id) != nil { return true }
        let entry = NotebookEntry(
            momentId: moment.id, emblem: moment.emblem, kicker: moment.kicker, title: moment.title,
            status: .pending, createdAt: now()
        )
        return await disk.postpone(entry)
    }

    func keep(_ moment: PhotoMoment, photo: KeptPhoto) async -> NotebookKeepOutcome {
        let stem = Self.sanitized(moment.id)
        let entry = NotebookEntry(
            momentId: moment.id, emblem: moment.emblem, kicker: moment.kicker, title: moment.title,
            status: .kept, createdAt: now(), mode: photo.mode,
            storyFile: "\(stem)-story.jpg",
            sourceFile: photo.source == nil ? nil : "\(stem)-source.jpg",
            recipe: photo.recipe
        )
        return await disk.keep(entry, photo: photo, write: write)
    }

    func list() async -> [NotebookEntry] {
        await disk.list()
    }

    func remove(momentId: String) async -> Bool {
        await disk.remove(momentId: momentId)
    }

    func imageData(for entry: NotebookEntry, square: Bool) async -> Data? {
        guard let name = square ? entry.squareFile : entry.storyFile else { return nil }
        return await disk.imageData(named: name)
    }

    func sourceData(for entry: NotebookEntry) async -> Data? {
        guard let name = entry.sourceFile else { return nil }
        return await disk.imageData(named: name)
    }

    func occupiedBytes() async -> Int64 {
        await disk.occupiedBytes()
    }

    // MARK: - Disque (hors du fil principal)

    nonisolated static func sanitized(_ text: String) -> String {
        String(text.map { $0.isLetter || $0.isNumber || $0 == "-" ? $0 : "_" })
    }

    /// Un disque plein se DESSINE (« Plus de place sur cet appareil ») ; tout autre refus se dit « non gardé ».
    nonisolated static func outcome(of error: Error) -> NotebookKeepOutcome {
        let ns = error as NSError
        if ns.domain == NSCocoaErrorDomain, ns.code == NSFileWriteOutOfSpaceError { return .noSpace }
        if ns.domain == NSPOSIXErrorDomain, ns.code == Int(ENOSPC) { return .noSpace }
        if let underlying = ns.userInfo[NSUnderlyingErrorKey] as? Error { return outcome(of: underlying) }
        return .unavailable
    }

    /// La photo d'origine réduite pour le carnet : 1 440 px de grand côté au plus (jamais agrandie),
    /// orientation appliquée, JPEG q0,85. Jamais en miroir : la recette dit `mirror`.
    nonisolated static func sourceData(from image: UIImage) -> Data? {
        let pixels = CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
        guard pixels.width > 0, pixels.height > 0 else { return nil }
        let ratio = min(1, sourceMaxEdge / max(pixels.width, pixels.height))
        let target = CGSize(width: (pixels.width * ratio).rounded(), height: (pixels.height * ratio).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let reduced = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
        return reduced.jpegData(compressionQuality: sourceQuality)
    }

    fileprivate nonisolated static func indexURL(in directory: URL) -> URL {
        directory.appendingPathComponent("index.json")
    }

    fileprivate nonisolated static func ensureDirectory(_ directory: URL) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    fileprivate nonisolated static func readIndex(in directory: URL) throws -> [NotebookEntry] {
        let url = indexURL(in: directory)
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }
        let decoder = MeeshyCoders.decoder(.persistence)
        return try decoder.decode([NotebookEntry].self, from: Data(contentsOf: url))
    }

    fileprivate nonisolated static func writeIndex(_ entries: [NotebookEntry], in directory: URL) throws {
        try ensureDirectory(directory)
        let encoder = MeeshyCoders.encoder(.persistence)
        try encoder.encode(entries).write(to: indexURL(in: directory), options: [.atomic, .completeFileProtection])
    }

    fileprivate nonisolated static func files(of entry: NotebookEntry) -> [String] {
        [entry.storyFile, entry.squareFile, entry.sourceFile].compactMap { $0 }
    }

    fileprivate nonisolated static func removeFiles(_ names: [String], in directory: URL) {
        names.forEach { try? FileManager.default.removeItem(at: directory.appendingPathComponent($0)) }
    }
}

/// UN ACTEUR PAR DOSSIER : la lecture-modification-écriture de l'index y est sérielle, et le
/// disque se touche hors du fil principal. Les carnets du même dossier (le `standard` d'un
/// compte est reconstruit à chaque ouverture) partagent le même acteur.
fileprivate actor NotebookDisk {
    private let directory: URL

    init(directory: URL) {
        self.directory = directory
    }

    private static let registry = NotebookDiskRegistry()

    static func shared(for directory: URL) -> NotebookDisk {
        registry.disk(for: directory)
    }

    func postpone(_ entry: NotebookEntry) -> Bool {
        do {
            var entries = try GamePhotoNotebook.readIndex(in: directory)
            // Une entrée déjà là (en attente ou gardée) ne se remplace pas par une attente.
            guard !entries.contains(where: { $0.momentId == entry.momentId }) else { return true }
            entries.append(entry)
            try GamePhotoNotebook.writeIndex(entries, in: directory)
            return true
        } catch {
            return false
        }
    }

    /// Les fichiers s'écrivent À CÔTÉ (`.<nom>.writing`), puis l'index, puis ils prennent leur place : un
    /// échec, à quelque étape que ce soit avant l'index, ne laisse ni entrée ni fichier, et une reprise
    /// ratée laisse la photo précédente intacte. Une reprise réussie retire les fichiers de l'entrée
    /// remplacée qu'elle ne réécrit pas.
    func keep(_ entry: NotebookEntry, photo: KeptPhoto, write: GamePhotoNotebook.FileWriter) -> NotebookKeepOutcome {
        guard let storyName = entry.storyFile else { return .unavailable }
        let sources: [(String, Data)] = {
            guard let name = entry.sourceFile, let data = photo.source else { return [] }
            return [(name, data)]
        }()
        let writes = [(storyName, photo.story)] + sources
        var staged: [(temp: URL, final: URL)] = []
        do {
            try GamePhotoNotebook.ensureDirectory(directory)
            for (name, data) in writes {
                let temp = directory.appendingPathComponent(".\(name).writing")
                try write(data, temp)
                staged.append((temp, directory.appendingPathComponent(name)))
            }
            let current = try GamePhotoNotebook.readIndex(in: directory)
            let replaced = current.filter { $0.momentId == entry.momentId }
            try GamePhotoNotebook.writeIndex(current.filter { $0.momentId != entry.momentId } + [entry], in: directory)
            for file in staged {
                if FileManager.default.fileExists(atPath: file.final.path) {
                    _ = try FileManager.default.replaceItemAt(file.final, withItemAt: file.temp)
                } else {
                    try FileManager.default.moveItem(at: file.temp, to: file.final)
                }
            }
            let kept = writes.map { $0.0 }
            GamePhotoNotebook.removeFiles(replaced.flatMap(GamePhotoNotebook.files(of:)).filter { !kept.contains($0) }, in: directory)
            return .kept
        } catch {
            staged.forEach { try? FileManager.default.removeItem(at: $0.temp) }
            return GamePhotoNotebook.outcome(of: error)
        }
    }

    func list() -> [NotebookEntry] {
        guard let entries = try? GamePhotoNotebook.readIndex(in: directory) else { return [] }
        return entries.sorted { $0.createdAt > $1.createdAt }
    }

    func remove(momentId: String) -> Bool {
        do {
            let entries = try GamePhotoNotebook.readIndex(in: directory)
            guard let target = entries.first(where: { $0.momentId == momentId }) else { return true }
            try GamePhotoNotebook.writeIndex(entries.filter { $0.momentId != momentId }, in: directory)
            GamePhotoNotebook.removeFiles(GamePhotoNotebook.files(of: target), in: directory)
            return true
        } catch {
            return false
        }
    }

    func imageData(named name: String) -> Data? {
        try? Data(contentsOf: directory.appendingPathComponent(name))
    }

    func occupiedBytes() -> Int64 {
        let names = list().flatMap(GamePhotoNotebook.files(of:))
        return names.reduce(Int64(0)) { total, name in
            let attributes = try? FileManager.default.attributesOfItem(atPath: directory.appendingPathComponent(name).path)
            return total + ((attributes?[.size] as? NSNumber)?.int64Value ?? 0)
        }
    }
}

fileprivate nonisolated final class NotebookDiskRegistry: @unchecked Sendable {
    private let lock = NSLock()
    private var disks: [String: NotebookDisk] = [:]

    func disk(for directory: URL) -> NotebookDisk {
        lock.lock()
        defer { lock.unlock() }
        let key = directory.standardizedFileURL.path
        if let known = disks[key] { return known }
        let created = NotebookDisk(directory: directory)
        disks[key] = created
        return created
    }
}
