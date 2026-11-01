import SwiftUI
import MeeshySDK
import MeeshyUI

/// « QUI EST PRÉVENU » (#14062) — trois familles qui se déplient action par
/// action, chacune avec le sélecteur natif des sept crans. Sous Personne,
/// Communauté et Public, une phrase dit en clair qui sera prévenu.
struct CircleNotifySettingsContent: View {
    @ObservedObject var viewModel: CircleNotifySettingsViewModel
    let accentHex: String

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(String(localized: "circleNotify.intro", defaultValue: "Choisissez, action par action, le cercle de votre entourage qui reçoit une notification.", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                .foregroundColor(theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .padding(.vertical, MeeshySpacing.smPlus)

            switch viewModel.loadState {
            case .loading:
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, MeeshySpacing.md)
                    .accessibilityLabel(String(localized: "circleNotify.loading", defaultValue: "Chargement…", bundle: .main))
            case .unavailable:
                unavailable
            case .loaded:
                ForEach(CircleNotifyFamily.allCases, id: \.self) { family in
                    familyGroup(family)
                }
            }
        }
    }

    private var unavailable: some View {
        HStack {
            Text(String(localized: "circleNotify.unavailable", defaultValue: "Impossible de lire ces réglages.", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.labelSize))
                .foregroundColor(theme.textSecondary)
            Spacer()
            Button(String(localized: "circleNotify.retry", defaultValue: "Réessayer", bundle: .main)) {
                Task { await viewModel.load() }
            }
            .foregroundColor(Color(hex: accentHex))
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.smPlus)
    }

    private func familyGroup(_ family: CircleNotifyFamily) -> some View {
        DisclosureGroup {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                ForEach(family.keys, id: \.self) { key in
                    actionRow(key)
                }
            }
            .padding(.top, MeeshySpacing.xs)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(Self.title(of: family))
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                Text(viewModel.preferences.uniformChoice(of: family).map(Self.label(of:))
                     ?? String(localized: "circleNotify.summary.mixed", defaultValue: "Selon l’action", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                    .foregroundColor(theme.textSecondary)
            }
            .accessibilityElement(children: .combine)
        }
        .tint(Color(hex: accentHex))
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.smPlus)
    }

    private func actionRow(_ key: CircleNotifyKey) -> some View {
        let choice = viewModel.preferences[key]
        return VStack(alignment: .leading, spacing: 2) {
            Picker(selection: Binding(
                get: { viewModel.preferences[key] },
                set: { next in Task { await viewModel.choose(next, for: key) } }
            )) {
                ForEach(RelationAudienceChoice.allCases, id: \.self) { option in
                    Text(Self.label(of: option)).tag(option)
                }
            } label: {
                Text(Self.title(of: key.action))
                    .font(MeeshyFont.relative(MeeshyFont.labelSize))
                    .foregroundColor(theme.textPrimary)
            }
            .pickerStyle(.menu)
            .tint(Color(hex: accentHex))

            if let explanation = Self.explanation(of: choice) {
                Text(explanation)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                    .foregroundColor(theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(minHeight: 44)
    }

    // MARK: - Libellés

    static func title(of family: CircleNotifyFamily) -> String {
        switch family {
        case .publication: return String(localized: "circleNotify.family.publication", defaultValue: "Mes publications", bundle: .main)
        case .onMyContent: return String(localized: "circleNotify.family.onMyContent", defaultValue: "L’activité des autres sur mes contenus", bundle: .main)
        case .elsewhere: return String(localized: "circleNotify.family.elsewhere", defaultValue: "Mon activité ailleurs", bundle: .main)
        }
    }

    static func title(of action: CircleNotifyAction) -> String {
        switch action {
        case .post: return String(localized: "circleNotify.action.post", defaultValue: "Publication", bundle: .main)
        case .reel: return String(localized: "circleNotify.action.reel", defaultValue: "Réel", bundle: .main)
        case .story: return String(localized: "circleNotify.action.story", defaultValue: "Story", bundle: .main)
        case .mood: return String(localized: "circleNotify.action.mood", defaultValue: "Humeur", bundle: .main)
        case .repost: return String(localized: "circleNotify.action.repost", defaultValue: "Republication", bundle: .main)
        case .share: return String(localized: "circleNotify.action.share", defaultValue: "Partage", bundle: .main)
        case .comment: return String(localized: "circleNotify.action.comment", defaultValue: "Commentaire", bundle: .main)
        case .reaction: return String(localized: "circleNotify.action.reaction", defaultValue: "Réaction", bundle: .main)
        case .quote: return String(localized: "circleNotify.action.quote", defaultValue: "Citation", bundle: .main)
        case .reference: return String(localized: "circleNotify.action.reference", defaultValue: "Référence", bundle: .main)
        case .mention: return String(localized: "circleNotify.action.mention", defaultValue: "Mention", bundle: .main)
        }
    }

    static func label(of choice: RelationAudienceChoice) -> String {
        switch choice {
        case .nobody: return String(localized: "circleNotify.choice.NOBODY", defaultValue: "Personne", bundle: .main)
        case .blood: return String(localized: "circleNotify.choice.BLOOD", defaultValue: "Sang", bundle: .main)
        case .close: return String(localized: "circleNotify.choice.CLOSE", defaultValue: "Proche", bundle: .main)
        case .friend: return String(localized: "circleNotify.choice.FRIEND", defaultValue: "Ami", bundle: .main)
        case .acquaintance: return String(localized: "circleNotify.choice.ACQUAINTANCE", defaultValue: "Connaissance", bundle: .main)
        case .community: return String(localized: "circleNotify.choice.COMMUNITY", defaultValue: "Communauté", bundle: .main)
        case .public: return String(localized: "circleNotify.choice.PUBLIC", defaultValue: "Public", bundle: .main)
        }
    }

    static func explanation(of choice: RelationAudienceChoice) -> String? {
        switch choice {
        case .nobody: return String(localized: "circleNotify.explain.NOBODY", defaultValue: "Personne de votre entourage n’est prévenu.", bundle: .main)
        case .community: return String(localized: "circleNotify.explain.COMMUNITY", defaultValue: "Tous vos liens, de Sang à Connaissance, et les membres des communautés que vous partagez.", bundle: .main)
        case .public: return String(localized: "circleNotify.explain.PUBLIC", defaultValue: "Les mêmes personnes que Communauté : Meeshy n’a pas d’abonnés, aucun inconnu n’est prévenu.", bundle: .main)
        case .blood, .close, .friend, .acquaintance: return nil
        }
    }
}
