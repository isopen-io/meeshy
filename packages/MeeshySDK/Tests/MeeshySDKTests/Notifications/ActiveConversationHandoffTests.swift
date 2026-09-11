import XCTest
@testable import MeeshySDK

/// **Une fermeture arrivée EN RETARD ne doit rien effacer** (#5938).
///
/// `onConversationClosed()` posait `activeConversationId = nil` sans savoir
/// QUELLE conversation se fermait — et elle part d'un `deinit`, donc d'une
/// `Task` différée. Quand on passe d'une conversation à une autre, l'ordre
/// réel est :
///
///   1. on quitte A → `deinit` → fermeture PLANIFIÉE
///   2. on ouvre B  → `onConversationOpened(B)` — SYNCHRONE
///   3. la fermeture de A s'exécute enfin → `nil`
///
/// On est alors dans B pendant que l'app croit n'être nulle part, et le garde
/// de `handleNewNotification` — qui est juste — ne peut plus rien filtrer :
/// chaque message de B s'affiche en toast par-dessus le fil qu'on lit.
///
/// **Ce témoin rejoue cet ordre-là.** Fermer A AVANT d'ouvrir B fonctionnait
/// déjà ; c'est le seul ordre qui ne prouve rien.
@MainActor
final class ActiveConversationHandoffTests: XCTestCase {

    private func neuf() -> NotificationToastManager {
        let m = NotificationToastManager.shared
        m.onConversationClosed("__reset__")
        m.onConversationClosed(m.activeConversationId ?? "__reset__")
        return m
    }

    // MARK: - L'ordre qui casse

    func test_uneFermetureEnRetardNEffacePasLaConversationSUIVANTE() {
        let m = neuf()
        m.onConversationOpened("A")
        m.onConversationOpened("B")

        // La fermeture de A arrive APRÈS l'ouverture de B — l'ordre réel.
        m.onConversationClosed("A")

        XCTAssertEqual(m.activeConversationId, "B",
                       "On est dans B : une fermeture de A arrivée en retard n'a rien à y faire.")
    }

    // MARK: - L'ordre qui marchait déjà, et qui doit continuer

    func test_fermerLaConversationCOURANTELaLibereBien() {
        let m = neuf()
        m.onConversationOpened("A")
        m.onConversationClosed("A")

        XCTAssertNil(m.activeConversationId,
                     "Quitter la conversation qu'on lisait doit bien la libérer.")
    }

    /// La garde ne doit pas devenir un verrou : après une fermeture juste, la
    /// conversation suivante s'ouvre normalement.
    func test_apresUneFermetureJusteLaSuivanteSOuvre() {
        let m = neuf()
        m.onConversationOpened("A")
        m.onConversationClosed("A")
        m.onConversationOpened("C")

        XCTAssertEqual(m.activeConversationId, "C")
    }

    /// Le miroir de `MessageSocketManager` suit la MÊME règle : les deux
    /// champs sont posés ensemble, ils doivent être effacés ensemble — ou pas
    /// du tout.
    func test_leMiroirDuSocketSuitLaMemeRegle() {
        let m = neuf()
        m.onConversationOpened("A")
        m.onConversationOpened("B")
        m.onConversationClosed("A")

        XCTAssertEqual(MessageSocketManager.shared.activeConversationId, "B",
                       "Deux champs posés ensemble ne peuvent pas diverger à la fermeture.")
    }
}
