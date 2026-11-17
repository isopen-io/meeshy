import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Mon activité » sur ma fiche (#18590, ex-section Statistiques, planche `Main`) : trois nombres qui disent quelque
/// chose de Meeshy — messages, conversations, traductions. Un compteur de demandes n'est pas une statistique : il vit
/// dans « Mes cercles ».
///
/// Les trois nombres SONT la bande de chiffres du kit (K34) : même ligne de base, filets entre eux, empilés aux grandes
/// tailles de texte, le chiffre à l'encre du texte (jamais à la teinte). Aucune carte redessinée ici (loi 12).
///
/// Toute la bande est UN bouton, donc UN élément VoiceOver : sans regroupement, valeurs et intitulés se lisaient en
/// fragments épars et rien ne disait que le toucher ouvre Mon activité. Les nombres et leurs noms viennent des cartes
/// de Mon activité (`UserActivityCards`) : une seule source, la bande ne les recopie pas.
struct ProfileActivityBand: View {

    let stats: UserStats?
    let accentHex: String
    let onOpen: () -> Void

    var body: some View {
        Button {
            HapticFeedback.light()
            onOpen()
        } label: {
            MeeshyFigureBand(items: Self.figures(of: stats), size: .compact, emptyLabel: Self.emptyLabel)
                .frame(maxWidth: .infinity)
                .padding(.vertical, MeeshySpacing.lg)
                .padding(.horizontal, MeeshySpacing.md)
                .background(ProfileSectionCard(tintHex: accentHex))
                .contentShape(Rectangle())
        }
        .buttonStyle(PressableButtonStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.accessibilityLabel(stats: stats))
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("profile.activity")
    }

    // MARK: - Ce que la bande dit

    static var title: String {
        String(localized: "profile.section.activity", defaultValue: "MON ACTIVITÉ", bundle: .main)
    }

    /// Ce que le lecteur d'écran dit d'un chiffre absent : le tiret du kit ne se prononce pas.
    static var emptyLabel: String {
        String(localized: "profile.activity.empty", defaultValue: "Aucune donnée", bundle: .main)
    }

    /// Avant la réponse du serveur, la bande dit zéro : elle ne garde ni n'estime rien.
    static func values(of stats: UserStats?) -> [UserActivityCards.Card] {
        UserActivityCards.make(stats: stats)
    }

    /// Les chiffres de la bande, déjà écrits par la langue courante (« 12 480 »), chacun sous son nom.
    static func figures(of stats: UserStats?, locale: Locale = .current) -> [MeeshyFigureItem] {
        values(of: stats).map { card in
            MeeshyFigureItem(value: card.value.formatted(.number.locale(locale)), unit: card.label)
        }
    }

    /// Le titre de la section, puis chaque valeur avec son nom : « MON ACTIVITÉ: 12 Messages, 3 Conversations, … ».
    static func accessibilityLabel(stats: UserStats?) -> String {
        let pairs = values(of: stats).map { "\($0.value) \($0.label)" }.joined(separator: ", ")
        return "\(title): \(pairs)"
    }
}
