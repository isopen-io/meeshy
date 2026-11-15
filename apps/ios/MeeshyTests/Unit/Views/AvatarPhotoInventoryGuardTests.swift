import XCTest
@testable import Meeshy

/// #12568 — miroir iOS de `apps/web/scripts/check-avatar-src.mjs`. Un
/// `MeeshyAvatar(` monté sans `avatarURL:` ne peut jamais montrer de photo :
/// le cercle reste en initiales pour toujours, alors que la donnée existe.
/// Tout appel de l'app et du SDK passe `avatarURL:` (même `nil`, écrit en
/// clair), sauf les exemptions NOMMÉES ci-dessous — chacune est un cercle qui
/// n'est pas l'identité d'une personne.
final class AvatarPhotoInventoryGuardTests: XCTestCase {

    private static let exemptions: Set<String> = [
        "apps/ios/Meeshy/Features/Onboarding/OnboardingIllustrations.swift",
        "packages/MeeshySDK/Sources/MeeshyUI/Profile/FullscreenImageView.swift",
    ]

    private var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .deletingLastPathComponent()   // apps/
            .deletingLastPathComponent()   // repo
            .resolvingSymlinksInPath()
    }

    private func swiftFiles(under relative: String) -> [URL] {
        let base = repoRoot.appendingPathComponent(relative)
        guard let walker = FileManager.default.enumerator(at: base, includingPropertiesForKeys: nil) else { return [] }
        return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    /// Les arguments de chaque `MeeshyAvatar(` d'un source, parenthèses équilibrées.
    static func avatarCallArguments(in source: String) -> [(line: Int, arguments: String)] {
        let chars = Array(source)
        let needle = Array("MeeshyAvatar(")
        var calls: [(Int, String)] = []
        var index = 0
        while index + needle.count <= chars.count {
            guard Array(chars[index..<index + needle.count]) == needle,
                  index == 0 || !(chars[index - 1].isLetter || chars[index - 1].isNumber) else {
                index += 1
                continue
            }
            var depth = 1
            var cursor = index + needle.count
            while cursor < chars.count, depth > 0 {
                if chars[cursor] == "(" { depth += 1 } else if chars[cursor] == ")" { depth -= 1 }
                cursor += 1
            }
            let arguments = String(chars[(index + needle.count)..<max(index + needle.count, cursor - 1)])
            let line = chars[0..<index].reduce(1) { $1 == "\n" ? $0 + 1 : $0 }
            calls.append((line, arguments))
            index = cursor
        }
        return calls
    }

    func test_everyMeeshyAvatarMount_passesItsPhoto() throws {
        let roots = ["apps/ios/Meeshy", "packages/MeeshySDK/Sources"]
        let files = roots.flatMap(swiftFiles(under:))
        XCTAssertGreaterThan(files.count, 100, "Le balayage doit trouver les sources de l'app et du SDK.")
        var offenders: [String] = []
        var exemptedSites: Set<String> = []
        for file in files {
            let relative = file.resolvingSymlinksInPath().path.replacingOccurrences(of: repoRoot.path + "/", with: "")
            let source = try String(contentsOf: file, encoding: .utf8)
            let withoutPhoto = Self.avatarCallArguments(in: source)
                .filter { $0.arguments.contains("name:") && !$0.arguments.contains("avatarURL:") }
            guard !withoutPhoto.isEmpty else { continue }
            if Self.exemptions.contains(relative) {
                exemptedSites.insert(relative)
                continue
            }
            offenders += withoutPhoto.map { "\(relative):\($0.line)" }
        }
        XCTAssertTrue(offenders.isEmpty,
                      "MeeshyAvatar monté sans avatarURL: (la photo ne s'affichera jamais) — \(offenders.joined(separator: ", "))")
        XCTAssertEqual(exemptedSites, Self.exemptions,
                       "Exemption périmée : le fichier ne monte plus d'avatar sans photo, le retirer de la liste.")
    }

    func test_scanner_findsACallWithoutPhoto() {
        let source = """
        MeeshyAvatar(name: "A", context: .userListItem)
        MeeshyAvatar(name: "B", context: .userListItem, avatarURL: user.avatar)
        """
        let calls = Self.avatarCallArguments(in: source)
        XCTAssertEqual(calls.count, 2)
        XCTAssertFalse(calls[0].arguments.contains("avatarURL:"))
        XCTAssertTrue(calls[1].arguments.contains("avatarURL:"))
    }
}
