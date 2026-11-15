## Leçon 94 — Un même nom d'événement pour deux faits produit DEUX défauts opposés, et aucun ne se lit dans le code qui l'émet (2026-08-11, routine messaging, cycle 71)

`conversation:joined` était émis à deux endroits avec **le même payload** : l'ack self-only d'un
socket qui rejoint la room (à chaque ouverture de fil, aucune appartenance changée) et la diffusion
d'une adhésion réelle. Aucun client ne pouvait les distinguer. Les deux s'en sont sortis
différemment, et les deux se sont trompés :

- **web** a compté l'ack comme une adhésion → l'effectif du groupe grossissait d'une unité à chaque
  ouverture du fil, indéfiniment ;
- **iOS** n'a rien compté du tout → l'effectif ne connaissait que des soustractions et dérivait vers
  le bas, persistée dans le cache disque.

Symptômes opposés, racine unique. Ce qu'il faut en retenir :

1. **L'absence d'un handler est une donnée, pas un vide.** Le `+1` manquant côté iOS n'était pas un
   oubli : c'était la seule réaction correcte face à un événement ambigu. Chercher pourquoi un
   client N'ÉCOUTE PAS est aussi instruit que lire ce qu'il fait.
2. **Le défaut ne se voit dans aucun des deux émetteurs.** Chacun, lu seul, est parfaitement correct.
   Il n'apparaît qu'en cherchant TOUS les émetteurs d'un même `SERVER_EVENTS.X` — ce que fait
   `grep SERVER_EVENTS.X` en une seconde, et qu'aucune lecture de route ne fera jamais.
3. **Le critère mécanique se réutilise** : un événement émis à la fois par `socket.emit` (self-only)
   et par `io.to(...).emit` (diffusion) porte deux faits. Le vérifier avant d'écrire un handler
   qui compte quoi que ce soit.
4. **Séparer plutôt que désambiguïser.** Ajouter un champ discriminant à `conversation:joined`
   aurait cassé tous les clients déployés qui ne le lisent pas. Un événement neuf, laissant
   l'ancien strictement intact, ne régresse personne — et un témoin fige l'ancien pour le prouver.
