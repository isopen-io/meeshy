import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// #5002 — **ce que la publication emporte se lit au pied de la scène.**
///
/// > Directive porteur 2026-09-03 : « les hashtag et mention referencé (pas les
/// > mention inline et mention caché) doivent apparaitre en bas de la scene ».
///
/// Les deux exclusions se prouvent ici, sans monter de vue — et le témoin
/// s'écrit sur le cas que le code naïf RATERAIT : une scène qui ne porte QUE
/// des modes exclus n'a rien à montrer, alors qu'elle porte bien des
/// références. Compter les références aurait rendu le même verdict que la règle
/// juste sur tous les autres cas.
@MainActor
final class ComposerSceneReferencesTests: XCTestCase {

    private func reference(_ nom: String, _ mode: PostReferenceDisplay) -> ComposerReference {
        ComposerReference(username: nom, userId: "id-\(nom)", display: mode)
    }

    private func servies(_ references: [ComposerReference]) -> [PostReference] {
        ReferenceNoteRow.noted(in: ComposerSceneReferences.readerReferences(from: references))
    }

    // MARK: - Qui paraît, qui ne paraît jamais

    func test_aReferencedMention_appears() {
        let servies = servies([reference("alice", .note)])
        XCTAssertEqual(servies.map(\.username), ["alice"])
    }

    /// Déjà VISIBLE dans le texte : le répéter dirait deux fois la même chose.
    func test_anInlineMention_neverAppears() {
        XCTAssertTrue(servies([reference("alice", .inline)]).isEmpty)
    }

    /// Délibérément INVISIBLE aux tiers. La montrer ne serait pas une redite
    /// mais une contradiction : l'auteur croirait que sa publication l'annonce.
    func test_aSilentMention_neverAppears() {
        XCTAssertTrue(servies([reference("alice", .silent)]).isEmpty)
    }

    /// La pastille posée sur le canevas EST son affichage.
    func test_aPinnedMention_neverAppears() {
        XCTAssertTrue(servies([reference("alice", .pinned)]).isEmpty)
    }

    func test_amongFourModes_onlyTheReferencedOneSurvives() {
        let servies = servies([
            reference("alice", .inline),
            reference("bob", .note),
            reference("carol", .silent),
            reference("dan", .pinned),
        ])
        XCTAssertEqual(servies.map(\.username), ["bob"])
    }

    // MARK: - Y a-t-il quelque chose à montrer

    func test_nothingAtAll_servesNothing() {
        XCTAssertFalse(ComposerSceneReferences.isServed(hashtags: [], references: []))
    }

    func test_hashtagsAlone_areEnough() {
        XCTAssertTrue(ComposerSceneReferences.isServed(hashtags: ["voyage"], references: []))
    }

    func test_aReferencedMentionAlone_isEnough() {
        XCTAssertTrue(ComposerSceneReferences.isServed(hashtags: [],
                                                       references: [reference("alice", .note)]))
    }

    /// **Le témoin du lot.** Une publication qui nomme trois personnes — en
    /// ligne, en silence, et en pastille — n'a RIEN à montrer au pied. Un pied
    /// qui se serait contenté de compter les références aurait affiché une
    /// rangée vide sous chaque scène.
    func test_onlyExcludedModes_serveNothing() {
        XCTAssertFalse(ComposerSceneReferences.isServed(
            hashtags: [],
            references: [reference("alice", .inline),
                         reference("carol", .silent),
                         reference("dan", .pinned)]))
    }

    // MARK: - La traduction vers le modèle du lecteur

    /// Le pied MONTE la rangée du lecteur : ce qu'il lui passe doit porter les
    /// mêmes noms, sans quoi l'auteur verrait « Avec » suivi de rien.
    func test_theReaderRow_getsTheSameNames() {
        let traduites = ComposerSceneReferences.readerReferences(from: [
            reference("alice", .note), reference("bob", .inline),
        ])
        XCTAssertEqual(traduites.map(\.username), ["alice", "bob"])
        XCTAssertEqual(traduites.map(\.display), [.note, .inline])
    }

    /// Un identifiant manquant retombe sur le pseudo — un `id` vide ferait
    /// collision entre deux personnes dans le `ForEach` de la rangée, qui
    /// s'identifie par `userId`.
    func test_aMissingUserId_fallsBackToTheHandle() {
        let traduites = ComposerSceneReferences.readerReferences(from: [
            ComposerReference(username: "alice", userId: nil, display: .note),
            ComposerReference(username: "bob", userId: nil, display: .note),
        ])
        XCTAssertEqual(traduites.map(\.userId), ["alice", "bob"])
        XCTAssertEqual(Set(traduites.map(\.id)).count, 2, "deux personnes, deux identités")
    }

    // MARK: - Le pied est MONTÉ, et ALIMENTÉ

    private func source(_ chemin: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/\(chemin)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    /// **Une vue sans consommateur n'a aucun site où rougir** (leçon 483). Les
    /// règles ci-dessus resteraient toutes vertes avec un pied que personne ne
    /// monte : elles éprouvent ce qu'il SERT, jamais qu'il est là.
    func test_theFooter_isMounted() throws {
        let surface = try source("ComposerSceneSurface.swift")
        XCTAssertTrue(surface.contains("ComposerSceneReferenceFooter("),
                      "la surface scène ne monte pas le pied — la règle existe et ne se voit nulle part")
    }

    /// **Et « qui l'affiche » a une jumelle : « qui l'ALIMENTE ? »** Un pied
    /// monté sur ses valeurs par défaut — deux listes vides — se peint
    /// exactement comme une publication qui n'emporte rien.
    func test_theHost_feedsIt() throws {
        let hote = try source("MeeshyComposerHost+Surfaces.swift")
        // `composerHashtags`, jamais une seconde dérivation : le site unique
        // existe déjà (`MeeshyComposerHost+Audience.swift`) et
        // `ComposerAudienceAndHashtagTests` compte les occurrences de
        // `ComposerHashtags.tags(in:` dans le meuble. Le pied LIT, il ne
        // recalcule pas.
        XCTAssertTrue(hote.contains("sceneHashtags: composerHashtags"),
                      "le pied doit lire le site unique, pas re-dériver les balises")
        XCTAssertTrue(hote.contains("sceneReferences: composerReferences"),
                      "le pied doit recevoir la liste COMPLÈTE — le filtre vit dans ReferenceNoteRow")
    }

    /// **Le FOND du plateau ne peut pas être la couleur d'un contenu posé
    /// dessus** (#5001, #5002).
    ///
    /// `plateauTint` est le fond (`PlateauTint.color` → `indigo950`, « la
    /// surface de marque la plus sombre »). Le passer en `tint:` à l'en-tête ou
    /// au pied les peint dans la couleur de ce qu'ils recouvrent : mesuré au
    /// simulateur, l'arbre d'accessibilité portait bien « Hashtags : voyage,
    /// ete » à `y=742`, et l'écran ne montrait rien.
    ///
    /// > Un paramètre nommé d'après une SURFACE n'est pas un accent de contenu.
    /// > Les autres consommateurs de `plateauTint` s'en servent pour peindre le
    /// > plateau — le rail, le socle ; ces deux-là vivent DESSUS.
    ///
    /// Le témoin est une garde de source parce que le défaut est un choix de
    /// CÂBLAGE : les deux vues rendent correctement ce qu'on leur donne.
    func test_neitherBandIsPaintedInThePlateauGround() throws {
        let surface = try source("ComposerSceneSurface.swift")
        for montage in ["ComposerSceneSoundHeader(", "ComposerSceneReferenceFooter("] {
            guard let debut = surface.range(of: montage) else {
                return XCTFail("\(montage) n'est plus monté")
            }
            let suite = surface[debut.upperBound...].prefix(400)
            XCTAssertFalse(suite.contains("tint: plateauTint"),
                           "\(montage) reçoit le FOND du plateau comme couleur de contenu — "
                           + "il se peindrait dans la couleur de ce qu'il recouvre")
        }
    }

    /// **Le pied ouvre les MÊMES portes que le rail.** Deux chemins vers une
    /// même feuille divergent au premier changement, et la divergence ne se voit
    /// qu'au doigt.
    func test_theFooter_opensTheRailDoors() throws {
        let hote = try source("MeeshyComposerHost+Surfaces.swift")
        XCTAssertTrue(hote.contains("onOpenHashtags: { handleRailDoor(.hashtag) }"))
        XCTAssertTrue(hote.contains("onOpenMentions: { handleRailDoor(.mention) }"))
    }

    // MARK: - L'annonce

    func test_hashtagsAreSpokenWithoutTheirHash() {
        let dit = ComposerSceneReferenceFooter.spokenHashtags(["voyage", "été"])
        XCTAssertTrue(dit.contains("voyage"))
        XCTAssertTrue(dit.contains("été"))
        XCTAssertFalse(dit.contains("#"), "« dièse voyage » n'apprend rien de plus que « voyage »")
    }
}
