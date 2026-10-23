import Foundation

/// **Un média qui se lit PENDANT qu'il se télécharge (#9881).**
///
/// Un seul transfert réseau écrit les octets en tête d'un fichier ; tout
/// lecteur (un `AVPlayer` par `ProgressiveAssetLoader`, le cache qui attend la
/// fin) lit ce même fichier. La lecture passe par une poignée ouverte dès la
/// création : elle survit au déplacement du fichier dans le cache, si bien
/// qu'un lecteur ne voit jamais l'adoption.
///
/// Building block opaque : il ne connaît ni URL, ni cache, ni directive.
/// Le fichier de transit lui appartient tant qu'aucun cache ne l'a adopté ;
/// il le supprime alors à sa libération.
// unchecked: état mutable sous `state` (Locked) ; `FileHandle` et les continuations ne sont pas Sendable.
public final class ProgressiveMediaDownload: @unchecked Sendable {
    public typealias Observer = @Sendable () -> Void

    public struct Snapshot: Sendable, Equatable {
        public let file: ProgressiveFileState
        public let mimeType: String?
        public let hasResponded: Bool
        public let hasFailed: Bool
    }

    private enum Outcome {
        case finished
        case failed(Error)
    }

    /// D'où le prochain transfert écrit ce fichier (#11288).
    public enum Continuation: Sendable, Equatable {
        /// Le fichier est entier : il n'y a rien à demander.
        case complete
        /// Demander à partir de cet octet (`0` : le fichier entier).
        case resume(from: Int64)
    }

    private struct State {
        var fileURL: URL
        var ownsFile = true
        var available: Int64 = 0
        var expected: Int64?
        var mimeType: String?
        var hasResponded = false
        var resumable = false
        var outcome: Outcome?
        var writer: FileHandle?
        var reader: FileHandle?
        var observers: [UUID: Observer] = [:]
        var waiters: [CheckedContinuation<URL, Error>] = []
    }

    private let state: Locked<State>

    /// Ouvre un fichier de transit VIDE à `stagingFile` (son dossier est créé).
    public init(stagingFile: URL) throws {
        try FileManager.default.createDirectory(
            at: stagingFile.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        guard FileManager.default.createFile(atPath: stagingFile.path, contents: nil) else {
            throw CocoaError(.fileWriteUnknown)
        }
        let writer = try FileHandle(forWritingTo: stagingFile)
        let reader = try FileHandle(forReadingFrom: stagingFile)
        state = Locked(uncheckedState: State(fileURL: stagingFile, writer: writer, reader: reader))
    }

    /// Un fichier DÉJÀ entier (cache disque, transfert terminé ailleurs) : il
    /// se sert comme un téléchargement fini, et n'est jamais supprimé d'ici.
    public init(completedFile: URL, mimeType: String? = nil) throws {
        let reader = try FileHandle(forReadingFrom: completedFile)
        let size = (try FileManager.default.attributesOfItem(atPath: completedFile.path)[.size] as? NSNumber)?.int64Value ?? 0
        state = Locked(uncheckedState: State(
            fileURL: completedFile,
            ownsFile: false,
            available: size,
            expected: size,
            mimeType: mimeType,
            hasResponded: true,
            outcome: .finished,
            reader: reader
        ))
    }

    deinit {
        let leftover = state.mutateUnchecked { state -> URL? in
            try? state.writer?.close()
            try? state.reader?.close()
            return state.ownsFile ? state.fileURL : nil
        }
        if let leftover { try? FileManager.default.removeItem(at: leftover) }
    }

    // MARK: - Lecture

    public var snapshot: Snapshot {
        state.mutateUnchecked { state -> Snapshot in
            let isComplete: Bool
            let hasFailed: Bool
            switch state.outcome {
            case .finished?: (isComplete, hasFailed) = (true, false)
            case .failed?: (isComplete, hasFailed) = (false, true)
            case nil: (isComplete, hasFailed) = (false, false)
            }
            return Snapshot(
                file: ProgressiveFileState(availableBytes: state.available, expectedBytes: state.expected, isComplete: isComplete),
                mimeType: state.mimeType,
                hasResponded: state.hasResponded,
                hasFailed: hasFailed
            )
        }
    }

    /// Lit `length` octets à partir de `offset`, parmi ceux déjà arrivés.
    public func read(offset: Int64, length: Int) throws -> Data {
        try state.mutateUnchecked { state -> Data in
            guard let reader = state.reader else { throw CocoaError(.fileReadNoSuchFile) }
            let bounded = max(0, min(Int64(length), state.available - offset))
            guard bounded > 0 else { return Data() }
            try reader.seek(toOffset: UInt64(offset))
            return try reader.read(upToCount: Int(bounded)) ?? Data()
        }
    }

    /// Appelé à chaque arrivée d'octets, à la réponse et à la fin — sur un
    /// fil arbitraire. Rend le jeton qui le retire.
    @discardableResult
    public func observe(_ observer: @escaping Observer) -> UUID {
        let token = UUID()
        state.mutateUnchecked { $0.observers[token] = observer }
        return token
    }

    public func removeObserver(_ token: UUID) {
        state.mutateUnchecked { _ = $0.observers.removeValue(forKey: token) }
    }

    /// Le fichier entier, quand le transfert s'est terminé (déplacé dans le
    /// cache s'il y a été gardé). Lève l'erreur du transfert s'il a échoué.
    public func finishedFile() async throws -> URL {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<URL, Error>) in
            let settled = state.mutateUnchecked { state -> Result<URL, Error>? in
                switch state.outcome {
                case .finished?: return .success(state.fileURL)
                case .failed(let error)?: return .failure(error)
                case nil:
                    state.waiters.append(continuation)
                    return nil
                }
            }
            if let settled { continuation.resume(with: settled) }
        }
    }

    // MARK: - Écriture (le transfert)

    public var stagedFileURL: URL {
        state.mutateUnchecked { $0.fileURL }
    }

    func respond(expectedBytes: Int64?, mimeType: String?, resumable: Bool = false) {
        state.mutateUnchecked { state in
            state.expected = expectedBytes.flatMap { $0 > 0 ? $0 : nil }
            state.mimeType = mimeType
            state.hasResponded = true
            state.resumable = resumable
        }
        notify()
    }

    /// Une tête qu'un transfert pourra compléter : servie par plage et
    /// interrompue sans échec, ou déjà entière (#11288).
    var isContinuable: Bool {
        state.mutateUnchecked { state -> Bool in
            !Self.hasFailed(state) && (Self.isWhole(state) || (state.resumable && state.available > 0))
        }
    }

    /// Prépare le fichier pour le transfert qui le complète (#11288) : rien à
    /// faire s'il est entier ; reprise après la tête servie par plage ; sinon
    /// (fichier vierge, réponse entière interrompue, échec) retour au premier
    /// octet — les octets déjà lus par un lecteur sont ceux qui seront réécrits.
    func prepareContinuation() throws -> Continuation {
        try state.mutateUnchecked { state -> Continuation in
            if Self.isWhole(state) { return .complete }
            let writer = try state.writer ?? FileHandle(forWritingTo: state.fileURL)
            state.writer = writer
            if !Self.hasFailed(state), state.resumable, state.available > 0 {
                try writer.seekToEnd()
                return .resume(from: state.available)
            }
            try writer.truncate(atOffset: 0)
            state.available = 0
            state.expected = nil
            state.hasResponded = false
            state.resumable = false
            state.outcome = nil
            return .resume(from: 0)
        }
    }

    private static func hasFailed(_ state: State) -> Bool {
        guard case .failed? = state.outcome else { return false }
        return true
    }

    private static func isWhole(_ state: State) -> Bool {
        if case .finished? = state.outcome { return true }
        guard state.hasResponded, let expected = state.expected else { return false }
        return state.available >= expected
    }

    func append(_ data: Data) throws {
        try state.mutateUnchecked { state -> Void in
            guard let writer = state.writer else { throw CocoaError(.fileWriteUnknown) }
            try writer.write(contentsOf: data)
            state.available += Int64(data.count)
        }
        notify()
    }

    /// Ferme l'écriture, sans encore annoncer la fin : le cache adopte
    /// d'abord le fichier, puis `finish(relocatedTo:)` le déclare entier.
    func closeWriting() {
        state.mutateUnchecked { state in
            try? state.writer?.close()
            state.writer = nil
        }
    }

    /// Le transfert est complet. `relocatedTo` : là où le cache a gardé le
    /// fichier — il ne le supprime plus. `nil` : non gardé (`no-store`), il
    /// reste à ce téléchargement et part avec lui.
    func finish(relocatedTo cached: URL?) {
        let waiters = state.mutateUnchecked { state -> [CheckedContinuation<URL, Error>] in
            try? state.writer?.close()
            state.writer = nil
            if let cached {
                state.fileURL = cached
                state.ownsFile = false
            }
            if state.expected == nil { state.expected = state.available }
            state.outcome = .finished
            defer { state.waiters = [] }
            return state.waiters
        }
        let fileURL = stagedFileURL
        waiters.forEach { $0.resume(returning: fileURL) }
        notify()
    }

    func fail(_ error: Error) {
        let waiters = state.mutateUnchecked { state -> [CheckedContinuation<URL, Error>] in
            if state.outcome != nil { return [] }
            try? state.writer?.close()
            state.writer = nil
            state.outcome = .failed(error)
            defer { state.waiters = [] }
            return state.waiters
        }
        waiters.forEach { $0.resume(throwing: error) }
        notify()
    }

    private func notify() {
        let observers = state.mutateUnchecked { Array($0.observers.values) }
        observers.forEach { $0() }
    }
}
