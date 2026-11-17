import Foundation
import Testing

/// Les gardes de source communes aux assemblages du kit : un composant agnostique
/// ne nomme ni type du domaine, ni singleton Meeshy, ni couleur en dur.
enum KitAssemblyGuards {
    static let forbidden = [".shared", "MeeshyUser", "MeeshyConversation", "ThemeManager", "PresenceManager",
                            "URLSession", "Color(hex:"]

    static func assertAgnostic(_ files: [String]) throws {
        for file in files {
            let source = try KitAtomVectors.code(file)
            for word in forbidden {
                #expect(!source.contains(word), "\(file) contient \(word)")
            }
        }
    }

    static func close(_ lhs: Double, _ rhs: Double, _ tolerance: Double = 0.001) -> Bool {
        abs(lhs - rhs) < tolerance
    }
}
