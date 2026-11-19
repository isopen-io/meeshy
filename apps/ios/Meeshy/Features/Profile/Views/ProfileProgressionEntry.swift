import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Ma Légende » sous Mon activité (#5698, #19630, planche `Main`) : une carte qui se touche tout entière et mène au
/// tableau de bord Progression. Faite du kit : la rangée (K06) avec son médaillon (K45), la jauge vers le niveau
/// suivant (K42) et la ligne de ce qu'il manque. Sans donnée de jeu, la rangée garde sa phrase et ne porte aucune
/// jauge. La navigation est INJECTÉE (`action`) : cette vue ne connaît ni le routeur ni la route, le profil décide.
struct ProfileProgressionEntry: View {
    let summary: ProfileLegendSummary?
    let action: () -> Void

    var body: some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                MeeshyToggleRowFace(
                    content: MeeshyToggleRowContent(title: ProfileLegendCopy.title,
                                                    subtitle: ProfileLegendSummary.subtitle(for: summary),
                                                    accessory: .chevron),
                    leading: {
                        MeeshyMedallion(systemImage: "trophy.fill", kind: .warn, shape: .squircle, size: .s36)
                            .padding(.trailing, MeeshySpacing.md)
                    },
                    titleAccessory: { MeeshyToggleRowNoSlot() },
                    trailing: { MeeshyToggleRowNoSlot() }
                )
                if let summary, let progress = summary.progress {
                    MeeshyMeter(value: progress, label: ProfileLegendCopy.title,
                                spokenValue: summary.progressLine, startCaption: summary.progressLine)
                        .padding(.horizontal, MeeshySpacing.lg)
                        .padding(.bottom, MeeshySpacing.md)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg), tone: .theme)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ProfileLegendCopy.title)
        .accessibilityValue(ProfileLegendSummary.spokenValue(for: summary))
        .accessibilityAddTraits(.isButton)
    }
}

/// Les mots de « Ma Légende » sur la fiche.
enum ProfileLegendCopy {
    static var title: String {
        String(localized: "profile.progression.title", defaultValue: "Ma Légende", bundle: .main)
    }

    static var fallbackSubtitle: String {
        String(localized: "profile.progression.subtitle", defaultValue: "Médailles, niveau et Flamme", bundle: .main)
    }

    /// « Niveau 24 · rang Voix III », ou l'un des deux seul ; `nil` quand ni l'un ni l'autre n'a rien à dire.
    static func subtitle(level: String?, rank: String?) -> String? {
        switch (level, rank) {
        case (.some(let level), .some(let rank)):
            return String(localized: "profile.legend.level_rank", defaultValue: "Niveau \(level) · rang \(rank)", bundle: .main)
        case (.some(let level), .none):
            return String(localized: "profile.legend.level", defaultValue: "Niveau \(level)", bundle: .main)
        case (.none, .some(let rank)):
            return String(localized: "profile.legend.rank", defaultValue: "Rang \(rank)", bundle: .main)
        case (.none, .none):
            return nil
        }
    }
}
