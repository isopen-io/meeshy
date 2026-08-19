import XCTest
@testable import MeeshyUI

/// Miroir iOS de la loi d'audience de la republication.
///
/// La loi AUTORITAIRE vit côté serveur
/// (`packages/shared/utils/repost-audience.ts`, appliquée dans
/// `PostService.repostPost`) : c'est la frontière de sécurité. Ce miroir sert
/// UNIQUEMENT à plafonner le sélecteur d'audience du composeur — une
/// affordance, jamais la garantie. Les deux DOIVENT dire la même chose ; ces
/// témoins sont le jumeau des témoins vitest de la loi TS.
///
/// Règle produit (2026-08-19) : **même audience, ou plus restreinte, JAMAIS
/// plus large.**
final class StoryRepostAudienceTests: XCTestCase {

    private let all: [PostVisibility] = [.public, .community, .friends, .except, .only, .private]

    func test_publicOriginal_allowsEveryAudience() {
        // « Tout le monde » contient toute autre audience : n'importe quelle
        // cible est un rétrécissement.
        XCTAssertEqual(
            Set(StoryRepostAudience.allowed(from: .public)),
            Set(all)
        )
    }

    func test_friendsOriginal_allowsOnlyFriendsOrPrivate() {
        XCTAssertEqual(
            Set(StoryRepostAudience.allowed(from: .friends)),
            Set([.friends, .private] as [PostVisibility])
        )
    }

    func test_communityOriginal_allowsOnlyCommunityOrPrivate() {
        XCTAssertEqual(
            Set(StoryRepostAudience.allowed(from: .community)),
            Set([.community, .private] as [PostVisibility])
        )
    }

    func test_privateOriginal_collapsesToPrivateAlone() {
        XCTAssertEqual(StoryRepostAudience.allowed(from: .private), [.private])
    }

    func test_everyOriginal_offersItself_republishingUnchangedIsTheNominalCase() {
        for original in all {
            XCTAssertTrue(
                StoryRepostAudience.allowed(from: original).contains(original),
                "\(original.rawValue) doit pouvoir se republier à l'identique"
            )
        }
    }

    func test_everyOriginal_offersPrivate_theStrictlyNarrowestAudience() {
        for original in all {
            XCTAssertTrue(
                StoryRepostAudience.allowed(from: original).contains(.private),
                "\(original.rawValue) doit pouvoir se republier en privé"
            )
        }
    }

    /// Le cœur de la règle : aucun élargissement, y compris les mouvements
    /// LATÉRAUX entre audiences incomparables (`FRIENDS` ⇄ `COMMUNITY` — un
    /// contact peut ne pas être membre de la communauté, donc ce n'est pas un
    /// rétrécissement mais une exposition à d'autres gens).
    func test_refusesEveryWidening_includingLateralMovesBetweenIncomparableAudiences() {
        let widenings: [(PostVisibility, PostVisibility)] = [
            (.private, .public), (.private, .friends), (.private, .community),
            (.private, .except), (.private, .only),
            (.friends, .public), (.friends, .except), (.friends, .community),
            (.community, .public), (.community, .friends),
            (.only, .public), (.only, .friends),
            (.except, .public)
        ]
        for (original, requested) in widenings {
            XCTAssertFalse(
                StoryRepostAudience.isAllowed(requested, from: original),
                "\(original.rawValue) → \(requested.rawValue) élargit la portée"
            )
        }
    }

    func test_isAllowed_agreesWithAllowed_onAll36Pairs() {
        for original in all {
            for requested in all {
                XCTAssertEqual(
                    StoryRepostAudience.isAllowed(requested, from: original),
                    StoryRepostAudience.allowed(from: original).contains(requested),
                    "désaccord sur \(original.rawValue) → \(requested.rawValue)"
                )
            }
        }
    }

    /// `EXCEPT`/`ONLY` ne se lisent pas seules : leur portée EST la liste qui
    /// les accompagne. Le composeur ne doit donc pas laisser le republieur
    /// composer SA liste — « même audience » avec une liste plus longue est
    /// plus LARGE.
    func test_setBasedAudiences_inheritTheOriginalList() {
        XCTAssertTrue(StoryRepostAudience.inheritsAudienceList(.except))
        XCTAssertTrue(StoryRepostAudience.inheritsAudienceList(.only))
        for selfDescribing in [PostVisibility.public, .community, .friends, .private] {
            XCTAssertFalse(StoryRepostAudience.inheritsAudienceList(selfDescribing))
        }
    }

    /// Le composeur reçoit une visibilité en `String` (`rawValue`) : la
    /// résolution doit être tolérante à une valeur inconnue ou absente, et
    /// retomber sur le cas le plus RESTRICTIF plutôt que d'ouvrir grand.
    func test_resolvingAnUnknownOriginal_fallsBackToPrivate_neverToPublic() {
        XCTAssertEqual(StoryRepostAudience.allowed(fromRawValue: nil), [.private])
        XCTAssertEqual(StoryRepostAudience.allowed(fromRawValue: ""), [.private])
        XCTAssertEqual(StoryRepostAudience.allowed(fromRawValue: "WAT"), [.private])
        XCTAssertEqual(Set(StoryRepostAudience.allowed(fromRawValue: "public")),
                       Set(all), "la casse ne doit pas décider de l'audience")
    }
}
