import XCTest

/// **Deux gestes, deux menus, une identité stable sur toutes les versions
/// d'iOS (#6117).**
///
/// Directive porteur du 2026-09-12, en deux temps. D'abord : « la touche
/// double tap sur les messages de script qui affiche les menu et reaction
/// convenable pour liquidglass » — « script » n'étant pas une coquille mais un
/// mode de lecture (`ConversationReadingMode.script`). Puis, en réponse à une
/// proposition qui inversait les rôles : « **le menu natif** avec effet
/// systeme liquid glass ou effet systeme selon la version iOS **se fait au
/// double tap** ! Mais **le menu meeshy se fait au longpress**. »
///
/// ## La règle
///
/// | geste | menu | où il vit |
/// |---|---|---|
/// | **double tap** | SYSTÈME — `UIEditMenuInteraction`, apparence de la version | `NativeMessageEditMenu` |
/// | **appui long** | MEESHY — barre de réactions, bulle élevée, actions | `onLongPress` |
///
/// ## Ce que cette garde tient
///
/// **1. Les deux gestes vivent au MÊME endroit** — `BubbleSwipeContainer`, le
/// conteneur qui enveloppe les cellules des trois peaux (`.bubbles`,
/// `.script`, `.focal`). Le double tap vivait à l'INTÉRIEUR de
/// `ThemedMessageBubble`, donc il n'existait ni en `.script` ni en `.focal`,
/// rendus par `FocalRow`.
///
/// **2. Le `.contextMenu` natif ne prend plus la pression.** Il la prenait
/// sous iOS 26, ce qui coupait le menu Meeshy sur les téléphones récents : le
/// même appui long rendait deux menus différents selon la version. Le
/// contournement est structurel — un `.contextMenu` ne s'ouvre QUE par
/// pression longue, il n'a aucune API de présentation programmatique, donc il
/// ne pouvait pas passer au double tap. `UIEditMenuInteraction` le peut.
///
/// **3. Les deux gestes portent la MÊME garde de sélection.** Une seule
/// intention à la fois (#4005) — et une garde posée sur un seul des deux est
/// une garde qui a déjà commencé à diverger.
///
/// ## Pourquoi une garde de SOURCE
///
/// Ce qu'on interdit n'est pas un mauvais rendu, c'est la DÉRIVE. Un futur lot
/// qui rendrait la pression au menu natif, ou qui reposerait un double tap
/// dans la bulle, rétablirait exactement le défaut que ce lot corrige — et
/// aucun témoin de vue ne tomberait, les deux chemins continuant de
/// fonctionner séparément.
///
/// ## Ce que cette garde ne dit PAS
///
/// - le double tap d'une PIÈCE (grille média) vise la pièce, pas le message :
///   la vue interne le capte avant le conteneur, et il garde sa barre de
///   réactions ;
/// - le plein écran garde le ZOOM au double tap — un réflexe système que ce
///   lot ne casse pas ;
/// - `.river` et `.summary` sont des hôtes SwiftUI séparés (le premier porte
///   son propre menu natif, le second ne rend pas de message ligne à ligne).
final class ThreadRowGestureParityTests: XCTestCase {

    /// La racine du dépôt, trouvée en REMONTANT jusqu'au dossier qui contient
    /// `apps/` et `packages/` — jamais par un nombre de remontées.
    ///
    /// Compter est ce que j'avais fait, et je m'y suis trompé sur les deux
    /// fichiers de ce lot : le premier `deletingLastPathComponent()` retire le
    /// NOM DU FICHIER, pas le dossier qui le contient. **Un chemin construit
    /// par un compte est faux en silence** — il rend un dossier plausible, et
    /// l'erreur ne se voit qu'au fichier absent.
    private func racine() -> URL {
        var url = URL(fileURLWithPath: #filePath)
        let fs = FileManager.default
        while url.pathComponents.count > 1 {
            url = url.deletingLastPathComponent()
            if fs.fileExists(atPath: url.appendingPathComponent("apps").path),
               fs.fileExists(atPath: url.appendingPathComponent("packages").path) {
                return url
            }
        }
        return url
    }

    private func source(_ chemin: String) throws -> String {
        try String(contentsOf: racine().appendingPathComponent(chemin), encoding: .utf8)
    }

    private func sourceDuConteneur() throws -> String {
        try source("apps/ios/Meeshy/Features/Main/Views/MessageListView.swift")
    }

    /// Une garde négative dont le balayage ne voit rien reste verte pour la
    /// pire des raisons.
    func test_leBalayageVoitBienLeConteneur() throws {
        let source = try sourceDuConteneur()

        XCTAssertTrue(source.contains("struct BubbleSwipeContainer"),
                      "le conteneur des trois peaux doit être dans ce fichier")
        XCTAssertTrue(source.contains("ConditionalBubbleLongPress"),
                      "l'appui long doit être posé sur ce conteneur")
    }

    /// **Le double tap ouvre le menu SYSTÈME, depuis le conteneur.**
    func test_leDoubleTapOuvreLeMenuSystemeDepuisLeConteneur() throws {
        let source = try sourceDuConteneur()

        XCTAssertTrue(source.contains("NativeMessageEditMenu"),
                      "le double tap doit vivre sur BubbleSwipeContainer, hôte des trois peaux")
    }

    /// **Le menu système se présente PAR CODE.** C'est la propriété qui rend la
    /// directive réalisable, et elle tient à l'API choisie : un `.contextMenu`
    /// ne s'ouvre que par pression longue.
    func test_leMenuSystemeSePresenteParCode() throws {
        let pont = try source("apps/ios/Meeshy/Features/Main/Views/NativeMessageEditMenu.swift")

        XCTAssertTrue(pont.contains("UIEditMenuInteraction"),
                      "seul UIEditMenuInteraction se présente par code avec l'apparence système")
        XCTAssertTrue(pont.contains("presentEditMenu"),
                      "le pont doit PRÉSENTER le menu, pas seulement le déclarer")
        XCTAssertTrue(pont.contains("SpatialTapGesture"),
                      "le menu système s'ancre sur un POINT — seul le geste spatial le donne")
    }

    /// **L'appui long ouvre le menu MEESHY sur TOUTES les versions.**
    ///
    /// Il valait `nativeMenu == nil`, donc il était COUPÉ sous iOS 26 où le
    /// `.contextMenu` natif possédait la pression.
    func test_lAppuiLongResteAuMenuMeeshySurToutesLesVersions() throws {
        let vc = try source("apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift")

        XCTAssertTrue(vc.contains("enableLongPress: true"),
                      "l'appui long ne doit plus céder la pression au menu natif sous iOS 26")
        XCTAssertFalse(vc.contains("enableLongPress: nativeMenu == nil"),
                       "cette forme rendait deux menus différents selon la version d'iOS")
    }

    /// **Le double tap s'éteint en mode sélection, comme l'appui long.**
    func test_leDoubleTapSEteintEnModeSelection() throws {
        let source = try sourceDuConteneur()

        guard let plage = source.range(of: "NativeMessageEditMenu(") else {
            return XCTFail("le double tap n'est pas posé sur le conteneur")
        }
        let fenetre = source[plage.lowerBound...].prefix(220)

        XCTAssertTrue(fenetre.contains("isSelectionModeActive"),
                      "le double tap doit porter la même garde de sélection que l'appui long")
    }

    /// **La bulle ne porte plus de double tap de MESSAGE.** Deux gestes
    /// identiques à deux étages, avec deux destinations, sont exactement le
    /// défaut corrigé.
    ///
    /// `QuickReactionDoubleTap` RESTE dans ce fichier : la grille média s'en
    /// sert pour la réaction sur UNE PIÈCE, qui n'est pas le même geste sur le
    /// même objet. Le témoin vise donc son APPEL dans la bulle, pas sa
    /// déclaration.
    func test_laBulleNePortePlusDeDoubleTapDeMessage() throws {
        let source = try source("apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift")

        XCTAssertTrue(source.contains("struct ThemedMessageBubble"),
                      "le balayage doit voir la bulle")
        XCTAssertFalse(source.contains(".modifier(QuickReactionDoubleTap("),
                       "le double tap du MESSAGE a quitté la bulle pour le conteneur des trois peaux")
    }
}
