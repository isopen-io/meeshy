# Extension de partage — câblage produit (lot 1 : texte + URL)

> Date : 2026-07-29
> Statut : validé, prêt pour plan d'implémentation
> Cible : `apps/ios/MeeshyShareExtension`, `apps/ios/Meeshy`, `packages/MeeshySDK` (lecture seule)

## 1. Problème

`MeeshyShareExtension` est embarquée dans l'app depuis 2026-07-28 (build 1257 en revue
Apple). Elle passe la validation et s'affiche dans la feuille de partage système, mais
**ne fait rien d'utile**. Trois ruptures indépendantes, toutes vérifiées :

1. **Contacts fabriqués** — `ShareContentView.loadRecentContacts()` lit la clé App Group
   `recent_contacts`, que *personne n'écrit* dans le dépôt (`grep` : 1 référence, la
   lecture). Le `guard else` retombe donc **toujours** sur `ContactPreview.sampleContacts`
   → « John Doe / Jane Smith / Bob Johnson ».
2. **Écriture morte** — `saveSharedContent` encode un `SharedContentData` sous
   `pending_shared_content`, que *personne ne lit* (`grep` : 1 référence, l'écriture).
3. **Deep link inerte** — `sendToContact` ouvre `meeshy://share?contactId=<id>`, mais
   `DeepLinkParser.parseShareQuery` ne comprend que `text=` / `url=`. `Router.handleShareDeepLink`
   tombe donc sur la branche « no content » : `popToRoot()` et un log d'erreur.

Un partage entrant est intégralement perdu.

### 1.1 Cause racine

Le repli `ContactPreview.sampleContacts`. Tant qu'une lecture cassée produit une liste
plausible au lieu d'une liste vide, la rupture reste **invisible** — c'est ce qui lui a
permis de survivre aux itérations d'audit 220i, 221i et 222i. Le correctif structurel
n'est pas « brancher la bonne clé », c'est **supprimer le repli fabriqué**, pour qu'une
future clé mal branchée se manifeste immédiatement par un écran vide.

## 2. Décisions d'architecture

| # | Décision | Justification |
|---|---|---|
| D1 | **Extension autonome** : elle liste les vraies conversations et poste elle-même | Une seule surface ; l'app ne s'ouvre jamais. Arbitré contre le « collecteur mince » qui aurait réutilisé `SharePickerView`. |
| D2 | **Lot 1 = texte + URL uniquement** | Une image/vidéo exigerait de rejouer TUS (`TusUploadManager` + `TusUploadCheckpointStore` GRDB) dans un process plafonné à ~120 Mo et tuable à tout instant. |
| D3 | **`Info.plist` resserré en conséquence** | Sans ça, Meeshy apparaît dans la feuille de partage de Photos **et échoue** — pire que de ne pas y figurer. |
| D4 | **Extension auto-contenue, zéro dépendance SDK** | Lier MeeshySDK embarquerait GRDB + Socket.IO sous le plafond mémoire. Le client REST minimal est calqué sur `NSEDataSync`, précédent éprouvé en production. |
| D5 | **Échec d'envoi → relais durable vers l'app** | L'extension écrit un fichier App Group ; l'app le verse dans l'`OfflineQueue` GRDB au lancement. Récupère la garantie hors-ligne sans lier GRDB. Motif déjà en place : `NSEPendingMessageConsumer`. |
| D6 | **Suppression de `sampleContacts`** | Cf. §1.1. Non négociable : c'est le correctif de la cause racine. |
| D7 | **`clientMessageId` généré par l'extension et réutilisé au rejeu** | Le contrat Phase 4 le rend obligatoire ; le gateway dédoublonne dessus via index unique. Un POST abouti dont la réponse se perd doit se rejouer **sans** créer de doublon. |

## 3. Flux cible

```
Safari / Notes / n'importe quelle app → « Partager » → Meeshy
  │
  ├─ extraction du texte / de l'URL           (code existant, branches média retirées)
  │
  ├─ résolution de session
  │    meeshy_active_user_id  (App Group UserDefaults)
  │      → Keychain  service=me.meeshy.app  account=meeshy_token_<userId>
  │        accessGroup = <TEAMID>.me.meeshy.app
  │    absent → écran « Connectez-vous à Meeshy », AUCUNE liste affichée
  │
  ├─ chargement de la liste
  │    recent_conversations  (nom d'affichage résolu, accentColor, ordre épinglé+récence)
  │    enrichie par conversation_snapshots  (customName local prioritaire, unreadCount)
  │    vide → « Ouvrez Meeshy une fois pour retrouver vos conversations ici »
  │
  └─ sélection d'une conversation, puis « Envoyer »
       POST {base}/api/v1/conversations/<id>/messages
         Authorization: Bearer <token>
         { "clientMessageId": "cid_<uuid v4 lowercase>", "content": "<texte ou URL>" }
       │
       ├─ 2xx   → haptique succès, « Envoyé », completeRequest
       └─ échec → écrit share_pending_sends/<clientMessageId>.json
                  « Sera envoyé à la reconnexion », completeRequest
                    │
                    └─ prochain lancement de l'app
                       SharePendingSendConsumer → OfflineQueue (GRDB)
                       → rejoué par l'outbox existant, dédoublonné par clientMessageId
```

## 4. Contrats App Group

App Group : `group.me.meeshy.apps`.

| Clé / chemin | Écrite par | Lue par | État |
|---|---|---|---|
| `meeshy_active_user_id` | `AuthManager` (SDK) | NSE, **extension** | existe |
| Keychain `meeshy_token_<userId>` | `AuthManager` (SDK) | NSE, **extension** | existe |
| `recent_conversations` | `WidgetDataManager` | widgets, **extension** | existe (plafond 10 → 50) |
| `conversation_snapshots` | `WidgetDataManager` | NSE, **extension** | existe |
| `meeshy_api_base_url` | **personne — à créer** | NSE, **extension** | **manquante** |
| `share_pending_sends/*.json` | **extension** | **app** | **à créer** |

### 4.1 Pourquoi `recent_conversations` et pas `conversation_snapshots` pour la liste

`ConversationSnapshotPayload.title` porte `conv.title` **brut**, qui est `nil` pour une
conversation directe (le nom affiché s'y résout depuis le participant d'en face).
`WidgetConversation.contactName` porte `conv.displayName`, déjà résolu. La liste doit donc
venir de `recent_conversations` ; `conversation_snapshots` ne sert qu'à enrichir par `id`
(renommage local `customName`, `unreadCount`).

Contrepartie : le plafond de 10 est trop court. Il passe à 50 dans `WidgetDataManager`.
Les widgets tranchent au rendu (`.prefix(2)`, `.prefix(5)` — `MeeshyWidgets.swift:357,435`)
et ne présument jamais de la longueur du tableau : le changement leur est transparent.

### 4.2 Avatars

Ni `recent_conversations` (`contactAvatar` contient un **nom de symbole SF**, pas une URL)
ni `conversation_snapshots` (pas de champ avatar) ne portent de photo. La liste affiche
donc **initiales sur pastille `accentColor`** — la logique `ContactPreview.initials`
existante est conservée. Aucun téléchargement d'image dans l'extension.

### 4.3 Bug dormant corrigé au passage

`NSEDataSync.resolveApiBaseURL()` documente que « l'app principale écrit
`meeshy_api_base_url` ». **Aucun code de l'app ne l'écrit** : la NSE retombe systématiquement
sur `https://gate.meeshy.me`. Bénin pour elle (le repli est la production), mais en Debug
l'extension de partage taperait la production au lieu de `localhost:3000`. L'app écrira
donc cette clé au lancement, ce qui corrige les deux extensions d'un coup.

Allowlist reprise telle quelle de `NSEDataSync` : `https://gate.meeshy.me`,
`https://gate.staging.meeshy.me`, `http://localhost:3000`. Toute valeur hors allowlist →
repli production.

### 4.4 Format `share_pending_sends/<clientMessageId>.json`

```json
{
  "clientMessageId": "cid_5f2c1a90-...",
  "conversationId": "6512ab...",
  "content": "https://exemple.fr/article",
  "createdAt": "2026-07-29T14:03:11.482Z"
}
```

Le nom de fichier **est** le `clientMessageId` : deux écritures du même envoi ne peuvent
pas produire deux fichiers, et le dédoublonnage serveur reste garanti au rejeu.

## 5. Suppressions

| Élément | Fichier | Motif |
|---|---|---|
| `ContactPreview.sampleContacts` | `ShareViewController.swift` | Cause racine (§1.1) |
| `loadRecentContacts()` + clé `recent_contacts` | `ShareViewController.swift` | Clé fantôme |
| `saveSharedContent` + `SharedContentData` + `SharedItemData` + clé `pending_shared_content` | `ShareViewController.swift` | Écriture morte, remplacée par §4.4 |
| Ouverture de `meeshy://share?contactId=` (parcours de la responder chain) | `ShareViewController.swift` | L'extension n'ouvre plus l'app |
| `extractImage`, `extractVideo`, `downsampledImage` (×3), `saveImageToSharedContainer` | `ShareViewController.swift` | Hors lot 1 ; récupérables en historique git pour le lot 2 |
| Cas `.image` / `.video` / `.file` / `.location` de `SharedItem.SharedItemType` | `ShareViewController.swift` | L'enum réduit à `.text` / `.url` fait **tenir la portée par le compilateur** |
| `NSExtensionActivationSupportsImageWithMaxCount`, `…MovieWithMaxCount`, `…AttachmentsWithMinCount`, `…AttachmentsWithMaxCount` | `Info.plist` | D3 — ne plus s'annoncer pour ce qu'on ne sait pas traiter |

Conservés dans l'`Info.plist` : `NSExtensionActivationSupportsText`,
`NSExtensionActivationSupportsWebURLWithMaxCount = 1`.

**Le deep link `meeshy://share?text=…&url=…` reste intact.** Il n'est pas alimenté par
l'extension mais reste une surface publique valide (`DeepLinkParser`, `Router.pendingShareContent`,
`SharePickerView`) utilisée par les Raccourcis/App Intents. Aucune modification.

## 6. Composants nouveaux

### 6.1 Dans l'extension

Logique pure, I/O injecté en paramètre, **compilés à la fois dans la cible extension et
dans `MeeshyTests`** — motif éprouvé de `NSEDecryptor` (« compiled into BOTH the NSE target
and MeeshyTests … so the lookup policy stays unit-testable; the keychain read is injected
as a closure »).

| Fichier | Responsabilité | Interface |
|---|---|---|
| `ShareSession.swift` | Résout `userId`, `token`, `apiBaseURL` | `static func resolve(defaults:readKeychain:) -> ShareSession?` |
| `ShareConversationStore.swift` | Décode et fusionne les deux clés → `[ShareTarget]` | `static func targets(from:snapshots:) -> [ShareTarget]` |
| `ShareSender.swift` | Construit la requête, décide succès vs. persistance | `static func request(for:session:) -> URLRequest`, `static func outcome(for:) -> ShareOutcome` |

`ShareTarget` : `{ id, displayName, initials, accentColorHex, unreadCount }` — value type,
`Equatable`, aucune dépendance UIKit.

`ShareOutcome` : `.sent` / `.deferred` — la décision est une fonction pure de
`(HTTPURLResponse?, Error?)`, donc testable sans réseau.

La résolution du groupe Keychain partagé (`sharedKeychainAccessGroup`, découverte à
l'exécution par item sonde) est **recopiée** depuis `NSEDataSync` plutôt que factorisée :
`NSEDecryptor` a déjà fait ce choix explicitement (« kept self-contained: `NSEDataSync` is
not compiled into the test target, and its helper is private »). Trois copies existeront ;
c'est assumé et documenté ici.

### 6.2 Dans l'app

| Fichier | Responsabilité |
|---|---|
| `Features/Main/Services/SharePendingSendConsumer.swift` | Lit `share_pending_sends/`, verse dans `OfflineQueue`, **ne supprime le fichier qu'après** confirmation d'enfilement |

Invariant repris de `NSEPendingMessageConsumer` : la suppression suit le commit, jamais
l'inverse — un échec transitoire laisse le fichier pour la tentative suivante.

Point d'appel : le même endroit que `NSEPendingMessageConsumer.consumeAll()` au lancement
et au retour en avant-plan.

### 6.3 Modifications

| Fichier | Changement |
|---|---|
| `WidgetDataManager.swift` | `.prefix(10)` → `.prefix(50)` sur `recent_conversations` |
| App (site de configuration `MeeshyConfig`) | Écriture de `meeshy_api_base_url` dans l'App Group |
| `MeeshyShareExtension.entitlements` | Ajout de `keychain-access-groups` = `$(AppIdentifierPrefix)me.meeshy.app` |

## 7. États de l'interface

| État | Déclencheur | Affichage |
|---|---|---|
| Non connecté | `meeshy_active_user_id` ou token absent | Message « Connectez-vous à Meeshy pour partager » + bouton Fermer. **Aucune liste.** |
| Aucune conversation | `recent_conversations` absente ou vide | « Ouvrez Meeshy une fois pour retrouver vos conversations ici » |
| Liste | ≥ 1 conversation | Aperçu du contenu partagé + liste (initiales, nom, pastille `accentColor`) |
| Envoi en cours | POST en vol | Liste désactivée + indicateur dans le bouton « Envoyer » |
| Envoyé | 2xx | « Envoyé », puis fermeture |
| Différé | échec | « Sera envoyé à la reconnexion », puis fermeture |

Le champ de recherche est **retiré** : sur 50 entrées au plus, il n'apporte rien et
c'était un ornement de maquette.

**Confirmation en deux temps** (sélection, puis « Envoyer ») plutôt qu'envoi au premier
tap : envoyer un message à un tiers est irréversible et sortant, et un tap malencontreux
dans une feuille système coûte cher. Cela réutilise en prime la clé `share.send`, déjà
traduite dans les 7 langues.

**La session est portée par le cas `.ready`** de `ShareScreenState`, et non rangée à côté
de l'état : il devient impossible d'afficher une liste sans jeton pour l'envoyer. Sans ça,
le chemin d'envoi devait se garder contre une session absente et renvoyer « différé » sans
avoir rien persisté — un état inatteignable aujourd'hui, mais qui aurait menti à
l'utilisateur le jour où il le serait devenu.

Toutes les chaînes passent par `Localizable.xcstrings` de l'extension (7 langues déjà
déclarées dans `CFBundleLocalizations`).

## 8. Signature et livraison

**Aucune action au portail n'est nécessaire — vérifié.** L'hypothèse initiale (activer la
capability Keychain Sharing sur l'App ID `me.meeshy.app.share-extension`) était fausse :

```
xcodebuild build -configuration Release -destination 'generic/platform=iOS'   # SANS -allowProvisioningUpdates
→ BUILD SUCCEEDED, 0 erreur de signature
→ .xcent produit : keychain-access-groups = ["D72UK7R5RE.me.meeshy.app"]
```

Le profil Xcode-managed **et** le profil `match AppStore me.meeshy.app.share-extension`
accordent tous deux `keychain-access-groups: ["D72UK7R5RE.*", "com.apple.token"]`, qui
couvre le groupe demandé. L'absence d'`application-groups` dans les profils match n'est
pas un signal : les **quatre** profils match en sont dépourvus, y compris ceux de l'app et
de la NSE, qui utilisent des App Groups en production.

Commande de vérification (à relancer après tout changement d'entitlements) :

```bash
find apps/ios/Build -name "MeeshyShareExtension.appex.xcent" -newermt "-10 minutes" \
  -exec plutil -p {} \;
```

⚠️ `apps/ios/Build/` contient deux arbres d'intermédiaires (`Build/Meeshy.build/` est un
résidu d'anciens builds, `Build/Intermediates.noindex/Meeshy.build/` est l'actif). Filtrer
sur la fraîcheur, jamais sur le chemin — sans quoi on lit un `.xcent` de la veille et on
conclut à un entitlement élagué qui ne l'est pas.

**Non prouvé** : l'archive + export distribution complète (lane fastlane `release`). Les
profils l'autorisent, mais seul un export réel le confirmerait.

**Séquencement arbitré** : le build 1257 (extension inerte) est **retiré et remplacé** par
un 1258 câblé, pour ne jamais exposer publiquement une extension qui ne fait rien. La file
d'attente Apple repart de zéro ; c'est assumé. Le retrait de 1257 n'intervient qu'une fois
le câblage terminé **et vérifié**.

## 9. Plan de test (TDD — RED d'abord)

| Suite | Cas |
|---|---|
| `ShareSessionTests` | token présent → session ; `meeshy_active_user_id` absent → `nil` ; token absent → `nil` ; `meeshy_api_base_url` valide → respectée ; hors allowlist → repli production ; clé absente → repli production |
| `ShareConversationStoreTests` | fusion des deux clés ; `customName` prioritaire sur `contactName` ; conversation présente dans les snapshots mais pas dans les récentes → absente de la liste ; JSON corrompu → liste vide, pas de crash ; clé absente → liste vide |
| `ShareSenderTests` | forme du payload (`clientMessageId` + `content`, rien d'autre) ; en-tête `Authorization` ; 2xx → `.sent` ; 401 → `.deferred` ; 5xx → `.deferred` ; erreur réseau → `.deferred` ; `clientMessageId` au format `cid_<uuid v4 lowercase>` |
| `SharePendingSendConsumerTests` | fichier valide → enfilé dans `OfflineQueue` puis supprimé ; échec d'enfilement → fichier **conservé** ; JSON corrompu → supprimé et journalisé ; répertoire absent → no-op |
| Garde de source | aucune occurrence de `sampleContacts`, `recent_contacts` ni `pending_shared_content` dans `MeeshyShareExtension/` |

La garde de source s'ancre sur le **comportement compilé** et retire les commentaires avant
de chercher les motifs — deux pièges déjà rencontrés sur ce dépôt (un commentaire qui cite
le motif banni produit un faux positif).

Vérification manuelle finale, sur simulateur puis appareil : partager une URL depuis Safari
et un texte depuis Notes, connecté puis déconnecté, en ligne puis en mode avion (le message
doit apparaître dans la conversation après réouverture de l'app).

## 10. Limites connues et assumées

- **Pas d'épinglage TLS dans l'extension.** `URLSession.shared` n'y passe pas par
  `CertificatePinningDelegate`, contrairement à `APIClient` et `MessageSocketManager`.
  C'est la pratique déjà en vigueur dans `NSEDataSync`, qui poste au gateway sans
  épinglage non plus. À traiter pour les deux extensions ensemble, jamais pour une seule.
- **Utilisateurs anonymes non couverts.** L'extension résout un JWT
  (`meeshy_token_<userId>`) ; une session anonyme s'appuie sur `X-Session-Token` et n'a pas
  d'entrée trousseau. Un utilisateur anonyme voit donc « Connectez-vous à Meeshy » — état
  honnête, mais qui n'est pas la vérité complète de son statut.
- **Aucune vérification manuelle sur appareil réel n'a encore eu lieu.** Les builds
  simulateur n'appliquent pas l'entitlement trousseau (`.xcent` vide, la vérité est dans
  `*-Simulated.xcent`), donc la lecture effective du JWT partagé ne peut être constatée que
  sur appareil.

## 11. Hors périmètre

- Images, vidéos, fichiers, localisation (**lot 2** : TUS dans l'extension)
- Recherche dans la liste des conversations
- Avatars photo dans l'extension
- Toute évolution de `SharePickerView` ou du deep link `meeshy://share?text=`
- Multi-compte (`SessionSnapshotStore` V2)
