# Iteration-239i — deux nombres, une étiquette : les statistiques de portée que VoiceOver ne pouvait pas attribuer

**Date** : 2026-08-23
**Piste** : iOS (suffixe `i`)
**Surfaces** : `FeedPostCard` · `ReelFeedCard` · `ReelsPlayerView` · `PostDetailView` (2 blocs) + `PostReachFormatter`
**Base** : `main` HEAD `7831df48` (post-merge 238i, train d'intégration beta-20260823)
**Branche** : `claude/intelligent-noether-4m5rwq` (**repartie fraîche** — la PR #3364 de 238i est mergée)

## Pourquoi cette surface

Suite **(c)** du pointeur 238i, qui la notait ainsi : « les `accessibilityValue`
des compteurs de portée interpolent l'entier brut sur 4 sites ⇒ chiffres latins
lus en arabe ».

En ouvrant les quatre sites, le défaut de chiffres s'est révélé être **le moins
grave des trois**. Le pointeur avait vu la conséquence i18n ; il avait manqué le
défaut d'accessibilité qui la précède.

## Le défaut

```swift
.accessibilityElement(children: .ignore)
.accessibilityLabel("Impressions")
.accessibilityValue("\(post.impressionCount) · \(post.viewCount)")
```

VoiceOver annonce **« Impressions, 1234 · 567 »**.

Le second nombre n'est nommé par rien. Ce n'est pas un libellé imparfait :
l'information « 567 est un nombre de vues » **n'existe nulle part dans l'arbre
d'accessibilité**. Un lecteur d'écran entend deux nombres et une seule étiquette,
et doit deviner lequel va avec quoi.

La cause est un emprunt : la puce `·` est un objet de **mise en page**. Elle
sépare visuellement deux informations que l'œil regroupe par proximité — un
mécanisme dont VoiceOver ne dispose pas. Recopiée dans une valeur
d'accessibilité, elle ne sépare plus rien ; elle est lue comme rien, ou comme
« point médian ».

### Inventaire des quatre sites

| Site | Ce que VoiceOver disait | Gravité |
|---|---|---|
| `FeedPostCard:839` | « Impressions, 1234 · 567 » | **le pire** — le nombre de vues n'est nommé par rien |
| `PostDetailView:1073` | « Vues et impressions, 567 · 1234 » | nomme les deux, mais **avalait le `@pseudo`** (`children: .ignore` sur le bloc qui le contenait) |
| `PostDetailView:1209` | « Vues et impressions, 567 · 1234` | appariement positionnel seul |
| `ReelFeedCard` / `ReelsPlayerView` | « Impressions, 1234 » puis « Vues, 567 » | **déjà corrects** |

Deux défauts s'y ajoutent, que le même geste solde :

**L'ordre divergeait.** `FeedPostCard` rend impressions→vues,
`PostDetailView` vues→impressions. Les mêmes deux nombres, dans deux ordres, sur
deux écrans entre lesquels le même utilisateur navigue — et un appariement qui
reposait justement sur l'ordre.

**`metricInline` et `statInline` étaient identiques au caractère près.**
`ReelFeedCard` et `ReelsPlayerView` portaient chacun sa copie du helper qui, lui,
faisait les choses correctement. Encore une paire de jumeaux — la famille que
234i→238i ont passé cinq itérations à réduire.

## Le correctif

`ReachMetricLabel` (app, `Features/Main/Components/`) : **un nombre, un élément,
un nom.**

Chaque métrique porte son propre libellé, donc l'ordre de rendu n'a plus à être
appris — « Vues, 567 » puis « Impressions, 1234 » se comprend dans les deux sens.
La puce qui les sépare à l'écran est marquée `.accessibilityHidden(true)` : elle
reste là où elle sert, et disparaît là où elle nuit.

Le composant est la **fusion** de `metricInline` et `statInline`, étendue aux
deux écrans qui ne l'avaient pas. **Zéro clé i18n neuve** : il réutilise
`feed.reel.views` et `feed.reel.impressions`, que `ReelFeedCard` et
`ReelsPlayerView` employaient déjà.

### La valeur parlée est exacte, la valeur affichée reste abrégée

Les deux divergent **volontairement**, et c'est la seule décision de conception
de ce lot :

| | Affiché | Dit à VoiceOver |
|---|---|---|
| 1 234 | `1,2 k` | `1 234` |
| 1 500 000 | `1,5 M` | `1 500 000` |

L'écran manque de place ; un lecteur d'écran n'a pas cette contrainte. Un abrégé
lu à voix haute est une **perte d'information pure** — « mille deux cent
trente-quatre » ne coûte rien de plus à écouter que « un virgule deux mille », et
« 1,2 k » vaut aussi bien pour 1 200 que pour 1 249.

La valeur exacte passe malgré tout par `formatted(locale:)` et non par
`"\(count)"` : c'est là qu'atterrit le défaut i18n que le pointeur 238i avait
identifié. L'interpolation gravait les chiffres latins pendant que le compteur
VISIBLE, localisé depuis 238i, rendait déjà des chiffres arabo-indiens en arabe —
**le même nombre s'écrivait de deux façons dans le même composant**.

### `PostReachFormatter` rétrécit

Son `Components` portait `views` / `impressions` sous forme de chaînes déjà
abrégées. Depuis que chaque métrique se rend par `ReachMetricLabel` — qui doit
recevoir le **compte** — ces deux chaînes n'étaient plus lues que pour leur
nullité. Les garder aurait laissé un second chemin de formatage vivant et non
rendu : **exactement la branche morte que 238i a trouvée dans `StatRing`**, et
qu'il aurait été incohérent d'y dénoncer pour l'introduire ici.

Il lui reste ce que lui seul décide : le pseudo, et le fait que les statistiques
soient réservées à l'auteur (`{ pseudo: String?, showsStats: Bool }`).

**Les tests de locale posés en 238i sur ce type ne sont pas supprimés — ils sont
DÉPLACÉS** vers `ReachMetricLabelTests`, où la règle vit maintenant. La
couverture change d'adresse, pas de volume.

## La garde

`AccessibilityValueAttributionGuardTests` (app, `Unit/Architecture/`), sur les
deux versants de l'idiome 238i :

- **Interdiction** — aucune `accessibilityValue` de l'app, de ses quatre
  extensions ou du SDK ne contient la puce visuelle, commentaires dépouillés (le
  doc-comment de `ReachMetricLabel` **cite** le code fautif).
- **Consolidation** — les 4 écrans de portée nomment `ReachMetricLabel(`.

Ne sont **pas** visées les valeurs composées dont la forme EST la donnée —
« 3 / 10 » pour un indicateur de page, « 42 % » pour une progression : le
séparateur y est sémantique, pas typographique, et l'ensemble se lit comme une
seule valeur. Seule la puce est bannie ; deux tests l'affirment.

La garde **se garde elle-même**, y compris son extracteur : un extracteur qui
n'extrairait rien rendrait l'interdiction inopérante en silence, donc un test
l'exerce sur un extrait fabriqué.

## Ce que la garde de 238i a attrapé — et qu'il ne fallait pas faire taire

En convertissant les quatre écrans, `CompactCountConsolidationSourceGuardTests`
**est passée au rouge** : sa liste d'hôtes exigeait que `FeedPostCard`,
`ReelFeedCard`, `PostDetailView` et `PostDetailReachAndVisibility` nomment
`CompactCountLabel.text(`, ce qu'ils ne font plus — l'appel a migré dans
`ReachMetricLabel`.

C'est la garde qui fonctionne, pas la garde qui gêne : elle a détecté qu'un
appelant de la source unique avait disparu, ce qui est **exactement** ce qu'on
lui demande. La liste passe de 8 à 5 hôtes, et cette réduction est documentée
dans le code : la règle est nommée **une fois de moins, pas moins souvent
respectée**, puisque les quatre écrans y accèdent maintenant par un
intermédiaire. Le versant **interdiction**, lui, n'a pas bougé et couvre toujours
tout le dépôt — c'est lui qui empêche une régression, pas la liste.

Réduire une telle liste sans vérifier qu'un intermédiaire applique encore la
règle serait la manière exacte de vider une garde de son sens.

## Vérification

Aucune toolchain Swift sous Linux — **gate réel = CI iOS Tests**, et la suite
COMPLÈTE (opt-in ` — run test` dans le sujet du commit, leçon 238i).

| Contrôle déterministe | Résultat |
|---|---|
| Garde 239i rejouée hors Swift sur les 6 racines | **1221 fichiers**, **0 puce** dans une valeur d'accessibilité, **4/4 écrans consolidés** |
| Extracteur de littéraux — trouve-t-il vraiment ? | **14** `accessibilityValue` extraites |
| Garde 238i (liste mise à jour) rejouée | **0 contrevenant**, **5/5 hôtes**, `citing == 5` |
| Équilibre `{}` / `()` / `[]` au tokenizer, 9 fichiers | 0 / 0 / 0 |
| Clés i18n neuves | **0** — réutilise `feed.reel.views` / `feed.reel.impressions` |
| `pbxproj` | non touché (globbing `project.yml` + `xcodegen generate` en CI) |

## Bilan

**5 fichiers prod modifiés**, **1 composant neuf** (`ReachMetricLabel`),
**1 suite neuve** (`ReachMetricLabelTests`), **1 garde neuve**
(`AccessibilityValueAttributionGuardTests`), **2 suites adaptées**
(`PostDetailReachAndVisibilityTests` rétrécie, garde 238i re-listée).
0 clé i18n neuve · 0 logique métier · 0 réseau · **0 changement visuel** — seul
ce que VoiceOver entend change.

## Suites (240i+)

1. **`MeeshyAppIntents.swift:272`** — **tâche macOS**, écartée cinq fois pour la
   même raison (`IntentDialog` se compose depuis `LocalizedStringResource`).
2. **Les compteurs de like / commentaire interpolent encore l'entier brut** —
   `FeedCommentsSheet:2354`, `PostDetailView:1640 / 1770 / 2262`. Même défaut de
   chiffres que celui soldé ici, autre composant (boutons d'action, pas portée).
   Volontairement hors périmètre : élargir aurait mélangé deux familles.
3. ~~**`feed.post.reach` laissée au catalogue**~~ — **DÉCISION ERRONÉE, corrigée
   dans ce même lot.** Voir « Le rouge qui m'a détrompé » ci-dessous : la clé est
   retirée.
4. **Trois fenêtres `prefix(1400)` subsistent** dans
   `ConversationDashboardViewAccessibilityTests` (`ArcGauge`, `periodPicker`,
   libellés de période). Même classe de fragilité que le `prefix(2600)` corrigé
   en 238i, mais ancrées sur des sites d'appel et non sur des déclarations de
   struct — la borne sémantique y demande un autre repère.
5. La forme `one` de `accessibility.unread_count` · relecture native des 6 formes
   arabes · effectif « 199+ » · tap VoiceOver du picker de transfert ·
   `InteractiveProgressBar` · frères du lot « transfert ».

---

## Historique CI — deux runs, zéro test exécuté

Ce lot a mis trois têtes à produire un verdict, et les deux premières n'ont
**rien exécuté du tout**. Le détail vaut d'être consigné : les deux causes sont
différentes, et aucune ne se voit dans la couleur du check.

### Tête `970b4b2f` — `main` ne compilait plus

Le sujet portait bien ` — run test`, la suite complète a donc été demandée. Elle
n'a pas pu démarrer : **« No result bundle produced »**, 97 erreurs de compile,
**toutes dans un seul fichier qui n'est pas de ce lot** —
`MeeshyTests/Unit/Composer/PasteDestinationTests.swift`, `cannot find
'PasteDestination' in scope`.

`git grep` sur tout `origin/main` ne trouvait alors `PasteDestination` que dans
ce test et un document de plan. **Pas une ligne de production.** Le commit
fautif l'annonçait dans son propre sujet — `6127d311a` « **tasks,test**(composer)… » —
et le plan qu'il cite intitule son étape 1 « Tests rouges ». Un pas TDD RED
parfaitement légitime… **sur une branche**.

La distinction est celle qui compte :

| | Test rouge (assertion) | Type manquant |
|---|---|---|
| Le bundle compile | oui | **non** |
| Tests exécutés | 7534, dont 1 rouge | **0** |
| Portée | la suite concernée | **toute la piste iOS** |

Un RED qui échoue sur une assertion laisse les autres tourner. Un RED qui
référence un type inexistant empêche le bundle de **lier** : plus aucun test iOS
ne s'exécute, sur `main` comme sur toutes les PR qui en descendent. Signalé en
commentaire de PR, **sans mettre le test en quarantaine** (proscrit) et **sans
inventer `PasteDestination`** (ce serait deviner une conception qui appartient à
la piste composer).

### Tête `17d25455` — verte, et toujours zéro test

La piste composer a livré `PasteDestination.swift` ; `main` recompile. Une
fusion de `main` a été poussée sur la branche pour rejuger l'arbre réellement
fusionné — **mais son sujet ne portait pas l'opt-in**. Le check est donc revenu
`Build app (app + cibles de test)` : **compile seule**, verte, posée sur une PR
qui affiche 17/17.

C'est exactement le piège documenté en 238i, réarmé par une main tierce. Et il
est plus insidieux ici : la PR **paraît** intégralement verte alors que ses deux
apports — six tests de `ReachMetricLabelTests`, cinq de la garde — n'ont
**jamais** été exécutés, ni sur cette tête ni sur aucune autre.

**Règle qui se dégage : sur une PR dont l'apport EST une suite ou une garde, le
verdict ne se lit pas dans la couleur mais dans le NOM du check, et il faut le
revérifier après CHAQUE poussée, y compris celles qu'on n'a pas faites soi-même.**

### Contrôles rejoués sur l'arbre fusionné, avant la troisième tête

`main` ayant beaucoup avancé (les deux gardes balaient tout le dépôt), les
mesures sont refaites et non reconduites :

| Contrôle | Résultat |
|---|---|
| Garde 239i sur les 6 racines | **1228 fichiers**, **0 puce**, **4/4 écrans consolidés** |
| Extracteur de littéraux | **14** `accessibilityValue` extraites |
| Garde 238i (liste à 5 hôtes) | **0 contrevenant**, **5/5 hôtes** |
| Les 9 fichiers de 239i après la fusion tierce | intacts (composant, 4 écrans, formatter, 2 suites, garde re-listée) |


---

## Le rouge qui m'a détrompé — `feed.post.reach`

La première exécution réelle de la suite a rougi sur
`LocalizationConsistencyTests.test_everyAppCatalogIdentifierKeyIsReferencedInCode` :

```
These app-catalog identifier keys are never referenced in code (dead keys):
feed.post.reach
```

**J'avais explicitement décidé de laisser cette clé**, en écrivant que « le
cliquet ne compte que les clés RÉFÉRENCÉES depuis les sources, elle en sort donc
d'elle-même » et qu'« en retirer une du catalogue est ce qui a cassé `main` en
236i ». Les deux moitiés du raisonnement étaient fausses ici :

1. **Le cliquet n'est pas la seule garde.** J'avais vérifié
   `test_untranslatedKeyBacklogDoesNotGrow` (qui, lui, ne compte bien que les
   clés référencées) et parcouru `LocalizationCatalogGuardTests`. Mais la garde
   qui compte est ailleurs, dans `LocalizationConsistencyTests`, et elle
   applique la contrainte **inverse** : aucune clé du catalogue ne doit rester
   sans appelant. Mon `grep` cherchait `orphan|unused.*key|cleUtilisee` — trois
   formulations, aucune ne correspondant au nom anglais réel de la garde.
2. **236i disait le contraire de ce que j'en ai tiré.** Là-bas, une clé avait été
   retirée **alors qu'un site la référençait encore** — le défaut était le
   RÉFÉRENCEMENT ORPHELIN, pas la suppression. Ici, plus rien ne la référence :
   la retirer est exactement ce que le dépôt exige.

Correctif : suppression chirurgicale de l'entrée (47 lignes, JSON revalidé, une
seule clé retirée sur 3312 — les 3311 autres intactes au caractère près).

**Leçon : « je n'ai pas trouvé de garde » n'est pas « il n'y a pas de garde ».**
Un `grep` sur trois formulations devinées ne prouve rien ; ce qui l'aurait prouvé,
c'est de lister les tests qui LISENT le catalogue. Et une leçon passée invoquée
de mémoire doit être relue : celle de 236i disait l'inverse de l'usage que j'en
ai fait.
