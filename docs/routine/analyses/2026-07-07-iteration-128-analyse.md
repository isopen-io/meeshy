# Iteration 128 — Analyse d'optimisation (2026-07-07)

## Protocole (démarrage)
`main` @ `ec73d65` (dernier merge PR #1631). Branche `claude/brave-archimedes-5s8fs4` recréée depuis
`origin/main`. Numérotation : docs `main` jusqu'à **127** → ce cycle prend **128**.

PR ouvertes au démarrage (strictement évitées) : #1634 (gateway/location membership), #1633 (android
draft reply-ref), dependabot (#1549/#1542/#1539/#1536/#1532). Cible retenue **F88**, backlog explicitement
queué par l'itération 127 — clamp défensif de `truncateFilename`. Disjointe de toute PR ouverte.

## Écartés cette session (non-bugs vérifiés)
Avant de retenir F88, deux candidats du backlog ont été instruits et **réfutés** :

- **F92** (`hasLinks` / `isTrackingLink` / `extractTrackingToken` — état `lastIndex` d'une regex `g`
  partagée). Réfuté : chacune de ces fonctions **reconstruit** une regex fraîche à chaque appel
  (`new RegExp(URL_REGEX.source, 'gi')` en portée locale, `link-parser.ts:328/336/344`) — `lastIndex`
  repart de 0 à chaque invocation, aucun faux négatif possible sur appels répétés.
- **Classe « regex `g` module-level réutilisée avec `.test()`/`.exec()` »** balayée sur `apps/web`
  (`lib`, `utils`, `services/markdown`) : toutes les instances `g` module-level (`MENTION_DISPLAY_REGEX`,
  `MEESHY_URL_PATTERN`) ne sont consommées que par `.replace()` (qui réinitialise `lastIndex`) ; tous les
  `.exec()` de `patterns.ts` (`EMOJI_PATTERN`, `HEADING_PATTERN`, `TASK_LIST_PATTERN`,
  `INDENTATION_PATTERN`, …) portent sur des patterns **sans** flag `g` (`^…`, ancrés) → `.exec()` repart
  toujours de 0. Aucune dette d'état réelle. La codebase est déjà défendue sur cette classe.

## Cible : `truncateFilename` — dépassement de `maxLength` sous petit budget (F88)

### Current state
`apps/web/utils/truncate.ts` — `truncateFilename(filename, maxLength=32)` tronque un nom de fichier en
préservant l'extension. Sa docstring et ses tests existants garantissent que **« the result never exceeds
maxLength »**. Deux branches produisent une ellipse `head(budget) = filename.slice(0, max(1, budget)) + '...'`.

### Problems identified
Pour `maxLength < 4`, **les deux branches** violent l'invariant documenté :

```
truncateFilename('abcdef', 3) → 'a...'  (len 4 > 3)   overflow
truncateFilename('a.pdf',  3) → 'a...'  (len 4 > 3)   overflow
truncateFilename('abcdef', 1) → 'a...'  (len 4 > 1)   overflow ×3
```

Cause : `head(maxLength - 3)` avec `Math.max(1, budget)` force ≥1 caractère de contenu, puis appose
`'...'` (3 car.) → plancher structurel de **4 caractères**, quel que soit `maxLength`. Une ellipse
`x...` a besoin d'au moins 1 car. de contenu + 3 car. d'ellipse = 4 ; sous ce seuil aucune forme
ellipsée ne peut respecter `maxLength`.

### Root cause
Aucune garde n'existe pour le régime `maxLength ≤ 3` où l'ellipse est structurellement impossible à
loger. Le code suppose implicitement `maxLength ≥ 4` sans le documenter ni le défendre.

### Business / Technical impact
- **Runtime** : nul aujourd'hui — les 2 seuls appelants (`MarkdownViewer.tsx`, `PDFViewerWrapper.tsx`)
  utilisent le défaut `maxLength = 32`. Dette **latente/défensive** : tout futur appelant passant un
  budget serré (colonne étroite, badge) reçoit une chaîne plus longue que demandée → débordement de
  layout silencieux.
- **Qualité** : la fonction viole son propre invariant documenté et testé — piège pour un futur
  refactoring ou une réutilisation. Violation du principe projet *« code should be self-documenting »*
  (contrat implicite non défendu).

### Risk assessment
Minimal. Le fix ajoute une garde **antérieure** au chemin existant ; pour tout `maxLength ≥ 4` (dont le
défaut 32 et tous les cas de test préexistants `max ∈ {8,12,16,20,32}`) le comportement est **strictement
inchangé**. Zéro appelant en production n'atteint la branche modifiée.

### Proposed improvements (implémenté ce cycle)
`truncate.ts` : garde précoce après le court-circuit `filename.length <= maxLength` —

```ts
if (maxLength <= 3) return filename.slice(0, Math.max(0, maxLength));
```

Dégradation gracieuse : sous le budget minimal d'une ellipse, retour à une troncature nue bornée par
`maxLength` (et `Math.max(0, …)` neutralise un `maxLength` négatif → `''`).

### Expected benefits
- Invariant *« never exceeds maxLength »* désormais **total** (tous budgets ≥ 0).
- Robustesse défensive pour réutilisations futures à budget serré.

### Implementation complexity
Triviale : +1 ligne de production, garde pure sans état.

### Validation criteria
- [x] Repro empirique du débordement (node) sur `maxLength ∈ {1,2,3}`, avec et sans extension.
- [x] TDD RED confirmé : 2 tests échouent sans le fix (`git stash` du seul fichier source), 10/10 verts
      avec — `truncate.test.ts`.
- [x] `__tests__/utils` : **925/925 tests** verts (35/36 suites ; l'unique échec `user-language-
      preferences.test.ts` est une erreur de résolution de module préexistante liée à `@meeshy/shared`
      non-buildé, sans rapport avec `truncate.ts` qui n'importe rien de partagé).
- [x] Aucun appelant production affecté (défaut `maxLength = 32`).

## Leçon (à retenir)
Un backlog item marqué « MINOR/défensif » mérite d'être **vérifié empiriquement** (repro node) avant fix,
et distingué d'un candidat réfutable (F92) : ici le débordement est réel et falsifiable, mais son impact
runtime est nul faute d'appelant à budget serré — corriger pour l'invariant et la robustesse future, pas
pour un bug de production actif. Toujours instruire les non-bugs voisins (classe regex `g` module-level)
pour ne pas re-brûler un futur cycle sur une piste déjà défendue.

## Future improvements (backlog)
- **F92 (RÉFUTÉ ce cycle)** — retirer du backlog : regex reconstruite à chaque appel, aucun état partagé.
- **F93 (QUALITÉ, nouveau)** : `truncateText` (`truncate.ts:36`) appose `'...'` après `slice(0, maxLength)`
  → sortie de longueur `maxLength + 3` (contrat « maxLength car. de contenu + ellipse », distinct de
  `truncateFilename`). Documenter explicitement cette différence de contrat dans la docstring pour éviter
  toute confusion d'appelant, ou aligner si un appelant à budget serré apparaît.
