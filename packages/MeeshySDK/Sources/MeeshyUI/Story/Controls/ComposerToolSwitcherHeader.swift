import SwiftUI
import MeeshySDK

/// En-tête de navigation partagé des panneaux d'outils du composer : `‹ {Outil}`
/// à gauche (retour) + chips de switch direct vers les autres éditeurs à droite
/// (scroll horizontal). Source de vérité unique pour le chrome « comme les autres »
/// — réutilisé par `ComposerToolPanelHost` (band des autres outils) ET par la
/// bande dessin redimensionnable (`DrawingBand`), pour un chrome identique.
struct ComposerToolSwitcherHeader: View {
    let currentTool: StoryToolMode
    let onBack: () -> Void
    let onSwitch: (StoryToolMode) -> Void

    @Environment(\.colorScheme) private var colorScheme

    private var primaryText: Color { colorScheme == .dark ? .white : MeeshyColors.indigo950 }
    private var secondaryText: Color { (colorScheme == .dark ? Color.white : MeeshyColors.indigo950).opacity(0.78) }
    private var mutedText: Color { (colorScheme == .dark ? Color.white : MeeshyColors.indigo950).opacity(0.55) }

    var body: some View {
        HStack(spacing: 8) {
            backButton
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(otherTools, id: \.rawValue) { other in
                        switchChip(for: other)
                    }
                }
            }
        }
    }

    private var backButton: some View {
        Button(action: onBack) {
            HStack(spacing: 4) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 14, weight: .semibold))
                Text(Self.title(for: currentTool)).font(.system(size: 14, weight: .semibold))
            }
        }
        .foregroundColor(primaryText)
        .buttonStyle(.plain)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(.ultraThinMaterial, in: Capsule())
        .accessibilityLabel(String(localized: "story.composer.tool.back", defaultValue: "Retour", bundle: .module))
        .accessibilityHint(Self.title(for: currentTool))
    }

    private func switchChip(for other: StoryToolMode) -> some View {
        Button {
            onSwitch(other)
            HapticFeedback.light()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: Self.icon(for: other))
                    .font(.system(size: 11, weight: .semibold))
                Text(Self.title(for: other))
                    .font(.system(size: 12, weight: .medium))
            }
            .foregroundColor(secondaryText)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(
                Capsule()
                    .fill(colorScheme == .dark
                          ? Color.white.opacity(0.08)
                          : MeeshyColors.indigo950.opacity(0.06))
            )
            .overlay(Capsule().stroke(mutedText.opacity(0.25), lineWidth: 0.5))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Self.title(for: other))
        .accessibilityHint(String(localized: "story.composer.tool.switch.hint", defaultValue: "Ouvre l'éditeur", bundle: .module))
    }

    /// Tous les éditeurs SAUF celui couramment ouvert. Ordre stable depuis
    /// `StoryToolMode.allCases` (media, drawing, text, texture, filters, timeline).
    private var otherTools: [StoryToolMode] {
        StoryToolMode.allCases.filter { $0 != currentTool }
    }

    // MARK: - Tool icon / title (source de vérité unique pour le chrome composer)

    static func icon(for tool: StoryToolMode) -> String {
        switch tool {
        case .media:    return "play.rectangle.fill"
        case .audio:    return "music.note"
        case .drawing:  return "pencil.tip"
        case .text:     return "textformat"
        case .texture:  return "paintpalette.fill"
        case .filters:  return "camera.filters"
        case .timeline: return "clock"
        }
    }

    static func title(for tool: StoryToolMode) -> String {
        switch tool {
        case .media:    return "Médias"
        case .audio:    return "Son"
        case .drawing:  return "Dessin"
        case .text:     return "Texte"
        case .texture:  return "Fond"
        case .filters:  return "Effets"
        case .timeline: return "Timeline"
        }
    }
}
