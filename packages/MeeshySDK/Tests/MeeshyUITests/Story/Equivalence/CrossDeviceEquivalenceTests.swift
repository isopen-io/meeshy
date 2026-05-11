import Testing
import CoreGraphics
import QuartzCore
import CoreMedia
@testable import MeeshyUI
@testable import MeeshySDK

@Suite("Cross-device equivalence — math invariant")
@MainActor
struct CrossDeviceEquivalenceTests {

    @Test("render(slide, iPhone) and render(slide, iPad) are linearly equivalent")
    func iPhone_iPad_linearlyEquivalent() {
        let slide = StoryFixtures.complexSlide()
        let geomPhone = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        let geomPad = CanvasGeometry(renderSize: CGSize(width: 820, height: 1456))

        let layerPhone = StoryRenderer.render(slide: slide, into: geomPhone, at: .zero, mode: .play)
        let layerPad = StoryRenderer.render(slide: slide, into: geomPad, at: .zero, mode: .play)

        let scaleRatio = geomPad.scaleFactor / geomPhone.scaleFactor

        #expect(layerPhone.sublayers?.count == layerPad.sublayers?.count)

        for (i, phoneSub) in (layerPhone.sublayers ?? []).enumerated() {
            let padSub = layerPad.sublayers![i]
            #expect(abs(padSub.frame.origin.x - phoneSub.frame.origin.x * scaleRatio) < 0.5)
            #expect(abs(padSub.frame.origin.y - phoneSub.frame.origin.y * scaleRatio) < 0.5)
            #expect(abs(padSub.frame.size.width - phoneSub.frame.size.width * scaleRatio) < 0.5)
            #expect(abs(padSub.frame.size.height - phoneSub.frame.size.height * scaleRatio) < 0.5)
            #expect(padSub.zPosition == phoneSub.zPosition)
        }
    }

    @Test("text fontSize scales linearly cross-device")
    func text_fontSize_scalesLinearly() {
        let slide = StoryFixtures.textOnlySlide(text: "Test", fontSize: 64, x: 0.5, y: 0.5)
        let geomPhone = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        let geomPad = CanvasGeometry(renderSize: CGSize(width: 820, height: 1456))

        let layerPhone = StoryRenderer.render(slide: slide, into: geomPhone, at: .zero, mode: .play)
        let layerPad = StoryRenderer.render(slide: slide, into: geomPad, at: .zero, mode: .play)

        guard let phoneText = layerPhone.sublayers?.first(where: { $0 is CATextLayer }) as? CATextLayer,
              let padText = layerPad.sublayers?.first(where: { $0 is CATextLayer }) as? CATextLayer else {
            Issue.record("CATextLayer not found in render output")
            return
        }

        let phoneFontSize = phoneText.fontSize
        let padFontSize = padText.fontSize
        let scaleRatio = geomPad.scaleFactor / geomPhone.scaleFactor
        #expect(abs(padFontSize - phoneFontSize * scaleRatio) < 0.5)
    }
}
