import SwiftUI

struct OverlayHost: ViewModifier {
    let crashReports: [CrashDiagnostic]
    @Binding var isCrashSheetPresented: Bool

    func body(content: Content) -> some View {
        content
            .feedbackToastOverlay()
            .ageGateOverlay()
            .modifier(TalkieOverlay(center: .shared))
            .bringRingOverlay()
            .sheet(isPresented: $isCrashSheetPresented) {
                CrashReportSheet(reports: crashReports)
            }
    }
}
