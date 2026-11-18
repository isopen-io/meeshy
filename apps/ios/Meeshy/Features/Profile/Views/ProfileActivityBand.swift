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
    /// Vrai tant que ni le cache ni le serveur n'ont répondu : sur un cache vide, le kit dessine son squelette.
    var isLoading: Bool = false
    /// Vrai quand le dernier chargement a échoué faute de réseau : l'état indisponible le dit.
    var isOffline: Bool = false
    let accentColor: String
    let onOpen: () -> Void
    /// Relance le chargement depuis l'état indisponible.
    var onRetry: () -> Void = {}

    /// Ce que la bande peint : le squelette sur un cache vide en chargement, les chiffres dès qu'une valeur existe
    /// (un échec garde ce qui est affiché), et sinon l'état indisponible — jamais trois zéros inventés.
    enum Phase: Equatable {
        case skeleton
        case figures
        case unavailable(offline: Bool)
    }

    /// Comment finit un chargement de mes chiffres. Annulé (la fiche quittée, une relance qui le remplace) : il ne
    /// change rien — ni le squelette ni l'état indisponible ne sont l'affaire d'une tâche qui ne parle plus.
    enum LoadEnd: Equatable {
        case served
        case failed
        case cancelled
    }

    static func loadEnd(failure: Error?, isCancelled: Bool) -> LoadEnd {
        if isCancelled || failure is CancellationError { return .cancelled }
        if let urlError = failure as? URLError, urlError.code == .cancelled { return .cancelled }
        return failure == nil ? .served : .failed
    }

    static func phase(stats: UserStats?, isLoading: Bool, isOffline: Bool) -> Phase {
        if stats != nil { return .figures }
        return isLoading ? .skeleton : .unavailable(offline: isOffline)
    }

    var body: some View {
        switch Self.phase(stats: stats, isLoading: isLoading, isOffline: isOffline) {
        case .unavailable(let offline):
            unavailable(offline: offline)
        case .skeleton, .figures:
            band
        }
    }

    /// Rien n'est servi et le chargement est fini : le bloc d'état du kit (K38), avec Réessayer.
    private func unavailable(offline: Bool) -> some View {
        MeeshyStateBlock(kind: offline ? .offline : .error, title: Self.unavailableTitle(offline: offline),
                         primary: MeeshyStateBlockAction(title: ProfilePublicationsCopy.retry,
                                                         systemImage: "arrow.clockwise",
                                                         perform: { onRetry() }),
                         art: .none, size: .compact, tint: Color(hex: accentColor))
            .accessibilityIdentifier("profile.activity.unavailable")
    }

    private var band: some View {
        Button {
            HapticFeedback.light()
            onOpen()
        } label: {
            MeeshyGroupCard(tint: Color(hex: accentColor)) {
                MeeshyFigureBand(items: Self.figures(of: stats, isLoading: isLoading), size: .compact,
                                 isLoading: isLoading, emptyLabel: Self.emptyLabel)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, MeeshySpacing.lg)
                    .padding(.horizontal, MeeshySpacing.md)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableButtonStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.accessibilityLabel(stats: stats, isLoading: isLoading))
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("profile.activity")
    }

    // MARK: - Ce que la bande dit

    static var title: String {
        String(localized: "profile.section.activity", defaultValue: "Mon activité", bundle: .main)
    }

    /// Ce que le lecteur d'écran dit d'un chiffre absent : le tiret du kit ne se prononce pas.
    static var emptyLabel: String {
        String(localized: "profile.activity.empty", defaultValue: "Aucune donnée", bundle: .main)
    }

    /// Ce que le lecteur d'écran dit pendant le squelette.
    static var loadingLabel: String {
        String(localized: "profile.activity.loading", defaultValue: "Chargement", bundle: .main)
    }

    /// Le titre de l'état indisponible : hors ligne se dit hors ligne.
    static func unavailableTitle(offline: Bool) -> String {
        offline
            ? String(localized: "profile.activity.offline", defaultValue: "Hors ligne — Mon activité reviendra avec le réseau", bundle: .main)
            : String(localized: "profile.activity.failed", defaultValue: "Mon activité est indisponible", bundle: .main)
    }

    /// Les trois cartes de Mon activité (zéros sans valeur servie ; la bande ne les peint pas alors).
    static func values(of stats: UserStats?) -> [UserActivityCards.Card] {
        UserActivityCards.make(stats: stats)
    }

    /// Les chiffres de la bande, déjà écrits par la langue courante (« 12 480 »), chacun sous son nom.
    /// Sans valeur servie, aucune valeur : le squelette du kit en chargement, le tiret sinon — jamais un zéro inventé.
    static func figures(of stats: UserStats?, isLoading: Bool = false,
                        locale: Locale = .current) -> [MeeshyFigureItem] {
        values(of: stats).map { card in
            MeeshyFigureItem(value: stats == nil ? nil : card.value.formatted(.number.locale(locale)), unit: card.label)
        }
    }

    /// Le titre de la section, puis chaque valeur avec son nom : « Mon activité: 12 Messages, 3 Conversations, … ».
    static func accessibilityLabel(stats: UserStats?, isLoading: Bool = false) -> String {
        if stats == nil { return "\(title): \(isLoading ? loadingLabel : emptyLabel)" }
        let pairs = values(of: stats).map { "\($0.value) \($0.label)" }.joined(separator: ", ")
        return "\(title): \(pairs)"
    }
}
