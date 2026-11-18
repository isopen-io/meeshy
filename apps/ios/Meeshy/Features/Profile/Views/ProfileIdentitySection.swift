import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Identité » sur ma fiche : prénom, nom, nom affiché, pseudo, bio, ville. Au repos, la section lit ; en édition, les
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

    /// La bio que la passerelle accepte (`z.string().max(500)`) : le champ compte jusque-là et n'en laisse pas taper plus.
    static let bioLimit = 500

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: Self.title)
            MeeshyGroupCard(layout: .group, tint: Color(hex: accentColor), label: Self.title) {
                VStack(alignment: .leading, spacing: 0) {
                    field(title: String(localized: "profile.first_name", bundle: .main), value: $firstName,
                          placeholder: String(localized: "profile.first_name", bundle: .main))
                    field(title: String(localized: "profile.last_name", bundle: .main), value: $lastName,
                          placeholder: String(localized: "profile.last_name", bundle: .main))
                    field(title: String(localized: "profile.display_name", bundle: .main), value: $displayName,
                          placeholder: String(localized: "profile.display_name", bundle: .main))
                    usernameRow
                    field(title: String(localized: "profile.bio", bundle: .main), value: $bio,
                          placeholder: String(localized: "profile.bio.placeholder", bundle: .main), isMultiline: true)
                    ProfileCityField(isEditing: isEditing, city: $city, circle: $cityCircle, accentColor: accentColor)
                }
            }
        }
    }

    static var title: String {
        String(localized: "profile.section.identity", bundle: .main)
    }

    /// En édition, le champ du kit (K08) ; au repos, la valeur lue dans le dessin de la rangée du kit (K06).
    @ViewBuilder
    private func field(title: String, value: Binding<String>, placeholder: String, isMultiline: Bool = false) -> some View {
        if isEditing {
            MeeshyField(title, text: value.wrappedValue, input: isMultiline ? .paragraph : .sentence, prompt: placeholder,
                        limit: isMultiline ? Self.bioLimit : nil, onChange: { value.wrappedValue = $0 })
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .padding(.vertical, MeeshySpacing.xs)
        } else {
            reading(title: title, value: value.wrappedValue.isEmpty ? placeholder : value.wrappedValue)
        }
    }

    /// Le pseudo, après le nom affiché (planche `Moi-Edition`, #19644). Au repos, il se lit ; en édition, il se voit
    /// verrouillé — le cadenas du kit (K45) et « Ne se modifie pas ici » — et VoiceOver le dit non modifiable.
    @ViewBuilder
    private var usernameRow: some View {
        if isEditing {
            MeeshyToggleRowFace(
                content: ProfileUsernameRow.editingContent(username: username),
                leading: { MeeshyToggleRowNoSlot() },
                titleAccessory: { MeeshyToggleRowNoSlot() },
                trailing: { MeeshyMedallion(systemImage: ProfileUsernameRow.lockGlyph, kind: .neutral, size: .s36) }
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(ProfileUsernameRow.editingAccessibilityLabel(username: username))
            .accessibilityIdentifier("profile.username.locked")
        } else {
            reading(title: ProfileUsernameRow.title, value: ProfileUsernameRow.value(of: username))
        }
    }

    private func reading(title: String, value: String) -> some View {
        MeeshyToggleRowFace(content: MeeshyToggleRowContent(title: title, subtitle: value))
            .accessibilityElement(children: .combine)
    }
}

/// Les mots du pseudo de ma fiche (#19644) : il ne s'édite pas ici, et la rangée le dit.
nonisolated enum ProfileUsernameRow {
    static let lockGlyph = "lock"

    static var title: String {
        String(localized: "profile.username", bundle: .main)
    }

    static var lockedNote: String {
        String(localized: "profile.username.lockedNote", defaultValue: "Ne se modifie pas ici", bundle: .main)
    }

    static var lockedWord: String {
        String(localized: "profile.username.locked", defaultValue: "Non modifiable", bundle: .main)
    }

    /// « @aissa », ou « — » sans pseudo servi.
    static func value(of username: String?) -> String {
        guard let trimmed = username?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
            return "—"
        }
        return "@\(trimmed)"
    }

    /// La valeur, puis la mention dessous, comme la planche.
    static func editingContent(username: String?) -> MeeshyToggleRowContent {
        MeeshyToggleRowContent(title: title, subtitle: "\(value(of: username))\n\(lockedNote)")
    }

    /// « Pseudo, @aissa, Non modifiable, Ne se modifie pas ici ».
    static func editingAccessibilityLabel(username: String?) -> String {
        [title, value(of: username), lockedWord, lockedNote].joined(separator: ", ")
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
        MeeshyToggleRowFace(content: MeeshyToggleRowContent(title: ProfileCityCopy.label, subtitle: city,
                                                            accessory: .value(ProfileCityCopy.seenBy(circle))))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(MeeshyToggleRowRecipe.accessibilityLabel(title: ProfileCityCopy.label, titleAccessory: nil,
                                                                         subtitle: "\(city), \(ProfileCityCopy.seenBy(circle))"))
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

/// « Couleur d'accent » en édition (planche `Moi-Edition`, #19391) : les sept teintes de la liste et « Automatique » en
/// pastilles du kit (K07). La bannière au-dessus suit chaque choix, et la phrase dit la teinte qu'elle prend.
struct ProfileAccentSection: View {
    @Binding var choice: ProfileAccentChoice
    let userId: String?
    let name: String

    private var theme: ThemeManager { ThemeManager.shared }
    private var previewColor: Color { ProfileAccent.color(chosen: choice.wire, userId: userId, name: name) }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfileAccentCopy.title)
            MeeshyColorDots(ProfileAccentCopy.dots, selection: ProfileAccentCopy.dotId(of: choice),
                            label: ProfileAccentCopy.title, size: .s32, tone: .theme,
                            onSelect: { id in choice = ProfileAccentCopy.choice(forDot: id) })
                .padding(.horizontal, MeeshySpacing.sm)
                .accessibilityIdentifier("profile.accent.dots")
            preview
        }
    }

    /// L'aperçu en direct, sur la carte du kit (K43) lavée de la teinte choisie.
    private var preview: some View {
        MeeshyGroupCard(surface: .accent, tint: previewColor, label: ProfileAccentCopy.preview(of: choice)) {
            HStack(spacing: MeeshySpacing.md) {
                Circle()
                    .fill(previewColor)
                    .frame(width: MeeshySpacing.smPlus, height: MeeshySpacing.smPlus)
                    .accessibilityHidden(true)
                Text(ProfileAccentCopy.preview(of: choice))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundStyle(theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.smPlus)
        }
        .accessibilityIdentifier("profile.accent.preview")
    }
}

/// Les mots et les pastilles de l'accent de ma vitrine (#19391). L'identifiant d'une pastille est la clé de sa teinte,
/// `automatic` pour l'accent calculé.
nonisolated enum ProfileAccentCopy {
    static let automaticDot = "automatic"

    static var title: String {
        String(localized: "profile.accent.title", defaultValue: "Couleur d'accent", bundle: .main)
    }

    static var automaticName: String {
        String(localized: "profile.accent.automatic", defaultValue: "Automatique", bundle: .main)
    }

    /// Les sept teintes dans l'ordre de la planche, puis « Automatique ».
    static var dots: [MeeshyColorDot] {
        let tones: [MeeshyColorDot] = ProfileAccent.tones.map { tone in
            MeeshyColorDot(id: tone.key, fill: .solid(tone.color), name: name(of: tone))
        }
        let automatic = MeeshyColorDot(id: automaticDot, fill: .gradient(ProfileAccent.automaticGradient),
                                       name: automaticName, systemImage: "wand.and.stars")
        return tones + [automatic]
    }

    static func dotId(of choice: ProfileAccentChoice) -> String {
        guard case .tone(let tone) = choice else { return automaticDot }
        return tone.key
    }

    /// Une pastille inconnue vaut « Automatique » : jamais une teinte hors liste.
    static func choice(forDot id: String) -> ProfileAccentChoice {
        guard let tone = ProfileAccent.tones.first(where: { $0.key == id }) else { return .automatic }
        return .tone(tone)
    }

    /// « Aperçu en direct : ta bannière est en Violet ».
    static func preview(of choice: ProfileAccentChoice) -> String {
        guard case .tone(let tone) = choice else {
            return String(localized: "profile.accent.preview.automatic",
                          defaultValue: "Aperçu en direct : ta bannière prend sa couleur automatique", bundle: .main)
        }
        let format = String(localized: "profile.accent.preview", defaultValue: "Aperçu en direct : ta bannière est en %@",
                            bundle: .main)
        return String(format: format, name(of: tone))
    }

    static func name(of tone: ProfileAccent.Tone) -> String {
        switch tone.key {
        case "violet": return String(localized: "profile.accent.tone.violet", defaultValue: "Violet", bundle: .main)
        case "turquoise": return String(localized: "profile.accent.tone.turquoise", defaultValue: "Turquoise", bundle: .main)
        case "coral": return String(localized: "profile.accent.tone.coral", defaultValue: "Corail", bundle: .main)
        case "amber": return String(localized: "profile.accent.tone.amber", defaultValue: "Ambre", bundle: .main)
        case "blue": return String(localized: "profile.accent.tone.blue", defaultValue: "Bleu", bundle: .main)
        case "green": return String(localized: "profile.accent.tone.green", defaultValue: "Vert", bundle: .main)
        default: return String(localized: "profile.accent.tone.raspberry", defaultValue: "Framboise", bundle: .main)
        }
    }
}
