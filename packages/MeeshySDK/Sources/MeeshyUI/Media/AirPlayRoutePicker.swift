import SwiftUI
import AVKit

/// SwiftUI wrapper autour de `AVRoutePickerView` (UIKit). Au tap, ouvre le
/// picker système iOS pour AirPlay / Bluetooth speaker / etc.
///
/// Utilisé par `_FullscreenOverlayControls` quand `controls.contains(.airplay)`,
/// et par les plein écrans audio des apps consommatrices (public : atome pur,
/// paramètres opaques, pas d'orchestration produit).
public struct AirPlayRoutePicker: UIViewRepresentable {
    let tintColor: UIColor
    let prioritizesVideoDevices: Bool

    public init(tintColor: UIColor = .white, prioritizesVideoDevices: Bool = true) {
        self.tintColor = tintColor
        self.prioritizesVideoDevices = prioritizesVideoDevices
    }

    public func makeUIView(context: Context) -> AVRoutePickerView {
        let view = AVRoutePickerView()
        view.tintColor = tintColor
        view.activeTintColor = tintColor
        view.prioritizesVideoDevices = prioritizesVideoDevices
        return view
    }

    public func updateUIView(_ uiView: AVRoutePickerView, context: Context) {
        uiView.tintColor = tintColor
        uiView.activeTintColor = tintColor
        uiView.prioritizesVideoDevices = prioritizesVideoDevices
    }
}
