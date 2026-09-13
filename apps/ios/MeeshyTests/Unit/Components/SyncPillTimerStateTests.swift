import XCTest
@testable import Meeshy

/// Audit backlog 2026-07-20, lane "Perf divers" (P2) — `SyncPill.dotTimer`
/// was declared `private let dotTimer = Timer.publish(...).autoconnect()`
/// on a `struct View`. A plain stored `let` re-evaluates its initializer
/// every time SwiftUI reconstructs the view value (any unrelated re-render
/// of the parent `ConnectionBanner`), handing `.onReceive` a brand-new,
/// not-yet-ticked publisher each time. When reconstructions arrive faster
/// than the 0.5s interval, the timer never survives long enough to fire and
/// the pulsing dot / activity ellipsis freeze. `@State`'s initializer runs
/// once per view identity, so the same connected publisher persists across
/// re-renders — this is a source-guard locking the property wrapper.
@MainActor
final class SyncPillTimerStateTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Components/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Components/SyncPill.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_syncPill_declaresDotTimerAsState() throws {
        let source = try source()
        XCTAssertTrue(
            source.contains("@State private var dotTimer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()"),
            "SyncPill.dotTimer must be @State — a plain `let` gets re-initialized " +
            "(a fresh, not-yet-ticked Timer publisher) on every reconstruction of " +
            "this View value, which can starve the 0.5s interval and freeze the " +
            "pulsing dot / activity ellipsis."
        )
        XCTAssertFalse(
            source.contains("private let dotTimer = Timer.publish"),
            "SyncPill.dotTimer must not be a `let` — see @State requirement above."
        )
    }

    // MARK: - L'accent est ABANDONNÉ, pas oublié (#4018 / #4026 / #4050)

    /// Tous les fichiers de l'unité `SyncPill*`, énumérés par GLOB.
    ///
    /// Une LISTE écrite à la main se périmerait en silence : un
    /// `SyncPillAccent.swift` ajouté demain n'y figurerait pas, la garde
    /// resterait verte, et elle ne garderait plus rien. C'est le mode d'échec
    /// que les gardes NÉGATIVES ont en propre — elles passent au vert en
    /// perdant leur protection.
    private func unitSources() throws -> [(name: String, text: String)] {
        let dossier = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Components/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Components")
        let fichiers = try FileManager.default
            .contentsOfDirectory(at: dossier, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "swift"
                && $0.deletingPathExtension().lastPathComponent.hasPrefix("SyncPill") }
        XCTAssertFalse(fichiers.isEmpty, "le glob ne trouve plus AUCUN fichier SyncPill* — la garde ne mesure rien")
        return try fichiers.map { ($0.lastPathComponent, try String(contentsOf: $0, encoding: .utf8)) }
    }

    /// **La pastille s'accentue à l'annonce de frappe — par UNE loi, et plus
    /// jamais par une fenêtre d'accent.**
    ///
    /// L'histoire, qu'il faut garder : l'accent a été repris TROIS fois en dix
    /// jours — pulse fixe (#4018), lié à la durée du signal (#4026), fenêtre de
    /// six secondes réarmable (#4050) — puis SUPPRIMÉ par `960f7d1df0` sur
    /// décision du porteur du 2026-08-28, au profit d'`IslandEmergingBanner`.
    ///
    /// **Décision renversée par le porteur le 2026-09-12** (`eb8a12f85d`, #6188) :
    /// « l'île se tait pour la frappe, la pastille porte l'annonce et l'accentue
    /// au début, et la toucher ouvre la conversation où l'on écrit ». La capsule
    /// masquait la pastille tout en étant non touchable : quatre secondes où
    /// l'information était visible et RIEN touchable.
    ///
    /// Ce que ce témoin garde désormais (#5599, réécrit comme sa version
    /// précédente le demandait) :
    /// - l'amplitude ET le retour au repos sortent d'UNE loi,
    ///   `TypingAnnouncementLaw` — le défaut des reprises précédentes n'était
    ///   pas la taille mais le retour, que deux sources font diverger ; tout
    ///   `scaleEffect` d'un fichier `SyncPill*` passe donc par elle ;
    /// - la machinerie d'accent abandonnée (fenêtre, échéance, drapeau) ne
    ///   revient pas.
    func test_syncPill_accentComesOnlyFromTheTypingAnnouncementLaw() throws {
        let interdits = ["isAccented", "accentScale", "setAccented",
                         "accentHold", "accentDeadline", "applyAccentWindow"]
        for (name, text) in try unitSources() {
            for interdit in interdits {
                XCTAssertFalse(
                    text.contains(interdit),
                    """
                    \(name) porte « \(interdit) » : la fenêtre d'accent a été ABANDONNÉE le \
                    2026-08-28 (960f7d1df0) ; l'accent de frappe rendu le 2026-09-12 \
                    (eb8a12f85d) passe par TypingAnnouncementLaw, jamais par un état d'accent.
                    """
                )
            }
            let echelles = text.components(separatedBy: "scaleEffect(").count - 1
            let parLaLoi = text.components(separatedBy: "scaleEffect(TypingAnnouncementLaw.scale(").count - 1
            XCTAssertEqual(
                echelles, parLaLoi,
                """
                \(name) porte un scaleEffect qui ne passe pas par TypingAnnouncementLaw.scale : \
                amplitude et retour au repos doivent sortir de la MÊME loi (eb8a12f85d, #6188).
                """
            )
        }
    }

    /// La loi d'accent avait son propre fichier ET ses deux suites ; les trois
    /// ont été SUPPRIMÉS, jamais vidés — une garde vidée de ses assertions
    /// reste verte en ne mesurant plus rien. Le témoin vérifie qu'ils ne
    /// reviennent pas par la porte du nom.
    func test_theAccentLawFileIsGoneForGood() throws {
        let noms = try unitSources().map(\.name)
        XCTAssertFalse(noms.contains("SyncPillAccentLaw.swift"),
                       "SyncPillAccentLaw.swift est revenu — voir le témoin ci-dessus")
    }

    // MARK: - #4027 — le tap mène à sa cible exacte, sur les DEUX hôtes

    /// La branche « conversation » de `handleSyncPillTap`, chez un hôte donné.
    ///
    /// Le témoin est BORNÉ à cette branche, jamais au fichier : les deux hôtes
    /// posent déjà `pendingHighlightMessageId` ailleurs (navigation par id,
    /// message étoilé, résultat de recherche). Un `contains` sur le fichier
    /// entier serait donc vert AVANT le correctif — une garde positive née
    /// morte, qui ne mesure que la présence d'un mot.
    private func syncPillConversationBranch(ofHost relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        let text = try String(contentsOf: url, encoding: .utf8)
        guard let start = text.range(of: "func handleSyncPillTap(_ source: OutboxUIItem.Source)"),
              let end = text.range(of: "case .post(", range: start.upperBound..<text.endIndex) else {
            XCTFail("\(relativePath) : la branche conversation de handleSyncPillTap est introuvable — le témoin ne mesure plus rien")
            return ""
        }
        return String(text[start.upperBound..<end.lowerBound])
    }

    /// **Taper « Message non envoyé » doit mener AU message, pas seulement à
    /// sa conversation.** Dans un fil de trois cents messages, ouvrir la
    /// conversation et s'arrêter là laisse l'utilisateur chercher lui-même ce
    /// que la pastille venait de lui signaler.
    ///
    /// Les deux hôtes sont vérifiés parce qu'ils ont DIVERGÉ par le passé :
    /// `ConnectionBanner` était construit sans `onItemTap` côté iPad, et taper
    /// une entrée n'y menait nulle part — c'est la raison d'être du jumeau
    /// `iPadRootView+Navigation.handleSyncPillTap`. Une correction posée sur un
    /// seul hôte rejouerait exactement ce défaut.
    func test_bothHosts_carryTheMessageAnchorFromTheSyncPillTap() throws {
        for hôte in ["Meeshy/Features/Main/Views/RootView.swift",
                     "Meeshy/Features/Main/Views/iPadRootView+Navigation.swift"] {
            let branche = try syncPillConversationBranch(ofHost: hôte)
            XCTAssertTrue(
                branche.contains("case .conversation(let id, let messageId)"),
                "\(hôte) : la branche ignore l'ancre servie par OutboxUIItem.Source"
            )
            XCTAssertTrue(
                branche.contains("router.pendingHighlightMessageId = messageId"),
                "\(hôte) : l'ancre est reçue mais jamais posée — le tap ouvrirait la conversation sans viser"
            )
            XCTAssertTrue(
                branche.contains("router.pendingHighlightConversationId = id"),
                """
                \(hôte) : l'ancre est posée SANS son scope. Sans lui, elle survivrait                 à une ouverture différente et ferait sauter un autre fil sur un id qui                 n'est pas le sien — un défaut PIRE que l'absence de visée.
                """
            )
        }
    }

    // MARK: - #4028 — à quels contextes la pastille CÈDE

    /// **La règle nomme les contextes auxquels le chrome cède**, et elle est
    /// UNE — les deux hôtes (iPhone, iPad) la consultaient auparavant par des
    /// conditions écrites séparément, ce qui est la façon la plus sûre de les
    /// faire diverger.
    ///
    /// Au repos, la pastille se montre : sans ce contrôle positif, une règle
    /// qui refuserait TOUT passerait pour la bonne.
    func test_visibilite_auRepos_laPastilleSeMontre() {
        XCTAssertTrue(SyncPillVisibility.isVisible(storyViewerPresenting: false,
                                                   inAppNoticePresenting: false))
    }

    /// Le viewer de story : garde existante, conservée telle quelle — le
    /// `fullScreenCover` du root ne supprime pas les overlays du parent, et la
    /// pastille restait visible par-dessus l'en-tête de la story.
    func test_visibilite_sousLeViewerDeStory_laPastilleSEfface() {
        XCTAssertFalse(SyncPillVisibility.isVisible(storyViewerPresenting: true,
                                                    inAppNoticePresenting: false))
    }

    /// **Le cas neuf.** Une notification in-app occupe le même haut d'écran et
    /// PRIME visuellement (#4028). L'ordre de rendu ne pouvait pas les
    /// départager : la pastille est un `.overlay` appliqué APRÈS le `ZStack` qui
    /// porte le toast, si bien qu'aucun `zIndex` interne ne pouvait la passer.
    /// La pastille cède donc, plutôt que de lutter pour un pixel.
    func test_visibilite_sousUneNotificationInApp_laPastilleCede() {
        XCTAssertFalse(SyncPillVisibility.isVisible(storyViewerPresenting: false,
                                                    inAppNoticePresenting: true))
    }

    /// Les deux à la fois restent un refus — le témoin qui interdit qu'une
    /// future écriture en `!=` ou en `^` transforme deux raisons de céder en
    /// une raison de se montrer.
    func test_visibilite_lesDeuxContextes_restentUnRefus() {
        XCTAssertFalse(SyncPillVisibility.isVisible(storyViewerPresenting: true,
                                                    inAppNoticePresenting: true))
    }
}
