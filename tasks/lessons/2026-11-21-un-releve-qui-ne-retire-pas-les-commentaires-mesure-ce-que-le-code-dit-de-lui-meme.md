## Un relevé qui ne retire pas les commentaires mesure ce que le code DIT de lui-même

**Date** : 2026-11-21. **Lot** : cycle 207, #20267. **Famille** : les affirmations
(cycle 94), et la jumelle immédiate du cycle 206 (« une négation est
l'affirmation la moins relue du dépôt »).

## Le fait

`client-event-readers.ts` répond « quelles plateformes LISENT cet événement ? »
pour DEUX cliquets — l'orphelin total et l'asymétrie à trois clients. Il balaie
le texte des sources sans retirer les commentaires. Mesuré : six de ses
citations étaient des doc-comments, et **deux déclaraient le contraire de ce que
le relevé en concluait** :

- `battery-host.tsx` (web) : « le web REÇOIT, il n'émet pas … **cet onglet
  n'écoute pas l'événement** » ⇒ compté comme un lecteur de
  `battery:pull-requested` ;
- `PreferencesSocketManager.kt` (Android) : «
  `user:preferences-community-reordered` **stays unheard** » ⇒ compté comme son
  lecteur, ce qui a tenu un ORPHELIN hors des deux inventaires.

## La leçon

> Pour un balayage textuel, **une phrase qui dit « je n'écoute pas X » est la
> meilleure preuve que X est lu ici**. Le relevé ne mesure pas une propriété du
> code : il mesure ce que le code dit de lui-même, négations comprises.

Et le sens de l'erreur est celui qui ENDORT : un lecteur de trop, donc une
asymétrie ou un orphelin de moins. Un cliquet qui crie à tort finit désarmé
(cycle 107) ; un cliquet qui se TAIT à tort n'est jamais remis en cause.

## Ce qu'on fait

- **Tout balayage de source retire les commentaires d'abord**, et le dépôt a
  déjà l'outil : `withoutComments` (`mirror-contract.ts`), exporté, employé par
  les relevés de contrat du même répertoire. Le chercher avant d'en écrire un.
- **Une limite écrite protège contre le défaut qu'elle NOMME, et contre aucun
  autre.** Celui-ci s'écrivait « cité ≠ branché … c'est une limite, pas un
  silence » — vraie, honnête, et parlant d'autre chose : le nom qui n'est pas
  branché. Le cas mesuré est plus fort — le nom n'est pas cité DU TOUT, il est
  seulement RACONTÉ. Devant une limite écrite, demander : *couvre-t-elle ce que
  je viens de trouver, ou son voisin ?*
- **Deux aveuglements de sens inverse se compensent, et la compensation est
  silencieuse.** Le même relevé ne résolvait pas les cartes de noms de DOMAINE
  (55 noms du contrat, 18 fichiers que `SERVER_EVENTS` étale) : il inventait des
  lecteurs d'un côté et en cachait de l'autre. Le solde paraissait juste. Quand
  on répare un instrument, réparer les DEUX sens dans le même lot — sinon la
  moitié réparée publie un écart que l'autre moitié fabrique.
