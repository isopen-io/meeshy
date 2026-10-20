import SwiftUI

// MARK: - Adaptive wide sheet

/// iPadOS presents `.sheet`s as a narrow form-sheet card, which leaves profile and comment modals feeling cramped.
/// iOS 18 added `presentationSizing(.page)` to request the larger page-sized container. The decision follows the
/// size class of the window that PRESENTS the sheet (`meeshySheet` hands it down), never the device kind: an iPad
/// in Slide Over is as narrow as an iPhone, and an iPhone Pro Max in landscape is as wide as a small iPad.
/// Where the presenter is unknown (a plain `.sheet`), the page request is made and the system ignores it at compact
/// width.
struct AdaptiveWideSheetModifier: ViewModifier {
    @Environment(\.meeshySheetHostSizeClass) private var hostSizeClass
    let width: MeeshySheetWidth

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 18.0, *),
           width.requestsPageSizing(hostSizeClass: hostSizeClass, inSheetSizeClass: nil, pageSizingAvailable: true) {
            content.presentationSizing(.page)
        } else {
            content
        }
    }
}

public extension View {
    func adaptiveWideSheet() -> some View {
        modifier(AdaptiveWideSheetModifier(width: .wide))
    }
}
