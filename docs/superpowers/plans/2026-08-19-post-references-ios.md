# Références de personnes dans les posts — Plan iOS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à l'auteur iOS de référencer quelqu'un dans un post, un réel, une story ou un statut selon quatre modes — dans le texte, en badge sur le canevas, en note sous le contenu, ou silencieusement — et ouvrir le contenu référencé même expiré.

**Architecture:** Une règle pure sans UI (`ComposerReferences`, extension de `ComposerMentionQuery`) porte l'état déclaré et les transitions ; deux composants d'UI réutilisés par tous les composers l'exposent. Un seul geste suffit toujours ; l'appui long ouvre le choix. C'est cette règle qui survivra à la convergence des composers Reel/Post/Story.

**Tech Stack:** Swift 6, SwiftUI (`defaultIsolation(MainActor)`), MeeshySDK (targets `MeeshySDK` + `MeeshyUI`), XCTest + Swift Testing.

**Spec:** `docs/superpowers/specs/2026-08-19-post-references-design.md`

**Dépend de :** `docs/superpowers/plans/2026-08-19-post-references-gateway.md` (Tasks 1–11). Le serveur doit accepter `display` et servir `post.mentions` avant que les Tasks 5+ d'ici soient testables de bout en bout ; les Tasks 1–4 sont indépendantes.

## Global Constraints

- **TDD non négociable.** `./apps/ios/meeshy.sh test` MUST pass avant tout commit.
- **Protocole avant implémentation** pour tout nouveau service (`{ServiceName}Providing`), dans le même fichier, au-dessus du type concret.
- **Injection par init avec défaut `.shared`** pour tout ViewModel.
- **Nommage des tests** : `test_{method}_{condition}_{expectedResult}`.
- **SDK purity** : le SDK fournit des building blocks (règles pures, atomes d'UI paramétrés) ; l'orchestration produit (quand publier, quelle cascade) reste app-side. Voir `packages/MeeshySDK/CLAUDE.md`.
- **Zero unnecessary re-render** : pas d'`@ObservedObject` sur un singleton dans une vue feuille ; passer des valeurs primitives ; `Equatable` + `.equatable()` sur les cellules de liste.
- **Cache-first** : afficher le cache immédiatement, revalider en silence. Jamais de spinner quand le cache a des données.
- **Nouvelle UI = 4 gardes silencieuses** : catalogue 7 langues, clés mortes, police Focal, chevron RTL — plus le `==` manuel si `Equatable`.
- **Valeurs exactes** : fenêtre post-expiration = **24 h** (serveur autoritatif via `referenceAccess`, jamais recalculée ici).
- **Build** : `./apps/ios/meeshy.sh build`. Tests SDK : scheme `MeeshySDK-Package`.
- **Ne jamais** recalculer le droit d'accès depuis `expiresAt` : le serveur le déclare.

---

### Task 1: Modèles — le mode voyage avec la référence

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` (`StoryTextObject`)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift` (`APIPost`)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift` (`PostMentionInput`)
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Models/PostReference.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/PostReferenceTests.swift`

**Interfaces:**
- Consumes: rien
- Produces:
  - `enum PostReferenceDisplay: String, Codable, Sendable { case inline = "INLINE", pinned = "PINNED", note = "NOTE", silent = "SILENT" }`
  - `struct PostReference: Codable, Sendable, Equatable, Identifiable { let userId, username: String; let displayName: String?; let avatar: String?; let display: PostReferenceDisplay }`
  - `APIPost.mentions: [PostReference]?`, `APIPost.referenceAccess: ReferenceAccess?`
  - `enum ReferenceAccess: String, Codable, Sendable { case none, granted, consumed }`
  - `StoryTextObject.referenceUserId: String?`
  - `PostMentionInput.display: String?`

- [ ] **Step 1: Écrire le test rouge du décodage**

Créer `packages/MeeshySDK/Tests/MeeshySDKTests/Models/PostReferenceTests.swift` :

```swift
import Testing
import Foundation
@testable import MeeshySDK

/// Le mode voyage AVEC la référence, et une charge utile ancienne — qui n'en
/// porte aucune — reste décodable.
struct PostReferenceTests {

    @Test func test_decode_withDisplay_keepsMode() throws {
        let json = """
        {"userId":"u1","username":"alice","displayName":"Alice B.","avatar":"a.png","display":"NOTE"}
        """.data(using: .utf8)!

        let reference = try JSONDecoder().decode(PostReference.self, from: json)

        #expect(reference.display == .note)
        #expect(reference.displayName == "Alice B.")
    }

    @Test func test_decode_unknownDisplay_fallsBackToInline() throws {
        // Un mode ajouté côté serveur ne doit pas faire échouer le décodage de
        // TOUT le post — l'app ancienne le lit comme du texte, ce qui est le
        // repli le moins surprenant.
        let json = """
        {"userId":"u1","username":"alice","displayName":null,"avatar":null,"display":"FUTURE_MODE"}
        """.data(using: .utf8)!

        let reference = try JSONDecoder().decode(PostReference.self, from: json)

        #expect(reference.display == .inline)
    }

    @Test func test_decode_missingDisplay_fallsBackToInline() throws {
        let json = """
        {"userId":"u1","username":"alice","displayName":null,"avatar":null}
        """.data(using: .utf8)!

        #expect(try JSONDecoder().decode(PostReference.self, from: json).display == .inline)
    }

    @Test func test_post_withoutMentions_stillDecodes() throws {
        // Charge utile d'un serveur non encore déployé : ni `mentions`, ni
        // `referenceAccess`. Le post doit rester lisible.
        let json = """
        {"id":"p1","authorId":"u1","type":"POST","visibility":"PUBLIC","createdAt":"2026-08-19T10:00:00.000Z"}
        """.data(using: .utf8)!

        let post = try JSONDecoder.meeshy.decode(APIPost.self, from: json)

        #expect(post.mentions == nil)
        #expect(post.referenceAccess == nil)
    }
}
```

> Ajuster `JSONDecoder.meeshy` au décodeur réellement exposé par le SDK — le
> repérer dans un test voisin de `MeeshySDKTests/Models/` avant d'écrire.

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshySDKTests/PostReferenceTests
```

Attendu : échec de compilation — `PostReference` n'existe pas.

- [ ] **Step 3: Écrire les modèles**

Créer `packages/MeeshySDK/Sources/MeeshySDK/Models/PostReference.swift` :

```swift
import Foundation

/// Comment une référence se montre dans un contenu.
///
/// Miroir de l'enum Prisma `PostMentionDisplay`. INLINE est DÉRIVÉ par le
/// serveur, qui relit les `@handle` du texte — le client ne le déclare jamais.
/// Les trois autres sont déclarés : le texte ne peut pas les porter.
public enum PostReferenceDisplay: String, Codable, Sendable, CaseIterable {
    /// `@handle` écrit dans le texte.
    case inline = "INLINE"
    /// Badge posé sur le canevas.
    case pinned = "PINNED"
    /// Rangée « Avec … » sous le contenu.
    case note = "NOTE"
    /// Notifiée, invisible pour les tiers.
    case silent = "SILENT"

    /// Un mode inconnu se lit INLINE plutôt que de faire échouer le décodage du
    /// post entier : une valeur ajoutée côté serveur ne doit pas rendre un
    /// contenu illisible sur une app qu'on n'a pas encore mise à jour.
    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = PostReferenceDisplay(rawValue: raw) ?? .inline
    }

    /// Ce qui se montre à un tiers. SILENT n'est rendu que pour la personne
    /// concernée et pour l'auteur — jamais dans la rangée « Avec … ».
    public var isPubliclyVisible: Bool { self != .silent }
}

/// Une personne référencée dans un contenu, telle que le serveur la sert.
///
/// Le profil arrive RÉSOLU AU CHARGEMENT : quelqu'un qui change de nom
/// d'affichage apparaît sous son nom actuel, pas sous celui qu'il portait à la
/// publication.
public struct PostReference: Codable, Sendable, Equatable, Identifiable {
    public let userId: String
    public let username: String
    public let displayName: String?
    public let avatar: String?
    public let display: PostReferenceDisplay

    public var id: String { userId }

    public init(userId: String, username: String, displayName: String? = nil,
                avatar: String? = nil, display: PostReferenceDisplay = .inline) {
        self.userId = userId
        self.username = username
        self.displayName = displayName
        self.avatar = avatar
        self.display = display
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        userId = try c.decode(String.self, forKey: .userId)
        username = try c.decode(String.self, forKey: .username)
        displayName = try c.decodeIfPresent(String.self, forKey: .displayName)
        avatar = try c.decodeIfPresent(String.self, forKey: .avatar)
        display = try c.decodeIfPresent(PostReferenceDisplay.self, forKey: .display) ?? .inline
    }

    /// Ce qu'on affiche d'elle : son nom d'affichage s'il existe, son pseudo sinon.
    public var label: String { displayName ?? username }
}

/// Le droit d'ouvrir un contenu parce qu'on y est référencé — DÉCLARÉ par le
/// serveur, jamais recalculé ici.
///
/// Le client ne voit que `expiresAt` et ignore tout de la référence : déduire
/// l'accès localement ferait refuser un contenu que le serveur autorise.
public enum ReferenceAccess: String, Codable, Sendable {
    /// Pas de référence pour ce lecteur — l'expiration s'applique normalement.
    case none
    /// Droit intact, ou fenêtre encore ouverte : afficher malgré l'expiration.
    case granted
    /// Droit éteint : écran « ce contenu n'est plus disponible ».
    case consumed
}
```

- [ ] **Step 4: Étendre `APIPost`**

Dans `PostModels.swift`, ajouter les deux propriétés, leurs `CodingKeys` et leur décodage
`decodeIfPresent` — à côté de `mentionedUsers`, qui devient mort (Step 5) :

```swift
    /// Les personnes que ce contenu nomme, avec leur mode. Résolues au
    /// chargement côté serveur, donc porteuses du profil À JOUR.
    ///
    /// Les SILENT n'y figurent QUE pour la personne concernée et pour l'auteur
    /// (le serveur projette au détail, filtre au niveau du select pour un feed).
    public let mentions: [PostReference]?

    /// Le droit d'ouvrir ce contenu s'il est expiré. `nil` sur un serveur non
    /// encore déployé — traité comme `.none`.
    public let referenceAccess: ReferenceAccess?
```

- [ ] **Step 5: Supprimer le champ mort `mentionedUsers` du post**

`APIPost.mentionedUsers` n'a **jamais eu de source** : le gateway ne l'écrit sur un post ni en
REST ni en socket (vérifié — voir le plan gateway, Task 5). Le retirer, ainsi que
`PostRecord.mentionedUsersJson` et son usage dans `FeedSocketHandler.swift:296`.

⚠️ **`MessageRecord.mentionedUsersJson` et `APIMessage.mentionedUsers` RESTENT** — le chemin
messages est vivant (`ConversationSyncEngine.swift:854`) et n'est pas touché par ce chantier.

⚠️ **La colonne SQLite** : retirer le champ du `struct` sans migration ferait échouer le
décodage GRDB de toute ligne existante. Ajouter une migration qui **supprime la colonne**, ou
la laisser en base et ne plus l'écrire — la seconde est plus sûre et suffit. Suivre le patron
de `FeedDatabaseMigrations.swift`.

- [ ] **Step 6: Ajouter le mode à l'entrée d'écriture**

Dans `ServiceModels.swift`, `PostMentionInput` :

```swift
public struct PostMentionInput: Encodable, Sendable, Equatable {
    public let userId: String?
    public let username: String?
    /// `PINNED` | `NOTE` | `SILENT`. Jamais `INLINE` : le serveur le dérive du
    /// texte, et le déclarer ouvrirait un second chemin vers le même fait.
    ///
    /// `nil` reste accepté par le serveur, qui le lit PINNED — c'est ce que
    /// faisait l'ancien canal CANVAS, et c'est ce qui garde les versions déjà
    /// installées fonctionnelles.
    public let display: String?

    public init(userId: String? = nil, username: String? = nil, display: String? = nil) {
        self.userId = userId
        self.username = username
        self.display = display
    }

    public static func handle(_ username: String, display: PostReferenceDisplay) -> PostMentionInput {
        PostMentionInput(userId: nil, username: username, display: display.rawValue)
    }

    public static func id(_ userId: String, display: PostReferenceDisplay) -> PostMentionInput {
        PostMentionInput(userId: userId, username: nil, display: display.rawValue)
    }
}
```

- [ ] **Step 7: Ajouter le marqueur de badge au canevas**

Dans `StoryModels.swift`, `StoryTextObject` :

```swift
    /// `User.id` quand cet objet EST un badge de référence, `nil` pour du texte
    /// libre.
    ///
    /// Sans lui, la dérivation INLINE côté serveur relit le badge comme une
    /// mention de texte et écrase le mode choisi par l'auteur : un badge est un
    /// objet texte portant `@pseudo`, indistinguable d'une phrase. Il sert aussi
    /// au rendu, qui traite un badge comme une étiquette tappable.
    public var referenceUserId: String?
```

Décodage tolérant à son absence (`decodeIfPresent`), et l'ajouter à l'`init` mémberwise
existant avec `= nil` par défaut pour ne pas casser les appelants.

- [ ] **Step 8: Lancer les tests pour vérifier qu'ils passent**

```bash
xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshySDKTests/PostReferenceTests
```

Attendu : PASS — 4 tests.

- [ ] **Step 9: Committer**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/PostReference.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Persistence/ \
        apps/ios/Meeshy/Features/Main/ViewModels/FeedSocketHandler.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Models/PostReferenceTests.swift
git commit -m "feat(sdk): une référence porte son mode, et un badge se distingue d'une phrase

APIPost.mentionedUsers part avec : le gateway ne l'a jamais écrit sur un
post, ni en REST ni en socket. Un mode inconnu se lit INLINE plutôt que de
rendre illisible tout un contenu sur une app qu'on n'a pas mise à jour."
```

---

### Task 2: La règle pure — l'état déclaré et ses transitions

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/ComposerMentionQuery.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/ComposerMentionQueryTests.swift` (existant, à étendre)

**Interfaces:**
- Consumes: `PostReferenceDisplay` (Task 1)
- Produces:
  - `struct ComposerReference: Sendable, Equatable { let username: String; let userId: String?; var display: PostReferenceDisplay }`
  - `ComposerReferences.upsert(_:into:) -> [ComposerReference]`
  - `ComposerReferences.remove(username:from:) -> [ComposerReference]`
  - `ComposerReferences.payload(_:) -> [PostMentionInput]`
  - `ComposerReferences.removingHandle(_:from:) -> String`

**Pourquoi une règle pure :** c'est elle qui survivra à la convergence des composers. L'interface changera, la règle non. Elle vit sans SwiftUI ni réseau, donc elle se teste en millisecondes.

- [ ] **Step 1: Écrire les tests rouges**

Ajouter à `packages/MeeshySDK/Tests/MeeshyUITests/Story/ComposerMentionQueryTests.swift` :

```swift
struct ComposerReferencesTests {

    @Test func test_upsert_newUsername_appends() {
        let result = ComposerReferences.upsert(
            ComposerReference(username: "alice", userId: nil, display: .note),
            into: []
        )
        #expect(result.map(\.username) == ["alice"])
        #expect(result[0].display == .note)
    }

    @Test func test_upsert_existingUsername_replacesModeInPlace() {
        // Choisir un mode et en changer sont le MÊME geste : la personne ne doit
        // pas être ajoutée deux fois, et elle ne doit pas sauter en fin de liste.
        let existing = [
            ComposerReference(username: "alice", userId: nil, display: .pinned),
            ComposerReference(username: "bob", userId: nil, display: .silent),
        ]
        let result = ComposerReferences.upsert(
            ComposerReference(username: "Alice", userId: nil, display: .note),
            into: existing
        )

        #expect(result.count == 2)
        #expect(result[0].username == "alice")
        #expect(result[0].display == .note)
        #expect(result[1].username == "bob")
    }

    @Test func test_remove_isCaseInsensitive() {
        let existing = [ComposerReference(username: "alice", userId: nil, display: .note)]
        #expect(ComposerReferences.remove(username: "ALICE", from: existing).isEmpty)
    }

    @Test func test_payload_carriesModeAndDropsNothing() {
        let refs = [
            ComposerReference(username: "alice", userId: nil, display: .pinned),
            ComposerReference(username: nil == nil ? "bob" : "", userId: "u-bob", display: .silent),
        ]
        let payload = ComposerReferences.payload(refs)

        #expect(payload.count == 2)
        #expect(payload[0].username == "alice")
        #expect(payload[0].display == "PINNED")
        #expect(payload[1].userId == "u-bob")
        #expect(payload[1].display == "SILENT")
    }

    @Test func test_payload_neverDeclaresInline() {
        // INLINE est dérivé par le serveur. Le déclarer ouvrirait un second
        // chemin vers le même fait, et les deux divergeraient.
        let refs = [ComposerReference(username: "alice", userId: nil, display: .inline)]
        #expect(ComposerReferences.payload(refs).isEmpty)
    }

    @Test func test_removingHandle_dropsTheHandleAndItsSpacing() {
        #expect(ComposerReferences.removingHandle("alice", from: "Soirée avec @alice hier")
                == "Soirée avec hier")
        #expect(ComposerReferences.removingHandle("alice", from: "@alice")
                == "")
        #expect(ComposerReferences.removingHandle("alice", from: "bravo @Alice !")
                == "bravo !")
    }

    @Test func test_removingHandle_leavesOtherHandlesAlone() {
        #expect(ComposerReferences.removingHandle("alice", from: "@alice et @alicia")
                == "et @alicia")
    }
}
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/ComposerReferencesTests
```

Attendu : échec de compilation — `ComposerReferences` n'existe pas.

- [ ] **Step 3: Écrire la règle**

Ajouter à `ComposerMentionQuery.swift` :

```swift
/// Une personne que l'auteur a choisi de nommer, et COMMENT.
///
/// `userId` quand un sélecteur l'a rendu, `username` toujours : c'est lui qui
/// survit à un brouillon repris trois jours plus tard, là où un id devrait être
/// persisté en parallèle des effets.
public struct ComposerReference: Sendable, Equatable {
    public let username: String
    public let userId: String?
    public var display: PostReferenceDisplay

    public init(username: String, userId: String? = nil, display: PostReferenceDisplay) {
        self.username = username
        self.userId = userId
        self.display = display
    }
}

/// Les règles PURES de l'état « qui ce contenu nomme, et comment ».
///
/// Ni SwiftUI, ni réseau — c'est ce qui les rend testables en millisecondes, et
/// c'est ce qui les fera SURVIVRE à la convergence des composers Reel / Post /
/// Story : l'interface changera, la règle non.
public nonisolated enum ComposerReferences {

    /// Ajoute une personne, ou change son mode si elle est déjà là.
    ///
    /// EN PLACE, pas en fin de liste : choisir un mode et en changer sont le
    /// même geste côté UI, et voir la pastille sauter au bout de la rangée à
    /// chaque changement donnerait l'impression d'avoir ajouté quelqu'un.
    public static func upsert(
        _ reference: ComposerReference,
        into references: [ComposerReference]
    ) -> [ComposerReference] {
        let key = reference.username.lowercased()
        guard let index = references.firstIndex(where: { $0.username.lowercased() == key }) else {
            return references + [reference]
        }
        var updated = references
        updated[index].display = reference.display
        return updated
    }

    /// Retire une personne. Insensible à la casse — le serveur résout les
    /// pseudos de la même façon.
    public static func remove(
        username: String,
        from references: [ComposerReference]
    ) -> [ComposerReference] {
        let key = username.lowercased()
        return references.filter { $0.username.lowercased() != key }
    }

    /// Ce que la publication DÉCLARE au serveur : les non-INLINE, et elles
    /// seules.
    ///
    /// INLINE est absent par construction — le serveur le dérive en relisant
    /// les `@handle` du texte, et le déclarer ouvrirait un second chemin vers le
    /// même fait, que le premier désaccord ferait diverger.
    public static func payload(_ references: [ComposerReference]) -> [PostMentionInput] {
        references.compactMap { reference in
            guard reference.display != .inline else { return nil }
            if let userId = reference.userId {
                return PostMentionInput(userId: userId, username: nil, display: reference.display.rawValue)
            }
            return PostMentionInput(userId: nil, username: reference.username, display: reference.display.rawValue)
        }
    }

    /// Retire un `@handle` du texte, avec l'espace qu'il laisserait derrière lui.
    ///
    /// C'est la transition INLINE → autre chose : passer une référence en badge,
    /// en note ou en silence n'a de sens que si le pseudo quitte la phrase.
    /// Frontière de mot à droite : `@alice` ne doit pas emporter `@alicia`.
    public static func removingHandle(_ username: String, from text: String) -> String {
        let escaped = NSRegularExpression.escapedPattern(for: username)
        guard let regex = try? NSRegularExpression(
            pattern: "\\s*@\(escaped)(?![\\p{L}\\p{N}_.-])",
            options: [.caseInsensitive]
        ) else { return text }

        let range = NSRange(text.startIndex..., in: text)
        let stripped = regex.stringByReplacingMatches(in: text, range: range, withTemplate: "")
        return stripped.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

```bash
xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/ComposerReferencesTests
```

Attendu : PASS — 7 tests.

- [ ] **Step 5: Committer**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/ComposerMentionQuery.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/ComposerMentionQueryTests.swift
git commit -m "feat(sdk): la règle des références vit sans UI, pour survivre à la convergence

Choisir un mode et en changer sont le même geste : upsert remplace EN PLACE
plutôt qu'en fin de liste, sinon la pastille sauterait au bout de la rangée
à chaque changement. Et le payload ne déclare jamais INLINE — le serveur le
dérive du texte."
```

---

### Task 3: Le menu de mode — un composant, tous les composers

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/ReferenceModeMenu.swift`
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/ReferenceChipRow.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/ReferenceModeMenuTests.swift`

**Interfaces:**
- Consumes: `PostReferenceDisplay` (Task 1), `ComposerReference` (Task 2)
- Produces:
  - `PostReferenceDisplay.symbolName: String`, `.menuLabel: String` (localisé)
  - `struct ReferenceModeMenu: View` — le menu d'appui long
  - `struct ReferenceChipRow: View` — la rangée `👤 3 personnes` avec pastilles

**Grammaire d'interaction** (spec §7.4) : *un tap suffit toujours ; l'appui long n'existe que pour ceux qui veulent autre chose.*

- [ ] **Step 1: Écrire le test rouge des symboles et libellés**

Créer `packages/MeeshySDK/Tests/MeeshyUITests/Story/ReferenceModeMenuTests.swift` :

```swift
import Testing
@testable import MeeshyUI
@testable import MeeshySDK

struct ReferenceModeMenuTests {

    @Test func test_symbolName_isDistinctPerMode() {
        let symbols = PostReferenceDisplay.allCases.map(\.symbolName)
        #expect(Set(symbols).count == symbols.count)
    }

    @Test func test_declarableModes_excludeInline() {
        // Le menu du chip ne propose QUE ce que le client peut déclarer.
        #expect(PostReferenceDisplay.declarable == [.pinned, .note, .silent])
    }

    @Test func test_menuLabel_isNeverEmpty() {
        for mode in PostReferenceDisplay.allCases {
            #expect(!mode.menuLabel.isEmpty)
        }
    }
}
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/ReferenceModeMenuTests
```

Attendu : échec de compilation.

- [ ] **Step 3: Écrire les atomes de présentation**

Créer `packages/MeeshySDK/Sources/MeeshyUI/Story/ReferenceModeMenu.swift` :

```swift
import SwiftUI
import MeeshySDK

public extension PostReferenceDisplay {

    /// Les modes qu'un CLIENT peut déclarer. INLINE en est absent : le serveur
    /// le dérive du texte.
    static var declarable: [PostReferenceDisplay] { [.pinned, .note, .silent] }

    /// Une pastille par mode, la même dans le composer, dans la feuille et dans
    /// la rangée de gestion — c'est ce qui rend le mode lisible d'un coup d'œil
    /// sans jamais écrire son nom dans le rendu final.
    var symbolName: String {
        switch self {
        case .inline: return "at"
        case .pinned: return "person.crop.square"
        case .note:   return "text.append"
        case .silent: return "bell"
        }
    }

    /// Le libellé n'existe QUE dans le menu de choix, là où l'auteur décide. Le
    /// rendu final, lui, ne nomme jamais le mode : le badge, la rangée ou le
    /// silence SONT l'affichage.
    var menuLabel: String {
        switch self {
        case .inline:
            return String(localized: "reference.mode.inline", defaultValue: "Insérer dans le texte", bundle: .module)
        case .pinned:
            return String(localized: "reference.mode.pinned", defaultValue: "Poser un badge", bundle: .module)
        case .note:
            return String(localized: "reference.mode.note", defaultValue: "Référencer", bundle: .module)
        case .silent:
            return String(localized: "reference.mode.silent", defaultValue: "Notifier seulement", bundle: .module)
        }
    }
}

/// Le menu d'appui long, identique partout.
///
/// Paramétré et agnostique : il reçoit les modes à proposer et rend le choix.
/// Aucun singleton, aucune règle « quand » — c'est le composer appelant qui
/// décide quoi en faire (règle de pureté SDK).
public struct ReferenceModeMenu: View {
    let modes: [PostReferenceDisplay]
    let onSelect: (PostReferenceDisplay) -> Void

    public init(modes: [PostReferenceDisplay], onSelect: @escaping (PostReferenceDisplay) -> Void) {
        self.modes = modes
        self.onSelect = onSelect
    }

    public var body: some View {
        ForEach(modes, id: \.self) { mode in
            Button {
                onSelect(mode)
                HapticFeedback.light()
            } label: {
                Label(mode.menuLabel, systemImage: mode.symbolName)
            }
        }
    }
}
```

- [ ] **Step 4: Écrire la rangée d'état**

Créer `packages/MeeshySDK/Sources/MeeshyUI/Story/ReferenceChipRow.swift` :

```swift
import SwiftUI
import MeeshySDK

/// La rangée compacte sous la barre d'outils du composer : `👤 3 personnes`
/// avec la pastille de chaque mode.
///
/// C'est le SEUL endroit d'où l'auteur voit ses références silencieuses — et
/// donc le seul d'où il peut en retirer une. Sans elle, une SILENT posée par
/// erreur serait invisible et irrécupérable jusqu'à la publication.
///
/// Feuille : aucun `@ObservedObject` sur un singleton, que des valeurs — et
/// `Equatable` pour ne pas se redessiner à chaque frappe du composer.
public struct ReferenceChipRow: View, Equatable {
    let references: [ComposerReference]
    let accentColor: Color
    let onTap: () -> Void

    public init(references: [ComposerReference], accentColor: Color, onTap: @escaping () -> Void) {
        self.references = references
        self.accentColor = accentColor
        self.onTap = onTap
    }

    /// `==` MANUEL : les closures ne sont pas `Equatable`, donc la synthèse
    /// automatique n'existe pas. Comparer l'état, jamais l'action.
    public static func == (lhs: ReferenceChipRow, rhs: ReferenceChipRow) -> Bool {
        lhs.references == rhs.references && lhs.accentColor == rhs.accentColor
    }

    public var body: some View {
        if !references.isEmpty {
            Button(action: onTap) {
                HStack(spacing: 8) {
                    Image(systemName: "person.2.fill")
                        .font(.system(size: 12, weight: .semibold))
                    Text(label)
                        .font(.system(size: 13, weight: .medium))
                    HStack(spacing: 4) {
                        ForEach(references, id: \.username) { reference in
                            Image(systemName: reference.display.symbolName)
                                .font(.system(size: 10))
                                .foregroundStyle(reference.display == .silent ? Color.secondary : accentColor)
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(Capsule().fill(accentColor.opacity(0.12)))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(label)
        }
    }

    private var label: String {
        String(localized: "reference.row.count",
               defaultValue: "\(references.count) personne(s)",
               bundle: .module)
    }
}
```

- [ ] **Step 5: Déclarer les clés dans les 7 langues**

Ajouter `reference.mode.inline`, `reference.mode.pinned`, `reference.mode.note`,
`reference.mode.silent`, `reference.row.count`, `reference.sheet.title`,
`reference.sheet.alreadyReferenced`, `reference.sheet.contacts`,
`reference.audienceWarning` au catalogue **du bon bundle** (`.module` — MeeshyUI, pas
`.main`) et dans **les sept langues**.

⚠️ **Le cliquet français est aveugle aux clés sans accent** : `référencé`, `personne(s)`,
`Référencer` portent leurs accents.

⚠️ **`reference.row.count` doit être pluralisé** proprement (`.stringsdict` ou
`inflect`), pas concaténé — mais **`inflect:true` fuit sur iOS 18.x** : préférer un
`.stringsdict`.

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils passent**

```bash
xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/ReferenceModeMenuTests
```

Attendu : PASS — 3 tests.

- [ ] **Step 7: Committer**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/ReferenceModeMenu.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/ReferenceChipRow.swift \
        packages/MeeshySDK/Resources/ \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/ReferenceModeMenuTests.swift
git commit -m "feat(sdk): un menu de mode et une rangée d'état, partagés par tous les composers

La rangée est le seul endroit d'où l'auteur voit ses références
silencieuses — sans elle, une SILENT posée par erreur serait invisible et
irrécupérable jusqu'à la publication."
```

---

### Task 4: La feuille de sélection — tap = SILENT, appui long = le choix

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/MentionSuggestions.swift` (`StoryMentionPickerSheet`, `MentionSuggestionList`)
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/ReferencePickerTests.swift`

**Interfaces:**
- Consumes: `ComposerReference`, `ComposerReferences` (Task 2), `ReferenceModeMenu` (Task 3)
- Produces: `StoryMentionPickerSheet(references:onChange:)` — rend l'ensemble mis à jour, plus seulement un pseudo

**Ce qui change :** la feuille ne rend plus « un pseudo choisi » mais **pilote l'ensemble**. Elle reste ouverte après un tap, affiche les déjà-référencées en tête, et permet d'en retirer.

- [ ] **Step 1: Écrire le test rouge de la logique de sélection**

La partie testable sans UI est la transition d'état. Créer
`packages/MeeshySDK/Tests/MeeshyUITests/Story/ReferencePickerTests.swift` :

```swift
import Testing
@testable import MeeshyUI
@testable import MeeshySDK

struct ReferencePickerTests {

    @Test func test_tap_defaultsToSilent_fromThePicker() {
        // Depuis le chip hors-texte, le tap simple pose la référence la plus
        // discrète : la personne est notifiée, rien ne s'affiche.
        let result = ReferencePickerLogic.apply(
            .tap, username: "alice", userId: "u-a", to: [], context: .picker
        )
        #expect(result.map(\.display) == [.silent])
    }

    @Test func test_tap_defaultsToInline_fromTheTextList() {
        let result = ReferencePickerLogic.apply(
            .tap, username: "alice", userId: "u-a", to: [], context: .textList
        )
        #expect(result.map(\.display) == [.inline])
    }

    @Test func test_longPressChoice_overridesTheDefault() {
        let result = ReferencePickerLogic.apply(
            .choose(.pinned), username: "alice", userId: "u-a", to: [], context: .picker
        )
        #expect(result.map(\.display) == [.pinned])
    }

    @Test func test_choosingAgain_changesModeWithoutDuplicating() {
        let first = ReferencePickerLogic.apply(
            .tap, username: "alice", userId: "u-a", to: [], context: .picker
        )
        let second = ReferencePickerLogic.apply(
            .choose(.note), username: "alice", userId: "u-a", to: first, context: .picker
        )
        #expect(second.count == 1)
        #expect(second[0].display == .note)
    }
}
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/ReferencePickerTests
```

Attendu : échec de compilation.

- [ ] **Step 3: Écrire la logique pure de sélection**

Ajouter à `ComposerMentionQuery.swift` (à côté de `ComposerReferences`) :

```swift
/// D'où vient le geste — et donc quel mode un simple tap pose.
///
/// Deux entrées, deux défauts, parce que les deux gestes ne veulent pas dire la
/// même chose : depuis le chip, on nomme quelqu'un SANS l'écrire (le plus
/// discret gagne) ; depuis la liste `@`, on est en train de l'écrire (l'inline
/// gagne). L'appui long ouvre le même choix dans les deux cas.
public enum ReferencePickerContext: Sendable {
    case picker
    case textList

    var tapDefault: PostReferenceDisplay {
        switch self {
        case .picker: return .silent
        case .textList: return .inline
        }
    }
}

public enum ReferenceGesture: Sendable {
    case tap
    case choose(PostReferenceDisplay)
}

/// La transition d'état d'un geste de sélection — pure, donc testable sans UI.
public nonisolated enum ReferencePickerLogic {
    public static func apply(
        _ gesture: ReferenceGesture,
        username: String,
        userId: String?,
        to references: [ComposerReference],
        context: ReferencePickerContext
    ) -> [ComposerReference] {
        let display: PostReferenceDisplay
        switch gesture {
        case .tap: display = context.tapDefault
        case .choose(let chosen): display = chosen
        }
        return ComposerReferences.upsert(
            ComposerReference(username: username, userId: userId, display: display),
            into: references
        )
    }
}
```

- [ ] **Step 4: Refondre la feuille**

Dans `MentionSuggestions.swift`, remplacer `StoryMentionPickerSheet` par une feuille qui pilote
l'ensemble (spec §7.4) :

```swift
/// La feuille du chip « Mentionner ».
///
/// Elle NE SE FERME PAS au tap : on en ajoute plusieurs d'affilée sans rouvrir
/// quoi que ce soit. Les déjà-référencées remontent en tête avec la pastille de
/// leur mode ; un tap dessus rouvre le même menu — changer de mode et choisir un
/// mode sont le même geste, il n'y a rien de nouveau à apprendre.
struct StoryMentionPickerSheet: View {
    let references: [ComposerReference]
    /// Rend l'ensemble MIS À JOUR. La feuille ne décide de rien d'autre : le
    /// composer choisit quoi en faire (poser un badge sur le canevas, par
    /// exemple) — règle de pureté SDK.
    let onChange: ([ComposerReference]) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    var body: some View {
        VStack(spacing: 0) {
            header
            searchField
            if !references.isEmpty { alreadyReferenced }
            MentionSuggestionList(query: query, maxHeight: .infinity) { user in
                onChange(ReferencePickerLogic.apply(
                    .tap, username: user.username, userId: user.id,
                    to: references, context: .picker
                ))
                HapticFeedback.light()
                // Pas de `dismiss()` : on en ajoute plusieurs d'affilée.
            } contextMenu: { user in
                ReferenceModeMenu(modes: PostReferenceDisplay.declarable) { mode in
                    onChange(ReferencePickerLogic.apply(
                        .choose(mode), username: user.username, userId: user.id,
                        to: references, context: .picker
                    ))
                }
            }
        }
        .modifier(AudiencePickerPresentationStyle())
    }
    // header / searchField / alreadyReferenced : voir la maquette §7.4 de la spec.
    // `alreadyReferenced` = liste horizontale de chips, chacune avec sa pastille
    // de mode, un `contextMenu` pour changer, et un `✕` qui appelle
    // `ComposerReferences.remove(username:from:)`.
}
```

Et étendre `MentionSuggestionList` d'un paramètre `contextMenu:` optionnel — attaché à chaque
ligne via `.contextMenu { }`, pour que l'appui long ouvre le menu partout où la liste sert.

⚠️ **Un `Button` étouffe la séquence de gestes** : si la ligne est un `Button`, le
`.contextMenu` doit être posé **sur le Button**, pas à l'intérieur. Piège déjà rencontré sur le
scrub de story.

- [ ] **Step 5: Lancer les tests + le build**

```bash
xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/ReferencePickerTests
./apps/ios/meeshy.sh build
```

Attendu : PASS — 4 tests, build vert.

- [ ] **Step 6: Committer**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/MentionSuggestions.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/ComposerMentionQuery.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/ReferencePickerTests.swift
git commit -m "feat(sdk): la feuille de mention pilote l'ensemble, et ne se ferme plus au tap

Deux entrées, deux défauts : depuis le chip on nomme quelqu'un SANS l'écrire,
donc le plus discret gagne ; depuis la liste @ on est en train de l'écrire,
donc l'inline gagne. L'appui long ouvre le même choix dans les deux cas."
```

---

### Task 5: Composer story — le badge et les autres modes

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Elements.swift` (`addMention`)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+Media.swift` (présentation de la feuille)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEditorView.swift` (liste `@` dans un objet texte)
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryComposerReferencesTests.swift`

**Interfaces:**
- Consumes: tout ce qui précède
- Produces: `StoryComposerViewModel.references: [ComposerReference]`, `addReference(_:)`, `removeReference(username:)`

- [ ] **Step 1: Écrire le test rouge**

```swift
import Testing
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
struct StoryComposerReferencesTests {

    @Test func test_addReference_pinned_posesABadgeCarryingTheUserId() {
        let vm = StoryComposerViewModel()
        vm.addReference(ComposerReference(username: "alice", userId: "u-a", display: .pinned))

        let badges = vm.currentEffects.textObjects.filter { $0.referenceUserId != nil }
        #expect(badges.count == 1)
        #expect(badges[0].text == "@alice")
        #expect(badges[0].referenceUserId == "u-a")
    }

    @Test func test_addReference_note_posesNoBadge() {
        let vm = StoryComposerViewModel()
        vm.addReference(ComposerReference(username: "alice", userId: "u-a", display: .note))

        #expect(vm.currentEffects.textObjects.isEmpty)
        #expect(vm.references.map(\.display) == [.note])
    }

    @Test func test_addReference_silent_posesNoBadge() {
        let vm = StoryComposerViewModel()
        vm.addReference(ComposerReference(username: "alice", userId: "u-a", display: .silent))

        #expect(vm.currentEffects.textObjects.isEmpty)
        #expect(vm.references.map(\.display) == [.silent])
    }

    @Test func test_changingFromPinnedToNote_removesTheBadge() {
        let vm = StoryComposerViewModel()
        vm.addReference(ComposerReference(username: "alice", userId: "u-a", display: .pinned))
        vm.addReference(ComposerReference(username: "alice", userId: "u-a", display: .note))

        #expect(vm.currentEffects.textObjects.filter { $0.referenceUserId != nil }.isEmpty)
        #expect(vm.references.count == 1)
        #expect(vm.references[0].display == .note)
    }

    @Test func test_removingReference_removesItsBadgeToo() {
        let vm = StoryComposerViewModel()
        vm.addReference(ComposerReference(username: "alice", userId: "u-a", display: .pinned))
        vm.removeReference(username: "alice")

        #expect(vm.currentEffects.textObjects.isEmpty)
        #expect(vm.references.isEmpty)
    }

    @Test func test_deletingTheBadgeOnCanvas_dropsTheReference() {
        // L'auteur supprime la pastille au doigt : la référence doit partir
        // avec elle, sinon il notifie quelqu'un dont plus rien ne témoigne.
        let vm = StoryComposerViewModel()
        vm.addReference(ComposerReference(username: "alice", userId: "u-a", display: .pinned))
        let badgeId = vm.currentEffects.textObjects[0].id

        vm.deleteElement(id: badgeId)

        #expect(vm.references.isEmpty)
    }
}
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/StoryComposerReferencesTests
```

- [ ] **Step 3: Généraliser `addMention` en `addReference`**

Dans `StoryComposerViewModel+Elements.swift` :

```swift
    /// L'ensemble des personnes que cette story nomme, tous modes confondus.
    /// PINNED a en plus un badge sur le canevas ; les autres n'existent qu'ici.
    @Published public private(set) var references: [ComposerReference] = []

    /// Nomme quelqu'un, dans le mode choisi.
    ///
    /// PINNED pose un `StoryTextObject` portant `@pseudo` et son
    /// `referenceUserId` — c'est ce qui lui donne gratuitement déplacement,
    /// rotation, z-order, timeline, export et persistance, tout en le
    /// distinguant d'une phrase pour la dérivation serveur.
    ///
    /// Les trois autres modes ne posent RIEN sur le canevas : ils vivent dans
    /// `references`, que la publication déclare.
    public func addReference(_ reference: ComposerReference) {
        let previous = references.first { $0.username.lowercased() == reference.username.lowercased() }
        references = ComposerReferences.upsert(reference, into: references)

        // Changer de mode DEPUIS pinned retire le badge : le laisser afficherait
        // une étiquette que plus rien ne justifie.
        if previous?.display == .pinned, reference.display != .pinned {
            removeBadge(for: reference.username)
        }
        if reference.display == .pinned, previous?.display != .pinned {
            poseBadge(for: reference)
        }
    }

    /// Retire une personne — et le badge qui la portait, s'il y en avait un.
    public func removeReference(username: String) {
        references = ComposerReferences.remove(username: username, from: references)
        removeBadge(for: username)
    }
```

`poseBadge(for:)` reprend le corps de l'actuel `addMention(username:)` (fond plein, décalage en
cascade, `bringToFront`, pas de bascule vers l'outil texte) en posant en plus
`referenceUserId: reference.userId`.

`removeBadge(for:)` filtre `currentEffects.textObjects` sur `referenceUserId` correspondant.

- [ ] **Step 4: Fermer la boucle inverse — supprimer le badge retire la référence**

Dans la suppression d'élément du canevas (`deleteElement(id:)` ou son équivalent), si l'objet
supprimé porte un `referenceUserId`, retirer la référence correspondante de `references`.

**Sans ça, l'auteur supprime la pastille au doigt et notifie quand même quelqu'un dont plus
rien ne témoigne dans la story.**

- [ ] **Step 5: Brancher la feuille et la liste `@` du canevas**

`StoryComposerView+Media.swift` : passer `references:` et `onChange:` à la feuille, et router
chaque référence par `viewModel.addReference(_:)`.

`StoryTextEditorView.swift` : la liste `@` d'un objet texte utilise
`ReferencePickerContext.textList` — tap = INLINE (insertion, comportement actuel), appui long =
les quatre modes ; les trois non-INLINE appellent
`ComposerReferences.removingHandle(_:from:)` sur le texte de l'objet **et**
`viewModel.addReference(_:)`.

- [ ] **Step 6: Lancer les tests + build**

```bash
xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/StoryComposerReferencesTests
./apps/ios/meeshy.sh build
```

- [ ] **Step 7: Committer**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/ \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryComposerReferencesTests.swift
git commit -m "feat(sdk): le composer story pose les quatre modes, badge compris

Supprimer la pastille au doigt retire la référence : sans cette boucle,
l'auteur notifie quelqu'un dont plus rien ne témoigne dans la story."
```

---

### Task 6: Composer post / réel / statut — les deux entrées

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/UnifiedPostComposerReferencesTests.swift`

**Interfaces:**
- Consumes: tout ce qui précède
- Produces: `UnifiedPostComposer` porte `references: [ComposerReference]` et les transmet à la publication

**Rappel §9 de la spec :** un POST, un REEL ou un STATUS n'a **aucune couche de positionnement**
sur ses médias. L'option « badge » y est donc **masquée** — `modes:` reçoit `[.note, .silent]`
au lieu de `PostReferenceDisplay.declarable`.

- [ ] **Step 1: Écrire le test rouge**

```swift
@MainActor
struct UnifiedPostComposerReferencesTests {

    @Test func test_declarableModes_forAContentWithoutCanvas_excludePinned() {
        // Proposer un badge là où rien ne peut l'afficher promettrait un mode
        // invisible. L'option revient à la convergence des composers.
        #expect(UnifiedPostComposer.modes(forCanvas: false) == [.note, .silent])
    }

    @Test func test_declarableModes_forAContentWithCanvas_includePinned() {
        #expect(UnifiedPostComposer.modes(forCanvas: true) == [.pinned, .note, .silent])
    }

    @Test func test_choosingNote_fromTheTextList_stripsTheHandle() {
        let stripped = ComposerReferences.removingHandle("alice", from: "Soirée avec @alice")
        #expect(stripped == "Soirée avec")
    }
}
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

- [ ] **Step 3: Ajouter les deux entrées au composer**

1. **Le chip « Mentionner »** dans la barre d'outils, à côté du chip média — il présente
   `StoryMentionPickerSheet` avec `modes: Self.modes(forCanvas: false)`.
2. **La liste `@`** existante (`mentionSuggestions`) gagne son `contextMenu` :

```swift
    @ViewBuilder
    private var mentionSuggestions: some View {
        if let query = mentionQuery {
            MentionSuggestionList(query: query) { user in
                // Tap = INLINE : comportement actuel, inchangé.
                content = ComposerMentionQuery.replacingTrailingHandle(in: content, with: user.username)
                references = ReferencePickerLogic.apply(
                    .tap, username: user.username, userId: user.id,
                    to: references, context: .textList
                )
                mentionQuery = nil
            } contextMenu: { user in
                ReferenceModeMenu(modes: [.inline] + Self.modes(forCanvas: false)) { mode in
                    // Tout sauf INLINE retire le `@handle` du texte : c'est
                    // exactement l'intérêt du geste.
                    content = mode == .inline
                        ? ComposerMentionQuery.replacingTrailingHandle(in: content, with: user.username)
                        : ComposerReferences.removingHandle(user.username, from: content)
                    references = ReferencePickerLogic.apply(
                        .choose(mode), username: user.username, userId: user.id,
                        to: references, context: .textList
                    )
                    mentionQuery = nil
                }
            }
            .background(RoundedRectangle(cornerRadius: 12).fill(theme.inputBackground))
            .padding(.horizontal, 16)
            .transition(.opacity)
        }
    }

    /// Les modes proposables selon que le contenu a un canevas ou non.
    ///
    /// PINNED n'a de sens que là où une couche de positionnement existe —
    /// aujourd'hui la seule STORY. Proposer un badge sur un POST promettrait un
    /// affichage qui n'arriverait jamais ; l'option revient quand la convergence
    /// des composers aura donné un canevas à tous les types.
    static func modes(forCanvas hasCanvas: Bool) -> [PostReferenceDisplay] {
        hasCanvas ? [.pinned, .note, .silent] : [.note, .silent]
    }
```

3. **La rangée d'état** `ReferenceChipRow(references:accentColor:onTap:)` sous la barre d'outils.

- [ ] **Step 4: Lancer les tests + build**

```bash
xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/UnifiedPostComposerReferencesTests
./apps/ios/meeshy.sh build
```

- [ ] **Step 5: Committer**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/UnifiedPostComposerReferencesTests.swift
git commit -m "feat(sdk): le composer de post gagne les deux entrées de référence

L'option badge y est masquée : un post n'a aucune couche de positionnement
sur ses médias, et proposer un mode qui ne s'afficherait nulle part vaut
moins que l'absence de l'option."
```

---

### Task 7: Publication — envoyer les modes, cesser de deviner

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift` (`runStoryUpload`, ~ligne 2192)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift` (`createStory`, `createPost`)
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/StoryUploadReferencesTests.swift`

**Interfaces:**
- Consumes: `ComposerReferences.payload(_:)` (Task 2), `PostMentionInput` (Task 1)
- Produces: `createPost(..., mentions:)` — la signature `createStory` en a déjà une

- [ ] **Step 1: Écrire le test rouge**

```swift
@MainActor
final class StoryUploadReferencesTests: XCTestCase {

    func test_upload_sendsDeclaredModes_notDerivedHandles() async throws {
        let service = MockPostService()
        let vm = StoryViewModel(postService: service)

        await vm.publish(references: [
            ComposerReference(username: "alice", userId: "u-a", display: .pinned),
            ComposerReference(username: "bob", userId: nil, display: .silent),
        ])

        let sent = try XCTUnwrap(service.lastCreateStoryMentions)
        XCTAssertEqual(sent.count, 2)
        XCTAssertEqual(sent[0].display, "PINNED")
        XCTAssertEqual(sent[1].display, "SILENT")
    }

    func test_upload_doesNotDeriveMentionsFromTextObjects() async throws {
        // La dérivation vivait ici (`handles(inAll: textObjects.map(\.text))`).
        // Elle appartient désormais au SERVEUR, qui relit le texte lui-même —
        // deux dériveurs finiraient par ne plus dire la même chose.
        let service = MockPostService()
        let vm = StoryViewModel(postService: service)

        await vm.publish(textObjects: ["coucou @carol"], references: [])

        XCTAssertNil(service.lastCreateStoryMentions)
    }
}
```

> Adapter les noms de `MockPostService` et de la méthode de publication à ceux du dépôt —
> `apps/ios/MeeshyTests/` porte déjà des doubles pour `PostService`.

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
./apps/ios/meeshy.sh test
```

- [ ] **Step 3: Remplacer la dérivation par la déclaration**

Dans `StoryViewModel.swift`, remplacer le bloc `canvasMentions` (~ligne 2192) :

```swift
            // Les modes que l'auteur a CHOISIS. On ne dérive plus les `@handle`
            // des objets texte : le serveur les relit lui-même (il lit `content`
            // ET `storyEffects.textObjects[].text`, badges exclus), et deux
            // dériveurs finiraient par ne plus dire la même chose.
            let declaredReferences = ComposerReferences.payload(upload.references)
```

puis passer `mentions: declaredReferences.isEmpty ? nil : declaredReferences`.

- [ ] **Step 4: Ajouter `mentions` à `createPost`**

`PostService.createStory` porte déjà le paramètre. `createPost` ne l'a pas : l'ajouter, avec la
même valeur par défaut `nil` sur le protocole `PostServiceProviding` pour ne pas casser les
conformeurs existants — c'est le patron déjà utilisé ligne 104 pour `createStory`.

- [ ] **Step 5: Lancer les tests**

```bash
./apps/ios/meeshy.sh test
```

- [ ] **Step 6: Committer**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift \
        apps/ios/MeeshyTests/Unit/ViewModels/StoryUploadReferencesTests.swift
git commit -m "feat(ios): la publication déclare les modes au lieu de deviner les pseudos

La dérivation des @handle depuis les objets texte quitte le client : le
serveur relit le texte lui-même, badges exclus. Deux dériveurs finiraient
par ne plus dire la même chose."
```

---

### Task 8: Rendu — surligner ce qui est validé, montrer ce qui est en note

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Utilities/MessageTextRenderer.swift`
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/ReferenceNoteRow.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift:1298` et les cellules de feed
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/MessageTextRendererValidationTests.swift`

**Interfaces:**
- Consumes: `PostReference` (Task 1)
- Produces: `MessageTextRenderer.render(..., validUsernames: Set<String>?)`, `ReferenceNoteRow`

**Deux défauts corrigés au passage :**
1. `MessageTextRenderer` linkifie **tout** `@handle`, existant ou non → un lien vers un profil inexistant.
2. Sa regex `(?<![a-zA-Z0-9])@([a-zA-Z0-9_]{1,30})` **exclut le tiret**, là où le backend l'inclut (`MENTION_HANDLE_CHARS`) : `@marie-claire` est tronqué en `@marie`.

- [ ] **Step 1: Écrire les tests rouges**

```swift
struct MessageTextRendererValidationTests {

    @Test func test_render_withValidUsernames_linksOnlyThose() {
        let segments = MessageTextRenderer.parseForTesting(
            "salut @alice et @nimportequoi",
            validUsernames: ["alice"]
        )
        let links = segments.compactMap { if case .mentionLink(_, _, let u) = $0 { return u } else { return nil } }
        #expect(links == ["alice"])
    }

    @Test func test_render_withoutValidUsernames_keepsCurrentBehaviour() {
        // Les messages passent `nil` : leur surlignage vient déjà de
        // `validatedMentions`, et rien ne doit changer pour eux.
        let segments = MessageTextRenderer.parseForTesting("salut @alice", validUsernames: nil)
        #expect(segments.contains { if case .mentionLink = $0 { return true } else { return false } })
    }

    @Test func test_render_handleWithHyphen_isNotTruncated() {
        let segments = MessageTextRenderer.parseForTesting(
            "salut @marie-claire", validUsernames: ["marie-claire"]
        )
        let links = segments.compactMap { if case .mentionLink(_, _, let u) = $0 { return u } else { return nil } }
        #expect(links == ["marie-claire"])
    }
}
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

- [ ] **Step 3: Ajouter la validation et le tiret**

Dans `MessageTextRenderer.swift` :

```swift
    /// Quand il est fourni, SEULS ces pseudos deviennent des liens ; les autres
    /// restent du texte brut.
    ///
    /// Sans lui, `@nimportequoi` devenait un lien vers un profil inexistant —
    /// le renderer ne pouvait pas savoir. Les messages passent `nil` : leur
    /// surlignage vient déjà de `validatedMentions` en amont, et rien ne change
    /// pour eux.
    validUsernames: Set<String>? = nil,
```

et corriger la regex pour inclure le tiret et le point, alignée sur `MENTION_HANDLE_CHARS` :

```swift
    private static let mentionRegex = try! NSRegularExpression(
        // Tiret et point INCLUS — le backend les accepte (`MENTION_HANDLE_CHARS`),
        // et sans eux `@marie-claire` était tronqué en `@marie` : le lien
        // pointait vers quelqu'un d'autre.
        pattern: #"(?<![a-zA-Z0-9])@([a-zA-Z0-9_.-]{1,30})"#
    )
```

Dans `parse`, ne produire un `.mentionLink` que si `validUsernames == nil ||
validUsernames!.contains(username.lowercased())`.

- [ ] **Step 4: Écrire la rangée « Avec … »**

Créer `ReferenceNoteRow.swift` — une rangée compacte sous le contenu, rendue **uniquement**
pour `display == .note` :

```swift
/// « Avec @alice, @bob » sous le contenu.
///
/// SILENT n'y figure JAMAIS, d'où qu'il vienne. Un post détaillé mis en cache
/// puis réutilisé pour rendre une carte de feed porte les silencieuses du
/// lecteur : la garde est ICI, dans le composant de rendu, pas dans la couche
/// réseau qui n'a aucun moyen de savoir où sa charge utile sera réaffichée.
///
/// PINNED n'y figure pas non plus : la pastille sur le canevas EST déjà son
/// affichage, la doubler ferait redite.
public struct ReferenceNoteRow: View, Equatable {
    let references: [PostReference]
    let accentColor: Color
    let onTap: (PostReference) -> Void

    public static func == (lhs: ReferenceNoteRow, rhs: ReferenceNoteRow) -> Bool {
        lhs.references == rhs.references && lhs.accentColor == rhs.accentColor
    }

    private var noted: [PostReference] { references.filter { $0.display == .note } }

    public var body: some View {
        if !noted.isEmpty { /* … chips tappables vers le profil … */ }
    }
}
```

- [ ] **Step 5: Écrire le marqueur personnel**

Quand `references` contient une entrée `display == .silent` **dont le `userId` est celui du
lecteur**, afficher un marqueur discret « Vous êtes référencé·e ici ». C'est la seule réponse
que la personne trouve dans le contenu à la notification qu'elle vient de recevoir.

- [ ] **Step 6: Brancher sur les surfaces de rendu**

`PostDetailView.swift:1298` et les cellules de feed / réel : passer
`validUsernames: Set(post.mentions?.map { $0.username.lowercased() } ?? [])` à
`MessageTextRenderer.render`, et poser `ReferenceNoteRow` sous le contenu.

⚠️ **Passer `nil` quand `post.mentions` est `nil`** (serveur non déployé) plutôt qu'un ensemble
vide — un ensemble vide ne linkifierait plus rien du tout, ce qui serait une régression visible.

- [ ] **Step 7: Lancer les tests + build**

```bash
xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/MessageTextRendererValidationTests
./apps/ios/meeshy.sh test
```

- [ ] **Step 8: Committer**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Utilities/MessageTextRenderer.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/ReferenceNoteRow.swift \
        apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/MessageTextRendererValidationTests.swift
git commit -m "fix(sdk): un @handle inexistant devenait un lien vers un profil qui n'existe pas

Le renderer linkifiait tout, faute de savoir qui existe. Il reçoit désormais
les pseudos validés. Et sa regex excluait le tiret là où le backend l'accepte:
@marie-claire pointait vers @marie."
```

---

### Task 9: Viewer — ouvrir un contenu expiré quand le serveur l'autorise

**Files:**
- Modify: `apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationTargetViewModel.swift`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift` (filtres `!$0.isExpired()`, ~2750 / ~2782)
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/ReferenceAccessViewerTests.swift`

**Interfaces:**
- Consumes: `APIPost.referenceAccess` (Task 1)
- Produces: `StoryNotificationTargetViewModel.State` gagne `.expiredConsumed`

- [ ] **Step 1: Écrire le test rouge**

```swift
@MainActor
final class ReferenceAccessViewerTests: XCTestCase {

    func test_expiredStory_withGrantedAccess_rendersActive() async {
        let service = MockStoryService(post: .expired(referenceAccess: .granted))
        let vm = StoryNotificationTargetViewModel(storyId: "p1", storyService: service)

        await vm.load()

        XCTAssertEqual(vm.state, .active(service.post))
    }

    func test_expiredStory_withConsumedAccess_rendersExpired() async {
        let service = MockStoryService(post: .expired(referenceAccess: .consumed))
        let vm = StoryNotificationTargetViewModel(storyId: "p1", storyService: service)

        await vm.load()

        XCTAssertEqual(vm.state, .expiredConsumed)
    }

    func test_expiredStory_withoutReference_keepsCurrentBehaviour() async {
        let service = MockStoryService(post: .expired(referenceAccess: Optional.none))
        let vm = StoryNotificationTargetViewModel(storyId: "p1", storyService: service)

        await vm.load()

        XCTAssertEqual(vm.state, .expired)
    }

    func test_load_neverCallsRecordView() async {
        // La vue DÉCLARÉE consomme le droit. Un chargement — prefetch NSE,
        // revalidation cache-first, pull-to-refresh — ne doit JAMAIS l'appeler.
        let service = MockStoryService(post: .expired(referenceAccess: .granted))
        let vm = StoryNotificationTargetViewModel(storyId: "p1", storyService: service)

        await vm.load()
        await vm.load()

        XCTAssertEqual(service.recordViewCallCount, 0)
    }
}
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

- [ ] **Step 3: Faire obéir l'ouverture au serveur**

Dans `StoryNotificationTargetViewModel.load()`, remplacer `isExpired(cached)` par une décision
qui consulte d'abord le verdict :

```swift
    /// Le droit se DÉCLARE, il ne se déduit pas.
    ///
    /// `isExpired` ne voit que `expiresAt` et ignore tout de la référence :
    /// s'en remettre à lui ferait refuser un contenu que le serveur autorise.
    /// Il reste utile pour ce qu'il sait faire — masquer du tray, griser un
    /// aperçu — mais l'OUVERTURE obéit au verdict.
    private func state(for post: APIPost) -> State {
        switch post.referenceAccess {
        case .granted:  return .active(post)
        case .consumed: return .expiredConsumed
        case .none, nil: return isExpired(post) ? .expired : .active(post)
        }
    }
```

- [ ] **Step 4: Ne consommer qu'à l'affichage réel**

`POST /posts/:postId/view` est appelée par le **viewer**, quand la slide est réellement à
l'écran — pas par `load()`, pas par le prefetch NSE, pas par la revalidation.

Vérifier que `NSEPendingPostConsumer.consumeAll()` n'appelle rien de tel.

- [ ] **Step 5: Ouvrir le tray aux stories référencées**

Dans `StoryViewModel`, les filtres `group.stories.filter { !$0.isExpired() }` (~2750 / ~2782)
gardent une story expirée **dont `referenceAccess == .granted`**.

⚠️ Cela n'injecte **pas** de contenu étranger dans le tray : le serveur ne sert dans
`getStories` que ce que le lecteur peut déjà voir (décision §3.5 de la spec — la branche ACL
n'est pas dans le filtre de liste). Le seul effet est qu'une story **déjà présente** ne
disparaît pas à son échéance pour la personne qui y est nommée.

- [ ] **Step 6: Lancer les tests + build**

```bash
./apps/ios/meeshy.sh test
```

- [ ] **Step 7: Committer**

```bash
git add apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationTargetViewModel.swift \
        apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift \
        apps/ios/MeeshyTests/Unit/ViewModels/ReferenceAccessViewerTests.swift
git commit -m "feat(ios): une story expirée s'ouvre quand le serveur l'autorise

Le viewer déduisait l'expiration de expiresAt et ignorait tout de la
référence : il refusait un contenu que le serveur autorise. Le chargement
ne consomme jamais le droit — seule la vue affichée le fait."
```

---

### Task 10: Notification — le libellé et la surface de tap

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/NotificationModels.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/NotificationModelsTests.swift` (existant)

- [ ] **Step 1: Écrire le test rouge**

```swift
@Test func test_userMentioned_onAStory_saysReferencedInStory() throws {
    let json = """
    {"id":"n1","type":"user_mentioned","userId":"u1",
     "metadata":{"postType":"STORY","entityType":"post","postId":"p1"},
     "context":{"postId":"p1"}}
    """.data(using: .utf8)!

    let notification = try JSONDecoder().decode(MeeshyNotification.self, from: json)

    #expect(notification.tapDestination == .story(postId: "p1"))
}
```

- [ ] **Step 2: Lancer, échouer, implémenter**

Le libellé vient du serveur (`notification-strings.ts`, Task 10 du plan gateway) : rien à
traduire ici. Ce qui change côté iOS est le **routage du tap**, qui doit ouvrir la surface du
type porté par `metadata.postType` — réel, détail de post, viewer de story, viewer de statut.

`isLinkedContentExpired` reste un **marqueur visuel** et ne bloque aucun tap : ne pas l'y
ajouter. Un contenu dont le droit est éteint atterrit sur l'écran de fin, servi par le viewer
(Task 9), pas sur un tap refusé.

- [ ] **Step 3: Lancer les tests, committer**

```bash
./apps/ios/meeshy.sh test
git add packages/MeeshySDK/Sources/MeeshySDK/Models/NotificationModels.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Models/NotificationModelsTests.swift
git commit -m "feat(sdk): le tap d'une notification de référence ouvre la surface du type"
```

---

## Vérification finale

- [ ] **Suite complète**

```bash
./apps/ios/meeshy.sh test
```

- [ ] **Build propre**

```bash
./apps/ios/meeshy.sh build
```

- [ ] **Les quatre gardes silencieuses de toute nouvelle UI**
  - catalogue complet dans les **7 langues**, bundle `.module` (MeeshyUI) et non `.main`
  - aucune clé morte laissée derrière
  - police Focal respectée
  - chevrons et symboles directionnels corrects en RTL — **pas d'inversion des SF Symbols sémantiques**

- [ ] **`git status` montre tout fichier neuf** avant commit — `gitignore` masque `*/**/models/`
  et `*/**/cache`, ce qui a déjà rendu des tests verts par omission et cassé le `pbxproj` chez
  les cloneurs.

- [ ] **Snapshots** : une nouvelle rangée sous le contenu déplace la mise en page. Ré-enregistrer
  les baselines touchées, et vérifier que le script d'enregistrement n'a pas échoué en silence.

## Non-régression

| Risque | Garde |
|---|---|
| Charge utile d'un serveur non déployé (`mentions` absent) | `decodeIfPresent` → `nil`, et le renderer reçoit `nil` (pas un ensemble vide) : le surlignage actuel est conservé |
| Mode inconnu ajouté côté serveur | `PostReferenceDisplay.init(from:)` retombe sur `.inline` — un post reste lisible |
| Apps anciennes | `PostMentionInput.display` optionnel ; le serveur lit `nil` comme PINNED (ancien CANVAS) |
| `mentionedUsers` retiré du post | champ mort, jamais alimenté par le gateway — vérifié |
| `MessageRecord.mentionedUsersJson` | **conservé** : le chemin messages est vivant |
| Colonne SQLite `PostRecord.mentionedUsersJson` | laissée en base, plus écrite — supprimer le champ sans migration ferait échouer le décodage GRDB |
| `MessageTextRenderer` pour les messages | `validUsernames: nil` par défaut → comportement identique |
| Prefetch NSE / revalidation consommant le droit | test comptant les appels à `recordView` (Task 9) |
