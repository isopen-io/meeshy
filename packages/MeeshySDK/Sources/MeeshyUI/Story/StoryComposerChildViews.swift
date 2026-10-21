import SwiftUI
import UIKit
import os
import PhotosUI
import UniformTypeIdentifiers
import AVFoundation
import MeeshySDK

// MARK: - Media Pill Label (extracted for Sendable conformance)

struct MediaPillLabel: View {
    let icon: String
    let text: String
    var destructive: Bool = false

    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        // Le bandeau composer a un fond opaque adaptatif (blanc en light,
        // indigo950 en dark). Les pills hardcodés en `.white` étaient
        // invisibles sur fond clair (blanc sur blanc). On adapte foreground
        // et background fill au mode.
        let fgBase: Color = colorScheme == .dark ? .white : MeeshyColors.indigo950
        let foreground: Color = destructive ? MeeshyColors.error : fgBase.opacity(0.88)
        let bgFill: Color = destructive
            ? MeeshyColors.error.opacity(0.15)
            : fgBase.opacity(0.10)
        let strokeColor: Color = destructive
            ? MeeshyColors.error.opacity(0.35)
            : fgBase.opacity(0.18)

        return HStack(spacing: 5) {
            Image(systemName: icon).font(.system(size: MeeshyIconSize.xs, weight: .medium))
            Text(text).font(.system(size: MeeshyFont.footnoteSize, weight: .medium))
        }
        .foregroundColor(foreground)
        .padding(.horizontal, MeeshySpacing.smPlus).padding(.vertical, 7)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                .fill(bgFill)
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                        .stroke(strokeColor, lineWidth: MeeshyBorder.hairline)
                )
        )
    }
}
