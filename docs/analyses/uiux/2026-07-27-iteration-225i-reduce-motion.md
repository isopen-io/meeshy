# iOS UI/UX — Iteration 225i

**Date** : 2026-07-27
**Surfaces** : `ThemedConversationRow.TypingDotsView`, `SyncPill.statusDot`
**Axe** : Accessibilité — Reduce Motion (WCAG 2.3.3, Apple HIG)
**Base** : `main` HEAD `68a1a33f9`

## Pourquoi cet axe

Le lot « cibles tactiles » ouvert par 221i (#2363, mergée) est désormais suivi
par **deux** agents : #2370 porte 223i (`FriendRequestListView`) et **réserve
explicitement 224i** pour `MessageOverlayMenu.videoControls`, avec un
raisonnement solide (six éléments dans une rangée bornée par la largeur de
bulle, ~+71 pt, risque de troncature du libellé de temps et de la puce de
vitesse, et probable décision de design — supprimer le compteur `%` redondant).
**Forcer ce site à l'aveugle serait précisément ce que ce raisonnement écarte.**

Après avoir vu 219i fermée en doublon, la règle retenue est simple : ne pas
devenir le troisième agent d'un même couloir. 225i change donc d'axe — Reduce
Motion, exigé par la routine, non traité, et sans PR ouverte.

## Le défaut

`.repeatForever` est la seule famille d'animation qui **ne s'arrête jamais
d'elle-même** : elle tourne tant que la vue est à l'écran. C'est exactement ce
que le réglage **Réduire les animations** existe pour interrompre — les
utilisateurs l'activent parce que le mouvement soutenu déclenche vertiges,
nausées ou migraines (troubles vestibulaires). WCAG 2.3.3 et le HIG d'Apple
demandent tous deux de l'honorer.

Inventaire : **22 fichiers utilisent `.repeatForever`, 11 seulement portent une
garde `reduceMotion`.** Les **11 restants** animent sans condition.

Les deux surfaces traitées ici sont celles que l'utilisateur **ne peut pas
éviter** :

| Surface | Animation | Exposition |
|---|---|---|
| `TypingDotsView` | 3 points en `scaleEffect` 0.5↔1.0 + `opacity` 0.4↔1.0, `repeatForever(autoreverses:)`, décalés de 0,18 s | **liste des conversations**, dès que quelqu'un écrit |
| `SyncPill.statusDot` | `opacity` 0.4↔1.0, `repeatForever(autoreverses:)` ×2 branches | **chrome persistant** de l'app |

Aucune des deux n'est dismissible. Ce sont les pires endroits où ignorer le
réglage, et ni l'une ni l'autre ne le consultait.

## Correctif

Idiome déjà en place au dépôt (`FloatingCallPillView:100`,
`ReelAudioBackdrop:13`) : `@Environment(\.accessibilityReduceMotion)`.

```swift
.animation(reduceMotion ? nil : Animation.easeInOut(…).repeatForever(…), value: …)
```

**L'animation est mise à `nil`, pas raccourcie.** Une animation répétée dont on
réduit la durée ne s'arrête toujours pas — elle bat simplement plus vite. Seul
`nil` supprime le mouvement.

### Le point non évident : geler à la bonne phase

Les deux indicateurs encodaient leur **sens** (« quelqu'un écrit »,
« synchronisation ») en partie *dans* l'animation : la phase basse vaut 0.4
d'opacité et 0.5 d'échelle. Gelés à cette phase, les points auraient l'air
**désactivés** — le réglage aurait coûté l'information.

Le repos est donc forcé à la phase **haute** (`1.0`), pas à l'état initial de la
`@State`. Sans mouvement, mais parfaitement lisibles :

```swift
.scaleEffect(reduceMotion ? 1.0 : (isAnimating ? 1.0 : 0.5))
.opacity(reduceMotion ? 1.0 : (isAnimating ? 1.0 : 0.4))
```

et côté pill, `pulseOpacity` devient `reduceMotion ? 1.0 : (dotPhase % 2 == 0 ? 1.0 : 0.4)`.

`TypingDotsView` est une **vue feuille** rendue une fois par rangée de liste :
`@Environment` (et non un singleton observé) respecte la règle « Zero
Unnecessary Re-render » du dépôt, qui recommande explicitement cette voie.

## Résultat

2 fichiers de production, **+25 / −8 lignes** (dont ~12 de commentaire de
doctrine). 0 clé i18n, 0 couleur, 0 métrique de layout, 0 logique, 0 réseau.

**Aucun changement pour qui n'a pas activé le réglage** : les trois ternaires
retombent exactement sur les valeurs d'origine quand `reduceMotion == false`.
Le seul comportement modifié est celui demandé par l'utilisateur.

## Vérification

- Pas de toolchain Swift sous Linux → 6 assertions vérifiées par correspondance
  de chaînes, **RED recalculé contre `git show origin/main:…`** plutôt que
  supposé : **0/6 sur `main`**, **6/6 après correctif**.
- Le matcher **normalise les blancs** après avoir retiré les commentaires : une
  assertion doit décrire le *code*, pas les retours à la ligne choisis par un
  formateur — le ternaire multi-ligne de `TypingDotsView` doit se lire comme un
  ternaire d'une ligne. (Première version du test : faux négatif exactement
  là-dessus, corrigé plutôt que contourné en reformatant la source.)
- Équilibre accolades / parenthèses / crochets des 3 fichiers au tokenizer :
  **0 / 0 / 0**.
- Fichier de test neuf → enregistré par `xcodegen generate`, **0 édition de
  `project.pbxproj`**. `ReduceMotionComplianceTests` ne matche aucun token de
  `FINAL_PHASE_CLASS_PATTERN` → phase 1.
- Gate réel = CI `iOS Tests`.

## Piste 226i+ — les 9 fichiers restants

`.repeatForever` sans garde, par ordre de densité :
`OnboardingAnimations.swift` (**23 occurrences** — tout le premier lancement,
le plus gros morceau et sans doute une itération à lui seul),
`MessageEffectModifiers.swift` (3), `BubbleCallNoticeView.swift` (2),
`ComposerModels.swift`, `BubbleMetaBadges.swift`, `ConversationMediaViews.swift`,
`LoginView.swift`, `MessageListViewController.swift`, `StoryTrayView.swift` (1
chacun).

Même précaution qu'ici à chaque fois : vérifier **où repose** l'animation quand
on la coupe. Un indicateur figé à sa phase basse est une régression déguisée en
correctif d'accessibilité.
