# Iteration 129 — Analyse d'optimisation (2026-07-07)

## Protocole (démarrage)
`main` @ `a2a030f` (dernier merge PR #1638). Branche `claude/brave-archimedes-g2yvdr` recréée depuis
`origin/main`. Numérotation : docs `main` jusqu'à **128** → ce cycle prend **129**.

PR ouvertes au démarrage (strictement évitées) : uniquement dependabot (#1549/#1542/#1539/#1536/#1532).
Aucune PR humaine ouverte. Cible retenue **F89 (variante web)** — item de backlog explicitement queué
par l'itération 123 : la déduplication des traductions par langue dans
`apps/web/hooks/use-message-translations.ts` est **ordre-dépendante** et peut **rétrograder** une
traduction premium en basic.

## Cible : F89 (web) — dedup de traductions ordre-dépendant, la récence l'emporte sur la qualité

### Current state
`apps/web/hooks/use-message-translations.ts` (`processMessageWithTranslations`, l.124-149) déduplique les
`message.translations` par langue dans une `Map<string, BubbleTranslation>`. Pour chaque traduction
candidate d'une langue déjà présente, la décision de remplacement était :

```ts
const shouldReplace = !existingTranslation ||
  currentTimestamp > new Date(existingTranslation.timestamp) ||
  (t.translationModel === 'premium' && existingTranslation.confidence < 0.95);
```

### Problems identified
La clause `currentTimestamp > existing.timestamp` est évaluée **avant** toute considération de qualité et
prime via l'opérateur `||`. Conséquence : une traduction **basic plus récente** écrase une traduction
**premium plus ancienne** de la même langue.

```
translations = [
  { fr, 'Bonjour (premium)', model=premium, createdAt=2024-01-01 },  // older
  { fr, 'Bonjour (basic)',   model=basic,   createdAt=2024-01-02 },  // newer
]
→ affichage : 'Bonjour (basic)'   ❌ rétrogradation premium → basic
```

La garde premium existante (clause 3) est **asymétrique** : elle ne protège la qualité que lorsque la
**nouvelle** traduction est premium (upgrade) ; elle n'empêche jamais une nouvelle basic/medium de
**downgrader** une premium déjà retenue, car la clause récence la court-circuite.

### Root cause
Le critère de tri mélange deux dimensions orthogonales (récence, qualité de modèle) dans une disjonction
plate où la récence est prioritaire. Or, pour une même langue, l'invariant produit du Prisme est
**« montrer la meilleure traduction disponible »** — la qualité du modèle doit primer, la récence ne
départageant que les ex æquo de qualité.

### Business impact
Un utilisateur voit une traduction de moindre qualité (basic/medium) alors qu'une premium existe pour
sa langue préférée — friction linguistique silencieuse, contraire à la promesse du Prisme (« le contenu
traduit s'affiche comme du contenu natif »). Reachability réelle : le pipeline peut ré-émettre une
traduction basic après une premium (re-traduction cache-miss, progressive multi-langue, fallback modèle)
→ la premium retenue est écrasée à la volée côté client.

### Technical impact
- Incohérence entre le test `should prefer premium translations over basic ones` (qui ne couvre que
  l'ordre basic→premium, timestamps égaux) et le comportement réel dans l'ordre inverse.
- Le champ `confidence` était utilisé comme proxy de qualité (`< 0.95`) là où le modèle est la source
  de vérité canonique (`TranslationModel = 'basic' | 'medium' | 'premium'`, ordre total explicite).

### Risk assessment
Minimal. Fonction pure de projection ; changement localisé au prédicat de dedup. Tous les cas existants
restent verts :
- « deduplicate by language » (2× sans modèle) → même rang qualité → la récente gagne (inchangé).
- « prefer premium over basic » (basic puis premium) → premium a un rang supérieur → gagne (inchangé).

### Proposed improvement
Remplacer la disjonction plate par un ordre lexicographique **(qualité de modèle, puis timestamp)** :

```ts
const rankOf = (model?: TranslationModel) =>
  model === 'premium' ? 3 : model === 'medium' ? 2 : model === 'basic' ? 1 : 0;
const currentRank = rankOf(t.translationModel);
const existingRank = existing ? rankOf(existing.translationModel) : -1;
const shouldReplace = !existing ||
  currentRank > existingRank ||
  (currentRank === existingRank && currentTimestamp > new Date(existing.timestamp));
```

- Rang supérieur → remplace quelle que soit la date (premium bat basic récent).
- Rang égal → la plus récente gagne (préserve le comportement de dedup temporel intra-tier).
- Rang inférieur → jamais de remplacement (premium retenue protégée).

### Expected benefits
- Le Prisme montre toujours la meilleure traduction disponible par langue, indépendamment de l'ordre
  d'arrivée / des timestamps.
- Suppression du proxy `confidence < 0.95` au profit de l'ordre total canonique du modèle → logique
  auto-documentée, alignée sur `TranslationModel`.

### Implementation complexity
Faible — 1 fichier de production (prédicat + helper local), 1 fichier de test (2 cas de régression).

### Validation criteria
- RED prouvé : le cas premium-ancien / basic-récent affiche `basic` avant fix, `premium` après.
- Suite `use-message-translations.test.tsx` intégralement verte (cas dedup existants inchangés).
- Zéro changement de comportement pour : dedup intra-tier (récence), upgrade basic→premium.
