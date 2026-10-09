#if DEBUG
import Foundation
import MeeshySDK

/// Les vraies interactions que la vitrine filme (#9810) : témoin rouge, types vides qui compilent.
nonisolated enum VitrineInteraction: String, CaseIterable, Sendable {
    case frappe
}

extension VitrineScene {
    nonisolated var interaction: VitrineInteraction? { nil }
    nonisolated var jeuServi: VitrineCelebration? { nil }
}
#endif
