# iOS UI/UX — Iteration 227i

**Date** : 2026-07-27
**Surface** : `apps/ios/Meeshy/Features/Main/Views/AudioFullscreenView.swift`
**Axe** : Accessibilité motrice — plancher HIG 44 pt
**Base** : `main` HEAD `913d8cc90`

## Contexte

Suite de la doctrine ouverte par 221i (`MiniAudioPlayerBar`) et 223i
(`FriendRequestListView`, #2370) : *la zone tapable d'un `Button` est exactement
la zone de layout de son label.* 223i listait explicitement le reste de
l'inventaire à traiter **au cas par cas**.

**Numéro 227i** : plus haut **mergé** dans `main` = 226i ; en vol = 223i (#2370),
224i (#2369), 226i (#2411). Choisi strictement au-dessus du plus haut mergé,
conformément à la leçon consignée après les deux collisions de la veille.
`AudioFullscreenView.swift` n'est touché par **aucune** PR ouverte.

## Méthode — et un faux positif instructif

Un balayage naïf (« `.frame` < 44 pt à portée d'un `Button` ») rend **63 sites**.
Vérification manuelle des trois pires : **tous faux positifs**.

| site | mesure | réalité |
|---|---|---|
| `ConversationView+Header:248` | 7×7 | pastille de présence **dans** un `HStack` (le bouton fait toute la rangée) |
| `StoryLanguageDetailView:172` | 8×8 | pastille de couleur de langue, idem |
| `StoryLanguageQuickBar:123` | 14×2 | soulignement d'état actif en `overlay` |

**Le petit cadre décoratif à l'intérieur d'un grand label ne dit rien de la cible.**
Le défaut réel est le cas où le cadre dimensionne **tout** le label — un bouton
icône-seule. Ne jamais convertir un balayage brut en liste de défauts sans
vérifier chaque site.

## Écarts constatés (vérifiés un par un)

Trois contrôles chrome de `AudioFullscreenView` — le lecteur audio plein écran —
sont des boutons icône-seule dont le label entier est sous le plancher :

| Contrôle | Cible réelle | Plancher | Écart |
|---|---|---|---|
| **Fermer** (`xmark`) | 36×36 | 44 | −18 % |
| Enregistrer (`arrow.down.to.line`) | 36×36 | 44 | −18 % |
| Traduire (`translate`) | **26×26** | 44 | **−41 %** |

Le bouton **Fermer est la seule sortie du plein écran** : un tap manqué ne fait
pas « rien », il piège l'utilisateur sur l'écran. Même gravité que le chevron de
retour traité en 223i.

Les commentaires en place (« figé, doctrine 82i / 86i ») portaient sur le **gel
face au Dynamic Type** — une préoccupation de *taille de glyphe*, pas de *cible*.
Les deux passes sont orthogonales ; la seconde n'avait jamais été faite ici.

## Correctif (227i)

Doctrine de 223i, appliquée telle quelle — la pastille visible ne bouge pas, on
enveloppe :

```swift
.frame(width: 36, height: 36)          // pastille visible — INCHANGÉE
.background(Circle().fill(…))
.frame(width: 44, height: 44)          // cible tapable
.contentShape(Circle())
```

`.contentShape` est porteur : sans lui, l'anneau transparent entre la pastille et
le bord 44 pt ne participe pas de façon fiable au hit-testing.

**Coût de layout borné, sans changer d'espacement.** Les deux contrôles chrome de
`topBar` sont encadrés par des `Spacer()` qui absorbent les +8 pt : aucun
resserrement. Le bouton Traduire (+18 pt) partage sa rangée avec une `ScrollView`
horizontale de pastilles de langue — flexible, et qui défile déjà. **Zéro pixel de
différence sur les pastilles elles-mêmes.**

## Vérification

`apps/ios/MeeshyTests/Unit/Views/AudioFullscreenTouchTargetTests.swift` — 5 tests,
8 assertions, sur source **dépouillée de ses commentaires** (un commentaire citant
`frame(width: 44…)` ne doit jamais satisfaire une assertion).

**Span mesuré, pas deviné** : `.contentShape` se trouve à 299 / 326 / 315
caractères de son ancre. Ma première rédaction utilisait 260 — deux assertions
tombaient en FAIL *sur le correctif correct*. Le piège exact que 216i et 223i
avaient consigné ; les distances sont désormais écrites dans le code du test.

RED **recalculé contre `git show origin/main:`**, pas supposé :

```
                          main(RED)   branche(GREEN)
close 44 + contentShape      FAIL          PASS
save 44 + contentShape       FAIL          PASS
translate 44 + contentShape  FAIL          PASS
pastilles 36 pt == 2         PASS          PASS
pastille 26 pt == 1          PASS          PASS
libellés a11y conservés      PASS          PASS
                             3/6           6/6
```

Les 3 assertions déjà vertes sur `main` sont exactement **les invariants que le
correctif doit préserver** : la passe motrice ne doit coûter ni la taille des
pastilles (gel Dynamic Type 82i/86i) ni la passe lecteur d'écran.

Équilibrage accolades/parenthèses/crochets : 0/0/0. Pas de toolchain Swift dans
l'environnement → gate = CI `iOS Tests`. Nouveau fichier de test → repris par
`xcodegen generate`, **0 édition de `project.pbxproj`**.

## Statut

Les trois contrôles de `AudioFullscreenView` sont soldés. Ne plus les re-flagger.

## Reste à faire (228i+)

- **L'inventaire complet demande une détection correcte.** Le balayage brut (63
  sites) est inexploitable tel quel. Un détecteur utile doit exiger que le cadre
  dimensionne **tout** le label du bouton, en tolérant une forme de fond
  (`.background(Circle())`, `.adaptiveGlassProminent(in:)`) — sinon il rate les
  vrais cas *et* rend des dizaines de faux positifs. À écrire avant la prochaine
  passe motrice, sinon chaque itération repaiera ce tri à la main.
- Sites vérifiés au passage et **réels**, non traités ici : `MyStoriesView:162`
  (32×32, « Créer une story », action principale de l'écran),
  `ConversationMediaGalleryView:333/368` (40×40 ×2).
- `MessageOverlayMenu.videoControls` (14×14) reste écarté avec le raisonnement de
  223i : six éléments dans une largeur bornée par la bulle, +71 pt non vérifiable
  sans simulateur.
- **Évaluée et écartée** : migration de `MemberManagementSection.emptyState` vers
  `EmptyStateView(compact:)`. L'état vide en place est déjà correct (glyphe
  `accessibilityHidden`, libellé localisé, `.combine`) ; migrer imposerait
  d'inventer un `subtitle` — donc une clé i18n neuve sous cliquet actif — et de
  restyler. Ce serait une refonte, pas une correction. Piste close.
