# Iteration 127 — Analyse d'optimisation (2026-07-07)

## Protocole (démarrage)
`main` @ `119ccd8` (dernier merge PR #1625). Branche `claude/brave-archimedes-aj9bl5` recréée depuis
`origin/main`. Numérotation : docs `main` jusqu'à **126** → ce cycle prend **127**.

PR ouvertes au démarrage (strictement évitées) : #1630 (android draft), #1629 (gateway read-status
batch), dépendabot (#1549/#1542/#1539/#1536/#1532). Cible retenue **F91**, backlog explicitement queué
par l'itération 126 — couverture directe de `parseMessageLinks`. Disjointe de toute PR ouverte.

## Cible : `parseMessageLinks` — cœur de détection de liens web, aucun test direct

### Current state
`parseMessageLinks` (`apps/web/lib/utils/link-parser.ts`) segmente **chaque message texte** en parts
typées (`text` / `url` / `tracking-link` / `mshy-link`). Il encode trois regex et une logique de
priorité non triviale :

1. **Priorité mshy > tracking > url** via dédoublonnage par `match.index` (un lien détecté par
   plusieurs regex n'est conservé qu'une fois, dans le type prioritaire).
2. **Tri par position** : les regex tournent dans l'ordre mshy → tracking → url, puis les matches
   sont retriés par `index` — l'ordre source ≠ l'ordre de sortie.
3. **Reconstruction sans perte** : l'union des `content` doit reformer le message exact (intervalles
   `[start,end]` contigus).

Après l'itération 126, seul le comportement **indirect** via `preprocessContent` (uniquement le chemin
`m+TOKEN`) était couvert. Les chemins `tracking-link`, `url`, le tri, la priorité et l'invariant de
reconstruction n'avaient **aucun test** :

```
grep -rn "parseMessageLinks" apps/web --include="*.test.*"  → 0 test dédié
```

### Problems / Root cause
1. **Zéro garde directe** : une régression sur `URL_REGEX`, `TRACKING_LINK_REGEX`, `MSHY_SHORT_REGEX`,
   sur l'ordre de dédoublonnage ou sur le calcul `start/end` casserait le rendu de tous les messages
   sans faire tomber un test.
2. **Comportements subtils non documentés** : contrainte de longueur de token (2–50), frontière de mot
   `\bm\+`, priorité tracking > url sur domaine arbitraire — invisibles sans test exécutable.

### Business / Technical impact
`parseMessageLinks` est sur le chemin de rendu de **tout** message et alimente `preprocessContent`,
`replaceLinksWithTracking` et le rendu des liens cliquables. Violation des principes projet :
*« Test through public API exclusively »*, *« 100% coverage through business behavior »*,
*« Single Source of Truth »*.

### Risk assessment
Nul côté production : **ajout de test uniquement**, aucune ligne de production touchée. Les assertions
capturent le comportement **réel observé** (exécuté contre la vraie fonction en env `jsdom`), pas un
comportement supposé — elles gèlent l'existant sans le modifier.

### Proposed improvements (implémenté ce cycle)
Nouveau `apps/web/__tests__/lib/link-parser.test.ts` — **14 cas** exécutant la vraie fonction :
- texte simple + chaîne vide (part texte pleine largeur) ;
- `m+TOKEN` seul / enrobé / multiple, token trop court ignoré, frontière de mot `\bm\+` ;
- lien de tracking typé `tracking-link` (pas `url`) sur `meeshy.me` **et** domaine arbitraire ;
- URL nue typée `url` avec `originalUrl` ;
- tri par position quand l'ordre des regex diffère de l'ordre source ;
- coexistence tracking + mshy correctement typée ;
- **invariant de reconstruction** (concat des `content` == message) ;
- **invariant d'intervalles** contigus et croissants (`start`/`end`).

### Validation criteria
- [x] `link-parser.test.ts` : **14 pass / 0 fail** (`node_modules/.bin/jest`, env `jsdom`).
- [x] Dossier `__tests__/lib/` complet : **30 suites / 784 pass / 2 skipped** — aucune régression.
- [x] Aucune modification de production ; `bun.lock` restauré (parité `origin/main`).

### Leçon (à retenir)
Une fonction pure sur le chemin critique de rendu mais importée par un composant mocké se teste
**directement** (import du module), pas via le composant. Les invariants (reconstruction sans perte,
intervalles contigus) sont des tests plus robustes que l'énumération de cas car ils survivent aux
refactorings internes.

## Future improvements (backlog)
- **F88 (MINOR)** : `truncateFilename` dépasse `maxLength` de ≥1 pour `maxLength < 4` — clamp défensif
  + cas de test `maxLength ∈ {1,2,3}`.
- **F92 (QUALITÉ, nouveau)** : `hasLinks` / `isTrackingLink` / `extractTrackingToken` réutilisent
  `.test()`/`.match()` sur des regex `g` mutables (state `lastIndex`) — vérifier l'absence de faux
  négatifs sur appels répétés et couvrir par test dédié.
