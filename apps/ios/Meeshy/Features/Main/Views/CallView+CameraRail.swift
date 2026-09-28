import SwiftUI
import MeeshyUI

extension CallView {
    var isMyImageFullScreen: Bool {
        CallCameraRail.isMyImageFullScreen(
            isGroupStage: isGroupStage,
            isSelfFeatured: isSelfFeatured,
            isLocalPrimary: effectiveSwapStreams
        )
    }

    @ViewBuilder
    var cameraRail: some View {
        let actions = CallCameraRail.actions(from: currentActionSet)
        if isMyImageFullScreen && !actions.isEmpty {
            VStack(spacing: 10) {
                ForEach(actions, id: \.self) { action in
                    railActionButton(action)
                }
            }
            .background(CallCameraZoomAccessibilityElement())
            .padding(.vertical, 10)
            .padding(.horizontal, 6)
            .callChromeGlass(in: Capsule())
            .accessibilityElement(children: .contain)
            .accessibilityLabel(CallControlsCopy.cameraRail)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
            .padding(.trailing, 12)
            .callChromeVisibility(CallCameraRail.isShown(isMyImageFullScreen: true, chrome: chromeVisibility))
            .transition(.opacity)
        }
    }
}
