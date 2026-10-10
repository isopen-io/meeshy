import SwiftUI
import MeeshySDK
import MeeshyUI

/// LA LIGNE DE RARETÉ D'UN SUCCÈS (#9390) — « Épique · 4 % des comptes » quand la rareté a le droit de se montrer
/// (20 titulaires, 1 000 comptes), « Rareté en cours de mesure » quand une entrée existe mais reste sous le seuil,
/// RIEN quand le serveur ne sert aucune entrée. Le nom est lu en toutes lettres : la couleur du liseré n'est jamais
/// la seule information. Le client est FAIL-CLOSED (conformité G-2) : une entrée sans comptes, ou sans rareté
/// mesurée, ne montre rien de plus — il ne devine jamais. Miroir de `apps/web/src/components/game-rarity.tsx`.
struct GameRarityLine: View {
    let entry: GameRarityEntry?

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        if let entry {
            if let rarity = entry.visibleRarity {
                let name = GameText.rarityName(rarity)
                let share = GameText.rarityShare(percent: GameWave2Format.rarityPercent(entry.sharePercent))
                Text(name + " · " + share)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                    .foregroundColor(theme.textMuted)
                    .accessibilityLabel(GameText.rarityAria(name: name, share: share))
            } else {
                Text(GameText.rarityMeasuring)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
        }
    }
}
