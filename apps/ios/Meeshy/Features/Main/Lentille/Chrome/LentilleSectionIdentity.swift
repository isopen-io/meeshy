import Foundation
import MeeshySDK

/// Identité de liste des sections PROPRES à la Lentille — `EN DIRECT` et les
/// quatre sections temporelles (`AUJOURD'HUI`, `HIER`, `CETTE SEMAINE`,
/// `PLUS ANCIEN`) émises par `LentilleSectionResolver` (loi E5, neuve sur les
/// trois plateformes).
///
/// **Pourquoi ce fichier existe.** La greffe LWS-5/I-060 a documenté un écart :
/// le résolveur produit `.live` et `.temporal(kind:)`, mais la liste iOS
/// classe ses sections par `MeeshyConversationSection` (SDK, `CoreModels.swift`,
/// GELÉ S1 — on ne lui ajoute rien). Faute d'identité, I-060 repliait
/// provisoirement ces deux buckets sur `.other` « jusqu'à ce que LWS-6 décide
/// comment les exposer ». LWS-6/I-062 décide ici : ces sections reçoivent une
/// identité PROPRE, construite depuis l'initialiseur PUBLIC du type SDK — donc
/// sans toucher au paquet gelé — et le repli sur `.other` disparaît.
///
/// **Trois propriétés portées par l'identité, pas par un `if` dispersé.**
/// 1. `id` préfixé `lentille.` : aucune collision possible avec un id de
///    catégorie utilisateur (ids serveur) ni avec les sections statiques du SDK
///    (`pinned`, `work`, `family`, `friends`, `groups`, `other`), et surtout un
///    prédicat de reconnaissance en UNE ligne (`isLentilleOnly`) qui restera
///    juste le jour où un sixième bucket apparaîtra.
/// 2. **Jamais une cible de drop.** Déposer une conversation sur « HIER » n'a
///    aucun sens : la borne temporelle est CALCULÉE depuis `lastMessageAt`, pas
///    assignable. Or `ChipDropResolver` (`ConversationListView+Overlays.swift`,
///    possédé par LWS-8) traduit tout id de section non `pinned`/`other` en
///    `moveToSection(sectionId:)` — un drop sur « HIER » écrirait
///    `sectionId = "lentille.yesterday"` dans l'état utilisateur, une catégorie
///    fantôme. La Lentille se protège donc en amont : ces sections
///    n'enregistrent pas de frame et refusent le drop (`ConversationListView`
///    `acceptsSectionDrop` / `SectionDropDelegate.acceptsDrop`), sans jamais
///    demander au résolveur de drop de connaître la Lentille.
/// 3. **Jamais repliables.** `toggleSection` ne persiste que les catégories
///    utilisateur (`persistCategoryExpansion`, E4) : un « HIER » replié ne
///    survivrait à aucun rechargement et se rouvrirait tout seul. Un contrôle
///    dont l'état ne se persiste pas est pire que pas de contrôle — ces
///    sections sont donc rendues avec un sticker NON interactif
///    (`LentilleSticker(onToggle: nil)`), et leur contenu est toujours visible.
///    Le pliage du contrat (« replier une catégorie masque ses rangs et
///    conserve son sticker ») reste EXACTEMENT celui d'aujourd'hui pour
///    `pinned` et les catégories utilisateur.
///
/// `icon`/`color` sont exigés par `MeeshyConversationSection` mais INERTES sous
/// la Lentille : le header rendu sous drapeau ON est un `LentilleSticker`, qui
/// ne lit que le libellé. Ils reprennent donc les valeurs de la section `other`
/// du SDK plutôt qu'une palette inventée ici — aucune cote, aucune couleur
/// nouvelle (garde R15). Sous drapeau OFF ces sections n'existent pas du tout :
/// `groupConversations` ne les produit que dans sa branche Lentille.
///
/// `nonisolated` : type utilitaire pur — la cible app infère `@MainActor` par
/// défaut (`SWIFT_DEFAULT_ACTOR_ISOLATION`) et le bundle `MeeshyTests` compile
/// en `nonisolated` (même précédent que `LentilleSectionResolver`).
nonisolated enum LentilleSectionIdentity {

    /// Préfixe d'espace de noms des sections propres à la Lentille. Sert de
    /// prédicat : tout ce qui le porte est CALCULÉ par la loi (jamais
    /// assignable, jamais persisté), tout le reste est `pinned` ou une
    /// catégorie utilisateur.
    static let idPrefix = "lentille."

    static let liveId = idPrefix + "live"
    static let todayId = idPrefix + "today"
    static let yesterdayId = idPrefix + "yesterday"
    static let thisWeekId = idPrefix + "thisWeek"
    static let olderId = idPrefix + "older"

    /// Une section produite par la loi Lentille (`live`/`temporal`) plutôt que
    /// par l'état utilisateur (`pinned`, catégories). Prédicat de PRÉFIXE, pas
    /// une liste à tenir à jour.
    static func isLentilleOnly(sectionId: String) -> Bool {
        sectionId.hasPrefix(idPrefix)
    }

    /// Toutes les identités propres à la Lentille — l'ensemble que les gardes
    /// d'exhaustivité comparent aux montages (leçon 257 : une garde en égalité
    /// d'ensembles attrape le membre ajouté demain, une garde de présence non).
    static var allSections: [MeeshyConversationSection] {
        [live] + LentilleSectionResolver.TemporalSectionKind.allCases.map(section(for:))
    }

    /// « EN DIRECT » — appels en cours. Le résolveur ne peuple ce bucket que
    /// si la conversation porte un `liveCall`, ce qu'aucune plateforme ne
    /// modélise encore (contrat §0/E13, greffe I-060 : `liveCall: nil`) : la
    /// section existe, ordonnée juste après les épinglées, et restera vide
    /// jusqu'à ce que le modèle d'appel arrive.
    static var live: MeeshyConversationSection {
        MeeshyConversationSection(
            id: liveId,
            name: String(localized: "lentille.section.live", defaultValue: "En direct", bundle: .main),
            icon: inertIcon,
            color: inertColor,
            order: liveOrder
        )
    }

    /// Identité de la section temporelle `kind`. `order` suit l'ordre de rendu
    /// de la loi (`today` → `yesterday` → `thisWeek` → `older`) et se place
    /// APRÈS les catégories utilisateur, comme le résolveur les émet.
    static func section(for kind: LentilleSectionResolver.TemporalSectionKind) -> MeeshyConversationSection {
        MeeshyConversationSection(
            id: id(for: kind),
            name: name(for: kind),
            icon: inertIcon,
            color: inertColor,
            order: order(for: kind)
        )
    }

    static func id(for kind: LentilleSectionResolver.TemporalSectionKind) -> String {
        switch kind {
        case .today: return todayId
        case .yesterday: return yesterdayId
        case .thisWeek: return thisWeekId
        case .older: return olderId
        }
    }

    // MARK: - Libellés

    /// Libellés en casse normale : la MAJUSCULE est le fait du sticker
    /// (`LentilleSticker.displayTitle`, §4.3 « majuscules »), jamais de la
    /// donnée — un libellé déjà crié ne peut plus être réutilisé ailleurs.
    /// `defaultValue` inline : aucune entrée de catalogue à créer pour rendre
    /// ces titres (même patron que `conversation.rename.title` dans
    /// `ConversationListView.swift`).
    private static func name(for kind: LentilleSectionResolver.TemporalSectionKind) -> String {
        switch kind {
        case .today:
            return String(localized: "lentille.section.today", defaultValue: "Aujourd'hui", bundle: .main)
        case .yesterday:
            return String(localized: "lentille.section.yesterday", defaultValue: "Hier", bundle: .main)
        case .thisWeek:
            return String(localized: "lentille.section.thisWeek", defaultValue: "Cette semaine", bundle: .main)
        case .older:
            return String(localized: "lentille.section.older", defaultValue: "Plus ancien", bundle: .main)
        }
    }

    // MARK: - Champs inertes sous la Lentille

    /// Le header Lentille est un `LentilleSticker` : il ne lit ni icône ni
    /// couleur. Reprises du SDK plutôt qu'inventées — voir la note de type.
    private static var inertIcon: String { MeeshyConversationSection.other.icon }
    private static var inertColor: String { MeeshyConversationSection.other.color }

    // MARK: - Ordres

    /// Juste après `pinned` (0) et avant les catégories utilisateur : l'ordre
    /// de rendu réel vient du résolveur, `order` n'est là que pour rester
    /// cohérent si une vue tierce trie un jour par ce champ.
    private static let liveOrder = 1

    /// Après `other` (5) du SDK — les sections temporelles ferment la liste.
    private static func order(for kind: LentilleSectionResolver.TemporalSectionKind) -> Int {
        switch kind {
        case .today: return 6
        case .yesterday: return 7
        case .thisWeek: return 8
        case .older: return 9
        }
    }
}
