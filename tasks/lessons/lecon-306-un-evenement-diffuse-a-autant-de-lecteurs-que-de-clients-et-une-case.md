## Leçon 306 — un événement diffusé a autant de LECTEURS que de clients, et une case à cocher n'en est pas un (2026-08-28, cycle 130)

`USER_PREFERENCES_UPDATED` (scope conversation) porte l'instantané VERSIONNÉ de
la ligne `UserConversationPreferences` — une ligne **par utilisateur**. Le web le
décode, iOS le décode. **Android n'avait aucun écouteur**, et n'en avait jamais
eu : épingler ou mettre en sourdine une conversation depuis un autre appareil
n'atteignait le téléphone par aucun chemin.

Trois choses ont tenu ce trou hors de vue, et aucune n'est une négligence :

- **La liste Android se rafraîchit déjà sur trois trames.** `unread-updated`,
  `message:new`, `conversation:updated` déclenchent toutes une relecture fusionnée,
  ce qui rend crédible le raccourci « de toute façon ça se resynchronise ».
  Mesuré : l'écrivain de préférences n'émet **aucune** de ces trois trames. **Un
  rattrapage général ne rattrape que ce qui passe par lui.**
- **Le voisin immédiat était câblé.** `CategorySocketManager` décode les quatre
  trames de catégories. Une surface dont la MOITIÉ du sujet arrive en temps réel
  se relit comme une surface faite.
- **Le pilotage l'avait noté.** Une case NON cochée dans un inventaire de parité :
  `- [ ] **User Preferences** — user:preferences-updated`. Elle était juste, et
  elle n'a rien empêché.

> **Une case à cocher n'est pas un gate.** Un inventaire recense ; il ne tombe
> jamais. La forme qui tombe est un témoin — ici, celui qui gèle l'ensemble des
> noms d'événements qu'un manager enregistre, si bien qu'un écouteur manquant
> devient une assertion rouge et non une ligne qu'on relira peut-être.

Et le corollaire de méthode, qui est ce qui a réellement trouvé le défaut :

> **La question qui a fermé les cycles 121 à 125 sur le serveur se pose aussi aux
> clients, et se compte.** « Qui AFFICHE ce que ce résolveur élit ? » (cycle 122)
> avait une réponse à UN exemplaire côté passerelle. Pour un événement DIFFUSÉ,
> elle en a autant que de clients — trois — et la réponse « le web et iOS » est
> une réponse à 2/3. **Devant tout événement serveur, compter les décodeurs avant
> de le croire consommé** : c'est déjà la forme de la note du cycle 118 (« quand
> cette liste dit *jumelles*, compter les clients avant de la croire »), portée
> d'un résolveur de Prisme à un événement de synchronisation.

Deux corollaires mineurs, tous deux mesurés dans le lot :

- **Ne pas câbler est une décision qui s'écrit et se gèle.**
  `user:preferences-reordered` ne porte que `orderInCategory`, qu'aucune surface
  Android ne lit (`ConversationSections.of` range sur `isPinned` + `categoryId` ;
  zéro occurrence du champ dans `apps/android/**/*.kt`). Le câbler produirait le
  contrôle INERTE du cycle 123 pris à l'envers — un décodeur dont la valeur
  n'atteint aucun pixel. Un témoin gèle donc l'ABSENCE de l'écouteur, pour que la
  prochaine personne doive l'ajouter plutôt que le supposer présent.
- **Un type de fil décrit l'ÉMETTEUR, pas le consommateur.** Trois clés
  (`orderInCategory`, `readingMode`, `clearHistoryBefore`) restent déclarées sur
  le type Kotlin sans être repliées dans le cache : une clé absente du type est
  une clé que personne ne retrouve le jour où un lecteur apparaît.
