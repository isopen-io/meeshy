import XCTest
@testable import Meeshy

/// #4120 — **un portail d'ingestion appartient au MEUBLE, jamais à une
/// surface.**
///
/// Le défaut qui a produit cette suite : les quatre portes du rail *leading*
/// n'ouvraient RIEN. Chaque maillon était pourtant correct — le rail remontait
/// la porte, `handleRailDoor` aiguillait, `handleDocumentTool` posait bien
/// `showsPhotoPicker = true`. Ce qui manquait était **le lecteur** : les huit
/// modificateurs de présentation étaient attachés à `documentSurface`, la vue
/// qui n'est pas montée quand une scène existe. Le booléen partait, personne ne
/// le lisait.
///
/// D'où la forme de ces témoins. Le déplacement seul rejouerait le défaut à la
/// cinquième surface ; ce qui le ferme est un **INVENTAIRE** — tout état de
/// présentation du meuble doit avoir son modificateur monté au-dessus de
/// l'aiguillage des surfaces.
final class ComposerIntakePortalsTests: XCTestCase {

    private func hostSource() throws -> String {
        return AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    private func declarationBody(startingAt anchor: String, in code: String) -> String? {
        guard let start = code.range(of: anchor) else { return nil }
        var depth = 0
        var body = ""
        for character in code[start.lowerBound...] {
            body.append(character)
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { return body }
            }
        }
        return nil
    }

    /// Les états de présentation DÉCLARÉS par le meuble, lus de la source — pas
    /// une liste recopiée ici, qui aurait divergé au premier ajout et rendu le
    /// témoin vert sur un neuvième sélecteur non monté.
    private func declaredPresentationStates(in code: String) -> Set<String> {
        var found: Set<String> = []
        for ligne in code.components(separatedBy: .newlines) {
            let t = ligne.trimmingCharacters(in: .whitespaces)
            // #4102 — le découpage du meuble a retiré `private` de ses membres
            // (Swift ne le rend visible qu'aux extensions du même fichier). Les
            // DEUX formes sont lues : l'inventaire doit rester vrai quel que
            // soit le niveau d'accès, sinon il compte zéro et passe au vert.
            let prefixe = ["@State private var shows", "@State var shows"]
                .first(where: t.hasPrefix)
            guard let prefixe else { continue }
            let sansPrefixe = t.dropFirst(prefixe.count - "shows".count)
            let nom = sansPrefixe.prefix { $0.isLetter || $0.isNumber }
            found.insert(String(nom))
        }
        return found
    }

    /// **Le fusible.** Sans lui, les gardes qui suivent seraient vertes par
    /// OMISSION le jour où le chemin change — et celle de l'inventaire le
    /// serait sur DEUX ensembles vides, ce qui passe.
    func test_lesEtatsDePresentation_sontLisiblesEtNombreux() throws {
        let etats = declaredPresentationStates(in: try hostSource())
        XCTAssertGreaterThanOrEqual(etats.count, 8,
            "Le meuble déclare au moins huit sélecteurs — en lire moins veut dire que la lecture a cassé.")
        XCTAssertTrue(etats.contains("showsPhotoPicker"))
        XCTAssertTrue(etats.contains("showsLocationPicker"))
    }

    /// **LA garde de #4120 — l'inventaire.** Chaque état de présentation a son
    /// modificateur monté SUR L'AIGUILLAGE, donc au-dessus des quatre vues.
    ///
    /// Elle rougit sur le défaut d'origine (les portails montés sur une seule
    /// surface) ET sur sa récidive (un neuvième sélecteur ajouté sans lecteur).
    func test_chaqueSelecteurDuMeuble_estMonteAuDessusDeLAiguillage() throws {
        let code = try hostSource()
        guard let portails = declarationBody(startingAt: "var surfaceWithIntakePortals: some View",
                                            in: code) else {
            return XCTFail("Les portails doivent vivre dans `surfaceWithIntakePortals` — la vue qui "
                           + "enveloppe l'AIGUILLAGE, pas une surface. C'est là que le défaut se ferme.")
        }
        let compacte = compact(portails)
        XCTAssertTrue(compacte.contains("surface"),
                      "Le bloc lu n'enveloppe pas l'aiguillage — la garde ne mesurerait RIEN.")

        for etat in declaredPresentationStates(in: code).sorted() {
            XCTAssertTrue(
                compacte.contains("isPresented:$\(etat)"),
                "`\(etat)` est POSÉ par un handler du meuble et n'a aucun lecteur au-dessus de "
                    + "l'aiguillage : sur toute surface qui n'est pas celle qui le monte, le contrôle "
                    + "qui l'écrit est INERTE."
            )
        }
    }

    /// L'autre moitié, et elle est ce qui empêche le retour du défaut : la
    /// surface DOCUMENT ne monte plus aucun portail. Tant qu'elle en garde un,
    /// la règle « un portail appartient au meuble » est fausse quelque part.
    func test_laSurfaceDocument_neMonteAucunPortail() throws {
        let code = try hostSource()
        guard let document = declarationBody(startingAt: "var documentSurface: some View",
                                             in: code) else {
            return XCTFail("`documentSurface` est introuvable — la garde doit être re-pointée")
        }
        let compacte = compact(document)
        XCTAssertTrue(compacte.contains("ComposerDocumentSurface("),
                      "Le bloc lu n'est pas celui de la surface document.")
        for interdit in ["isPresented:$shows", ".photosPicker(", ".fileImporter("] {
            XCTAssertFalse(compacte.contains(interdit))
        }
    }

    /// **Le contrôle de découvrabilité tombait par le même trou.** Poser un lieu
    /// depuis la scène n'affichait ni le contrôle ni le moyen de retirer le
    /// lieu — le `safeAreaInset` vivait, lui aussi, sur la seule surface
    /// document.
    func test_leControleDeDecouvrabilite_estMonteAuDessusDeLAiguillage() throws {
        let code = try hostSource()
        guard let portails = declarationBody(startingAt: "var surfaceWithIntakePortals: some View",
                                            in: code) else {
            return XCTFail("`surfaceWithIntakePortals` est introuvable")
        }
        XCTAssertTrue(compact(portails).contains("NearbyDiscoverabilityControl("),
                      "Un lieu posé depuis la scène doit pouvoir se retirer.")
    }

    /// Et le meuble monte bien la vue ENVELOPPÉE, pas l'aiguillage nu — sans
    /// quoi les portails existeraient sans être à l'écran.
    func test_leMeuble_monteLaVueEnveloppee() throws {
        let code = try hostSource()
        guard let corps = declarationBody(startingAt: "var body: some View", in: code) else {
            return XCTFail("Le `body` du meuble est introuvable")
        }
        let compacte = compact(corps)
        XCTAssertTrue(compacte.contains("socle"), "Le bloc lu n'est pas celui du body.")
        XCTAssertTrue(compacte.contains("surfaceWithIntakePortals"),
                      "Le body doit monter la vue qui porte les portails.")
    }

    // MARK: - #4467 — une SEULE feuille, et le nombre est la garde

    /// **Une règle de PLACEMENT ne dit rien du NOMBRE**, et c'est ce que
    /// l'inventaire ci-dessus ne pouvait pas dire.
    ///
    /// Il garantissait que chaque booléen de présentation est LU au-dessus de
    /// l'aiguillage — vrai, utile, et insuffisant : huit `.sheet(isPresented:)`
    /// y ont coexisté, chacun parfaitement placé. SwiftUI n'en supporte qu'une
    /// par vue ; deux booléens vrais dans la même transaction ont **terminé le
    /// process** trois fois au simulateur.
    ///
    /// Ce témoin est celui qui aurait attrapé le défaut : il ne regarde pas où
    /// sont les feuilles, il les COMPTE.
    func test_leMeuble_neMonteQuUneSeuleFeuille() throws {
        let code = try hostSource()
        let feuilles = code.components(separatedBy: ".sheet(").count - 1
        XCTAssertLessThanOrEqual(
            feuilles, 1,
            "SwiftUI ne présente qu'UNE feuille par vue. \(feuilles) modificateurs `.sheet` sur "
                + "l'unité du meuble : dès que deux s'activent dans la même transaction, la "
                + "configuration devient invalide et le process est TERMINÉ (#4467)."
        )
    }

    /// Et cette feuille est pilotée par un ITEM, jamais par un booléen : c'est
    /// ce qui rend l'état invalide irreprésentable plutôt que seulement rare.
    func test_laFeuilleUnique_estPiloteeParUnItem() throws {
        let code = compact(try hostSource())
        XCTAssertTrue(code.contains(".sheet(item:$presentedPortal)"))
        XCTAssertFalse(code.contains(".sheet(isPresented:"),
                       "Un booléen par feuille laisse deux feuilles s'ouvrir ensemble ; "
                        + "un item ne porte qu'une valeur.")
    }

    /// **Le `switch` du portail est EXHAUSTIF** — un neuvième cas ne compile pas
    /// tant qu'il n'a pas dit ce qu'il montre. Même discipline que les portes du
    /// rail, appliquée à la présentation.
    func test_chaquePortail_aSaFeuille() throws {
        let code = compact(try hostSource())
        for portail in ComposerPortal.allCases {
            XCTAssertTrue(code.contains("case.\(portail.rawValue):"),
                          "Le portail `\(portail.rawValue)` n'a aucune feuille montée.")
        }
    }

}
