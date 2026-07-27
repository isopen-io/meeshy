# Plan — Iteration 225i : localisation du parcours d'inscription

**Date** : 2026-07-27 · **Base** : `main` HEAD `ea368e36` · **Branche** : `claude/intelligent-noether-3qwt2j`
**Analyse** : `docs/analyses/uiux/2026-07-27-iteration-225i-onboarding-localization.md`

## Choix de la surface

Mesure avant décision. Balayage des clés `String(localized:)` de tous les targets
iOS croisées avec `apps/ios/Meeshy/Localizable.xcstrings` :

| fichier | clés non traduites |
|---|---|
| **`Features/Auth/Onboarding/OnboardingStepViews.swift`** | **64** |
| `Features/Main/Views/CreateShareLinkView.swift` | 55 |
| `Features/Main/Views/NotificationSettingsView.swift` | 52 |
| `Features/Main/Components/MessageDetailSheet.swift` | 47 |
| … | (backlog total 1669) |

Plus gros trou de l'app **et** premier écran d'un compte neuf → priorité nette
sur `MemberManagementSection.emptyState` que le pointeur 223i+ proposait (état
vide déjà correct : glyphe masqué, élément combiné, chaîne localisée).

Numéro **225i** : 222i est le plus haut mergé dans `main`, mais l'essaim portait
au moment du choix 4 PR ouvertes revendiquant 223i (#2370, #2367, #2366, #2363 en
221i) et une 224i (#2369) — leçon 216i/221i appliquée : se caler au-dessus des
numéros **en vol**, pas seulement des mergés. Recontrôle juste avant push.

## Étapes

- [x] Vérifier qu'aucune PR ouverte ne touche `OnboardingStepViews.swift` (7 branches iOS inspectées : 0 recouvrement ; 2 touchent le catalogue → diff additif pour rester mergeable)
- [x] Lire le cliquet existant `LocalizationConsistencyTests` pour livrer *dans* son contrat (`fullyLocalizedScreens` + `backlogCeiling`) au lieu d'inventer un mécanisme parallèle
- [x] Table de traduction 62 clés × 7 locales, registre informel, vocabulaire repris du catalogue
- [x] Valider la table : couverture, locales complètes, parité des spécificateurs `%@`/`%d`
- [x] Réécrire les 35 `defaultValue` fautifs (13 anglais + 22 typographie française)
- [x] Réparer la typographie française du bloc conditions (accents, espaces insécables)
- [x] WCAG 2.5.3 : retirer le `.accessibilityLabel` divergent du bouton « Passer »
- [x] Unifier les 4 `tipRow` en `OnboardingTipRow`, glyphe masqué VoiceOver, chenal `@ScaledMetric`
- [x] Splice additif du catalogue (+2852/−0), JSON re-parsé, entrées existantes prouvées intactes
- [x] Épingler l'écran + exempter `terms.body` avec sa raison + abaisser le plafond 1669 → 1606
- [x] Test de parité neuf `defaultValue` ≡ catalogue `fr`, avec exclusion des défauts interpolés
- [x] `OnboardingTipRowConsistencyTests` (4 tests / 9 assertions)
- [x] RED prouvé contre `origin/main`, GREEN contre l'arbre de travail, pour **tous** les tests
- [x] `check_localization.py` vert (directions 1 & 2)
- [ ] Re-vérifier `main` + l'essaim, pousser, ouvrir la PR
- [ ] Mettre à jour `branch-tracking.md`

## Décisions

**Livrer dans le cliquet existant, pas à côté.** 220i a construit
`fullyLocalizedScreens` + `backlogCeiling` précisément pour ce travail : une
itération qui finit un écran l'y ajoute et abaisse le plafond. C'est le contrat
suivi ici — aucun mécanisme neuf, une entrée de liste et un nombre.

**`fr` écrit au catalogue en plus du `defaultValue`.** Le `defaultValue` seul
suffirait pour le français. Écrire `fr` aussi (précédent `post.bookmark.*`, 218i)
rend l'entrée complète et lisible, et permet au test de parité de vérifier que le
code et le catalogue racontent la même histoire. Coût : la double représentation,
d'où le test.

**Les conditions d'utilisation ne sont pas traduites.** Copie produit/juridique
soumise à acceptation ; une itération UI/UX n'a pas autorité pour la traduire.
Exemptée explicitement plutôt que silencieusement, et signalée comme reste à
faire hors piste.

**Le registre n'est pas uniformisé.** Le carrousel vouvoie, les étapes tutoient.
~70 chaînes de copie produit — hors périmètre d'une passe de localisation. Les 6
locales cibles étant déjà informelles, les traductions suivent le tutoiement du
fichier.

**Splice textuel, jamais `json.dump`.** Leçon 218i : re-sérialiser réécrivait
14 557 lignes pour 3 clés. Insertion ligne à ligne à la position alphabétique,
puis re-parse + comparaison des 1391 entrées préexistantes.

## Vérification

Pas de toolchain Swift → gate = CI `iOS Tests`. Miroirs Python fidèles du scanner
Swift (scan à parenthèses équilibrées conscient des chaînes, `isIdentifier`,
extraction `defaultValue` refusant les blocs `"""`), exécutés contre les deux
états.

| test | base | après |
|---|---|---|
| `test_fullyLocalizedScreensStayTranslatedInEveryShippedLocale` | RED 63 | GREEN |
| `test_fullyLocalizedScreenDefaultValuesMatchTheCatalogSourceLanguage` (neuf) | RED 67 | GREEN |
| `test_untranslatedKeyBacklogDoesNotGrow` | 1669 | 1606 |
| `OnboardingTipRowConsistencyTests` (neuf) | RED 9/9 | GREEN 9/9 |

**Le test de parité a attrapé une vraie divergence pendant sa rédaction** :
`status.composer.repost.via` de `StatusComposerView` (déjà épinglé) porte
`defaultValue: "Status de @\(via)"` que Xcode normalise en `"Status de @%@"` au
catalogue. Sans l'exclusion des défauts interpolés, ce correctif rendait rouge un
écran sain — exactement le mode d'échec que l'en-tête du fichier documente déjà
pour les clés de texte naturel.

## Portée du risque

0 logique · 0 réseau · 0 couleur · 0 changement visuel aux tailles de texte par
défaut. Prod : 1 fichier `+79/−63` (dont 35 réécritures de littéral et 4 corps de
helper repliés) + catalogue `+2852/−0`. Tests : 1 fichier neuf, 1 étendu.
APIs : `@ScaledMetric` (iOS 14+) pour un plancher app à 16.0.
