import Testing
import Foundation
@testable import MeeshyUI

/// `validUsernames` filtre les `@handle` qui deviennent des liens : sans lui
/// (messages, `nil`), le comportement historique est inchangé — TOUT `@handle`
/// est linkifié. Avec lui (posts/stories, `Set` même vide), seuls les pseudos
/// qui existent réellement le deviennent.
@MainActor
struct MessageTextRendererValidationTests {

    @Test func test_render_withValidUsernames_linksOnlyThose() {
        let segments = MessageTextRenderer.parse(
            "salut @alice et @nimportequoi",
            validUsernames: ["alice"]
        )
        let links = segments.compactMap { segment -> String? in
            if case .mentionLink(_, _, let username) = segment { return username }
            return nil
        }
        #expect(links == ["alice"])
    }

    @Test func test_render_withEmptyValidUsernames_linksNone() {
        // Un ensemble VIDE veut dire « le serveur s'est prononcé, personne ne
        // matche » — distinct de `nil` (« pas d'avis, ne rien changer »).
        let segments = MessageTextRenderer.parse("salut @alice", validUsernames: [])
        #expect(!segments.contains { if case .mentionLink = $0 { return true } else { return false } })
    }

    @Test func test_render_withoutValidUsernames_keepsCurrentBehaviour() {
        // Les messages passent `nil` : leur surlignage vient déjà de
        // `validatedMentions`, et rien ne doit changer pour eux.
        let segments = MessageTextRenderer.parse("salut @alice", validUsernames: nil)
        #expect(segments.contains { if case .mentionLink = $0 { return true } else { return false } })
    }

    @Test func test_render_validUsernames_isCaseInsensitive() {
        let segments = MessageTextRenderer.parse("salut @Alice", validUsernames: ["alice"])
        #expect(segments.contains { if case .mentionLink = $0 { return true } else { return false } })
    }

    @Test func test_render_handleWithHyphen_isNotTruncated() {
        let segments = MessageTextRenderer.parse(
            "salut @marie-claire", validUsernames: ["marie-claire"]
        )
        let links = segments.compactMap { segment -> String? in
            if case .mentionLink(_, _, let username) = segment { return username }
            return nil
        }
        #expect(links == ["marie-claire"])
    }

    @Test func test_render_handleWithHyphen_withoutValidation_isNotTruncated() {
        // Le défaut vaut aussi hors validation : la regex elle-même doit
        // inclure le tiret, pas seulement le filtre en aval.
        let segments = MessageTextRenderer.parse("salut @marie-claire")
        let links = segments.compactMap { segment -> String? in
            if case .mentionLink(_, _, let username) = segment { return username }
            return nil
        }
        #expect(links == ["marie-claire"])
    }
}
