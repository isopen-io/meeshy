# iOS UI/UX — Iteration 227i

**Date** : 2026-07-27
**Surfaces** : `TwoFactorViewModel`, `ConversationOptionsViewModel`,
`EditProfileViewModel`, `TwoFactorSetupView`, `Meeshy/Localizable.xcstrings`
**Axe** : localisation — messages d'erreur publiés en littéraux
**Base** : `main` HEAD `913d8cc90` · Branche `claude/quirky-curie-2pvzn1`

## Contexte

Piste (a) du pointeur 225i. **Elle demandait explicitement de mesurer avant de
prédire** — 223i s'était trompé en annonçant un chantier diffus qui n'existait
pas. Mesure d'abord, donc.

Numéro **227i** : la plus haute itération iOS en vol est **226i** (#2411).
⚠️ #2411 nomme aussi 227i pour un autre sujet (appels `String(localized:)`
multi-lignes invisibles au scanner) — collision de **numéro** possible, mais
**aucune collision de fichier** : rien de cette itération ne touche
`LocalizationConsistencyTests` ni `CreateShareLinkView`.

## La mesure, et sa correction en cours de route

Premier balayage, sur le motif exact de 225i (`error = "`) : **5 occurrences**,
toutes dans `TwoFactorViewModel`. Conclusion tentante : « petit reliquat ».

**Le motif était trop étroit.** Les ViewModels ne nomment pas tous leur propriété
`error` ; `ConversationOptionsViewModel` et `EditProfileViewModel` publient
`errorMessage`. En élargissant : **11 occurrences sur 3 ViewModels**.

| ViewModel | littéraux | propriété |
|---|---|---|
| `TwoFactorViewModel` | 5 | `error` |
| `ConversationOptionsViewModel` | 5 | `errorMessage` |
| `EditProfileViewModel` | 1 | `errorMessage` |

Une garde nommant deux fichiers (celle de 225i) aurait manqué **exactement**
ceux-là. C'est la raison d'être de la généralisation ci-dessous.

## Défaut — 11 messages d'erreur affichés en français à tout le monde

Chaque site assigne un **littéral** à la propriété d'erreur publiée, rendue telle
quelle par la vue. Aucun passage par le catalogue → **un non-francophone lit du
français**. Le cas le plus coûteux est le 2FA : le message dont un utilisateur a
le plus besoin est précisément celui qui lui dit que **son code a été refusé**.

Trois de ces littéraux étaient en prime **non accentués** (« demarrer »,
« Verifiez et reessayez », « desactiver », « Echec de la mise a jour »).

**Et le défaut ne s'arrêtait pas au ViewModel** : `TwoFactorSetupView` (l. 371,
386, 526) substitue une chaîne française codée en dur quand le ViewModel n'a rien
publié — `viewModel.error ?? "Code invalide. Verifiez et reessayez."`. Localiser
le ViewModel seul n'aurait couvert que **le chemin où le ViewModel a parlé le
premier**.

### Correctif

Les 11 messages + les 3 replis de vue passent par
`String(localized:defaultValue:bundle: .main)`. **11 clés neuves traduites dans
les 7 locales**, sous `twofactor.error.*`, `conversation.options.error.*`,
`profile.edit.error.update`. Les replis de vue **réutilisent les clés du
ViewModel** → aucune divergence possible entre les deux chemins.

## Le garde-fou, généralisé

225i gardait deux fichiers **par leur nom**. `ViewModelErrorLocalizationTests`
(neuf) balaie désormais **tous** les `*ViewModel.swift` de l'app et échoue sur
tout littéral assigné à `error` **ou** `errorMessage` (`= ""` exclu : c'est une
remise à zéro, pas un message). S'y ajoutent la couverture des 11 clés dans les
7 locales, et une garde spécifique sur le **repli** de `TwoFactorSetupView`.

La leçon tient dans la **forme** de l'assertion, pas dans la liste des fichiers :
une garde nommant ses cibles ne protège que ce qu'on avait déjà trouvé.

## Vérification

Pas de toolchain Swift (Linux) → assertions rejouées hors Xcode : 11 clés × 7
locales ✔, balayage des ViewModels **0 fautif** ✔, replis français absents de la
vue ✔, tokenizer 0/0/0 sur 5 fichiers ✔.

**Ratchet de backlog d'un autre agent respecté** : `LocalizationConsistencyTests`
plafonne à 1 606 ; la mesure après cette itération donne **1 604**, et aucune des
11 clés neuves n'y est comptée (elles sont traduites). Diff catalogue
**+517 / −0**, purement additif.

## Portée

**5 fichiers de production**, 11 clés i18n neuves (7 locales), 1 fichier de test
neuf. **0 logique / 0 réseau / 0 layout / 0 changement visuel.**

## Piste 228i+

1. **Le motif au-delà des ViewModels** : cette itération a montré qu'un motif de
   recherche trop étroit sous-estime un défaut d'un facteur 2. Les vues qui
   construisent un message d'erreur en dur (`?? "…"`, `Text("Erreur…")`) sont le
   prolongement naturel — **à mesurer, pas à prédire**.
2. `String(localized:)` multi-lignes invisibles au scanner (92 appels, 46
   fichiers) — relevé par #2411, qui le nomme pour 227i ; à coordonner.
3. Pistes ouvertes : audit Dark Mode, `sensoryFeedback` (iOS 17+),
   `.contentShape` de `ContactRow`.
