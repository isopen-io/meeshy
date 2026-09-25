## Leçon 301

**Rendre un champ optionnel côté ÉMETTEUR n'est pas un geste local.**

Le `CLAUDE.md` porte déjà la règle « un champ que le client lit
AUTORITATIVEMENT n'est plus optionnel pour l'émetteur ». #4009 en a rencontré la
**réciproque** : retirer `rights.canViewHistory` de la charge diffusée à la room
était juste sur le principe, et le test SDK l'a dit littéralement —

    keyNotFound(canViewHistory)

Le champ était un `Bool` NON optionnel côté Swift : le décodage LÈVE sur la
charge réduite, et l'événement ENTIER est perdu. Un simple membre aurait cessé
de recevoir **tout** changement de droits — pas seulement celui qu'on lui cache.
Côté web, le handler recopiait `rights` EN BLOC : un hôte reçoit les DEUX
charges (réduite par la room, complète par sa room personnelle) et **leur ordre
ne se suppose pas**, si bien que la charge réduite effaçait le champ de la fiche
affichée au hasard de l'arrivée.

> Avant de retirer un champ d'une charge, demander : **que fait chaque lecteur
> de son ABSENCE ?** Trois réponses possibles, et une seule est bénigne — il
> l'ignore ; il LÈVE (et perd tout le message) ; il l'écrase par un défaut.

Et le dernier maillon, celui qu'on ne voit qu'en le cherchant : **une garde qui
ne garde qu'un des deux chemins n'en garde aucun.** La route REST sert
`entryCapabilities` — donc `canViewHistory` — sans condition à tout membre,
alors qu'elle garde déjà `historyVisibleFrom` derrière `viewerHostsTheRoom`.
Retirer le champ du push ne protège rien tant que le pull le sert (suivi
#4056). C'est la forme du cycle 122 du Prisme — « qui AFFICHE ce que le
correctif élit ? » — appliquée à une garde de confidentialité.
