import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Les feuilles Hashtag et Mention partagent UN en-tête, et « Annuler » défait
/// vraiment** (#6134 — directive porteur 2026-09-12).
///
/// > « Mets à jour les feuilles Hashtag, Mention pour avoir un header précis et
/// > avec les actions liquid glass (annuler) à gauche, (terminé) à droite ! La
/// > feuille s'affiche en moitié d'écran comme la feuille mentionner en ce
/// > moment. »
///
/// ## Le mot « Annuler » est un CONTRAT, pas une étiquette
///
/// L'en-tête de la feuille Mention portait la raison de ne pas l'écrire, et elle
/// était exacte au moment où elle a été écrite :
///
/// > « "Terminé" et non "Annuler" : chaque choix est déjà appliqué au composer,
/// > il n'y a plus rien à annuler ici. »
///
/// La directive demande le bouton quand même — donc ce n'est pas l'étiquette
/// qu'il faut ajouter, c'est **ce qu'elle promet**. Les deux feuilles PILOTENT
/// un état qui vit chez leur hôte (`onChange` pour les mentions, `onToggle` pour
/// les balises) : retenir cet état à l'ouverture et le rendre au refus coûte un
/// instantané, et c'est la seule façon d'écrire « Annuler » sans mentir.
///
/// > Sans ces témoins, un « Annuler » qui ne fait que `dismiss()` passe pour un
/// > contrôle correct : il ferme la feuille, l'utilisateur voit une réaction, et
/// > RIEN ne dit que les trois balises qu'il vient d'ajouter sont restées. C'est
/// > la loi 4 dans sa forme la plus coûteuse — le contrôle n'est pas inerte, il
/// > est MENTEUR, et seul un test de valeur les distingue.
final class ComposerSheetHeaderTests: XCTestCase {

    // MARK: - Ce qui se mesure par VALEUR

    /// **Le cœur du contrat, éprouvé sans aucune vue.** La bascule étant son
    /// propre inverse, revenir en arrière = basculer exactement la différence
    /// symétrique entre l'instantané et l'état courant.
    func test_annuler_rebasculeExactementCeQuiAChangé() {
        // Ouverture avec #voyage ; l'auteur ajoute #été et retire #voyage.
        let avant = ["voyage"]
        let apres = ["ete"]
        let aBasculer = ComposerHashtags.togglesRestoring(apres, to: avant)
        XCTAssertEqual(Set(aBasculer.map { $0.lowercased() }), ["ete", "voyage"],
                       "Retirer ce qui fut ajouté, remettre ce qui fut retiré — rien d'autre.")
    }

    /// **Rien n'a changé ⇒ aucune bascule.** Sans ce témoin, une implémentation
    /// qui rebascule TOUT passerait le test précédent et détruirait l'état à
    /// chaque « Annuler » sans modification.
    func test_annuler_sansModification_neBasculeRien() {
        XCTAssertTrue(ComposerHashtags.togglesRestoring(["voyage", "ete"], to: ["ete", "voyage"]).isEmpty,
                      "Le même ensemble dans un autre ordre n'est pas un changement.")
    }

    /// **La casse ne crée pas un faux changement.** `#Voyage` et `#voyage` sont
    /// la même balise pour le serveur (`ComposerHashtags.tags`) ; les traiter
    /// comme deux ferait « annuler » retirer une balise que l'auteur n'a jamais
    /// touchée.
    func test_annuler_compareEnMinuscules_commeLeReste() {
        XCTAssertTrue(ComposerHashtags.togglesRestoring(["Voyage"], to: ["voyage"]).isEmpty,
                      "Même balise à la casse près — rien à défaire.")
    }

    /// **L'ajout seul, et le retrait seul** — les deux moitiés de la différence
    /// symétrique, séparément : une implémentation qui n'en fait qu'une passe
    /// le premier témoin une fois sur deux.
    func test_annuler_couvreLesDeuxSens() {
        XCTAssertEqual(ComposerHashtags.togglesRestoring(["a", "b"], to: ["a"]).map { $0.lowercased() }, ["b"],
                       "Ce qui fut AJOUTÉ se retire.")
        XCTAssertEqual(ComposerHashtags.togglesRestoring(["a"], to: ["a", "b"]).map { $0.lowercased() }, ["b"],
                       "Ce qui fut RETIRÉ se remet.")
    }

    // MARK: - Ce qui ne se mesure qu'en SOURCE

    private func racineDepot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Composer
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // ios
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // racine
    }

    private func source(_ chemin: String) throws -> String {
        AppSourceGuard.stripComments(
            try String(contentsOf: racineDepot().appendingPathComponent(chemin), encoding: .utf8))
    }

    private var cheminEntete: String { "packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshySheetHeader.swift" }
    private var cheminMention: String { "packages/MeeshySDK/Sources/MeeshyUI/Story/MentionSuggestions.swift" }
    private var cheminHashtag: String { "apps/ios/Meeshy/Features/Main/Composer/ComposerHashtagSheet.swift" }

    private func compact(_ s: String) -> String { s.filter { !$0.isWhitespace } }

    /// **UN en-tête, monté deux fois.** Deux en-têtes écrits séparément
    /// divergeraient au premier ajustement — c'est la dimension 11 (« aucune
    /// jumelle divergente ») et c'est ce que ce dépôt paie le plus souvent.
    func test_lesDeuxFeuilles_montentLeMemeEntete() throws {
        for (nom, chemin) in [("Mention", cheminMention), ("Hashtag", cheminHashtag)] {
            XCTAssertTrue(compact(try source(chemin)).contains("MeeshySheetHeader("),
                          "La feuille \(nom) doit monter l'en-tête PARTAGÉ, pas le sien (#6134).")
        }
    }

    /// **Aucune des deux ne garde son en-tête d'avant.** Garde NÉGATIVE : sans
    /// elle, ajouter l'en-tête partagé À CÔTÉ de l'ancien passerait au vert.
    func test_aucuneFeuille_neGardeSonEnteteDAvant() throws {
        XCTAssertFalse(compact(try source(cheminMention)).contains("privatevarheader:someView"),
                       "L'en-tête à la main de la feuille Mention doit avoir disparu (#6134).")
        XCTAssertFalse(compact(try source(cheminHashtag)).contains("ComposerAudienceCopy.hashtagsSection.capitalized"),
                       "Le titre de la feuille Hashtag ne réutilise plus le libellé d'une SECTION interne.")
    }

    /// **Les deux actions sont en verre, et aucune encre n'est décidée sur
    /// place.** La directive nomme « liquid glass » ; le dépôt a UN helper pour
    /// ça, et une couleur en dur le contredirait dans l'un des deux thèmes.
    func test_lesActions_sontEnVerre_etNEncrentRienEnDur() throws {
        let code = compact(try source(cheminEntete))
        XCTAssertTrue(code.contains(".adaptiveGlass("), "Les actions portent le verre du dépôt (#6134).")
        XCTAssertTrue(code.contains(".glassControlForeground()"), "L'encre suit la surface, elle ne se décide pas.")
        XCTAssertFalse(code.contains(".foregroundStyle(.white)"), "Aucune encre en dur dans l'en-tête partagé.")
        XCTAssertFalse(code.contains("Color.white"), "Aucune couleur ne se décide dans l'en-tête partagé.")
    }

    /// **Annuler à GAUCHE, Terminé à DROITE** — la directive le dit dans cet
    /// ordre, et c'est un fait de disposition qu'aucun test de valeur ne voit.
    func test_annulerEstAGauche_termineADroite() throws {
        let code = compact(try source(cheminEntete))
        guard let gauche = code.range(of: "common.cancel"),
              let droite = code.range(of: "common.done") else {
            return XCTFail("Les deux libellés localisés doivent exister dans l'en-tête partagé.")
        }
        XCTAssertTrue(gauche.lowerBound < droite.lowerBound,
                      "« Annuler » se déclare avant « Terminé » — gauche puis droite (#6134).")
        XCTAssertTrue(code.contains("Spacer()"), "Un ressort sépare les deux bords.")
    }

    /// **Les libellés sont LOCALISÉS, jamais en ligne.** Un littéral français
    /// servirait les sept locales en français sans qu'aucun gate ne rougisse.
    func test_lesLibelles_sontLocalises() throws {
        let code = try source(cheminEntete)
        XCTAssertTrue(code.contains("String(localized: \"common.cancel\""), "« Annuler » vient du catalogue.")
        XCTAssertTrue(code.contains("String(localized: \"common.done\""), "« Terminé » vient du catalogue.")
    }

    /// **Les deux feuilles s'ouvrent à MI-HAUTEUR**, et par le MÊME modifieur —
    /// recopier `[.medium, …]` dans les deux donnerait deux déclarations du
    /// même fait, que le premier ajustement ferait diverger.
    func test_lesDeuxFeuilles_souvrentAMiHauteur_parLeMemeModifieur() throws {
        for (nom, chemin) in [("Mention", cheminMention), ("Hashtag", cheminHashtag)] {
            XCTAssertTrue(compact(try source(chemin)).contains("AudiencePickerPresentationStyle()"),
                          "La feuille \(nom) porte la présentation PARTAGÉE, dont le premier cran est `.medium` (#6134).")
        }
    }

    /// **Le « Annuler » de la feuille Mention RESTITUE.** L'instantané est ce
    /// qui distingue le contrat du mensonge, et il se lit dans la source parce
    /// que la feuille est une vue.
    func test_annuler_deLaFeuilleMention_restitueLInstantane() throws {
        let code = compact(try source(cheminMention))
        XCTAssertTrue(code.contains("onChange(instantane)"),
                      "Refuser doit RENDRE l'état d'avant l'ouverture, pas seulement fermer (#6134).")
    }

    /// **Sans elle, les gardes négatives ci-dessus sont vertes par omission.**
    /// Trois d'entre elles cherchent une ABSENCE : un chemin faux, un fichier
    /// renommé, et elles passent toutes sans rien protéger.
    func test_lesGardesLisentDesSourcesNonVides() throws {
        for (nom, chemin) in [("en-tête", cheminEntete), ("Mention", cheminMention), ("Hashtag", cheminHashtag)] {
            XCTAssertGreaterThan(try source(chemin).count, 500,
                                 "La source « \(nom) » est vide ou introuvable — les gardes négatives ne protègent plus rien.")
        }
    }
}
