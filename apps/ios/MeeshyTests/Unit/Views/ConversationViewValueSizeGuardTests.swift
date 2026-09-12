import XCTest
@testable import Meeshy

/// **UNE VUE SwiftUI EST UN TYPE VALEUR : SA TAILLE EST UN BUDGET** (#6213 bis).
///
/// ## Ce que cette garde interdit, et qui a été livré
///
/// L'app plantait à l'ouverture de TOUTE conversation, d'un `signal 11` que
/// trois lots successifs ont attribué au démangleur de métadonnées Swift
/// (#5837, #5855, #6194). Le remède — des frontières NOMINALES — était juste,
/// et chaque fois insuffisant : le crash se déplaçait d'un maillon.
///
/// La mesure a fini par dire autre chose. `CrashStackDumper`, instrumenté pour
/// écrire l'adresse fautive et les bornes de pile, a rendu :
///
///     signal 0xb  si_addr=0x16da6bff8  stack_low=0x16da6c000
///
/// L'adresse fautive tombe **huit octets sous le plancher** : page de garde,
/// débordement franc. Et le palmarès des cadres — apparié PAR ADRESSE DE
/// RETOUR, après qu'un appariement par rang eut attribué `bodyContent` à trois
/// niveaux différents — a désigné le tronc, puis la mesure des TYPES a dit
/// pourquoi :
///
///     ConversationView = 15 088 octets
///       ├─ overlayState   7 088   ← six `Message?` EN LIGNE (~1,1 Ko pièce)
///       ├─ composerState  3 897   ← un `Message?`, deux `ComposerSeedTarget?`
///       ├─ scrollState    1 040
///       └─ conversationOverride ~992
///
/// **Ce n'était pas la PROFONDEUR de la pile qui débordait, c'était sa
/// LARGEUR.** Chaque closure du `body` capture la vue en la COPIANT ; une vue
/// de 15 Ko rend chaque cadre proportionnellement énorme — `messageListLayer`,
/// qui en forme une dizaine, en réclamait près de 490 Ko à lui seul, sur une
/// pile principale de 1008 Ko.
///
/// Six copies de `Message` dormaient dans `overlayState` pour n'en servir
/// qu'une : une feuille de détail, un menu et un partage ne s'ouvrent jamais
/// ensemble. `@Indirect` les met sur le tas ; la vue est passée à 5 064 octets
/// et les conversations s'ouvrent — mesuré sur `Services CEO i16pm`, en Debug
/// ET en Release, sur six conversations (`scripts/probe-conversation-open.sh`).
///
/// ## Pourquoi une garde de TAILLE plutôt qu'une garde de profondeur
///
/// `ConversationViewBodyTypeDepthTests` mesure la profondeur des types — elle
/// était VERTE pendant tous ces crashs, parce qu'elle regardait la mauvaise
/// dimension. Un champ de valeur ajouté à l'un de ces états ne change aucune
/// profondeur, ne rougit aucun témoin existant, et rapproche silencieusement
/// la vue du plancher de pile. C'est exactement ainsi que le défaut est
/// revenu trois fois.
final class ConversationViewValueSizeGuardTests: XCTestCase {

    /// Marge choisie sur la mesure : la vue tient à 5 064 octets, le plafond
    /// est à 8 192. Il laisse de la place pour grandir, et rougit BIEN avant
    /// les 15 Ko qui débordaient.
    private static let viewBudget = 8_192

    func test_conversationView_staysWithinItsValueBudget() {
        let size = MemoryLayout<ConversationView>.size
        XCTAssertLessThanOrEqual(
            size, Self.viewBudget,
            """
            `ConversationView` pèse \(size) octets (budget \(Self.viewBudget)).
            Chaque closure de son `body` la COPIE : à 15 Ko, l'ouverture d'une \
            conversation débordait la pile principale de 1008 Ko. Un champ de \
            valeur volumineux vient d'être ajouté à l'un de ses états — \
            marquez-le `@Indirect` (`Indirect.swift`).
            """
        )
    }

    /// Les DEUX états qui portaient onze des quinze kilo-octets. Les garder
    /// séparément dit LEQUEL a grossi, ce que le total seul ne dirait pas.
    func test_overlayState_keepsItsMessagesOnTheHeap() {
        let size = MemoryLayout<ConversationOverlayState>.size
        XCTAssertLessThanOrEqual(
            size, 1_024,
            "`ConversationOverlayState` pèse \(size) octets : il portait six `Message?` EN LIGNE (7 088 o). Un `Message?` nu vient d'y rentrer — `@Indirect`."
        )
    }

    func test_composerState_keepsItsMessagesOnTheHeap() {
        let size = MemoryLayout<ConversationComposerState>.size
        XCTAssertLessThanOrEqual(
            size, 2_048,
            "`ConversationComposerState` pèse \(size) octets (3 897 avant `@Indirect`)."
        )
    }

    /// **LE BUDGET S'APPLIQUE À TOUTES LES VUES RACINES**, pas à la seule qui
    /// a débordé (#6221, suite).
    ///
    /// Le relevé sur appareil a montré que `ConversationView` n'était pas la
    /// plus lourde une fois corrigée — la Lentille l'était, à 10 256 octets,
    /// avec sept `Conversation?` en ligne pour une feuille à la fois. Garder
    /// la seule vue qui a planté aurait laissé passer la suivante :
    ///
    ///     ConversationListView  10 256 → 3 320   (sept `Conversation?`)
    ///     ConversationView      15 088 → 5 064   (celle qui débordait)
    ///     StoryViewerView        7 808           ← non traitée, sous budget
    ///     iPadRootView           7 153           ← non traitée, sous budget
    ///     RootView               4 009
    ///
    /// Les deux dernières lignes sont volontairement AU-DESSOUS du plafond
    /// sans avoir été corrigées : ce témoin dit un budget, pas une cible. Il
    /// rougira si elles grossissent, ce qui est exactement ce qu'on veut
    /// savoir — et pas avant.
    func test_everyRootView_staysWithinItsValueBudget() {
        let mesures: [(String, Int)] = [
            ("ConversationView", MemoryLayout<ConversationView>.size),
            ("ConversationListView", MemoryLayout<ConversationListView>.size),
            ("RootView", MemoryLayout<RootView>.size),
            ("iPadRootView", MemoryLayout<iPadRootView>.size),
            ("StoryViewerView", MemoryLayout<StoryViewerView>.size),
        ]
        let trop = mesures.filter { $0.1 > Self.viewBudget }
        XCTAssertTrue(
            trop.isEmpty,
            """
            Vues hors budget (\(Self.viewBudget) octets) : \(trop.map { "\($0.0)=\($0.1)" }.joined(separator: ", ")).
            Une vue SwiftUI est un type VALEUR que chaque closure de son `body` \
            COPIE. Un champ lourd (`Message` 1 384 o, `Conversation` 992 o) posé \
            en `@State` se paie sur la PILE à chaque rendu — c'est ainsi que \
            l'ouverture d'une conversation débordait les 1008 Ko du thread \
            principal. Regroupez ces champs dans un sac d'état et marquez-les \
            `@Indirect` (motif : `ConversationListSheetTargets`).
            """
        )
    }

    /// LA PRÉMISSE de tout ce qui précède : `Message` est un type valeur lourd.
    /// Si un jour il devient léger, ce lot perd sa raison d'être — et cette
    /// ligne le dira, au lieu de laisser trois budgets arbitraires sans motif.
    func test_message_isHeavyEnoughToJustifyBoxing() {
        XCTAssertGreaterThan(
            MemoryLayout<Message>.size, 256,
            "`Message` est devenu léger : les `@Indirect` de ce lot ne se justifient plus par la taille — relire #6213."
        )
    }

    /// `@Indirect` garde la sémantique de VALEUR (copie à l'écriture) : sans
    /// elle, deux copies d'un état partageraient leur boîte, et SwiftUI — qui
    /// compare l'ancienne valeur à la nouvelle — cesserait de voir les
    /// changements. C'est le risque que l'optimisation introduit ; il se teste.
    @MainActor
    func test_indirect_preservesValueSemanticsOnCopy() {
        var first = ConversationOverlayState()
        first.quickReactionMessageId = "a"
        var second = first
        second.quickReactionMessageId = "b"
        XCTAssertEqual(first.quickReactionMessageId, "a")
        XCTAssertEqual(second.quickReactionMessageId, "b")
    }
}
