# Iteration 123 — Analyse d'optimisation (2026-07-06)

## Protocole (démarrage)
`main` @ `33b29f50`, working tree propre. Branche `claude/brave-archimedes-0q7usv` (re)créée depuis
`origin/main`. Numérotation : docs `main` jusqu'à **122** → ce cycle prend **123**.

PR ouvertes au démarrage (disjointes de la cible) : #1585/#1588 (gateway realtime notification room),
#1586 (gateway call force-leave), #1587 (android chat delivery), + bumps dependabot. Cible retenue
**strictement disjointe** : le domaine web « stories/status » (`expiresAt`) et le helper partagé
`time-remaining`, non touchés par les itérations récentes (gateway/shared helpers, TTS, android chat).

## Revue d'ingénierie (constat de démarrage)
Revue adversariale des modules purs peu récemment revisités (`packages/shared/utils/`,
`apps/web/utils/`). Deux écarts concrets et liés ont été identifiés dans le domaine « temps restant
avant expiration » (compte à rebours des stories/statuts, TTL 24 h) :

1. **Bug de correction UX** (`formatTimeRemaining`, version partagée).
2. **Doublon mort divergent** (`formatTimeRemaining`, copie web) — porteur du **même** bug, jamais
   consommé en production.

## Cible 1 : `formatTimeRemaining` affiche « 0m » dans la dernière minute avant expiration

### Current state
`packages/shared/utils/time-remaining.ts` — pour un reste strictement positif mais **sous la minute**
(`0 < diff < 60 s`) :
```ts
const minutes = Math.floor(diffMs / 60_000); // = 0
...
return `${minutes}m`;                          // → "0m"
```
Le contrat du module réserve pourtant le **zéro** à la sémantique « déjà expiré » (`diff <= 0` →
`null`, l'appelant rend « Expiré »). Un compte à rebours **vivant** ne devrait jamais afficher `0m`.

### Problems / Root cause
`Math.floor` d'un reste sous-minute vaut `0`. Cet état est atteint par **CHAQUE** story/statut pendant
sa dernière minute d'existence (TTL 24 h). Les 3 call-sites web rendent la chaîne telle quelle :
- `components/v2/StatusBar.tsx:40` → `formatTimeRemaining(...) ?? 'Expire'` (affiche « 0m »).
- `components/v2/StoryViewer.tsx:987` → `<span>{remaining}</span>` (affiche « 0m »).
- `lib/story-transforms.ts:365` → `timeRemaining()` (propage « 0m »).

### Business / Technical impact
UX trompeuse et systématique : « 0m » suggère « expiré » alors qu'il reste ~59 s. Bug invisible en
tests (les cas existants démarraient à `+1 min` — la frontière sous-minute n'était pas couverte).

### Risk assessment
Très faible. Les 3 appelants affichent la chaîne comme texte pur (aucun parsing numérique). Le clamp
n'affecte que la branche `minutes === 0` ; toutes les frontières existantes (`+1m`, `+59m`,
`+60m-1 → 59m`, `+60m → 1h`) restent identiques (vérifié).

### Proposed improvement (implémenté)
Clamp du reste sous-minute vers la plus petite unité restante :
```ts
return `${Math.max(1, minutes)}m`;
```
`minutes === 0` (0 < diff < 60 s) → `"1m"` ; `minutes ∈ [1..59]` inchangé. `null` reste l'unique
sémantique du zéro (expiré).

## Cible 2 : doublon mort `apps/web/utils/time-remaining.ts::formatTimeRemaining`

### Current state / Root cause
Une **seconde** implémentation de `formatTimeRemaining` (signature élargie `Date|string|number`)
vivait dans `apps/web/utils/time-remaining.ts`. Preuve qu'elle est morte : **aucun** import de
production ne la référence (les 3 call-sites importent la version **partagée** via
`@meeshy/shared/utils/time-remaining`) ; seul son propre test la consommait. Elle a **silencieusement
dérivé** — le clamp « jamais 0m » n'y aurait jamais été répercuté, un futur refactor risquant de
recopier le mauvais comportement.

### Proposed improvement (implémenté)
Suppression de la copie morte (on conserve `isExpired`, lui **bien vivant** : 6 importeurs de
production). Le formatage « temps restant » vit désormais **exclusivement** dans le package partagé
(single source of truth). Test web retaillé sur `isExpired` uniquement.

### Validation criteria
- [x] `formatTimeRemaining` (partagé) — 16 assertions ré-exécutées via `bun` (source TS directe) :
      les 3 nouveaux cas sous-minute (`+1ms`, `+30s`, `+MIN-1` → `"1m"`) **et** tous les cas existants
      (null/expiré, `+1m`, `+30m`, `+59m`, `+60m-1 → 59m`, `+60m → 1h`, `+90m`, `+23h59m`, `+1h`, `+2h`,
      `+24h`) → **16/16 PASS**, zéro régression.
- [x] `isExpired` (web) — 10 assertions ré-exécutées via `bun` → **10/10 PASS** ; export
      `formatTimeRemaining` confirmé **absent** du module web (`'formatTimeRemaining' in mod === false`).
- [x] Recherche full-repo : plus aucun importeur (prod ou test) de la copie web supprimée ; aucun
      barrel ne la ré-exporte.
- [x] Test partagé enrichi d'un cas frontière sous-minute (`packages/shared/__tests__/utils/time-remaining.test.ts`).

### Leçon (à retenir)
Un `Math.floor` de durée réserve `0` à « moins d'une unité restante » — à distinguer explicitement de
« expiré » (`null`). Toute paire de fonctions « source unique » dupliquée entre package partagé et app
**dérive** dès qu'un fix ne touche qu'une copie ; supprimer la copie morte au lieu de la maintenir.

## Future improvements (backlog, non traité ce cycle)
- **F89 (QUALITÉ)** : `apps/web/components/messages/MarkdownMessage.tsx` — le test
  `__tests__/normalizeMarkdown.test.ts` **recrée** localement une copie de `normalizeMarkdown` (le
  composant est mocké par jest pour éviter les soucis ESM de `react-markdown`). Cette copie a **dérivé**
  de la production (elle ne convertit pas les `\n` simples en `<br/>`, contrairement à la version réelle
  lignes 160-166) → le test ne garde plus rien. Fix élégant : extraire `normalizeMarkdown` dans un module
  **pur sans dépendance** (`normalize-markdown.ts`) importé par le composant ET le test, et réaligner les
  ~3 attentes obsolètes sur le comportement réel. ~70 lignes de doublon éliminées + couverture restaurée.
- **F87 (LOW, report iter 122)** : `SecuritySanitizer.sanitizeMongoQuery` plus permissif que
  `sanitizeJSON` (ne filtre pas `constructor`/`__proto__`). Unifier sur le même garde de clés.
- **F88 (MINOR, report iter 122)** : `truncateFilename` peut dépasser `maxLength` de 1 pour
  `maxLength < 4` (non atteint : call-sites tous ≥ 32) — clamp défensif.
