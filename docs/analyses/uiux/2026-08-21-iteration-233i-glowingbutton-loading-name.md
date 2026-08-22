# Iteration-233i — le CTA de l'inscription perdait son nom pendant l'attente réseau

**Date** : 2026-08-21
**Piste** : iOS (suffixe `i`)
**Surface** : `GlowingButton` (`apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingAnimations.swift`)
**Base** : `main` HEAD `3e64afaa` (après merge de 232i, PR #3241)
**Branche** : `claude/intelligent-noether-kana7q`

## Pourquoi cette surface

Le carry-over annoncé par 232i était `unit.members` (4 sites dispersés).
**Écarté après inspection**, et il faut le dire précisément : `memberCountDisplay`
(SDK, `MeeshyConversation+MemberCount.swift`) rend `"199+"` quand le serveur a
plafonné l'effectif — une **chaîne**, pas un entier. Un des quatre sites ne peut
donc pas alimenter une règle plurielle à partir d'un nombre, et les trois autres
sont gardés par `> 2` ou « conversation non-directe », ce qui masque le
singulier fautif. Le lot demande une décision de conception (deux clés ? une clé
plafonnée ?) que je ne peux pas valider sans simulateur — la forcer en aveugle
aurait été le mauvais arbitrage. Reporté avec sa raison.

Balayage à la place des composants montés jamais audités. Deux fichiers du repo
concentrent des glyphes SF sans aucun `accessibilityLabel` :
`ConversationAnimatedBackground` et `OnboardingAnimations`. Le premier est
**correctement** neutralisé (`.accessibilityHidden(true)` sur toute la couche,
l. 176) — rien à corriger. Le second l'est aussi pour sa couche décorative
(`AnimatedStepBackground`, l. 54), mais il héberge **deux composants
interactifs** qui n'ont jamais été audités : `InteractiveProgressBar` (l. 456)
et `GlowingButton` (l. 517). Les deux sont bien montés (`OnboardingFlowView`
l. 23 et l. 205).

Collision essaim vérifiée (`list_pull_requests` : **0 PR iOS ouverte** — 5 PR
web/gateway/shared, 0 touchant `apps/ios`).

## Le défaut

`GlowingButton` est le **CTA principal du parcours d'inscription** — le bouton
« Continuer » / « Créer mon compte » de `OnboardingFlowView.bottomBar`, posé sur
chacune des huit étapes. Son corps bascule sur `isLoading` :

```swift
Button(action: { … }) {
    HStack(spacing: 8) {
        if isLoading {
            ProgressView()                       // ← le label devient CECI, seul
                .progressViewStyle(CircularProgressViewStyle(tint: .white))
        } else {
            Text(title)                          // ← le nom accessible vient d'ICI
            if let icon { Image(systemName: icon) }
        }
    }
    …
}
```

SwiftUI compose le **nom accessible** d'un `Button` à partir de son label. Quand
`isLoading` passe à `true`, le `Text(title)` disparaît du label : il ne reste
qu'un `ProgressView`, qui ne porte aucun texte. Deux conséquences :

**1. Le CTA devient un « bouton » anonyme.** VoiceOver n'annonce plus ni ce que
fait le bouton, ni qu'il travaille — au moment précis où l'utilisateur attend
une réponse réseau. C'est le cas le PIRE : `viewModel.register()` (étape
`.recap`) est la création de compte, l'appel le plus long du parcours, celui où
l'utilisateur a le plus besoin d'être renseigné (WCAG 4.1.2 « Nom, rôle,
valeur »).

**2. La commande Voice Control cesse de correspondre.** « Appuyer sur Créer mon
compte » ne matche plus rien dès que l'appel part — l'utilisateur croit que sa
commande n'a pas été entendue et la répète, sans effet.

Le bouton est par ailleurs `.disabled(!isEnabled || isLoading)`, donc le trait
`.isNotEnabled` EST annoncé — mais « bouton, non disponible » sans nom
n'apprend rien : cela signale que quelque chose est bloqué, pas quoi ni pourquoi.

## Le correctif

Deux modifiers additifs, aucun changement de rendu :

```swift
.accessibilityLabel(title)
.accessibilityValue(isLoading ? Self.loadingAccessibilityValue : "")
```

Le choix de découpage compte, et il est délibéré : le **NOM** reste le titre —
stable, donc la commande Voice Control continue de matcher pendant tout l'appel
— et l'attente est annoncée comme **VALEUR**, la place que la sémantique
d'accessibilité Apple réserve à l'état d'un contrôle. Maquiller l'attente dans
le nom (« Créer mon compte — chargement… ») aurait re-cassé Voice Control : c'est
exactement le piège que ce découpage évite.

L'annonce réutilise la clé **existante** `loading.message`, déjà traduite dans
les 7 locales livrées (`ar`/`de`/`en`/`es`/`fr`/`it`/`pt-BR`), hissée en
`static var loadingAccessibilityValue` — un seul point de vérité, et un point
d'entrée testable hors hôte SwiftUI. **0 clé i18n neuve.**

## Vérification

Aucune toolchain Swift sous Linux — **gate réel = CI iOS Tests**. Contrôles
déterministes :

- **Test neuf** (`OnboardingGlowingButtonAccessibilityTests`, 4 assertions) :
  garde de source sur le contrat (label explicite ; attente en valeur et non
  dans le nom ; réutilisation de `loading.message`) **plus une assertion de
  comportement réel** — `GlowingButton.loadingAccessibilityValue` doit résoudre
  vers du texte non vide et **différent de la clé brute**, ce qui rougirait si
  l'entrée catalogue disparaissait et laissait fuir « loading.message » dans
  l'annonce VoiceOver.
- Les trois chaînes assertées ont été **vérifiées caractère par caractère**
  contre le source (`grep`), pour qu'aucune ne soit satisfaite par accident ni
  ratée sur une virgule.
- Le corps testé est **borné à `struct GlowingButton`** — une assertion ne peut
  pas être satisfaite par un modifier appartenant à `InteractiveProgressBar` ou
  à `AnimatedStepBackground`, qui vivent dans le même fichier.
- **Équilibre syntaxique** des 2 fichiers Swift au tokenizer : 0 / 0 / 0.
- **Pbxproj patché main** pour les 4 sections requises (leçon 230i : sans elles,
  la suite est absente du bundle en local et **verte par omission**).
- `loading.message` confirmée présente dans les 7 locales avant réutilisation.

## Bilan

**1 fichier prod** (+2 modifiers, +1 static var : `+9 / -0`), **1 fichier test
neuf** (4 assertions), **4 entrées pbxproj**.
**0 clé i18n neuve · 0 changement visuel · 0 logique · 0 réseau · 0 SDK.**

## Suites (234i+)

1. **`InteractiveProgressBar` — le voisin, et le plus gros morceau restant du
   fichier.** Trois défauts constatés, non traités ici parce qu'ils demandent
   un simulateur ET un arbitrage produit :
   - chaque étape est un `Button` dont le label est un **`RoundedRectangle` nu**
     → VoiceOver énonce 8 « bouton » anonymes ;
   - la position dans le parcours n'est portée **que par la couleur et la
     hauteur** (5 pt vs 8 pt) — « ne jamais compter sur la seule couleur » ;
   - les cibles font **5 à 8 pt de haut**, contre 44 pt au minimum HIG.
   Le correctif propre suppose de choisir entre « 8 boutons nommés » (il faut
   des noms d'étape COURTS, que `RegistrationStep` n'expose pas — `funHeader`
   est de la prose : « Un pseudo unique, comme toi ») et « un élément unique
   avec valeur de progression + actions personnalisées ». Et corriger la cible
   tactile change la hauteur de la barre, donc le rendu. À arbitrer sur écran.
2. **`unit.members` dispersé** — voir « Pourquoi cette surface » : demande une
   décision sur le cas plafonné (`"199+"`).
3. **Tap de ligne VoiceOver du picker de transfert** — carry-over 230i/231i/232i,
   demande simulateur.
4. **Frères du forward crown jamais audités** : `MessageMoreSheet` (504 l.),
   `MessageForwardService`, `MessageForwardDetailView`, `ForwardPickerViewModel`.
