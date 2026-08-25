# Iteration-244i — la garde trouve la FEUILLE ; l'itérer trouve l'ARBRE

**Date** : 2026-08-25 · **Piste** : iOS (suffixe `i`)
**Surfaces** : FIL (`FeedView*`, `FeedViewModel`) + STORY (`StoryViewerView*`), en plus de CONVERSATION
**Base** : `main` HEAD `27078e80` · **Branche** : `claude/intelligent-noether-oulsyj`
**Précédent direct** : 243i (PR #3498, mergée)

## Le point de départ, et la limite qu'il annonçait

243i a posé `ConversationSurfaceReachabilityGuardTests` et a écrit, dans son
propre doc-comment, ce qu'elle n'attrapait pas :

> Une fonction citée uniquement par une autre fonction elle-même morte reste
> verte. La garde attrape la **FEUILLE** de l'arbre mort, pas l'arbre.

244i est le tour suivant. Il valide la limite **par l'exemple**, et sur le
dépôt lui-même.

## Ce que la mesure a rendu

Élargie au FIL et à la STORY, la garde signale **quinze** fonctions sans site
d'appel. Elles se répartissent en trois familles, et **seule la première se
retire** :

### (1) Mortes de bout en bout — 8 retirées

| fonction | fichier | ce qui vit à sa place |
|---|---|---|
| `storyTextContent(_:storyEffects:)` | `StoryViewerView+Content` | le canvas : `+Canvas.swift` / `StorySlideRenderer` (SDK) |
| `mediaOverlay(media:geometry:)` | idem | idem |
| `fontForStyle(_:sizeOverride:)` | idem | **cascade** — appelée par la seule `storyTextContent` |
| `textAlignmentFor(_:)` | idem | **cascade** |
| `compositeAlignment(position:align:)` | idem | **cascade** |
| `coloredMediaFallback(media:)` | idem | **cascade** — appelée par la seule `mediaOverlay` |
| `resolveRepostTargetId(_:)` | `FeedViewModel` | `ComposerIntent` : `originalRepostOfId ?? repostOfId ?? cardId` |
| `feedGenerateVideoThumbnail(url:)` | `FeedView+Attachments` | `generateVideoThumbnail` **du même fichier**, et `AttachmentPreparationService` |

**Quatre des six retraits de story sont des CASCADES** : `fontForStyle`,
`textAlignmentFor`, `compositeAlignment` et `coloredMediaFallback` avaient un
site d'appel — à l'intérieur des deux fonctions mortes. La garde de 243i ne les
voyait pas. C'est la démonstration littérale de sa limite documentée : **retirer
deux feuilles a fait apparaître quatre branches.**

`storyTextContent` emportait `story.viewer.a11y.storyText` — **une clé traduite
en sept locales pour un `accessibilityLabel` qu'aucun lecteur d'écran n'a jamais
annoncé**. Même défaut qu'en 243i, sur une autre surface : la troisième et la
quatrième clé orpheline trouvées par ce moyen.

Sur `resolveRepostTargetId`, une vérification s'imposait avant de retirer : son
doc-comment porte une règle de correction (« re-partager un PARTAGE doit
référencer la RACINE »). La règle **est** appliquée — par `ComposerIntent`, que
`FeedViewModel` alimente déjà. Le retrait enlève la **seconde** implémentation
d'une règle qui n'en veut qu'une ; il ne relâche aucun invariant.

### (2) Dont le SEUL appelant est la suite de tests — 7 inscrites, 0 retirée

`likePost`, `bookmarkPost`, `clearTranslationOverride` (`FeedViewModel`) ·
`_testSetAudioCoordinator`, `clearMentionSuggestions`, `handleMentionQuery`,
`removeExpiredMessages` (`ConversationViewModel`).

`_testSetAudioCoordinator` est un siège de test assumé — son préfixe le dit, il
restera là. Les six autres sont du code de production que plus rien, **en
production**, n'appelle.

Et le cas de `likePost` / `bookmarkPost` est le plus coûteux du lot :

```
// FeedView.swift:277
//   … (existing `.toggleLikePost` outbox kind, same one
//   `FeedViewModel.likePost` already uses) …
// FeedView.swift:391
//   Mirror the pre-fix behaviour from FeedViewModel.bookmarkPost.
```

`FeedView` a **réécrit la logique en ligne** — toggle optimiste, appel socket,
repli REST, mise en file hors-ligne, observation d'issue — pendant que
l'implémentation canonique du ViewModel, celle que `FeedViewModelTests` exerce
longuement, **ne tourne jamais**.

> **Le code TESTÉ et le code EXPÉDIÉ ne sont pas le même.** Une suite verte
> n'atteste alors plus rien du produit : elle mesure une seconde implémentation
> que personne ne rend. C'est la forme la plus coûteuse de « code mort testé
> vert » — celle qui **achète** de la confiance au lieu d'en retirer.

C'est aussi une violation frontale de la règle **Single Source of Truth** du
dépôt (« Each data type has ONE source. No reimplementation. ») et du MVVM.

### (3) Entanglées avec de l'état VIVANT — 2 inscrites, 0 retirée

**`markProgrammaticScroll()`** était l'unique site posant
`isProgrammaticScroll = true`. Son seul appelant était `scrollToAndHighlight`…
que **243i a retirée** — mais celle-ci n'avait elle-même aucun site d'appel,
donc le drapeau **n'a jamais été vrai**. Conséquence :

- `guard …, !isProgrammaticScroll` (`ConversationViewModel:4132`), qui garde la
  pagination « charger les plus récents », **ne bloque rien** ;
- la « réinitialisation défensive » (`:1869`) n'a jamais rien à réinitialiser.

Retirer la méthode laisserait un drapeau **LU que rien n'écrit**. La vraie
question — *cette garde doit-elle fonctionner ?* — appartient à la piste
conversation et demande un simulateur.

**`fetchReactionDetails(messageId:)`** peuple `reactionDetails` /
`isLoadingReactions`, deux `@Published` que `ConversationStateStore` déclare
**aussi**, pendant que `MessageReactionsDetailView` porte son **propre**
`@State isLoadingReactions`. Trois copies d'un même état, une seule alimentée.

## Le partage retenu

**Retirer ce qui est mort de bout en bout ; INSCRIRE NOMMÉMENT ce qui est vivant
d'un côté.** Les neuf inscriptions portent chacune leur raison dans
l'allowlist — une dette VUE, pas un silence. C'est la leçon 238i (découper par
NIVEAU DE DOUTE) appliquée à une mesure qui, prise brute, aurait proposé quinze
suppressions dont sept auraient cassé la suite et deux auraient laissé de l'état
orphelin.

## Vérification

Aucune toolchain Swift ici — **gate réel = CI `iOS Tests`**, suite complète via
l'opt-in ` — run test` **dans le SUJET du commit** (leçon 243i bis : le NOM du
check atteste ce qui a tourné).

| Contrôle déterministe rejoué hors Swift | Résultat |
|---|---|
| Garde élargie — inatteignables sur la branche | **0** |
| Ses auto-gardes : 14 fichiers de surface, 406 déclarations, `triggerReply` vu | conformes (seuils relevés à 10 / 200) |
| Les 8 fonctions retirées, encore présentes en CODE ? | **aucune** |
| `check_localization.py` | **✓ directions 1 et 2** |
| Catalogue · entrées | 3369 → **3368** ; excision **textuelle**, 0 autre entrée modifiée (par parse) |
| Équilibre `()`/`{}`/`[]` des 4 fichiers Swift | **identique à `main`** |
| SDK · `project.pbxproj` | **non touchés** |

## Bilan

**3 fichiers prod** · **8 fonctions retirées** (dont **4 par cascade**) ·
**1 clé × 7 locales** · **9 dettes inscrites nommément** · **garde élargie de
1 à 3 surfaces** · **0 changement visuel** · **0 logique métier**.

Net : **−214 / +117**.

## Suites (245i+)

1. **`likePost` / `bookmarkPost` — recâbler `FeedView` sur le ViewModel.** Le
   correctif proposé : supprimer les copies en ligne de la vue et appeler les
   méthodes canoniques. Porteur de comportement (like / favori / file
   hors-ligne) ⇒ simulateur + relecture. **C'est le lot le plus rentable de
   cette liste** : il rend vrai ce que la suite prétend déjà mesurer.
2. **`isProgrammaticScroll` — garde qui ne garde rien.** Décider si la
   pagination doit être bloquée pendant un défilement programmatique, puis
   câbler ou retirer le drapeau ET ses deux lecteurs.
3. **Les trois copies de `isLoadingReactions`** — démêler
   `ConversationViewModel` / `ConversationStateStore` / `MessageReactionsDetailView`.
4. **Itérer la garde jusqu'au POINT FIXE**, plutôt qu'un tour par itération :
   après chaque retrait, relancer la mesure sur la même surface. 244i a fait
   deux tours à la main (2 feuilles → 4 branches) ; l'automatiser rendrait
   l'arbre entier d'un coup.
5. Carry-over : `buildNativeMessageMenu`, découvrabilité du fil de réponses,
   les 7 `String(format: "%d:%02d", …)`, cibles tactiles 44 pt
   d'`InteractiveProgressBar`.
