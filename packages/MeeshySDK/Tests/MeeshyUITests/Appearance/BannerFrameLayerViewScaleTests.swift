import XCTest
import UIKit
import MeeshySDK
@testable import MeeshyUI

@MainActor
final class BannerFrameLayerViewScaleTests: XCTestCase {

    private func design() throws -> BannerFrameDesign {
        let json = """
        {
          "key": "scale",
          "viewBox": [0, 0, 300, 100],
          "palette": ["#DCD2C0", "#A99B83", "#22262B", "#B8954F"],
          "border": { "width": 9.6, "color": 0, "opacity": 1, "filets": [] },
          "reach": { "corner": 14, "cartouche": { "width": 40, "depth": 16, "edge": "top" } },
          "pieces": [],
          "friezes": []
        }
        """
        return try JSONDecoder().decode(BannerFrameDesign.self, from: Data(json.utf8))
    }

    private func laidOut(scale: CGFloat) throws -> BannerFrameLayerView {
        let view = BannerFrameLayerView(frame: CGRect(x: 0, y: 0, width: 300, height: 100))
        view.configure(design: try design(), animates: false, scale: scale)
        view.layoutSubviews()
        return view
    }

    func test_configure_rendersTheStillAtTheInjectedScale() throws {
        let view = try laidOut(scale: 2)
        XCTAssertEqual(view.stillImage?.scale, 2)
    }

    func test_configure_aNewScaleAloneRerendersTheStill() throws {
        let view = try laidOut(scale: 2)
        view.configure(design: try design(), animates: false, scale: 3)
        view.layoutSubviews()
        XCTAssertEqual(view.stillImage?.scale, 3)
    }
}
