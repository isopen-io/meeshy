import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Un bloc des Réglages, rendu depuis la loi** (#18589). Un bloc titré est
/// une carte (`SettingsSectionCard`) ; un bloc du pied, sans titre, empile ses
/// boutons. Le bloc ne sait rien de ses rangées : l'écran les lui fournit, et
/// lui seul tient l'état qu'elles écrivent.
struct SettingsBlockView<Row: View>: View {
    let block: SettingsBlock
    @ViewBuilder let row: (SettingsDestination) -> Row

    @ViewBuilder
    var body: some View {
        if let title = block.id.title {
            SettingsSectionCard(title: title, icon: block.id.icon, color: block.id.color, sentence: block.id.sentence, content: rows)
        } else {
            VStack(spacing: MeeshySpacing.xl) { rows }
        }
    }

    private var rows: some View {
        ForEach(block.destinations, id: \.self) { row($0) }
    }
}

/// **Une rangée qui ouvre une feuille** : le libellé de `SettingsRowContent`
/// et un chevron. Le toucher rend la main à l'écran, qui présente la feuille.
struct SettingsNavigationRow: View {
    let content: SettingsRowContent
    let action: () -> Void

    var body: some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            SettingsRowLabel(icon: content.icon, title: content.title, color: content.color, trailing: SettingsRowChevron())
        }
        .accessibilityLabel(content.accessibilityLabel)
        .accessibilityHint(content.hint)
    }
}

/// Le chevron d'une rangée qui mène ailleurs.
struct SettingsRowChevron: View {
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        Image(systemName: "chevron.forward")
            .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
            .foregroundStyle(theme.textMuted)
            .accessibilityHidden(true)
    }
}
