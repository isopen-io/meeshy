import Testing
import Foundation
@testable import MeeshySDK

/// « lorsqu'on tap pour afficher, ça supprime directement au lieu d'afficher le
/// contenu en plein écran » — relevé du porteur, recette 1.1.0 (#7499).
///
/// Le toucher RÉVÈLE ; c'est la SORTIE qui consomme. Consommer à l'ouverture
/// détruit le contenu sans l'avoir montré — et le geste n'a aucun sens : on
/// touche pour VOIR.
@Suite("ViewOnceConsumption — on ouvre en touchant, on consomme en sortant")
struct ViewOnceConsumptionTests {

    @Test("Un média se consomme à la fermeture de son plein écran")
    func test_moment_média_estÀLaFermeture() {
        #expect(ViewOnceConsumption.moment(hasOpenableMedia: true) == .onFullscreenClose)
    }

    /// Un texte n'a pas de plein écran d'où sortir : sa seule sortie est celle
    /// de la conversation (#7500).
    @Test("Un texte se consomme à la sortie de la conversation")
    func test_moment_texte_estÀLaSortie() {
        #expect(ViewOnceConsumption.moment(hasOpenableMedia: false) == .onConversationExit)
    }

    @Test("Rien d'ouvert, rien à consommer")
    func test_pending_vide() {
        var pending = ViewOnceConsumption.Pending()
        #expect(pending.isEmpty)
        #expect(pending.takeAll().isEmpty)
    }

    /// **L'idempotence est la garde centrale.** Le serveur COMPTE les
    /// ouvertures : consommer deux fois brûlerait le crédit d'une vue unique
    /// que l'utilisateur n'a regardée qu'une fois.
    @Test("Armer deux fois le même message ne consomme qu'une fois")
    func test_pending_armerDeuxFois_neConsommeQuUneFois() {
        var pending = ViewOnceConsumption.Pending()
        pending.arm("msg-1")
        pending.arm("msg-1")
        #expect(pending.count == 1)
        #expect(pending.takeAll() == ["msg-1"])
    }

    /// Deux chemins de sortie peuvent se déclencher ensemble — la fermeture du
    /// plein écran et le passage en arrière-plan, par exemple. Le second ne
    /// doit rien trouver.
    @Test("Une seconde sortie ne trouve plus rien")
    func test_pending_secondeSortie_neTrouveRien() {
        var pending = ViewOnceConsumption.Pending()
        pending.arm("msg-1")
        _ = pending.takeAll()
        #expect(pending.isEmpty)
        #expect(pending.takeAll().isEmpty)
    }

    @Test("Plusieurs messages ouverts avant la sortie se consomment tous")
    func test_pending_plusieursMessages_seConsommentTous() {
        var pending = ViewOnceConsumption.Pending()
        pending.arm("msg-1")
        pending.arm("msg-2")
        #expect(pending.takeAll() == ["msg-1", "msg-2"])
    }

    /// Une pièce optimiste n'a pas encore de message SERVEUR à consommer :
    /// armer sur un identifiant absent enverrait une requête que rien ne peut
    /// satisfaire, et un échec y serait indiscernable d'un refus.
    @Test("Un identifiant absent ou vide n'arme rien")
    func test_pending_identifiantAbsent_nArmeRien() {
        var pending = ViewOnceConsumption.Pending()
        pending.arm(nil)
        pending.arm("")
        #expect(pending.isEmpty)
    }
}
