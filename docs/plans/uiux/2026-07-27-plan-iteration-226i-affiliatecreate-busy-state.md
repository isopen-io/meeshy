# Plan — iOS UI/UX Iteration 226i

**Objet** : rendre audible l'état occupé du CTA de `AffiliateCreateView`, dernier
bouton d'action de l'app à ne pas appliquer la doctrine « valeur transitoire ».

**Analyse** : `docs/analyses/uiux/2026-07-27-iteration-226i-affiliatecreate-busy-state.md`
**Base** : `main` HEAD `68a1a33f` · **Branche** : `claude/quirky-curie-6kr79r`
**Numérotation** : 226i — 222i→225i pris (dont un **doublon** de 222i)

## Sélection de la cible

La piste 223i-a que j'avais annoncée en 222i (« extraire `formField` en composant
partagé ») a été **réévaluée et écartée** : les deux écrans stylent leurs champs
différemment (police, couleur, rayon, fond, bordure), donc unifier changerait le
visuel de l'un d'eux. Ce n'est pas un refactor d'accessibilité mais une décision
de design. **La correction est consignée dans l'analyse et dans le pointeur** —
c'est la moitié la plus utile de cette itération.

Reste la piste 223i-b, réellement sûre : l'état occupé du CTA.

## Étapes

- [x] Resync depuis `origin/main` (222i mergée #2362)
- [x] Collision essaim : 7 PR ouvertes / 4 iOS, aucune sur `AffiliateCreateView.swift`
- [x] Numérotation revérifiée (`ls docs/analyses/uiux/`) — 226i libre
- [x] **Réévaluer** la piste `formField` → écartée, avec le tableau des écarts de style
- [x] Relever la doctrine sur ses 3 sites (`CreateTrackingLinkView:136`, `StatusComposerView:263`, `ThreadView:231`)
- [x] Vérifier la clé réutilisable **dans le catalogue** (7 locales)
- [x] `.accessibilityValue(isCreating ? … : "")` sur le CTA
- [x] Test étendu (1 test / 3 assertions, dont une garde négative)
- [x] RED 2/3 prouvé contre `main` ; non-régression 222i vérifiée
- [x] Tokenizer 0/0
- [x] Analyse + plan + tracking
- [ ] Commit, push, PR — gate = CI `iOS Tests`

## Décisions

**Réutiliser `a11y.tracking.create.in-progress` plutôt que créer une clé
d'écran.** Même action (créer un lien), mêmes mots, et la clé est déjà traduite
dans 7 locales. Une clé `a11y.affiliate.create.*` aurait ajouté une chaîne non
traduite pour zéro gain sémantique. Un test **interdit explicitement** cette
dérive.

**Ne PAS ajouter le hint de désactivation maintenant.** Il exigerait une chaîne
neuve, et (1) les clés a11y voisines sont traduites en 7 locales — en introduire
une qui ne l'est pas dégrade la couverture ; (2) **#2369 est en vol** et durcit
précisément la résolution des clés contre le catalogue de leur target. Reporté
en 227i, à faire **avec** la traduction.

**Compter la RED honnêtement.** 2 assertions sur 3 sont rouges contre `main` ; la
troisième est une garde négative, verte des deux côtés par construction. Elle a
sa valeur (empêcher une future clé dédiée) mais elle ne prouve rien du
correctif — le dire plutôt que d'annoncer 3/3.

## Non fait (et pourquoi)

- Hint du motif de désactivation : chaîne neuve à traduire (227i).
- Factorisation du champ entre les deux écrans : change le visuel de l'un des
  deux → arbitrage design requis.
- Icône sur le message d'erreur (WCAG 1.4.1) : change le visuel.

## Suite (227i+)

1. Hint de désactivation, **avec** la chaîne traduite en 7 locales.
2. Factorisation du champ de formulaire — **après** arbitrage du style retenu.
3. Glyphe sur le message d'erreur.
