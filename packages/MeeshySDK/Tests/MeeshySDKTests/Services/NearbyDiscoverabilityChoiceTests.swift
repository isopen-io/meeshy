import XCTest
@testable import MeeshySDK

/// Le SECOND opt-in de position (spec du 2026-08-02, §2), réduit à sa règle.
///
/// La vue n'est pas ce qui décide : elle rend un état que ce type calcule.
/// Trois affirmations, et chacune est une phrase de la spec :
///
/// 1. **« off par défaut »** — aucun chemin de construction ne rend un état
///    découvrable. Un contenu ne devient trouvable que si quelqu'un a basculé
///    l'interrupteur, jamais parce qu'un palier était mémorisé.
/// 2. **« mémorise le dernier choix comme valeur PRÉ-SÉLECTIONNÉE »** — la
///    mémoire alimente `tier`, jamais `isDiscoverable`. Pré-sélectionner
///    n'est pas appliquer.
/// 3. **« rien n'est appliqué silencieusement »** — quand la mémoire est plus
///    fine que ce que la coordonnée envoyée permet de revendiquer, le
///    resserrement est LISIBLE (`narrowedFrom`), pas seulement effectué. Une
///    restriction muette viole cette phrase autant qu'un arrondi muet.
///
/// Rien ici ne touche une coordonnée : la restriction porte sur le LIBELLÉ
/// revendiqué. Le serveur reste le seul juge de la grille.
final class NearbyDiscoverabilityChoiceTests: XCTestCase {

    // MARK: - 1. Off par défaut, sur TOUS les chemins

    func test_init_withoutMemory_isNotDiscoverable() {
        let choice = NearbyDiscoverabilityChoice(memorized: nil, sharing: .exact)

        XCTAssertFalse(choice.isDiscoverable)
        XCTAssertNil(choice.precisionToSend)
    }

    /// Le piège que la spec nomme : un palier mémorisé pré-sélectionne, il
    /// n'active RIEN. Sans ce témoin, « je me souviens de Ville » deviendrait
    /// « je publie en Ville » au premier raccourci d'implémentation.
    func test_init_withMemorizedTier_isStillNotDiscoverable() {
        for memorized in DiscoverabilityPrecision.allCases {
            let choice = NearbyDiscoverabilityChoice(memorized: memorized, sharing: .exact)

            XCTAssertFalse(choice.isDiscoverable, "mémorisé \(memorized.rawValue) a activé l'opt-in")
            XCTAssertNil(choice.precisionToSend, "mémorisé \(memorized.rawValue) a produit une précision")
        }
    }

    func test_init_withoutMemory_preselectsTheCoarsestTier() {
        let choice = NearbyDiscoverabilityChoice(memorized: nil, sharing: .exact)

        XCTAssertEqual(choice.tier, .region)
    }

    // MARK: - 2. La mémoire pré-sélectionne

    func test_init_withMemorizedTier_preselectsIt() {
        let choice = NearbyDiscoverabilityChoice(memorized: .neighborhood, sharing: .exact)

        XCTAssertEqual(choice.tier, .neighborhood)
    }

    func test_precisionToSend_onceEnabled_isThePreselectedTier() {
        var choice = NearbyDiscoverabilityChoice(memorized: .neighborhood, sharing: .exact)

        choice.setDiscoverable(true)

        XCTAssertEqual(choice.precisionToSend, .neighborhood)
    }

    func test_precisionToSend_afterEnablingThenDisabling_isNilAgain() {
        var choice = NearbyDiscoverabilityChoice(memorized: .city, sharing: .exact)

        choice.setDiscoverable(true)
        choice.setDiscoverable(false)

        XCTAssertNil(choice.precisionToSend)
    }

    /// La mémoire enregistre le dernier choix UTILISÉ. Un palier survolé puis
    /// abandonné (interrupteur laissé fermé) n'a été utilisé par personne.
    func test_tierToMemorize_whenNotDiscoverable_isNil() {
        var choice = NearbyDiscoverabilityChoice(memorized: .region, sharing: .exact)

        choice.select(.neighborhood)

        XCTAssertNil(choice.tierToMemorize)
    }

    func test_tierToMemorize_whenDiscoverable_isTheSelectedTier() {
        var choice = NearbyDiscoverabilityChoice(memorized: nil, sharing: .exact)

        choice.setDiscoverable(true)
        choice.select(.city)

        XCTAssertEqual(choice.tierToMemorize, .city)
    }

    // MARK: - 3. Le resserrement est LISIBLE, pas seulement effectué

    func test_offeredTiers_underExactSharing_areAllFour() {
        let choice = NearbyDiscoverabilityChoice(memorized: nil, sharing: .exact)

        XCTAssertEqual(choice.offeredTiers, [.exact, .neighborhood, .city, .region])
        XCTAssertFalse(choice.isCappedBySharing)
    }

    func test_offeredTiers_underCitySharing_dropTheTiersThatWouldLie() {
        let choice = NearbyDiscoverabilityChoice(memorized: nil, sharing: .city)

        XCTAssertEqual(choice.offeredTiers, [.city, .region])
        XCTAssertTrue(choice.isCappedBySharing)
        XCTAssertEqual(choice.finestOfferedTier, .city)
    }

    func test_init_whenMemorizedTierIsFinerThanSharingAllows_narrowsItAndSaysSo() {
        let choice = NearbyDiscoverabilityChoice(memorized: .exact, sharing: .city)

        XCTAssertEqual(choice.tier, .city)
        XCTAssertEqual(choice.narrowedFrom, .exact)
    }

    func test_init_whenMemorizedTierFits_narrowsNothingAndSaysNothing() {
        let choice = NearbyDiscoverabilityChoice(memorized: .region, sharing: .city)

        XCTAssertEqual(choice.tier, .region)
        XCTAssertNil(choice.narrowedFrom)
    }

    func test_init_withoutMemory_narrowsNothing() {
        let choice = NearbyDiscoverabilityChoice(memorized: nil, sharing: .city)

        XCTAssertNil(choice.narrowedFrom)
    }

    /// Défense en profondeur : la vue n'offre que `offeredTiers`, mais un
    /// palier écrit en dur au site d'appel ne doit pas pouvoir revendiquer
    /// plus fin que la coordonnée envoyée.
    func test_select_aTierFinerThanAllowed_clampsInsteadOfLying() {
        var choice = NearbyDiscoverabilityChoice(memorized: nil, sharing: .city)

        choice.setDiscoverable(true)
        choice.select(.exact)

        XCTAssertEqual(choice.tier, .city)
        XCTAssertEqual(choice.precisionToSend, .city)
    }

    /// Le témoin exhaustif : quelle que soit la mémoire et quel que soit le
    /// grain de partage, l'état publié ne revendique jamais plus fin que ce
    /// que la coordonnée permet.
    func test_precisionToSend_neverExceedsWhatTheSharedCoordinateAllows() {
        for sharing in LocationPrecision.allCases {
            let allowed = DiscoverabilityPrecision.allowedTiers(under: sharing)
            for memorized in DiscoverabilityPrecision.allCases {
                var choice = NearbyDiscoverabilityChoice(memorized: memorized, sharing: sharing)
                choice.setDiscoverable(true)
                let sent = choice.precisionToSend
                XCTAssertNotNil(sent)
                XCTAssertTrue(
                    allowed.contains(sent!),
                    "mémorisé \(memorized.rawValue) sous \(sharing.rawValue) revendique \(sent!.rawValue)"
                )
            }
        }
    }

    // MARK: - 4. Le lieu retiré retire le consentement

    /// Le consentement porte sur UNE publication. Retirer le lieu — puis en
    /// choisir un autre — ne doit pas laisser derrière un interrupteur resté
    /// fermé sur le lieu précédent : `reset` est ce que l'hôte appelle au
    /// nettoyage du composer.
    func test_reset_forgetsTheEnabledState() {
        var choice = NearbyDiscoverabilityChoice(memorized: .city, sharing: .exact)
        choice.setDiscoverable(true)

        choice.reset()

        XCTAssertFalse(choice.isDiscoverable)
        XCTAssertNil(choice.precisionToSend)
    }

    func test_disabled_isNotDiscoverableAndSendsNothing() {
        let choice = NearbyDiscoverabilityChoice.disabled

        XCTAssertFalse(choice.isDiscoverable)
        XCTAssertNil(choice.precisionToSend)
        XCTAssertNil(choice.tierToMemorize)
    }
}
