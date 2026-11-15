import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Identité » sur ma fiche : prénom, nom, pseudo, nom affiché, bio. Au repos, la section lit ; en édition, les champs
/// s'ouvrent sur les brouillons que la fiche tient (et enregistre). Le pseudo ne s'édite pas ici.
struct ProfileIdentitySection: View {
    let isEditing: Bool
    @Binding var firstName: String
    @Binding var lastName: String
    @Binding var displayName: String
    @Binding var bio: String
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
