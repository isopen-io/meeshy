import Testing
import Foundation
@testable import MeeshySDK

/// Témoins de la précédence du non-lu (#6998).
///
/// Le non-lu vivait en cinq copies sans invariant partagé, trois formules de
/// « total » et deux gates « conversation ouverte ». Ces témoins mesurent la
/// règle UNIQUE qui les remplace — rangs, conversation ouverte, rollback — sur
/// la fonction pure, puis sur le registre qui l'applique.
@Suite("Registre de lecture — précédence")
struct ConversationReadPrecedenceTests {

    private let t0 = Date(timeIntervalSince1970: 1_700_000_000)
    private let t1 = Date(timeIntervalSince1970: 1_700_000_100)

    // MARK: Rang 3 — le compteur servi gagne sur le local

    @Test("Un compteur SERVI remplace le compteur local")
    func serverUnreadWinsOverLocal() {
        let current = ConversationReadEntry(unreadCount: 0)
        let next = ConversationReadPrecedence.resolve(
            current, event: .serverUnread(conversationId: "c1", unreadCount: 7)
        )
        #expect(next.unreadCount == 7)
    }

    @Test("Un compteur serveur aberrant ne descend jamais sous zéro")
    func serverUnreadIsClamped() {
        let next = ConversationReadPrecedence.resolve(
            ConversationReadEntry(unreadCount: 3),
            event: .serverUnread(conversationId: "c1", unreadCount: -5)
        )
        #expect(next.unreadCount == 0)
    }

    // MARK: Rang 2 — monotonie de l'accusé de lecture SERVEUR

    @Test("Un accusé de lecture plus récent avance la frontière et pose son compteur")
    func newerReceiptApplies() {
        let current = ConversationReadEntry(unreadCount: 9, serverLastReadAt: t0)
        let next = ConversationReadPrecedence.resolve(
            current,
            event: .serverReceipt(conversationId: "c1", unreadCount: 0, lastReadAt: t1)
        )
        #expect(next.serverLastReadAt == t1)
        #expect(next.unreadCount == 0)
    }

    /// Le rejeu est jeté EN ENTIER — son compteur avec lui. Un accusé périmé
    /// qui poserait quand même son compte rallumerait la pastille que l'accusé
    /// suivant vient d'éteindre.
    @Test("Un accusé de lecture rejoué est jeté, compteur compris")
    func staleReceiptIsDroppedWholesale() {
        let current = ConversationReadEntry(unreadCount: 0, serverLastReadAt: t1)
        let next = ConversationReadPrecedence.resolve(
            current,
            event: .serverReceipt(conversationId: "c1", unreadCount: 9, lastReadAt: t0)
        )
        #expect(next.serverLastReadAt == t1)
        #expect(next.unreadCount == 0)
    }

    @Test("Un accusé à l'ÉGALITÉ est un rejeu, pas une nouveauté")
    func equalReceiptIsAReplay() {
        let current = ConversationReadEntry(unreadCount: 0, serverLastReadAt: t0)
        let next = ConversationReadPrecedence.resolve(
            current,
            event: .serverReceipt(conversationId: "c1", unreadCount: 4, lastReadAt: t0)
        )
        #expect(next.unreadCount == 0)
    }

    @Test("La première frontière s'installe même sans antécédent")
    func firstReceiptInstalls() {
        let next = ConversationReadPrecedence.resolve(
            ConversationReadEntry(unreadCount: 5),
            event: .serverReceipt(conversationId: "c1", unreadCount: 0, lastReadAt: t0)
        )
        #expect(next.serverLastReadAt == t0)
        #expect(next.unreadCount == 0)
    }

    /// **La frontière serveur ne se compare JAMAIS à `Date()`.**
    ///
    /// Le témoin le mesure là où une comparaison à l'horloge de l'appareil
    /// donnerait le verdict inverse : une frontière serveur DANS LE FUTUR de
    /// l'appareil (téléphone en retard, ou serveur en avance) est parfaitement
    /// légitime et doit s'appliquer. Un résolveur qui la confronterait à
    /// `Date()` la jetterait, et la pastille ne tomberait jamais sur cet
    /// appareil.
    @Test("Une frontière serveur postérieure à l'horloge de l'appareil s'applique")
    func serverFrontierIsNeverComparedToTheDeviceClock() {
        let farFuture = Date().addingTimeInterval(3600)
        let next = ConversationReadPrecedence.resolve(
            ConversationReadEntry(unreadCount: 12),
            event: .serverReceipt(conversationId: "c1", unreadCount: 0, lastReadAt: farFuture)
        )
        #expect(next.unreadCount == 0)
        #expect(next.serverLastReadAt == farFuture)
    }

    // MARK: Rang 4 — les gestes locaux

    @Test("Marquer lu pose zéro immédiatement")
    func localMarkReadZeroes() {
        let next = ConversationReadPrecedence.resolve(
            ConversationReadEntry(unreadCount: 6),
            event: .localMarkRead(conversationId: "c1")
        )
        #expect(next.unreadCount == 0)
    }

    /// Le geste « non lu » EFFACE la frontière serveur. La garder ferait
    /// reconnaître le prochain accusé rejoué comme périmé… et surtout laisserait
    /// le rapprochement de non-lu ramener le compteur à 0 : le geste serait sans
    /// effet, ce qui est le défaut symétrique déjà vu côté cache.
    @Test("Marquer non lu pose au moins 1 et efface la frontière serveur")
    func localMarkUnreadClearsTheFrontier() {
        let next = ConversationReadPrecedence.resolve(
            ConversationReadEntry(unreadCount: 0, serverLastReadAt: t1),
            event: .localMarkUnread(conversationId: "c1")
        )
        #expect(next.unreadCount == 1)
        #expect(next.serverLastReadAt == nil)
    }

    @Test("Marquer non lu une conversation qui en a déjà préserve son compte")
    func localMarkUnreadKeepsAnExistingCount() {
        let next = ConversationReadPrecedence.resolve(
            ConversationReadEntry(unreadCount: 5),
            event: .localMarkUnread(conversationId: "c1")
        )
        #expect(next.unreadCount == 5)
    }

    // Rang 1 — la conversation ouverte — n'est plus dans `resolve` : il se LIT
    // (projection du registre) et ne s'écrit pas (#7350). Ses témoins sont
    // dans `ConversationReadLedgerTotalTests`, au niveau du registre.

    // MARK: Les deux formes de niveau REGISTRE

    @Test("localOpen et snapshot ne touchent pas une entrée : ils sont de niveau registre")
    func setLevelEventsLeaveTheEntryAlone() {
        let current = ConversationReadEntry(unreadCount: 3, serverLastReadAt: t0, isMuted: true)
        #expect(ConversationReadPrecedence.resolve(
            current, event: .localOpen(conversationId: "c1")
        ) == current)
        #expect(ConversationReadPrecedence.resolve(
            current, event: .snapshot(rows: [], source: .server)
        ) == current)
    }
}

@Suite("Registre de lecture — le total unique")
struct ConversationReadLedgerTotalTests {

    private func makeLedger(_ rows: [ConversationReadRow]) -> ConversationReadLedger {
        let ledger = ConversationReadLedger()
        ledger.apply(.snapshot(rows: rows, source: .server))
        return ledger
    }

    private func row(_ id: String, _ count: Int, muted: Bool = false) -> ConversationReadRow {
        ConversationReadRow(conversationId: id, unreadCount: count, isMuted: muted)
    }

    @Test("Sans borne, le total compte tout")
    func totalCountsEverything() {
        let ledger = makeLedger([row("a", 2), row("b", 3, muted: true)])
        #expect(ledger.total(excludingOpen: false, excludingMuted: false) == 5)
    }

    @Test("excludingMuted retire les conversations muettes")
    func totalExcludesMuted() {
        let ledger = makeLedger([row("a", 2), row("b", 3, muted: true)])
        #expect(ledger.total(excludingOpen: false, excludingMuted: true) == 2)
    }

    /// Une conversation muette garde sa pastille de LIGNE ; seul l'agrégat la
    /// tait. Le témoin le dit sur l'entrée, pas sur le total.
    @Test("…sans effacer le compteur de la ligne muette")
    func mutedRowKeepsItsOwnCount() {
        let ledger = makeLedger([row("b", 3, muted: true)])
        #expect(ledger.state(for: "b")?.unreadCount == 3)
        #expect(ledger.state(for: "b")?.isMuted == true)
    }

    @Test("excludingOpen retire la conversation affichée")
    func totalExcludesTheOpenOne() {
        let ledger = makeLedger([row("a", 2), row("b", 3)])
        ledger.apply(.serverUnread(conversationId: "b", unreadCount: 3))
        ledger.apply(.localOpen(conversationId: "a"))
        #expect(ledger.total(excludingOpen: true, excludingMuted: false) == 3)
        #expect(ledger.total(excludingOpen: false, excludingMuted: false) == 5,
                "ouvrir n'est pas lire (#7350) : la borne RETIRE la conversation affichée, elle ne l'a pas effacée")
    }

    // MARK: - D-L1 (#7236) — le badge d'icône compte des CONVERSATIONS

    /// Le témoin DISCRIMINANT : il ne peut pas verdir sur une somme. Trois
    /// conversations non lues dont une à douze messages — la somme dirait 14,
    /// le compte dit 3.
    @Test("Le compte de conversations ne somme pas les messages")
    func conversationTotalCountsConversationsNotMessages() {
        let ledger = makeLedger([row("a", 12), row("b", 1), row("c", 1)])
        #expect(ledger.conversationUnreadTotal(excludingOpen: false) == 3)
        #expect(ledger.total(excludingOpen: false, excludingMuted: false) == 14,
                "la somme des messages reste servie à qui la demande")
    }

    /// Le critère de #7236, à la lettre : trois conversations dont une muette
    /// et une à douze messages ⇒ badge 2.
    @Test("Trois conversations dont une muette et une à douze messages ⇒ 2")
    func conversationTotalExcludesMuted() {
        let ledger = makeLedger([row("a", 12), row("b", 1), row("c", 4, muted: true)])
        #expect(ledger.conversationUnreadTotal(excludingOpen: false) == 2)
    }

    /// Une conversation à zéro non-lu ne pèse rien — sans quoi le badge
    /// compterait les conversations TOUT COURT.
    @Test("Une conversation lue ne compte pas")
    func conversationTotalIgnoresReadRows() {
        let ledger = makeLedger([row("a", 3), row("b", 0), row("c", 2)])
        #expect(ledger.conversationUnreadTotal(excludingOpen: false) == 2)
    }

    /// La conversation AFFICHÉE ne pèse pas sur l'icône : la surface la retire
    /// (`excludingOpen`) et sa ligne se LIT à zéro — le rang 1 est une
    /// projection. Mais le registre GARDE ce que le serveur dit d'elle
    /// (#7350) : ouvrir n'est pas lire, et c'est ce compte que la fermeture
    /// rend à l'icône.
    @Test("La conversation affichée ne compte jamais sur l'icône")
    func conversationTotalNeverCountsTheOpenOne() {
        let ledger = makeLedger([row("a", 2), row("b", 3)])
        ledger.apply(.localOpen(conversationId: "a"))
        ledger.apply(.snapshot(rows: [row("a", 5), row("b", 3)], source: .server))
        #expect(ledger.counts()["a"] == 0, "sa ligne se lit à zéro tant qu'elle est affichée")
        #expect(ledger.state(for: "a")?.unreadCount == 5, "le registre sait ce qui reste à lire")
        #expect(ledger.conversationUnreadTotal(excludingOpen: true) == 1)
    }

    @Test("Le registre ne tient qu'UN openConversationId")
    func singleOpenConversationId() {
        let ledger = makeLedger([row("a", 1), row("b", 1)])
        ledger.apply(.localOpen(conversationId: "a"))
        #expect(ledger.openConversationId == "a")
        ledger.apply(.localOpen(conversationId: "b"))
        #expect(ledger.openConversationId == "b")
        #expect(ledger.state(for: "a")?.isOpen == false)
        #expect(ledger.state(for: "b")?.isOpen == true)
        ledger.apply(.localOpen(conversationId: nil))
        #expect(ledger.openConversationId == nil)
    }

    /// #7350 (I-2) — ce témoin GARDAIT le défaut sous le nom « Refermer une
    /// conversation ne ressuscite aucun non-lu » : il valait parce qu'OUVRIR
    /// avait effacé le compte. Ouvrir n'est pas lire — refermer sans avoir
    /// rien lu rend la conversation au badge, avec le compte qu'elle avait.
    /// Rien n'est inventé : c'est le compte que le serveur a servi, pas le
    /// « 1 » d'`ensureUnread` (#6998).
    @Test("Refermer sans rien lire rend la conversation au badge")
    func closingWithoutReadingCountsItAgain() {
        let ledger = makeLedger([row("a", 4)])
        ledger.apply(.localOpen(conversationId: "a"))
        #expect(ledger.conversationUnreadTotal(excludingOpen: true) == 0)
        ledger.apply(.localOpen(conversationId: nil))
        #expect(ledger.state(for: "a")?.unreadCount == 4)
        #expect(ledger.conversationUnreadTotal(excludingOpen: true) == 1)
    }

    /// Le parcours de la recette : 99 non-lus, 5 affichés, le serveur sert 94
    /// PENDANT l'affichage. L'icône ne compte pas la conversation tant que
    /// l'écran est ouvert, et la compte dès qu'il se ferme — l'API disait
    /// « 1 conversation non lue » pendant que le badge affichait 0 (recette
    /// 2026-09-21, étape 7).
    @Test("Refermer après une lecture partielle garde le compte servi pendant l'affichage")
    func closingAfterAPartialReadKeepsTheServedCount() {
        let ledger = makeLedger([row("a", 99)])
        ledger.apply(.localOpen(conversationId: "a"))
        ledger.apply(.serverUnread(conversationId: "a", unreadCount: 94))
        #expect(ledger.counts()["a"] == 0)
        ledger.apply(.localOpen(conversationId: nil))
        #expect(ledger.counts()["a"] == 94)
        #expect(ledger.conversationUnreadTotal(excludingOpen: true) == 1)
    }

    /// La lecture COMPLÈTE tient : ce n'est pas l'ouverture qui éteint la
    /// conversation, c'est le geste ou l'accusé qui le disent.
    @Test("Refermer après une lecture complète laisse la conversation lue")
    func closingAfterACompleteReadStaysRead() {
        let ledger = makeLedger([row("a", 4)])
        ledger.apply(.localOpen(conversationId: "a"))
        ledger.apply(.localMarkRead(conversationId: "a"))
        ledger.apply(.localOpen(conversationId: nil))
        #expect(ledger.conversationUnreadTotal(excludingOpen: true) == 0)
    }

    // MARK: Rang 1 — une PROJECTION, jamais une écriture (#7350)

    /// Le rang 1 écrivait son zéro DANS l'entrée : un compteur serveur reçu
    /// pendant l'affichage était perdu, et la fermeture rendait 0. Il se LIT
    /// désormais — la ligne affichée montre 0, l'entrée garde ce qui a été
    /// servi.
    @Test("La conversation OUVERTE se lit à zéro, même sur un compteur serveur — et le garde")
    func openConversationReadsZeroButKeepsTheServedCount() {
        let ledger = makeLedger([row("a", 0)])
        ledger.apply(.localOpen(conversationId: "a"))
        ledger.apply(.serverUnread(conversationId: "a", unreadCount: 11))
        #expect(ledger.counts()["a"] == 0)
        #expect(ledger.state(for: "a")?.unreadCount == 11)
        #expect(ledger.state(for: "a")?.isOpen == true)
    }

    @Test("…et sur un accusé de lecture serveur, dont la frontière avance")
    func openConversationReadsZeroOnAReceipt() {
        let t1 = Date(timeIntervalSince1970: 1_700_000_100)
        let ledger = makeLedger([row("a", 0)])
        ledger.apply(.localOpen(conversationId: "a"))
        ledger.apply(.serverReceipt(conversationId: "a", unreadCount: 4, lastReadAt: t1))
        #expect(ledger.counts()["a"] == 0)
        #expect(ledger.state(for: "a")?.unreadCount == 4)
        #expect(ledger.state(for: "a")?.serverLastReadAt == t1, "la frontière avance : elle n'est pas un compteur")
    }

    @Test("…et sur un geste « marquer non lu », qui se voit à la fermeture")
    func openConversationReadsZeroOnMarkUnread() {
        let ledger = makeLedger([row("a", 0)])
        ledger.apply(.localOpen(conversationId: "a"))
        ledger.apply(.localMarkUnread(conversationId: "a"))
        #expect(ledger.counts()["a"] == 0)
        ledger.apply(.localOpen(conversationId: nil))
        #expect(ledger.counts()["a"] == 1)
    }
}

@Suite("Registre de lecture — instantanés et rollback")
struct ConversationReadLedgerSnapshotTests {

    private func row(_ id: String, _ count: Int, muted: Bool = false) -> ConversationReadRow {
        ConversationReadRow(conversationId: id, unreadCount: count, isMuted: muted)
    }

    /// **Le défaut nommé par l'issue.** Une lecture faite sur un AUTRE appareil
    /// pendant que celui-ci dormait n'arrive par aucun socket ; seul un
    /// instantané la rapporte. Le coordinateur distinguait ses deux chemins par
    /// le NOM DE L'APPELANT, et le seul autoritaire ne tournait qu'après un
    /// `fullSync` : le badge restait au compte d'avant.
    @Test("Un instantané SERVEUR remet le compteur d'une conversation déjà suivie")
    func serverSnapshotOverwritesATrackedCount() {
        let ledger = ConversationReadLedger()
        ledger.apply(.serverUnread(conversationId: "a", unreadCount: 6))
        ledger.apply(.snapshot(rows: [row("a", 0)], source: .server))
        #expect(ledger.total(excludingOpen: true, excludingMuted: false) == 0)
    }

    /// Le symétrique, et la raison pour laquelle la source est un discriminant
    /// et non un drapeau de confort : un instantané de CACHE peut être en
    /// retard sur un événement socket qui vient d'atterrir.
    @Test("Un instantané de CACHE ne piétine pas un compteur déjà suivi")
    func cacheSnapshotNeverRegressesATrackedCount() {
        let ledger = ConversationReadLedger()
        ledger.apply(.serverUnread(conversationId: "a", unreadCount: 6))
        ledger.apply(.snapshot(rows: [row("a", 0)], source: .cache))
        #expect(ledger.state(for: "a")?.unreadCount == 6)
    }

    @Test("Un instantané de CACHE SÈME en revanche les conversations inconnues")
    func cacheSnapshotSeedsUnknownConversations() {
        let ledger = ConversationReadLedger()
        ledger.apply(.snapshot(rows: [row("a", 4)], source: .cache))
        #expect(ledger.state(for: "a")?.unreadCount == 4)
    }

    @Test("L'état MUET vient de l'instantané quelle que soit sa source")
    func muteAlwaysComesFromTheSnapshot() {
        let ledger = ConversationReadLedger()
        ledger.apply(.snapshot(rows: [row("a", 4, muted: false)], source: .server))
        ledger.apply(.snapshot(rows: [row("a", 9, muted: true)], source: .cache))
        #expect(ledger.state(for: "a")?.isMuted == true)
        #expect(ledger.state(for: "a")?.unreadCount == 4, "…mais pas le compteur, sur une source cache")
    }

    /// Un instantané SERVEUR dit aussi QUI existe : une conversation quittée,
    /// supprimée ou bannie n'a plus à peser sur l'agrégat.
    @Test("Un instantané SERVEUR retire les conversations qu'il ne nomme plus")
    func serverSnapshotDropsWhatItNoLongerNames() {
        let ledger = ConversationReadLedger()
        ledger.apply(.snapshot(rows: [row("a", 2), row("b", 3)], source: .server))
        ledger.apply(.snapshot(rows: [row("a", 2)], source: .server))
        #expect(ledger.state(for: "b") == nil)
        #expect(ledger.total(excludingOpen: false, excludingMuted: false) == 2)
    }

    /// Un instantané de CACHE peut n'être qu'une PAGE. S'il retirait, chaque
    /// chargement partiel viderait l'agrégat.
    @Test("Un instantané de CACHE ne retire rien")
    func cacheSnapshotNeverDrops() {
        let ledger = ConversationReadLedger()
        ledger.apply(.snapshot(rows: [row("a", 2), row("b", 3)], source: .server))
        ledger.apply(.snapshot(rows: [row("a", 2)], source: .cache))
        #expect(ledger.state(for: "b")?.unreadCount == 3)
    }

    @Test("Un instantané n'allume jamais la conversation ouverte")
    func snapshotNeverLightsTheOpenConversation() {
        let ledger = ConversationReadLedger()
        ledger.apply(.localOpen(conversationId: "a"))
        ledger.apply(.snapshot(rows: [row("a", 8)], source: .server))
        #expect(ledger.counts()["a"] == 0, "la ligne affichée ne se rallume pas")
        #expect(ledger.state(for: "a")?.unreadCount == 8, "…mais le registre garde ce que le serveur a servi (#7350)")
    }

    /// **Le rollback, sans septième cas.** `apply` rend l'entrée d'AVANT ; un
    /// `markAsRead` refusé (4xx) se défait en réappliquant le compteur rendu.
    /// Le rollback est une écriture de plus, qui passe par la même précédence.
    @Test("Le rollback d'un markAsRead refusé restaure le compteur d'avant")
    func rollbackRestoresThePreviousCount() {
        let ledger = ConversationReadLedger()
        ledger.apply(.serverUnread(conversationId: "a", unreadCount: 5))

        let before = ledger.apply(.localMarkRead(conversationId: "a"))
        #expect(ledger.state(for: "a")?.unreadCount == 0)
        #expect(before?.unreadCount == 5, "apply rend l'entrée d'AVANT — c'est elle qui porte le rollback")

        ledger.apply(.serverUnread(conversationId: "a", unreadCount: before?.unreadCount ?? 0))
        #expect(ledger.state(for: "a")?.unreadCount == 5)
    }

    @Test("localOpen et snapshot ne rendent aucune entrée : ils n'en nomment pas une")
    func setLevelEventsReturnNothing() {
        let ledger = ConversationReadLedger()
        #expect(ledger.apply(.localOpen(conversationId: "a")) == nil)
        #expect(ledger.apply(.snapshot(rows: [], source: .server)) == nil)
    }

    /// Quittée, supprimée, bannissement : la LIGNE s'en va, et son non-lu avec
    /// elle — sinon il pèse à vie sur un agrégat que plus rien ne corrigera
    /// (aucun événement n'arrive plus sur une conversation qu'on a quittée).
    @Test("Oublier une conversation retire son non-lu de l'agrégat")
    func forgetDropsTheEntryAndItsWeight() {
        let ledger = ConversationReadLedger()
        ledger.apply(.snapshot(rows: [row("a", 3), row("b", 5)], source: .server))

        let removed = ledger.apply(.forget(conversationId: "a"))

        #expect(removed?.unreadCount == 3, "apply rend l'entrée retirée")
        #expect(ledger.state(for: "a") == nil)
        #expect(ledger.total(excludingOpen: false, excludingMuted: false) == 5)
    }

    /// L'appelant a besoin de distinguer « j'ai retiré quelque chose » de
    /// « il n'y avait rien » : c'est ce qui lui évite de réveiller un débounce
    /// — donc une écriture de badge et de widget — pour un id inconnu.
    @Test("Oublier une conversation inconnue ne rend rien")
    func forgettingAnUnknownConversationReturnsNothing() {
        let ledger = ConversationReadLedger()
        #expect(ledger.apply(.forget(conversationId: "jamais-vue")) == nil)
    }

    /// Oublier la conversation OUVERTE relâche aussi le curseur : le garder
    /// pointé sur une ligne disparue ferait exclure du total une conversation
    /// qui n'existe plus, et masquerait la suivante à porter le même id.
    @Test("Oublier la conversation ouverte relâche le curseur")
    func forgettingTheOpenConversationReleasesTheCursor() {
        let ledger = ConversationReadLedger()
        ledger.apply(.snapshot(rows: [row("a", 1)], source: .server))
        ledger.apply(.localOpen(conversationId: "a"))

        ledger.apply(.forget(conversationId: "a"))

        #expect(ledger.openConversationId == nil)
    }

    @Test("counts() projette chaque ligne SANS borne — une muette garde sa pastille")
    func countsProjectsEveryRow() {
        let ledger = ConversationReadLedger()
        ledger.apply(.snapshot(rows: [row("a", 2), row("b", 5, muted: true)], source: .server))
        ledger.apply(.localOpen(conversationId: "a"))

        #expect(ledger.counts() == ["a": 0, "b": 5],
                "a est ouverte donc lue (0) ; b est muette mais garde son compte de LIGNE")
    }

    @Test("La purge de session vide le registre et relâche la conversation ouverte")
    func resetClearsEverything() {
        let ledger = ConversationReadLedger()
        ledger.apply(.snapshot(rows: [row("a", 3)], source: .server))
        ledger.apply(.localOpen(conversationId: "a"))
        ledger.reset()
        #expect(ledger.state(for: "a") == nil)
        #expect(ledger.openConversationId == nil)
        #expect(ledger.total(excludingOpen: false, excludingMuted: false) == 0)
    }
}
