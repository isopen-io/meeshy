# Iteration 125 — Analyse d'optimisation (2026-07-07)

## Protocole (démarrage)
`main` @ `b777f2e3` (après merge de l'itération 123, PR #1590). Branche `claude/brave-archimedes-0q7usv`
recréée depuis `origin/main`. Numérotation : docs `main` jusqu'à **124** (une itération 124 concurrente sur `use-message-translations` a été mergée) → ce cycle prend **125**.

Cible retenue : **F89**, backlog explicitement queué par l'itération 123 — intégrité de test dans le
rendu markdown web. Strictement disjointe des PR ouvertes (gateway realtime, calls, android chat).

## Cible : `normalizeMarkdown` — le test valide une copie locale qui a dérivé de la production

### Current state (le test ne garde plus rien)
`apps/web/components/messages/__tests__/normalizeMarkdown.test.ts` **recréait** une copie locale de
`normalizeMarkdown` (docstring d'origine : *« vous devrez l'exporter depuis MarkdownMessage.tsx »*).
Cause structurelle : `jest.config.js` **mocke** `@/components/messages/MarkdownMessage` pour éviter les
soucis ESM de `react-markdown` — importer la vraie fonction depuis le composant était donc impossible,
d'où la copie.

### Problems / Root cause
La copie de test a **dérivé** du code réel : elle ne convertissait **pas** les `\n` simples en `<br/>`,
alors que la production le fait (MarkdownMessage.tsx, étape « Convertir les \n simples restants en
<br/> pour la messagerie »). Résultat : le test affirmait `'a\nb\nc'` → `'a\nb\nc'` (inchangé), tandis
que la production rend `'a<br/>b<br/>c'`. **36 tests verts garantissaient une fonction morte** — aucune
régression de `normalizeMarkdown` (rendu de CHAQUE message texte : line breaks, headers, HR, code
blocks, espaces insécables autour de `**`/`_`/`` ` ``, liens) n'était détectable.

### Business / Technical impact
`normalizeMarkdown` prétraite **tout** message markdown avant `ReactMarkdown`. Une régression y casse
le rendu de tous les messages, sans qu'aucun test ne tombe. Violation directe des principes projet :
*« Test through public API exclusively »*, *« use real schemas/types in tests, never redefine them »*,
*« Single Source of Truth »*.

### Risk assessment
Faible. L'extraction est **behavior-preserving** : la fonction déplacée est purement textuelle (zéro
import). Vérifiée **byte-identique** à la production sur 39 entrées variées (tous les cas du test + HR,
headers, code blocks yaml/mermaid, mixes CRLF/CR/LF, listes, emphase). Seules **3 attentes obsolètes**
du test (préservation des `\n` simples) ont été réalignées sur le comportement réel (`\n` → `<br/>`).

### Proposed improvements (implémenté ce cycle)
1. Extraction de `normalizeMarkdown` dans un **module pur sans dépendance**
   `apps/web/components/messages/normalize-markdown.ts` (aucun import `react-markdown` → aucun souci
   ESM sous Jest, et **hors** du chemin mocké).
2. `MarkdownMessage.tsx` importe désormais la fonction (suppression de la définition inline, −159 l.).
3. Le test importe la **vraie** fonction (suppression de la copie locale, −68 l.) et réaligne les 3
   attentes obsolètes sur la production (`\n` → `<br/>`, sans `\r` résiduel).

### Validation criteria
- [x] Équivalence production ↔ module extrait : **byte-identique sur 39 entrées** (bun, source TS réelle,
      référence sliced byte-exact depuis `MarkdownMessage.tsx` avec ` `).
- [x] Suite complète `normalizeMarkdown.test.ts` : **36 pass / 0 fail, 72 assertions** exécutées via
      `bun test` contre le module extrait (les 33 non modifiées + les 3 réalignées).
- [x] Aucune référence résiduelle à la copie inline ; `MarkdownMessage` toujours exporté (API publique
      inchangée) ; accolades/parenthèses équilibrées.
- [x] Le mock Jest `__mocks__/components/messages/MarkdownMessage.tsx` reste valable (il mocke le
      composant, pas le module pur — les autres tests de composants ne sont pas affectés).

### Leçon (à retenir)
Quand un composant est mocké par Jest (ESM), **extraire la logique pure dans un module dédié** est la
seule façon de la tester réellement. Une fonction « recréée localement » dans un test est une bombe à
retardement : elle passe au vert en gardant une copie morte pendant que la production dérive.

## Future improvements (backlog)
- **F87 (LOW)** : `SecuritySanitizer.sanitizeMongoQuery` plus permissif que `sanitizeJSON`
  (`constructor`/`__proto__` non filtrés) — unifier le garde de clés dangereuses.
- **F88 (MINOR)** : `truncateFilename` dépasse `maxLength` de 1 pour `maxLength < 4` (call-sites ≥ 32) —
  clamp défensif.
- **F90 (QUALITÉ, nouveau)** : `preprocessContent` (MarkdownMessage.tsx) reste inline et non testé ; il
  dépend de `parseMessageLinks` (`@/lib/utils/link-parser`). Extraction/couverture possible dans un
  second temps si `link-parser` est lui-même pur.
