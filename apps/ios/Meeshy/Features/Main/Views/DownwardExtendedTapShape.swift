import SwiftUI

/// Content shape that extends a view's tappable region downward only,
/// leaving the top/leading/trailing edges untouched.
///
/// `Rectangle().inset(by: -N)` (the usual trick for enlarging a compact
/// label's touch target) grows the hit area on all four sides — for a
/// label sitting directly under wrapped text (tappable links/mentions),
/// that uniform growth bleeds upward into the sibling above it. This shape
/// grows only toward the empty space below the label instead, reaching the
/// same effective touch-target height without that risk.
struct DownwardExtendedTapShape: Shape {
    /// Extra height added below the view's own frame.
    var extraBottom: CGFloat

    func path(in rect: CGRect) -> Path {
        Path(CGRect(
            x: rect.minX,
            y: rect.minY,
            width: rect.width,
            height: rect.height + extraBottom
        ))
    }
}
