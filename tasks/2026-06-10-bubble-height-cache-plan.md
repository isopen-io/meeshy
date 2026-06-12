# Plan — Bubble height cache (fix des hitches Layout 885 ms)

> Statut : PLAN À VALIDER. Aucune ligne de code avant accord. Sensible : une
> tentative naïve (cache `Layout` keyé par largeur) a cassé l'alignement du
> listing le 2026-06-10 (revert `d6ba7f958`). Voir leçon
> `feedback_swiftui_layout_cache_recycled_cells`.

## 1. Problème (mesuré, device)

Trace Core Animation iPhone 16 Pro Max (2026-06-10) :
- Phase **Commit saine** : 828 commits, 0 hitch → GPU OK.
- Phase **Layout catastrophique** : 9 hitches >33 ms, **max 885 ms** (app gelée ~0,9 s).
- CPU : `BubbleBodyFooterLayout.sizeThatFits` = self-time n°1 (~1 Md cycles).

Cause : chaque cellule message se **self-size** (UIHostingConfiguration + group
compositional `.estimated(80)`). À l'ouverture / au gros scroll, un lot entier
de bulles mesure son sous-arbre SwiftUI (texte, quoted-reply, footer, grille
média) **dans une seule passe Layout** → le pic 885 ms.

## 2. Principe du fix (correctement, cette fois)

Court-circuiter `BubbleBodyFooterLayout.sizeThatFits` avec une hauteur
**déjà mesurée**, mais keyée par **identité de contenu** — JAMAIS par
largeur/position seule (l'erreur du revert) :

```
clé = (message.id, message.changeVersion, largeurQuantifiée)
valeur = CGSize(width, height)   // la taille rapportée par la mesure complète
```

- `message.id` : différencie les messages (cellule recyclée B ne lit jamais
  l'entrée de A).
- `changeVersion` : invalide automatiquement quand le contenu change (édition,
  traduction arrivée, réaction, attachment enrichi). Déjà O(1) sur MessageRecord.
- `largeurQuantifiée` : `round(width)` (la largeur de cellule est stable ;
  quantifier évite les ratés de clé sur flottants).

## 3. Implémentation proposée (3 petits morceaux)

### 3a. `BubbleHeightCache` (nouveau, @MainActor)
- Store : `[BubbleHeightKey: CGSize]` borné (LRU ou dict + éviction sur
  `UIApplication.didReceiveMemoryWarning`), cap ~2000 entrées.
- API pure testable : `height(for:width:) -> CGSize?`, `store(_:width:size:)`,
  `invalidate(messageId:)`, `removeAll()`.
- @MainActor (le Layout tourne sur le main) → pas de verrou.
- **Pas dans le SDK** : il sert l'orchestration message-list de l'app → app-side
  (`Features/Main/Views/Bubble/`).

### 3b. `BubbleBodyFooterLayout` reçoit la clé
- Ajouter `let cacheKey: BubbleHeightKey?` (nil = pas de cache, ex. previews).
- `sizeThatFits` : si `cacheKey` et hit pour `quantize(proposal.width)` → retourner
  la taille cachée **sans mesurer le sous-arbre**. Sinon : mesurer comme
  l'original (re-mesure systématique, le code restauré) PUIS `store`.
- `placeSubviews` : **inchangé** — re-mesure toujours le contenu courant (c'est
  ce qui garantit la correction ; on ne réutilise PAS un cache pour le
  placement). Le gain est uniquement sur `sizeThatFits` (le coût dominant).
- La clé est fournie par `BubbleStandardLayout` qui connaît le `Message`.

### 3c. Invalidation
- Pas d'invalidation explicite nécessaire dans le cas normal : `changeVersion`
  fait partie de la clé → un message modifié a une nouvelle clé, l'ancienne
  entrée devient orpheline (évincée par LRU).
- Éviction mémoire : `removeAll()` sur memory warning.

## 4. Ce que ça corrige / ne corrige pas

- ✅ **Re-mesures au scroll** (cellules déjà vues qui réapparaissent / se
  recyclent) : hit → 0 mesure de sous-arbre. C'est la majorité du churn `sizeThatFits`.
- ⚠️ **Premier paint d'un lot** (ouverture conversation) : toujours mesuré UNE
  fois (cache froid) → le tout premier 885 ms peut subsister. Si la mesure
  device post-fix le montre encore, étape 2 (déférée) : pré-chauffer le cache
  off-main pour la fenêtre initiale, ou hauteur estimée par heuristique
  (nb lignes texte) pour le premier layout. À décider APRÈS mesure.

## 5. Stratégie de test (non négociable vu la sensibilité)

1. **Unit** : `BubbleHeightCacheTests` — clé inclut changeVersion (bump → miss),
   quantification largeur, éviction, hit/miss. Pur, déterministe.
2. **Correction visuelle device** : ouvrir une conversation riche (quoted-reply,
   média, réactions, traductions), scroller haut/bas plusieurs fois → **aucune
   bulle désalignée / sur-haute** (le bug du revert). C'est le go/no-go.
3. **Perf device** : re-trace Core Animation → la phase Layout doit chuter
   (hitches >33 ms en forte baisse, max bien < 885 ms).
4. Build + suite ConversationViewModel verte (garde-fou non-régression).

## 6. Risque & rollback

- Risque principal : hauteur cachée incorrecte → désalignement (comme le revert).
  Mitigé par : clé content-keyée (changeVersion), `placeSubviews` qui re-mesure
  toujours, et le go/no-go visuel device avant commit.
- Rollback trivial : `cacheKey = nil` partout → comportement = l'original
  actuel (re-mesure systématique). L'interrupteur est intégré dès le départ.

## 7. Ordre d'exécution (après validation)

1. `BubbleHeightCache` + tests unitaires (RED→GREEN).
2. Câbler `cacheKey` dans `BubbleBodyFooterLayout` + `BubbleStandardLayout`.
3. Build + tests.
4. **Device : go/no-go visuel** (correction) PUIS re-trace (perf).
5. Commit isolé seulement si visuel OK.
