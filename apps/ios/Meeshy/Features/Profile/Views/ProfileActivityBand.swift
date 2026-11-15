import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Mon activité » sur ma fiche (#18590, ex-section Statistiques) : trois nombres qui disent quelque chose de Meeshy
/// — messages, conversations, traductions. Un compteur de demandes n'est pas une statistique : il vit dans « Mes
/// cercles ».
///
/// Toute la bande est UN bouton, donc UN élément VoiceOver : sans regroupement, valeurs et intitulés se lisaient en
/// fragments épars et rien ne disait que le toucher ouvre les statistiques détaillées.
struct ProfileActivityBand: View {

    struct Value: Identifiable, Equatable {
        let id: String
        let value: Int
        let label: String
        let colorHex: String
    }

    let stats: UserStats?
    let onOpen: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        Button {
            HapticFeedback.light()
            onOpen()
        } label: {
            HStack(spacing: MeeshySpacing.md) {
                ForEach(Self.values(of: stats)) { card($0) }
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.accessibilityLabel(stats: stats))
        .accessibilityHint(String(localized: "profile.stats.a11y.hint", defaultValue: "Ouvre les statistiques détaillées", bundle: .main))
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("profile.activity")
    }

    private func card(_ item: Value) -> some View {
        VStack(spacing: MeeshySpacing.xsPlus) {
            Text("\(item.value)")
                .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold, design: .rounded))
                .foregroundStyle(Color(hex: item.colorHex))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .contentTransition(.numericText())
            Text(item.label)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                .foregroundStyle(theme.textMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, minHeight: 44)
        .padding(.vertical, MeeshySpacing.lg)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(theme.surfaceGradient(tint: item.colorHex))
                .overlay(RoundedRectangle(cornerRadius: MeeshyRadius.md).stroke(theme.border(tint: item.colorHex), lineWidth: 1))
        )
    }

    // MARK: - Ce que la bande dit

    static var title: String {
        String(localized: "profile.section.activity", defaultValue: "MON ACTIVITÉ", bundle: .main)
    }

    /// Avant la réponse du serveur, la bande dit zéro : elle ne garde ni n'estime rien.
    static func values(of stats: UserStats?) -> [Value] {
        [
            Value(id: "messages", value: stats?.totalMessages ?? 0,
                  label: String(localized: "profile.stats.messages", defaultValue: "Messages", bundle: .main), colorHex: MeeshyColors.errorHex),
            Value(id: "conversations", value: stats?.totalConversations ?? 0,
                  label: String(localized: "profile.stats.conversations", defaultValue: "Conversations", bundle: .main), colorHex: MeeshyColors.indigo300Hex),
            Value(id: "translations", value: stats?.totalTranslations ?? 0,
                  label: String(localized: "user.stats.translations", defaultValue: "Traductions", bundle: .main), colorHex: MeeshyColors.indigo600Hex),
        ]
    }

    /// Le titre de la section, puis chaque valeur avec son nom : « MON ACTIVITÉ: 12 Messages, 3 Conversations, … ».
    static func accessibilityLabel(stats: UserStats?) -> String {
        let pairs = values(of: stats).map { "\($0.value) \($0.label)" }.joined(separator: ", ")
        return "\(title): \(pairs)"
    }
}
