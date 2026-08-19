import Testing
@testable import MeeshyUI
@testable import MeeshySDK

/// La garde anti-fuite de la rangée « Avec … ».
///
/// Elle vit dans le composant de RENDU et non dans la couche réseau : un post
/// détaillé mis en cache — où le serveur projette les silencieuses du lecteur —
/// peut être réaffiché en carte de feed, et le réseau n'a aucun moyen de savoir
/// où sa charge utile finira.
@MainActor
struct ReferenceNoteRowTests {

    private func reference(_ username: String, _ display: PostReferenceDisplay,
                           userId: String? = nil) -> PostReference {
        PostReference(userId: userId ?? "u-\(username)", username: username, display: display)
    }

    @Test func test_noted_dropsSilent() {
        let shown = ReferenceNoteRow.noted(in: [
            reference("alice", .note),
            reference("carol", .silent),
        ])

        #expect(shown.map(\.username) == ["alice"])
    }

    @Test func test_noted_dropsInlineAndPinned() {
        // INLINE est déjà écrit dans le texte et PINNED déjà posé sur le
        // canevas : les répéter sous le contenu ferait redite.
        let shown = ReferenceNoteRow.noted(in: [
            reference("alice", .inline),
            reference("bob", .pinned),
            reference("dan", .note),
        ])

        #expect(shown.map(\.username) == ["dan"])
    }

    @Test func test_viewerIsSilentlyReferenced_onlyForTheViewersOwnSilentEntry() {
        let references = [reference("carol", .silent, userId: "u-carol")]

        #expect(ReferenceNoteRow.viewerIsSilentlyReferenced(in: references, currentUserId: "u-carol"))
        #expect(!ReferenceNoteRow.viewerIsSilentlyReferenced(in: references, currentUserId: "u-other"))
        #expect(!ReferenceNoteRow.viewerIsSilentlyReferenced(in: references, currentUserId: nil))
    }

    @Test func test_viewerIsSilentlyReferenced_isFalseForAVisibleMode() {
        // Le marqueur répond à une notification qu'aucun affichage ne
        // justifierait autrement : une NOTE se voit déjà dans la rangée.
        let references = [reference("carol", .note, userId: "u-carol")]

        #expect(!ReferenceNoteRow.viewerIsSilentlyReferenced(in: references, currentUserId: "u-carol"))
    }
}
