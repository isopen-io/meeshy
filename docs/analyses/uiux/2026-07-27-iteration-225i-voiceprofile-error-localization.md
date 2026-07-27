# iOS UI/UX — Iteration 225i

**Date** : 2026-07-27
**Surfaces** : `VoiceProfileManageViewModel`, `VoiceProfileWizardViewModel`,
`PostDetailViewModel`, `BookmarksView`, `VoiceProfileWizardView`,
`VoiceProfileManageView`, `Meeshy/Localizable.xcstrings`
**Axe** : localisation — messages d'erreur jamais traduits + fin du défaut d'accents
**Base** : `main` HEAD `68a1a33f9` · Branche `claude/quirky-curie-2pvzn1`

## Contexte

Piste (a) du pointeur 223i : « balayage *français sans accents* hors profil
vocal — le défaut n'a aucune raison d'être limité à cette surface ».

**Ce pronostic était faux, et c'est le premier résultat de l'itération.** Un
balayage du catalogue (1 461 clés) avec une liste d'orthographes non ambiguës ne
remonte que **2 valeurs** encore fautives (`profile.posts.report.success` et une
clé héritée `Envoi %@/%@ echantillons`). Le défaut était **concentré** sur la
surface profil vocal, pas diffus. Mieux vaut le consigner que laisser une piste
qui promet un chantier inexistant.

Le balayage a en revanche mis au jour un défaut **plus lourd** que les accents,
invisible depuis le catalogue puisque ces chaînes n'y sont jamais entrées.

Numéro **225i** : `list_pull_requests` (open) montre 7 PR dont **224i** en vol
(#2369). 225i est strictement supérieur. Aucune PR ouverte ne touche les
ViewModels du profil vocal.

## Défaut A — les 8 messages d'erreur du profil vocal ne sont PAS traduits

`VoiceProfileManageViewModel` (6 sites) et `VoiceProfileWizardViewModel` (2)
assignent des **littéraux français bruts** à leur `@Published var error` :

```swift
self.error = "Erreur lors du changement de visibilite du profil vocal."
```

`VoiceProfileManageView:122` rend cette valeur **telle quelle** (`Text(error)`).
Aucun passage par le catalogue → **un utilisateur anglophone, allemand, arabe…
lit du français** dès que quoi que ce soit échoue sur cet écran : chargement,
changement de visibilité, bascule du clonage, suppression d'un échantillon,
suppression du profil, envoi d'échantillons, enregistrement du consentement.

Deux de ces littéraux étaient en prime **non accentués** (« visibilite »,
« echantillon(s) ») — le défaut de 223i, sur un chemin que 223i ne pouvait pas
voir puisqu'il ne passait pas par le catalogue.

### Correctif

Les 8 messages passent par `String(localized:defaultValue:bundle: .main)` sous
`voice.profile.error.*` / `voice.profile.wizard.error.*`, avec **8 clés neuves
traduites dans les 7 locales** (`ar`, `de`, `en`, `es`, `fr`, `it`, `pt-BR`).
Terminologie alignée sur l'existant du catalogue (« Proben » en allemand,
« muestras » en espagnol — les mots déjà employés par `voice.profile.addSamples`).

## Défaut B — une phrase française servait de clé de localisation

`PostDetailViewModel:584` appelait
`String(localized: "Signalement envoye", defaultValue: "Signalement envoye")` :
la **clé** était la phrase française elle-même (mal orthographiée), sans
`bundle: .main`. Or la clé propre **`profile.posts.report.success` existe déjà,
traduite dans les 7 locales**. L'appel pointe désormais dessus → **0 clé neuve**,
une chaîne de moins en double, et le toast se traduit enfin.

## Défaut C — les 2 dernières valeurs françaises non accentuées

`profile.posts.report.success` (« Signalement envoye » → **envoyé**) et la clé
héritée `Envoi %@/%@ echantillons` (**échantillons**), plus 4 `defaultValue`
côté source (`VoiceProfileWizardView` ×2, `VoiceProfileManageView`,
`BookmarksView`). Après quoi le balayage ne remonte **plus rien**.

## Le garde-fou (ce qui rend l'itération durable)

`VoiceProfileErrorLocalizationTests` (neuf, 3 tests) :

1. les 8 clés d'erreur existent dans les **7 locales** (lecture JSON réelle) ;
2. **aucun `self.error = "…"` littéral** ne revient dans les deux ViewModels —
   c'est la garde qui empêche la classe entière de défaut de repousser ;
3. **ratchet français sur tout le catalogue** : aucune valeur `fr` ne contient
   une orthographe non accentuée de la liste. La liste ne retient que des formes
   **qui ne sont pas des mots français valides** — « Supprimer », « Archive »,
   « Envoyer », « Modifier » en sont **délibérément exclus** : les inclure ferait
   crier la garde à tort jusqu'à ce que quelqu'un la désactive.

Le ratchet passe sur les **1 461 clés** du catalogue, ce qui vaut vérification
indépendante de la conclusion « le défaut est soldé ».

## Vérification

Pas de toolchain Swift (Linux) → assertions rejouées déterministiquement hors
Xcode : 8 clés × 7 locales ✔, littéraux bruts absents des 2 ViewModels ✔,
`String(localized:)` présent ✔, **ratchet 0 fautif sur 1 461 clés** ✔, tokenizer
0/0/0 sur 3 fichiers ✔, catalogue JSON valide ✔. Diff catalogue : **+378 / −2**
(les 2 lignes retirées sont les 2 valeurs accentuées, le reste est additif).
Gate réel = CI `iOS Tests`.

## Portée

**6 fichiers de production**, 8 clés i18n neuves (7 locales chacune), 1 fichier
de test neuf. **0 logique / 0 réseau / 0 layout / 0 changement visuel** — les
messages changent de *langue*, pas de place.

## Piste 226i+

1. **Le même défaut ailleurs** : `self.error = "…"` littéral est un motif qui
   n'a aucune raison d'être propre au profil vocal. Un balayage des ViewModels
   donnerait la liste — à traiter **par ViewModel**, et le test n° 2 ci-dessus
   fournit le patron de garde à recopier.
2. Arriéré de catalogue (clés absentes retombant sur leur `defaultValue`) :
   mesuré à 1 724/2 586 en 220i, à re-mesurer sur la base courante.
3. Pistes 219i–223i ouvertes : audit Dark Mode, `sensoryFeedback` (iOS 17+),
   `.contentShape` de `ContactRow`. Le renommage HIG de l'extension de partage
   reste un **choix produit**.
