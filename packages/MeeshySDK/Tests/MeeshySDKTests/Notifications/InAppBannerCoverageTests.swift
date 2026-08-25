import XCTest
@testable import MeeshySDK

/// Règle produit : **tout ce qui constitue une notification arrive en bannière
/// in-app quand l'utilisateur est dans l'application.** Seule exception, portée
/// par l'appelant et non par les préférences : la conversation OUVERTE, dont le
/// contenu est déjà à l'écran.
///
/// Ces témoins gardent la frontière entre les deux règles. `allowsNotification`
/// gouverne l'alerte d'ARRIÈRE-PLAN (push, écran verrouillé) ;
/// `allowsInAppBanner` gouverne la bannière que voit quelqu'un de PRÉSENT. La
/// seconde n'applique que les interrupteurs par type — les trois filtres qui
/// protègent l'attention d'un absent (`pushEnabled`, « Ne pas déranger », Focus
/// iOS) n'ont rien à dire à quelqu'un qui regarde son écran.
final class InAppBannerCoverageTests: XCTestCase {

    private func prefs(_ mutate: (inout UserNotificationPreferences) -> Void = { _ in })
        -> UserNotificationPreferences {
        var p = UserNotificationPreferences.defaults
        mutate(&p)
        return p
    }

    // MARK: - Les filtres de l'absent ne gouvernent plus le présent

    func test_inAppBanner_survivesPushDisabled() {
        let p = prefs { $0.pushEnabled = false }

        XCTAssertFalse(p.allowsNotification(type: .newMessage),
                       "précondition : couper les push ferme bien l'alerte d'arrière-plan")
        XCTAssertTrue(p.allowsInAppBanner(type: .newMessage),
                      "couper les push, c'est refuser d'être interrompu DEHORS — pas devenir aveugle DEDANS")
    }

    func test_inAppBanner_survivesDoNotDisturbWindow() {
        let p = prefs {
            $0.pushEnabled = true
            $0.dndEnabled = true
            $0.dndStartTime = "00:00"
            $0.dndEndTime = "23:59"
            $0.dndDays = DndDay.allCases
            $0.dndUtcOffsetMinutes = 0
        }

        XCTAssertTrue(p.allowsInAppBanner(type: .newMessage),
                      "on ne dérange pas quelqu'un en lui montrant ce qu'il est venu regarder")
    }

    // MARK: - Les interrupteurs par type gardent leur effet

    func test_inAppBanner_honoursThePerTypeToggle() {
        let off = prefs { $0.reactionEnabled = false }
        let on = prefs { $0.reactionEnabled = true }

        XCTAssertFalse(off.allowsInAppBanner(type: .messageReaction),
                       "sinon la bascule de l'écran Réglages serait un contrôle sans effet")
        XCTAssertTrue(on.allowsInAppBanner(type: .messageReaction))
    }

    func test_inAppBanner_coversTheSocialTypes_notJustMessages() {
        let p = prefs()

        for type in [MeeshyNotificationType.postLike, .postComment, .postRepost,
                     .commentReply, .storyReaction, .contactRequest, .memberJoined] {
            XCTAssertTrue(p.allowsInAppBanner(type: type),
                          "\(type) doit remonter à l'utilisateur présent")
        }
    }
}
