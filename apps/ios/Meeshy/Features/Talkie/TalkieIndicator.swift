import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// L'indicateur d'un talkie reçu : qui parle, et UN geste pour le faire taire ICI. NON MODAL — le Bring prend l'écran,
/// le talkie jamais : il se pose en haut, sous la barre d'état, et l'app reste utilisable dessous. VoiceOver l'annonce.
struct TalkieIndicator: View {
    let speaker: TalkieSpeaker
    let onMute: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulsing = false

    private var isDark: Bool { colorScheme == .dark }

    private var name: String {
        speaker.name ?? String(localized: "talkie.incoming.someone", defaultValue: "Quelqu’un", bundle: .main)
    }

    private var title: String {
        String(format: String(localized: "talkie.incoming.title", defaultValue: "%@ vous parle", bundle: .main), name)
    }

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            Image(systemName: "waveform")
                .font(.headline)
                .foregroundStyle(MeeshyColors.brandPrimary)
                .opacity(pulsing ? 0.45 : 1)
                .accessibilityHidden(true)
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                .lineLimit(1)
            Spacer(minLength: MeeshySpacing.sm)
            Button(action: onMute) {
                Text(String(localized: "talkie.incoming.mute", defaultValue: "Couper", bundle: .main))
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(MeeshyColors.brandPrimary)
                    .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
            }
            .accessibilityLabel(String(
                format: String(localized: "talkie.incoming.muteNamed", defaultValue: "Couper la voix de %@", bundle: .main), name
            ))
            .accessibilityIdentifier("talkie.incoming.mute")
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .background(Capsule().fill(.ultraThinMaterial))
        .padding(.horizontal, MeeshySpacing.lg)
        .accessibilityElement(children: .contain)
        .onAppear {
            UIAccessibility.post(notification: .announcement, argument: title)
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true)) { pulsing = true }
        }
    }
}

struct TalkieOverlay: ViewModifier {
    @ObservedObject var center: TalkieCenter

    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if let speaker = center.active.first {
                TalkieIndicator(speaker: speaker) { center.mute(speaker.talkieId) }
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .id(speaker.id)
            }
        }
        .animation(.easeOut(duration: 0.2), value: center.active.first?.id)
    }
}

extension TalkieCenter {
    /// Le câblage de production : le seul endroit qui nomme les singletons.
    static let shared = TalkieCenter(
        sink: TalkieVoicePlayer(),
        people: CirclePeopleDirectory.shared,
        viewerId: { AuthManager.shared.currentUser?.id }
    )
}
