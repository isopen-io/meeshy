import XCTest

final class ExtensionIsolationGuardTests: XCTestCase {

    private let ios = ProjectManifest.iosDirectory()
    private let nonisolatedTargets = ["MeeshyNotificationExtension", "MeeshyBroadcastExtension", "MeeshyWidgets"]
    private let mainActorConsumers = ["Meeshy", "MeeshyShareExtension", "MeeshyNotificationContentExtension"]
    private let declarationKeywords: Set<String> = ["struct", "enum", "class", "actor", "extension", "protocol"]
    private let declarationModifiers: Set<String> = ["public", "internal", "private", "fileprivate", "final", "nonisolated", "open"]

    private func manifest() throws -> ProjectManifest {
        try ProjectManifest.load(from: ios)
    }

    private func source(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: ios.appendingPathComponent(path), encoding: .utf8))
    }

    private func swiftFiles(in directory: String) throws -> [String] {
        try FileManager.default
            .contentsOfDirectory(atPath: ios.appendingPathComponent(directory).path)
            .filter { $0.hasSuffix(".swift") }
            .map { "\(directory)/\($0)" }
    }

    func test_extensionTargets_declareNonisolatedDefaultIsolation() throws {
        let manifest = try manifest()
        for target in nonisolatedTargets {
            let settings = (manifest.targets[target] ?? []).map { $0.trimmingCharacters(in: .whitespaces) }
            XCTAssertTrue(
                settings.contains("SWIFT_DEFAULT_ACTOR_ISOLATION: nonisolated"),
                "\(target) hérite de l'isolation MainActor du projet : son travail de fond doit être nonisolated par défaut"
            )
        }
    }

    func test_extensionsThatHostSwiftUI_stayMainActor() throws {
        let manifest = try manifest()
        for target in ["MeeshyShareExtension", "MeeshyNotificationContentExtension"] {
            let settings = (manifest.targets[target] ?? []).map { $0.trimmingCharacters(in: .whitespaces) }
            XCTAssertFalse(settings.contains("SWIFT_DEFAULT_ACTOR_ISOLATION: nonisolated"), target)
        }
    }

    func test_filesSharedWithMainActorTargets_declareExplicitIsolation() throws {
        let manifest = try manifest()
        let shared = nonisolatedTargets.flatMap { directory in
            manifest.swiftPaths(inDirectory: directory, listedBy: mainActorConsumers)
        }
        XCTAssertFalse(shared.isEmpty)
        for path in shared.sorted() {
            for declaration in undeclaredIsolation(in: try source(path)) {
                XCTFail("\(path) : « \(declaration) » change d'isolation selon la cible qui le compile — annoter nonisolated ou @MainActor")
            }
        }
    }

    func test_exclusiveExtensionFiles_carryNoRedundantNonisolated() throws {
        let manifest = try manifest()
        for directory in nonisolatedTargets {
            let shared = manifest.swiftPaths(inDirectory: directory, listedBy: mainActorConsumers)
            let exclusive = try swiftFiles(in: directory).filter { !shared.contains($0) }
            for path in exclusive {
                for line in redundantNonisolatedLines(in: try source(path)) {
                    XCTFail("\(path) : « \(line) » — la cible est nonisolated par défaut, l'annotation est redondante")
                }
            }
        }
    }

    private func undeclaredIsolation(in code: String) -> [String] {
        let lines = code.components(separatedBy: "\n")
        return lines.indices.compactMap { index -> String? in
            guard isTopLevelDeclaration(lines[index]), !declaresIsolation(lines: lines, at: index) else { return nil }
            return lines[index]
        }
    }

    private func isTopLevelDeclaration(_ line: String) -> Bool {
        guard let first = line.first, !first.isWhitespace, first != "}" else { return false }
        let tokens = line.split(separator: " ").map(String.init)
        guard let keyword = tokens.firstIndex(where: declarationKeywords.contains) else { return false }
        return tokens[..<keyword].allSatisfy { declarationModifiers.contains($0) || $0.hasPrefix("@") }
    }

    private func declaresIsolation(lines: [String], at index: Int) -> Bool {
        func isolating(_ line: String) -> Bool {
            line.contains("nonisolated") || line.contains("@MainActor")
        }
        if isolating(lines[index]) { return true }
        var cursor = index - 1
        while cursor >= 0, lines[cursor].trimmingCharacters(in: .whitespaces).hasPrefix("@") {
            if isolating(lines[cursor]) { return true }
            cursor -= 1
        }
        return false
    }

    private func redundantNonisolatedLines(in code: String) -> [String] {
        var insideMainActorType = false
        var redundant: [String] = []
        let lines = code.components(separatedBy: "\n")
        for (index, line) in lines.enumerated() {
            if isTopLevelDeclaration(line) {
                insideMainActorType = line.contains("@MainActor") || precedingAttributes(lines: lines, at: index).contains("@MainActor")
            }
            guard !insideMainActorType, hasRedundantNonisolated(line) else { continue }
            redundant.append(line.trimmingCharacters(in: .whitespaces))
        }
        return redundant
    }

    private func precedingAttributes(lines: [String], at index: Int) -> String {
        var attributes: [String] = []
        var cursor = index - 1
        while cursor >= 0, lines[cursor].trimmingCharacters(in: .whitespaces).hasPrefix("@") {
            attributes.append(lines[cursor])
            cursor -= 1
        }
        return attributes.joined(separator: " ")
    }

    private func hasRedundantNonisolated(_ line: String) -> Bool {
        let tokens = line.split(whereSeparator: { $0 == " " || $0 == "\t" }).map(String.init)
        guard let position = tokens.firstIndex(of: "nonisolated") else { return false }
        let next = tokens.indices.contains(position + 1) ? tokens[position + 1] : ""
        return next != "deinit"
    }
}
