import XCTest
@testable import Meeshy

@MainActor
final class CallDetailRoutingTests: XCTestCase {

    private func source(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/\(path)")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// **Le geste a été INVERSÉ le 2026-08-24** : l'appui long RAPPELLE, le
    /// tap ne fait plus rien.
    ///
    /// Le correctif « pocket-dial » du 2026-07-03 protégeait le tap contre un
    /// appui long qui le déclenchait AUSSI. Cette protection n'a plus d'objet :
    /// il n'y a plus de tap du tout. La conclusion de cet audit, elle, est
    /// poussée à son terme — passer un appel est l'action la plus lourde du
    /// fil, sur la carte la plus large d'une liste qui défile ; elle exige un
    /// geste délibéré.
    func test_bubbleCallNoticeView_callsBackOnLongPressOnly_andNeverOnTap() throws {
        let view = try source("Features/Main/Views/Bubble/BubbleCallNoticeView.swift")
        XCTAssertTrue(
            view.contains(".onLongPressGesture(minimumDuration: 0.35)"),
            "rappeler exige un appui long délibéré"
        )
        XCTAssertFalse(
            view.contains("Button {\n                onCallBack?(summary)"),
            "aucun tap ne doit plus poser d'appel depuis la carte du fil"
        )
        XCTAssertFalse(
            view.contains("showDetails = true"),
            "BubbleCallNoticeView must no longer present its own local CallSummaryDetailSheet — " +
            "the long-press now routes through onLongPress to the shared decision point."
        )
    }

    /// Extrait le corps d'une closure en équilibrant ses accolades.
    ///
    /// La version précédente coupait à 700 caractères après l'ouverture. Des
    /// commentaires ajoutés en tête de closure ont fini par occuper toute la
    /// fenêtre : le test dénonçait une régression de routage alors que le code
    /// cherché se trouvait juste après la limite. Une closure se délimite par
    /// ses accolades, pas par un nombre de caractères arbitraire.
    private func closureBody(after marker: String, in source: String) -> String? {
        guard let open = source.range(of: marker) else { return nil }
        var depth = 1
        var index = open.upperBound
        while index < source.endIndex {
            let ch = source[index]
            if ch == "{" { depth += 1 }
            if ch == "}" {
                depth -= 1
                if depth == 0 { return String(source[open.upperBound..<index]) }
            }
            index = source.index(after: index)
        }
        return nil
    }

    /// **Recalibré — déplacé par `f9eb73d3` (« l'appui long élève la CELLULE
    /// VIVANTE, plus jamais une bulle reconstruite »), l'invariant est
    /// inchangé : l'appui long branche sur `callSummary`, jamais sur le
    /// `messageSource == .system` d'avant.**
    ///
    /// Ce commit a donné un SECOND paramètre à la fermeture — `focalPreview`,
    /// les pixels de la cellule vivante que l'overlay élève au lieu d'en
    /// reconstruire une. Le marqueur `onLongPress: { messageId in` ne
    /// désignait donc plus rien : le témoin échouait sur son `guard`, sans
    /// même avoir regardé le routage qu'il protège.
    ///
    /// **Et ça vient de se reproduire, à l'envers, le 2026-08-23** : la
    /// capture Focal a été RETIRÉE (elle tranchait en deux l'identité et la
    /// barre de méta de la cellule, à cheval sur son cadre), la signature est
    /// revenue à un seul paramètre, et le marqueur a de nouveau cessé de
    /// désigner quoi que ce soit. La leçon vaut donc dans les deux sens : un
    /// témoin qui épingle une SIGNATURE se périme à chaque paramètre ajouté
    /// ET à chaque paramètre retiré, alors que le routage qu'il protège n'a
    /// pas bougé d'un signe.
    ///
    /// Le marqueur suit la signature ; le corps recherché, lui, est inchangé
    /// mot pour mot. Même leçon que le passage de la fenêtre de 700 caractères
    /// à l'équilibrage d'accolades, documenté juste au-dessus : une garde qui
    /// épingle la FORME de la déclaration se périme au premier paramètre
    /// ajouté, alors que ce qu'elle protège n'a pas bougé d'un signe.
    func test_conversationView_onLongPress_branchesOnCallSummary_notMessageSourceSystem() throws {
        let view = try source("Features/Main/Views/ConversationView.swift")
        guard let body = closureBody(after: "onLongPress: { messageId in", in: view) else {
            XCTFail("ConversationView must define the onLongPress closure"); return
        }
        XCTAssertTrue(
            body.contains("msg.callSummary != nil"),
            "onLongPress must route call messages via callSummary != nil, not the old blanket " +
            "messageSource == .system no-op — plain system notices (no callSummary) still no-op."
        )
        XCTAssertTrue(
            body.contains("overlayState.callDetailMessage = msg"),
            "A call message's long-press must populate overlayState.callDetailMessage — a new, " +
            "separate property from detailSheetMessage (which stays wired to MessageMoreSheet)."
        )
    }
}
