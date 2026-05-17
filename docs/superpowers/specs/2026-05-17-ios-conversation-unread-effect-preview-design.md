# iOS — Mise en valeur des conversations non lues + aperçu d'effet du dernier message

Date : 2026-05-17
Statut : Design validé

## Contexte

Dans la liste des conversations iOS (`ThemedConversationRow`), trois écarts UX sont identifiés :

1. Le titre d'une conversation avec des messages non lus n'est pas distingué visuellement — il reste `.semibold` comme une conversation lue.
2. Le badge de compteur de messages non lus utilise un dégradé de la couleur d'accent de la conversation. Le non-lu est une notification : il devrait porter une couleur sémantique d'alerte (rouge), thématisée light/dark.
3. L'aperçu du dernier message peut exposer du contenu qui devrait rester masqué : un message flouté (`blur`) affiche actuellement son texte sous un flou, un message vue-unique affiche « Voir une fois ». L'aperçu doit **décrire l'effet** plutôt que de laisser deviner le contenu.

Le même problème d'exposition existe dans les résultats de recherche (`GlobalSearchView`), qui affichent le texte brut du dernier message sans aucun traitement d'effet.

Les effets d'apparence (zoom, glow, pulse, sparkle…) ne sont pas concernés : ils ne masquent pas le contenu, et le résumé de conversation (`MeeshyConversation`) ne les transporte pas — un dernier message « zoom » s'affiche déjà normalement.

## Objectifs

- Titre en gras pour toute conversation ayant `unreadCount > 0`.
- Badge non-lus sur fond rouge plein, thématisé : rouge vif en light, rouge foncé en dark, chiffre blanc.
- Aperçu du dernier message : décrire l'effet (`1 message caché`, `1 message vue unique`, `Message expiré`) au lieu d'exposer le contenu, dans la liste **et** dans les résultats de recherche.
- Centraliser la décision d'affichage dans une fonction pure testable.

## Hors périmètre

- Le long-press preview d'une conversation (`ConversationPreviewView`) : il rend de vraies bulles `ThemedMessageBubble` qui gèrent déjà blur (`BubbleBlurRevealController`) et vue-unique (`BubbleBurnedView`). Aucun changement.
- Le titre en gras et le badge rouge ne s'appliquent **pas** aux résultats de recherche (non demandé) — seul le masquage d'effet (point 3) y est étendu.
- Aucun changement backend ni de modèle de données : tous les champs nécessaires existent déjà.
- Effets d'apparence/persistants (zoom, glow, pulse, sparkle, shake, explode…).

## Design

### Point 1 — Titre en gras pour les non-lus

Fichier : `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift` (~ligne 151).

Le poids du titre devient conditionnel :

```swift
.font(.system(size: 15, weight: conversation.unreadCount > 0 ? .bold : .semibold))
```

`renderFingerprint` inclut déjà `unreadCount` → le re-render se déclenche correctement quand le compteur change. Aucune autre modification.

### Point 2 — Badge non-lus rouge thématisé

#### MeeshyColors

Fichier : `packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift`.

- Ajout d'une constante : `public static let errorDark = Color(hex: "991B1B")` (à côté de `error = #F87171`).
- Ajout d'un helper thématisé :

```swift
public static func unreadBadgeBackground(isDark: Bool) -> Color {
    isDark ? errorDark : error
}
```

#### unreadBadge

Fichier : `ThemedConversationRow.swift` (`unreadBadge`, ~lignes 338-355).

Le `Circle` n'utilise plus le `LinearGradient` `[accent, accentSecondary]` mais un fond rouge plein `MeeshyColors.unreadBadgeBackground(isDark: isDark)`. L'ombre passe d'`accent.opacity(0.25)` à la couleur rouge `opacity(0.25)`. Le chiffre reste blanc, taille 11pt bold, plafonné à 99.

La propriété `isDark` existe déjà dans la vue (utilisée par `textPrimary`, `textSecondary`, etc.).

> Note de cohérence : le badge passe d'une couleur de conversation (accent) à une couleur sémantique (rouge), ce qui est aligné avec la règle du CLAUDE.md — « Semantic colors (error, success) remain static via MeeshyColors ». Le non-lu est un état d'alerte, pas un élément de contexte de conversation.

### Point 3 — Décision d'affichage centralisée

Nouveau fichier : `packages/MeeshySDK/Sources/MeeshySDK/Models/LastMessageSummaryKind.swift`.

Type pur, `Sendable`, sans dépendance UI, dans le package MeeshySDK (pas sous `defaultIsolation(MainActor)`) :

```swift
public enum LastMessageSummaryKind: Sendable, Equatable {
    case standard          // contenu affichable normalement
    case hidden            // flouté → « 1 message caché »
    case viewOnce          // vue-unique → « 1 message vue unique »
    case expired           // éphémère expiré → « Message expiré »
    case ephemeralActive   // éphémère encore lisible → contenu + icône minuterie
}

public func lastMessageSummaryKind(
    for conversation: MeeshyConversation,
    now: Date = Date()
) -> LastMessageSummaryKind
```

Logique de résolution (précédence identique à l'enum privé `LastMessageEffect` actuel) :

1. `lastMessageExpiresAt != nil && lastMessageExpiresAt <= now` → `.expired`
2. `lastMessageIsBlurred` → `.hidden`
3. `lastMessageIsViewOnce` → `.viewOnce`
4. `lastMessageExpiresAt != nil && lastMessageExpiresAt > now` → `.ephemeralActive`
5. sinon → `.standard`

Le paramètre `now` est injectable pour rendre les cas d'expiration déterministes en test.

L'enum privé `LastMessageEffect` et la propriété calculée `lastMessageEffect` de `ThemedConversationRow` (~lignes 109-134) sont supprimés et remplacés par un appel à ce helper (−~25 lignes dans la vue).

### Point 4 — Rendu sur les deux écrans

La **décision** (`lastMessageSummaryKind`) est unique et partagée. Le **rendu** reste local à chaque écran car les systèmes de couleurs/thème diffèrent (`ThemedConversationRow` dérive ses couleurs d'`isDark` ; `GlobalSearchView` utilise un objet `theme`).

| Kind | Liste (`ThemedConversationRow`) | Recherche (`GlobalSearchView`) |
|---|---|---|
| `.hidden` | icône `eye.slash` + « 1 message caché » (italique) | idem |
| `.viewOnce` | icône `flame` + « 1 message vue unique » (italique) | idem |
| `.expired` | « Message expiré » + icône `timer.badge.xmark` (existant) | « Message expiré » + icône `timer.badge.xmark` (nouveau ici) |
| `.ephemeralActive` | contenu + icône minuterie (existant) | texte brut `result.lastMessagePreview` |
| `.standard` | contenu normal (existant) | texte brut `result.lastMessagePreview` (existant) |

#### Liste — `ThemedConversationRow.swift`

`lastMessagePreviewView` (~lignes 404-497) bascule sur `LastMessageSummaryKind` :

- `.hidden` : `senderLabel` + icône `eye.slash` + `Text("1 message caché")` en italique, couleur `textSecondary`. Le texte flouté actuel (`.blur(radius: 4)` sur `lastMessagePreview`) est **supprimé**.
- `.viewOnce` : `senderLabel` + icône `flame` + `Text("1 message vue unique")` en italique, couleur `accent`. Remplace « Voir une fois ».
- `.expired`, `.ephemeralActive`, `.standard` : rendu inchangé.

Le `senderLabel` reste affiché devant les libellés `.hidden` / `.viewOnce` (cohérent avec le rendu `.viewOnce` actuel — utile en conversation de groupe).

#### Recherche — `GlobalSearchView.swift`

Dans `conversationResultRow` (~lignes 493-498), le rendu du dernier message calcule `lastMessageSummaryKind(for: result.conversation)` (`GlobalSearchConversationResult` embarque déjà un `MeeshyConversation` complet dans son champ `conversation`) :

- `.hidden` / `.viewOnce` / `.expired` : icône + libellé italique (mêmes textes que la liste), couleur `theme.textSecondary`.
- `.ephemeralActive` / `.standard` : `Text(result.lastMessagePreview)` brut — comportement actuel préservé.

### Localisation

Clés partagées par les deux écrans (le catalogue de chaînes de l'app résout chaque clé une seule fois) :

| Clé | `defaultValue` (FR) |
|---|---|
| `conversation.summary.hidden` | `1 message caché` |
| `conversation.summary.view_once` | `1 message vue unique` |

`message.expired` (« Message expiré ») existe déjà et est réutilisée. Les chaînes sont déclarées via `String(localized:defaultValue:)` ; Xcode les extrait automatiquement dans le catalogue, aucune édition manuelle de `.xcstrings`.

## Stratégie de test (TDD)

Nouveau fichier de test dans la cible `MeeshySDKTests`, exécuté via le scheme `MeeshySDK-Package`, en **Swift Testing** (test de modèle pur, conformément au CLAUDE.md).

Cas couverts pour `lastMessageSummaryKind(for:now:)` — chaque conversation construite via une factory de test :

- conversation flouté (`lastMessageIsBlurred = true`) → `.hidden`
- conversation vue-unique (`lastMessageIsViewOnce = true`) → `.viewOnce`
- `lastMessageExpiresAt` dans le passé → `.expired`
- `lastMessageExpiresAt` dans le futur → `.ephemeralActive`
- aucun effet → `.standard`
- précédence : expiré-passé l'emporte sur flouté ; flouté l'emporte sur vue-unique
- précédence : un message flouté **et** éphémère encore actif → `.hidden` (le flou prime sur l'éphémère actif)

Les points 1 et 2 (poids de police, couleur du badge) sont du styling sans logique métier : vérifiés par le build (`./apps/ios/meeshy.sh build`) et un contrôle visuel light/dark. La suite de tests iOS existante doit rester verte (`./apps/ios/meeshy.sh test`).

## Fichiers touchés

| Fichier | Nature | Note |
|---|---|---|
| `packages/MeeshySDK/Sources/MeeshySDK/Models/LastMessageSummaryKind.swift` | nouveau | package SPM → aucune édition `project.pbxproj` |
| `packages/MeeshySDK/Tests/MeeshySDKTests/LastMessageSummaryKindTests.swift` | nouveau | package SPM → aucune édition `project.pbxproj` |
| `packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift` | modifié | `errorDark` + `unreadBadgeBackground(isDark:)` |
| `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift` | modifié | titre gras, badge rouge, bascule vers le helper |
| `apps/ios/Meeshy/Features/Main/Views/GlobalSearchView.swift` | modifié | masquage d'effet sur les résultats |

Aucun nouveau fichier dans la cible applicative classique → **aucune édition de `project.pbxproj`**.

## Risques

- **Dérive des libellés entre les deux écrans** : le rendu est dupliqué (liste + recherche). Mitigation : la décision est centralisée et testée ; les clés de localisation sont partagées (mêmes `conversation.summary.*`), donc les traductions ne peuvent pas diverger ; seuls le choix d'icône SF Symbol et le style italique sont répétés (~10 lignes par écran).
- **Isolation MeeshyUI** : `MeeshyColors` est sous `MeeshyUI` (`defaultIsolation(MainActor)`). `errorDark` est une constante `let` `Sendable` et `unreadBadgeBackground` une fonction pure — marquer `nonisolated` si le compilateur l'exige, comme les autres helpers statiques du fichier.
- **Régression du rendu `.blurred`** : supprimer le `.blur(radius:)` est intentionnel ; vérifier au contrôle visuel qu'aucun autre code ne dépend du texte flouté dans la ligne.
