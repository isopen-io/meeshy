# iOS UI/UX — Iteration 228i

**Date** : 2026-07-27
**Surface** : `Features/Auth/Onboarding/OnboardingAnimations.swift` (`AnimatedStepBackground`)
**Axe** : Accessibilité — Reduce Motion (WCAG 2.3.3, Apple HIG)
**Base** : `main` HEAD `913d8cc90`

## Suite de 225i

225i a soldé les 2 surfaces `.repeatForever` **non-dismissibles** (points de
saisie de la liste, pastille de sync) et a laissé un inventaire de 9 fichiers,
`OnboardingAnimations.swift` en tête avec **23 occurrences** — de loin le plus
gros, et signalé comme « probablement une itération à lui seul ». C'est celle-ci.

## Numérotation

**228i**. 226i est prise (#2411, i18n `CreateShareLinkView`) et cette PR réserve
227i pour le scanner multi-lignes. Rappel de la leçon 219i : le numéro ne protège
de rien, seule la vérification **par fichier** le fait —
`search_pull_requests` sur `OnboardingAnimations` / `reduceMotion` → **0**.

## Le défaut

`AnimatedStepBackground` est l'ambiance de **tout le parcours d'inscription** :
cercles concentriques qui respirent, ondes qui défilent, particules qui dérivent,
halos qui pulsent — un décor par étape (`pseudo`, `phone`, `email`, `identity`,
`password`, `language`, `profile`, `recap`).

C'est **le premier écran de l'app**. Un utilisateur sensible au mouvement
rencontrait donc un mur d'animation continue **avant d'atteindre le moindre
contenu**, et sans aucun moyen de l'arrêter : le réglage système n'était consulté
nulle part dans le fichier.

Deux sources de mouvement, pas une :

| Source | Compte | Nature |
|---|---|---|
| Décorations `.animation(…repeatForever…, value: animate)` | **19** | l'ambiance elle-même |
| Pilotes `withAnimation(…repeatForever…)` dans `startAnimations()` / `restartAnimations()` | **4** | animent `animate` et `wavePhase`, qui **alimentent** les 19 |

Geler les décorations sans couper les pilotes laisse le décor bouger ; couper les
pilotes sans geler les décorations aussi. **Il fallait les deux.**

## Correctif

### 1. Un entonnoir, pas 19 gardes

```swift
private func ambient(_ animation: Animation) -> Animation? {
    reduceMotion ? nil : animation
}
```

Les 19 décorations passent par là. Une garde par site aurait été 19 occasions
d'en oublier une — et un oubli serait **invisible en revue**, noyé parmi dix-huit
frères corrects. C'est exactement ce que le test épingle.

`nil`, pas « plus court » : une animation répétée dont on réduit la durée ne
s'arrête pas, elle bat plus vite.

### 2. Les pilotes se posent à l'état **composé**

```swift
guard !reduceMotion else { return settleWithoutMotion() }
```

`settleWithoutMotion()` pose `animate = true` dans une `Transaction` à
`disablesAnimations`. Le choix de `true` est le cœur de l'itération, et c'est la
leçon de 225i appliquée : chaque décoration est écrite **contre** cet état
(`animate ? 1.1 : 0.9`, `animate ? -20 : 20`, `animate ? 0.8 : 0.3`). Rester à
`false` fige le décor **au milieu du geste** — plus petit, plus terne, décalé.
Ce n'est pas un décor plus calme, c'est **un autre décor**.

### 3. Ce qui reste volontairement animé

`.animation(.easeInOut(duration: 0.6), value: step)` — le fondu entre deux étapes.
Transition **discrète et auto-terminée**, pas de l'ambiance soutenue : ce n'est
pas la cible du réglage, et la couper ferait claquer les changements d'étape. Le
test l'épingle pour que l'exclusion se lise comme une **décision** et non comme
un oubli.

## Résultat

1 fichier de production, **+54 / −19 lignes**. 0 clé i18n, 0 couleur, 0 métrique
de layout, 0 logique, 0 réseau. **Aucun changement pour qui n'a pas activé le
réglage** : `ambient()` rend l'animation telle quelle et les pilotes ne bifurquent
pas.

## Vérification — et deux ratés à consigner

Pas de toolchain Swift sous Linux. **RED recalculé contre
`git show origin/main:…` : 3/9** ; **GREEN 9/9**. Équilibre
accolades / parenthèses / crochets des 2 fichiers : **0 / 0 / 0**.

**La transformation par regex a raté deux fois, et le tokenizer les a attrapées** :

1. Premier passage : les sites **multi-lignes** ont perdu leur `ambient(`
   ouvrant tout en gardant la parenthèse fermante → source invalide.
2. Second passage : le motif `.*?` en `DOTALL` a franchi la frontière d'un site
   voisin et enveloppé `.animation(.easeInOut(duration: 0.6), value: step)` —
   **le fondu d'étape, hors périmètre** — en laissant `+1` parenthèse.

Les deux sont passées inaperçues à la relecture et n'ont été révélées que par le
compte de parenthèses, puis localisées ligne à ligne. **Leçon : une réécriture
mécanique sur un fichier qu'on ne peut pas compiler n'est acquise qu'une fois le
tokenizer à 0/0/0 ET les 19 suppressions relues une à une** (fait : les 19 lignes
retirées sont exactement les 19 expressions d'animation, rien d'autre).

## Test

`ReduceMotionComplianceTests` **étendu** (celui de 225i porte déjà la doctrine —
un seul verrou pour une seule règle) : 4 tests neufs (7 au total).

Le compte se fait sur les occurrences nues de `ambient(` (**20** = 19 sites +
1 déclaration) et non sur `.animation(ambient(` : la moitié des sites replient
leur argument à la ligne suivante, et le matcher de 225i normalise les blancs —
une assertion ne doit pas dépendre de l'endroit où un formateur a coupé.

## Piste 229i+

8 fichiers `.repeatForever` encore sans garde : `MessageEffectModifiers.swift` (3),
`BubbleCallNoticeView.swift` (2), puis `ComposerModels.swift`,
`BubbleMetaBadges.swift`, `ConversationMediaViews.swift`, `LoginView.swift`,
`MessageListViewController.swift`, `StoryTrayView.swift` (1 chacun).
Même question à chaque fois : **où le décor se pose-t-il une fois coupé ?**
