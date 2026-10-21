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
        m.forgetOpenConversations()
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

    // MARK: - iPad multi-fenêtre

    /// A reste dans la fenêtre principale, B s'ouvre dans une fenêtre
    /// détachée : les DEUX sont à l'écran.
    func test_deuxFenetres_lesDeuxConversationsSontOuvertes() {
        let m = neuf()
        m.onConversationOpened("A")
        m.onConversationOpened("B")

        XCTAssertTrue(m.isConversationOpen("A"),
                      "A est toujours affichée dans la fenêtre principale.")
        XCTAssertTrue(m.isConversationOpen("B"))
        XCTAssertEqual(m.openConversationIds, ["A", "B"])
        XCTAssertEqual(m.activeConversationId, "B", "La plus récente reste l'active.")
    }

    /// Fermer la fenêtre détachée rend la main à la conversation qui reste
    /// affichée — pas à « nulle part ».
    func test_fermerLaFenetreDetachee_rendLaMainALaConversationRestante() {
        let m = neuf()
        // Les deux écrans déclarent leur conversation au moteur, chacun la sienne : il n'a plus besoin que les toasts
        // le relancent sur celle qui reste — il ne l'a jamais quittée.
        let engine = ConversationSyncEngine.shared
        engine.openConversation("A")
        engine.openConversation("B")
        defer { engine.closeConversation("A") }
        m.onConversationOpened("A")
        m.onConversationOpened("B")
        m.onConversationClosed("B")
        engine.closeConversation("B")

        XCTAssertTrue(engine.isConversationOpen("A"),
                      "A est à l'écran : le moteur ne doit pas recompter ses messages comme non lus.")
        XCTAssertFalse(engine.isConversationOpen("B"))
        XCTAssertEqual(m.activeConversationId, "A")
        XCTAssertEqual(MessageSocketManager.shared.activeConversationId, "A")
        XCTAssertEqual(MessageSocketManager.shared.openConversationIds, ["A"])
        XCTAssertFalse(m.isConversationOpen("B"))
    }

    /// La même conversation dans deux fenêtres : fermer l'une ne la retire pas.
    func test_memeConversationDansDeuxFenetres_seuleLaDerniereFermetureLaRetire() {
        let m = neuf()
        m.onConversationOpened("A")
        m.onConversationOpened("A")
        m.onConversationClosed("A")

        XCTAssertTrue(m.isConversationOpen("A"), "Une fenêtre affiche encore A.")
        XCTAssertEqual(m.activeConversationId, "A")

        m.onConversationClosed("A")
        XCTAssertFalse(m.isConversationOpen("A"))
        XCTAssertNil(m.activeConversationId)
    }

    /// Une fermeture sans ouverture (écran jamais activé) ne fait pas tomber
    /// le compte d'une autre fenêtre.
    func test_uneFermetureOrpheline_neRetireRien() {
        let m = neuf()
        m.onConversationOpened("A")
        m.onConversationClosed("Z")

        XCTAssertTrue(m.isConversationOpen("A"))
        XCTAssertEqual(m.activeConversationId, "A")
    }
}
