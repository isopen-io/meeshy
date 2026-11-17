import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Identité » sur ma fiche : prénom, nom, pseudo, nom affiché, bio, ville. Au repos, la section lit ; en édition, les
/// champs s'ouvrent sur les brouillons que la fiche tient (et enregistre). Le pseudo ne s'édite pas ici. La ville
/// (planche `Moi-Edition`, #19388) s'édite au champ du kit (K08) et dit le cercle qui la voit en puces (K04).
struct ProfileIdentitySection: View {
    let isEditing: Bool
    @Binding var firstName: String
    @Binding var lastName: String
    @Binding var displayName: String
    @Binding var bio: String
    @Binding var city: String
    @Binding var cityCircle: RelationLevel?
    let username: String?
    /// L'accent de la fiche (hex), sous son nom de règle : il teinte le titre, la carte et les pastilles de la section.
    let accentColor: String

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            ProfileSectionHeader(icon: "person.text.rectangle.fill", title: String(localized: "profile.section.identity", bundle: .main), color: Color(hex: accentColor))

            VStack(spacing: 0) {
                field(icon: "person.fill", title: String(localized: "profile.first_name", bundle: .main), value: $firstName, placeholder: String(localized: "profile.first_name", bundle: .main))
                field(icon: "person.fill", title: String(localized: "profile.last_name", bundle: .main), value: $lastName, placeholder: String(localized: "profile.last_name", bundle: .main))
                infoRow(icon: "at", title: String(localized: "profile.username", bundle: .main), value: "@\(username ?? "—")")
                field(icon: "person.crop.rectangle.fill", title: String(localized: "profile.display_name", bundle: .main), value: $displayName, placeholder: String(localized: "profile.display_name", bundle: .main))
                field(icon: "text.quote", title: String(localized: "profile.bio", bundle: .main), value: $bio, placeholder: String(localized: "profile.bio.placeholder", bundle: .main), isMultiline: true)
                ProfileCityField(isEditing: isEditing, city: $city, circle: $cityCircle, accentColor: accentColor)
            }
            .background(ProfileSectionCard(tintHex: accentColor))
        }
    }

    private func field(icon: String, title: String, value: Binding<String>, placeholder: String, isMultiline: Bool = false) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            ProfileFieldIcon(name: icon, accentColor: accentColor)

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(title)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundStyle(theme.textMuted)

                if isEditing && isMultiline {
                    TextField(placeholder, text: value, axis: .vertical)
                        .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                        .foregroundStyle(theme.textPrimary)
                        .lineLimit(3...6)
                } else if isEditing {
                    TextField(placeholder, text: value)
                        .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                        .foregroundStyle(theme.textPrimary)
                } else {
                    Text(value.wrappedValue.isEmpty ? placeholder : value.wrappedValue)
                        .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                        .foregroundStyle(value.wrappedValue.isEmpty ? theme.textMuted : theme.textPrimary)
                }
            }

            Spacer()
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.smPlus)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(verbatim: "\(title): \(value.wrappedValue)"))
    }

    private func infoRow(icon: String, title: String, value: String) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            ProfileFieldIcon(name: icon, accentColor: accentColor)

            Text(title)
                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                .foregroundStyle(theme.textPrimary)

            Spacer()

            Text(value)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                .foregroundStyle(theme.textMuted)
                .lineLimit(1)
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.smPlus)
    }
}

/// Ma ville déclarée (#19388) : au repos, la ville et le cercle qui la voit ; en édition, le champ du kit (K08) et le
/// choix du cercle en puces (K04), comme une adresse de la face Liens. Sans cercle choisi, elle ne se lit que de moi.
struct ProfileCityField: View {
    let isEditing: Bool
    @Binding var city: String
    @Binding var circle: RelationLevel?
    let accentColor: String

    private var theme: ThemeManager { ThemeManager.shared }
    private var hasCity: Bool { ProfileCity.normalized(city) != nil }

    var body: some View {
        if isEditing {
            editing
        } else if hasCity {
            resting
        }
    }

    private var resting: some View {
        HStack(spacing: MeeshySpacing.md) {
            ProfileFieldIcon(name: "mappin.and.ellipse", accentColor: accentColor)
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(ProfileCityCopy.label)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundStyle(theme.textMuted)
                Text(city)
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                    .foregroundStyle(theme.textPrimary)
                Text(ProfileCityCopy.seenBy(circle))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundStyle(theme.textMuted)
            }
            Spacer()
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.smPlus)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("profile.city")
    }

    private var editing: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            MeeshyField(ProfileCityCopy.label, text: city, prompt: ProfileCityCopy.prompt,
                        leading: .icon(systemImage: "mappin.and.ellipse"), limit: ProfileCity.maxLength,
                        onChange: { city = $0 })
                .accessibilityIdentifier("profile.city.field")
            MeeshySectionHeader(title: ProfileCityCopy.whoSees, form: .overline)
            MeeshyChipRow(
                RelationLevel.allCases.map {
                    MeeshyChip(id: $0, title: CircleLevelNames.title(of: $0), systemImage: VitrineSeenAsCopy.glyph(of: $0))
                },
                selection: Set(circle.map { [$0] } ?? []),
                label: ProfileCityCopy.whoSees,
                layout: .wrap,
                surface: .theme,
                size: .compact,
                onChange: { _, level in circle = level }
            )
            .accessibilityIdentifier("profile.city.circle")
            if circle == nil {
                Text(ProfileCityCopy.onlyMe)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundStyle(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.smPlus)
    }
}

/// Les mots de ma ville déclarée (#19388).
nonisolated enum ProfileCityCopy {
    static var label: String {
        String(localized: "profile.city", defaultValue: "Ville", bundle: .main)
    }

    static var prompt: String {
        String(localized: "profile.city.prompt", defaultValue: "Ta ville", bundle: .main)
    }

    static var whoSees: String {
        String(localized: "profile.city.whoSees", defaultValue: "Qui la voit", bundle: .main)
    }

    static var onlyMe: String {
        String(localized: "profile.city.onlyMe", defaultValue: "Toi seul la vois tant que tu ne choisis pas de cercle.", bundle: .main)
    }

    /// « Visible dès Ami », ou « Visible par toi seul » sans cercle choisi.
    static func seenBy(_ circle: RelationLevel?) -> String {
        guard let circle else {
            return String(localized: "profile.city.seenBy.onlyMe", defaultValue: "Visible par toi seul", bundle: .main)
        }
        let format = String(localized: "profile.city.seenBy.circle", defaultValue: "Visible dès %@", bundle: .main)
        return String(format: format, CircleLevelNames.title(of: circle))
    }
}
