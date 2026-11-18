import SwiftUI
import MeeshySDK
import MeeshyUI

/// Mes langues au repos (planche `Main`) : une ligne de pastilles K41 sous ma bio, à lire seulement. La principale
/// porte le glyphe translate ; aucune pastille ne se touche.
struct ProfileLanguageChips: View {
    let languages: ProfilePrismLanguages

    private var chips: [ProfileLanguageChip] {
        ProfileLanguageChip.make(languages, locale: ProfileLanguageChip.interfaceLocale)
    }

    var body: some View {
        if !chips.isEmpty {
            FlowLayout(itemSpacing: MeeshySpacing.sm, lineSpacing: MeeshySpacing.sm) {
                ForEach(chips) { chip in
                    MeeshyBadge(.label(chip.name), leading: chip.isPrimary ? .systemImage("translate") : .none,
                                size: .s28)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(Text(verbatim: "\(ProfilePrismCopy.chipsLabel) : \(chips.map(\.name).joined(separator: ", "))"))
            .accessibilityIdentifier("profile.languages.chips")
        }
    }
}

/// « Langues du Prisme » en édition (planche `Moi-Edition`) : la liste K52, rangs numérotés et poignées. Glisser une
/// langue la change de rang, et les trois champs suivent tout de suite (l'enregistrement les envoie ensemble).
/// Toucher une langue rouvre le sélecteur sur son rang, pour la changer ou la retirer ; « Ajouter une langue » l'ouvre
/// sur le premier rang libre. Le K06 « Traduire automatiquement » reste sous la liste.
struct ProfilePrismLanguagesSection: View {
    @Binding var system: String
    @Binding var regional: String
    @Binding var custom: String
    let autoTranslate: Bool?
    let accentColor: String
    let onAutoTranslate: (Bool) -> Void

    @State private var picking: ProfilePrismRank?
    private var theme: ThemeManager { ThemeManager.shared }

    private var languages: ProfilePrismLanguages {
        ProfilePrismLanguages(system: system, regional: regional, custom: custom)
    }

    private var accent: Color { Color(hex: accentColor) }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfilePrismCopy.title, tint: accent, lead: { EmptyView() }, accessory: {
                Image(systemName: "translate")
                    .foregroundStyle(accent)
                    .accessibilityHidden(true)
            })
            Text(ProfilePrismCopy.intro)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                .foregroundStyle(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
            reorderList
            if languages.canAdd {
                MeeshyButton(ProfilePrismCopy.add, systemImage: "plus", kind: .text, size: .s44, tint: accent,
                             action: { picking = ProfilePrismRank(rank: languages.codes.count) })
                    .accessibilityIdentifier("profile.languages.add")
            }
            if let autoTranslate {
                MeeshyToggleRow(ProfileEditSettingsCopy.autoTranslate, subtitle: ProfileEditSettingsCopy.autoTranslateHint,
                                accessory: .toggle(isOn: autoTranslate), tint: accent,
                                action: { onAutoTranslate(!autoTranslate) })
                    .accessibilityIdentifier("profile.edit.autoTranslate")
            }
        }
        .sheet(item: $picking) { slot in
            ProfileLanguagePickerSheet(
                title: ProfilePrismCopy.pickerTitle(slot.rank),
                languages: LanguageData.allLanguages,
                selectedCode: languageCode(at: slot.rank),
                allowClear: slot.rank > 0,
                onSelect: { code in apply(languages.choosing(code, at: slot.rank)) }
            )
        }
    }

    private var reorderList: some View {
        let locale = ProfileLanguageChip.interfaceLocale
        return MeeshyReorderList(
            label: ProfilePrismCopy.title,
            items: languages.codes,
            id: { $0 },
            title: { ProfileLanguageChip.displayName(of: $0, locale: locale) },
            labels: MeeshyReorderLabels(handle: { ProfilePrismCopy.handle($0) }, moveUp: ProfilePrismCopy.moveUp,
                                        moveDown: ProfilePrismCopy.moveDown,
                                        announce: { ProfilePrismCopy.announce($0, rank: $1, count: $2) }),
            onMove: { from, to in apply(languages.moving(from: from, to: to)) },
            rank: .ordinal,
            emphasizesFirst: true,
            tint: accent
        ) { code, context in
            ProfilePrismLanguageRow(name: ProfileLanguageChip.displayName(of: code, locale: locale),
                                    tag: ProfilePrismCopy.rankTag(context.rank), handle: context.handle,
                                    onPick: { picking = ProfilePrismRank(rank: context.rank) })
        }
    }

    private func languageCode(at rank: Int) -> String {
        languages.codes.indices.contains(rank) ? languages.codes[rank] : ""
    }

    /// Optimiste : les trois brouillons prennent le nouvel ordre tout de suite, l'enregistrement les envoie ensemble.
    private func apply(_ next: ProfilePrismLanguages) {
        HapticFeedback.light()
        system = next.system
        regional = next.regional
        custom = next.custom
    }
}

/// Une rangée de la liste : le rang en toutes lettres et la langue, qui rouvrent le sélecteur ; la poignée K52 au
/// bord. La pastille du rang est posée par la liste, la rangée lui laisse sa place.
struct ProfilePrismLanguageRow: View {
    let name: String
    let tag: String
    let handle: MeeshyReorderHandle
    let onPick: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        MeeshyGroupCard {
            HStack(spacing: MeeshySpacing.md) {
                Button(action: onPick) {
                    VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                        Text(tag)
                            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                            .foregroundStyle(theme.textMuted)
                        Text(name)
                            .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                            .foregroundStyle(theme.textPrimary)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text(verbatim: "\(tag), \(name)"))
                handle
            }
            .padding(.leading, CGFloat(MeeshyReorderListRecipe.rankPillDiameter) + MeeshySpacing.sm)
        }
    }
}
