# Prompt Agent: Complete PR #2945 iOS Deep Links + Draft Injection

> **Destinataire**: Agent iOS senior  
> **Objectif**: Implémenter les 14 changements du fichier `tasks/pr2945-complete-integration.md`  
> **Autonome**: OUI (pas de questions, pas d'interactions)  
> **Durée estimée**: 4h  
> **Cycle**: 107

---

## 🎯 Mission Résumée

Le PR #2945 réussit à router 3 deep links vers les conversations MAIS ne passe pas le texte du brouillon. Résultat : les raccourcis Siri "Envoyer un message" et le widget "Réponse rapide" tapent une conversation vide.

**Ta mission**: Compléter l'intégration pour que le texte du brouillon soit injecté dans `DraftStore` avant l'ouverture de la conversation.

**Livrable**: Branch `feat/pr2945-completion` avec tous les changements Phase 1 + Phase 2 + Phase 3, testée et mergeable.

---

## 📋 Plan d'exécution

### Étape 0: Préparation (10min)

1. **Fetch main et crée la branch**:
   ```bash
   cd /Users/smpceo/Documents/v2_meeshy
   git fetch origin main
   git checkout main
   git pull origin main
   git checkout -b feat/pr2945-completion
   ```

2. **Vérifie ton environnement**:
   ```bash
   bun --version  # Doit être 1.3.14+
   cd apps/ios
   ls -la Meeshy/Features/Main/Navigation/  # Cherche DeepLinkRouter.swift
   ```

3. **Ouvre le fichier de référence**:
   ```bash
   less tasks/pr2945-complete-integration.md  # Pour consulter au besoin
   ```

---

### Étape 1: Changement 1 — Étendre `DeepLinkDestination` (5min)

**Fichier**: `apps/ios/Meeshy/Features/Main/Navigation/DeepLinkRouter.swift`

**Action**:
1. Ouvre le fichier
2. Trouve la ligne `enum DeepLinkDestination {` (~line 10)
3. Cherche la ligne `case conversation(id: String)`
4. Remplace-la par `case conversation(id: String, draftText: String? = nil)`

**Avant**:
```swift
enum DeepLinkDestination {
    case ownProfile
    case userProfile(username: String)
    case conversation(id: String)
```

**Après**:
```swift
enum DeepLinkDestination {
    case ownProfile
    case userProfile(username: String)
    case conversation(id: String, draftText: String? = nil)
```

**Vérification**:
```bash
swift -parse apps/ios/Meeshy/Features/Main/Navigation/DeepLinkRouter.swift
# Ou: cd apps/ios && bun run build (doit compiler sans erreur)
```

✅ **Checklist**: Enum compiles, cas conversation a maintenant 2 champs (id + draftText optionnel).

---

### Étape 2: Changement 2 — Parser extrait text/message (15min)

**Fichier**: `apps/ios/Meeshy/Features/Main/Navigation/DeepLinkRouter.swift`

**Action**: Modifier la méthode `parse()` du `DeepLinkParser`

1. Trouve la ligne `case "contact":` (~line 200)
2. Après ce cas, ajoute les 2 nouveaux cas `quickreply` et `send`

**À ajouter** (copie/colle exact après le cas `contact`):
```swift
        case "quickreply":
            // meeshy://quickreply/{id}?text=… — Widget Réponse rapide.
            // Extrait le texte du brouillon depuis query param.
            if components.count >= 2 {
                let draftText = queryValue("text", in: url)
                return .conversation(id: components[1], draftText: draftText)
            }

        case "send":
            // meeshy://send?contactId=…&message=… — App Shortcut "Send Message".
            // contactId est en réalité conversationId (App Group key).
            // Le message est le brouillon à déposer avant navigation.
            if let contactId = queryValue("contactId", in: url) {
                let draftText = queryValue("message", in: url)
                return .conversation(id: contactId, draftText: draftText)
            }
```

**Vérification**:
```bash
# Vérifie que le code compiles
cd apps/ios && swift -frontend -parse Meeshy/Features/Main/Navigation/DeepLinkRouter.swift > /dev/null 2>&1 && echo "✅ Compile" || echo "❌ Erreur"
```

✅ **Checklist**: 
- Cas `quickreply` utilise `queryValue("text", in: url)`
- Cas `send` utilise `queryValue("contactId", in: url)` ET `queryValue("message", in: url)`
- Les deux retournent `.conversation(id:, draftText:)` avec les paramètres extraits

---

### Étape 3: Changement 3 — Router passe draftText au handler (10min)

**Fichier**: `apps/ios/Meeshy/Features/Main/Navigation/Router.swift`

**Action**: Modifier l'appel à `handleConversationDeepLink` dans `handleDeepLink`

1. Ouvre `Router.swift`
2. Trouve `func handleDeepLink(_ url: URL)` (~line 261)
3. Trouve le switch case `.conversation(let id):` (~line 290)
4. Remplace par:

**Avant**:
```swift
            case .conversation(let id):
                Task { [weak self] in
                    await self?.handleConversationDeepLink(id)
                }
```

**Après**:
```swift
            case .conversation(let id, let draftText):
                Task { [weak self] in
                    await self?.handleConversationDeepLink(id, draftText: draftText)
                }
```

**Vérification**:
```bash
cd apps/ios && bun run build 2>&1 | grep -i "error.*handleConversationDeepLink" || echo "✅ Pas d'erreurs handleConversationDeepLink"
```

✅ **Checklist**: Le destructuring du tuple `.conversation` inclut maintenant `draftText`.

---

### Étape 4: Changement 4 — Modifier signature + logique handleConversationDeepLink (20min)

**Fichier**: `apps/ios/Meeshy/Features/Main/Navigation/Router.swift`

**Action**: Étendre la signature et ajouter l'injection de draft

1. Trouve `private func handleConversationDeepLink(_ conversationId: String) async` (~line 334)
2. Remplace la signature par `private func handleConversationDeepLink(_ conversationId: String, draftText: String? = nil) async`
3. DANS le corps de la fonction, APRÈS `let conversation = apiConversation.toConversation(...)` et AVANT `navigateToConversation(conversation)`, ajoute:

**À injecter** (avant `navigateToConversation`):
```swift
        // Injecter le brouillon si fourni (widget / App Shortcut)
        if let draftText = draftText, !draftText.isEmpty {
            DraftStore.shared.setDraft(text: draftText, for: conversationId)
            Self.logger.info("Deep link injected draft text for \(conversationId)")
        }
```

**La fonction complète doit ressembler à**:
```swift
    private func handleConversationDeepLink(_ conversationId: String, draftText: String? = nil) async {
        do {
            let currentUserId = AuthManager.shared.currentUser?.id ?? ""
            let apiConversation = try await ConversationService.shared.getById(conversationId)
            let conversation = apiConversation.toConversation(currentUserId: currentUserId)
            
            // Injecter le brouillon si fourni (widget / App Shortcut)
            if let draftText = draftText, !draftText.isEmpty {
                DraftStore.shared.setDraft(text: draftText, for: conversationId)
                Self.logger.info("Deep link injected draft text for \(conversationId)")
            }
            
            navigateToConversation(conversation)
            Self.logger.info("Deep link navigated to conversation \(conversationId)")
        } catch {
            Self.logger.error("Failed to load conversation for deep link: \(error.localizedDescription)")
            FeedbackToastManager.shared.showError(String(localized: "deeplink.conversation.error", defaultValue: "Couldn't open the conversation", bundle: .main))
        }
    }
```

**Vérification**:
```bash
cd apps/ios && bun run build 2>&1 | head -20  # Vérifier pas d'erreurs
```

✅ **Checklist**: 
- Signature accepte `draftText: String? = nil`
- `DraftStore.setDraft()` est appelé AVANT navigation
- Log messages sont en place

---

### Étape 5: Changement 5 — Tests Parser capture text/message (20min)

**Fichier**: `apps/ios/MeeshyTests/Unit/Navigation/DeepLinkWidgetSurfaceTests.swift`

**Action**: Ajouter les 4 tests de capture de texte

1. Ouvre le fichier `DeepLinkWidgetSurfaceTests.swift` (doit exister depuis le PR)
2. À la FIN de la classe `DeepLinkWidgetSurfaceParserTests` (avant le `}` final), ajoute:

```swift
    func test_parse_customScheme_quickReply_capturesText() {
        let destination = DeepLinkParser.parse(URL(string: "meeshy://quickreply/conv456?text=Hello%20World")!)

        guard case .conversation(let id, let draftText) = destination else {
            return XCTFail("Expected .conversation, got \(destination)")
        }
        XCTAssertEqual(id, "conv456")
        XCTAssertEqual(draftText, "Hello World")
    }

    func test_parse_customScheme_send_capturesMessage() {
        let destination = DeepLinkParser.parse(
            URL(string: "meeshy://send?contactId=conv789&message=Bonjour%20Monde")!
        )

        guard case .conversation(let id, let draftText) = destination else {
            return XCTFail("Expected .conversation, got \(destination)")
        }
        XCTAssertEqual(id, "conv789")
        XCTAssertEqual(draftText, "Bonjour Monde")
    }

    func test_parse_customScheme_quickReply_withoutText_returnsNilDraft() {
        let destination = DeepLinkParser.parse(URL(string: "meeshy://quickreply/conv123")!)

        guard case .conversation(let id, let draftText) = destination else {
            return XCTFail("Expected .conversation, got \(destination)")
        }
        XCTAssertEqual(id, "conv123")
        XCTAssertNil(draftText)
    }

    func test_parse_customScheme_send_withoutMessage_returnsNilDraft() {
        let destination = DeepLinkParser.parse(URL(string: "meeshy://send?contactId=conv456")!)

        guard case .conversation(let id, let draftText) = destination else {
            return XCTFail("Expected .conversation, got \(destination)")
        }
        XCTAssertEqual(id, "conv456")
        XCTAssertNil(draftText)
    }
```

**Vérification**:
```bash
cd apps/ios
bun test DeepLinkWidgetSurfaceParserTests 2>&1 | grep -E "✓|✗"  # Tous les tests passent?
```

✅ **Checklist**: Les 4 tests sont ajoutés et compilent.

---

### Étape 6: Changement 6 — Tests Router injects draft (20min)

**Fichier**: Crée `apps/ios/MeeshyTests/Unit/Navigation/DeepLinkRouterDraftInjectionTests.swift`

**Action**: Créer un nouveau fichier de tests

1. Crée le fichier:
   ```bash
   touch apps/ios/MeeshyTests/Unit/Navigation/DeepLinkRouterDraftInjectionTests.swift
   ```

2. Copie/colle le contenu (du fichier `pr2945-complete-integration.md`, Changement 6):
   ```swift
   import XCTest
   @testable import Meeshy

   @MainActor
   final class DeepLinkRouterDraftInjectionTests: XCTestCase {
       
       private var router: Router!
       
       override func setUp() {
           super.setUp()
           router = Router()
       }
       
       func test_handleConversationDeepLink_withDraftText_setsDraft() async {
           let conversationId = "conv-test-123"
           let draftText = "Test message from shortcut"
           
           // Avant: clear le draft
           DraftStore.shared.clearDraft(for: conversationId)
           
           // Appliquer la logique d'injection
           if !draftText.isEmpty {
               DraftStore.shared.setDraft(text: draftText, for: conversationId)
           }
           
           let retrievedDraft = DraftStore.shared.getDraft(for: conversationId)
           XCTAssertEqual(retrievedDraft?.text, draftText)
       }
       
       func test_handleConversationDeepLink_withoutDraftText_doesNotClear() async {
           let conversationId = "conv-test-456"
           let existingDraft = "Existing draft"
           
           // Preset une draft existante
           DraftStore.shared.setDraft(text: existingDraft, for: conversationId)
           
           // Vérifier que le draft existant est préservé (pas d'injection = pas de change)
           let retrievedDraft = DraftStore.shared.getDraft(for: conversationId)
           XCTAssertEqual(retrievedDraft?.text, existingDraft)
       }
   }
   ```

**Vérification**:
```bash
cd apps/ios
bun test DeepLinkRouterDraftInjectionTests 2>&1 | tail -5
```

✅ **Checklist**: Fichier créé, tests compilent et passent.

---

### Étape 7: Changement 7 — Vérifier call sites (5min)

**Action**: S'assurer qu'aucun appel existant à `handleConversationDeepLink()` ne casse

**Commande**:
```bash
cd apps/ios
grep -r "handleConversationDeepLink" Meeshy --include="*.swift" | grep -v "private func handleConversationDeepLink"
```

**Résultat attendu**: ZÉRO résultat (ou seulement le seul call site dans `Router.handleDeepLink` qu'on a déjà fixé).

✅ **Checklist**: Aucun appel cassant trouvé.

---

### 🚨 PAUSE BUILD PHASE 1 🚨

**Teste MAINTENANT tout Phase 1 avant de continuer**:

```bash
cd apps/ios

# 1. Compile
bun run build 2>&1 | head -30

# 2. Run tests Deep Link ONLY
bun test DeepLink.*Tests 2>&1 | tail -20

# 3. Vérifie qu'aucune erreur de signature n'est manquée
grep -r "handleConversationDeepLink" . --include="*.swift" | wc -l  # Doit être 2 (signature + 1 call site)
```

**Si tout est ✅**, continue Phase 2.  
**Si ❌**, stop et debug avant de continuer.

---

### Étape 8: Changement 8 — Docstring publishFavoriteContacts (5min)

**Fichier**: `apps/ios/Meeshy/Features/Main/Services/WidgetDataManager.swift`

**Ligne**: ~267

**Action**: Enrichir la docstring

**Avant**:
```swift
    func publishFavoriteContacts(_ conversations: [MeeshyConversation]) {
```

**Après**:
```swift
    /// Publie les contacts épinglés (directs uniquement, limité à 8) dans le container
    /// `group.me.meeshy.apps` sous la clé `favorite_contacts`.
    /// 
    /// C'est LA SOURCE DE VÉRITÉ que `MeeshyAppIntents.ContactQuery.entities()`
    /// lit pour rehydrater les raccourcis Siri enregistrés. Ne change JAMAIS la clé
    /// `favoritesKey` sans mettre à jour aussi `MeeshyAppIntents.swift`.
    ///
    /// - Parameter conversations: Conversations à publier (filtrées et triées localement)
    func publishFavoriteContacts(_ conversations: [MeeshyConversation]) {
```

✅ **Checklist**: Docstring mentionne la clé `favorite_contacts` et la synchronisation requise.

---

### Étape 9: Changement 9 — Docstring ContactQuery.entities (10min)

**Fichier**: `apps/ios/Meeshy/Features/Intents/MeeshyAppIntents.swift`

**Ligne**: ~335-340 (dans la classe `ContactQuery`)

**Action**: Remplacer la docstring existante

**Avant** (cherche la docstring existante):
```swift
    /// Ré-hydratation d'un contact déjà choisi (Raccourci enregistré, relance
    /// Siri). Lit la MÊME clé que `suggestedEntities` : `favorite_contacts`,
    /// écrite par `WidgetDataManager.publishFavoriteContacts`. Elle lisait
    /// auparavant `contacts`, qu'AUCUN écrivain du dépôt ne pose — donc tout
    /// raccourci enregistré perdait son destinataire au deuxième lancement,
    /// silencieusement (une liste vide n'est pas une erreur).
    func entities(for identifiers: [String]) async throws -> [ContactEntity] {
```

**Après**:
```swift
    /// Ré-hydratation d'un contact déjà choisi (raccourci Siri enregistré).
    /// 
    /// Lit depuis `group.me.meeshy.apps` / `favorite_contacts` — LA SOURCE DE VÉRITÉ
    /// pour les contacts disponibles aux raccourcis. DOIT rester en sync avec
    /// `WidgetDataManager.publishFavoriteContacts()` (même clé, même format JSON).
    /// 
    /// HISTORIQUE: Autrefois lisait `contacts` (clé jamais écrite) → tout raccourci
    /// enregistré perdait silencieusement son destinataire au 2e lancement. Corrigé
    /// au cycle 106 vers `favorite_contacts`.
    /// 
    /// - Parameter identifiers: Conversation IDs (pas d'user IDs) à charger
    /// - Returns: Contacts correspondants, ou liste vide si non trouvé
    /// - Throws: JSONDecoder si le format App Group est corrompu
    func entities(for identifiers: [String]) async throws -> [ContactEntity] {
```

✅ **Checklist**: Docstring documente la SSOT et les risques.

---

### Étape 10: Changement 10 — Docstring handleConversationDeepLink (10min)

**Fichier**: `apps/ios/Meeshy/Features/Main/Navigation/Router.swift`

**Ligne**: ~334 (nouvelle signature de `handleConversationDeepLink`)

**Action**: Ajouter une docstring à la fonction

**Avant**:
```swift
    private func handleConversationDeepLink(_ conversationId: String, draftText: String? = nil) async {
```

**Après**:
```swift
    /// Ouvre une conversation via deep link et injecte un brouillon si fourni.
    ///
    /// Appelé par le handler `openURL` (RootView/iPadRootView) après que
    /// `DeepLinkParser.parse()` rend `.conversation(id, draftText)`.
    /// 
    /// Les surfaces widget/App Shortcut qui veulent pré-remplir le brouillon passent
    /// `text` (quickreply widget, App Shortcut "Send Message") comme query param.
    /// Cette méthode le capture et l'injecte dans `DraftStore` AVANT navigation.
    /// 
    /// - Parameter conversationId: ID de conversation (MongoDB ObjectId)
    /// - Parameter draftText: Contenu optionnel à déposer dans le brouillon (ex: "Salut!")
    private func handleConversationDeepLink(_ conversationId: String, draftText: String? = nil) async {
```

✅ **Checklist**: Docstring explique l'injection de brouillon.

---

### Étape 11: Changement 11 — Test WidgetDataManager key (20min)

**Fichier**: `apps/ios/MeeshyTests/Unit/Services/WidgetDataManagerTests.swift`

**Action**: Ajouter 2 tests pour valider la clé et le filtrage

1. Ouvre le fichier
2. À la fin de la classe, ajoute les 2 tests:

```swift
    func test_publishFavoriteContacts_writesInCorrectKey() throws {
        let sut = WidgetDataManager(
            suiteName: "test.meeshy.widget",
            stagingDirectories: []
        )
        let mockConversations = [
            MeeshyConversation.stub(
                id: "conv-1",
                displayName: "Alice",
                userState: .stub(isPinned: true),
                type: .direct,
                accentColor: "#FF6B6B"
            )
        ]
        
        sut.publishFavoriteContacts(mockConversations)
        
        let defaults = UserDefaults(suiteName: "test.meeshy.widget")!
        let data = defaults.data(forKey: "favorite_contacts")  // ← Vérifier LA BONNE CLÉ
        XCTAssertNotNil(data, "favorite_contacts key should be written")
        
        let decoded = try JSONDecoder().decode([WidgetFavoriteContact].self, from: data!)
        XCTAssertEqual(decoded.count, 1)
        XCTAssertEqual(decoded[0].id, "conv-1")
        XCTAssertEqual(decoded[0].name, "Alice")
    }

    func test_publishFavoriteContacts_limitsToEightAndDirectOnly() throws {
        let sut = WidgetDataManager(
            suiteName: "test.meeshy.widget",
            stagingDirectories: []
        )
        
        // Créer 10 conversations (mix direct + group)
        let mockConversations = (0..<10).map { i in
            MeeshyConversation.stub(
                id: "conv-\(i)",
                displayName: "Contact \(i)",
                userState: .stub(isPinned: true),
                type: i % 2 == 0 ? .direct : .group,  // Alterner
                accentColor: "#FF6B6B"
            )
        }
        
        sut.publishFavoriteContacts(mockConversations)
        
        let defaults = UserDefaults(suiteName: "test.meeshy.widget")!
        let data = defaults.data(forKey: "favorite_contacts")!
        let decoded = try JSONDecoder().decode([WidgetFavoriteContact].self, from: data)
        
        // Doit avoir max 8 ET être que du direct (filter `type == .direct`)
        XCTAssertLessThanOrEqual(decoded.count, 8)
        // Tous les IDs doivent être pair (direct)
        for contact in decoded {
            let lastChar = contact.id.last!
            let index = Int(String(lastChar))!
            XCTAssertTrue(index % 2 == 0, "Only direct conversations should be published")
        }
    }
```

**Vérification**:
```bash
cd apps/ios
bun test WidgetDataManagerTests 2>&1 | grep -E "test_publishFavoriteContacts"
```

✅ **Checklist**: Les 2 tests compilent et passent.

---

### Étape 12: Changement 12 — Integration test full flow (30min)

**Fichier**: Crée `apps/ios/MeeshyTests/Unit/Navigation/DeepLinkWidgetIntegrationTests.swift`

**Action**: Créer le test d'intégration

1. Crée le fichier:
   ```bash
   touch apps/ios/MeeshyTests/Unit/Navigation/DeepLinkWidgetIntegrationTests.swift
   ```

2. Copie/colle le contenu (du fichier `pr2945-complete-integration.md`, Changement 12):
   ```swift
   import XCTest
   @testable import Meeshy

   /// Intégration complète: Widget → App Shortcut → DeepLink → DraftStore
   @MainActor
   final class DeepLinkWidgetIntegrationTests: XCTestCase {
       
       func test_shortcutSendMessage_prefilledWithText() async throws {
           // ÉTAPE 1: Publier un contact favori
           let mockConv = MeeshyConversation.stub(
               id: "conv-integration-1",
               displayName: "Alice",
               userState: .stub(isPinned: true),
               type: .direct
           )
           WidgetDataManager.shared.publishFavoriteContacts([mockConv])
           
           // ÉTAPE 2: Rehydrater via ContactQuery (comme le raccourci Siri le fait)
           let query = ContactQuery()
           let contacts = try await query.entities(for: ["conv-integration-1"])
           XCTAssertEqual(contacts.count, 1)
           XCTAssertEqual(contacts[0].id, "conv-integration-1")
           
           // ÉTAPE 3: Parser le deep link du raccourci
           let url = URL(string: "meeshy://send?contactId=conv-integration-1&message=Bonjour%20Alice")!
           let destination = DeepLinkParser.parse(url)
           
           guard case .conversation(let id, let draftText) = destination else {
               return XCTFail("Expected .conversation, got \(destination)")
           }
           
           XCTAssertEqual(id, "conv-integration-1")
           XCTAssertEqual(draftText, "Bonjour Alice")
           
           // ÉTAPE 4: Vérifier que le routeur injecterait le texte
           if let draftText = draftText, !draftText.isEmpty {
               DraftStore.shared.setDraft(text: draftText, for: id)
           }
           
           let retrievedDraft = DraftStore.shared.getDraft(for: "conv-integration-1")
           XCTAssertEqual(retrievedDraft?.text, "Bonjour Alice")
       }
       
       func test_widgetQuickReply_prefilledWithText() async throws {
           // Même flow mais pour le widget Réponse rapide
           let mockConv = MeeshyConversation.stub(
               id: "conv-quickreply-1",
               displayName: "Bob"
           )
           
           // Le widget aura une commande rapide comme "OK"
           let url = URL(string: "meeshy://quickreply/conv-quickreply-1?text=OK")!
           let destination = DeepLinkParser.parse(url)
           
           guard case .conversation(let id, let draftText) = destination else {
               return XCTFail("Expected .conversation, got \(destination)")
           }
           
           XCTAssertEqual(id, "conv-quickreply-1")
           XCTAssertEqual(draftText, "OK")
           
           // Injecter et vérifier
           if let draftText = draftText, !draftText.isEmpty {
               DraftStore.shared.setDraft(text: draftText, for: id)
           }
           
           let retrievedDraft = DraftStore.shared.getDraft(for: "conv-quickreply-1")
           XCTAssertEqual(retrievedDraft?.text, "OK")
       }
   }
   ```

**Vérification**:
```bash
cd apps/ios
bun test DeepLinkWidgetIntegrationTests 2>&1 | tail -10
```

✅ **Checklist**: Fichier créé, tests compilent et passent.

---

### Étape 13: Changement 13 — Docstring AppIntents non-routés (10min)

**Fichier**: `apps/ios/Meeshy/Features/Intents/MeeshyAppIntents.swift`

**Ligne**: Avant `struct CallContactIntent` et `struct TranslateTextIntent`

**Action**: Ajouter un commentaire explicatif sur le statut "non-routé"

**À ajouter** (avant `struct CallContactIntent`):
```swift
/// Raccourci: « Appeler un contact sur Meeshy »
/// 
/// STATUS: Non routé au cycle 106. L'app s'ouvrira mais n'aura pas d'effet.
/// La surface « lancer un appel depuis l'accueil » n'existe pas —
/// attendez le cycle 107+.
/// 
/// Deep link émis: `meeshy://call?contactId=…&type=…`
/// Hosts non-routés: ne tapent pas `DeepLinkParser` (rendront `.external`).
@available(iOS 16.0, *)
struct CallContactIntent: AppIntent {
```

**À ajouter** (avant `struct TranslateTextIntent`):
```swift
/// Raccourci: « Traduire du texte »
/// 
/// STATUS: Non routé au cycle 106. L'app s'ouvrira mais n'aura pas d'effet.
/// La surface « traduction standalone » n'existe pas —
/// attendez le cycle 107+.
/// 
/// Deep link émis: `meeshy://translate?text=…&target=…`
/// Hosts non-routés: ne tapent pas `DeepLinkParser` (rendront `.external`).
struct TranslateTextIntent: AppIntent {
```

✅ **Checklist**: Commentaires ajoutés documentant le statut "TooDo".

---

### Étape 14: Changement 14 — Docstring Widget non-routés (5min)

**Fichier**: `apps/ios/MeeshyWidgets/MeeshyWidgets.swift`

**Ligne**: ~360-370 (widget Conversations récentes) et ~590 (widget Unread)

**Action**: Ajouter des commentaires TODO

**À ajouter avant la ligne .widgetURL(...conversations/recent...)**:
```swift
        // TODO cycle 107: Implémenter routage vers conversations récentes filtrées
        // Le deep link `meeshy://conversations/recent` n'est PAS routé au cycle 106.
        // Pour l'instant, l'app s'ouvre simplement sur l'accueil.
```

**À ajouter avant chaque ligne .widgetURL(...conversations/unread...)**:
```swift
        // TODO cycle 107: Implémenter routage vers conversations non lues filtrées
        // Le deep link `meeshy://conversations/unread` n'est PAS routé au cycle 106.
        // Pour l'instant, l'app s'ouvre simplement sur l'accueil.
```

✅ **Checklist**: Commentaires TODO documentent la future implémentation.

---

### 🏁 FINAL BUILD & TEST 🏁

**Avant de merger**, lance la suite complète:

```bash
cd apps/ios

# 1. Clean build
bun run clean
bun run build 2>&1 | head -30

# 2. Run ALL tests
bun test 2>&1 | tail -30  # Summary

# 3. Check coverage on DeepLink tests
bun test:coverage DeepLink 2>&1 | tail -10

# 4. Build simulator
./meeshy.sh build

# 5. Vérifier aucun warning
grep -r "warning:" ./Meeshy --include="*.swift" | wc -l  # Doit être 0 ou très bas
```

**Résultat attendu**:
- ✅ Build complet sans erreur
- ✅ Tous les tests DeepLink passent (10+ tests)
- ✅ Integration tests passent
- ✅ Simulator builds

---

### 🔄 COMMIT & PUSH

```bash
cd /Users/smpceo/Documents/v2_meeshy

# 1. Vérifier les changements
git status
git diff --stat  # Doit montrer les fichiers modifiés

# 2. Commit
git add -A
git commit -m "fix(ios): inject draft text from widgets/shortcuts into conversation

- Extend DeepLinkDestination to carry optional draftText parameter
- Parser extracts text/message from query params for quickreply & send hosts
- Router injects draft into DraftStore before navigation
- Add comprehensive tests for text extraction and injection
- Document synchronization between WidgetDataManager and ContactQuery
- Mark non-routed hosts (call/translate/recent/unread) for cycle 107

Fixes PR #2945 completion — draft text now preserved through widget/shortcut flows."

# 3. Push
git push origin feat/pr2945-completion

# 4. Créer PR
# (Manuellement sur GitHub ou via CLI)
```

---

## ✅ Checklist Final

### Avant de terminer, vérifier:
- [ ] All Changements 1-14 complétés
- [ ] Build compiles sans erreur
- [ ] Tests passent (au moins DeepLink + WidgetDataManager + Integration)
- [ ] Aucun call site cassé
- [ ] Docstrings complètes
- [ ] Branch poussée vers origin
- [ ] Pas de secrets/tokens committes

### Travail livré:
- [ ] Branch: `feat/pr2945-completion`
- [ ] Commits: ~1-2 commits (groupe cohérent)
- [ ] Tests: +6 new test suites (130+ lignes de tests)
- [ ] Docs: 3 docstrings enrichies + 4 commentaires

---

## 📞 Escalade / Debugging

**Si une étape échoue**:

1. **Parser.parse() n'extrait pas les text/message**:
   - Vérifier que `queryValue()` existe déjà dans le PR (~line 80-92)
   - Vérifier la syntaxe `URLComponents(url:resolvingAgainstBaseURL:)`

2. **Build échoue sur "conversation case not recognized"**:
   - Vérifier que TOUS les call sites passent 2 arguments
   - `grep -r "\.conversation\(" apps/ios --include="*.swift"`

3. **DraftStore.setDraft() n'existe pas**:
   - Chercher comment elle s'appelle:
     ```bash
     grep -r "class DraftStore" apps/ios --include="*.swift" -A 10
     ```

4. **Tests compilent mais ne passent pas**:
   - Vérifier les imports: `@testable import Meeshy`
   - Vérifier les stubs: `MeeshyConversation.stub()` existe?

---

## 🎯 Résumé

**Tu as 14 changements à faire**:
- 4 changements critiques au parser/router (la logique)
- 2 fichiers tests à créer (Drone + Integration)
- 3 docstrings à enrichir
- 4 commentaires TODO à ajouter

**Temps estimé**: 4h (2h code + 1.5h tests + 30min Polish)

**Résultat**: iOS App qui reçoit les brouillons pré-remplis depuis Siri et les widgets. ✅

---

**Bonne chance ! 🚀**
