# Iteration-253i — une abstraction nommée d'après son premier appelant ne voyage pas

**Date** : 2026-08-29 · **Piste** : iOS (suffixe `i`)
**Surfaces** : appels (plein écran, bulle, pilule flottante), composer document,
liste de conversations, story, détail d'une publication
**Base** : `main` HEAD `cd9aa95b` · **Issue** : #4266
**Précédent direct** : 252i (la garde qui ne pouvait pas voir la 9ᵉ copie)

---

## 1. Le défaut

Le dépôt avait déjà la bonne abstraction pour dire l'état d'un interrupteur à
VoiceOver : trait `.isToggle`, valeur « Activé / Désactivé », repli propre sous
iOS 17. Son propre commentaire énonçait la règle **générale** — « the same
toggle semantics (trait + on/off value) … instead of a plain label swap ».

**Rien dedans n'était propre aux appels.** Trois choses seulement le rendaient
« d'appel » :

| | |
|---|---|
| son **NOM** | `callToggleAccessibility` |
| son **FICHIER** | `CallView.swift`, 2 200+ lignes |
| ses **CLÉS** | `call.control.state.on` / `.off` |

Résultat mesuré : **5 sites l'appliquaient, tous des surfaces d'appel**, pendant
que des bascules ailleurs ne disaient leur état que par une couleur.

> **C'est la forme de 252i déplacée d'un cran.** Là-bas, une GARDE était bornée
> par la forme qu'elle interdisait ; ici, une RÈGLE juste est bornée par le nom
> qu'on lui a donné. Dans les deux cas le savoir existait, était exact, et
> n'atteignait pas les sites qui en avaient besoin.

---

## 2. La mesure, et ce qu'elle a coûté

Sur **40 bascules à deux états** :

| | nombre |
|---|---|
| état exposé par un trait / une valeur | 15 |
| état exposé par un NOM qui varie (motif correct des menus) | 16 |
| muettes | **8** |

**Trois des 8 ne sont pas des défauts**, et le dire fait partie de la mesure :

| site | verdict |
|---|---|
| `ConversationPreferencesTab:354` | titre « Archive » / « Unarchive » — mais via un constructeur de rangée MAISON (`settingsRow(title:)`), d'où l'angle mort. **Correct.** |
| `IncomingCallView:220` | « Accepter », dont l'icône reflète le TYPE d'appel. **Pas une bascule.** |
| `StatusBubbleOverlay:215` | rangée agrégée par son conteneur (`children: .ignore`), étiquette dans une action nommée. **Exception documentée.** |

**Cinq défauts réels**, en **deux familles de remède** :

| site | ce qui ne se disait pas | remède |
|---|---|---|
| `CallView:2076` — filtres vidéo | barre ouverte **et** effets actifs : deux états, aucun annoncé. L'indice disait « ouvre OU ferme » — ambigu précisément faute d'état | trait + valeur |
| `ConversationListView+Overlays:1307` — recherche | la recherche est-elle déjà ouverte | trait + valeur |
| `ComposerDocumentSurface:1952` — palette de fond | son doc-comment écrivait la règle À L'ENVERS : « Active (palette dépliée) : teintée accent pour dire "ouvert" » | trait + valeur |
| `StoryViewerView+Content:2837` — j'aime d'un commentaire | aimé ou non — **et aucune `accessibilityLabel` du tout** | nom qui varie |
| `PostDetailView:1125` — enregistrer (menu) | « Enregistrer » que le post soit déjà enregistré ou non ; seule l'icône changeait | nom qui varie |

### 2.1 Le remède se lit sur la JUMELLE, pas sur l'intuition

L'issue annonçait « trait + valeur » pour le j'aime de story. **La jumelle a
dit non.** `FeedCommentsSheet` porte le même contrôle — le j'aime d'un
commentaire — et le sert ainsi depuis toujours :

```swift
.accessibilityLabel(isLiked ? "Je n'aime plus" : "J'aime")   // le NOM dit l'action
.accessibilityValue(LocalizedNumber.exact(likeCount))         // la VALEUR porte le COMPTE
```

Un « j'aime » n'est pas un interrupteur : sa valeur est un nombre, pas un
« Activé ». Le site de story reprend ce vocabulaire **à l'identique** plutôt que
d'en inventer un.

> **Avant de choisir un remède, chercher si le même contrôle existe ailleurs et
> ce qu'il fait.** La jumelle est une décision déjà prise, souvent mieux
> argumentée que celle qu'on s'apprête à improviser.

Même leçon sur le menu : `PostDetailView` fait varier son étiquette de favori
**dans le même fichier**, trente lignes plus bas, avec les deux clés exactes que
le menu ignorait.

---

## 3. Le correctif

- Le vocabulaire devient **`toggleStateAccessibility`**, dans son propre fichier,
  avec des clés **`a11y.toggle.on/off`** — les mêmes sept traductions, transportées
  (catalogue 3408 → 3408, aucune clé neuve, aucune orpheline).
- Les **5 appels d'appel** migrent sans changer de comportement ; **3 bascules
  muettes** prennent le trait ; **2 sites** prennent un nom qui varie.
- Une clé nommée `call.*` servant le composer aurait rejoué le défaut de #4248
  (« une clé au nom d'un écran ne se réutilise pas sans mentir ») : le renommage
  des clés n'est pas cosmétique, c'est la moitié du correctif.

### 3.1 La garde, et pourquoi elle ne garde pas ce qu'on croirait

Une garde interdisant la **re-création** du modificateur serait à côté : le
défaut de 253i n'est pas qu'on l'ait recopié, c'est qu'on **ne l'ait pas
trouvé**. Elle garde donc les deux faces qu'un site rééecrirait s'il ignorait
son existence — sa **CLÉ** et son **TRAIT** — plus la vérification que la source
unique porte bien les deux moitiés de la règle, repli iOS 17 compris.

### 3.2 Le renommage, et le banc qui serait passé au vert en cessant de voir

Sept chaînes épinglées dans quatre bancs, relevées **avant** le push (leçon
251i bis). L'une méritait plus qu'un remplacement :

`test_callToggleAccessibility_isNotFilePrivate` lisait **`CallView.swift`** pour
y interdire `private extension View { … func callToggleAccessibility`. Après le
déménagement, ce fichier ne contient plus le motif — **la garde serait restée
verte en cessant de voir**, exactement le défaut que 251i bis a payé d'un cycle.
Son intention n'a pas bougé d'un mot ; sa CIBLE a suivi le modificateur.

> **Une garde qui suit un renommage sans changer de cible est une garde morte.**

---

## 4. Preuve

| mesure | avant | après |
|---|---|---|
| sites appliquant le vocabulaire | 5 (tous d'appel) | **8** (appel, composer, liste, story) |
| bascules muettes (défauts réels) | 5 | **0** |
| clés d'état hors source unique | — | **0** |
| trait `.isToggle` posé à la main | — | **0** |
| entrées du catalogue | 3408 | **3408** (clés renommées, 7 locales conservées) |
| clés orphelines | 0 | **0** |

Les 7 chaînes épinglées par les bancs ont été **vérifiées une à une contre la
source** après renommage. Équilibre des accolades contrôlé **par comparaison
avec `HEAD`** — trois fichiers rendent `+1` avec un masqueur naïf, à l'identique
avant et après : c'est l'instrument qui compte mal, pas le code.

**Gate réel = CI `iOS Tests`**, job `Build app + tests unitaires`.

---

## 5. Ce qui change à l'écran

**Rien.** Aucun pixel ne bouge. Ce qui change est ce que VoiceOver dit :

| surface | avant | après |
|---|---|---|
| filtres vidéo (appel) | « Filtres vidéo » | « Filtres vidéo, Activé » quand la barre est ouverte |
| recherche (liste) | « Rechercher » | + « Activé » quand la recherche est déjà ouverte |
| palette de fond (composer) | « Arrière-plan » | + « Activé » quand la palette est dépliée |
| j'aime d'un commentaire de story | le cœur et un nombre, sans nom | « J'aime » / « Je n'aime plus », valeur = le compte |
| enregistrer (menu d'un post) | « Enregistrer », déjà enregistré ou non | « Retirer des favoris » quand il l'est |

---

## 6. Dimensions

| dimension | état |
|---|---|
| 5 · Accessibilité | mûre — 5 contrôles disent enfin leur état ; WCAG 1.4.1 sur quatre surfaces |
| 6 · Cohérence de positionnement | mûre — un interrupteur se dit pareil partout ; un menu garde sa grammaire de menu |
| 11 · Maintenabilité | mûre — vocabulaire hors d'une vue de 2 200 lignes, clés génériques, garde à deux faces |
| 13 · Complétude | **partielle** — la garde vérifie qu'on ne RÉÉCRIT pas le vocabulaire, pas qu'on l'APPLIQUE partout où il faudrait (§ 7.1) |

---

## 7. Suites (254i+)

1. **La garde ne sait pas exiger l'application.** Interdire la ré-écriture est
   scannable ; exiger « tout contrôle dont le label branche sur un booléen
   expose cet état » demande un marcheur à parenthèses équilibrées et une
   détection des noms variables **y compris à travers un constructeur maison**
   — le motif qui a produit le seul faux positif de la mesure. À faire quand
   l'instrument existera côté Swift.
2. **Deux états sur un seul bouton** : `CallView:2076` porte `showEffectsToolbar`
   (ce qu'il bascule) ET `hasActiveEffects` (un fait voisin, montré par la
   teinte). Seul le premier est annoncé — le second mériterait sa propre
   annonce, ce qui demande une valeur composée et donc une clé.
3. Décision produit ouverte : **#4265** (quel drapeau porte le portugais).
4. Carry-over : rangée méta du fil en Dynamic Type XXL (249i–251i, demande un
   simulateur) ; les cinq replis de drapeau du SDK ; `FeedView` sur
   `likePost`/`bookmarkPost` ; les 3 copies d'`isLoadingReactions`.
