import XCTest

/// **Un `DispatchWorkItem?` ne se range JAMAIS dans l'état d'une vue** (#7034).
///
/// ## Ce que les rapports de plantage prouvent
///
/// Douze débordements de pile en seize jours sur l'appareil du porteur, dont
/// **six** de la même forme, mesurée identique sur les builds 1800, 1822, 1824
/// et 1825 :
///
/// ```
/// originalLength      18 219 – 18 305 frames
/// recursionInfoArray  depth 3 035 – 3 048
/// STACK GUARD         1008 Ko entièrement consommés
/// ```
///
/// Le cycle répété, visible dans les six, fait onze frames :
///
/// ```
/// DispatchWorkItem.__deallocating_deinit
///   _Block_release → __destroy_helper_block_…dispatch_block_private_data_s
///   _Block_release → _call_dispose_helpers_excp
///   block_destroy_helper                        ← code de Meeshy
///     outlined destroy of DispatchWorkItem?     ← le bloc en tenait un AUTRE
/// DispatchWorkItem.__deallocating_deinit        ← le maillon suivant
/// ```
///
/// **Une chaîne de work items, chacun retenu par le bloc du précédent.** Libérer
/// la tête les libère tous, récursivement, et la pile n'y survit pas.
///
/// ## Pourquoi la profondeur est si STABLE
///
/// 18 300 frames à 0,5 % près sur trois semaines ne peut pas venir des données.
/// 1008 Ko / 18 300 ≈ **56 octets par frame** : la profondeur n'est pas la
/// longueur de la chaîne, c'est **ce que la pile peut encaisser avant la page de
/// garde**. La chaîne est plus longue ; le plantage tombe toujours au même
/// endroit. C'est pourquoi « réduire le nombre d'allocations » ne corrige rien :
/// il faut que la chaîne n'existe pas.
///
/// ## La condition nécessaire, et donc la règle
///
/// Un bloc ne peut tenir un `DispatchWorkItem?` que s'il en capture un **par
/// valeur**. C'est ce que fait une fermeture posée dans une `View` ou un
/// `ViewModifier` — une STRUCT : elle capture la struct entière, champs
/// compris, et `State<DispatchWorkItem?>` range sa valeur en ligne.
///
/// Le dépôt connaît déjà le bon patron et l'applique à deux endroits —
/// `LentilleSceneActivity` et `MessageListViewController` tiennent leur work
/// item dans une **classe** et capturent `[weak self]` : la fermeture ne retient
/// alors qu'une référence, jamais un work item. `ScrollMotionVisibility` cite
/// même ce patron dans son doc-comment (« le patron du dépôt ») sans le suivre.
///
/// Cette garde interdit le retour de la forme fautive.
final class NoWorkItemInViewStateGuardTests: XCTestCase {

    /// Toute déclaration `@State … : DispatchWorkItem?`, quel que soit son nom
    /// ou ses modificateurs d'accès.
    private static let motifFautif = try! NSRegularExpression(
        pattern: #"@State[^\n]*\bDispatchWorkItem\b"#
    )

    private static var racine: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Guards
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // racine
    }

    private func fautifs(sous chemin: String) -> [String] {
        let base = Self.racine.appendingPathComponent(chemin)
        guard let e = FileManager.default.enumerator(at: base, includingPropertiesForKeys: nil) else {
            return []
        }
        var trouves: [String] = []
        for cas in e {
            guard let url = cas as? URL, url.pathExtension == "swift" else { continue }
            guard let brut = try? String(contentsOf: url, encoding: .utf8) else { continue }
            let code = AppSourceGuard.stripComments(brut)
            let plage = NSRange(code.startIndex..., in: code)
            for m in Self.motifFautif.matches(in: code, range: plage) {
                let ligne = code[Range(m.range, in: code)!].trimmingCharacters(in: .whitespaces)
                let court = url.path.replacingOccurrences(of: Self.racine.path + "/", with: "")
                trouves.append("\(court) — \(ligne)")
            }
        }
        return trouves.sorted()
    }

    private static let explication = """
    Une chaîne de DispatchWorkItem se forme, et la pile n'y survit pas (#7034).

    Une fermeture écrite dans une View ou un ViewModifier capture la STRUCT \
    entière ; un `@State` de type DispatchWorkItem? y range sa valeur EN LIGNE, \
    donc le bloc du work item courant retient le précédent. De proche en proche \
    la chaîne s'allonge, et sa libération est récursive : douze débordements \
    mesurés sur l'appareil du porteur, toujours à ~18 300 frames — la limite de \
    la pile, pas la longueur de la chaîne.

    Le patron correct est déjà dans le dépôt : tenir le work item dans une \
    CLASSE et la capturer en [weak self] (LentilleSceneActivity, \
    MessageListViewController). `Debouncer` le fournit tout fait.
    """

    func test_aucuneVueDeLApplication_neRangeUnWorkItemDansSonEtat() {
        let trouves = fautifs(sous: "apps/ios/Meeshy")
        XCTAssertEqual(trouves, [], "\(Self.explication)\n\nSites fautifs :\n\(trouves.joined(separator: "\n"))")
    }

    func test_aucuneVueDuSDK_neRangeUnWorkItemDansSonEtat() {
        let trouves = fautifs(sous: "packages/MeeshySDK/Sources")
        XCTAssertEqual(trouves, [], "\(Self.explication)\n\nSites fautifs :\n\(trouves.joined(separator: "\n"))")
    }

    /// **CONTRE-ÉPREUVE.** Si la regex ne reconnaissait rien, les deux témoins
    /// ci-dessus seraient verts par omission — verts sur un dépôt qui porterait
    /// le défaut partout.
    func test_leMotif_reconnaitBienLaFormeFautive() {
        let echantillon = "    @State private var settleWork: DispatchWorkItem?\n"
        let plage = NSRange(echantillon.startIndex..., in: echantillon)
        XCTAssertEqual(
            Self.motifFautif.numberOfMatches(in: echantillon, range: plage), 1,
            "Le motif doit reconnaître un @State de type DispatchWorkItem? — sinon la garde ne mesure rien."
        )
        let correct = "    private var flattenWork: DispatchWorkItem?\n"
        let plage2 = NSRange(correct.startIndex..., in: correct)
        XCTAssertEqual(
            Self.motifFautif.numberOfMatches(in: correct, range: plage2), 0,
            """
            Le motif accuse un work item rangé dans une CLASSE, ce qui est la \
            forme CORRECTE — il rendrait la garde impossible à satisfaire.
            """
        )
    }
}
