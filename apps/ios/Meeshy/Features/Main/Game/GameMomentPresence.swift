import Foundation
import Combine

/// « Un événement du jeu occupe-t-il l'écran ? » — publié par
/// `EngagementRevealHost` (la célébration d'un palier, sa carte photo), lu par
/// ceux qu'il recouvre : le lecteur de stories se FIGE dessous (#9821). Un
/// signal, pas le modèle : ceux qui l'écoutent n'ont rien à savoir du jeu.
@MainActor
final class GameMomentPresence: ObservableObject {
    nonisolated deinit {}

    static let shared = GameMomentPresence()

    @Published private(set) var isPresented = false

    func update(isPresented: Bool) {
        guard self.isPresented != isPresented else { return }
        self.isPresented = isPresented
    }
}
