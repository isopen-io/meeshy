import XCTest
import SwiftUI
import SnapshotTesting
@testable import MeeshySDK
@testable import MeeshyUI

// MARK: - Lot 3 — la bulle rend un lieu depuis `message.location`
//
// Le serveur ne produit plus jamais de pièce jointe `.location`
// (`MessageAttachment` n'a aucun champ géographique en Prisma) : le lieu reçu
// voyage dans `MeeshyMessage.location` (restitué depuis `locationJson`). Cette
// suite prouve, par snapshot, le chemin de DONNÉE de la bulle : un
// `MeeshyMessage` porteur d'un `SharedPlace` → `LocationMessageView(place:)`,
// exactement la source que `BubbleContentBuilder` propage désormais dans
// `BubbleContent.location` et que `BubbleStandardLayout.bubbleInnerContent`
// rend (la bulle app elle-même n'est pas atteignable depuis ce package — le
// harnais SnapshotTesting du dépôt ne vit que dans MeeshyUITests).
//
// Cadrage à la taille du COMPOSANT (260 pt de large + le padding interne
// 14/10 de `bubbleInnerContent`, soit 288×230) et non au format appareil : un
// composant cadré au format device avec `precision: 0.99` ne peut jamais
// franchir le budget de 1 % de pixels différents et le test devient incapable
// d'échouer (cf. mémoire `reference_snapshot_gate_blind_component_share_vs_precision`).
//
// Comme les suites `Location`/`Timeline`/`Story`, le mode par défaut `.missing`
// enregistre la baseline PNG au premier run puis échoue une fois pour le
// signaler ; le second run compare proprement. Commits atterrissent avec
// `record: false`. VÉRIFIER après le premier run que les PNG existent bien
// dans `__Snapshots__/BubbleLocationFromMessageSnapshotTests/` (un record
// silencieux a déjà masqué une référence absente dans ce dépôt).
@MainActor
final class BubbleLocationFromMessageSnapshotTests: XCTestCase {

    /// Message « lieu seul » tel que le serveur le livre aujourd'hui :
    /// `content` vide, aucune pièce jointe, le lieu dans `location`.
    private func makeMessage() -> MeeshyMessage {
        MeeshyMessage(
            id: "m-loc",
            conversationId: "c1",
            senderId: "u2",
            content: "",
            originalLanguage: "fr",
            senderName: "Bob",
            location: SharedPlace(latitude: 48.8566, longitude: 2.3522,
                                  name: "Tour Eiffel", address: "Champ de Mars, Paris")
        )
    }

    @ViewBuilder
    private func makeView(colorScheme: ColorScheme) -> some View {
        // La source est bien `message.location` — pas un `SharedPlace` fabriqué
        // à côté : si le transport du lieu par `MeeshyMessage` casse, cette vue
        // devient vide et le snapshot échoue.
        if let place = makeMessage().location {
            LocationMessageView(place: place)
                // Miroir du padding de `bubbleInnerContent` (14 h / 10 v) pour
                // cadrer le composant tel qu'il vit dans la bulle.
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .environment(\.colorScheme, colorScheme)
                .background(colorScheme == .dark ? Color.black : Color.white)
        } else {
            // Jamais atteint tant que `MeeshyMessage.location` transporte le
            // lieu ; rendu volontairement discordant pour faire échouer le
            // snapshot si ça arrive (pas de repli fabriqué silencieux).
            Text(verbatim: "message.location est nil — transport du lieu cassé")
        }
    }

    func test_bubbleLocation_fromMessageLocation_light() {
        assertSnapshot(
            of: makeView(colorScheme: .light),
            as: .image(precision: 0.99, perceptualPrecision: 0.98,
                       layout: .fixed(width: 288, height: 230)),
            record: false
        )
    }

    func test_bubbleLocation_fromMessageLocation_dark() {
        assertSnapshot(
            of: makeView(colorScheme: .dark),
            as: .image(precision: 0.99, perceptualPrecision: 0.98,
                       layout: .fixed(width: 288, height: 230)),
            record: false
        )
    }
}
