import XCTest
@testable import Meeshy

/// **Un démarrage à froid sur une session VALIDE effaçait toute la base
/// locale** (#5968).
///
/// Mesuré au simulateur de recette, un seul lancement à froid, session intacte
/// (`meeshy_active_user_id` inchangé, l'app ouvre « Meeshy Chats » et non
/// l'écran de connexion) :
///
///     messages : 25 → 0
///     outbox   :  7 → 0
///
/// Mécanisme : `isAuthenticated` naît `false`, `checkExistingSession()` est
/// **async**, et `DependencyContainer.shared` s'abonne à la CONSTRUCTION de
/// l'`App` — donc avant que la session soit relue. Un `@Published` REJOUE sa
/// valeur courante au nouvel abonné : `false` traverse `filter { !$0 }` et la
/// purge part.
///
/// La régression vient de #5913, dont le correctif était juste sur son cas — un
/// démarrage DÉJÀ déconnecté doit purger — et dont le doc-comment concluait :
/// « un `filter { !$0 }` suffit à garder le démarrage CONNECTÉ hors de la
/// purge ». C'est cette phrase que la mesure réfute : au moment où le filtre
/// s'applique, personne n'a encore regardé s'il y a une session.
///
/// **Le booléen ne peut pas dire trois choses.** « pas encore regardé »,
/// « regardé, connecté » et « regardé, personne » sont trois états, et le
/// premier ne doit rien déclencher. C'est la doctrine du dépôt — un verdict de
/// garde a trois états, et l'ignorance n'est pas une preuve
/// (`services/gateway/CLAUDE.md`).
final class SessionPurgeDecisionTests: XCTestCase {

    // MARK: - Le cas qui effaçait les données

    func test_demarrageConnecte_avantResolution_nePurgePas() {
        XCTAssertFalse(
            SessionPurgeDecision.shouldPurgeLocalMessages(sessionResolved: false, isAuthenticated: false),
            "Au démarrage, `isAuthenticated` vaut `false` parce que personne n'a encore regardé — pas parce qu'il n'y a pas de session."
        )
    }

    func test_sessionValide_unefoisResolue_nePurgePas() {
        XCTAssertFalse(
            SessionPurgeDecision.shouldPurgeLocalMessages(sessionResolved: true, isAuthenticated: true)
        )
    }

    // MARK: - Le cas de #5913, qui doit CONTINUER de purger

    /// Les trois fins de session qui n'émettent aucune transition — app tuée,
    /// jeton expiré constaté au démarrage, session invalidée côté serveur — se
    /// présentent toutes comme « résolu, personne ». Sans cette purge, la file
    /// du compte sortant est héritée par le suivant : deux `blockUser` et un
    /// `unblockUser` rejoués sous un autre jeton, mesurés le 2026-09-10.
    func test_demarrageDejaDeconnecte_purgeToujours() {
        XCTAssertTrue(
            SessionPurgeDecision.shouldPurgeLocalMessages(sessionResolved: true, isAuthenticated: false),
            "C'est le cas de #5913 : une fin de session sans transition doit être rattrapée au démarrage."
        )
    }

    // MARK: - La déconnexion ordinaire

    func test_deconnexionEnVol_purge() {
        XCTAssertTrue(
            SessionPurgeDecision.shouldPurgeLocalMessages(sessionResolved: true, isAuthenticated: false)
        )
    }

    // MARK: - La résolution ATTEINT bien le crochet

    /// Une règle que le crochet n'appelle pas ne garde rien. Le crochet doit
    /// composer les DEUX signaux — sans quoi il retombe sur le booléen seul,
    /// qui est exactement le défaut.
    func test_leCrochetComposeLesDeuxSignaux() throws {
        let source = try AppSourceGuard.unit("Meeshy/Core/DependencyContainer.swift")
        XCTAssertTrue(
            source.contains("SessionPurgeDecision.shouldPurgeLocalMessages"),
            "Le crochet doit consulter la règle, pas re-filtrer `isAuthenticated` à la main."
        )
        XCTAssertTrue(
            source.contains("hasResolvedStoredSession"),
            "Sans le signal de résolution, la règle reçoit toujours `true` et ne garde rien."
        )
    }
}
