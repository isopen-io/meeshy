# Iteration-259i — SwiftUI retourne les piles, pas le SIGNE d'un glissement

**Date** : 2026-08-29 · **Piste** : iOS (suffixe `i`)
**Surfaces** : Rivière (navigation par pas), Réels (bande de retour)
**Base** : `main` HEAD `5e162ed7` · **Issue** : #4297
**Précédent direct** : 258i (le cliquet i18n re-piqué)

---

## 1. La troisième famille RTL

L'app propose l'**arabe** parmi ses langues d'interface. Le dépôt connaît déjà
deux familles de défauts RTL :

| famille | qui la traite |
|---|---|
| piles, alignements `.leading`/`.trailing`, marges directionnelles | **SwiftUI**, tout seul |
| symboles nommés par un côté physique (`chevron.right`) | `RightToLeftLayoutGuardTests` |

Il en existe une **troisième, que rien ne couvrait** : le **SIGNE** d'un
`DragGesture`. `translation.width` est un déplacement à l'ÉCRAN ; il ne sait pas
dans quel sens on lit. « `dx < -60` ⇒ story suivante » dit en réalité « glisser
vers la GAUCHE avance » — vrai en français, faux en arabe.

Aussi silencieuse que la deuxième : rien ne casse, rien ne rougit, la navigation
part simplement à l'envers pour un lecteur arabophone.

---

## 2. Mesure — et ce qui ne doit PAS se retourner

**25 comparaisons de `translation.width`**, 13 fichiers. Le tri fait partie de la
mesure :

| famille | sites | verdict |
|---|---|---|
| `abs()` ou dominance d'axe (`abs(dx) > abs(dy)`) | 9 | **sans objet** |
| glissement libre 2D (pastille d'appel, pan d'image zoomée, bulle flottante) | 7 | **ne doit PAS se retourner** — l'objet suit le doigt |
| direction de LECTURE | **6** | à retourner |

> Une pastille d'appel jetée vers la droite part vers la droite dans toutes les
> langues. Interdire le signe brut aurait produit un bruit permanent : la garde
> épingle donc ce qui est DÉCIDÉ, pas ce qui est interdit.

---

## 3. La forme du remède, et pourquoi elle est sûre

Un helper pur qui rend le déplacement dans le sens de la lecture — `width` en
LTR, `-width` en RTL. **Les sites gardent leurs comparaisons ; seul l'opérande
change.**

En LTR c'est une multiplication par +1, donc l'**identité** : le comportement
actuel — la quasi-totalité des sessions — est préservé *par construction*, ce qui
se prouve par lecture ET par test, sans simulateur. C'est le premier test du banc.

---

## 4. Ce qui a été RETOURNÉ, et ce qui a été ANNULÉ

| site | verdict |
|---|---|
| `RiverStreamHost:582` | **retourné** — le geste ne fait que produire une direction NOMMÉE (`navigation.step`), sans visuel couplé |
| `ReelsPlayerView:396,399` + `.offset(x:)` | **retourné**, les trois passages ensemble |
| `StoryViewerView+Content:288` | **tenté puis ANNULÉ** → #4298 |
| `MessageListView:281` (swipe de bulle) | non tenté → #4298 |

### 4.1 Le cube des stories : le remède évident dégradait le site

La décision se retourne en une ligne. **Mais elle n'est qu'un cinquième du
geste** : `horizontalDrag`, `groupSlide`, `totalSlideX`,
`exitX = forward ? -screenW : screenW` et l'orientation des faces voisines vivent
tous en espace ÉCRAN, et pilotent un **cube 3D**.

Retourner la seule décision aurait donné, en arabe : le doigt pousse à droite, le
cube suit à droite — puis le commit envoie la face vers `-screenW`, **à gauche**,
à l'opposé du geste qui vient de la valider.

> **Une incohérence pire que le défaut.** Aujourd'hui l'arabe est orienté comme le
> français : faux, mais cohérent. Un demi-retournement casse la relation entre le
> doigt et l'image, ce qui se ressent immédiatement.

C'est la leçon du 257i (« l'état de repos n'est pas la cible ») rejouée sur une
autre surface : **avant de retourner une DÉCISION, chercher ce que son signe
pilote À CÔTÉ d'elle.**

### 4.2 Le discriminant qui sépare les deux cas

**`.offset(x:)` n'est PAS retourné par SwiftUI**, contrairement aux marges et aux
alignements. `ReelsPlayerView` a pu être retourné parce que son visuel tient en
UN `.offset` — repassé en espace écran par le même helper, qui est sa propre
réciproque. Le cube, non.

Ce discriminant ne se voit qu'en suivant la donnée **jusqu'au pixel**, pas en
s'arrêtant à la décision : `edgeDrag` semblait un simple seuil, il pilotait aussi
une translation trente lignes plus haut.

---

## 5. Preuve

| mesure | valeur |
|---|---|
| identité en LTR (11 valeurs, dont les seuils −60 / 70) | **exacte** |
| inversion en RTL | exacte |
| zéro reste zéro (`0 - x`, jamais `-x` : `-0.0 ≠ 0.0`) | ✓ |
| involution (deux retournements rendent l'original) | ✓ |
| seuil de navigation rejoué dans les deux sens | se déclenche du bon côté |
| producteurs de `ReadingDirection` | **1** |
| `ReelsPlayerView` : passages par le helper | **3** (suivi, seuil, offset) |
| site des stories : `dx` brut restauré, `layoutDirection` retiré | ✓ |
| accolades vs `HEAD` (4 fichiers) | identiques |
| borne — fichiers balayés | 603 (règle exige > 400) |

**Gate réel = CI `iOS Tests`.** Pas de chaîne d'outils Apple ici : la compile
n'est pas prouvée localement, et c'est dit plutôt que supposé.

---

## 6. Ce qui change à l'écran

**Rien en français**, ni dans aucune des six langues qui se lisent de gauche à
droite — le helper y est l'identité. En **arabe** :

| surface | avant | après |
|---|---|---|
| Rivière, pas horizontal | glisser à gauche avançait | glisser à **droite** avance |
| Réels, bande de retour | bande à droite (retournée), mais il fallait pousser vers la droite — à l'opposé du bord | pousser vers la **gauche** ferme, et le contenu suit le doigt |

---

## 7. Dimensions

| dimension | état |
|---|---|
| 9 · Compatibilité | **partielle** — deux gestes de navigation sur six ; le cube et le swipe de bulle restent (#4298) |
| 5 · Accessibilité | mûre sur les deux sites traités |
| 11 · Maintenabilité | mûre — helper unique, identité prouvée, garde à liste nommée |
| 4 · Fluidité | préservée : aucun site n'a été laissé à moitié retourné |

---

## 8. Suites

1. **#4298** — le cube des stories et le swipe de bulle : retournement de la
   GÉOMÉTRIE entière, **au simulateur en arabe**.
2. **#4293** — les 12 clés i18n révélées au 258i (six libellés VoiceOver ; un
   pluriel anglais codé en dur).
3. **#4288** / **#4289** — l'écran de réglages d'accessibilité absent ; le
   `@propertyWrapper` à valider avec un compilateur.
