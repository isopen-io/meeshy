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

    /// **La pastille ne grossit plus, et ce n'est pas un oubli.**
    ///
    /// L'accent a été repris TROIS fois en dix jours — pulse fixe (#4018),
    /// lié à la durée du signal (#4026), fenêtre de six secondes réarmable
    /// (#4050) — puis SUPPRIMÉ par `960f7d1df0` sur décision du porteur du
    /// 2026-08-28 : « l'effet sur la SyncPill qui la grossit est inutile, il
    /// existe un composant qui rend les informations en gros et c'est ce
    /// composant qu'il faut utiliser lorsqu'un utilisateur commence la frappe ».
    /// L'annonce de frappe appartient depuis à `IslandEmergingBanner`.
    ///
    /// Une décision reprise trois fois puis renversée a besoin d'un témoin,
    /// sans quoi la quatrième reprise se fera de bonne foi : rien dans le
    /// code ne dit qu'un accent a déjà été essayé et refusé.
    func test_syncPill_carriesNoAccentAnymore() throws {
        let interdits = ["scaleEffect", "isAccented", "accentScale", "setAccented",
                         "accentHold", "accentDeadline", "applyAccentWindow"]
        for (name, text) in try unitSources() {
            for interdit in interdits {
                XCTAssertFalse(
                    text.contains(interdit),
                    """
                    \(name) porte « \(interdit) » : l'accent de la pastille a été                     ABANDONNÉ le 2026-08-28 (960f7d1df0), après trois reprises.                     Une annonce « en gros » se fait par IslandEmergingBanner —                     une capsule de STATUT n'en est pas le porteur. Si le porteur                     revient sur cette décision, c'est ce témoin qu'il faut retirer                     EXPLICITEMENT, avec la nouvelle décision écrite à sa place.
                    """
                )
            }
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
}
