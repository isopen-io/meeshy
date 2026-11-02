import SwiftUI
import MeeshySDK
import MeeshyUI

// Les portes de la vague 2 (Ligue, Saison, Vitrine, Atlas, Prestige) sont devenues des CARTES DE CONCEPT sur la
// première page de Progression (#9564) : `ProgressionConceptModel` dit ce que chacune annonce, `ProgressionConcepts`
// dit lesquelles existent. Ce fichier ne garde que la carte du jeu masqué.

/// LE JEU MASQUÉ (#9481) — ce qui remplace le jeu sur cet appareil quand la personne l'a masqué : une carte qui
/// le dit, un bouton pour le réafficher, une porte vers les réglages. Réafficher dit aussi au serveur que le jeu
/// revient (`gameHidden = false`) mais ne rouvre RIEN d'autre : les visibilités fermées par « Jeu masqué »
/// restent fermées jusqu'à ce que la personne les rouvre. Miroir de `game-hidden-card.tsx`.
struct GameHiddenCard: View {
    let onSettings: () -> Void
    var service: GameWave2ServiceProviding = GameService.shared

    @ObservedObject private var prefs = GameDevicePrefsStore.current()
    @State private var busy = false
    @State private var errorMessage: String?

    var body: some View {
        GameCard(title: GameText.settingsHiddenTitle) {
            GameNote(text: GameText.settingsHiddenCard + " " + GameText.settingsHiddenReopenNote)
            GameErrorLine(message: errorMessage, identifier: "game.hidden.error")
            GameActionButton(
                title: GameText.settingsHiddenShow, busy: busy, tint: MeeshyColors.brandPrimary, identifier: "game.hidden.show"
            ) {
                show()
            }
            GameQuietButton(title: GameText.doorSettings, identifier: "game.hidden.settings", action: onSettings)
        }
        .accessibilityIdentifier("game.hidden")
    }

    private func show() {
        guard !busy else { return }
        busy = true
        errorMessage = nil
        prefs.set(hidden: false)
        let service = self.service
        Task {
            do {
                _ = try await service.setPrivacy(gameHidden: false, friendsLeagueOptOut: nil, requestId: UUID().uuidString)
            } catch {
                // Réafficher ne se bloque JAMAIS : le jeu revient sur l'appareil, et l'échec de la moitié serveur
                // se dit (le réglage « Jeu masqué » le rejouera).
                errorMessage = GameCopy.errorMessage(for: error)
            }
            busy = false
        }
    }
}
