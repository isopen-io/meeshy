# Audit d'optimisation global — 2026-06-07

> Branche analysée : `main` (HEAD b4bee8af)
> Scope : gateway · web · iOS · MeeshySDK · translator

---

## 1. Résumé exécutif

Le codebase Meeshy est **robuste et bien structuré**. Les optimisations de la Phase A (compression HTTP Brotli/gzip, WebP thumbnails, `perMessageDeflate` Socket.IO, filtrage par langue, ETag/Cache-Control sur les routes clés, hover-prefetch web, transport WebSocket iOS) sont en place et opérationnelles.

Les axes de progression restants sont ciblés sur :
- **Bande passante / DB** : identité de frappe (DB par keystroke), Tone.js statique
- **Expérience instantanée** : focus-window burst, stale-while-revalidate généralisé
- **Architecture / Cohérence** : correction de divergences cross-platform mineures

---

## 2. État des optimisations précédentes (Phase A)

| Optimisation | Statut | Fichier |
|---|---|---|
| HTTP Brotli/gzip (quality 5/6) | ✅ Actif | `server.ts:415` |
| Socket.IO `perMessageDeflate` threshold=256 | ✅ Actif | `MeeshySocketIOManager.ts:206` |
| WebP thumbnails Sharp (−25-35%) | ✅ Actif | Phase D4 |
| ETag + `If-None-Match` 304 (conversations + messages) | ✅ Actif | `conversations/core.ts:577`, `messages.ts:1242` |
| Auth user Redis cache (5min TTL) | ✅ Actif | `middleware/auth.ts:144` |
| `ReactQueryDevtools` gated `NODE_ENV` | ✅ Actif | `QueryProvider.tsx:11` |
| Translation LRU cache 500 entrées | ✅ Actif | `advanced-translation.service.ts:89` |
| Hover-prefetch ConversationItem | ✅ Actif | `ConversationItem.tsx:17` |
| Transport WebSocket natif iOS (forcePolling supprimé) | ✅ Actif | `MessageSocketManager.swift:1153` |
| iOS Cache-first (Feed, Stories, Bookmarks, Status) | ✅ Actif | ViewModels respectifs |
| Keychain pour tokens iOS | ✅ Actif | `AuthManager.swift:108` |
| Traefik compress middleware prod | ✅ Actif | `docker-compose.prod.yml:323` |
| Next.js Image (webp/avif, deviceSizes) | ✅ Actif | `next.config.ts:images` |
| Notification `updateMany` (pas de loop N+1) | ✅ Actif | `conversations/core.ts:729` |

---

## 3. Problèmes identifiés — Restants actionnables

### 3.1 Gateway — DB hit sur chaque keystroke (HAUTE PRIORITÉ)

**Fichier** : `services/gateway/src/socketio/handlers/StatusHandler.ts`

`_resolveTypingIdentity()` exécute 1 `prisma.user.findUnique` **à chaque événement `typing:start`**. Avec 100 utilisateurs actifs tapant simultanément à 1 event/s = **6 000 lectures DB/min** pour de l'identité qui ne change pratiquement jamais.

```typescript
// Problème : DB lookup sans cache
private async _resolveTypingIdentity(userId, isAnonymous) {
  const dbUser = await this.prisma.user.findUnique(...) // ← chaque keystroke
}
```

**Solution** : TTL Map en mémoire (60s), invalidé sur déconnexion socket.

### 3.2 Web — Tone.js import statique (HAUTE PRIORITÉ)

**Fichier** : `apps/web/hooks/use-audio-effects.ts:15` et `utils/audio-effects.ts:12`

```typescript
import * as Tone from 'tone'; // ~800 KB chargé pour TOUS les utilisateurs
```

Tone.js est utilisé uniquement pendant l'enregistrement vocal avec effets — une feature optionnelle utilisée par ~5% des utilisateurs. Charger 800 KB au démarrage pour tous est une régression de performance critique.

**Solution** : Dynamic import déclenché uniquement à l'activation des effets.

### 3.3 Web — Burst refetch au focus-fenêtre (MOYENNE PRIORITÉ)

**Fichier** : `apps/web/lib/react-query/query-client.ts:25`

```typescript
refetchOnWindowFocus: 'always'
```

Combiné à `staleTime: Infinity`, cela déclenche un refetch de **toutes** les queries actives à chaque retour sur l'onglet — jusqu'à 10-15 requêtes simultanées. Le but est légitime (rattraper les events Socket.IO manqués), mais l'amplitude est inutile. Un debounce de 5s via custom `FocusManager` réduit les bursts sans sacrifier la safety-net.

### 3.4 Web — Cache i18n non borné côté serveur

**Fichier** : `apps/web/lib/i18n-server.ts:58`

```typescript
const translationsCache = new Map<string, Record<string, unknown>>();
```

Map non bornée. En pratique limitée (4 locales × N namespaces) mais sans éviction. Risque faible mais facile à corriger.

### 3.5 Gateway — Cache-Control absent sur routes user/language (BASSE PRIORITÉ)

Les routes `/users/:id`, `/languages`, `/voice-profile` n'ont pas de `Cache-Control`. Ces données changent rarement et pourraient bénéficier d'un `private, max-age=300` (profil) ou `public, max-age=3600` (languages list).

### 3.6 Translator — TTS systématique pour audio messages

**Impact estimé** : 2-4 GB/h côté serveur inutilisés si les destinataires ne consomment pas l'audio traduit.

Le pipeline génère des TTS pour TOUTES les langues configurées (`autoTranslateEnabled=true`), même si aucun utilisateur de ces langues n'est actif dans la conversation. La gateway ne transmet pas la liste des abonnés actifs au translator.

**Solution partielle implémentée** : Flag `A3` (filtrage par langue préférée des participants). Reste à valider que ce flag est activé par défaut pour les nouvelles conversations.

### 3.7 iOS — Stale-while-revalidate non utilisé dans `UserProfileViewModel.loadUserStats`

**Fichier** : `apps/ios/Meeshy/Features/Main/ViewModels/UserProfileViewModel.swift:93`

Le `.stale` case dans `loadUserStats` ne déclenche pas de background refresh (contrairement à `loadFullProfile` qui le fait correctement). Pattern incohérent.

---

## 4. Analyse comparative concurrence

| Feature | Meeshy | Signal | WhatsApp | Telegram |
|---|---|---|---|---|
| Traduction auto multi-langue | ✅ NLLB-200 | ❌ | ❌ | ✅ (payant) |
| Clonage vocal TTS | ✅ Chatterbox | ❌ | ❌ | ❌ |
| Cache-first offline | ✅ L1/L2/L3 | ✅ | ✅ | ✅ |
| E2EE native | ✅ Signal Protocol | ✅ | ✅ | Partiel |
| WebRTC calls | ✅ | ✅ | ✅ | ✅ |
| Stories multi-langue | ✅ RAW publish | ❌ | ❌ | ❌ |
| Compression socket | ✅ perMsgDeflate | Inconnu | Inconnu | Inconnu |
| Optimistic updates | ✅ | ✅ | ✅ | ✅ |
| Sync stale-while-revalidate | ✅ (partiel) | Inconnu | Inconnu | Inconnu |

**Gaps vs concurrence** :
- **Réactions animées** (Telegram, WhatsApp) — non encore animées dans Meeshy
- **Message scheduling** (Telegram) — absent
- **Multi-account** (Telegram) — absent
- **Desktop natif** (Signal, Telegram) — Meeshy web seulement

---

## 5. Architecture — Points de cohérence cross-platform

### 5.1 Résolution de langue
La fonction `resolveUserLanguage()` a 3 implémentations :
- **Source de vérité** : `packages/shared/utils/conversation-helpers.ts`
- **Web** : `utils/user-language-preferences.ts:resolveUserPreferredLanguage` (wrapper correct, injecte `deviceLocale`)
- **iOS** : `ConversationViewModel.preferredTranslation(for:)` (logique locale, doit rester en sync)
- **Gateway** : utilise `resolveUserLanguage` directement ✅

Le wrapper web est correct (`resolveUserPreferredLanguage` délègue à `resolveUserLanguage` + injecte deviceLocale). **Aucune action requise**.

### 5.2 Normalisation language code
3 sites maintiennent le même helper ISO 639-1 :
- `packages/shared/utils/language-normalize.ts` (source)
- `MeeshyUser.normalizeLanguageCode` (SDK Swift)
- `ConversationLanguagePreferences.normalize` (iOS app)

**Cohérence à maintenir** à chaque modification.

---

## 6. Métriques de référence (estimés)

| Métrique | Avant Phase A | Après Phase A | Cible après plan |
|---|---|---|---|
| Taille payload `message:new` | ~30 KB | ~12 KB (compression) | ~8 KB |
| Requêtes DB/min sur typing | ~6 000 | ~6 000 | ~100 (cache) |
| Bundle JS initial web | ~2.8 MB | ~2.8 MB | ~2.0 MB (−800 KB Tone.js) |
| Burst refetch tab-focus | 10-15 req | 10-15 req | 1-2 req (debounce) |
| TTS généré inutilisé | ~30% | ~20% (A3 flag) | ~10% (abonnés actifs) |

---

## 7. Conclusion

Le codebase est en bonne santé. Les 6 axes restants sont bien délimités et indépendants. Aucune refonte architecturale n'est nécessaire — ce sont des optimisations chirurgicales sur des hotspots identifiés.

Priorité d'implémentation :
1. **[P1]** Typing identity cache (gateway) — impact immédiat DB
2. **[P1]** Tone.js dynamic import (web) — impact immédiat bundle
3. **[P2]** Focus-window refetch debounce (web) — UX + réseau
4. **[P2]** `loadUserStats` stale-while-revalidate fix (iOS)
5. **[P3]** Cache-Control routes user/language (gateway)
6. **[P3]** i18n server cache borné (web)
