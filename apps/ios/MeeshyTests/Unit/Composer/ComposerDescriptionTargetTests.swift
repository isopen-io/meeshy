import XCTest
@testable import Meeshy

/// **Où va ce que l'auteur écrit dans le volet de description** (2026-09-06).
///
/// ## Le défaut que ces témoins ferment
///
/// Mesuré au simulateur : sur un canvas SANS image — texte, dessin, stickers,
/// fond de couleur — l'auteur tape une description, la voit à l'écran, la
/// valide… et le post part avec `content: ""`, `media: []`, et la description
/// nulle part.
///
/// La cause n'était pas une règle fausse mais une règle INCOMPLÈTE, appliquée
/// en ligne dans un `Binding`. Le rôle `.caption` désigne « la légende du média
/// de cette slide » — juste tant qu'il Y A un média. Sans média,
/// `selectedSlideMediaURL` est `nil`, le getter rendait `""` et le setter
/// appelait `applyCaption(_:to: nil,…)`, qui commence par
/// `guard let media else { return }`.
///
/// > **Un raisonnement juste sur le cas nominal peut jeter le cas dégénéré**,
/// > et ici sans un mot : rien n'échoue, rien ne rougit, l'écran affiche même
/// > le texte pendant qu'on le tape. Seule la publication le perd.
///
/// ## Pourquoi ces témoins existent SOUS cette forme
///
/// La décision vivait dans un `Binding` d'une `View` — donc inaccessible à tout
/// test. La sortir en `ComposerSlideTextRole.descriptionTarget(format:media:)`
/// est ce qui la rend éprouvable ; les quatre cas ci-dessous sont exactement
/// les branches que le binding prenait à l'aveugle.
final class ComposerDescriptionTargetTests: XCTestCase {

    private let media = URL(fileURLWithPath: "/tmp/photo.jpg")

    /// **Le cas mesuré.** Un post dont la slide ne porte aucun média : le volet
    /// est la seule zone d'écriture de l'écran, et ce qu'on y met ne décrit
    /// rien d'autre que la publication.
    func test_unPostSansMediaSurLaSlide_ecritDansLeCONTENU() {
        XCTAssertEqual(
            ComposerSlideTextRole.descriptionTarget(format: .post, media: nil),
            .postContent,
            "Sans média porteur, une description qui ne va pas au contenu ne va NULLE PART — " +
            "c'est le défaut mesuré : canvas de texte publié, description perdue."
        )
    }

    /// …et avec un média, elle reste SA légende. C'est le raisonnement d'origine
    /// et il est juste : la légende décrit CE visuel, pas la publication.
    func test_unPostAvecMediaSurLaSlide_ecritLaLEGENDEdeCeMedia() {
        XCTAssertEqual(
            ComposerSlideTextRole.descriptionTarget(format: .post, media: media),
            .mediaCaption(media),
            "Avec un média, le texte du volet décrit ce visuel — le retomber sur le contenu " +
            "du post ferait décrire la publication entière par la légende d'une seule image."
        )
    }

    /// **Une story écrit son CONTENU, avec ou sans média** — sa slide EST la
    /// publication (`docs/product/meeshy-composer-modele.md` § 3). La présence
    /// d'un média ne change rien pour elle, et c'est ce que ces deux cas
    /// verrouillent : le correctif du post ne doit pas déborder sur elle.
    func test_uneStory_ecritTOUJOURSsonContenu() {
        for support in [nil, media] {
            XCTAssertEqual(
                ComposerSlideTextRole.descriptionTarget(format: .story, media: support),
                .slideContent,
                "Une slide de story EST la publication : son texte est le contenu, média ou non."
            )
        }
    }

    /// Le réel et le mood suivent la story — la table du modèle les range
    /// ensemble, et le rôle le dit déjà. Ce témoin garde la PROJECTION, pour
    /// qu'un futur profil ne se glisse pas dans `.caption` sans qu'on l'ait
    /// décidé.
    func test_leReelEtLeMood_ecriventLeurContenu() {
        XCTAssertEqual(ComposerSlideTextRole.descriptionTarget(format: .reel, media: media),
                       .slideContent)
        XCTAssertEqual(ComposerSlideTextRole.descriptionTarget(format: .status, media: nil),
                       .slideContent)
    }
}
