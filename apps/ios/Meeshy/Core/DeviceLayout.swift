import SwiftUI
import UIKit

enum DeviceLayout {
    static var isPad: Bool {
        UIDevice.current.userInterfaceIdiom == .pad
    }

    static func isRegular(_ sizeClass: UserInterfaceSizeClass?) -> Bool {
        sizeClass == .regular
    }

    static func bubbleMaxWidth(containerWidth: CGFloat, sizeClass: UserInterfaceSizeClass?) -> CGFloat {
        let ratio: CGFloat = sizeClass == .regular ? 0.62 : 0.70
        let cap: CGFloat = sizeClass == .regular ? 560 : .infinity
        return min(containerWidth * ratio, cap)
    }

    static func sheetMaxHeight(screenHeight: CGFloat, sizeClass: UserInterfaceSizeClass?) -> CGFloat {
        if sizeClass == .regular {
            return min(screenHeight * 0.72, 720)
        }
        return screenHeight * 0.85
    }

    static func pickerSheetHeight(screenHeight: CGFloat, sizeClass: UserInterfaceSizeClass?) -> CGFloat {
        if sizeClass == .regular {
            return min(screenHeight * 0.55, 640)
        }
        return screenHeight * 0.65
    }
}

extension View {
    /// Applies sensible presentation detents on iPad form-sheet contexts.
    /// On compact (iPhone) returns the view unchanged so existing sheet
    /// layouts (which often manage their own heights) remain in control.
    @ViewBuilder
    func adaptivePresentationDetents(_ detents: Set<PresentationDetent> = [.medium, .large]) -> some View {
        if #available(iOS 16.0, *) {
            self.presentationDetents(detents)
        } else {
            self
        }
    }
}
