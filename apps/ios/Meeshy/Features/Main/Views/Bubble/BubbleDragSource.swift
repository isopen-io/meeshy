import Foundation
import SwiftUI
import UniformTypeIdentifiers
import MeeshySDK

nonisolated enum AttachmentDragKind: Equatable, Sendable {
    case image
    case video
}

nonisolated enum BubbleDragSource: Equatable, Sendable {
    case text(String)
    case media(remoteURL: String, kind: AttachmentDragKind, suggestedName: String, typeIdentifier: String)
}

nonisolated enum BubbleDragPolicy {

    static func mayLeave(_ offer: MessageExitOffer) -> Bool {
        offer.offers(.share) && !offer.isEncrypted
    }

    static func source(for message: Message, servedText: String?, isRegularWidth: Bool, standalone: Bool) -> BubbleDragSource? {
        guard isRegularWidth, !standalone else { return nil }
        return source(for: message, servedText: servedText)
    }

    static func source(for message: Message, servedText: String?) -> BubbleDragSource? {
        guard message.messageSource == .user, !message.isDeleted, mayLeave(message.exitOffer) else { return nil }
        if let piece = MessagePieceTarget.pieces(of: message).first {
            return mediaSource(piece)
        }
        let served = servedText.flatMap { $0.isEmpty ? nil : $0 } ?? message.content
        return served.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : .text(served)
    }

    private static func mediaSource(_ piece: MessageAttachment) -> BubbleDragSource? {
        guard !piece.fileUrl.isEmpty else { return nil }
        let kind: AttachmentDragKind = piece.type == .video ? .video : .image
        return .media(
            remoteURL: piece.fileUrl,
            kind: kind,
            suggestedName: suggestedName(for: piece),
            typeIdentifier: typeIdentifier(mimeType: piece.mimeType, kind: kind)
        )
    }

    private static func suggestedName(for piece: MessageAttachment) -> String {
        let candidate = [piece.originalName, piece.fileName].first { !$0.isEmpty } ?? "attachment"
        let leaf = (candidate as NSString).lastPathComponent
        return leaf.isEmpty ? "attachment" : leaf
    }

    private static func typeIdentifier(mimeType: String, kind: AttachmentDragKind) -> String {
        let fallback: UTType = kind == .video ? .movie : .image
        guard let resolved = UTType(mimeType: mimeType), resolved.conforms(to: fallback) else { return fallback.identifier }
        return resolved.identifier
    }
}

nonisolated enum BubbleDragScratch {

    static let directoryPrefix = "BubbleDrag-"
    static let staleAfter: TimeInterval = 600

    static func purge(
        in base: URL = FileManager.default.temporaryDirectory,
        olderThan age: TimeInterval = 0,
        now: Date = Date(),
        fileManager: FileManager = .default
    ) {
        let keys: [URLResourceKey] = [.contentModificationDateKey]
        let entries = (try? fileManager.contentsOfDirectory(at: base, includingPropertiesForKeys: keys)) ?? []
        entries
            .filter { $0.lastPathComponent.hasPrefix(directoryPrefix) }
            .filter { entry in
                guard age > 0 else { return true }
                let modified = (try? entry.resourceValues(forKeys: Set(keys)))?.contentModificationDate
                return modified.map { now.timeIntervalSince($0) > age } ?? true
            }
            .forEach { try? fileManager.removeItem(at: $0) }
    }
}

nonisolated enum BubbleDragItemProvider {

    private enum DragError: Error {
        case notCached
    }

    static func make(
        _ source: BubbleDragSource,
        resolveCachedFile: @escaping @Sendable (String, AttachmentDragKind) async -> URL?
    ) -> NSItemProvider {
        switch source {
        case .text(let text):
            return NSItemProvider(object: text as NSString)
        case let .media(remoteURL, kind, suggestedName, typeIdentifier):
            let provider = NSItemProvider()
            provider.suggestedName = suggestedName
            provider.registerFileRepresentation(forTypeIdentifier: typeIdentifier, fileOptions: [], visibility: .all) { completion in
                Task {
                    guard let cached = await resolveCachedFile(remoteURL, kind) else {
                        completion(nil, false, DragError.notCached)
                        return
                    }
                    do {
                        completion(try copy(cached, named: suggestedName), false, nil)
                    } catch {
                        completion(nil, false, error)
                    }
                }
                return nil
            }
            return provider
        }
    }

    private static func copy(_ cached: URL, named name: String) throws -> URL {
        BubbleDragScratch.purge(olderThan: BubbleDragScratch.staleAfter)
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("\(BubbleDragScratch.directoryPrefix)\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let destination = directory.appendingPathComponent(name)
        try FileManager.default.copyItem(at: cached, to: destination)
        return destination
    }
}

struct BubbleDragSourceModifier: ViewModifier {
    let source: BubbleDragSource?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let source {
            content.onDrag { provider(for: source) }
        } else {
            content
        }
    }

    private func provider(for source: BubbleDragSource) -> NSItemProvider {
        BubbleDragItemProvider.make(source) { remoteURL, kind in
            await Self.cachedFile(remoteURL: remoteURL, kind: kind)
        }
    }

    private static func cachedFile(remoteURL: String, kind: AttachmentDragKind) async -> URL? {
        guard let resolved = MeeshyConfig.resolveMediaURL(remoteURL) else { return nil }
        let coordinator = CacheCoordinator.shared
        let store = await (kind == .video ? coordinator.video : coordinator.images)
        return store.cachedFileURL(for: resolved.absoluteString)
    }
}
