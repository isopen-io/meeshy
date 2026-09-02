import XCTest

/// **Le son passe en TÊTE du rail** (#4508, arbitrage écrit le 2026-09-02).
///
/// La cible `2f.png` le place au-dessus de tout ; l'app le rendait en 5ᵉ
/// position. L'écart ne venait d'aucune règle — seulement de l'ordre dans lequel
/// les boutons ont été ajoutés au fil des lots.
///
/// La raison de l'arbitrage tient en une phrase, et elle vaut au-delà de ce
/// rail : **le son est le seul élément du rail qui décrit ce qui est en train de
/// SE PASSER ; tous les autres décrivent ce qu'on peut faire.** Un état se lit
/// en premier, une action s'atteint au pouce.
///
/// Ce témoin garde l'ORDRE et rien d'autre. Il ne dit pas quels boutons le rail
/// porte — c'est `StoryActionRailPlan` qui en décide, et la composition est
/// restée hors de ce lot (loi 1 : ce que l'app porte en plus de la maquette se
/// conserve).
final class StoryActionRailOrderGuardTests: XCTestCase {

    private static let sidebarPath = "Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift"

    private func sidebarSource() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.sidebarPath))
    }

    /// **Le témoin s'écrit sur les POSITIONS, jamais sur un numéro de
    /// commentaire.** Les blocs portaient « // 4. Mute/Unmute » : garder ce
    /// texte aurait mesuré la numérotation d'un commentaire — que
    /// `stripComments` retire, et qu'un renumérotage rendrait faux sans que
    /// l'ordre RÉEL ait bougé d'un pouce.
    func test_leSonEstMonteAvantToutesLesAutresActions() throws {
        let source = try sidebarSource()
        guard let corps = corpsDeSidebarContent(source) else {
            return XCTFail("`sidebarContent` introuvable — la garde ne mesurerait rien.")
        }
        guard let son = corps.range(of: "railPlan.showsSound") else {
            return XCTFail("Le bouton du son a quitté le rail — ce n'est plus une question d'ordre.")
        }
        for suivant in ["railPlan.showsReact", "railPlan.showsForward",
                        "railPlan.showsComments", "railPlan.showsTranslations"] {
            guard let autre = corps.range(of: suivant) else { continue }
            XCTAssertLessThan(
                son.lowerBound, autre.lowerBound,
                "Le son se monte AVANT `\(suivant)` : il dit ce qui se PASSE, les autres disent ce "
                    + "qu'on peut FAIRE (#4508)."
            )
        }
    }

    /// **Garde d'aveuglement.** Si `sidebarContent` est renommée ou déplacée, le
    /// témoin ci-dessus tomberait sur un `XCTFail` explicite plutôt que de
    /// passer au vert sur une chaîne absente. Celui-ci le dit tout court.
    func test_laGardeMesureBienLeRailEtPasLeVide() throws {
        let corps = corpsDeSidebarContent(try sidebarSource())
        XCTAssertNotNil(corps, "Le corps de `sidebarContent` doit être trouvable.")
        XCTAssertGreaterThan(corps?.count ?? 0, 2_000,
                             "Un corps minuscule signale une extraction : repointer la garde.")
    }

    private func corpsDeSidebarContent(_ source: String) -> String? {
        guard let debut = source.range(of: "private func sidebarContent(spacing: CGFloat) -> some View {") else {
            return nil
        }
        var profondeur = 0
        var resultat = ""
        for caractere in source[debut.lowerBound...] {
            resultat.append(caractere)
            if caractere == "{" { profondeur += 1 }
            if caractere == "}" {
                profondeur -= 1
                if profondeur == 0 { return resultat }
            }
        }
        return nil
    }
}
