import XCTest
import SwiftUI
import UIKit
import MeeshyUI
@testable import Meeshy

/// #8162 — le bloc de verre de Focal RENDU, clair et sombre, sur le runtime
/// qui exécute la suite : le vrai Liquid Glass sur iOS 26, le verre fait main
/// de MeeshyUI (`LiquidGlassFallbackRecipe`) sur iOS 16–25. Les images sont
/// jointes au résultat (`XCTAttachment`) : c'est la capture de recette, et la
/// garde refuse un verre qui ne se verrait pas.
@MainActor
final class FocalGlassRenderTests: XCTestCase {

    func test_glassBlock_isVisible_inLightAndDark_onThisRuntime() throws {
        for style in [UIUserInterfaceStyle.light, .dark] {
            let withGlass = try render(glass: true, style: style)
            let bare = try render(glass: false, style: style)
            XCTAssertNotEqual(withGlass.pngData(), bare.pngData(), "le verre (\(style == .dark ? "sombre" : "clair")) doit se voir sous le message")
            attach(withGlass, name: "focal-glass-\(style == .dark ? "sombre" : "clair")-iOS\(UIDevice.current.systemVersion)")
        }
    }

    // MARK: - Rendu

    private static let size = CGSize(width: 390, height: 360)

    private func render(glass: Bool, style: UIUserInterfaceStyle) throws -> UIImage {
        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first,
            "un rendu hors scène sort blanc : la fenêtre doit appartenir à la scène de l'hôte"
        )
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(origin: .zero, size: Self.size)
        window.overrideUserInterfaceStyle = style
        let host = UIHostingController(rootView: Scene(glass: glass))
        host.view.frame = window.bounds
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.2))
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        window.isHidden = true
        return image
    }

    private func attach(_ image: UIImage, name: String) {
        let attachment = XCTAttachment(image: image)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    /// Un fil minimal : des rangées voisines, et le message mis en avant posé
    /// sur le bloc de verre aux cotes partagées.
    private struct Scene: View {
        let glass: Bool
        @Environment(\.colorScheme) private var colorScheme

        var body: some View {
            let isDark = colorScheme == .dark
            VStack(alignment: .leading, spacing: 14) {
                row("Bonjour, tu as vu le message ?", isDark: isDark)
                ZStack(alignment: .topLeading) {
                    if glass {
                        FocalGlassBlock()
                    }
                    Text("This is literally the easiest way to build an AI agent. Zero code. You only need to run a couple of commands.")
                        .foregroundColor(MeeshyColors.textPrimary(isDark: isDark))
                        .padding(.horizontal, FocalMetrics.Row.paddingHorizontal)
                        .padding(.vertical, 12)
                }
                .frame(height: 140)
                row("Réponds quand tu peux.", isDark: isDark)
            }
            .padding(FocalScrollPerspective.focusCardHorizontalInset)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(isDark ? Color(hex: "#0F0D1F") : Color(hex: "#F5F3FF"))
        }

        private func row(_ text: String, isDark: Bool) -> some View {
            Text(text)
                .foregroundColor(MeeshyColors.textPrimary(isDark: isDark).opacity(FocalScrollPerspective.alphaFloor))
                .padding(.horizontal, FocalMetrics.Row.paddingHorizontal)
        }
    }
}
