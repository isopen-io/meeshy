# Iteration-241i — les nombres que la locale ne touchait pas

**Date** : 2026-08-24 · **Piste** : iOS (suffixe `i`)
**Surfaces** : `FeedCommentsSheet` · `PostDetailView` (3) · `ReelsPlayerView` (2) ·
`ConversationDashboardView` (2) · `MessageOverlayMenu` (4) + `ReachMetricLabel`
**Base** : `main` HEAD `5476dae7` (post-merge 240i)
**Branche** : `claude/intelligent-noether-64z546` (repartie de `main`)

## Pourquoi cette surface

Suite **(a)** du pointeur 240i : « les 4 sites `label + accessibilityValue("\(count)")`
— fix par `count.formatted(locale:)`, PAS par `PostStatAccessibility.*Label` ».

En ouvrant les quatre, le balayage en a rendu **dix**. Et comme en 239i et en
240i, le défaut annoncé n'était pas le plus grave.

## Le défaut

### (1) L'interpolation grave les chiffres latins — 7 sites

```swift
.accessibilityValue("\(likeCount)")
```

`"\(n)"` écrit toujours en chiffres latins. L'arabe s'écrit en chiffres
arabo-indiens : une interface arabe faisait donc cohabiter **deux systèmes
d'écriture**. C'est la régression que 238i a soldée sur les compteurs visibles
et 239i sur les compteurs de portée — la même, une couche plus loin.

Deux de ces sites (`ConversationDashboardView:130` et `:1225`) portaient un
commentaire revendiquant la « valeur brute ». Cette intention est **conservée** :
elle visait le refus de l'ABRÉGÉ (« 1,2 k »), pas le système de chiffres.
`LocalizedNumber.exact` rend le nombre entier, groupé, non abrégé — exactement
ce que le commentaire demandait, en plus lisible pour un arabophone.

### (2) Le pourcentage avait DEUX orthographes dans le même composant — 4 sites

C'est la trouvaille du lot, et elle n'était pas dans le pointeur.

`MessageOverlayMenu` rend le même nombre deux fois, à trois lignes d'écart :

| ligne | code | forme |
|---|---|---|
| 974 | `.accessibilityValue("\(player.percentInt) %")` | **avec** espace |
| 977 | `Text("\(player.percentInt)%")` | **sans** espace |
| 1076 | `.accessibilityValue("\(player.percentInt) %")` | **avec** espace |
| 1104 | `Text("\(player.percentInt)%")` | **sans** espace |

Et `ReelsPlayerView:1420` gravait la troisième combinaison (`%` collé, dans une
valeur d'accessibilité).

Aucune n'est juste partout : **le français veut une espace insécable avant `%`,
l'anglais n'en veut pas.** Graver l'une ou l'autre, c'est se tromper dans une
locale sur deux. Ici, le composant se trompait dans les deux à la fois — ce que
VoiceOver DIT et ce que l'écran MONTRE ne s'accordaient même pas entre eux.

Le glyphe, son espacement et le système de chiffres appartiennent tous les trois
à la locale. `FormatStyle` les porte déjà ; le code n'avait aucune raison de les
réécrire.

## Le correctif

`LocalizedNumber` (app, `Features/Main/Components/`) — **une règle de locale, un
site** :

- `exact(_:locale:)` — le compte entier, groupé, dans les chiffres du lecteur ;
- `percent(_:locale:)` — le pourcentage entier, **glyphe et espacement compris**.

`ReachMetricLabel.spokenCount` (239i) **délègue** désormais à `exact`. La règle
change d'adresse, pas d'énoncé — et un test l'épingle, sans quoi la « source
unique » en serait deux. Brancher les dix sites sur `ReachMetricLabel` aurait
fait porter un « compteur de portée » à un score de santé et à une position de
lecture ; c'est pourquoi la règle sort dans un type qui ne parle que du NOMBRE.

### Ce qui ne bouge pas

Le séparateur `/` de l'indicateur de page (`ReelsPlayerView:1795`) **reste**.
239i l'avait explicitement distingué de la puce de mise en page qu'elle
bannissait : « 3 / 10 » se lit comme **une seule** position, sa forme EST la
donnée. Seuls les chiffres changent.

## La garde

`NumericAccessibilityValueGuardTests` (app, `Unit/Architecture/`), fermée **par
la forme et non par l'inventaire** — 234i→240i ont réduit sept familles de
compteurs sans jamais empêcher la suivante :

- **Interdiction (a)** — aucune `accessibilityValue` de l'app n'interpole son
  contenu dans un littéral ;
- **Interdiction (b)** — aucune n'y grave le glyphe `%` ;
- **Consolidation** — les 5 hôtes convertis nomment `LocalizedNumber.`.

Elle **se garde elle-même** (leçon 238i) : le balayage doit voir > 400 fichiers,
l'extracteur doit attraper un défaut fabriqué **et épargner la forme corrigée**
(sans quoi il enverrait corriger ce qui ne l'est pas — le faux rouge de 238i), et
le dépouilleur doit manger les commentaires **sans** manger les littéraux, parce
que le doc-comment de `LocalizedNumber` *cite* le code qu'il remplace.

## Changement visuel assumé

`MessageOverlayMenu` lignes 977 et 1104 : en français, « 50% » devient
« 50 % » (espace insécable). En anglais, rien ne bouge. **C'est une correction
typographique**, pas un choix stylistique — et elle supprime la divergence entre
le texte affiché et ce que VoiceOver annonce.

## Vérification

Aucune toolchain Swift sous Linux — **gate réel = CI iOS Tests**, suite complète
via l'opt-in ` — run test` (leçon 238i, et leçon 268 : re-vérifier le NOM du
check après CHAQUE poussée, y compris tierce).

| Contrôle déterministe rejoué hors Swift | Résultat |
|---|---|
| Balayage de l'app | **568 fichiers** (seuil de la garde : 400) |
| Interdiction (a) — interpolation | **0 contrevenant** |
| Interdiction (b) — `%` littéral | **0 contrevenant** |
| Consolidation — hôtes nommant la source | **5/5** |
| Auto-garde — l'extracteur trouve un défaut fabriqué | oui |
| Auto-garde — l'extracteur épargne la forme corrigée | oui |
| Auto-garde — le dépouilleur garde les littéraux | oui |
| Équilibre `()`/`[]`/`{}` sur les 9 fichiers | inchangé vs `main` (les 2 écarts pré-existent, artefact du tokenizer) |
| Clés i18n neuves | **0** |
| `pbxproj` | non touché (globbing `project.yml` + `xcodegen` en CI) |
| SDK (`packages/MeeshySDK`) | **non touché** — hors périmètre de la routine |

## Bilan

**7 fichiers prod** (dont 1 neuf, 1 délégation) · **1 suite neuve**
(`LocalizedNumberTests`, 10 tests) · **1 garde neuve** (7 tests) ·
**0 clé i18n** · **0 logique métier** · **0 réseau**.

## Suites (242i+)

1. **Le SDK porte le même défaut** — `KeyframeInspector:224` et
   `StoryAudioCell:231` gravent `"\(Int(x * 100))%"`. **Hors périmètre par
   règle** (la routine interdit de modifier les SDKs), donc à porter par la
   piste SDK, pas à reporter d'itération en itération.
2. `ComposerToolPanelHost:906` (`"\(pair.0) → \(pair.1)"`) — SDK également.
3. **Phrasé naturel de l'indicateur de page** : « Image 3 sur 10 » se lit mieux
   que « Image, 3 / 10 ». Écarté ici **par doute assumé** (nouvelle clé i18n +
   arbitrage de formulation), pas par oubli.
4. Carry-over 239i/240i inchangés : `MeeshyAppIntents:272` (macOS), forme `one`
   d'`accessibility.unread_count`, effectif « 199+ », `InteractiveProgressBar`,
   les 3 fenêtres `prefix(1400)` de `ConversationDashboardViewAccessibilityTests`,
   `conversation.view.reply.count.{one,many}` (messagerie, arabe lésé).
