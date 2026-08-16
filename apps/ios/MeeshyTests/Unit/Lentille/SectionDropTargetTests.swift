import XCTest
import MeeshySDK
@testable import Meeshy

/// Cible de drop des headers de section après la restructuration sticky
/// (contrat LWS-6, travail 3 : « `SectionDropDelegate` et `SectionFrameRegistry`
/// re-câblés sur le `header:` — le `.onDrop` doit rester sur la MÊME vue
/// logique, sinon la cible de drop se décale d'une section »).
///
/// Le décalage d'une section est le défaut le plus coûteux de ce workstream :
/// il ne casse rien, ne lève aucune exception, et range simplement les
/// conversations dans la mauvaise catégorie. Deux témoins le gardent —
/// l'UNICITÉ du site de câblage (garde de source : une seule vue reçoit le
/// drop, donc aucune place pour un décalage) et la DÉCISION de drop, section
/// par section, sur les quatre cibles du critère.
///
/// Suite ouverte : LWS-6/I-064 la complète.
@MainActor
final class SectionDropTargetTests: XCTestCase {

    // MARK: - Source

    private func listViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Lentille
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views/ConversationListView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func normalizedCode(_ source: String) -> String {
        AppSourceGuard.stripComments(source)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    // MARK: - Un seul site de câblage

    func test_onDrop_isWiredOnASingleLogicalView_theSectionHeader() throws {
        let code = normalizedCode(try listViewSource())

        XCTAssertEqual(
            occurrences(of: ".onDrop(of: [.text], delegate: SectionDropDelegate(", in: code), 1,
            "UN seul `.onDrop` de section dans toute la liste (`sectionHeader`, autour du mux " +
            "de peau) — contrat LWS-6 travail 3. Câbler le drop dans CHAQUE branche du mux " +
            "(sticker ET SectionHeaderView) rouvrirait exactement la porte que le contrat " +
            "ferme : deux vues logiques pour une section, et une cible qui se décale."
        )
        XCTAssertTrue(
            code.contains("sectionHeaderLabel(for: group) .background( GeometryReader { geo in"),
            "Le registre de frames et le `.onDrop` s'appliquent AUTOUR du mux " +
            "(`sectionHeaderLabel`), jamais dans l'une de ses branches : la vue qui affiche " +
            "la section n est celle qui reçoit son drop, quelle que soit la peau."
        )
    }

    /// Referme la boucle entre la garde de STRUCTURE ci-dessus (un seul
    /// `.onDrop`) et la garde de COMPORTEMENT plus bas (`ChipDropResolver`
    /// range dans la bonne section) : rien ne prouve encore que le
    /// `sectionId` qui ENTRE dans la décision est bien celui de la section
    /// AFFICHÉE. Le décalage le plus coûteux du contrat (« la cible de drop
    /// se décale d'une section ») est exactement un site où `handleDrop`
    /// serait appelé avec un id différent de `group.section.id` — un défaut
    /// qu'aucun des deux tests ci-dessus, pris séparément, ne peut voir.
    func test_onDrop_passesTheDisplayedSectionId_throughToTheResolver() throws {
        let code = normalizedCode(try listViewSource())

        XCTAssertTrue(
            code.contains("onDrop: { handleDrop(to: group.section.id, providers: $0) }"),
            "Le closure `onDrop` du `SectionDropDelegate` doit transmettre `group.section.id` " +
            "— l'id de LA section affichée par ce header — à `handleDrop`, jamais une variable " +
            "capturée d'un autre site ni une constante."
        )
        XCTAssertTrue(
            code.contains("private func handleDrop(to sectionId: String, providers: [NSItemProvider]) -> Bool {"),
            "`handleDrop` doit recevoir cet id sous le nom `sectionId` — le paramètre qui " +
            "alimente `ChipDropResolver.action(droppedOn:)` juste en dessous."
        )
        XCTAssertTrue(
            code.contains("switch ChipDropResolver.action( droppedOn: sectionId,"),
            "…et `handleDrop` doit décider avec CE `sectionId`, pas un autre : c'est la ligne " +
            "qui referme la chaîne header affiché → id capturé → décision de rangement testée " +
            "ci-dessous (`test_dropOnSectionN_landsInSectionN_forFourTargets`)."
        )
    }

    func test_sectionFrameRegistry_hasASingleWriter() throws {
        let code = normalizedCode(try listViewSource())

        XCTAssertEqual(
            occurrences(of: "sectionFrameRegistry.frames[", in: code), 1,
            "Le registre de frames (hit-test du drop de la chip, `handleChipDrop` en " +
            "+Overlays) doit garder UN seul écrivain — `registerSectionFrame`. C'est lui qui " +
            "porte le refus des sections calculées ; un second site d'écriture le " +
            "contournerait en silence."
        )
        XCTAssertTrue(
            code.contains("private func registerSectionFrame(_ sectionId: String, _ frame: CGRect) { guard Self.acceptsSectionDrop(sectionId: sectionId) else { return }"),
            "`registerSectionFrame` doit refuser d'enregistrer une section non assignable : " +
            "présente dans le registre, elle serait « touchée » par la chip et " +
            "`ChipDropResolver` (possédé par LWS-8, qui ne connaît pas la Lentille) en " +
            "ferait un `moveToSection(sectionId: \"lentille.…\")` — une catégorie fantôme " +
            "écrite dans l'état utilisateur."
        )
    }

    func test_sectionDropDelegate_refusesTheDropWhenTheSectionIsNotAssignable() throws {
        let code = normalizedCode(try listViewSource())

        XCTAssertTrue(
            code.contains("func validateDrop(info: DropInfo) -> Bool { acceptsDrop && info.hasItemsConforming(to: [.text]) }"),
            "Le refus vit dans `validateDrop` : SwiftUI n'appelle alors ni `dropEntered` " +
            "(pas de surbrillance, pas d'haptique mensongère) ni `performDrop`. Refuser " +
            "seulement dans `performDrop` laisserait la section s'allumer sous le doigt."
        )
        XCTAssertTrue(
            code.contains("var acceptsDrop: Bool = true"),
            "`acceptsDrop` doit avoir `true` pour DÉFAUT : le chemin d'aujourd'hui " +
            "(drapeau OFF, pinned, catégories, other) reste strictement inchangé, y compris " +
            "pour tout appelant qui ne passerait pas l'argument."
        )
        XCTAssertTrue(
            code.contains("acceptsDrop: Self.acceptsSectionDrop(sectionId: group.section.id),"),
            "Le seul site de câblage du drop doit renseigner `acceptsDrop` depuis la règle " +
            "partagée `acceptsSectionDrop`, jamais depuis un test d'id recopié sur place."
        )
    }

    // MARK: - Qui accepte un drop

    func test_acceptsSectionDrop_isTrueForPinnedOtherAndUserCategories() {
        for sectionId in ["pinned", "other", "work", "family", "6512f2a0e1b4c3d2a1908877"] {
            XCTAssertTrue(
                ConversationListView.acceptsSectionDrop(sectionId: sectionId),
                "« \(sectionId) » est assignable : le drag & drop d'aujourd'hui doit " +
                "continuer à fonctionner à l'identique (critère R9 — gestes inchangés)."
            )
        }
    }

    func test_acceptsSectionDrop_isFalseForEveryComputedLentilleSection() {
        for section in LentilleSectionIdentity.allSections {
            XCTAssertFalse(
                ConversationListView.acceptsSectionDrop(sectionId: section.id),
                "« \(section.name) » est CALCULÉE depuis `lastMessageAt` (ou la présence " +
                "d'un appel) : on n'y range pas une conversation. Déposer dessus doit être " +
                "un non-événement, jamais une écriture."
            )
        }
    }

    /// Témoin négatif littéral, indépendant de `LentilleSectionIdentity` :
    /// les CINQ sections Lentille-only nommées par le contrat I-064, en toutes
    /// lettres — pas via `allSections`, pour que ce test rougisse aussi si
    /// `LentilleSectionIdentity` elle-même orthographiait mal l'un de ses
    /// ids (le test au-dessus serait alors juste sur un mauvais id).
    func test_lentilleOnlySectionIds_areNeverDropTargets_byLiteralId() {
        let lentilleOnlyIds = [
            "lentille.live",
            "lentille.today",
            "lentille.yesterday",
            "lentille.thisWeek",
            "lentille.older",
        ]

        for id in lentilleOnlyIds {
            XCTAssertFalse(
                ConversationListView.acceptsSectionDrop(sectionId: id),
                "« \(id) » ne doit JAMAIS accepter de drop : c'est une borne CALCULÉE " +
                "(temps ou présence d'appel), pas une catégorie assignable."
            )
        }

        // Cohérence avec l'identité déclarée : les cinq ids ci-dessus sont
        // EXACTEMENT ceux que `LentilleSectionIdentity` émet — ni un id
        // oublié côté test, ni un sixième bucket ajouté côté production sans
        // que ce témoin négatif le couvre (leçon 257, égalité d'ensembles).
        XCTAssertEqual(
            Set(lentilleOnlyIds),
            Set(LentilleSectionIdentity.allSections.map(\.id)),
            "La liste littérale du contrat I-064 (5 ids) doit rester en ÉGALITÉ D'ENSEMBLES " +
            "avec `LentilleSectionIdentity.allSections` — sinon ce témoin négatif oublierait " +
            "silencieusement un bucket ajouté demain, ou vérifierait un id qui n'existe plus."
        )
    }

    /// Second volet du témoin négatif : « non inscrites au registre ». Le
    /// registre (`sectionFrameRegistry.frames`) est ce que `handleChipDrop`
    /// (+Overlays, LWS-8) hit-teste au relâchement de la chip — une section
    /// qui y figurerait serait « touchée » même en refusant `.onDrop`.
    /// `registerSectionFrame` est `private` (aucun hook de test direct), donc
    /// la garde porte sur la RÈGLE qui protège l'écriture — `acceptsSectionDrop`,
    /// déjà prouvée fausse pour les cinq ids ci-dessus — ET sur le fait que
    /// `registerSectionFrame` la consulte AVANT d'écrire (texte exact du
    /// `guard`, vérifié par `test_sectionFrameRegistry_hasASingleWriter`
    /// au-dessus). Les deux témoins réunis ferment la boucle : aucun chemin
    /// n'existe plus pour inscrire une section Lentille-only au registre.
    func test_lentilleOnlySections_guardTextPrecedesTheRegistryWrite() throws {
        let code = normalizedCode(try listViewSource())

        XCTAssertTrue(
            code.contains(
                "private func registerSectionFrame(_ sectionId: String, _ frame: CGRect) { " +
                "guard Self.acceptsSectionDrop(sectionId: sectionId) else { return } " +
                "sectionFrameRegistry.frames[sectionId] = frame }"
            ),
            "`registerSectionFrame` doit REFUSER (retourner sans écrire) avant même " +
            "d'atteindre `sectionFrameRegistry.frames[sectionId] = frame` — le `guard` " +
            "précède l'écriture, il ne la suit pas. Un id Lentille-only qui franchirait ce " +
            "`guard` entrerait au registre et deviendrait une cible réelle du drop de chip."
        )
    }

    // MARK: - Décision de drop : quatre sections, chacune ciblée

    /// Critère LWS-6 : « déposer une conversation sur le sticker de la
    /// catégorie *n* la range dans la catégorie *n* — test sur 4 sections,
    /// chacune ciblée ». Le témoin utile n'est pas qu'un drop produise UNE
    /// action, c'est qu'il produise l'action de la section VISÉE et d'aucune
    /// autre : chaque cas vérifie donc aussi qu'aucune des trois autres cibles
    /// n'aurait donné le même résultat (le décalage d'une section produit une
    /// action parfaitement valide — pour la mauvaise catégorie).
    func test_dropOnSectionN_landsInSectionN_forFourTargets() {
        let categoryA = "6512f2a0e1b4c3d2a1908877"
        let categoryB = "6512f2a0e1b4c3d2a1908878"

        // 1/4 — « Épingles » : le drop épingle (jamais de dés-épinglage).
        // behaviour-matrix:L07 — volet section dédiée à l'épingle (le drop
        // range bien SOUS le sticker épingles). Voir aussi
        // LentilleRowSourceGuardTests (volet sourdine) et
        // LentilleRowBehaviourAnchorTests (volet glyphe 📌, TROU RÉEL).
        // `behaviour-matrix.json` L07 : « … l'épingle ajoute un glyphe 📌 avant
        // le nom + le sticker ÉPINGLÉES » — cette cible est celle qui fait
        // atterrir la conversation SOUS ce sticker précis.
        XCTAssertEqual(
            ChipDropResolver.action(droppedOn: "pinned", isPinned: false, currentSectionId: categoryA),
            .pin,
            "Cible 1/4 — un drop sur « Épingles » épingle."
        )

        // 2/4 et 3/4 — deux catégories utilisateur, chacune sa propre cible.
        XCTAssertEqual(
            ChipDropResolver.action(droppedOn: categoryA, isPinned: false, currentSectionId: ""),
            .move(sectionId: categoryA),
            "Cible 2/4 — un drop sur la catégorie A range dans A."
        )
        XCTAssertEqual(
            ChipDropResolver.action(droppedOn: categoryB, isPinned: false, currentSectionId: ""),
            .move(sectionId: categoryB),
            "Cible 3/4 — un drop sur la catégorie B range dans B, pas dans A : c'est " +
            "précisément le décalage d'une section que le contrat fait garder."
        )
        XCTAssertNotEqual(
            ChipDropResolver.action(droppedOn: categoryB, isPinned: false, currentSectionId: ""),
            .move(sectionId: categoryA),
            "Un drop sur B ne doit JAMAIS produire un rangement dans A."
        )

        // 4/4 — « Mes conversations » : sort de toute catégorie (id vide).
        XCTAssertEqual(
            ChipDropResolver.action(droppedOn: "other", isPinned: false, currentSectionId: categoryA),
            .move(sectionId: ""),
            "Cible 4/4 — un drop sur « Mes conversations » retire la conversation de sa " +
            "catégorie (sectionId vide), il ne crée pas une catégorie « other »."
        )
    }

    func test_dropOnTheSameSection_remainsANoOp() {
        let categoryA = "6512f2a0e1b4c3d2a1908877"
        XCTAssertEqual(
            ChipDropResolver.action(droppedOn: categoryA, isPinned: false, currentSectionId: categoryA),
            .none,
            "Reposer une conversation dans sa propre section reste un non-événement — " +
            "sémantique inchangée par LWS-6."
        )
    }
}
