import XCTest
@testable import Meeshy

/// **La première vue AJOUTE, BOUGE, DÉCRIT — elle n'édite pas** (directive
/// porteur 2026-09-05).
///
/// Ces témoins gardent une règle qui, sans eux, serait invisible : ce que le lot
/// a fait est un RETRAIT, et un retrait n'a aucun site où rougir. Quatre
/// surfaces d'édition ont quitté l'écran de scène ; rien n'empêcherait le lot
/// suivant de les remonter, et la justification aurait disparu avec le code.
@MainActor
final class ComposerFirstViewTests: XCTestCase {

    // MARK: - La ligne de partage

    /// **Le cœur de la règle** : trois verbes sont servis, et tout ce qui ÉDITE
    /// un objet déjà posé ne l'est pas.
    func test_lesTroisVerbes_sontServis_etLEditionNeLEstPas() {
        for surface in [ComposerFirstViewSurface.doorRail,
                        .canvasGestures,
                        .descriptionPanel,
                        .backgroundPalette,
                        .drawingToolOptions,
                        .objectChipsReading,
                        .textToolControls] {
            XCTAssertTrue(ComposerFirstView.serves(surface),
                          "\(surface.rawValue) relève d'un des trois verbes et doit être servie")
        }
        for surface in [ComposerFirstViewSurface.textStylesBand,
                        .trimBand] {
            XCTAssertFalse(ComposerFirstView.serves(surface),
                           "\(surface.rawValue) règle un objet DÉJÀ POSÉ : elle appartient à "
                             + "l'éditeur plein écran")
        }
    }

    /// **Chaque surface servie nomme SON verbe**, et la table est exhaustive.
    ///
    /// Sans cette moitié, `serves` pourrait rendre `true` pour la bonne raison
    /// et la mauvaise indifféremment : c'est le verbe qui porte la
    /// justification, et c'est lui qu'on relira le jour où une surface change
    /// de camp.
    func test_chaqueSurfaceServie_nommeSonVerbe() {
        XCTAssertEqual(ComposerFirstView.verb(of: .doorRail), .add)
        XCTAssertEqual(ComposerFirstView.verb(of: .backgroundPalette), .add)
        XCTAssertEqual(ComposerFirstView.verb(of: .drawingToolOptions), .add)
        XCTAssertEqual(ComposerFirstView.verb(of: .textToolControls), .add)
        XCTAssertEqual(ComposerFirstView.verb(of: .canvasGestures), .move)
        XCTAssertEqual(ComposerFirstView.verb(of: .objectChipsReading), .move)
        XCTAssertEqual(ComposerFirstView.verb(of: .descriptionPanel), .describe)
    }

    /// **Les trois verbes SERVENT tous les trois.** Un verbe déclaré dont
    /// aucune surface ne relève est du vocabulaire mort — et il se lirait comme
    /// une capacité que l'écran n'a pas.
    func test_chaqueVerbe_estPorteParAuMoinsUneSurface() {
        let portes = Set(ComposerFirstViewSurface.allCases.compactMap(ComposerFirstView.verb(of:)))
        XCTAssertEqual(portes, Set(ComposerFirstViewVerb.allCases))
    }

    // MARK: - Les deux portes que la règle gouverne

    /// **Le rail montre les options d'un texte EN COURS de saisie sur la
    /// scène** (directive porteur 2026-09-28) — et rien quand aucun texte ne
    /// s'édite. Les deux verdicts, sinon une règle constante passerait.
    func test_leRail_montreLesOptionsDuTexte_seulementPendantSaSaisie() {
        XCTAssertTrue(ComposerFirstView.railShowsTextTools(textEditing: true),
                      "la porte TEXTE ouvre ses options à droite de son bouton")
        XCTAssertFalse(ComposerFirstView.railShowsTextTools(textEditing: false))
    }

    /// **La zone basse déplie les réglages de l'outil ouvert** — dessin ou
    /// texte — et rien quand aucun outil ne l'est.
    ///
    /// N'éprouver que le refus laisserait passer une règle qui rend `false`
    /// partout : le pinceau et le texte perdraient leurs réglages, et leurs
    /// colonnes deviendraient inertes.
    func test_laZoneBasse_porteLesOptionsDeLOutilOuvert() {
        XCTAssertTrue(ComposerFirstView.lowZoneShowsToolOptions(drawing: true, textEditing: false),
                      "les réglages du pinceau sont ceux du geste qui AJOUTE")
        XCTAssertTrue(ComposerFirstView.lowZoneShowsToolOptions(drawing: false, textEditing: true),
                      "un réglage de texte choisi dans la colonne se déplie en bas")
        XCTAssertFalse(ComposerFirstView.lowZoneShowsToolOptions(drawing: false, textEditing: false))
    }

    // MARK: - Ce que la règle garde en vie, ailleurs

    /// **Aucune capacité n'a été perdue** : chaque surface retirée a sa jumelle
    /// dans l'éditeur, et le témoin la NOMME plutôt que de la supposer.
    ///
    /// C'est la question qui a sauvé ce lot : le rognage d'une PUCE DE SON
    /// n'avait pas de jumelle — `entries(for: .audio)` rendait `[.timing,
    /// .plan]` — et rien n'aurait rougi en retirant la bande, `sourceTrim(id:)`
    /// servant les deux familles sans qu'aucun type ne bouge.
    func test_chaqueSurfaceRetiree_aSaJumelleDansLEditeur() {
        XCTAssertTrue(ComposerObjectEditorRail.entries(for: .text).contains(.tool(.style)),
                      "les dix-huit polices : la bande `textStyles` en est partie")
        XCTAssertTrue(ComposerObjectEditorRail.entries(for: .media).contains(.media(.trim)),
                      "les bornes d'un média : la bande `timeline` en est partie")
        XCTAssertTrue(ComposerObjectEditorRail.entries(for: .audio).contains(.media(.trim)),
                      "les bornes d'une PUCE DE SON — la seule qui n'avait pas de jumelle")
        for outil in TextEditTool.all {
            XCTAssertTrue(ComposerObjectEditorRail.entries(for: .text).contains(.tool(outil)),
                          "\(outil) quittait la zone basse de la scène : il doit exister ici")
        }
    }

    /// **La seule bande qui reste est servie.** Une bande déclarée et jamais
    /// servie est indiscernable d'une bande oubliée : c'est pour cela que
    /// `timeline` et `textStyles` ont quitté le TYPE, et non le seul jeu servi.
    func test_touteBandeDeclaree_estServie() {
        XCTAssertEqual(Set(ComposerSceneBand.allCases), ComposerSceneCapabilities.bands)
    }
}
