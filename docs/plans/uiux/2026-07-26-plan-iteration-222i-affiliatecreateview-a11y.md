# Plan — iOS UI/UX Iteration 222i

**Objet** : rendre `AffiliateCreateView` accessible en le faisant converger sur
son écran jumeau `CreateTrackingLinkView`, déjà soldé.

**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-222i-affiliatecreateview-a11y.md`
**Base** : `main` HEAD `242a82c5` · **Branche** : `claude/quirky-curie-6kr79r`
**Numérotation** : 222i, strictement > 221i (#2348, mergée)

## Contexte de numérotation

218i à 221i ont été **pris par d'autres agents** pendant que la 218i de cette
piste était en vol — mon numéro était lui-même une collision. Les analyses
présentes sur `main` couvrent 218i (bubble window metrics), 219i (story export
dark mode), 220i (forced-dark sheet contrast) et 221i (status composer scroll
detents). **222i** est donc le premier libre.

## Sélection de la cible

Essaim **très dense** : 12 PR ouvertes, dont ~10 iOS. Surfaces déjà revendiquées
et donc écartées : `StatusComposerView` (#2352/#2346/#2342/#2340), métriques de
fenêtre (#2353), durée d'export story (#2351), feuille du composeur d'humeur
(#2350), toasts favoris (#2347), haptics onboarding (#2344), extension de
partage (#2343), `ConversationEncryptionDetailSheet` (#2334).

Balayage des écrans portant des `Button` et **aucun** `.accessibilityLabel` →
`AffiliateCreateView` : absent de toute PR, froid (dernier commit le touchant =
un passage de masse du 2026-07-25), et surtout **jumeau d'un écran déjà soldé**,
ce qui donne un patron de référence au lieu d'une invention.

## Étapes

- [x] Resync depuis `origin/main` (217i mergée #2326 ; 218i **fermée**, superseded par #2348)
- [x] Collision essaim : 12 PR listées, `AffiliateCreateView.swift` dans aucune
- [x] Identifier le jumeau soldé `CreateTrackingLinkView` et relever ses 4 patrons
- [x] Champs : `.accessibilityLabel` + caption `.accessibilityHidden(true)`
- [x] Glyphe décoratif du CTA masqué
- [x] CTA nommé explicitement
- [x] Échec de création annoncé (`UIAccessibility.post`)
- [x] Vérifier qu'aucun `import` n'est requis (3 précédents avec les mêmes imports)
- [x] Test neuf, 5 tests / 9 assertions, 2 assertions **ancrées**
- [x] RED prouvé 8/8 contre `main`, GREEN 9/9 après
- [x] Tokenizer accolades/parenthèses/crochets : 0/0/0
- [x] Analyse + plan + tracking
- [ ] Commit, push, PR — gate = CI `iOS Tests`

## Décisions

**Réutiliser les clés des captions plutôt que créer des clés `*.a11y`.** Le
libellé vocal d'un champ doit être **le libellé visible**, mot pour mot : ce sont
deux rendus de la même information. Une clé séparée les laisserait diverger à la
première retraduction. Le test verrouille ce choix en comptant chaque clé
**exactement deux fois** — une occurrence pour l'écran, une pour la voix.

**Masquer les captions plutôt que de les laisser.** Une fois la caption promue en
libellé du champ, la laisser visible à VoiceOver crée un **second arrêt** qui
répète les mêmes mots. C'est ce que fait `CreateTrackingLinkView.formField`.

**Ancrer deux assertions plutôt que faire confiance à `contains`.** Le fichier
contient désormais plusieurs `.accessibilityHidden(true)` : un `contains` global
aurait verdi le test du glyphe même sans le correctif du glyphe. Les deux
assertions concernées cherchent donc dans une fenêtre qui suit immédiatement
l'ancre (glyphe, haptic d'erreur).

**Ne PAS extraire un `formField` partagé maintenant.** Ce serait la vraie
suppression de la classe de défaut, mais elle touche deux écrans, dont un jumeau
que je ne peux pas verrouiller. Avec 12 PR en vol, c'est le geste le plus exposé
aux collisions. Consigné en piste 223i.

## Non fait (et pourquoi)

- Extraction du composant `formField` partagé : refactor à deux écrans, essaim
  trop dense (piste 223i).
- État occupé du CTA (`isCreating` → « estompé » sans motif) : change le
  comportement vocal → itération dédiée.
- Icône sur le message d'erreur (couleur seule, WCAG 1.4.1) : **change le
  visuel** → itération dédiée, à arbitrer avec le design.

## Suite (223i+)

1. Extraire `formField(_:placeholder:text:accessibilityLabel:hint:)` en composant
   partagé entre les deux écrans « créer un lien », quand aucun n'est en vol.
2. `.accessibilityValue` / `.accessibilityHint` pour l'état occupé du CTA.
3. Glyphe sur le message d'erreur (ne plus dépendre de la seule couleur).
