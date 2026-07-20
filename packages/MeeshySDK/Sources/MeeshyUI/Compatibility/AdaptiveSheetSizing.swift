import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

// MARK: - Adaptive wide sheet (iPad / macOS)

/// On iPad / macOS the system presents `.sheet`s as a narrow form-sheet card,
/// which leaves profile and comment modals feeling cramped. iOS 18 added
/// `presentationSizing(.page)` to request the larger page-sized container; this
/// wrapper applies it ONLY on iPad and ONLY on iOS 18+, leaving iPhone and older
/// OSes byte-for-byte unchanged (their presentation detents still drive height).
public extension View {
    @ViewBuilder
    func adaptiveWideSheet() -> some View {
        #if canImport(UIKit)
        if #available(iOS 18.0, *), UIDevice.current.userInterfaceIdiom == .pad {
            self.presentationSizing(.page)
        } else {
            self
        }
        #else
        self
        #endif
    }
}
