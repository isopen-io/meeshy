# Iteration-266i — Cinq sondes négatives, et le squelette que rien ne gardait

**Date** : 2026-08-29 · **Piste** : iOS (suffixe `i`)
**Surface** : démarrage à froid des cinq écrans du Pattern I4 · doctrine des squelettes
**Base** : `main` HEAD `24c556b8` · **Issue** : #4319
**Précédent direct** : 265i (les littéraux `LocalizedStringKey`)

---

## 1. Cinq sondes, cinq résultats négatifs

Balayage de cinq doctrines SwiftUI / architecture ayant une forme MESURABLE.
**Rien à corriger sur les cinq.**

| doctrine | mesure | verdict |
|---|---|---|
| `@ObservedObject` initialisé en ligne | **0** sur 145 occurrences | sain |
| `.id(UUID())` | **0** | sain |
| `@State` miroir d'un singleton, non resynchronisé | 12 miroirs, **12 `.onReceive` appariés** | sain |
| matrice squelettes du Pattern I4 | **5/5**, + 6 écrans non exigés | sain |
| `loadState` exposé par tout ViewModel qui charge | 19/30 ne l'exposent pas | contrat non tenu, **comportement correct** |

C'est le quatrième balayage négatif consécutif de la piste (254i, 255i, 260i,
262i). Trois observations méritent d'être conservées.

### 1.1 Le miroir de singleton est un IDIOME, pas un défaut

`@State private var isMutedMirror: Bool = SharedAVPlayerManager.shared.isMuted`
a la forme exacte d'un bug SwiftUI classique : une `@State` semée depuis un
singleton n'est qu'un INSTANTANÉ, figé après le premier rendu.

Les douze sites portent tous leur `.onReceive` apparié, et le disent sur place :

> « `activeURL`/`player` ci-dessus : @State scopé + `.onReceive`, jamais
> `@ObservedObject` sur un singleton »

C'est la loi « Zero Unnecessary Re-render » appliquée correctement : on ne
s'abonne pas à l'objet global, on miroite la primitive dont on a besoin et on la
resynchronise. **Un motif qui RESSEMBLE à un défaut connu peut être la forme
correcte d'une autre règle** — il fallait vérifier l'appariement, pas reconnaître
la silhouette.

### 1.2 `loadState` — un écart de CONTRAT sans écart de COMPORTEMENT

19 des 30 ViewModels qui chargent n'exposent pas `loadState`, dont 12 qui
utilisent `CacheCoordinator`. 63 % de non-conformité à une règle de la bible :
cela ressemble à une trouvaille.

Lecture de `BookmarksViewModel` : il lit le cache **avant** de toucher
`isLoading`, sert `.fresh` sans réseau, sert `.stale` puis rafraîchit en tâche de
fond. Le comportement que la règle protège — *pas de spinner sur un cache non
vide* — est déjà là, sous un autre nom.

> **Un pourcentage de non-conformité n'est pas un défaut tant qu'on n'a pas lu ce
> que le code fait.** C'est le piège du 260i (un instrument qui a menti 4 fois
> sur 4) sous une autre forme : ici l'instrument dit vrai, et sa conclusion est
> quand même fausse.

### 1.3 La doctrine nommait un composant qui n'existe pas

`apps/ios/CLAUDE.md` § Cache-First, règle 5 : « Use **SkeletonPlaceholder** (not
ProgressView) on empty cache ». Mesuré : **`SkeletonPlaceholder` n'apparaît dans
aucun `.swift` du dépôt.**

Ce n'est pas une API manquante — c'est un nom GÉNÉRIQUE de la bible, que le code
réalise sous quinze noms de domaine. La doctrine est mieux tenue que ce qu'elle
demandait. Mais le lecteur qui cherche le nom écrit ne trouve rien, et peut en
conclure l'inverse : **c'est exactement le chemin que cette sonde a parcouru
avant de mesurer.**

---

## 2. Ce que les sondes ont laissé : une matrice gardée par rien

Le Pattern I4 dit « Chaque ecran DOIT avoir un skeleton qui mime la forme du
contenu final » et **nomme cinq écrans dans un tableau**. Les cinq sont conformes
— et aucun test ne le mesurait.

| écran (bible) | composant réel | monté par | où il vit |
|---|---|---|---|
| Liste conversations | `SkeletonConversationRow` | `ConversationListView` | **SDK** |
| Messages | `SkeletonMessageBubble` | `ConversationView` | **SDK** |
| Feed | `SkeletonFeedList` → `SkeletonFeedPost` | `FeedView` | app |
| Stories | `SkeletonStoryTrayRow` → `SkeletonStoryThumb` | `StoryTrayView` | app |
| Profil | `SkeletonProfileHeader` | `ProfileView` | app |

Le mode de panne est concret : un refactor de `ConversationListView` qui retire
la rangée squelette rendrait l'écran **principal** de l'app blanc au démarrage à
froid, et tout resterait vert. C'est la forme de #4302, #4292 et #4311 — une
règle déclarée, nommant une liste précise, dont la mesure n'existe pas.

---

## 3. Le remède

1. **`apps/ios/CLAUDE.md`** nomme désormais les composants qui EXISTENT, avec
   leur écran et leur lieu (app vs SDK), plus les six squelettes hors bible et la
   recette pour en bâtir un (`SkeletonShape` + `skeletonShimmer()` + libellé de
   chargement accessible).
2. **`SkeletonColdStartGuardTests`** — deux règles :
   - les cinq écrans montent leur squelette nommé ;
   - chaque nom épinglé est bien DÉFINI (app ou SDK), sinon un renommage
     laisserait la matrice mentir en compilant des deux côtés.

**Pourquoi CES cinq et pas les 74 autres écrans à `ProgressView`** : ils sont
nommés par la BIBLE, pas par moi. La garde épingle une décision déjà prise ; elle
n'en invente aucune (§ 5).

---

## 4. Bornes

| borne | exigence | mesure |
|---|---|---|
| les cinq écrans sont lus et non vides | > 2 000 caractères | 44 415 → 162 953 |
| les cinq squelettes sont définis | app + SDK | 5/5 |
| témoin — montage nu | `SkeletonFeedList()` → vrai | ✓ |
| témoin — montage avec argument | `SkeletonFeedList(count: 3)` → vrai | ✓ |
| témoin — **mention en commentaire** ≠ montage | → faux | ✓ |
| témoin — **mention en chaîne** ≠ montage | → faux | ✓ |
| témoin — **préfixe** ≠ montage (`SkeletonFeedListPreview()`) | → faux | ✓ |
| témoin — autre vue | `ProgressView()` → faux | ✓ |
| accolades / parenthèses / crochets | équilibrés | 20/20 · 55/55 · 5/5 |
| lignes de la garde (budget 1100) | — | 159 |

Les trois témoins NÉGATIFS sont l'essentiel : un détecteur qui rend `true` sur
une mention en commentaire, sur une chaîne, ou sur un nom PRÉFIXÉ laisserait les
deux règles vertes en ne protégeant plus rien. D'où le masquage
(`DeclarationBodyScanner.mask`) **et** la garde de frontière `(?<![A-Za-z0-9_])`.

**Gate réel = CI `iOS Tests`.** Pas de chaîne d'outils Apple ici : la compile
n'est pas prouvée localement, et c'est dit plutôt que supposé.

---

## 5. Hors périmètre, et pourquoi

- **Le spinner de démarrage à froid ailleurs.** 126 `ProgressView` sur 82
  fichiers, dont 74 sans squelette. Le seul lu (`ForwardPickerSheet`) porte un
  gate `isColdStartLoading` explicite : la CONDITION est juste, seul le visuel
  diffère. Juger 74 sites est du design, invérifiable sans simulateur.
- **`loadState` absent de 19 ViewModels.** Écart de contrat sans conséquence
  visible (§ 1.2) : cela se décide, cela ne se corrige pas dans une itération
  d'UI/UX.
- **La même ligne `SkeletonPlaceholder` dans le `CLAUDE.md` RACINE.** Fichier
  partagé par toutes les plateformes, hors du périmètre iOS de cette piste.

---

## 6. Dimensions

| dimension | état |
|---|---|
| 2 · Performance (démarrage à froid) | **mûre** sur les cinq écrans nommés |
| 8 · Expérience utilisateur | mûre — le squelette ne peut plus disparaître en silence |
| 11 · Maintenabilité | mûre — la doctrine nomme enfin ce qui existe |
| 13 · Complétude | **partielle** — 74 écrans à `ProgressView` restent à trancher (§ 5) |

---

## 7. Suites

1. **Les 74 écrans à `ProgressView` sans squelette** — décision produit, écran
   par écran, au simulateur.
2. **#4308** — les 648 `defaultValue` divergents.
3. **92 fichiers** propres non encore épinglés à `fullyLocalizedScreens`.
4. **#4298** — le cube des stories et le swipe de bulle, en arabe.
