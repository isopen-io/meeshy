import Testing
import Foundation
@testable import MeeshyUI

/// #19987 — sous le nom d'un profil, UNE ligne : « @pseudo · depuis novembre 2026 ». Dans la barre repliée, le seul
/// @pseudo. Sans date servie, le @pseudo seul : aucun mois inventé.
@Suite("La ligne du pseudo et de l'ancienneté")
struct ProfileHandleLineTests {

    private let french = Locale(identifier: "fr_FR")
    private let english = Locale(identifier: "en_US")
    private let november = ISO8601DateFormatter().date(from: "2026-11-05T10:00:00Z")!

    @Test("dépliée : le pseudo puis l'ancienneté, sur une seule ligne, le mois dans la locale demandée")
    func expanded_putsTheHandleAndTheMembershipOnOneLine() {
        let line = ProfileHandleLine.text(username: "talkieun", memberSince: november, locale: french)
        #expect(line == String(format: ProfileHandleLine.format, "@talkieun", "novembre 2026"))
        #expect(line.hasPrefix("@talkieun · "))
        #expect(!line.contains("\n"))
        let english = ProfileHandleLine.text(username: "talkieun", memberSince: november, locale: english)
        #expect(english.hasSuffix("November 2026"))
    }

    @Test("le catalogue dit la phrase dans les sept langues, pseudo d'abord")
    func catalogue_putsTheHandleFirst() {
        #expect(ProfileHandleLine.format.hasPrefix("%1$@ · "))
        #expect(ProfileHandleLine.format.hasSuffix("%2$@"))
    }

    @Test("sans date servie : le pseudo seul")
    func withoutADate_isTheHandleAlone() {
        #expect(ProfileHandleLine.text(username: "talkieun", memberSince: nil, locale: french) == "@talkieun")
    }

    @Test("dans la barre repliée : le pseudo seul, quelle que soit la date")
    func inTheBar_isTheHandleAlone() {
        #expect(ProfileHandleLine.text(username: "talkieun", memberSince: november, locale: french, inBar: true)
                == "@talkieun")
    }
}
