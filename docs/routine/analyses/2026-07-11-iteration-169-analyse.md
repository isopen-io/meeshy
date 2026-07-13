# Iteration 169 — Analyse d'optimisation (2026-07-11)

## Protocole (démarrage)
`main` @ `02fc694` (dernier merge : PR #1874 — android/settings media cache management).
Branche `claude/brave-archimedes-gqhh2c` réinitialisée sur `origin/main` (0/0). Ce cycle prend **169**.

PRs ouvertes (périmètres à ne pas toucher) : #1873 (web realtime orchestrator timers —
`services/socketio/orchestrator.service.ts`), #1842 (dependabot build-tools). Aucune ne touche
`apps/web/hooks/queries/use-comment-mutations.ts` / `use-post-mutations.ts`.

Candidat consigné par l'itération 167 (backlog web, non pris à l'époque), repris ici :
**les mutations optimistes de retrait de réaction laissent une entrée résiduelle
`{ [emoji]: 0 }`.** L'itération 168 (TranslationToggle réactif) est mergée sur `main`.

---

## Cible retenue : F128 — `useUnlikeCommentMutation` / `useUnlikePostMutation` laissent un `reactionSummary` résiduel `{ [emoji]: 0 }` → chip « 0 » fantôme, divergence avec le chemin socket autoritatif

### Current state
`apps/web/hooks/queries/use-comment-mutations.ts:279` (retrait de réaction commentaire) et son
miroir `apps/web/hooks/queries/use-post-mutations.ts:374` (retrait de réaction post) construisent
le `reactionSummary` optimiste ainsi :

```ts
reactionSummary: {
  ...c.reactionSummary,
  [emoji]: Math.max(0, ((c.reactionSummary ?? {})[emoji] ?? 1) - 1),
},
```

L'emoji retiré est **toujours ré-écrit** dans le summary, même quand son compte tombe à `0`.

### Problems identified
1. **Chip « 0 » fantôme.** Les rendus du feed/détail itèrent *toutes* les clés du summary :
   `PostCard.tsx:131` — `hasReactions = reactionSummary && Object.keys(reactionSummary).length > 0`
   puis `PostCard.tsx:272` — `Object.entries(reactionSummary).map(([emoji, count]) => …)`.
   Idem `PostDetail.tsx:117,223`. Une entrée `{ '❤️': 0 }` rend donc `hasReactions` vrai et
   affiche une pastille de réaction portant le compte `0` — exactement dans le flux le plus
   courant : l'utilisateur retire son propre like (`{ '❤️': 1 }` → `{ '❤️': 0 }`).
2. **`?? 1` incorrect pour un emoji absent.** Si l'emoji n'est pas dans le summary,
   `(summary[emoji] ?? 1) - 1 = 0` → une clé `{ [emoji]: 0 }` est *créée de toutes pièces*,
   introduisant une pastille « 0 » là où il n'y avait aucune réaction.

### Root cause
La branche optimiste ne réplique pas l'invariant « supprimer la clé quand le compte atteint 0 »
que le chemin **socket autoritatif** applique déjà : `use-post-socket-cache-sync.ts:270-271` et
`:318-319` font `if (count === 0) delete newSummary[emoji]`. Les deux chemins divergent : la
réconciliation serveur nettoie la clé, l'optimiste la laisse à `0`. Tant qu'aucun refetch/sync
n'écrase l'état optimiste, le chip « 0 » persiste à l'écran.

### Business impact
**Priorité 1 — feature récente (feed social / stories / réactions).** Défaut visuel immédiat et
fréquent (chaque retrait de like), en contradiction avec la promesse d'un feedback optimiste
« instantané et correct » (Instant App Principles → Optimistic Updates). Le Prisme n'est pas
concerné ; il s'agit d'un défaut de rendu réactif des réactions.

### Technical impact
Aucune donnée corrompue côté serveur ; divergence purement client entre la mutation optimiste et
la source de vérité socket. Deux implémentations *dupliquées* de la logique de décrément (aucune
source unique) → risque de re-divergence future.

### Risk assessment
Faible. Extraction d'un helper pur + substitution dans deux chemins isolés (`onMutate`). Contrats
de mutation inchangés (mêmes events socket, mêmes rollbacks). Le test existant
`use-post-mutations.test.tsx:990` (`{ '❤️': 3 }` → `2`, compte > 0) reste vert car le helper ne
modifie que le cas compte ≤ 0.

### Proposed improvements
Créer une **source unique** pure `apps/web/lib/reaction-summary.ts` :

```ts
export function decrementReactionSummary(summary, emoji) {
  const next = { ...(summary ?? {}) };
  const count = (next[emoji] ?? 0) - 1;
  if (count > 0) next[emoji] = count; else delete next[emoji];
  return next;
}
```

- `?? 0` (et non `?? 1`) : un emoji absent → `count = -1` → `delete` (no-op), plus aucune clé
  résiduelle.
- Compte ≤ 0 → clé supprimée, alignée sur le chemin socket autoritatif.
- Utilisé dans les deux `onMutate` (commentaire + post).

### Expected benefits
- Plus de chip « 0 » fantôme au retrait d'un like.
- Convergence optimiste ↔ socket : le rendu optimiste correspond à l'état serveur réconcilié.
- Source unique de la règle de décrément (Single Source of Truth) → suppression de la
  duplication entre les deux fichiers de mutation.

### Implementation complexity
Faible (~25 lignes prod : 1 helper + 2 substitutions). TDD : unit tests du helper + tests de
régression « residual-zero » sur les deux mutations.

### Validation criteria
- RED confirmé : 7 tests échouent contre l'ancienne logique `?? 1` (helper + régressions
  mutations).
- GREEN : `reaction-summary.test.ts` + `use-comment-mutations.test.tsx` +
  `use-post-mutations.test.tsx` → 61/61 verts.
- `tsc --noEmit` propre sur les fichiers touchés (erreurs restantes = pré-existantes,
  fichiers `__tests__/admin/*` non touchés).
- Contrat de mutation et rollbacks inchangés pour tous les autres cas.

## Backlog reporté (candidats futurs, non pris ce cycle)
- **web** — Reels comment overlay : `CommentList` rendu sans `likedCommentIds`, `CommentItem`
  décide like/unlike du seul prop `isLiked` (défaut vide) → `likeCount + 1` inconditionnel,
  re-like infini. (`ReelsFeedScreen.tsx:251`, `use-comment-mutations.ts:207`). Plus impactant
  mais touche plusieurs composants — bon candidat prochain cycle.
