import Foundation

struct ProjectManifest {

    let targets: [String: [String]]

    static func load(from iosDirectory: URL) throws -> ProjectManifest {
        let text = try String(
            contentsOf: iosDirectory.appendingPathComponent("project.yml"),
            encoding: .utf8
        )
        return ProjectManifest(targets: parseTargets(text))
    }

    static func iosDirectory(from file: StaticString = #filePath) -> URL {
        URL(fileURLWithPath: "\(file)")
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    func swiftPaths(of target: String) -> [String] {
        (targets[target] ?? []).compactMap(Self.swiftPath(inLine:))
    }

    func swiftPaths(inDirectory directory: String, listedBy targetNames: [String]) -> Set<String> {
        Set(targetNames.flatMap(swiftPaths(of:)).filter { $0.hasPrefix(directory + "/") })
    }

    private static func swiftPath(inLine line: String) -> String? {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard trimmed.hasPrefix("- path: "), trimmed.hasSuffix(".swift") else { return nil }
        return String(trimmed.dropFirst("- path: ".count))
    }

    private static func parseTargets(_ text: String) -> [String: [String]] {
        var result: [String: [String]] = [:]
        var inTargets = false
        var current: String?
        for line in text.components(separatedBy: "\n") {
            if !line.hasPrefix(" ") && !line.hasPrefix("#") && !line.isEmpty {
                inTargets = line.hasPrefix("targets:")
                current = nil
                continue
            }
            guard inTargets else { continue }
            if let name = targetName(inLine: line) {
                current = name
                result[name] = []
                continue
            }
            if let current { result[current, default: []].append(line) }
        }
        return result
    }

    private static func targetName(inLine line: String) -> String? {
        guard line.hasPrefix("  "), !line.hasPrefix("   "), line.hasSuffix(":") else { return nil }
        let name = line.trimmingCharacters(in: .whitespaces).dropLast()
        guard !name.isEmpty, !name.hasPrefix("#") else { return nil }
        return String(name)
    }
}
