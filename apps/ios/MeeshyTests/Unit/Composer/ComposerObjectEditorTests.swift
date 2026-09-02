import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// #4634 — **éditer un texte ouvre un écran plein où toutes les options sont
/// visibles**, et c'est le MÊME écran qu'on vienne de le créer ou de le modifier.
///
/// ## Le défaut que ce lot ferme
///
/// Les dix-huit styles vivaient en bande basse ; `ComposerLowZone.resolve` donne
/// le bas à `.toolOptions` dès qu'un outil est ouvert, et éditer un texte OUVRE
/// un outil. **Le spécimen était inatteignable pendant l'édition** — au seul
/// moment où l'on choisit un style. Et `MeeshyToolOptionsPanel` ne rend quelque
/// chose que si un outil est DÉPLIÉ : tant qu'aucune bulle n'était tapée, la
/// zone basse d'une édition était vide.
///
/// > Deux règles justes — « un outil ouvert prend le bas » et « le panneau ne
/// > montre que l'outil déplié » — composaient une surface qui ne montrait
/// > JAMAIS rien au moment utile. Aucune des deux n'est fausse prise seule ;
/// > c'est leur composition qui l'était, et une garde par règle ne pouvait pas
/// > l'attraper.
final class ComposerObjectEditorTests: XCTestCase {

    private func source(_ nom: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/\(nom)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    /// **Les gardes lisent l'UNITÉ du meuble, jamais un fichier** (2026-09-01).
    ///
    /// `AppSourceGuard.composerHostSource()` concatène `MeeshyComposerHost.swift`,
    /// ses compagnons et tout `MeeshyComposerHost+*.swift`. Épingler un fichier
    /// précis rend la garde otage du prochain découpage : le budget de 1 100
    /// lignes en impose un régulièrement, et une garde qui ne trouve plus son
    /// ancre passe au vert en ne mesurant plus rien.
    private func hostUnit() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    // MARK: - D'où à où

    /// **`nil` veut dire « jusqu'à la fin », pas « zéro ».** Les traiter comme
    /// des nombres perdrait la distinction au premier réglage.
    func test_uneDureeAbsente_resteUnObjetPermanent() {
        let t = ComposerObjectTiming.timing(start: 2, duration: nil)
        XCTAssertEqual(t.start, 2)
        XCTAssertNil(t.end)
        XCTAssertTrue(t.isPermanent)
        XCTAssertNil(t.storedDuration)
    }

    func test_unDebutAbsent_vautZero() {
        XCTAssertEqual(ComposerObjectTiming.timing(start: nil, duration: 3).start, 0)
        XCTAssertEqual(ComposerObjectTiming.timing(start: nil, duration: 3).end, 3)
    }

    /// Un début négatif ne peut pas exister : le modèle l'accepterait, la
    /// lecture non.
    func test_unDebutNegatif_estRameneAZero() {
        XCTAssertEqual(ComposerObjectTiming.timing(start: -4, duration: 2).start, 0)
    }

    /// **Déplacer n'est pas rogner** — la longueur de la fenêtre est CONSERVÉE.
    /// Les confondre ferait raccourcir l'objet chaque fois qu'on le recule
    /// contre zéro, ce qu'aucun geste ne demande.
    func test_deplacer_conserveLaLongueur() {
        let t = ComposerObjectTiming.timing(start: 2, duration: 3)
        let deplace = t.moved(to: 5, slideDuration: 15)
        XCTAssertEqual(deplace.start, 5)
        XCTAssertEqual(deplace.end, 8)
        XCTAssertEqual(deplace.storedDuration, 3)
    }

    func test_deplacer_neSortPasDeLaSlide() {
        let t = ComposerObjectTiming.timing(start: 0, duration: 4)
        let deplace = t.moved(to: 99, slideDuration: 10)
        XCTAssertEqual(deplace.start, 6)
        XCTAssertEqual(deplace.end, 10)
    }

    func test_deplacerVersLeNegatif_seBloqueAZero_sansRaccourcir() {
        let t = ComposerObjectTiming.timing(start: 3, duration: 2)
        let deplace = t.moved(to: -5, slideDuration: 10)
        XCTAssertEqual(deplace.start, 0)
        XCTAssertEqual(deplace.storedDuration, 2)
    }

    /// Rogner le bord gauche laisse la FIN où elle est — c'est la définition
    /// même du geste, et la moitié qu'une implémentation recopiée inverse.
    func test_rognerLeDebut_laisseLaFinEnPlace() {
        let t = ComposerObjectTiming.timing(start: 1, duration: 5)
        let rogne = t.trimmingStart(to: 3)
        XCTAssertEqual(rogne.start, 3)
        XCTAssertEqual(rogne.end, 6)
    }

    /// **La fenêtre minimale.** Sous elle, l'objet clignote plus qu'il
    /// n'apparaît, et les deux poignées du plan 2D se recouvrent.
    func test_lesDeuxBords_neSeCroisentJamais() {
        let t = ComposerObjectTiming.timing(start: 1, duration: 5)
        XCTAssertEqual(t.trimmingStart(to: 99).start,
                       6 - ComposerObjectTiming.minimumWindow, accuracy: 0.0001)
        let fin = t.trimmingEnd(to: 0, slideDuration: 10)
        XCTAssertEqual(fin.end ?? 0, 1 + ComposerObjectTiming.minimumWindow, accuracy: 0.0001)
    }

    /// **Le retour vers « permanent » existe.** Sans lui, régler une fin serait
    /// irréversible : l'interface offrirait un aller sans retour.
    func test_onPeutRedevenirPermanent() {
        let t = ComposerObjectTiming.timing(start: 2, duration: 3)
        XCTAssertFalse(t.isPermanent)
        XCTAssertTrue(t.madePermanent.isPermanent)
        XCTAssertNil(t.madePermanent.storedDuration)
        XCTAssertEqual(t.madePermanent.start, 2, "Rendre permanent ne déplace pas le début.")
    }

    /// **Un objet permanent posé à zéro range DEUX `nil`** (défaut mesuré au
    /// simulateur le 2026-09-01). `Plan2DLayout.bar()` ne rend une barre
    /// FANTÔME que si le début ET la durée sont absents : écrire `startTime = 0`
    /// faisait dessiner une barre PLEINE au plan pendant qu'APPARITION, douze
    /// points plus haut, affichait « à la fin ».
    func test_unObjetPermanentPoseAZero_rangeDeuxAbsences() {
        let t = ComposerObjectTiming.timing(start: nil, duration: nil)
        XCTAssertNil(t.storedStartTime)
        XCTAssertNil(t.storedDuration)
    }

    /// Un début NON nul reste écrit, permanent ou pas : l'absence ne vaut que
    /// pour « depuis le début ».
    func test_unDebutNonNul_estToujoursRange() {
        XCTAssertEqual(ComposerObjectTiming.timing(start: 2, duration: nil).storedStartTime, 2)
    }

    /// Et une fenêtre BORNÉE range son début, fût-il zéro — sans quoi le plan
    /// perdrait l'origine de la barre.
    func test_uneFenetreBornee_rangeSonDebut_memeAZero() {
        let t = ComposerObjectTiming.timing(start: 0, duration: 4)
        XCTAssertEqual(t.storedStartTime, 0)
        XCTAssertEqual(t.storedDuration, 4)
    }

    /// **La surface du DESSOUS ne termine pas l'édition que l'écran plein
    /// possède** (défaut majeur mesuré au simulateur : la porte TEXTE ouvrait un
    /// éditeur VIDE).
    ///
    /// Présenter un `fullScreenCover` fait perdre le premier répondant au canvas
    /// de la scène incrustée, qui annonce une fin de saisie qu'aucun doigt n'a
    /// demandée ; `exitTextEditingMode` supprimait alors la coquille encore vide
    /// que la porte venait de poser. Un événement de PRÉSENTATION ressemble, au
    /// bout du câble, à un geste de l'utilisateur.
    func test_laSurfaceDuDessous_neConclutPas_quandLEcranPleinEstMonte() throws {
        let code = compact(try hostUnit())
        XCTAssertTrue(code.contains("guardeditedObject==nilelse{return}"),
                      "Sans cette garde, ouvrir l'éditeur détruit l'objet qu'il vient "
                      + "d'ouvrir — l'écran s'affiche sur un objet DÉJÀ supprimé.")
    }

    // MARK: - Une seule façon d'éditer

    /// **LE témoin de la directive.** Créer et modifier passent par le même
    /// site : recopier ses lignes chez l'un des deux est exactement ce qui les
    /// faisait diverger.
    func test_creerEtModifier_empruntentLeMemeSite() throws {
        let intake = compact(try hostUnit())
        let surfaces = compact(try hostUnit())
        XCTAssertTrue(intake.contains("funcopenObjectEditor("),
                      "Le site unique est introuvable — re-pointer la garde.")
        XCTAssertTrue(intake.contains("openObjectEditor(objet.id)"),
                      "La porte TEXTE doit ouvrir l'éditeur, pas seulement entrer en mode.")
        XCTAssertTrue(surfaces.contains("openObjectEditor(id)"),
                      "L'appui long « Modifier » doit ouvrir le MÊME écran que la création.")
    }

    /// Le site unique ferme le portail AVANT d'ouvrir : `fullScreenCover` et
    /// `.sheet` se disputent le même présentateur, et fermer l'état invalide
    /// chez l'écrivain vaut mieux que le garder chez le lecteur.
    func test_ouvrirLEditeur_fermeLePortail() throws {
        let code = try hostUnit()
        guard let debut = code.range(of: "func openObjectEditor(")?.upperBound else {
            return XCTFail("`openObjectEditor` est introuvable.")
        }
        let corps = compact(String(code[debut...].prefix(400)))
        XCTAssertTrue(corps.contains("presentedPortal=nil"),
                      "Sans cette fermeture, ouvrir l'éditeur depuis une feuille ne "
                      + "montrerait RIEN — le défaut exact de #4632, une présentation plus loin.")
        XCTAssertTrue(corps.contains("editedObject=ComposerEditedObject("))
    }

    /// Fermer sort du MODE autant que de l'écran — sinon le rail continuerait
    /// d'afficher les contrôleurs d'un texte qu'on n'édite plus.
    func test_fermerLEditeur_sortAussiDuMode() throws {
        let code = try hostUnit()
        guard let debut = code.range(of: "func closeObjectEditor(")?.upperBound else {
            return XCTFail("`closeObjectEditor` est introuvable.")
        }
        let corps = compact(String(code[debut...].prefix(300)))
        XCTAssertTrue(corps.contains("viewModel.exitTextEditingMode()"))
        XCTAssertTrue(corps.contains("editedObject=nil"))
    }

    // MARK: - Toutes les options, vraiment

    /// **Les SEPT outils sont empilés, pas offerts un par un.** Le témoin lit
    /// l'énuméré du SDK plutôt qu'une liste recopiée : un huitième outil ajouté
    /// là-bas doit paraître ici, et une garde sur un littéral serait restée
    /// verte en l'oubliant.
    /// **Renommée au #4842.** Elle s'appelait `…sansEnDeplierAucun` et gardait
    /// deux choses distinctes sous un seul nom : que les outils viennent du SDK
    /// (toujours vrai), et que l'écran n'empile TOUT (plus vrai — la directive
    /// porteur du 2026-09-01 le lui interdit).
    ///
    /// Ce qui SURVIT est la moitié qui compte, et sa raison est intacte :
    /// l'écran ne doit dépendre d'aucun outil déplié **du ViewModel**, parce
    /// que c'est cette condition qui laissait la zone basse d'une édition de
    /// texte VIDE tant qu'aucune bulle du rail n'avait été tapée. Le dépliage
    /// du #4842 est LOCAL et n'a pas d'état vide possible — la distinction
    /// n'est pas un détail, c'est tout l'écart entre les deux défauts.
    func test_lEditeur_prendSesOutilsDuSDK_etNeDependDAucunOutilDeployeDuViewModel() throws {
        let code = compact(try source("ComposerObjectEditorView.swift"))
        // `compact` retire TOUS les blancs : le fragment ne peut pas en porter.
        XCTAssertTrue(code.contains("ForEach(TextEditTool.all.filter{$0 != .style}".replacingOccurrences(of: " ", with: "")),
                      "Les outils doivent venir de `TextEditTool.all` — une liste écrite à "
                      + "la main divergerait au premier outil ajouté au SDK.")
        XCTAssertTrue(code.contains("TextEditToolOptions(tool:tool,textObject:binding)"))
        XCTAssertFalse(code.contains("expandedTool"),
                       "L'écran ne doit dépendre d'AUCUN outil déplié du ViewModel : c'est "
                       + "cette condition qui rendait la zone basse vide pendant l'édition.")
        XCTAssertTrue(code.contains("ComposerObjectEditorDisclosure"),
                      "Le dépliage LOCAL passe par sa règle — voir #4842.")
    }

    /// Le style prend la forme du spécimen `2e` — le vrai texte, sur son vrai
    /// fond, et la grille des dix-huit.
    func test_leStyle_prendLaFormeDuSpecimen() throws {
        let code = compact(try source("ComposerObjectEditorView.swift"))
        XCTAssertTrue(code.contains("TextStyleSpecimenBand("))
        XCTAssertTrue(code.contains("text:binding.wrappedValue.text"),
                      "Le spécimen se lit sur le VRAI texte — un texte fabriqué "
                      + "répondrait à une autre question que celle que l'auteur se pose.")
    }

    /// **Le plan 2D est celui du SDK, monté tel quel.** En écrire une version
    /// simplifiée perdrait les poignées de bord, le verrou des fonds et le
    /// signal de blocage du scroll — la leçon 336 rejouée.
    func test_lePlan2D_estCeluiDuSDK() throws {
        let code = compact(try source("ComposerObjectEditorView.swift"))
        XCTAssertTrue(code.contains("Plan2DView("))
        XCTAssertTrue(code.contains("Plan2DLayout.tracks(from:viewModel.currentEffects"),
                      "Les pistes se dérivent de la slide par la règle du SDK, jamais "
                      + "d'une construction locale.")
    }

    /// **La fenêtre se LIT du modèle à chaque rendu.** Recopiée dans un `@State`,
    /// elle divergerait de ce que le plan 2D dessine juste en dessous.
    func test_laFenetre_neVitPasDansUnEtatDeVue() throws {
        let code = compact(try source("ComposerObjectEditorView.swift"))
        XCTAssertFalse(code.contains("@Stateprivatevartiming"),
                       "La fenêtre doit se lire du modèle — deux sources pour un même "
                       + "fait divergeraient au premier geste sur le plan.")
        XCTAssertTrue(code.contains("varttiming:ComposerObjectTiming{")
                      || code.contains("vartiming:ComposerObjectTiming{"))
    }
}
