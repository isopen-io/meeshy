# Iteration-238i — fermeture de la famille « abrégé compact », et la garde qui empêche la huitième copie

**Date** : 2026-08-23
**Piste** : iOS (suffixe `i`)
**Surfaces** : `FeedPostCard` · `ReelFeedCard` · `ReelsPlayerView` · `PostDetailView` + `PostReachFormatter` · `ConversationDashboardView` (`formatNumber` + `StatRing`)
**Base** : `main` HEAD `2e24d7cc`
**Branche** : `claude/intelligent-noether-4m5rwq`

## Pourquoi cette surface

Suite explicite de 237i, qui a posé `CompactCountLabel` (source unique de
l'abrégé, rendu par CLDR) et a écrit : « `CompactCountLabel` est en place pour
les recevoir en 238i ». Six sites restaient.

Vérifications préalables : **0 PR iOS ouverte** (#3352, gateway, est la seule).
Plus haute itération mergée = **237i** ; celle-ci est donc **238i**. Contrôle
imposé par la leçon 237i : j'ai vérifié que 237i a atterri **en entier** sur
`main` — `CompactCountLabel.swift`, sa suite, et les deux sites d'appel
(`ConversationListHelpers:456,462` app et `CommunityListView:289,296` SDK).
Rien n'a été perdu au merge.

## Le défaut, et ce qu'il faut en dire de plus que 237i

Le défaut de rendu est celui que 237i a documenté et que je ne redémontre pas :
`String(format:)` appelé **sans locale** formate en POSIX — point décimal là où
cinq des sept langues livrées écrivent une virgule, suffixe latin gravé dans une
interface arabe.

Ce que 238i ajoute, c'est le **compte**. La règle a existé en **sept copies** :

| Site | Forme |
|---|---|
| `ConversationListHelpers` → `ThemedCommunityCard` | traité en 237i |
| `CommunityListView` → `VibrantCommunityCard` (SDK) | traité en 237i |
| `FeedPostCard.compactCount` | 1M / 1k |
| `ReelFeedCard.compactCount` | 1M / 1k |
| `ReelActionButton.compact` (`ReelsPlayerView`) | 1M / 1k |
| `PostReachFormatter.compact` | 1M / 1k |
| `StatRing.displayValue` (`ConversationDashboardView`) | 1M / **10k** / 1k |
| `ConversationDashboardView.formatNumber` | 1M / **10k** / `formatted()` |

Aucune copie ne s'écartait de la règle — elles la **répétaient**. C'est ce qui
explique la propagation : chaque nouvelle surface recopiait sa voisine plutôt
que d'appeler quoi que ce soit. Et c'est pourquoi trois itérations de
consolidation (234i, 236i, 237i) ont chacune corrigé les copies qu'elles
voyaient sans jamais empêcher les suivantes.

## L'arbitrage que 237i avait différé, et comment il se tranche

237i a écarté ces six sites au motif qu'ils « ne sont pas byte-identiques : le
tableau de bord bascule à `>= 10_000` là où le feed bascule à `>= 1_000` —
consolider demande donc de trancher si ce seuil est **intentionnel**, ce qui est
une décision produit ». Le motif était juste ; la portée trop large. Le doute
portait sur **deux** sites, pas six — et les deux se tranchent à la lecture.

**`formatNumber` : le seuil est réel, et sa preuve est la branche EN DESSOUS.**

```swift
if n >= 10_000 { return String(format: "%.1fk", …) }
if n >= 1_000  { return n.formatted() }     // « 3 452 », entier et groupé
```

Ce compteur rend un nombre de **mots** (unique appel, l. 676 : « %@ mots »). La
règle produit n'est pas « abrège à 10 000 » — c'est « ne dégrade pas un compte
de mots tant qu'il reste lisible » : « 3 452 mots » informe, « 3,5 k mots » ne
dit plus rien. Le seuil est **conservé**. Seul l'abrègement, au-dessus, est
délégué.

**`StatRing.displayValue` : le même seuil y est MORT.**

```swift
if value >= 10_000 { return String(format: "%.1fk", Double(value) / 1_000) }
if value >= 1_000  { return String(format: "%.1fk", Double(value) / 1_000) }
```

Les deux branches sont identiques au caractère près. Le seuil de 10 000 n'y
décide de rien, et n'a survécu à trois relectures que parce qu'il ne changeait
rien. `StatRing` abrège donc bel et bien dès le millier — ce qui est d'ailleurs
le bon comportement pour lui : il rend son nombre **au centre d'un cercle de
5 pt de trait**, où « 1 234 » déborde.

Les deux seuils restants (1 000 pour l'anneau, 10 000 pour le compte de mots)
sont donc **tous deux intentionnels**, chacun pour sa contrainte propre. Je ne
les unifie pas : ce serait la vraie décision produit, et elle n'a pas lieu
d'être prise en passant.

## Le correctif

Les six sites appellent désormais `CompactCountLabel.text(_:locale:)`. Les six
helpers maison disparaissent — aucun n'est remplacé par un délégué portant un
second nom pour la même règle.

Deux points méritent d'être dits :

**1. `PostReachFormatter.components` prend une `locale`.** C'est le seul des six
sites qui soit sous test unitaire, et sa suite pinnait les chaînes exactes
(« 1.2k », « 3.4M »). Sans paramètre, elle jugerait la locale du **simulateur** :
verte en local, rouge en CI. Même doctrine que `MembersCountLabel` (234i),
`UnreadCountLabel` (236i) et `CompactCountLabel` lui-même.

**2. Le repli sous 1 000 de `formatNumber` passe aussi par `formatted()`.**
`"\(n)"` gravait les chiffres latins alors que la bande juste au-dessus rendait
déjà les chiffres de la locale : le **même compteur** changeait de système
d'écriture en arabe en passant de 999 à 1 000. Ce n'était pas dans le périmètre
annoncé, mais c'est le même défaut, dans la même fonction, sur la ligne d'à côté.

## La garde — ce qui distingue 238i des trois itérations qui l'ont précédée

234i, 236i et 237i ont chacune corrigé ce qu'elles voyaient. Aucune n'a empêché
la suivante. `CompactCountConsolidationSourceGuardTests` (app,
`Unit/Architecture/`) ferme la famille, sur les deux versants :

- **Interdiction** — aucun fichier Swift de l'app, de ses quatre extensions ou
  du SDK ne contient les littéraux `"%.1fk"` / `"%.1fM"`, commentaires dépouillés
  (le doc-comment de `CompactCountLabel` **cite** le code qu'il remplace : sans
  dépouillement, la garde rougirait sur la source unique elle-même).
- **Consolidation** — les **8** fichiers hôtes nomment `CompactCountLabel.text(`.
  Sans ce versant, la garde resterait verte si quelqu'un supprimait purement et
  simplement les compteurs.

Deux formats voisins ne sont **pas** visés, et le motif est écrit **avec ses
guillemets** pour ne pas les attraper : `"%.1fMB"` (taille de fichier,
`MeeshyVideoPlayer+Renderers`) — l'unité suit le M, donc le guillemet fermant ne
le suit pas — et `" bwe=%.1fMbps"` (trace de débit WebRTC, jamais affichée).
Une garde qui rougirait sur une taille de fichier serait désarmée à la première
exception ajoutée ; deux tests l'affirment explicitement.

La garde **se garde elle-même**, selon l'idiome de `RightToLeftLayoutGuardTests` :
si le balayage ou le dépouillement cassait, les deux versants passeraient au vert
pour la mauvaise raison — en n'inspectant plus rien. Un test vérifie donc que le
balayage voit > 400 fichiers et que les appels à la source unique y sont bien
détectés ; un autre, que le dépouillement n'avale pas les littéraux.

## Changement visuel — assumé et tabulé

| Site | Valeur | Avant (toutes locales) | Après (en) | Après (fr) |
|---|---|---|---|---|
| Feed / Réels / Détail (portée, vues, impressions) | 1 500 | `1.5k` | `1.5K` | `1,5 k` |
| — | 1 000 | `1.0k` | `1K` | `1 k` |
| `StatRing` | 12 000 | `12.0k` | `12K` | `12 k` |
| `formatNumber` (mots) | 3 452 | `3 452` | `3,452` | `3 452` |
| `formatNumber` (mots) | 12 000 | `12.0k` | `12K` | `12 k` |
| tous | 999 | `999` | `999` | `999` |

La casse du « K », la disparition de la décimale nulle et l'espace insécable
français viennent de CLDR, pas d'un choix que je pose. Sous le millier, rien ne
bouge nulle part.

## Vérification

Aucune toolchain Swift sous Linux — **gate réel = CI iOS Tests**. Contrôles
déterministes exécutés ici :

| Contrôle | Résultat |
|---|---|
| Garde rejouée hors Swift (port fidèle de `AppSourceGuard.stripComments`) sur les 6 racines | **1216 fichiers**, **0 contrevenant**, **8 hôtes consolidés** |
| Équilibre `{}` / `()` / `[]` au tokenizer (littéraux + commentaires) — 9 fichiers | 0 / 0 / 0, mode final `code` |
| `compactCount` / `PostReachFormatter.compact` / `ReelActionButton.compact` — occurrences vivantes | **0**, `grep` sur le **dépôt entier** (leçon 236i/237i) |
| Imports `MeeshyUI` aux 6 sites d'appel | présents (ajouté dans `PostDetailReachAndVisibility`, seul fichier qui ne l'avait pas) |
| Clés i18n neuves | **0** — le cliquet de couverture ne bouge pas |

**`pbxproj` non touché, et c'est le comportement voulu** : `MeeshyTests` est
déclaré en globbing récursif dans `project.yml`, la CI lance `xcodegen generate`
avant de builder (`ios.yml:347`), et `ensure_project_is_current` régénère en
local sur dérive constatée. Le pbxproj est un artefact ; l'éditer à la main est
proscrit par `apps/ios/CLAUDE.md`, et `xcodegen` n'existe pas sous Linux.

### Ce que la suite de `PostReachFormatter` a le droit d'affirmer

Elle ne nomme **plus** les chaînes rendues. Les chaînes CLDR appartiennent à
Foundation et peuvent évoluer d'une version d'iOS à l'autre : les figer
produirait une suite qui rougit sur une mise à jour d'OS sans qu'aucun défaut
n'existe. Elle teste les **propriétés** :

| Propriété testée | Ancien code | Attendu |
|---|---|---|
| le rendu dépend de la locale | non — identique partout | **oui** |
| le rendu est celui de la source unique | non — copie locale | **oui** |
| sous 1000, le compte exact | oui | oui |
| magnitudes distinctes | oui | oui |
| contrat auteur / non-auteur / pseudo vide | oui | oui |

La **première ligne est LA régression** : l'invariance à la locale *était* le
bug, donc la variance en est la preuve — `fr.views != en.views` aurait échoué
avant ce correctif et passe après, sans nommer une seule chaîne CLDR.

## Bilan

**6 fichiers prod modifiés** (6 helpers maison supprimés, −30 lignes de règle
dupliquée), **1 doc-comment SDK** mis à jour (`CompactCountLabel` déclare son
rôle de source unique et nomme sa garde), **1 suite réécrite**
(`PostDetailReachAndVisibilityTests`, propriétés au lieu de chaînes), **1 suite
neuve** (`CompactCountConsolidationSourceGuardTests`, 5 tests, deux versants +
auto-garde).
0 clé i18n neuve · 0 logique métier · 0 réseau · 0 changement de placement SDK ·
**changement visuel assumé et tabulé ci-dessus**.

## Suites (239i+)

Reprise du pointeur 237i, moins ce qui est soldé ici :

1. **`MeeshyAppIntents.swift:272`** — dernière occurrence de l'idiome
   `? "s" : ""` proscrit depuis 185i, et seule hors SwiftUI. **Demande un
   compilateur** : `IntentDialog` se compose depuis `LocalizedStringResource`.
   Écartée pour ce motif par 235i, 236i, 237i et 238i — quatre fois. Elle ne se
   traitera pas depuis un conteneur Linux : la marquer comme **tâche macOS**
   plutôt que la reporter une cinquième fois.
2. **La forme `one` de `accessibility.unread_count`** grave son « 1 » alors que
   la règle CLDR française range **0 ET 1** dans `one` — inatteignable derrière
   les gardes `> 0`.
3. **Les `accessibilityValue` des compteurs de portée** interpolent l'entier brut
   (`"\(count)"`) sur 4 sites (`FeedPostCard`, `ReelFeedCard`, `ReelsPlayerView`,
   `PostDetailView`). VoiceOver lit donc des chiffres latins en arabe. Volontairement
   hors périmètre ici : la valeur d'accessibilité doit rester **exacte** (c'est
   bien pourquoi elle n'est pas abrégée), la question est seulement celle du
   système d'écriture — `count.formatted(locale:)` la trancherait.
4. **Relecture native des 6 formes arabes** posées en 231i/232i/236i.
5. **Effectif plafonné « 199+ »** et sa `substitutions` (carry-over 234i,
   simulateur).
6. **Tap de ligne VoiceOver du picker de transfert** — carry-over 230i→237i,
   simulateur.
7. **`InteractiveProgressBar`** (carry-over 233i) — 8 boutons au label vide,
   position portée par la seule couleur, cibles de 5–8 pt contre 44 pt HIG.
   Simulateur + arbitrage.
8. **Frères jamais audités du lot « transfert »** : `MessageMoreSheet` (504 l.),
   `MessageForwardService`, `MessageForwardDetailView`, `ForwardPickerViewModel`.

## Complétion

La famille « abrégé compact composé à la main » est **close**. Les 7 copies sont
supprimées, la source unique est nommée par ses 8 hôtes, et
`CompactCountConsolidationSourceGuardTests` interdit la réintroduction sur
l'app, ses quatre extensions et le SDK. Les itérations suivantes n'ont pas à
re-balayer cette famille : la garde est le balayage.

---

## Résultat CI — et ce que la suite complète a réellement appris

**PR [#3364](https://github.com/isopen-io/meeshy/pull/3364)** · têtes successives `4c2512f2` → `e678a9e0` → `e28fcc8a` → `819d49c2` → **`4d9ee573`** (fusion de `main`).

### Le premier run n'a rien exécuté, et il fallait le voir

Le run initial est revenu **tout vert** — mais sous le nom
`Build app (app + cibles de test)`, pas `Build app + tests unitaires`. Ces deux
noms sont le **même job** (`ios.yml:250`), nommé dynamiquement selon
`needs.scope.outputs.run_tests` ; `scope` ne l'active que sur poussée réelle
sur `main`, `workflow_dispatch`, ou le motif `smoke test|run test|to test` dans
le **SUJET** du commit de tête (le corps ne compte pas).

Autrement dit : un lot dont l'apport tient à **une garde neuve et une suite
réécrite** était sur le point d'être annoncé vert sans qu'aucun des deux
fichiers n'ait été exécuté. C'est littéralement la « suite verte par omission »
de la leçon 236i, par un autre chemin — non plus le pbxproj, mais la portée du
run. Le sujet du commit a donc été amendé (` — run test`, convention observée
sur 5 des 200 derniers commits de `main`), même arbre, force-push sur ma propre
branche. Pas de commit vide.

### Ce que la suite a trouvé : 2 échecs sur 7534

| Test | Verdict |
|---|---|
| `ConversationDashboardViewAccessibilityTests.test_statRing_isSingleVoiceOverElement_withLabelAndValue` | **à moi** — corrigé `e28fcc8a` |
| `CallManagerSocketReconnectMediaResyncTests.test_socketReconnect_reEmitsCallJoin` | **rouge sur `main`** — signalé, non corrigé |

### Le mien : une garde qui rougit sur du code correct

`.accessibilityValue("\(value)")` était **intact et inchangé par ce lot**. La
garde découpait le corps de `StatRing` avec `prefix(2600)` — un nombre magique.
Le doc-comment posé sur `displayValue` a déplacé le motif de l'offset **2411 à
2595** ; le motif faisant 30 caractères, sa **fin** est passée hors fenêtre et
`contains` a rendu `false`.

**La marge résiduelle sur `main` était de 5 caractères.** N'importe quelle
édition de `StatRing` l'aurait déclenchée — mon lot n'a pas créé le défaut, il
l'a révélé.

Deux corrections étaient possibles : raccourcir mon commentaire pour repasser
sous 2600, ou borner sémantiquement. La première réarme le piège avec **encore
moins** de marge ; c'est la seconde qui est retenue — `structBody(named:in:)`
borne à la déclaration suivante. Pas de marge à épuiser, et pas de faux vert
possible : la borne s'arrête AVANT `ArcGauge`, qui porte le même
`.accessibilityElement(children: .ignore)` et satisferait donc les assertions
pour la mauvaise struct. `test_statRingBody_isBoundedToItsOwnStruct` vérifie
les deux sens.

Ce n'est pas un affaiblissement : la fenêtre passe de 2600 (arbitraire) à 2656
(l'étendue exacte de la struct), et les 3 assertions d'origine sont conservées
mot pour mot.

### L'autre : rouge sur la base

`CallManager.swift` est **identique à `main`** dans ce lot (`git diff origin/main`
→ 0 ligne). La garde lit le fichier sur disque : elle échoue donc à l'identique
sur `main`. Cause : **`60f94f99`** (Vague 162) a renommé l'émission en
`emitCallJoinWithAckDetailed(callId:)` sans mettre à jour le motif
`emitCallJoinWithAck(callId:` de la garde. Les 3 tests frères passent — ils
cherchent `emitCallToggleVideo` / `emitCallToggleAudio`, que le renommage n'a
pas touchés, ce qui explique qu'un seul des quatre soit rouge.

Correctif proposé en commentaire de PR (`body.contains("emitCallJoinWithAck")` —
le préfixe couvre les deux noms et continue d'exiger la variante **avec ack**),
**à porter par la piste calls** : élargir une PR UI/UX jusqu'à la pile d'appels
serait le mauvais arbitrage, et la règle de conduite sur un rouge de base est de
signaler, pas de pousser.

### État final

**17 checks verts** (Quality/Security/Build bun, gateway, web, shared, agent,
Python, Voice API, Audio, TTS-STT, Prisma, Summary, Portée, `sdk-tests` phase 0,
Trivy neutre, Voice E2E sauté) · **1 rouge, rouge sur `main`**.

**Tout ce que ce lot apporte est exécuté et vert** — y compris les 5 tests de
`CompactCountConsolidationSourceGuardTests` et les 7 de
`PostDetailReachAndVisibilityTests` réécrits, qui n'avaient jamais tourné au
premier run.

### Verdict final — suite complète contre la base courante

Tête **`4d9ee573`** (fusion de `main` jusqu'à `2faff711`, 17 commits, zéro
conflit, aucun fichier de 238i touché) :

**7529 passés · 1 échec · 5 sautés · 7535 au total.**

L'unique échec est le rouge de base des appels, revérifié contre `2faff711` :
toujours rouge, toujours pas de ce lot. **Tout ce que 238i apporte est vert.**

### Le piège qui a rendu cette fusion nécessaire

Le commit de docs précédent (`819d49c2`) ne touchait ni `apps/ios/**` ni
`packages/MeeshySDK/**` — j'en avais conclu que le workflow iOS ne se
déclencherait pas. **Faux** : sur un événement `pull_request`, GitHub évalue le
filtre `paths` sur l'**ENSEMBLE des fichiers de la PR**, pas sur la poussée. La
tête a donc reçu un `Build app (app + cibles de test)` vert — compile seule —
posé par-dessus le run complet de `e28fcc8a`. Un relecteur y aurait lu
« tests verts ».

La fusion de base, dont le sujet porte l'opt-in ` — run test`, corrige les deux
d'un coup : elle resynchronise ET fait juger la tête par la suite complète.

**Conséquence pratique pour la suite de cette PR** : tout commit ajouté ensuite,
fût-il purement documentaire, reposera un vert compile-seule sur la tête. Le
verdict qui fait foi reste celui de `4d9ee573`, dernier commit à avoir été jugé
par la suite complète — et le seul après lequel aucun code n'a changé.
