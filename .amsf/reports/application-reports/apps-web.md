# apps/web — `@meeshy/web` 2.32.1

**Rôle** : application web et PWA (Vite + Preact), et coque Capacitor Android `me.meeshy.webapp` (hors service depuis #13619).

| | |
|---|---|
| Entrée | `index.html` / `src` ; image `isopen/meeshy-webapp` (nginx) |
| Dépend de | `@meeshy/shared` (son `dist/`, à construire avant), `@meeshy/design-tokens` ; wasm libsignal committé |
| Consomme | chemins d'API générés (`@meeshy/shared/api/endpoints/*`), événements socket partagés ; `check-web-api-literals.mjs` interdit un `/api/v1/…` écrit à la main |
| Sécurité | jetons en `localStorage` (assumé), état E2EE en IndexedDB sous verrou, CSP servie par nginx et vérifiée (`check:csp`, `check:csp-hashes`) |
| Tests | `bun test` + happy-dom, 2 741 fichiers ; gardes navigateur Playwright en CI |

## Vérification (2026-11-28)
Typage PASS · build PASS · tests **35 637 / 35 638** ; le rouge (`act-leak-guard`) passe sous le bun épinglé 1.3.14 (B19).
Les gardes navigateur (Playwright) et les ≈ 110 `check:*` n'ont pas été rejoués ici : NOT VERIFIED localement, PASS dans le run CI 46071858083.

Aucun changement de source dans cette session ; consommateur de `packages/shared` revalidé après #20759 (typage et build).

## Risques restants
B17 (la chaîne `gate` n'est pas comparée à ce que la CI joue), B18 (`dompurify` 3.4.11), B19.
