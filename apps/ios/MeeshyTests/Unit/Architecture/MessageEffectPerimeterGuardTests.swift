import XCTest
@testable import Meeshy

/// **Un effet de message épouse le MESSAGE, jamais la rangée.**
///
/// Mesuré en recette le 2026-09-23, mode Focal, effet Arc-en-ciel :
///
/// | état | liseré | message | verdict |
/// |---|---|---|---|
/// | avant | **355 pt** | 174 pt | plus de vide encadré que de contenu |
/// | après | **222 pt** | 166 pt | le cadre épouse le message |
///
/// ## Ce qui l'avait laissé passer
///
/// `FocalRow` posait `.messageEffects` sur les DEUX colonnes de la rangée, et
/// son commentaire le justifiait par « exactement le même périmètre que la
/// bulle historique », en citant `ThemedMessageBubble.swift:317`.
///
/// **Cette référence était périmée, et elle disait l'inverse.** Le site cité
/// porte aujourd'hui : « Pas de `.messageEffects` ici : monté à ce niveau, il
/// s'appliquait à tout l'espace vide jusqu'au bord de l'écran. Le liseré
/// arc-en-ciel encadrait donc du vide. » Le chemin bulle avait corrigé le
/// périmètre ; Focal gardait l'ancien en s'appuyant sur le correctif qui le
/// dément.
///
/// Une règle copiée PAR RÉFÉRENCE se périme quand la référence est corrigée,
/// et rien ne rougit — aucun test ne comparait les deux périmètres.
///
/// ## Le second piège, et pourquoi ce témoin regarde l'ORDRE
///
/// Déplacer l'effet sur `contentColumn` n'a pas suffi : cette colonne se
/// termine par `.frame(maxWidth: .infinity, alignment: .leading)`, posé
/// exprès pour que la date tienne la marge droite. **`.frame(maxWidth:)`
/// ÉTEND, il ne borne pas** — tout modificateur visuel monté APRÈS lui hérite
/// de la largeur de l'écran, pas de celle du contenu. Le liseré est passé de
/// 355 à 290 pt, toujours faux.
///
/// L'ordre est donc la règle, pas l'emplacement : l'effet se pose AVANT
/// l'étirement. C'est ce que ce témoin mesure.
final class MessageEffectPerimeterGuardTests: XCTestCase {

    private func appRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // …/Unit/Architecture
            .deletingLastPathComponent()  // …/Unit
            .deletingLastPathComponent()  // …/MeeshyTests
            .deletingLastPathComponent()  // …/apps/ios
            .appendingPathComponent("Meeshy")
    }

    private func source(at relativePath: String) throws -> String {
        try String(contentsOf: appRoot().appendingPathComponent(relativePath), encoding: .utf8)
    }

    private static let focalRow = "Features/Main/Focal/Row/FocalRow.swift"

    // MARK: - L'ordre : l'effet avant l'étirement

    func test_focalRow_poseLEffetAvantLEtirementDeLaColonne() throws {
        let code = try source(at: Self.focalRow)

        guard let effet = code.range(of: ".messageEffects(") else {
            return XCTFail("""
                `FocalRow` ne monte plus `.messageEffects` : un message à effet ne \
                porterait plus rien en Focal. Si l'effet a déménagé, mettre ce témoin \
                à jour avec son nouveau site — ne pas le supprimer.
                """)
        }
        guard let étirement = code.range(of: ".frame(maxWidth: .infinity, alignment: .leading)") else {
            return XCTFail("""
                L'étirement de `contentColumn` a disparu de `FocalRow`. Il tenait la \
                marge droite de la date ; s'il a changé de forme, vérifier que l'effet \
                reste posé AVANT lui et mettre ce témoin à jour.
                """)
        }

        XCTAssertTrue(
            effet.lowerBound < étirement.lowerBound,
            """
            `.messageEffects` est monté APRÈS `.frame(maxWidth: .infinity)` dans \
            `FocalRow`. `.frame(maxWidth:)` ÉTEND, il ne borne pas : l'effet épouse \
            alors la largeur de l'ÉCRAN et non celle du message. Mesuré le \
            2026-09-23 : 355 pt de liseré arc-en-ciel pour 174 pt de texte — plus de \
            vide encadré que de contenu. L'effet se pose AVANT l'étirement.
            """
        )
    }

    // MARK: - Le périmètre : jamais la rangée entière

    func test_focalRow_neMonteAucunEffetSurLaRangee() throws {
        let code = try source(at: Self.focalRow)
        // La rangée, c'est le `HStack` de `standardBody` qui tient les DEUX
        // colonnes. Un effet posé sur lui encadre la méta et tout le vide
        // jusqu'au bord — le défaut d'origine.
        guard let corps = code.range(of: "private var standardBody: some View") else {
            return XCTFail("`standardBody` a disparu de `FocalRow` — témoin à mettre à jour.")
        }
        guard let colonne = code.range(of: "private var contentColumn: some View") else {
            return XCTFail("`contentColumn` a disparu de `FocalRow` — témoin à mettre à jour.")
        }
        let entreLesDeux = code[corps.upperBound..<colonne.lowerBound]
        XCTAssertFalse(
            entreLesDeux.contains(".messageEffects("),
            """
            `.messageEffects` est monté dans `standardBody`, donc sur la RANGÉE — \
            les deux colonnes, méta comprise, et tout l'espace vide jusqu'au bord de \
            l'écran. C'est le périmètre que le chemin bulle a abandonné : voir \
            `ThemedMessageBubble`, « Pas de `.messageEffects` ici […] Le liseré \
            arc-en-ciel encadrait donc du vide. »
            """
        )
    }

    // MARK: - La bulle, qui sert de référence

    func test_labulle_garde_lEffetSurLaBulle_pasSurLaRangee() throws {
        let hôte = try source(at: "Features/Main/Views/ThemedMessageBubble.swift")
        XCTAssertFalse(
            hôte.contains(".messageEffects("),
            """
            `ThemedMessageBubble` monte de nouveau `.messageEffects`. À ce niveau il \
            couvre l'avatar, la bulle, les réactions et tout le vide jusqu'au bord — \
            c'est le défaut que ce site a corrigé une fois, et la référence sur \
            laquelle Focal s'aligne désormais.
            """
        )
        let bulle = try source(at: "Features/Main/Views/Bubble/BubbleStandardLayout.swift")
        XCTAssertTrue(
            bulle.contains(".messageEffects("),
            "`BubbleStandardLayout` ne monte plus l'effet : le mode Bulles perdrait ses effets de message."
        )
    }
}
