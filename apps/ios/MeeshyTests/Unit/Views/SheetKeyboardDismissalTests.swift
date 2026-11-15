import XCTest
import UIKit
@testable import Meeshy

/// #16880 — toute feuille présentée baisse d'abord le clavier ; une alerte et
/// les fenêtres système n'y sont pas soumises.
@MainActor
final class SheetKeyboardDismissalTests: XCTestCase {
    func test_dismissesKeyboard_forASheetFromTheAppWindow() {
        XCTAssertTrue(SheetKeyboardPolicy.dismissesKeyboard(presenting: UIHostingSheetStub(), fromWindowLevel: .normal))
    }

    func test_dismissesKeyboard_forAnActionSheet() {
        let sheet = UIAlertController(title: nil, message: nil, preferredStyle: .actionSheet)
        XCTAssertTrue(SheetKeyboardPolicy.dismissesKeyboard(presenting: sheet, fromWindowLevel: .normal))
    }

    func test_keepsKeyboard_forAnAlert() {
        let alert = UIAlertController(title: "t", message: nil, preferredStyle: .alert)
        XCTAssertFalse(SheetKeyboardPolicy.dismissesKeyboard(presenting: alert, fromWindowLevel: .normal))
    }

    func test_keepsKeyboard_whenPresentedFromASystemWindowAboveTheApp() {
        XCTAssertFalse(SheetKeyboardPolicy.dismissesKeyboard(presenting: UIHostingSheetStub(), fromWindowLevel: .alert))
    }

    func test_keepsKeyboard_whenThePresenterIsOffscreen() {
        XCTAssertFalse(SheetKeyboardPolicy.dismissesKeyboard(presenting: UIHostingSheetStub(), fromWindowLevel: nil))
    }

    func test_install_resignsTheFirstResponderBeforeASheetIsPresented() {
        SheetKeyboardDismissal.install()
        SheetKeyboardDismissal.install()
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
        let root = UIViewController()
        window.rootViewController = root
        window.makeKeyAndVisible()
        let field = UITextField()
        root.view.addSubview(field)
        XCTAssertTrue(field.becomeFirstResponder())

        root.present(UIHostingSheetStub(), animated: false)

        XCTAssertFalse(field.isFirstResponder)
        root.dismiss(animated: false)
        window.isHidden = true
    }
}

private final class UIHostingSheetStub: UIViewController {}
