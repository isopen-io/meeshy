# Cycle 118 — « jumelles » se disait de trois clients

Point de départ : un balayage du **Prisme Linguistique appliqué au temps réel**, et non
un suivi hérité. Les cycles 106 à 117 ont gouverné la file hors ligne et le rattrapage
`/sync` jusqu'au dernier champ. Personne n'avait recompté les CLIENTS d'une règle que
`/CLAUDE.md` déclare « jumelle ».

---

## 1. Ce qui a été mesuré et trouvé SAIN — à écrire avant le défaut

| axe | mesure | verdict |
|---|---|---|
| serveur — la paire est-elle SERVIE ? | `routes/conversations/core.ts:1011` et `search.ts:374` posent `lastMessageOriginalLanguage` + `lastMessageTranslations` ; `conversationMinimalSchema` les DÉCLARE (`additionalProperties: { type: 'string' }` pour la carte à clés dynamiques) | **tient** |
| serveur — filtrage par lecteur | `buildLastMessagePreviewTranslations` restreint la carte au prisme du LECTEUR, exclut la langue d'origine, le chiffré et le texte vide | **tient** |
| serveur — temps réel | les trois émetteurs de `conversation:updated` passent par `resolveLastMessagePreviewPrism`, donc plafond et carte indissociables | **tient** |
| web | `ConversationItem.tsx`, `LentilleRow.tsx`, `useConversationFiltering.ts` lisent la paire à la RACINE et appellent le résolveur partagé | **tient** |
| iOS | `MeeshyConversation.resolvedLastMessagePreview` + `ConversationPrismeResolutionTests` | **tient** |

Un travail serveur complet, deux clients conformes, des témoins des deux côtés.

---

## 2. Le défaut : le troisième client n'avait jamais été compté

`/CLAUDE.md` §« Règles critiques du Prisme » #3 se termine ainsi :

> Sources de vérité **jumelles** : `resolveLastMessagePreview()` … et
> `MeeshyConversation.resolvedLastMessagePreview` … — toute évolution touche les deux.

Le dépôt a trois clients. La phrase en nommait deux, et **le troisième ne portait pas la
règle du tout** :

```kotlin
// core/model/.../model/Conversation.kt — AVANT
data class ApiConversation(
    …
    val lastMessage: ApiConversationLastMessage? = null,   // ← .content, brut
    val unreadCount: Int = 0,                              // ← rien entre les deux
```

Ni `lastMessageTranslations`, ni `lastMessageOriginalLanguage`. Le décodeur applicatif
(`SdkModule.providesJson`, `ignoreUnknownKeys = true`) les jetait donc **en silence**,
et la ligne rendait `lastMessage.content` — la langue de l'EXPÉDITEUR — pour tout
lecteur, à chaque démarrage.

### La double perte, et c'est la seconde qui rendait le défaut durable

`ConversationCacheSource` ne stocke pas des colonnes, il stocke la charge :

```kotlin
payload = MeeshyApi.json.encodeToString(conversation)   // ré-encodage
…
rows.map { json.decodeFromString<ApiConversation>(it.payload) }
```

Un champ non déclaré est donc perdu **deux fois** : au décodage de la réponse, puis à la
ré-écriture dans Room. Même une correction d'aval n'aurait rien eu à lire.

---

## 3. Ce qui rend ce défaut invisible : la surface SECONDAIRE, elle, résolvait

`ConversationListScreen` porte `state.currentUser` et le passe — deux cents lignes plus
bas, dans le MÊME fichier — à la carte d'aperçu au appui long, qui applique le Prisme
message par message :

```kotlin
// ConversationPreviewMessages.kt
content = message.displayContent(resolved)   // Prisme, par message
```

Pendant que la rangée juste derrière composait :

```kotlin
summary = messageSummaryLine(message = conversation.lastMessage, …)   // brut
```

> **La connaissance était dans le fichier, appliquée à la surface qu'on regarde une fois
> sur cent, absente de celle que tout le monde voit à chaque lancement.** Variante de la
> leçon 257 (« un contournement client bien commenté est un diagnostic qui n'a pas
> remonté ») : ici ce n'est pas un contournement, c'est un ACQUIS qui ne s'est pas
> propagé d'un composant à son voisin immédiat.

---

## 4. Le correctif, en quatre pièces

| pièce | fichier | rôle |
|---|---|---|
| `normalizeForDedup` | `lang/LanguageCodeNormalizer.kt` | port du `normalizeLanguageForDedup` TS — **TOTAL**, là où `normalize` rend `null` |
| `resolveLastMessagePreview` | `lang/LastMessagePreviewResolver.kt` | la RÈGLE, pure, troisième jumelle |
| la paire + `resolvedLastMessagePreview` | `model/Conversation.kt` | ce que le fil porte, et OÙ chaque entrée vit sur la charge Android |
| `resolvedContent` | `LastMessagePreview.kt` + `ConversationListScreen.kt` | la substitution, sur le TEXTE seulement |

### Pourquoi le jumeau TS et non le jumeau Swift, sur la canonicalisation

iOS écrit `MeeshyUser.normalizeLanguageCode($0) ?? $0.lowercased()`. Le TS écrit
`normalizeLanguageCode(code) ?? sous-tag primaire ?? code.toLowerCase()`. Les deux
diffèrent sur ce que `normalize` REFUSE (`"fil-PH"` : `"fil"` côté TS, `"fil-ph"` côté
iOS).

Le discriminant n'est pas l'ancienneté, c'est **qui produit les clés que l'on compare** :
la passerelle bâtit les clés de la carte avec `normalizeLanguageForDedup`, exactement.
S'aligner sur le TS, c'est garantir qu'une langue du lecteur canonicalise sur la clé qui
est RÉELLEMENT sur le fil. (L'écart iOS est noté ; il ne se manifeste que sur un code que
le normaliseur rejette, donc sur une clé qu'aucune traduction ne porte.)

### La substitution ne touche que le TEXTE

`resolvedContent` remplace `lastMessage.content` et rien d'autre. Les libellés de type
(`📷 Photo`, `📍 Localisation`) ne sont atteints qu'en l'ABSENCE de texte — il n'y a donc
rien à y traduire, la même frontière que le jumeau web trace dans `formatLastMessage`
(« le prisme ne s'applique qu'au TEXTE »). Et `EXPIRED` / `HIDDEN` / `VIEW_ONCE` ne
rendent pas le texte du message : leur corps est un libellé de genre, donc ils ne
reçoivent pas la résolution — un témoin par genre le gèle.

Le défaut par défaut est `null`, ce qui rend le paramètre **strictement additif** : les
appelants sans prisme sous la main (les deux widgets, la carte d'aperçu qui résout
elle-même par message) gardent mot pour mot leur comportement.

---

## 5. Vérifié / non vérifié — la distinction est la mesure

- [x] La paire est bien SERVIE par les deux routes serveur et DÉCLARÉE au schéma
      (relevé dans le fichier, pas hérité d'un journal).
- [x] La charge de test est copiée sur l'ÉMETTEUR, pas sur le schéma :
      `core.ts` DÉSTRUCTURE `originalLanguage` hors du spread de `lastMessage`, donc le
      champ imbriqué est ABSENT du fil et la racine est la seule source. La fixture
      l'omet, ce qui prouve du même coup que le résolveur lit la racine.
- [x] Le témoin « lecteur anglophone » est écrit sur un prisme `["en", "fr"]` **et pas
      `["en"]`** : sur `["en"]` seul il passerait même si `lastMessageOriginalLanguage`
      était jeté (aucune clé `en` ⇒ repli sur l'original). Un témoin qui ne peut pas
      tomber n'atteste rien.
- [x] Aucune construction positionnelle d'`ApiConversation` dans le dépôt (toutes
      nommées) : insérer deux champs au milieu du constructeur ne casse aucun appelant.
- [ ] **Kotlin non compilé ICI** : `dl.google.com` est refusé par la politique de sortie
      de ce conteneur (mesuré : `CONNECT tunnel failed, response 403`), donc `sdkmanager`
      ne peut pas s'amorcer et aucune tâche Gradle ne tourne. C'est exactement la
      situation que l'en-tête de `.github/workflows/android.yml` décrit et que ce workflow
      existe pour couvrir. **Le verdict vient d'`android.yml`, pas d'ici.**
- [x] **Et le verdict est TOMBÉ, utilement.** Premier passage `android.yml` :
      `assembleDebug` ✅ (la source de PRODUCTION compile), `testDebugUnitTest` ❌ sur
      `ConversationPrismePairWireTest.kt:66` — `json.encodeToString(once)` sans
      `import kotlinx.serialization.encodeToString`. `encodeToString` est une extension de
      `StringFormat`, pas un membre de `Json` ; `decodeFromString` se résout sans import
      (voisin `ConversationDraftTest`), `encodeToString` non (voisin
      `NotificationPreferenceSyncBodyTest`, qui l'importe). Corrigé (`ed74bb04`).
      **Leçon incidente : le seul témoin qui exerçait la SÉRIALISATION est celui qui n'a
      pas compilé — c'est le prix de ne pas avoir de chaîne d'outils Kotlin en local, et
      la raison pour laquelle `android.yml` est le gate, pas une formalité.**

---

## 6. Reste ouvert — nommé, avec sa raison

- [ ] **Les deux widgets d'écran d'accueil** (`RecentConversationsWidget`,
      `QuickReplyWidget`) rendent la même ligne sans prisme. Leur `WidgetEntryPoint`
      n'expose qu'un `userId`, pas l'identité : leur donner le prisme demande d'élargir
      le point d'entrée Hilt. Tranche à part, pas un oubli.
- [ ] **La moitié SOCKET.** `ConversationUpdatedSocketEvent` (Android) porte
      `{conversationId, title, description, avatar, updatedAt}` — aucun des champs du
      groupe d'aperçu que la passerelle émet (`lastMessagePreview`, `lastMessageAt`,
      `lastMessageId`, et la paire de Prisme). La rangée Android ne se met donc à jour
      que par REST et par `message:new`. Lot en soi, et le plus intéressant du trois :
      c'est la parité TEMPS RÉEL, pas seulement la parité de forme.
- [ ] **Un octet NUL brut dans `ConversationListViewModel.kt`** (séparateur de clé de
      minuterie de frappe, lignes 539/551). Fonctionnellement correct, mais `git` et
      `grep` classent le fichier BINAIRE : il ne s'affiche dans aucun diff de revue et
      aucun balayage de contenu ne le voit. `" "` échappé rendrait la même clé.
      Repéré en balayant, non corrigé ici — un fichier de 1018 lignes n'entre pas dans un
      lot de Prisme.
