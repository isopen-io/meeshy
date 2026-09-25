## Leçon 292 — le trou de parité « N−1 » n'est pas hypothétique : le site non couvert avait DÉJÀ dérivé (2026-08-26, itération 271)

> Coordination : lecons 288-291 posées par des itérations sœurs. Celle-ci est
> disjointe, numérotée 292 pour éviter la collision au merge de `tasks/lessons.md`.

La leçon 291 dit qu'une règle à N miroirs sans témoin de parité est le trou le
plus dangereux. L'itération 271 a appliqué sa question — *quelles règles à
« miroirs plateforme » n'ont AUCUN témoin de parité ?* — à la couleur d'accent de
conversation (`DynamicColorGenerator`, un algorithme documenté « faithful port »
en Swift/Kotlin, mirroir TS vérifié). Un fichier de vecteurs partagé
(`accent.vectors.json`, 24 cas) était rejoué par TS **et** iOS ; Android n'en
rejouait **aucun** (une poignée d'exemples à la main). Trou « zéro sur N » — mais
la découverte a livré plus que l'absence de test :

**Le site non couvert avait déjà dérivé, et la dérive était un bug visible.**
L'adaptateur Android `ConversationAccent.accentColorPalette()` mappait le `type`
du fil par un `when { … else -> ConversationType.DIRECT }` — au lieu de la table
canonique `WIRE_TYPE_TO_CONTEXT_TYPE` (TS/iOS) qui fait retomber
`public`/`global`/`broadcast` sur `community`. Résultat : un salon public ou
broadcast rendait un accent **corail (direct)** sur Android et **violet
(community)** sur web/iOS. Le témoin manquant n'était pas une assurance contre un
risque futur : il aurait rougi le jour où l'adaptateur a été écrit.

> **Quand une règle à N miroirs n'a aucun témoin de parité, ne pas présumer que
> les miroirs coïncident encore — l'absence de témoin est précisément la
> condition sous laquelle l'un a pu dériver sans bruit.** Le premier geste après
> avoir trouvé le trou n'est pas « ajouter le test qui les gardera » mais
> « rejouer le contrat sur le site non couvert et REGARDER s'il passe ». Ici il
> ne passait pas.

Deux corollaires de forme :

- **Un adaptateur avec une branche `else -> DÉFAUT` cache un mapping partiel.**
  `else -> DIRECT` avait l'air exhaustif (« tout le reste est direct ») alors
  qu'il avalait trois types qui ont une couleur PROPRE ailleurs. Un `else`
  fourre-tout sur une valeur du domaine (pas une vraie sentinelle d'erreur) est un
  endroit à confronter à la table canonique, jamais à lire comme « les cas
  restants n'ont pas d'opinion ».

- **Le miroir le plus fidèle rejoue le contrat par le MÊME chemin que la
  production.** Le test iOS passe par `MeeshyConversation.computeColorPalette`
  (l'adaptateur réel), jamais par un switch recopié dans le test ; le test Android
  passe par `DynamicColorGenerator.paletteForWire`, le chemin qu'emprunte
  `ApiConversation.accentColorPalette()`. Un test qui réimplémente la
  normalisation qu'il prétend garder ne garde que sa propre copie. Le correctif a
  donc dû D'ABORD créer le chemin réel (`paletteForWire`, miroir de
  `conversationAccentPalette`), puis y router l'adaptateur ET le test.
