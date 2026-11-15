## La boutique dit ce qui reste à débloquer et comment l'obtenir (2026-10-23, #11276)

### Contexte

Un pack récompensé (#11273) ou à fenêtre (#11274) apparaissait en boutique sans dire comment l'obtenir. `requirementPreview` (`utils/game/spend.ts`, #9705) savait déjà montrer une exigence avant le geste, mais la boutique ne le servait pas.

### Décision

1. **`GET /packs/shop` sert `requirementPreview` pour chaque pack du registre NON possédé** qui se gagne ou qui a une fenêtre. Un pack possédé ou libre n'en porte aucun : le champ est additif, et un ancien client l'ignore. La forme est `PackRequirementPreview` (`packages/shared/types/pack-unlock.ts`) :
   - `reward` : `rank` (rang visé, rang actuel, et `RequirementPreview` en points de Gloire) · `trophy` · `season` (`met`) ;
   - `window` : `upcoming | open | closed` et ses bornes ;
   - `met` : la récompense est remplie ET la fenêtre ouverte.
2. **Les faits sont lus par le serveur, UNE fois par lecture de boutique** (`PackGrants.unlockFacts`) :
   - la Gloire et la place de Mythe, seulement si un pack demande un rang ;
   - les trophées et les saisons visés, en une requête chacun.

   C'est la même source que celle qui juge l'octroi (`PackGrants.award`). L'aperçu montre ; il n'accorde rien.

### Conséquences

- Une lecture de boutique d'un domaine qui porte des packs récompensés coûte au plus trois lectures de plus. Argumenté, non mesuré.
- L'affichage côté clients (iOS, web) reste à faire : une issue suit.
