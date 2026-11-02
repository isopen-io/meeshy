## Un pack a une fenêtre et un ciblage qui gouvernent l'OFFRE, jamais la possession ; une saison nomme son pack récompense (2026-10-23, #11274)

### Contexte

Le registre des packs (`PackIndexEntrySchema`) ne savait dire ni QUAND un pack est offert, ni À QUI. La décision #11252 retient, au point 3, ce défaut : **un objet manqué revient, et aucune exclusivité n'est définitive** (DSA art. 25, pas de FOMO). La récompense d'une saison existait déjà côté pack (`reward: { kind: 'season', number }`, #11273). La saison, elle, ne nommait aucun pack.

### Décision

1. **`availability { startsAt?, endsAt? }` et `targeting { communities?, countries?, languages? }`** sont deux champs OPTIONNELS de l'entrée de registre (`content-pack-index.ts`), lus fail-closed par entrée. Une fenêtre inversée est rejetée. Un pays est un code ISO alpha-2 en capitales, une communauté un identifiant, une langue un code ISO 639-1. Un ancien registre reste lisible tel quel.
2. **La loi est une, `packages/shared/types/pack-availability.ts`** :
   - `packWindowState` : `startsAt` inclus, `endsAt` exclu ;
   - `isPackTargeted` : chaque dimension déclarée doit être satisfaite, et une valeur suffit à l'intérieur d'une dimension. La langue se lit sur TOUT le prisme du lecteur, sans la région ;
   - `isPackOffered` : la fenêtre et le ciblage ;
   - `isPackShelved` : le pack est offert, ou déjà TENU par le lecteur (une ligne de possession ou une installation).
3. **La possession n'en dépend jamais.** `isPackOwned` ne lit ni fenêtre ni ciblage : c'est la traduction du défaut #11252. Un pack possédé hors fenêtre reste possédé, en rayon et installable. Un pack installé pendant sa fenêtre reste en rayon et se retire normalement.
4. **Le moteur (`PackCatalog`) applique la loi aux trois gestes neufs :**
   - la boutique ne liste que ce qui est en rayon ;
   - installer un pack hors offre que l'on ne tient pas rend `not-found`, comme pour un pack masqué ;
   - acheter hors offre rend `not-found`, dans la garde de la dépense, que le rejeu d'un achat déjà payé ne traverse pas.

   L'octroi (`award` : jeu, octroi, événement) n'est pas gardé par l'offre : c'est un acte explicite, qui doit pouvoir rendre un objet manqué.
5. **Le lecteur d'un ciblage est lu par le SERVEUR** (`services/packs/packAudience.ts`) :
   - ses communautés actives ;
   - son pays : `deviceCountry`, sinon `registrationCountry`, sinon `phoneCountryCode` ;
   - ses langues : le prisme, par `recipientLanguages`.

   Ce lecteur n'est lu que si un pack du registre est ciblé. Une lecture qui échoue donne le lecteur inconnu : seuls les packs sans ciblage restent offerts. Le ciblage n'est jamais servi au client. La fenêtre l'est (`availability`, additif), pour dire « jusqu'au … ».
6. **Une saison nomme son pack récompense** :
   - `GameSeasonDefinition.rewardPackKey` est optionnel (MongoDB, aucune migration) ;
   - `SeasonDefinition.rewardPack` prend une clé `packChoiceKey`, gardée seulement si elle est lisible ;
   - `PUT /admin/game/seasons/:number` accepte `rewardPack` (`null` le retire) et refuse une clé illisible en `422 invalid-reward-pack` ;
   - la clé est servie à l'admin (`rewardPack`, `null` si absente) et au calendrier (`/me/game/seasons/calendar`, absente si aucune).

### Conséquences

- La publication et la modification de ces champs sans déploiement passent par l'administration des packs (#11275).
- La boutique dira ce qui reste à débloquer, y compris la fenêtre (#11276).
