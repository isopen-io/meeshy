import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le jeu d'un autre, hors de sa fiche (#9481)
//
// La fiche d'un profil ne porte plus de carte de jeu (#10093) : son niveau et son rang vivent sur sa bannière
// (`GameBannerBadge`). Restent la lecture partagée et la bande de la carte de contact — niveau, rang, trésor et trois
// coupes, comme le web (#10097, #10380).

/// La lecture de la bande de la carte de contact. Cache d'abord : ce que le disque a
/// gardé se peint tout de suite (sauf si la vue montre déjà CE membre), la lecture servie le remplace — ou l'efface,
/// quand le membre a fermé son réglage entre-temps. Une lecture ANNULÉE (la vue est passée à un autre membre) ne
/// rend rien : arrivée après celle du suivant, elle l'écraserait.
enum GameVisitorLoading {
    static func read(
        userId: String, kept: GameVisitorRead?, showcase: GameShowcaseLoader, standing: GameUserGameLoader,
        paintCached: (GameVisitorRead) -> Void
    ) async -> GameVisitorRead? {
        if kept?.userId != userId {
            let cachedShowcase = await showcase.cached(userId: userId)
            let cachedStanding = await standing.cached(userId: userId)
            guard !Task.isCancelled else { return nil }
            paintCached(GameVisitorRead(userId: userId, entries: GameVisitorShowcase.entries(cachedShowcase), standing: cachedStanding))
        }
        async let freshShowcase = showcase.load(userId: userId)
        async let freshStanding = standing.load(userId: userId)
        let read = GameVisitorRead(userId: userId, entries: GameVisitorShowcase.entries(await freshShowcase), standing: await freshStanding)
        return Task.isCancelled ? nil : read
    }
}

/// LA BANDE DE LA CARTE DE CONTACT (#9481) — le niveau et le rang (rangée compacte) puis trois coupes au plus, en
/// lecture seule, sous le nom d'un compte Meeshy dans la fiche complète d'une carte de visite. Même règle que la
/// vitrine : ce que le serveur ne sert pas ne se dessine pas.
struct GameContactStrip: View {
    let userId: String
    var loader = GameShowcaseLoader()
    var standingLoader = GameUserGameLoader()

    @ObservedObject private var prefs = GameDevicePrefsStore.current()
    @State private var read: GameVisitorRead?

    var body: some View {
        // Un `ZStack` et son ancre, jamais un `Group` vide : sans enfant, la tâche qui lit ne démarrerait pas (#10093).
        ZStack(alignment: .leading) {
            GameLoadAnchor()
            if let shown = GameVisitorRead.shown(read, for: userId, hidden: prefs.prefs.hidden) {
                VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
                    if let standing = shown.standing { GameStandingView(content: standing) }
                    if !shown.entries.isEmpty { trophies(shown.entries) }
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("game.contact.strip")
            }
        }
        .task(id: userId) {
            guard !prefs.prefs.hidden else { return }
            if let fresh = await GameVisitorLoading.read(userId: userId, kept: read, showcase: loader, standing: standingLoader,
                                                         paintCached: { read = $0 }) {
                read = fresh
            }
        }
    }

    private func trophies(_ entries: [GameVisitorShowcase.Entry]) -> some View {
        HStack(alignment: .bottom, spacing: MeeshySpacing.sm) {
            ForEach(entries.prefix(3)) { entry in
                GameTrophyArt(view: entry.presentation, height: 32)
                    .accessibilityHidden(false)
                    .accessibilityLabel(entry.presentation.title)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(GameText.profileShowcase)
    }
}
