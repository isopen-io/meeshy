import XCTest
@testable import Meeshy

/// **Chaque maillon de la chaîne du composer est effacé À SA DÉCLARATION.**
///
/// Le crash mesuré (`F22F88B0-…`, device iPhone 16 Pro Max, 2026-09-03 17:29,
/// `appBuildVersion 1800`) est un débordement de pile — `signal 11`,
/// `exceptionType 1`, `exceptionCode 2`, l'adresse fautive DANS la page de
/// garde d'une pile de 1008 Ko :
///
///     ---> Stack Guard  16f430000-16f434000 [ 16K] ---/rwx
///          Stack        16f434000-16f530000 [1008K]
///
/// La pile symbolisée nomme le coupable sans ambiguïté :
///
///     MeeshyApp.$main()
///       → ConversationFirstRenderWarmup.performWarmup()        (:136)
///       → ConversationView.body → bodyWithSheets → bodyWithCovers
///       → bodyWithLifecycle → bodyContent                     (:2044)
///       → closure #44 in bodyContent                          (:1983)
///       → ConversationView.themedComposer.getter
///       → __swift_instantiateConcreteTypeFromMangledNameV2
///       → 40 trames du décodeur récursif de métadonnées Swift  → CRASH
///
/// **Pourquoi le découpage de 2026-08-16 n'a pas suffi.** Il a scindé la
/// propriété en quatre maillons — mais les trois fonctions étaient
/// GÉNÉRIQUES (`<Content: View>(_ content: Content) -> some View`). Composées
/// en une seule expression,
///
///     composerEditingCovers(composerStickerSheet(composerPickersAndSheets(composerCore)))
///
/// leurs types opaques se re-nichent intégralement : le mangled name unique et
/// géant que le découpage prétendait avoir supprimé se reformait dans le
/// getter de `themedComposer`. **Découper des PROPRIÉTÉS ne découpe pas le
/// TYPE ; seule la frontière `AnyView` le fait.**
///
/// > `AnyView` posé chez l'APPELANT ne borne rien : le getter matérialise
/// > quand même le type concret de son argument, à sa propre profondeur de
/// > pile. Ce qui borne est l'effacement à la DÉCLARATION de chaque maillon —
/// > la leçon payée par six `AnyView` successifs sur la chaîne du header entre
/// > le 2026-07-30 et le 2026-08-17, qui ont déplacé le crash de maillon en
/// > maillon sans jamais le faire disparaître.
///
/// Cette garde est une garde de SOURCE parce que la grandeur qu'elle protège
/// est une SIGNATURE. Elle ne remplace pas la vérification sur appareil réel :
/// le simulateur a 8 Mo de pile contre 1008 Ko sur device, il est
/// structurellement aveugle à cette classe de défaut.
final class ConversationComposerChainErasureSourceGuardTests: XCTestCase {

    private static let chainPath =
        "Meeshy/Features/Main/Views/ConversationView+Composer.swift"

    /// Les maillons de la chaîne, dans l'ordre où `themedComposer` les compose.
    private static let links = [
        "composerCore",
        "composerPickersAndSheets",
        "composerStickerSheet",
        "composerEditingCovers",
    ]

    private func chainSource() throws -> String {
        let source = try AppSourceGuard.unit(Self.chainPath)
        XCTAssertFalse(source.isEmpty, "Source de la chaîne du composer introuvable")
        return AppSourceGuard.stripComments(source)
    }

    func test_themedComposer_estEffacee() throws {
        let source = try chainSource()
        XCTAssertTrue(
            source.contains("var themedComposer: AnyView"),
            "`themedComposer` doit être déclarée `AnyView` — c'est la frontière que voit `bodyContent`."
        )
    }

    func test_chaqueMaillon_rendAnyView() throws {
        let source = try chainSource()
        for link in Self.links {
            let asProperty = source.contains("var \(link): AnyView")
            let asFunction = source.contains("func \(link)(_ content: AnyView) -> AnyView")
            XCTAssertTrue(
                asProperty || asFunction,
                """
                Le maillon `\(link)` n'est pas effacé à sa déclaration. Il doit être \
                soit `var \(link): AnyView`, soit \
                `func \(link)(_ content: AnyView) -> AnyView`. Sans cette frontière, \
                son type opaque se niche dans celui de son appelant et le getter de \
                `themedComposer` matérialise à nouveau le type COMPOSÉ des quatre \
                maillons — le débordement de pile de 1008 Ko mesuré sur device.
                """
            )
        }
    }

    func test_aucunMaillon_nEstGeneriqueSurSonContenu() throws {
        let source = try chainSource()
        for link in Self.links {
            XCTAssertFalse(
                source.contains("func \(link)<"),
                """
                Le maillon `\(link)` est GÉNÉRIQUE sur son contenu. C'est \
                précisément ce qui laisse les types opaques se re-nicher quand les \
                maillons sont composés en une expression : le paramètre doit être \
                `AnyView`, pas `Content: View`.
                """
            )
        }
    }
}
