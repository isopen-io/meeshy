import Foundation

/// L'unité de source du coordinateur : `MediaSessionCoordinator.swift` puis
/// chacune de ses extensions `MediaSessionCoordinator+*.swift`, du même
/// dossier. Les gardes de source lisent cette unité entière — un texte déplacé
/// dans une extension reste gardé.
enum MediaSessionCoordinatorSourceUnit {

    static func read(filePath: String = #filePath) throws -> String {
        var root = URL(fileURLWithPath: filePath).deletingLastPathComponent()
        while !FileManager.default.fileExists(atPath: root.appendingPathComponent("Sources/MeeshySDK/Media").path),
              root.path != "/" {
            root.deleteLastPathComponent()
        }
        let directory = root.appendingPathComponent("Sources/MeeshySDK/Media")
        let extensions = try FileManager.default.contentsOfDirectory(atPath: directory.path)
            .filter { $0.hasPrefix("MediaSessionCoordinator+") && $0.hasSuffix(".swift") }
            .sorted()
        return try (["MediaSessionCoordinator.swift"] + extensions)
            .map { try String(contentsOf: directory.appendingPathComponent($0), encoding: .utf8) }
            .joined(separator: "\n")
    }
}
