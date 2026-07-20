# Iteration 168 — Analyse d'optimisation (2026-07-11)

## Protocole (démarrage)
`main` @ `286e25f`. Branche `claude/brave-archimedes-v8y479` réinitialisée sur `origin/main`.
Ce cycle prend **168**.

PRs ouvertes (périmètres à ne pas toucher) : #1870 (android data-export), #1869
(`RedisDeliveryQueue.peek()` + `validation.ts` pagination coercion — gateway + shared),
#1860/#1842 (dependabot). Aucune ne touche `apps/web/components/v2/TranslationToggle.tsx`.

Candidat consigné par l'itération 167 (non pris à l'époque), repris ici : **TranslationToggle
gèle la langue résolue au montage — le Prisme n'est pas réactif.**

---

## Cible retenue : F127 — `TranslationToggle` fige `displayedVersion` au montage → les traductions préférées qui arrivent en asynchrone (`comment:translation-updated` / `post:translation-updated`) ne s'affichent JAMAIS

### Current state
`apps/web/components/v2/TranslationToggle.tsx:59-79`. `displayedVersion` est initialisé par un
initialiseur `useState` **paresseux** (exécuté une seule fois, au montage) :

```ts
const matchingTranslation = userLanguage
  ? translations.find((t) => t.languageCode.toLowerCase().startsWith(userLanguage.toLowerCase()))
  : undefined;

const [displayedVersion, setDisplayedVersion] = useState(() => {
  if (matchingTranslation) { return { ...matchingTranslation, isOriginal: false }; }
  return { languageCode: originalLanguage, ..., content: originalContent, isOriginal: true };
});
```

Après le montage, `displayedVersion` n'est plus jamais recalculé à partir des props. Il ne change
que via `handleSelect` (sélection manuelle dans le menu).

### Problems identified
Le composant est piloté par des props `translations` / `userLanguage` qui **changent après le
montage** :

1. **Arrivée asynchrone de la traduction.** `use-post-socket-cache-sync` applique
   `post:translation-updated` et `comment:translation-updated` au cache React Query
   (`apps/web/__tests__/hooks/queries/use-post-socket-cache-sync.test.tsx:271,756`). Le pipeline
   NLLB complète *après* le premier rendu : le commentaire/post s'affiche d'abord dans sa langue
   originale, puis le cache reçoit la traduction et re-render le `TranslationToggle` avec un
   nouveau prop `translations`. Comme `displayedVersion` est figé, **la traduction préférée
   n'apparaît jamais** — l'utilisateur reste sur l'original tant qu'il n'ouvre pas manuellement le
   menu.
2. **Changement de langue préférée en cours de session.** Si l'utilisateur change sa langue de
   contenu principale (settings) alors que le feed est monté, `userLanguage` change mais le
   contenu affiché ne se re-résout pas.

### Root cause
Un initialiseur `useState` paresseux capture un instantané des props au montage et ne réagit
jamais à leurs mutations ultérieures. Le composant traite une entrée intrinsèquement dynamique
(traductions poussées en temps réel) comme une valeur figée.

### Business impact
**Priorité 1 — feature récente (feed social / stories) + Prisme Linguistique.** Le principe
fondateur du produit (« Automatisme : la résolution de langue préférée est automatique »,
« Transparence : le contenu traduit s'affiche comme du contenu natif ») est cassé sur le chemin
le plus courant : un commentaire posté dans une autre langue reste affiché en VO pour le lecteur,
alors que la traduction existe déjà dans le cache. La friction linguistique que le Prisme promet
d'éliminer réapparaît exactement là où elle devrait disparaître.

### Technical impact
Aucune donnée corrompue ; défaut purement de rendu réactif côté client. Contenu dans
`CommentItem`, `PostCard`, `PostDetail`, `StatusBar` (tous branchés sur le cache temps réel).

### Risk assessment
Faible. Changement isolé à un composant de présentation pur. Le risque principal serait de
**clobber une sélection manuelle** de l'utilisateur (Prisme « Exploration ») en re-synchronisant
aveuglément sur chaque changement de prop. La conception ci-dessous préserve explicitement la
sélection manuelle.

### Proposed improvements
Rendre la résolution réactive **sans écraser l'exploration manuelle** :

- Calculer `autoResolved` (la version préférée) via `useMemo` à partir des props courantes.
- Stocker uniquement la **sélection manuelle** (`{ languageCode, isOriginal }`, pas le contenu)
  dans un state, initialement `null`.
- `displayedVersion = manualSelection ? résolu-depuis-props(manualSelection) : autoResolved`.
  - Tant que l'utilisateur n'a rien choisi → suit l'auto-résolution (réactif à
    `translations`/`userLanguage`).
  - Après un choix manuel → garde la langue choisie, mais **re-dérive le contenu depuis les props
    courantes** (une re-traduction du même langage reste fraîche). Si la langue choisie disparaît
    des props, retombe sur `autoResolved`.

Aucun `useEffect` ; dérivation pure pendant le rendu.

### Expected benefits
- Le Prisme redevient réactif : la traduction préférée apparaît dès qu'elle est poussée.
- La sélection manuelle survit aux re-renders et reste alimentée en contenu frais.
- Suppression du `setDisplayedVersion` figé au profit d'une dérivation pure (moins d'état, plus
  proche du modèle « Single Source of Truth » du CLAUDE.md).

### Implementation complexity
Faible (~30 lignes, un seul fichier). TDD : tests RED sur (a) traduction arrivant après montage,
(b) changement de `userLanguage`, (c) préservation de la sélection manuelle.

### Validation criteria
- Nouveau test : re-render avec `translations` enrichi après montage → le contenu traduit
  s'affiche.
- Nouveau test : re-render avec `userLanguage` changé → re-résolution.
- Nouveau test : après sélection manuelle de l'original, un nouveau prop `translations` ne
  réécrase pas le choix.
- Les 4 tests existants de `translation-toggle.test.tsx` restent verts.
- `bun x jest translation-toggle` vert ; typecheck web OK.
