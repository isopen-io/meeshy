import XCTest
import SwiftUI
@testable import MeeshyUI

/// C6a — **la capture par appui long** sur la page blanche.
///
/// La page blanche portait déjà deux gestes : un TAP (ouvre l'éditeur de texte)
/// et un SWIPE VERS LE BAS (même destination, directive user 2026-07-31). Le
/// troisième arrive sur la même surface, qui couvre le canvas entier. Un appui
/// long qui cohabite avec un tap et un glisser sans DÉCLARER ses priorités a
/// deux issues, toutes deux vécues ailleurs dans ce dépôt : il vole le geste, ou
/// il ne se déclenche jamais.
///
/// Cette suite teste donc la RÈGLE DE PRIORITÉ **et la RÈGLE DE PORTÉE**, pas
/// seulement l'action :
///
/// | risque | ce qui l'empêche | test |
/// |---|---|---|
/// | l'appui long ouvre la caméra ET l'éditeur derrière | `highPriorityGesture`, jamais `simultaneousGesture` | `test_theLongPressTakesPrecedenceOverTheTap` |
/// | l'appui long sur « Photo » ouvre la caméra au lieu de la galerie | les gestes sont sur le FOND, les capsules sont AU-DESSUS | `test_theGesturesAnswerTheBackdrop_neverTheControlsTheyCover` |
/// | le doigt qui glisse reste candidat aux deux gestes | `maximumDistance` < `minimumDistance` du swipe | `test_theLongPressAbandonsBeforeTheSwipeEvenStarts` |
/// | sans caméra injectée, l'appui long mange le tap pour rien | masque `including:` | `test_theLongPressIsDisarmedWhenNoCameraCanAnswer` |
/// | la capsule et le geste divergent | une règle unique, lue par les deux | `test_theCapsuleAndTheLongPressReadTheSameRule` |
///
/// ## Pourquoi aucune de ces gardes ne cherche un littéral de forme
///
/// Quatre d'entre elles le faisaient, et la revue du 2026-08-23 les a toutes
/// contournées avec un simple retour à la ligne : `".simultaneousGesture(blank…"`,
/// `"minimumDistance: 20"`, `"including: offersCameraStarter ? .all : .subviews"`
/// ne survivent pas à un reformatage — donc elles ne protégeaient rien, elles
/// figeaient une mise en page. Elles comptent désormais des SYMBOLES NOMMÉS à
/// l'intérieur d'une région isolée par équilibrage de délimiteurs : le
/// formatage devient sans effet, et la mutation qu'elles visent redevient la
/// seule façon de les faire rougir.
@MainActor
final class StoryComposerCaptureLongPressTests: XCTestCase {

    /// Les quatre façons SwiftUI d'attacher un geste à une vue. Compter sur
    /// cette liste plutôt que sur une chaîne de forme est ce qui rend les
    /// gardes ci-dessous insensibles au formatage.
    private static let gestureAttachers = [
        "onTapGesture", "simultaneousGesture", "highPriorityGesture", ".gesture("
    ]

    private func canvasSource() throws -> String {
        try ComposerSourceGuard.source("StoryComposerView+Canvas.swift")
    }

    private func startersBody() throws -> String {
        try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "var blankCanvasStarters:", in: try canvasSource()),
            "Les amorces de page blanche ont disparu."
        )
    }

    private func gatedStarters() throws -> String {
        try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "if offersContentStarters", in: try startersBody()),
            "Le gate n'est plus structurel."
        )
    }

    /// Arguments d'un appel, isolés par ÉQUILIBRAGE DE PARENTHÈSES depuis son
    /// ouvrante. C'est ce qui remplace les littéraux : un argument reformaté,
    /// coupé sur trois lignes ou réordonné reste dans la même région, et seul un
    /// changement de SYMBOLE la fait rougir.
    private func callArguments(of call: String, in code: String) -> String? {
        guard call.hasSuffix("("), let start = code.range(of: call) else { return nil }
        var depth = 1
        var index = start.upperBound
        while index < code.endIndex {
            if code[index] == "(" { depth += 1 }
            if code[index] == ")" {
                depth -= 1
                if depth == 0 { return String(code[start.upperBound..<index]) }
            }
            index = code.index(after: index)
        }
        return nil
    }

    /// Le modificateur qui PORTE un geste, lu sans dépendre de la mise en forme :
    /// de tout ce qui précède le nom du geste, on retient l'attacheur le plus
    /// proche. `.highPriorityGesture(\n  blankCanvasCaptureLongPress` et
    /// `.highPriorityGesture(blankCanvasCaptureLongPress` donnent la même
    /// réponse — c'est exactement ce que la garde par littéral ne savait pas
    /// faire.
    private func attacher(of gesture: String, in code: String) throws -> String {
        let range = try XCTUnwrap(code.range(of: gesture), "« \(gesture) » n'est plus monté.")
        let prefix = code[code.startIndex..<range.lowerBound]
        let nearest = Self.gestureAttachers
            .compactMap { name -> (String, String.Index)? in
                guard let found = prefix.range(of: name, options: .backwards) else { return nil }
                return (name, found.lowerBound)
            }
            .max { $0.1 < $1.1 }
        return try XCTUnwrap(nearest?.0, "Aucun attacheur de geste ne précède « \(gesture) ».")
    }

    private func count(_ needle: String, in code: String) -> Int {
        ComposerSourceGuard.occurrences(of: needle, in: code)
    }

    // MARK: - Règle pure de l'offre de capture

    func test_captureIsOffered_whenTheAppInjectedACameraAndMediaFits() {
        XCTAssertTrue(StoryComposerView.offersCameraCapture(hasProvider: true, canAddMedia: true))
    }

    /// Sans fournisseur, `showCameraCapture` ouvrirait un cover dont le corps est
    /// vide — sans bouton de fermeture, et sans swipe-down (le composer est
    /// lui-même en `fullScreenCover`). C'est l'impasse que
    /// `presentedCameraCapture` a déjà transformée en garantie de type ; la règle
    /// d'offre ferme la porte un cran plus tôt.
    func test_captureIsWithheld_withoutAnInjectedCamera() {
        XCTAssertFalse(StoryComposerView.offersCameraCapture(hasProvider: false, canAddMedia: true))
    }

    func test_captureIsWithheld_onceTheMediaCeilingIsReached() {
        XCTAssertFalse(StoryComposerView.offersCameraCapture(hasProvider: true, canAddMedia: false))
    }

    // MARK: - Les priorités entre les trois gestes

    /// **En simultané, les deux gestes se reconnaissent.** `TapGesture` de
    /// SwiftUI n'a pas de plafond de durée, et un appui long se termine toujours
    /// par un relâchement : la caméra s'ouvrirait avec l'éditeur de texte
    /// derrière elle. `highPriorityGesture` fait échouer le tap dès que l'appui
    /// long réussit, et le laisse passer intact quand il échoue.
    ///
    /// Ancrée sur l'ATTACHEUR du geste, plus sur un littéral : la garde
    /// précédente cherchait `".simultaneousGesture(blankCanvasCaptureLongPress"`
    /// et un retour à la ligne entre la parenthèse et le nom suffisait à la
    /// rendre verte sur le code même qu'elle interdit.
    func test_theLongPressTakesPrecedenceOverTheTap() throws {
        let gated = try gatedStarters()

        XCTAssertEqual(
            count("blankCanvasCaptureLongPress", in: gated), 1,
            "Un seul point d'attache : deux le rendraient dépendant de l'ordre des modificateurs."
        )
        XCTAssertEqual(
            try attacher(of: "blankCanvasCaptureLongPress", in: gated), "highPriorityGesture",
            "En simultané, un appui long relâché ouvrirait la caméra ET l'éditeur de texte."
        )
    }

    /// **La règle de PORTÉE**, et c'est un défaut vécu : les capsules
    /// « Caméra », « Galerie » et « Coller » vivaient DANS la vue qui portait
    /// l'appui long, et `including: .all` fait primer un geste sur ceux de ses
    /// SOUS-VUES. Un appui long sur « Photo » ouvrait donc la caméra au lieu de
    /// la galerie.
    ///
    /// Aucun `GestureMask` ne corrige cela — il ordonne des priorités, il ne
    /// délimite pas une zone. Seule la superposition le fait : le fond porte les
    /// gestes, les contrôles sont posés PAR-DESSUS, et en `ZStack` la couche du
    /// dessus reçoit la touche.
    ///
    /// Rougit si les gestes retournent sur la couche des contrôles, si les
    /// contrôles redeviennent une sous-vue du fond (`.overlay { … }`), ou s'ils
    /// repassent DERRIÈRE lui.
    func test_theGesturesAnswerTheBackdrop_neverTheControlsTheyCover() throws {
        let gated = try gatedStarters()
        let layer = try XCTUnwrap(
            gated.range(of: "blankCanvasStarterContent"),
            "La couche des contrôles a disparu : les capsules seraient revenues sous les gestes."
        )
        let backdrop = String(gated[gated.startIndex..<layer.lowerBound])

        for attacher in Self.gestureAttachers {
            XCTAssertEqual(
                count(attacher, in: backdrop), count(attacher, in: gated),
                "« \(attacher) » est posé sur la couche des contrôles ou après elle : "
                    + "il répondrait aux capsules qu'il ne doit que recouvrir."
            )
        }
        XCTAssertGreaterThan(
            count("onTapGesture", in: backdrop), 0,
            "L'assertion de parité ci-dessus ne vaut que si le fond porte encore ses gestes."
        )
        XCTAssertEqual(
            count("blankCanvasStarterRow", in: gated), 0,
            "La rangée de capsules est remontée dans la région gestuelle : "
                + "l'appui long primerait de nouveau sur leurs propres gestes."
        )

        let attachment = backdrop.trimmingCharacters(in: .whitespacesAndNewlines)
        XCTAssertFalse(
            attachment.hasSuffix("{"),
            "Les contrôles sont le PREMIER enfant de la pile : ils passeraient DERRIÈRE le fond, "
                + "qui recevrait alors toutes leurs touches."
        )
        XCTAssertFalse(
            attachment.hasSuffix("."),
            "Les contrôles sont devenus un modificateur du fond (`.overlay`/`.background`) : "
                + "ils redeviennent ses SOUS-VUES, et `including: .all` prime de nouveau sur eux."
        )
    }

    /// Jumeau du précédent, vu depuis la couche des contrôles : elle ne porte
    /// AUCUN geste. Un seul suffirait à remettre les capsules sous une surface
    /// gestuelle pleine largeur.
    func test_theControlLayerCarriesNoGestureOfItsOwn() throws {
        let content = try XCTUnwrap(
            ComposerSourceGuard.functionBody(
                named: "private var blankCanvasStarterContent:", in: try canvasSource()),
            "La couche des contrôles a disparu."
        )

        for attacher in Self.gestureAttachers {
            XCTAssertEqual(
                count(attacher, in: content), 0,
                "« \(attacher) » sur la couche des contrôles : elle couvre le canvas entier, "
                    + "elle redeviendrait une surface gestuelle par-dessus les capsules."
            )
        }
        XCTAssertEqual(
            count("blankCanvasStarterRow", in: content), 1,
            "La rangée doit rester montée dans la couche des contrôles."
        )
    }

    /// La distance est la frontière entre « je maintiens » et « je glisse ».
    /// Égales, les deux gestes resteraient candidats en même temps et lequel
    /// gagne dépendrait du matériel.
    func test_theLongPressAbandonsBeforeTheSwipeEvenStarts() {
        XCTAssertLessThan(
            StoryComposerView.blankCanvasLongPressMaxDistance,
            StoryComposerView.blankCanvasSwipeMinDistance,
            "Un appui long toléré aussi loin que le swipe volerait le swipe-vers-le-bas."
        )
    }

    /// Les deux gestes lisent leurs constantes, ils ne les retapent pas. Un
    /// littéral remis dans l'un des deux rendrait le test ci-dessus vert en
    /// mesurant deux valeurs qui ne gouvernent plus rien.
    ///
    /// La garde interdit désormais TOUT chiffre dans les arguments des deux
    /// initialiseurs, au lieu de chercher `"minimumDistance: 20"` — qui laissait
    /// passer `minimumDistance:\n    20`, `minimumDistance: 20.0` et n'importe
    /// quelle autre valeur en dur.
    func test_bothGesturesReadTheirDistanceFromTheSharedConstants() throws {
        let code = try canvasSource()
        let swipe = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "private var blankCanvasTextSwipe:", in: code))
        let longPress = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "private var blankCanvasCaptureLongPress:", in: code))

        let dragArguments = try XCTUnwrap(callArguments(of: "DragGesture(", in: swipe),
                                          "Le swipe n'est plus un `DragGesture`.")
        let pressArguments = try XCTUnwrap(callArguments(of: "LongPressGesture(", in: longPress),
                                           "L'appui long n'est plus un `LongPressGesture`.")

        XCTAssertEqual(
            count("blankCanvasSwipeMinDistance", in: dragArguments), 1,
            "Le swipe doit lire la constante partagée, sinon la comparaison de priorité ne mesure rien."
        )
        XCTAssertNil(
            dragArguments.rangeOfCharacter(from: .decimalDigits),
            "Une distance en dur décorrèle le swipe de la règle de priorité : le test de "
                + "priorité comparerait alors deux constantes qui ne gouvernent plus le geste."
        )
        XCTAssertEqual(
            count("blankCanvasLongPressMaxDistance", in: pressArguments), 1,
            "L'appui long doit lire la MÊME constante que celle que le test compare."
        )
        XCTAssertEqual(
            count("blankCanvasLongPressDuration", in: pressArguments), 1,
            "La durée aussi : un seuil en dur ici ne serait plus lisible par personne."
        )
        XCTAssertNil(
            pressArguments.rangeOfCharacter(from: .decimalDigits),
            "Un seuil en dur dans l'appui long décorrèle les deux gestes de leur règle de priorité."
        )
    }

    /// Sans caméra injectée, l'appui long n'est pas seulement inutile : il
    /// resterait recevable et FERAIT ÉCHOUER LE TAP pendant sa durée, au profit
    /// de rien. Le masque le désarme sans toucher au tap, qui appartient au
    /// contenu (`.subviews`).
    ///
    /// Comptée sur des SYMBOLES dans les arguments de l'appel, et non sur le
    /// ternaire écrit d'un trait : `including:\n  offersCameraStarter ? .all : .subviews`
    /// est le même code et faisait rougir la garde précédente.
    func test_theLongPressIsDisarmedWhenNoCameraCanAnswer() throws {
        let arguments = try XCTUnwrap(
            callArguments(of: "highPriorityGesture(", in: try gatedStarters()),
            "L'appui long n'est plus attaché par `highPriorityGesture`."
        )

        XCTAssertEqual(
            count("offersCameraStarter", in: arguments), 1,
            "Le masque doit lire la règle d'offre : un appui long armé sans fournisseur "
                + "volerait le tap pour n'ouvrir que le vide."
        )
        XCTAssertEqual(
            count(".subviews", in: arguments), 1,
            "La branche désarmée a disparu : le geste resterait recevable sans caméra."
        )
        XCTAssertEqual(
            count(".all", in: arguments), 1,
            "La branche armée a disparu : l'appui long ne répondrait plus jamais."
        )
    }

    /// Extension de `test_theBlankCanvasStartersCarryNoGestureOutsideTheirGate`
    /// au troisième geste : sa garde d'origine ne connaît que `onTapGesture`,
    /// `simultaneousGesture` et `.gesture(`. Un `highPriorityGesture` posé hors
    /// du gate répondrait sur une page qui n'est plus blanche — la surface
    /// couvre le canvas entier.
    func test_theLongPressLivesInsideTheStructuralGate() throws {
        let body = try startersBody()
        let gated = try gatedStarters()

        XCTAssertEqual(
            count("highPriorityGesture", in: body), count("highPriorityGesture", in: gated),
            "L'appui long vit hors du gate : il répondrait sur une page qui n'est plus blanche."
        )
        XCTAssertGreaterThan(
            count("highPriorityGesture", in: gated), 0,
            "L'assertion de parité ci-dessus ne vaut que si le geste existe encore."
        )
    }

    // MARK: - Une règle, deux chemins

    /// La capsule « Caméra » et l'appui long offrent la MÊME capacité. Deux
    /// conditions retapées divergent tôt ou tard, et le jour où elles divergent,
    /// l'un des deux chemins ouvre un plein écran vide ou passe le plafond
    /// média. Garde négative : réécrire `storyCameraCapture != nil` dans la
    /// rangée la fait rougir.
    func test_theCapsuleAndTheLongPressReadTheSameRule() throws {
        let code = try canvasSource()
        // **L'adresse est l'UNITÉ des deux rangées depuis #4378.** « Coller » a
        // sa propre rangée (`blankCanvasPasteRow` de fait), et la capsule
        // « Caméra » vit dans `blankCanvasCaptureRow` : lire la seule
        // `blankCanvasStarterRow` faisait rougir la garde pour un membre
        // simplement DÉMÉNAGÉ. Les concaténer garde la mesure vraie quel que
        // soit le découpage — c'est la même parade qu'`AppSourceGuard.unit`
        // côté app.
        let starter = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "private var blankCanvasStarterRow:", in: code))
        let capture = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "private var blankCanvasCaptureRow:", in: code))
        let row = starter + "\n" + capture
        let longPress = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "private var blankCanvasCaptureLongPress:", in: code))

        XCTAssertEqual(
            count("offersCameraStarter", in: row), 1,
            "La capsule doit lire la règle partagée."
        )
        XCTAssertEqual(
            count("storyCameraCapture", in: row), 0,
            "La condition est retapée dans la rangée : elle peut désormais diverger de l'appui long."
        )
        XCTAssertEqual(
            count("offersCameraStarter", in: longPress), 1,
            "L'appui long doit lire la MÊME règle que la capsule."
        )
    }

    /// L'appui long n'invente pas de chemin de capture : il lève exactement le
    /// drapeau que la capsule lève, et le cover app-side fait le reste
    /// (`addCapturedMedia` → `insertForegroundImage` / `insertForegroundVideo`,
    /// extraits en leur temps POUR un futur point d'entrée caméra).
    func test_theLongPressRaisesTheSameFlagAsTheCapsule() throws {
        let code = try canvasSource()
        let longPress = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "private var blankCanvasCaptureLongPress:", in: code))

        XCTAssertEqual(
            count("showCameraCapture = true", in: longPress), 1,
            "Un second chemin de capture doublerait le cover et sa fermeture."
        )
    }
}
