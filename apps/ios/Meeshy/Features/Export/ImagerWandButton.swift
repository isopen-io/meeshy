import SwiftUI
import MeeshyUI

struct ImagerWandButton: View {
    let hint: String
    var glyphSize: CGFloat = 17
    var tint: Color = .secondary
    let action: () -> Void
    var quick: (() -> Void)? = nil

    var body: some View {
        if let quick {
            wand.contextMenu {
                Button(action: quick) {
                    Label(MessageCardExportMenu.quickLabel, systemImage: MessageCardExportMenu.quickSymbol)
                }
            }
        } else {
            wand
        }
    }

    private var wand: some View {
        Button(action: action) {
            Image(systemName: FullscreenChromeSymbol.imager)
                .font(MeeshyFont.relative(glyphSize))
                .foregroundStyle(tint)
        }
        .frame(minWidth: 44, minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityLabel(MessageCardExportMenu.imageLabel)
        .accessibilityHint(hint)
        .accessibilityIdentifier("imager.wand")
    }
}
