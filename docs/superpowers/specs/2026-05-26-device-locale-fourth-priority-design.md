# Locale appareil en 4e priorité du Prisme Linguistique — Design

**Date :** 2026-05-26
**Status :** Approved (design phase)
**Scope :** packages/shared + services/gateway + services/translator + apps/ios + CLAUDE.md (cross-platform contract)

## Intention produit

Étendre le Prisme Linguistique pour offrir une **4e priorité de résolution de langue** basée sur la locale de l'appareil de l'utilisateur (`Locale.current` côté iOS, `Accept-Language` côté web), **en complément** — pas en remplacement — des préférences in-app.

### Cas d'usage motivant

Une utilisatrice configure son compte avec `systemLanguage = "fr"`. Elle utilise un iPhone réglé en italien (`Locale.current.languageCode = "it"`). Aujourd'hui, si un message arrive dans une 3e langue (anglais) sans traduction française disponible (race translator ou langue source = fr), elle voit le contenu en anglais brut. Demain, elle le verra en italien si une traduction italienne est disponible — c'est sa langue d'usage quotidien.

**Le contrat reste piloté par les préférences in-app** : la langue de l'appareil ne supplante jamais `systemLanguage`, `regionalLanguage` ou `customDestinationLanguage`. Elle s'insère en 4e position, comme un signal additionnel quand les 3 premiers ne matchent pas.

### Ordre final

```
1. systemLanguage         (priorité in-app maximale)
2. regionalLanguage       (préférence secondaire in-app)
3. customDestinationLanguage  (override destination personnalisé)
4. deviceLocale           (NOUVEAU — langue d'usage quotidien)
5. original               (fallback : afficher la langue source)
```

## Diagnostic & contrat actuel

### État présent (`packages/shared/utils/conversation-helpers.ts:10-19`)

```typescript
export function resolveUserLanguage(user: User): string {
  return user.systemLanguage
    ?? user.regionalLanguage
    ?? user.customDestinationLanguage
    ?? 'fr';
}
```

### Miroir iOS (`apps/ios/Meeshy/Features/Main/Models/ConversationLanguagePreferences.swift:72-77`)

```swift
var resolved: [String] {
    [systemLanguage, regionalLanguage, customDestinationLanguage]
        .compactMap { $0 }
        .uniqued(by: { $0.lowercased() })
}
```

### Règle CLAUDE.md actuelle (à modifier)

> « **La locale appareil (`Locale.current`) ne doit JAMAIS etre utilisee pour la resolution de contenu.** »
> « **Ne JAMAIS ajouter la locale appareil dans les langues preferees de contenu.** »

Cette règle a été instaurée pour éviter qu'un user francophone avec iPhone-EN voie ses messages en anglais. La nouvelle règle préserve cette garantie : le user francophone voit toujours en français (priorité 1) ; la locale iPhone-EN n'intervient que si aucune traduction française n'est disponible **et** qu'une traduction anglaise existe.

## Architecture du changement (5 surfaces)

### Surface 1 — `packages/shared` (source de vérité)

**Fichier :** `packages/shared/utils/conversation-helpers.ts`

```typescript
export interface ResolveUserLanguageOpts {
  deviceLocale?: string;
}

export function resolveUserLanguage(
  user: Pick<User, 'systemLanguage' | 'regionalLanguage' | 'customDestinationLanguage'>,
  opts: ResolveUserLanguageOpts = {}
): string {
  return user.systemLanguage
    ?? user.regionalLanguage
    ?? user.customDestinationLanguage
    ?? normalizeLanguageCode(opts.deviceLocale)
    ?? 'fr';
}

export function resolveUserLanguagesOrdered(
  user: Pick<User, 'systemLanguage' | 'regionalLanguage' | 'customDestinationLanguage'>,
  opts: ResolveUserLanguageOpts = {}
): string[] {
  const ordered = [
    user.systemLanguage,
    user.regionalLanguage,
    user.customDestinationLanguage,
    normalizeLanguageCode(opts.deviceLocale),
  ].filter((x): x is string => Boolean(x));
  return Array.from(new Set(ordered.map(s => s.toLowerCase())));
}
```

`normalizeLanguageCode` extrait la partie ISO 639-1 d'une identifier complète (`fr-FR` → `fr`, `zh-Hant-HK` → `zh`). Une version existe possiblement déjà dans `packages/shared/utils/` ; sinon créer dans le même fichier.

**Backward compat** : appelants existants qui passent un seul argument continuent à fonctionner — `opts` est facultatif.

**Schéma Prisma :** `packages/shared/prisma/schema.prisma` — ajouter `deviceLocale String?` (max 16 char, nullable) au modèle `User`. Migration MongoDB sans backfill nécessaire (`null` = pas encore propagé, comportement legacy préservé).

### Surface 2 — `services/gateway` (propagation + persistance)

**Header :** `X-Device-Locale` accepté sur toutes les routes authentifiées. Format attendu : identifier ISO (`fr-FR`, `it`, `en-US`...).

**Middleware (`services/gateway/src/middleware/deviceLocale.ts` — nouveau) :**

```typescript
export const deviceLocaleMiddleware = async (req, reply, done) => {
  const header = req.headers['x-device-locale'];
  if (!header || typeof header !== 'string') return done();

  const normalized = normalizeLanguageCode(header);
  if (!normalized) return done();

  if (req.user) {
    const lastUpdate = userLocaleUpdateCache.get(req.user.id);
    const now = Date.now();
    if (!lastUpdate || now - lastUpdate > 5 * 60 * 1000) {
      // Debounce 5 minutes pour éviter une écriture par requête
      if (req.user.deviceLocale !== normalized) {
        await prisma.user.update({
          where: { id: req.user.id },
          data: { deviceLocale: normalized },
        });
        userLocaleUpdateCache.set(req.user.id, now);
      }
    }
  }
  done();
};
```

`userLocaleUpdateCache` est un `Map<string, number>` en mémoire process (acceptable : la perte au restart provoque juste un debounce manqué, pas de corruption).

**Pipeline translator :** `MessageProcessor` (où il construit la liste des destinations pour ZMQ) consulte `resolveUserLanguagesOrdered(user, { deviceLocale: user.deviceLocale })` pour chaque participant. La liste de destinations envoyée au translator inclut donc automatiquement la deviceLocale unique des participants.

**Sockets :** la résolution serveur-side qui décide quelle traduction broadcaster (`MeeshySocketIOManager`) doit aussi passer par `resolveUserLanguagesOrdered`.

### Surface 3 — `services/translator` (aucun changement code)

Le translator reçoit déjà via ZMQ une liste de langues destinations. Il génère une traduction par destination demandée. **Aucun changement de logique** : la liste contient maintenant potentiellement la deviceLocale, donc une traduction supplémentaire est générée si elle est distincte des autres destinations du même message.

**Impact charge** : pour un message échangé entre N participants, le nombre de traductions générées passe de `unique(systemLanguage + regionalLanguage + customDestinationLanguage)` à `unique(... + deviceLocale)`. Dans la majorité des cas la deviceLocale matchera l'une des trois préférences in-app du même utilisateur ou de quelqu'un d'autre dans la conversation, donc l'augmentation est faible (+5 à 15 % empiriquement).

**Langues hors NLLB-200 :** si la deviceLocale n'est pas supportée (ex: une variante rare), le translator skip silencieusement cette destination — pas d'erreur, juste l'absence de la traduction. iOS tombera alors sur le 5e fallback (original).

### Surface 4 — `apps/ios` (propagation header + résolution locale)

**`packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift` :** injecter `X-Device-Locale` sur toutes les requêtes :

```swift
private func currentDeviceLocale() -> String {
    Locale.current.identifier  // ex: "fr_FR", convertir en "fr-FR" via remplacement _ → -
}

// Dans buildRequest :
request.setValue(currentDeviceLocale(), forHTTPHeaderField: "X-Device-Locale")
```

**`apps/ios/Meeshy/Features/Main/Models/ConversationLanguagePreferences.swift:72-77` :**

```swift
var resolved: [String] {
    [
        systemLanguage,
        regionalLanguage,
        customDestinationLanguage,
        normalizedDeviceLocale,
    ]
    .compactMap { $0 }
    .uniqued(by: { $0.lowercased() })
}

private var normalizedDeviceLocale: String? {
    Locale.current.languageCode?.lowercased()
}
```

**`packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift` — `MeeshyUser.preferredContentLanguages` :** ajouter le 4e élément (`Locale.current.languageCode`) dans la liste retournée.

**`ConversationViewModel.preferredTranslation(for:)`** : aucun changement de signature. La liste `preferredLanguages` qui itère pour matcher contient maintenant 4 entrées au lieu de 3. La règle critique du Prisme reste appliquée : si aucune ne matche, retourner `nil` (afficher original) — pas de fallback `translations.first`.

**Drapeaux dans la bulle (`BubbleContentBuilder.buildAvailableFlags`) :** la liste `availableFlags` inclura automatiquement le drapeau de la deviceLocale quand une traduction matche, sans modification de code — la logique itère déjà sur `preferredLanguages`.

### Surface 5 — `CLAUDE.md` (racine + `apps/ios/CLAUDE.md`)

**À modifier dans `CLAUDE.md` racine, section « Prisme Linguistique » :**

- Mettre à jour l'ordre de résolution (1-4 + fallback)
- Remplacer la règle « Ne JAMAIS ajouter la locale appareil » par : « La locale appareil (`Locale.current` iOS, `Accept-Language` web) intervient en **4e priorité**, après les préférences in-app. Elle ne supplante jamais une préférence in-app ; elle complète quand celles-ci ne matchent pas »
- Mettre à jour le snippet `resolveUserLanguage` pour montrer le nouvel ordre
- Mettre à jour les commentaires sur l'iOS dans la même section

**À modifier dans `apps/ios/CLAUDE.md`, section « Prisme Linguistique — Implementation iOS » :**

- Mettre à jour la description de `preferredTranslation(for:)` pour mentionner le 4e niveau
- Mettre à jour les drapeaux (max 4 au lieu de 3)

## Tests

### `packages/shared`

`packages/shared/__tests__/resolveUserLanguage.test.ts` (créer si absent) :

```typescript
describe('resolveUserLanguage', () => {
  it('returns systemLanguage when set, ignoring deviceLocale', () => {
    expect(resolveUserLanguage(
      { systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null },
      { deviceLocale: 'it' }
    )).toBe('fr');
  });

  it('returns deviceLocale when all 3 in-app prefs are null', () => {
    expect(resolveUserLanguage(
      { systemLanguage: null, regionalLanguage: null, customDestinationLanguage: null },
      { deviceLocale: 'it-IT' }
    )).toBe('it');
  });

  it('normalizes deviceLocale to ISO-639-1', () => {
    expect(resolveUserLanguage(
      { systemLanguage: null, regionalLanguage: null, customDestinationLanguage: null },
      { deviceLocale: 'zh-Hant-HK' }
    )).toBe('zh');
  });

  it('falls back to fr when nothing is set', () => {
    expect(resolveUserLanguage({ systemLanguage: null, regionalLanguage: null, customDestinationLanguage: null }))
      .toBe('fr');
  });
});

describe('resolveUserLanguagesOrdered', () => {
  it('returns 4-level priority list', () => {
    expect(resolveUserLanguagesOrdered(
      { systemLanguage: 'fr', regionalLanguage: 'es', customDestinationLanguage: 'pt' },
      { deviceLocale: 'it' }
    )).toEqual(['fr', 'es', 'pt', 'it']);
  });

  it('dedupes when deviceLocale matches an in-app pref', () => {
    expect(resolveUserLanguagesOrdered(
      { systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null },
      { deviceLocale: 'fr-FR' }
    )).toEqual(['fr']);
  });
});
```

### `services/gateway`

`services/gateway/__tests__/middleware/deviceLocale.test.ts` :

- Header `X-Device-Locale` absent → no-op, pas d'écriture DB
- Header présent, user.deviceLocale différent → écriture DB, `userLocaleUpdateCache` mis à jour
- Header présent, écrit il y a 2 min → no-op (debounce 5 min)
- Header présent, écrit il y a 6 min → écriture
- Header malformé (`@@@`) → no-op, pas d'erreur visible
- Header normalisé (`fr-FR` → `fr` stocké en base)

`services/gateway/__tests__/socket/translationDestinations.test.ts` :

- Conversation avec 3 participants, chacun deviceLocale distincte → MessageProcessor passe 4 destinations au lieu de 3 au translator (déduplication par langue, pas par participant)

### `apps/ios`

`apps/ios/MeeshyTests/Unit/Models/ConversationLanguagePreferencesTests.swift` :

- `resolved` retourne 4 éléments quand systemLanguage, regionalLanguage, customDest et deviceLocale sont tous distincts
- `resolved` déduplique quand deviceLocale matche systemLanguage
- `resolved` retourne 3 éléments quand `Locale.current.languageCode == nil` (cas edge improbable mais testable via mock)

`apps/ios/MeeshyTests/Unit/Networking/APIClientHeaderTests.swift` :

- Chaque requête sortante porte `X-Device-Locale: \(Locale.current.identifier)`
- Format underscore → tiret (`fr_FR` → `fr-FR`) appliqué avant injection

### E2E (`tests/e2e/`)

Scénario manuel scripté :

1. User Alice : `systemLanguage = "fr"`, iPhone en `it`
2. User Bob : `systemLanguage = "en"`, envoie un message en allemand
3. Translator génère traductions : fr (Alice systemLanguage) + en (Bob systemLanguage) + it (Alice deviceLocale) + original allemand
4. Alice voit message en français (priorité 1)
5. Alice désactive temporairement la traduction française (clique sur drapeau) → voit l'italien (priorité 4, drapeau italien dans la liste)
6. Bob voit en anglais

## Migration & rollout

- **Pas de feature flag** : app pre-launch (`cd6e0c73` a déjà supprimé `StoryTimelineFeatureFlag` pour la même raison)
- **Backend backward compat** : header `X-Device-Locale` optionnel. Anciens clients (web sans support) continuent à fonctionner — `user.deviceLocale` reste `null` et la résolution équivaut à l'ancien comportement.
- **Pas de migration de données** : `deviceLocale` est `null` au départ et se peuple opportunistement à la première requête iOS.
- **Ordre de merge** : `packages/shared` → `services/gateway` + `services/translator` → `apps/ios` → `CLAUDE.md`. iOS dépend du contrat shared mais peut fonctionner même si gateway n'a pas encore le header (`deviceLocale` du user reste `null`, dédup naturel).

## Risques & edge cases

- **`Locale.current.languageCode == nil`** : techniquement impossible sur iOS depuis iOS 14, mais le code gère gracieusement (compactMap skip).
- **Locale change pendant la session** : iOS notifie via `NSLocale.currentLocaleDidChangeNotification`. Pas de cache à invalider — `Locale.current` est re-lu à chaque requête.
- **Locale exotique non supportée par NLLB-200** : translator skip cette destination, pas d'erreur visible côté client. iOS tombe sur la priorité 5 (original).
- **User déconnecté → ré-authentifié sur autre device** : `deviceLocale` est mis à jour à la première requête authentifiée du nouveau device. Pas de course condition critique (un user ne peut avoir qu'une `User.deviceLocale` à un instant t, dernière écriture gagne).
- **Header `X-Device-Locale` injecté malicieusement par un client tiers** : pas un risque de sécurité — c'est juste une préférence d'affichage personnelle de l'utilisateur, pas une autorisation. Validation regex pour rejeter les payloads malformés.
- **Charge translator** : surveiller la latence p95 et le débit du worker pool après déploiement. Plan B si surcoût supérieur à 25 % : ajouter un débit budgétaire par utilisateur côté gateway pour limiter la propagation `deviceLocale` aux conversations actives uniquement.

## Surface du changement (récap)

| Couche | Fichiers modifiés | Nouveaux fichiers | LOC estimées |
|--------|-------------------|-------------------|--------------|
| `packages/shared` | 1 (`conversation-helpers.ts`) + 1 schema | 1 test | ~40 |
| `services/gateway` | 2 (sockets manager, message processor) | 1 middleware + 1 test | ~80 |
| `services/translator` | 0 | 0 | 0 |
| `apps/ios` + SDK | 3 (APIClient, AuthModels, ConversationLanguagePreferences) | 2 tests | ~50 |
| `CLAUDE.md` | 2 (racine + iOS) | 0 | ~30 |
| **Total** | **8** | **5** | **~200** |

## Décisions explicites

- Priorité 1-3 reste in-app. Le contrat principal n'est pas remis en cause.
- `deviceLocale` est persistée côté backend (table `User`) pour permettre au gateway/translator de générer les traductions en avance — pas seulement à la demande au moment de l'affichage.
- Le debounce 5 min côté middleware est un compromis : suffisamment réactif pour suivre un changement de langue iOS, suffisamment lâche pour ne pas écrire en DB à chaque requête.
- Conserver `'fr'` comme fallback ultime (`resolveUserLanguage`) reste cohérent avec le contrat actuel.
- Si la `deviceLocale` matche une préférence in-app, le drapeau correspondant n'apparaît qu'une fois (dédup par code langue lowercase).
