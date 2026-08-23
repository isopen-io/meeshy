import SwiftUI
import MeeshySDK
import MeeshyUI

/// Entrée du rail « vivants » de la Lentille — fusion `StoryTrayView` +
/// conversations vivantes (contrat LWS-6, point 5). Modèle d'ENTRÉE minimal,
/// propriété de cette vue Chrome PURE : le mappage depuis les données réelles
/// (stories, appels en direct) est le travail de la peau qui MONTE ce rail
/// (LWS-6/I-063), pas de cette micro-tâche.
///
/// `nonisolated` : type de données pur, aucune dépendance UI — la cible app
/// infère `@MainActor` par défaut (`SWIFT_DEFAULT_ACTOR_ISOLATION`), et sans
/// cette sortie explicite les tests nonisolated du bundle `MeeshyTests` ne
/// pourraient ni le construire ni le comparer sans `await` (même précédent
/// que `LentilleSectionResolver.SectionableConversation`).
nonisolated public struct LentilleRailEntry: Identifiable, Equatable, Sendable {
    public let id: String
    public let displayName: String
    public let avatarURL: String?
    /// Anneau pulsé (§4.3 « anneau 3.5 (pulsé si live) ») — `true`
    /// UNIQUEMENT pour un direct effectivement en cours, jamais un badge
    /// décoratif. La PULSATION elle-même (animation) est un raffinement du
    /// montage (LWS-6/I-063) : cette vue pure ne fait que teindre l'anneau
    /// différemment, sans introduire d'état d'animation ici.
    public let isLive: Bool
    /// Couverture de la DERNIÈRE story du groupe — résolue par le MÊME
    /// helper que le tray (`latestStoryThumbnailURL`, StoryTrayView.swift),
    /// jamais recalculée ici : la vue n'a pas à connaître le cache de
    /// couvertures locales ni l'ordre de préférence
    /// (cover composite locale > `thumbnailUrl` serveur > `url` image >
    /// avatar). `nil` ⇒ repli sur `avatarURL`.
    public let previewURL: String?
    /// Humeur courante de l'auteur, DÉJÀ résolue par l'appelant
    /// (`StatusViewModel.statusForUser`). Cette vue Chrome est PURE : lui
    /// injecter le view model violerait son contrat.
    public let moodEmoji: String?
    /// Au moins une story non vue ⇒ anneau ACCENTUÉ. Le rail peignait tout
    /// en gris depuis sa création (I-063) : l'état vu/non-vu, que le tray
    /// rend depuis toujours, était simplement perdu en route.
    public let hasUnviewed: Bool
    /// Teinte de l'auteur (`StoryGroup.avatarColor`) pour le repli
    /// INITIALES. Sans elle un auteur sans avatar ni couverture rendait un
    /// cercle VIDE — le défaut le plus visible du rail avant ce lot.
    public let accentColor: String

    public init(
        id: String,
        displayName: String,
        avatarURL: String? = nil,
        previewURL: String? = nil,
        moodEmoji: String? = nil,
        hasUnviewed: Bool = false,
        accentColor: String = "",
        isLive: Bool = false
    ) {
        self.id = id
        self.displayName = displayName
        self.avatarURL = avatarURL
        self.previewURL = previewURL
        self.moodEmoji = moodEmoji
        self.hasUnviewed = hasUnviewed
        self.accentColor = accentColor
        self.isLive = isLive
    }
}

/// Entrée « moi » du rail — la moitié PERSONNELLE de la fusion
/// `StoryTrayView` + vivants (arbitrage LWS-6/I-063bis). Toujours rendue en
/// PREMIÈRE pastille, et hors de la borne des `≤ 6` : cette borne compte les
/// AUTRES, exactement comme le tray comptait les autres à droite de son bouton
/// « moi ».
///
/// Aucune décision de routage ici : la vue expose deux gestes (la pastille, sa
/// pastille de mood) et l'appelant y branche les chemins qui existent déjà.
///
/// `nonisolated` — même raison que `LentilleRailEntry`.
nonisolated public struct LentilleRailSelfEntry: Equatable, Sendable {
    public let displayName: String
    public let avatarURL: String?
    /// Mood courant s'il existe — la pastille secondaire l'affiche, comme le
    /// bouton « moi » du tray ; à défaut elle affiche un `+`.
    public let moodEmoji: String?
    /// Anneau accentué = au moins une story ACTIVE (jamais un historique
    /// entièrement expiré, dont le viewer se refermerait aussitôt).
    public let hasActiveStory: Bool
    /// Annonce VoiceOver du tap — fournie par l'appelant, qui la tient de la
    /// MÊME règle que le routage (`StoryTrayActionResolver`). Le libellé et la
    /// destination ne peuvent donc pas diverger (régression déjà vécue côté
    /// tray : « Changer mon mood » annoncé pour un tap qui ouvrait le
    /// composeur). `nil` ⇒ repli sur le nom affiché.
    public let actionLabel: String?
    /// Couverture de MA story active — même helper, même repli que les
    /// autres pastilles (parité avec `MyStoryButton` du tray, qui affiche
    /// déjà la miniature de ma dernière story).
    public let previewURL: String?
    /// Ma teinte, pour le repli INITIALES (même raison que
    /// `LentilleRailEntry.accentColor`).
    public let accentColor: String

    public init(
        displayName: String,
        avatarURL: String? = nil,
        previewURL: String? = nil,
        accentColor: String = "",
        moodEmoji: String? = nil,
        hasActiveStory: Bool = false,
        actionLabel: String? = nil
    ) {
        self.displayName = displayName
        self.avatarURL = avatarURL
        self.previewURL = previewURL
        self.accentColor = accentColor
        self.moodEmoji = moodEmoji
        self.hasActiveStory = hasActiveStory
        self.actionLabel = actionLabel
    }
}

/// Politique pure du rail — testable indépendamment de tout rendu SwiftUI.
/// `nonisolated` — même précédent que `LentilleRailEntry` ci-dessus.
nonisolated public enum LentilleRailPolicy {
    /// `≤ 6` entrées (`LentilleMetrics.Rail.maxEntries`, §4.3) — troncature
    /// simple, jamais un filtrage arbitraire : l'ordre et la sélection des
    /// entrées visibles sont la responsabilité de l'appelant.
    public static func visibleEntries(_ entries: [LentilleRailEntry]) -> [LentilleRailEntry] {
        Array(entries.prefix(LentilleMetrics.Rail.maxEntries))
    }

    /// Masqué si vide (règle explicite du workshop) — la vue rend
    /// `EmptyView` plutôt qu'un rail vide avec un fond visible.
    public static func shouldRender(_ entries: [LentilleRailEntry]) -> Bool {
        !visibleEntries(entries).isEmpty
    }

    /// Depuis la fusion (I-063bis), « vide » veut dire : NI moi, NI personne.
    /// Tant qu'il y a une entrée « moi » le rail est rendu — le tray était lui
    /// aussi toujours là, et faire disparaître le seul chemin vers « mes
    /// stories » et « mon statut » parce que personne d'autre n'a publié serait
    /// une régression, pas une épure.
    public static func shouldRender(selfEntry: LentilleRailSelfEntry?, entries: [LentilleRailEntry]) -> Bool {
        selfEntry != nil || shouldRender(entries)
    }

    /// Anneau ACCENTUÉ = « il y a quelque chose à voir ». Deux causes, une
    /// seule règle : un direct en cours, ou au moins une story non vue —
    /// exactement la sémantique du tray (`StoryRingCell` :
    /// `storyState: group.hasUnviewed ? .unread : .read`). Tout vu ⇒ anneau
    /// SOURD, jamais absent : la pastille reste une porte ouverte.
    public static func ringIsAccented(_ entry: LentilleRailEntry) -> Bool {
        entry.isLive || entry.hasUnviewed
    }
}

/// Rail vivants & stories de la Lentille (contrat LWS-6, §4.3 colonne
/// « Liste ») — pastille `48`, anneau `3.5`, `≤ 6` entrées, masquée si vide.
///
/// Vue PURE : `entries` est injecté par l'appelant, aucun `@State` de
/// défilement, aucun observateur — `PinnedStoryTrailBand` reste, comme le veut
/// le contrat, du ressort du montage (LWS-6/I-063), jamais de cette vue.
///
/// `onSelect` (LWS-6/I-063) : le rail ne DÉCIDE rien du routage, il le
/// délègue. Le montage lui passe exactement le chemin d'aujourd'hui
/// (`onStoryViewRequest?(userId, true)`, le même que `StoryTrayView`) — « le
/// routage tap story : inchangé ». `Button(.plain)` + `.contentShape`, jamais
/// `.onTapGesture` (règle dure du workshop : le tap serait avalé par le long
/// press du conteneur).
///
/// Toutes les cotes viennent de `LentilleMetrics.Rail` — aucun littéral de
/// loi en dur ici (garde R15).
public struct StoriesVivantsRail: View {

    /// La moitié « moi » de la fusion — PREMIÈRE pastille, hors de la borne
    /// des `≤ 6`. `nil` = pas d'utilisateur résolu (le rail retombe alors sur
    /// les seules autres pastilles).
    public var selfEntry: LentilleRailSelfEntry?
    public let entries: [LentilleRailEntry]
    public var onSelect: ((String) -> Void)?
    /// Tap sur « moi » — l'appelant y branche la règle EXISTANTE
    /// (`StoryTrayActionResolver.avatarTap`), le rail n'en connaît rien.
    public var onSelectSelf: (() -> Void)?
    /// Tap sur la pastille de mood de « moi » — le composeur de statut, même
    /// chemin qu'aujourd'hui.
    public var onSelfMoodTap: (() -> Void)?
    /// Le (+) de l'entrée « moi » — ouvre le composeur de story DIRECTEMENT,
    /// comme le bouton haut-gauche du tray historique (`MyStoryButton`). Le
    /// tap sur l'avatar lui-même (`onSelectSelf`) ouvre le LISTING de mes
    /// stories et brouillons (retour user 2026-08-21).
    public var onSelfCreateStory: (() -> Void)?

    public init(
        selfEntry: LentilleRailSelfEntry? = nil,
        entries: [LentilleRailEntry],
        onSelect: ((String) -> Void)? = nil,
        onSelectSelf: (() -> Void)? = nil,
        onSelfMoodTap: (() -> Void)? = nil,
        onSelfCreateStory: (() -> Void)? = nil
    ) {
        self.selfEntry = selfEntry
        self.entries = entries
        self.onSelect = onSelect
        self.onSelectSelf = onSelectSelf
        self.onSelfMoodTap = onSelfMoodTap
        self.onSelfCreateStory = onSelfCreateStory
    }

    @ViewBuilder
    public var body: some View {
        let visible = LentilleRailPolicy.visibleEntries(entries)
        if !LentilleRailPolicy.shouldRender(selfEntry: selfEntry, entries: entries) {
            EmptyView()
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.sm) {
                    if let selfEntry {
                        LentilleRailSelfEntryView(
                            entry: selfEntry,
                            onSelect: onSelectSelf,
                            onMoodTap: onSelfMoodTap,
                            onCreateStory: onSelfCreateStory
                        )
                    }
                    ForEach(visible) { entry in
                        LentilleRailEntryView(entry: entry, onSelect: onSelect)
                    }
                }
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.vertical, LentilleMetrics.Rail.paddingVertical)
            }
        }
    }
}

/// Pastille « moi » — même géométrie que les autres (`LentilleMetrics.Rail`),
/// plus la pastille de mood qui ouvre le composeur de statut. Deux
/// `Button(.plain)` distincts, jamais un `.onTapGesture` : c'est la paire
/// (avatar, mood) que `MeeshyAvatar` offre déjà au bouton « moi » du tray,
/// rendue avec les cotes du rail.
private struct LentilleRailSelfEntryView: View {
    let entry: LentilleRailSelfEntry
    var onSelect: (() -> Void)?
    var onMoodTap: (() -> Void)?
    var onCreateStory: (() -> Void)?

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        VStack(spacing: MeeshySpacing.xs) {
            ZStack(alignment: .bottomTrailing) {
                Button { onSelect?() } label: { pastille }
                    .buttonStyle(.plain)
                    .contentShape(Circle())
                    .accessibilityLabel(entry.actionLabel ?? entry.displayName)

                if let onMoodTap {
                    Button(action: onMoodTap) { moodBadge }
                        .buttonStyle(.plain)
                        .contentShape(Circle())
                        .accessibilityLabel(StoryTrayCopy.changeMood)
                }
            }
            // (+) haut-gauche = créer une story, comme le tray historique
            // (`MyStoryButton`) : le badge bas-droit reste le MOOD (💭 /
            // emoji), jamais un second « plus » ambigu.
            .overlay(alignment: .topLeading) {
                if let onCreateStory {
                    Button(action: onCreateStory) { createStoryBadge }
                        .buttonStyle(.plain)
                        .contentShape(Circle())
                        .accessibilityLabel(StoryTrayCopy.addStory)
                }
            }

            Text(entry.displayName)
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                .foregroundColor(MeeshyColors.textSecondary(isDark: isDark))
                .lineLimit(1)
                .frame(width: LentilleMetrics.Rail.size)
        }
    }

    private var pastille: some View {
        ZStack {
            Circle()
                .strokeBorder(ringColor, lineWidth: LentilleMetrics.Rail.ringWidth)
                .frame(width: LentilleMetrics.Rail.size, height: LentilleMetrics.Rail.size)

            avatarContent
        }
    }

    /// `animates: false` — DÉLIBÉRÉ. La borne d'animation du rail est
    /// `LentilleMetrics.Rail.maxEntries`, et la pastille « moi » vit HORS de
    /// cette borne (contrat du rail) : la faire respirer porterait le cumul de
    /// ressorts `repeatForever` au-delà du budget. Elle est par ailleurs un
    /// BOUTON — un contrôle qui respire est du bruit, pas une information.
    /// Le glyphe passe quand même par l'atome partagé : une seule écriture de
    /// la pastille d'humeur dans toute l'app.
    private var moodBadge: some View {
        ZStack {
            Circle()
                .fill(MeeshyColors.backgroundSecondary(isDark: isDark))
                .frame(width: badgeDiameter, height: badgeDiameter)

            if let moodEmoji = entry.moodEmoji, !moodEmoji.isEmpty {
                MeeshyMoodBadge(emoji: moodEmoji, diameter: badgeDiameter, animates: false)
                    .allowsHitTesting(false)
            } else {
                // Pas de mood ⇒ la bulle de pensée 💭 (« penser une idée »),
                // même glyphe que le tray historique — le « + » disait
                // « ajouter » sans dire quoi (retour user 2026-08-21).
                Text("\u{1F4AD}")
                    .font(MeeshyFont.relative(LentilleMetrics.Tags.emojiSize))
            }
        }
    }

    private var createStoryBadge: some View {
        Image(systemName: "plus")
            .font(MeeshyFont.relative(LentilleMetrics.Tags.emojiSize, weight: .bold))
            .foregroundStyle(Color.white)
            .frame(width: badgeDiameter, height: badgeDiameter)
            .background(
                Circle()
                    .fill(MeeshyColors.brandGradient)
                    .overlay(Circle().stroke(MeeshyColors.backgroundSecondary(isDark: isDark), lineWidth: 1.5))
            )
    }

    /// Dérivé de l'anneau du rail, jamais une cote nouvelle (garde R15) : la
    /// pastille de mood fait la place laissée par l'anneau, de part et d'autre.
    private var badgeDiameter: CGFloat {
        LentilleMetrics.Rail.ringWidth * 2 + LentilleMetrics.Tags.emojiSize
    }

    private var avatarDiameter: CGFloat {
        LentilleMetrics.Rail.size - LentilleMetrics.Rail.ringWidth * 2
    }

    private var ringColor: Color {
        entry.hasActiveStory ? MeeshyColors.brandPrimary : MeeshyColors.textMuted(isDark: isDark)
    }

    /// Ma couverture de story d'abord, mon avatar ensuite — la cascade est
    /// résolue par l'appelant (même helper que le tray). `CachedAvatarImage`
    /// sert le cache chaud ET le repli INITIALES : le rail ne peut plus
    /// rendre un cercle vide.
    private var avatarContent: some View {
        CachedAvatarImage(
            urlString: entry.previewURL ?? entry.avatarURL,
            name: entry.displayName,
            size: avatarDiameter,
            accentColor: resolvedAccent
        )
    }

    private var resolvedAccent: String {
        entry.accentColor.isEmpty
            ? DynamicColorGenerator.colorForName(entry.displayName)
            : entry.accentColor
    }
}

/// Rendu d'une entrée du rail — sous-vue privée, jamais montée seule.
private struct LentilleRailEntryView: View {
    let entry: LentilleRailEntry
    var onSelect: ((String) -> Void)?

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    @ViewBuilder
    var body: some View {
        if let onSelect {
            Button { onSelect(entry.id) } label: { pastille }
                .buttonStyle(.plain)
                .contentShape(Rectangle())
                .accessibilityLabel(entry.displayName)
        } else {
            pastille
        }
    }

    private var pastille: some View {
        VStack(spacing: MeeshySpacing.xs) {
            ZStack {
                Circle()
                    .strokeBorder(ringColor, lineWidth: LentilleMetrics.Rail.ringWidth)
                    .frame(width: LentilleMetrics.Rail.size, height: LentilleMetrics.Rail.size)

                avatarContent
            }
            .overlay(alignment: .bottomTrailing) { moodBadge }

            Text(entry.displayName)
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                .foregroundColor(MeeshyColors.textSecondary(isDark: isDark))
                .lineLimit(1)
                .frame(width: LentilleMetrics.Rail.size)
        }
    }

    /// L'humeur de l'auteur, telle que le tray la rend déjà
    /// (`StoryRingCell` → `MeeshyAvatar(moodEmoji:)`). DÉCORATIVE ici : le
    /// geste de la pastille appartient au bouton qui l'englobe, et le libellé
    /// VoiceOver reste celui de la personne — un emoji lu à voix haute
    /// n'ajoute rien à « ouvrir les stories d'Ana ».
    ///
    /// `animates: true` dans la borne des `≤ maxEntries` entrées visibles
    /// (`LentilleRailPolicy.visibleEntries`) : c'est ce qui plafonne le cumul
    /// de ressorts `repeatForever`. Le ressort lui-même, et son portillon
    /// Reduce Motion, vivent dans l'atome — jamais ici.
    @ViewBuilder
    private var moodBadge: some View {
        if let moodEmoji = entry.moodEmoji, !moodEmoji.isEmpty {
            MeeshyMoodBadge(emoji: moodEmoji, diameter: badgeDiameter, animates: true)
                .background(
                    Circle().fill(MeeshyColors.backgroundSecondary(isDark: isDark))
                )
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }

    private var avatarDiameter: CGFloat {
        LentilleMetrics.Rail.size - LentilleMetrics.Rail.ringWidth * 2
    }

    /// Dérivé de l'anneau du rail, jamais une cote nouvelle (garde R15) —
    /// même dérivation que la pastille « moi », pour que les deux badges
    /// aient exactement le même diamètre.
    private var badgeDiameter: CGFloat {
        LentilleMetrics.Rail.ringWidth * 2 + LentilleMetrics.Tags.emojiSize
    }

    private var ringColor: Color {
        LentilleRailPolicy.ringIsAccented(entry)
            ? MeeshyColors.brandPrimary
            : MeeshyColors.textMuted(isDark: isDark)
    }

    /// La couverture de la dernière story d'abord, l'avatar ensuite — la
    /// cascade est résolue en amont par le MÊME helper que le tray.
    /// `CachedAvatarImage` sert le cache chaud ET le repli INITIALES : plus
    /// aucun cercle vide, quel que soit l'auteur.
    private var avatarContent: some View {
        CachedAvatarImage(
            urlString: entry.previewURL ?? entry.avatarURL,
            name: entry.displayName,
            size: avatarDiameter,
            accentColor: resolvedAccent
        )
    }

    private var resolvedAccent: String {
        entry.accentColor.isEmpty
            ? DynamicColorGenerator.colorForName(entry.displayName)
            : entry.accentColor
    }
}
