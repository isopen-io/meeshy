# Iteration-242i — huit boutons dont le libellé est une FORME

**Date** : 2026-08-24 · **Piste** : iOS (suffixe `i`)
**Surface** : `InteractiveProgressBar` (`Features/Auth/Onboarding/OnboardingAnimations.swift`)
**Base** : `main` HEAD `661a1081` · **Branche** : `claude/intelligent-noether-64z546`

## Pourquoi cette surface

Carry-over **(i)** depuis **233i** — reporté par 234i → 241i, huit itérations,
toujours pour le même motif (« simulateur + arbitrage »). C'est la barre de
progression de l'**inscription** : les tout premiers écrans qu'un compte neuf
rencontre.

## Le défaut

### (1) Aucun nom accessible — huit fois

```swift
Button(action: { … }) {
    RoundedRectangle(cornerRadius: 3)      // ← le label est une FORME
        .fill(stepColor(for: step))
}
```

VoiceOver annonçait « **bouton** », huit fois de suite, sans rien d'autre. Ce
n'est pas un libellé imparfait : c'est **l'absence de libellé** — la forme aiguë
de la famille traitée en 227i.

### (2) L'état ne tenait qu'à la couleur — WCAG 1.4.1

| état | couleur | hauteur |
|---|---|---|
| faite | `step.accentColor` | 5 pt |
| en cours | `accentColor.opacity(0.6)` | 8 pt |
| à venir | `Color(.systemGray4)` | 5 pt |

Rien, dans l'arbre d'accessibilité, ne disait laquelle était laquelle. **Ne
jamais énoncer une information par la seule couleur.**

## Le correctif

Trois modificateurs par étape — `accessibilityLabel`, `accessibilityValue`,
`.isSelected` sur l'étape courante — plus un `accessibilityHint` réservé aux
étapes **réellement re-visitables** (l'étape courante n'irait nulle part ; les
suivantes sont `.disabled`, que SwiftUI annonce déjà « estompé »).

### Le libellé est POSITIONNEL, et ce n'est pas un pis-aller

`RegistrationStep` vit dans **`packages/MeeshySDK`**, que cette piste n'a pas le
droit de modifier — et l'enum n'expose **aucun titre court** : `funHeader` est
une accroche (« Un pseudo unique, comme toi »), inutilisable comme nom de
contrôle. Les libellés sont donc construits **app-side**, ce qui coïncide avec
la règle de pureté SDK du dépôt (SDK = briques, app = orchestration UX).

Sur une barre de **progression**, la position EST l'information cherchée, et
elle survit à l'ajout d'une étape sans retoucher huit libellés.

### 242i CONSOMME la source unique de 241i

Les deux nombres passent par **`LocalizedNumber.exact`** (241i) avant d'être
injectés — le catalogue porte donc des `%1$@`, pas des `%1$lld`.

Ce n'est pas un détour. C'était le seul moyen d'être **certain** du système de
chiffres : l'arabe s'écrit en chiffres arabo-indiens, et je ne pouvais pas
vérifier ici ce que `%lld` rend sous `locale: ar`. Faire dépendre une assertion
d'un comportement Foundation non vérifiable, c'est fabriquer un faux rouge.
Passer par le helper rend le résultat **prouvé** — sa suite 241i l'atteste déjà.

## Ce qui n'est PAS fait, et pourquoi (leçon 238i)

**Les cibles tactiles restent à 5–8 pt contre 44 pt HIG.**

Il n'existe aucun moyen d'obtenir 44 pt de zone tactile sans 44 pt de place : la
rangée passerait de 8 pt à 44 pt, soit **+36 pt** sur un écran d'onboarding qui
empile `topBar`, la barre, `stepHeader` et un `TabView`. Le précédent du dépôt
existe (`FeedPostCard`, « le marque-page ratait un tap sur deux »), mais il
s'appliquait à une rangée qui pouvait absorber la croissance.

**Je ne peux pas voir le résultat** — pas de simulateur ici. Découper par NIVEAU
DE DOUTE plutôt que par famille : le nom et l'état sont sans ambiguïté et sans
risque de mise en page, la cible tactile demande un œil sur un iPhone SE.

Arithmétique pour qui la reprendra : `.padding(.top, 8)` sur la barre et
`.padding(.top, 16)` sur `stepHeader` offrent 24 pt absorbables ⇒ croissance
nette **+12 pt** si les deux sont réduits, contre +36 pt sans rien absorber.

## Vérification

Aucune toolchain Swift sous Linux — **gate réel = CI iOS Tests**, suite complète
via l'opt-in ` — run test` (leçons 238i / 268 : relire le NOM du check).

| Contrôle déterministe rejoué hors Swift | Résultat |
|---|---|
| Garde 241i — interpolation dans une `accessibilityValue` | **0** sur 569 fichiers |
| Garde 241i — `%` littéral | **0** |
| Les 5 clés neuves sont référencées en code (anti-orpheline) | **5/5** |
| Diff du catalogue | **+235 / −0** — purement additif, **aucun reformat** |
| Catalogue JSON valide · clés | oui · 3320 → **3325** |
| Chaque clé traduite dans les 7 locales | **5/5** |
| Équilibre `()`/`{}`/`[]` | **identique à `main`** |
| SDK (`packages/MeeshySDK`) | **non touché** |

**Note d'outillage** : la 1ʳᵉ écriture du catalogue est passée par
`json.dump` + tri des clés et a produit **26 142 insertions / 25 907
suppressions** pour 5 clés — le fichier n'est PAS trié, donc re-sérialiser le
reformate en entier. Revenue en arrière, insertion en **texte brut** : 235
lignes, zéro suppression. **Un catalogue se modifie par insertion textuelle,
jamais par re-sérialisation.**

## Bilan

**1 fichier prod** · **5 clés i18n neuves × 7 locales** (aucune réutilisable :
le catalogue n'avait ni position d'étape ni état) · **1 suite neuve**
(9 tests) · **0 changement visuel** · **0 logique métier**.

## Suites (243i+)

1. **Cibles tactiles 44 pt de cette même barre** — arbitrage + simulateur, avec
   l'arithmétique ci-dessus. C'est la moitié restante de 233i.
2. Phrasé naturel de l'indicateur de page (« Image 3 sur 10 »), écarté en 241i.
3. Les 3 sites SDK de 241i (`KeyframeInspector`, `StoryAudioCell`,
   `ComposerToolPanelHost`) — **hors périmètre par règle**, à porter par la piste SDK.
4. Carry-over inchangés : `MeeshyAppIntents:272` (macOS), forme `one`
   d'`accessibility.unread_count`, effectif « 199+ », les 2 fenêtres
   `prefix(1400)` restantes, `conversation.view.reply.count.{one,many}`.
