import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **La barre collée au clavier et le panneau d'options sont des vues d'ENTRÉE
/// du champ en place** (#13839, L4) : le canvas les pose sur son champ, les
/// échange sans lâcher le premier répondant, et prévient l'hôte quand on touche
/// le texte pendant que les options remplacent le clavier.
@MainActor
final class StoryInlineEditInputLinkTests: XCTestCase {

    private func makeCanvas(text: String = "Salut") -> StoryCanvasUIView {
        let objet = StoryTextObject(id: "t1", text: text, x: 0.5, y: 0.5)
        let slide = StorySlide(id: "s1", effects: StoryEffects(textObjects: [objet]))
        let canvas = StoryCanvasUIView(slide: slide, mode: .edit)
        canvas.frame = CGRect(x: 0, y: 0, width: 390, height: 693)
        canvas.layoutIfNeeded()
        return canvas
    }

    func test_beginInlineTextEdit_withLink_attachesTheAccessoryToTheEditor() {
        let canvas = makeCanvas()
        let link = StoryInlineEditInputLink()
        let barre = UIView()
        link.accessoryView = barre
        canvas.inlineEditInputLink = link

        canvas.beginInlineTextEdit(textId: "t1")

        XCTAssertTrue(canvas.inlineEditor?.inputAccessoryView === barre,
                      "La barre de style se colle au clavier du champ en place")
        XCTAssertNil(canvas.inlineEditor?.inputView, "Au départ, c'est le clavier système qui sert")
    }

    func test_linkInputView_changedWhileEditing_swapsTheEditorInputView() {
        let canvas = makeCanvas()
        let link = StoryInlineEditInputLink()
        canvas.inlineEditInputLink = link
        canvas.beginInlineTextEdit(textId: "t1")
        let panneau = UIView()

        link.inputView = panneau
        XCTAssertTrue(canvas.inlineEditor?.inputView === panneau,
                      "Toucher une famille remplace le clavier par ses options, sans quitter le champ")
        XCTAssertEqual(canvas.inlineEditingTextId, "t1", "L'édition continue pendant les options")

        link.inputView = nil
        XCTAssertNil(canvas.inlineEditor?.inputView, "Rendre le clavier retire le panneau")
    }

    func test_linkSetAfterTheEditBegan_attachesItsViewsAtOnce() {
        let canvas = makeCanvas()
        canvas.beginInlineTextEdit(textId: "t1")
        let link = StoryInlineEditInputLink()
        let barre = UIView()
        link.accessoryView = barre

        canvas.inlineEditInputLink = link

        XCTAssertTrue(canvas.inlineEditor?.inputAccessoryView === barre)
    }

    func test_removingTheLink_detachesTheViews() {
        let canvas = makeCanvas()
        let link = StoryInlineEditInputLink()
        link.accessoryView = UIView()
        link.inputView = UIView()
        canvas.inlineEditInputLink = link
        canvas.beginInlineTextEdit(textId: "t1")

        canvas.inlineEditInputLink = nil

        XCTAssertNil(canvas.inlineEditor?.inputAccessoryView)
        XCTAssertNil(canvas.inlineEditor?.inputView)
    }

    func test_touchingTheEditor_notifiesTheLink() {
        let canvas = makeCanvas()
        let link = StoryInlineEditInputLink()
        var touches = 0
        link.onEditorTouched = { touches += 1 }
        canvas.inlineEditInputLink = link
        canvas.beginInlineTextEdit(textId: "t1")

        canvas.inlineEditor?.onTouched?()

        XCTAssertEqual(touches, 1, "Toucher le texte rend le clavier : l'hôte doit le savoir")
    }

    func test_replaceText_writesTheFieldAndTellsTheModel() {
        let canvas = makeCanvas(text: "Salut @ar")
        let link = StoryInlineEditInputLink()
        var ecrits: [(String, String)] = []
        canvas.onInlineTextChanged = { ecrits.append(($0, $1)) }
        canvas.inlineEditInputLink = link
        canvas.beginInlineTextEdit(textId: "t1")

        link.replaceText("Salut @arthur ")

        XCTAssertEqual(canvas.inlineEditor?.text, "Salut @arthur ",
                       "Une mention choisie s'écrit dans le champ, qui est la source de vérité pendant la frappe")
        XCTAssertEqual(ecrits.last?.0, "t1")
        XCTAssertEqual(ecrits.last?.1, "Salut @arthur ")
    }

    func test_replaceText_outsideAnEdit_writesNothing() {
        let canvas = makeCanvas()
        let link = StoryInlineEditInputLink()
        var ecrits = 0
        canvas.onInlineTextChanged = { _, _ in ecrits += 1 }
        canvas.inlineEditInputLink = link

        link.replaceText("rien")

        XCTAssertEqual(ecrits, 0)
    }
}
