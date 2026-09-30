import XCTest
import SwiftUI
import UIKit
@testable import Meeshy

/// **Un texte écrit par programme pose le curseur à SA fin** (#8791).
///
/// Depuis #7849, le champ de `UniversalComposerBar` porte sa sélection
/// (`TextField(text:selection:axis:)`, iOS 18+). Valider une mention remplace
/// `@al` par `@alice ` : l'hôte écrit le texte, la barre le recopie — et la
/// sélection gardait le point d'insertion de l'ANCIEN texte, que SwiftUI
/// replaçait dans le nouveau, au milieu du pseudo.
///
/// Le témoin est un rendu UIKit réel : on tape dans le vrai champ, l'hôte
/// écrit comme le fait la conversation (`composerText.text = …`), et on lit le
/// `selectedRange` de la vue texte — jamais le texte d'un modificateur.
@MainActor
final class ComposerCaretAfterProgrammaticWriteTests: XCTestCase {

    private final class Host: ObservableObject {
        @Published var draft = ""
        @Published var emoji = ""
    }

    private struct Harness: View {
        @ObservedObject var host: Host

        var body: some View {
            UniversalComposerBar(
                textBinding: $host.draft,
                onStartRecording: {},
                onStopRecordingToAttachment: {},
                onSendRecording: {},
                onCancelRecording: {},
                externalIsRecording: false,
                externalRecordingDuration: 0,
                injectedEmoji: $host.emoji
            )
            .frame(width: 402)
        }
    }

    private var window: UIWindow?

    override func tearDown() {
        window?.endEditing(true)
        window?.rootViewController = nil
        window?.isHidden = true
        window = nil
        super.tearDown()
    }

    private func render(_ host: Host) -> UIView {
        let size = CGSize(width: 402, height: 800)
        let controller = UIHostingController(rootView: Harness(host: host))
        let window = UIWindow(frame: CGRect(origin: .zero, size: size))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        self.window = window
        controller.view.frame = CGRect(origin: .zero, size: size)
        window.layoutIfNeeded()
        controller.view.layoutIfNeeded()
        return controller.view
    }

    private func textView(in root: UIView) -> UITextView? {
        if let field = root as? UITextView, field.isEditable { return field }
        for sub in root.subviews {
            if let found = textView(in: sub) { return found }
        }
        return nil
    }

    private func settle(until condition: () -> Bool = { false }, timeout: TimeInterval = 2) {
        let deadline = Date().addingTimeInterval(timeout)
        repeat {
            RunLoop.main.run(until: Date().addingTimeInterval(0.05))
        } while !condition() && Date() < deadline
        RunLoop.main.run(until: Date().addingTimeInterval(0.2))
    }

    private func caret(_ field: UITextView) -> Int? {
        field.selectedRange.length == 0 ? field.selectedRange.location : nil
    }

    private func focusedField(typing typed: String, host: Host) throws -> UITextView {
        let field = try XCTUnwrap(textView(in: render(host)), "champ du composer introuvable")
        XCTAssertTrue(field.becomeFirstResponder(), "le champ doit prendre le focus")
        settle()
        field.insertText(typed)
        settle(until: { host.draft == typed })
        XCTAssertEqual(host.draft, typed, "la frappe doit atteindre l'hôte")
        return field
    }

    func test_uneMentionValidee_poseLeCurseurEnFinDeTexte() throws {
        guard #available(iOS 18.0, *) else { throw XCTSkip("Le champ ne porte sa sélection qu'à partir d'iOS 18 (#7849).") }
        let host = Host()
        let field = try focusedField(typing: "Salut @al", host: host)

        host.draft = "Salut @alice "
        settle(until: { field.text == "Salut @alice " })

        XCTAssertEqual(field.text, "Salut @alice ")
        XCTAssertEqual(caret(field), ("Salut @alice " as NSString).length,
                       "le curseur doit suivre la mention validée, pas rester après « @al » (\(field.selectedRange))")
    }

    func test_unEmojiRapideAjoute_poseLeCurseurApresLui() throws {
        guard #available(iOS 18.0, *) else { throw XCTSkip("Le champ ne porte sa sélection qu'à partir d'iOS 18 (#7849).") }
        let host = Host()
        let field = try focusedField(typing: "Bravo", host: host)

        host.emoji = "🎉"
        settle(until: { field.text == "Bravo🎉" })

        XCTAssertEqual(field.text, "Bravo🎉")
        XCTAssertEqual(caret(field), ("Bravo🎉" as NSString).length,
                       "le curseur doit suivre l'emoji ajouté (\(field.selectedRange))")
    }

    func test_laFrappeAuMilieu_gardeSonCurseur() throws {
        guard #available(iOS 18.0, *) else { throw XCTSkip("Le champ ne porte sa sélection qu'à partir d'iOS 18 (#7849).") }
        let host = Host()
        let field = try focusedField(typing: "Salut", host: host)

        field.selectedRange = NSRange(location: 2, length: 0)
        settle()
        field.insertText("X")
        settle(until: { host.draft == "SaXlut" })

        XCTAssertEqual(host.draft, "SaXlut")
        XCTAssertEqual(caret(field), 3,
                       "une frappe au milieu du texte garde son curseur — seule une écriture par programme le renvoie en fin (\(field.selectedRange))")
    }
}
