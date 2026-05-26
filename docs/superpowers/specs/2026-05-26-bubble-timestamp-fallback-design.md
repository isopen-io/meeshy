# Bubble timestamp fallback synchrone — Design

**Date :** 2026-05-26
**Status :** Approved (design phase)
**Scope :** iOS uniquement (zéro backend, zéro SDK contrat)

## Intention produit

Toute bulle de message dans une conversation doit afficher son heure d'envoi (format `HH:mm`) **dès le premier render**, sans exception — y compris :
- Bulles ré-hydratées depuis un cache GRDB ancien (sans `cachedTimeString` populé)
- Bulles reçues en temps réel via Socket.IO avant que la persistance GRDB ait calculé `cachedTimeString`
- Bulles optimistic (envoyées localement, pas encore confirmées serveur)

## Diagnostic (root cause)

Code actuel `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleContentBuilder.swift:155` :

```swift
let resolvedTimeString = timeString ?? message.cachedTimeString ?? ""
```

`cachedTimeString` est un champ `String?` calculé **uniquement** lors de l'insert GRDB par `MessagePersistenceActor.swift:130` (`MessageRecord.computeTimeString(for: createdAt)`). Trois cas le rendent `nil` :

1. **Cache GRDB legacy** — bulles persistées avant que `cachedTimeString` soit câblé dans le pipeline d'ingestion. Vérifié empiriquement : après réinstallation (base GRDB vide), toutes les nouvelles bulles ont leur heure ; sur ancien cache, certaines bulles affichent `""`.
2. **Race socket fresh** — fenêtre de 10–50 ms entre `messageReceived.send(msg)` (`MessageSocketManager.swift:1824`) et l'insert GRDB qui calcule le champ.
3. **Optimistic outgoing** — `ConversationViewModel.swift:1843` crée un message local avec `createdAt: Date()` mais ne calcule pas `cachedTimeString` immédiatement.

Dans les trois cas, l'UI tombe sur le fallback `""` → la bulle s'affiche sans heure.

`message.createdAt` est en revanche **toujours non-nil** (`MeeshyMessage.createdAt: Date` — `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift:646`).

## Approche retenue : fallback synchrone en 3e position

Ajouter un troisième niveau de fallback : si `cachedTimeString` est `nil`, formater `message.createdAt` à la volée via un `DateFormatter` statique memoizé.

```swift
private static let timeFormatter: DateFormatter = {
    let f = DateFormatter()
    f.dateFormat = "HH:mm"
    return f
}()

let resolvedTimeString = timeString
    ?? message.cachedTimeString
    ?? Self.timeFormatter.string(from: message.createdAt)
```

### Alternatives écartées

- **Migration de backfill GRDB** : itérer sur toutes les `MessageRecord` au démarrage et populer `cachedTimeString` manquant. Plus coûteux (one-shot scan de toute la table à chaque ouverture d'app), n'élimine pas la race socket fresh, et reste fragile face à toute régression future du pipeline d'ingestion.
- **Calcul synchrone à l'ingestion socket** : précalculer `cachedTimeString` dans le handler `message:new` avant publication. Couvre la race socket mais pas le cache legacy ; alourdit le handler temps-réel.

Le fallback synchrone couvre les trois cas, n'alourdit pas le hot path (`DateFormatter` static memoizé = ~1µs par bulle), et reste défensif contre toute régression future.

### Performance

- `DateFormatter` est lourd à instancier (~10 ms) mais réutilisable. La version statique `private static let` garantit une instance unique sur la durée de vie du process.
- `string(from:)` appelée seulement quand les deux premiers fallbacks sont `nil` — chemin froid sur le cas commun.
- Mesure escomptée : < 10 µs de surcoût par render sur bulles concernées, indétectable visuellement.

### Localisation

Le format `HH:mm` est universel (24h). Pour respecter les préférences locales de l'utilisateur (12h US, 24h FR), on pourrait utiliser `DateFormatter.timeStyle = .short` — mais cela introduit une dépendance locale dans la couche de présentation. **Décision** : conserver `HH:mm` strict pour parité avec `MessageRecord.computeTimeString` (source GRDB), qui utilise déjà ce format dur. Un éventuel passage en locale-sensitive sera traité comme évolution séparée touchant les deux sites.

## Tests

Fichier : `apps/ios/MeeshyTests/Unit/Views/Bubble/BubbleContentBuilderTests.swift` (nouveau si absent, sinon ajout)

```swift
func test_timeString_fallsBackToCreatedAt_whenCachedTimeStringIsNil() {
    let createdAt = ISO8601DateFormatter().date(from: "2026-05-26T14:32:00Z")!
    let message = makeMessage(createdAt: createdAt, cachedTimeString: nil)
    let content = BubbleContentBuilder.build(from: message, ...)
    // En timezone UTC : "14:32"
    XCTAssertFalse(content.meta.timeString.isEmpty)
    XCTAssertEqual(content.meta.timeString.count, 5)  // HH:mm
}

func test_timeString_prefersCachedTimeString_overFallback() {
    let message = makeMessage(createdAt: Date(), cachedTimeString: "09:15")
    let content = BubbleContentBuilder.build(from: message, ...)
    XCTAssertEqual(content.meta.timeString, "09:15")
}

func test_timeString_prefersExplicitParameter_overBoth() {
    let message = makeMessage(createdAt: Date(), cachedTimeString: "09:15")
    let content = BubbleContentBuilder.build(from: message, timeString: "EXPLICIT", ...)
    XCTAssertEqual(content.meta.timeString, "EXPLICIT")
}
```

## Surface du changement

- 1 fichier modifié : `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleContentBuilder.swift`
- 1 fichier de test : `apps/ios/MeeshyTests/Unit/Views/Bubble/BubbleContentBuilderTests.swift`
- ~10 LOC ajoutées (static formatter + chain fallback)
- Zéro changement contrat SDK, modèle, backend
- Zéro migration de données

## Risques

- **Aucun risque de régression sur bulles fonctionnant déjà** : le nouveau fallback n'est atteint que quand les deux premiers sont `nil`. Le chemin chaud (avec `cachedTimeString` populé) est inchangé.
- **DateFormatter thread safety** : `DateFormatter` est documenté safe en lecture concurrente depuis iOS 7+ (`string(from:)` seulement). L'instance statique est créée une fois, jamais mutée.
- **Test deterministic** : les tests utilisent UTC dans l'arrange pour éviter la sensibilité au timezone CI. Le `DateFormatter` n'a pas de `timeZone` explicite → utilise `TimeZone.current`. Pour assertion exacte, on teste juste `isEmpty == false` et `count == 5` (format HH:mm). L'assertion sur valeur précise serait flaky entre simulateur (heure locale) et CI (UTC).
