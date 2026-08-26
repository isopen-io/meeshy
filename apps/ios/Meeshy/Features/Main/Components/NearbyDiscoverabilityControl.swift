import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Libellés

/// Les libellés vivent côté APP, jamais dans l'enum du SDK — même raison que
/// `LocationSharingLabels` : une chaîne posée dans le SDK obligerait à
/// alimenter le catalogue `.module` et finirait par rendre du français en dur
/// quelle que soit la langue de l'interface.
///
/// `nonisolated` sur le TYPE : la cible app compile sous
/// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, le bundle de tests sous
/// `nonisolated`. Sans cette annotation, ces fonctions pures deviennent
/// isolées au main actor et les tests ne peuvent plus les appeler.
nonisolated enum NearbyDiscoverabilityLabels {

    static func tierTitle(_ tier: DiscoverabilityPrecision) -> String {
        switch tier {
        case .exact:
            return String(localized: "feed.nearby.precision.exact", defaultValue: "Exacte", bundle: .main)
        case .neighborhood:
            return String(localized: "feed.nearby.precision.neighborhood", defaultValue: "Quartier (~1 km)", bundle: .main)
        case .city:
            return String(localized: "feed.nearby.precision.city", defaultValue: "Ville (~10 km)", bundle: .main)
        case .region:
            return String(localized: "feed.nearby.precision.region", defaultValue: "Région (~100 km)", bundle: .main)
        }
    }

    static func tierIcon(_ tier: DiscoverabilityPrecision) -> String {
        switch tier {
        case .exact:        return "scope"
        case .neighborhood: return "house"
        case .city:         return "building.2"
        case .region:       return "globe.europe.africa"
        }
    }

    /// Pourquoi le sélecteur est amputé : le lieu part déjà dégradé, donc
    /// revendiquer plus fin serait un mensonge. Sans cette phrase,
    /// l'utilisateur lit une liste raccourcie sans cause visible.
    static func capNotice(finest: DiscoverabilityPrecision) -> String {
        let name = tierTitle(finest)
        return String(
            localized: "feed.nearby.precision.capped",
            defaultValue: "Votre partage de position limite la précision à « \(name) ».",
            bundle: .main
        )
    }

    /// Le resserrement de la valeur MÉMORISÉE, dit à voix haute. La spec exige
    /// que rien ne soit appliqué silencieusement : un clamp muet viole cette
    /// phrase exactement autant qu'un arrondi muet.
    static func narrowNotice(
        from abandoned: DiscoverabilityPrecision,
        to applied: DiscoverabilityPrecision
    ) -> String {
        let abandonedName = tierTitle(abandoned)
        let appliedName = tierTitle(applied)
        return String(
            localized: "feed.nearby.precision.narrowed",
            defaultValue: "Votre dernier choix « \(abandonedName) » a été resserré à « \(appliedName) ».",
            bundle: .main
        )
    }

    static var title: String {
        String(
            localized: "feed.nearby.consent.title",
            defaultValue: "Rendre ce contenu trouvable à proximité",
            bundle: .main
        )
    }

    static var subtitle: String {
        String(
            localized: "feed.nearby.consent.subtitle",
            defaultValue: "Indépendant du lieu affiché sur la publication.",
            bundle: .main
        )
    }

    /// **La phrase de rassurance, restreinte à ce qu'elle gouverne.**
    ///
    /// Elle disait « Meeshy n'enregistre jamais une position plus précise que
    /// la zone choisie », dans les sept langues, au moment exact du
    /// consentement — et c'était FAUX dans la configuration nominale.
    /// `discoverabilityPrecision` ne gouverne que `Post.geoPoint` ; le lieu
    /// AFFICHÉ voyage à côté et se persiste au grain de
    /// `LocationSharingPreferences.precision`, dont le défaut est « Exacte ».
    /// Un lecteur choisissait « Région (~100 km) » pour ne pas donner son
    /// adresse, et la donnait quand même par l'autre porte.
    ///
    /// D'où la restriction — « la recherche à proximité » — ET
    /// `exactBadgeNotice`, qui dit l'autre porte quand elle est grande ouverte.
    static var hint: String {
        String(
            localized: "feed.nearby.consent.hint",
            defaultValue: "La recherche à proximité n'indexe jamais une position plus précise que la zone choisie.",
            bundle: .main
        )
    }

    /// Ce que la phrase ci-dessus ne couvre PAS, dit quand ça s'applique.
    static var exactBadgeNotice: String {
        String(
            localized: "feed.nearby.consent.exactBadge",
            defaultValue: "Le lieu affiché sur la publication part, lui, à la précision de votre partage de position — actuellement exacte.",
            bundle: .main
        )
    }

    /// Le palier RÉELLEMENT appliqué, nommé sans condition.
    ///
    /// Le sélecteur défile horizontalement et la pré-sélection est, au premier
    /// usage, sa DERNIÈRE puce : elle naissait hors écran sur tout iPhone en
    /// portrait. « L'utilisateur voit et confirme toujours » exige au minimum
    /// une phrase qui n'a pas besoin d'être atteinte au doigt.
    static func appliedNotice(tier: DiscoverabilityPrecision) -> String {
        let name = tierTitle(tier)
        return String(
            localized: "feed.nearby.precision.applied",
            defaultValue: "Ce contenu sera trouvable au grain « \(name) ».",
            bundle: .main
        )
    }
}

// MARK: - Pont vers la mémoire locale

/// Ce qui relie le contrôle à la préférence LOCALE du device
/// (`LocationSharingPreferences`), en deux moitiés délibérément séparées.
///
/// Les deux fonctions PURES portent la règle et se testent sans toucher aux
/// `UserDefaults` réels du simulateur ; les deux enveloppes ne font que lire
/// et écrire le singleton. Écrire la règle DANS l'enveloppe l'aurait rendue
/// intestable, et c'est exactement le genre de règle qu'on ne remarque pas
/// quand elle se trompe — personne ne voit une mémoire mal retenue.
nonisolated enum FeedNearbyDiscoverability {

    /// L'état à poser quand un lieu vient d'être choisi. Les deux grains sont
    /// lus au MÊME instant, depuis le MÊME enregistrement : le grain de
    /// partage borne ce que le grain mémorisé peut revendiquer.
    static func choice(from preferences: LocationSharingPreferences) -> NearbyDiscoverabilityChoice {
        NearbyDiscoverabilityChoice(
            memorized: preferences.lastDiscoverabilityPrecision,
            sharing: preferences.precision
        )
    }

    /// Les préférences après publication. Une publication qui n'a RIEN activé
    /// ne retient rien — et surtout n'efface pas une mémoire plus ancienne,
    /// elle bien utilisée : la spec parle du dernier choix « utilisé ».
    static func remembering(
        _ choice: NearbyDiscoverabilityChoice,
        in preferences: LocationSharingPreferences
    ) -> LocationSharingPreferences {
        guard let tier = choice.tierToMemorize else { return preferences }
        var updated = preferences
        updated.lastDiscoverabilityPrecision = tier
        return updated
    }

    /// **Quand le second opt-in est OFFERT.**
    ///
    /// Deux conditions, et la seconde est celle qui manquait : la
    /// découvrabilité n'a de sens que sur une audience PUBLIQUE.
    /// `GET /posts/nearby` filtre `visibility: 'PUBLIC'` en dur et l'assume
    /// comme invariant de produit — offrir la case sur une audience restreinte
    /// affichait un contrôle INERTE, et faisait persister un point géospatial
    /// sur un contenu que l'utilisateur venait justement de restreindre.
    ///
    /// La présence d'un média n'est PAS une condition : les chemins média
    /// transportent désormais `location` et la précision, en ligne comme hors
    /// ligne. La spec range explicitement POST, REEL, STORY et STATUS dans le
    /// périmètre ; les en exclure rendait la fonctionnalité structurellement
    /// vide sur un fil composé de reels.
    static func offers(hasPlace: Bool, visibility: PostVisibility) -> Bool {
        hasPlace && visibility == .public
    }

    @MainActor
    static func choiceForNewPlace() -> NearbyDiscoverabilityChoice {
        choice(from: LocationSharingPreferencesStore.shared.preferences)
    }

    @MainActor
    static func remember(_ choice: NearbyDiscoverabilityChoice) {
        let store = LocationSharingPreferencesStore.shared
        store.preferences = remembering(choice, in: store.preferences)
    }
}

// MARK: - Contrôle

/// Le SECOND opt-in de position — « Rendre ce contenu trouvable à proximité »
/// (spec du 2026-08-02 §2), rendu sous la tuile de lieu du composer.
///
/// Il est INDÉPENDANT du premier opt-in, qui est le lieu choisi lui-même
/// (`metadata.location`, la puce de lieu) et que cette vue ne touche pas. On
/// peut afficher un lieu sans être trouvable, et l'inverse.
///
/// La vue ne décide de rien : `NearbyDiscoverabilityChoice` porte la règle —
/// off par défaut, pré-sélection depuis la mémoire locale, paliers offerts
/// bornés par le grain de partage. Ici on rend cet état et on lui renvoie les
/// gestes. Ce partage est ce qui rend la règle testable sans monter de vue.
///
/// Aucun arrondi n'est calculé nulle part sur ce chemin : le contrôle nomme un
/// grain, la coordonnée part telle quelle, le serveur seul quantifie.
struct NearbyDiscoverabilityControl: View {
    @Binding var choice: NearbyDiscoverabilityChoice
    let accentColor: String

    private var theme: ThemeManager { ThemeManager.shared }

    /// Le `Toggle` reçoit un binding qui passe par le geste du modèle plutôt
    /// que d'écrire le champ : la règle reste au même endroit, et aucun
    /// `.onChange` n'est nécessaire pour la faire respecter.
    private var isDiscoverable: Binding<Bool> {
        Binding(
            get: { choice.isDiscoverable },
            set: { newValue in
                HapticFeedback.light()
                choice.setDiscoverable(newValue)
            }
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            header
            if choice.isDiscoverable {
                tierPicker
                notices
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.md)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(Color(hex: accentColor).opacity(0.08))
        )
        .animation(.easeInOut(duration: 0.18), value: choice.isDiscoverable)
    }

    // MARK: - En-tête

    private var header: some View {
        Toggle(isOn: isDiscoverable) {
            VStack(alignment: .leading, spacing: 2) {
                Text(NearbyDiscoverabilityLabels.title)
                    .font(MeeshyFont.relative(14, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                Text(NearbyDiscoverabilityLabels.subtitle)
                    .font(MeeshyFont.relative(11))
                    .foregroundColor(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .tint(Color(hex: accentColor))
        .accessibilityIdentifier("feed.nearby.consent.toggle")
        .accessibilityHint(NearbyDiscoverabilityLabels.hint)
    }

    // MARK: - Sélecteur de grain

    /// Seuls les paliers OFFERTS sont rendus. Ce qui n'est pas offrable n'est
    /// pas grisé, il est absent : une option désactivée invite à chercher
    /// comment l'activer, alors que la seule réponse est « élargissez votre
    /// partage de position », qui se règle ailleurs.
    private var tierPicker: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.sm) {
                    ForEach(choice.offeredTiers, id: \.self) { tier in
                        tierChip(tier, proxy: proxy)
                            .id(tier)
                    }
                }
                .padding(.vertical, 2)
            }
            // Quatre puces font environ 500 pt de large ; un iPhone en
            // portrait en montre trois. La pré-sélection sans mémoire est
            // `.region`, donc la DERNIÈRE — elle naissait hors écran, et
            // aucune surbrillance n'était visible. L'utilisateur publiait un
            // palier qu'il n'avait jamais vu.
            .onAppear { proxy.scrollTo(choice.tier, anchor: .center) }
        }
    }

    private func tierChip(_ tier: DiscoverabilityPrecision, proxy: ScrollViewProxy) -> some View {
        let isSelected = choice.tier == tier
        return Button {
            HapticFeedback.light()
            choice.select(tier)
            proxy.scrollTo(tier, anchor: .center)
        } label: {
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: NearbyDiscoverabilityLabels.tierIcon(tier))
                    .font(MeeshyFont.relative(11, weight: .semibold))
                    .accessibilityHidden(true)
                Text(NearbyDiscoverabilityLabels.tierTitle(tier))
                    .font(MeeshyFont.relative(12, weight: isSelected ? .semibold : .regular))
                    .lineLimit(1)
            }
            .foregroundColor(isSelected ? .white : theme.textSecondary)
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.sm)
            .background(
                Capsule().fill(
                    isSelected
                        ? Color(hex: accentColor)
                        : Color(hex: accentColor).opacity(0.12)
                )
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(NearbyDiscoverabilityLabels.tierTitle(tier))
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }

    // MARK: - Ce que l'écran DOIT dire

    private var notices: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            if let abandoned = choice.narrowedFrom {
                noticeLine(
                    icon: "exclamationmark.circle",
                    text: NearbyDiscoverabilityLabels.narrowNotice(from: abandoned, to: choice.tier)
                )
            } else if choice.isCappedBySharing {
                noticeLine(
                    icon: "lock.shield",
                    text: NearbyDiscoverabilityLabels.capNotice(finest: choice.finestOfferedTier)
                )
            }
            noticeLine(
                icon: "target",
                text: NearbyDiscoverabilityLabels.appliedNotice(tier: choice.tier)
            )
            noticeLine(icon: "hand.raised", text: NearbyDiscoverabilityLabels.hint)
            if choice.sharedCoordinateIsExact {
                noticeLine(icon: "mappin.and.ellipse", text: NearbyDiscoverabilityLabels.exactBadgeNotice)
            }
        }
    }

    private func noticeLine(icon: String, text: String) -> some View {
        HStack(alignment: .top, spacing: MeeshySpacing.xs) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(10))
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)
            Text(text)
                .font(MeeshyFont.relative(11))
                .foregroundColor(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
