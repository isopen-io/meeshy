import XCTest
@testable import MeeshySDK

/// LA PARITÉ AVEC LE SERVEUR, cas pour cas (#6479).
///
/// Les mêmes entrées que `packages/shared/__tests__/registration-identity-preview.test.ts`
/// et que les 75 témoins de la passerelle. Une divergence ici ferait promettre
/// à l'écran iOS un pseudo que le serveur ne crée pas — le seul mode de panne
/// que ce miroir existe pour empêcher.
final class RegistrationIdentityTests: XCTestCase {

    func test_pseudo_isTheLocalPart_boundedTo16() {
        XCTAssertEqual(RegistrationIdentity.slugDAdresse("jean.dupont@example.com"), "jean-dupont")
        XCTAssertLessThanOrEqual(
            RegistrationIdentity.slugDAdresse("un-tres-long-prenom-compose@example.com").count,
            RegistrationIdentity.pseudoMax
        )
    }

    func test_displayName_readsAsAName() {
        XCTAssertEqual(RegistrationIdentity.displayNameDepuisEmail("jean.dupont@example.com"), "Jean Dupont")
    }

    /// Le `+…` porte souvent le nom du service auquel on s'inscrit : il ne doit
    /// JAMAIS fuir dans l'identité.
    func test_subAddressing_neverLeaksIntoTheIdentity() {
        XCTAssertEqual(RegistrationIdentity.partieLocale("jean+meeshy@example.com"), "jean")
        XCTAssertEqual(RegistrationIdentity.slugDAdresse("jean+meeshy@example.com"), "jean")
    }

    /// #7912 — le nom dérivé PART au serveur quand rien n'est tapé, et la
    /// passerelle refuse tout chiffre dans `displayName`. Mêmes cas que
    /// `registration-identity-preview.test.ts`.
    func test_digitsNeverReachTheDerivedDisplayName() {
        XCTAssertEqual(RegistrationIdentity.displayNameDepuisEmail("rcoba2251253@example.com"), "Rcoba")
        XCTAssertEqual(RegistrationIdentity.displayNameDepuisEmail("marie.dupont1990@example.com"), "Marie Dupont")
        XCTAssertEqual(RegistrationIdentity.displayNameDepuisEmail("jean2luc@example.com"), "Jean Luc")
        XCTAssertEqual(RegistrationIdentity.displayNameDepuisEmail("42jean@example.com"), "Jean")
        XCTAssertEqual(RegistrationIdentity.displayNameDepuisEmail("20251253@example.com"), "")
    }

    func test_everyDerivedDisplayName_matchesTheServerPattern() throws {
        let motif = try NSRegularExpression(pattern: #"^(?=.*\p{L})[\p{L}\p{M}\s'’ʼ.-]+$"#)
        for adresse in ["rcoba2251253@example.com", "a1@example.com", "jean.dupont@example.com",
                        "x_9_y@example.com", "jérôme.77@example.com", "o-brien3@example.com"] {
            let nom = RegistrationIdentity.displayNameDepuisEmail(adresse)
            guard !nom.isEmpty else { continue }
            let plage = NSRange(nom.startIndex..., in: nom)
            XCTAssertNotNil(motif.firstMatch(in: nom, range: plage), "\(adresse) ⇒ « \(nom) » refusé par la passerelle")
        }
    }

    func test_anUnslugifiableAddress_givesNoDisplayName() {
        XCTAssertEqual(RegistrationIdentity.displayNameDepuisEmail("@example.com"), "")
    }

    func test_andThePseudoFallsBackToTheServerRecourse() {
        XCTAssertEqual(RegistrationIdentity.pseudoRacine(displayName: nil, email: "@example.com"), "user")
    }

    /// Un nom affiché FOURNI prime sur la dérivation — l'utilisateur garde la main.
    func test_aTypedDisplayName_winsOverTheAddress() {
        XCTAssertEqual(
            RegistrationIdentity.pseudoRacine(displayName: "Awa N’Diaye", email: "jean.dupont@example.com"),
            "awa-ndiaye"
        )
    }

    /// L'ORDRE des étapes du slug est la loi : replier, ragner les bords, PUIS
    /// tronquer. Ce témoin tombe si on inverse les deux dernières.
    func test_slug_collapsesThenTrimsThenTruncates() {
        XCTAssertEqual(RegistrationIdentity.pseudoSlug("  Jean--Pierre  "), "jean-pierre")
        XCTAssertEqual(RegistrationIdentity.pseudoSlug("---"), "")
        XCTAssertEqual(RegistrationIdentity.pseudoSlug("Émilie Côté"), "emilie-cote")
    }

    func test_capitalizeName_respectsComposedNames() {
        XCTAssertEqual(RegistrationIdentity.capitalizeName("jean-pierre"), "Jean-Pierre")
        XCTAssertEqual(RegistrationIdentity.capitalizeName("o'brien"), "O'Brien")
    }
}
