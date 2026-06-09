# Plan d'implémentation — Optimisations globales 2026-06-07

> Source : `docs/routine/analyses/2026-06-07-audit-optimisation-global.md`
> Branche : `claude/zen-albattani-OpUwt`

---

## Phase 1 — Haute priorité (DB + Bundle)

### 1.1 Typing identity cache [Gateway]

**Fichiers** : `services/gateway/src/socketio/handlers/StatusHandler.ts`

**Problème** : `_resolveTypingIdentity()` fait 1 `prisma.findUnique` par keystroke.

**Solution** :
- Ajouter une `Map<string, { identity, expiresAt }>` dans `StatusHandler`
- TTL 60 secondes
- Clé = `userId`
- Invalider à la déconnexion socket (hook `socket.on('disconnect')` dans `MeeshySocketIOManager`)

**Changements** :
1. `StatusHandler.ts` : ajouter `identityCache` Map avec TTL, utiliser dans `_resolveTypingIdentity`
2. `StatusHandlerDependencies` : aucun changement (cache local à la classe)

**Tests** : Vérifier que `_resolveTypingIdentity` ne fait DB que sur miss/expiration.

---

### 1.2 Tone.js dynamic import [Web]

**Fichiers** : 
- `apps/web/hooks/use-audio-effects.ts`
- `apps/web/utils/audio-effects.ts`

**Problème** : `import * as Tone from 'tone'` charge ~800 KB pour tous les utilisateurs au démarrage.

**Solution** :
1. Dans `utils/audio-effects.ts` : supprimer l'import statique, exposer une fonction `loadTone(): Promise<typeof Tone>` qui fait `import('tone')` (mémoïsé)
2. Dans `use-audio-effects.ts` : initialiser Tone via `loadTone()` dans l'effet d'activation, pas au montage. Types conservés via `import type`.

**Pattern** :
```typescript
// utils/audio-effects.ts
let _toneModule: typeof import('tone') | null = null;
export async function loadTone() {
  _toneModule ??= await import('tone');
  return _toneModule;
}
```

**Tests** : Le bundle analyzer (`ANALYZE=true npm run build`) doit montrer Tone.js dans un chunk séparé non chargé au démarrage.

---

## Phase 2 — Priorité moyenne (UX + Cohérence)

### 2.1 Focus-window refetch debounce [Web]

**Fichier** : `apps/web/lib/react-query/query-client.ts`

**Problème** : `refetchOnWindowFocus: 'always'` déclenche 10-15 requêtes simultanées au retour sur l'onglet.

**Solution** : Ajouter un custom `FocusManager` avec debounce 5 secondes. React Query expose `focusManager.setEventListener()` pour remplacer le comportement par défaut.

```typescript
// lib/react-query/focus-manager.ts
import { focusManager } from '@tanstack/react-query';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

focusManager.setEventListener((handleFocus) => {
  const onFocus = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => handleFocus(true), 5_000);
  };
  window.addEventListener('focus', onFocus, false);
  return () => window.removeEventListener('focus', onFocus);
});
```

Importer dans `QueryProvider.tsx` pour initialisation.

---

### 2.2 `loadUserStats` stale-while-revalidate [iOS]

**Fichier** : `apps/ios/Meeshy/Features/Main/ViewModels/UserProfileViewModel.swift`

**Problème** : Case `.stale` dans `loadUserStats` n'initie pas de background refresh (contrairement à `loadFullProfile`).

**Solution** : Dans le case `.stale`, retourner les données immédiatement ET lancer `fetchUserStats` en tâche détachée.

```swift
case .stale(let data, _):
    stats = data.first
    Task { [weak self] in await self?.fetchUserStats(userId: userId, cacheKey: userId) }
```

---

## Phase 3 — Priorité basse (Cache + Maintenance)

### 3.1 Cache-Control sur routes user et languages [Gateway]

**Fichiers** :
- `services/gateway/src/routes/users/` (profil public)
- `services/gateway/src/routes/languages.ts` (ou équivalent)

**Solution** : Ajouter `reply.header('Cache-Control', 'private, max-age=300')` sur les routes profil et `public, max-age=3600, stale-while-revalidate=86400` sur la liste des langues (données statiques).

---

### 3.2 i18n server cache borné [Web]

**Fichier** : `apps/web/lib/i18n-server.ts:58`

**Solution** : Remplacer le `Map` non borné par une structure LRU avec max 50 entrées (4 locales × ~12 namespaces = 48 max).

```typescript
import { LRUCache } from '@/lib/lru-cache';
const translationsCache = new LRUCache<string, Record<string, unknown>>(50);
```

---

## Ordre d'exécution

```
Phase 1.1 → StatusHandler typing cache     (gateway, ~30min)
Phase 1.2 → Tone.js dynamic import         (web, ~45min)
Phase 2.1 → Focus debounce                 (web, ~20min)
Phase 2.2 → loadUserStats stale fix        (iOS, ~15min)
Phase 3.1 → Cache-Control user/lang routes (gateway, ~20min)
Phase 3.2 → i18n LRU server cache          (web, ~10min)
```

**Total estimé** : ~2h30

---

## Critères de validation

- [ ] `pnpm test` vert (gateway + web)
- [ ] `./apps/ios/meeshy.sh test` vert
- [ ] Bundle analyzer : Tone.js absent du chunk initial
- [ ] Logs gateway : 0 `prisma.user.findUnique` pendant frappe continue (cache hit)
- [ ] Aucune régression sur les events Socket.IO (typing visible)
- [ ] iOS : stats profil affichées immédiatement sur visite répétée
