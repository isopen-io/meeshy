#if DEBUG
import Foundation

/// Le clap du tournage (#9810) : un témoin rouge — types vides qui compilent, la poignée de main arrive au commit suivant.
nonisolated enum VitrineClap: Equatable, Sendable {
    case donne
    case repli
}

@MainActor
enum VitrineTournage {
    static let repli: Duration = .zero

    static func attendreLeClap(_ go: URL = VitrineLaunch.marqueurGo, repli: Duration = VitrineTournage.repli) async -> VitrineClap {
        .repli
    }

    static func effacerLesMarqueurs(dans dossier: URL = VitrineLaunch.dossier) {}

    static func tourner(_ scene: VitrineScene, dans dossier: URL = VitrineLaunch.dossier, action: @MainActor () async -> Void) async {}
}
#endif
