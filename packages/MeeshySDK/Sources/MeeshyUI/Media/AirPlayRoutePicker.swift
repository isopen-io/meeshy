import SwiftUI
import AVKit

/// SwiftUI wrapper autour de `AVRoutePickerView` (UIKit). Au tap, ouvre le
/// picker système iOS pour AirPlay / Bluetooth speaker / etc.
///
/// Utilisé par `_FullscreenOverlayControls` quand `controls.contains(.airplay)`.
struct AirPlayRoutePicker: UIViewRepresentable {
    let tintColor: UIColor

    init(tintColor: UIColor = .white) {
        self.tintColor = tintColor
    }

    func makeUIView(context: Context) -> AVRoutePickerView {
        let view = AVRoutePickerView()
        view.tintColor = tintColor
        view.activeTintColor = tintColor
        view.prioritizesVideoDevices = true
        return view
    }

    func updateUIView(_ uiView: AVRoutePickerView, context: Context) {
        uiView.tintColor = tintColor
        uiView.activeTintColor = tintColor
    }
}
