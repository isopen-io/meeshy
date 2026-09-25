## Leçon 134 — « ce n'est pas le contenu » est un motif de mise hors périmètre qui doit être VÉRIFIÉ champ par champ (2026-08-12, routine messaging, cycle 93)

Le cycle 92 avait exclu `metadata` de la destruction éphémère au motif que « ce n'est pas le
contenu du message », et consigné l'exclusion en dette assumée — la bonne pratique, en apparence :
nommer ce qu'on ne fait pas plutôt que l'emporter en passant.

Le motif était faux. `MessageProcessor.saveMessage` range dans `metadata.location` les coordonnées
d'un lieu partagé, **en clair**, et dans `metadata.postReplyTo` l'instantané figé du post cité. Une
position GPS survivait donc à l'échéance du message qui la portait, en clair et pour toujours,
pendant que le TEXTE du même message était détruit — exactement la fuite au repos que la passe
avait été écrite pour fermer, laissée ouverte sur le champ le plus sensible.

Le second « reste nommé » de la même dette (« les lignes de localisation, `MessageLocation` ») **ne
correspondait à aucun modèle** : la localisation vit dans ce même `metadata`. Les deux dettes
étaient la même, et se sont fermées d'un `metadata: null`.

**Règle : une dette assumée hérite de la fiabilité de son MOTIF, pas de celle de sa formulation.**
Un champ fourre-tout (`metadata`, `payload`, `extra`, `data`) n'a pas de contenu par nature — il a
celui que ses écrivains y mettent. Avant de l'exclure d'un traitement de sécurité, énumérer ses
ÉCRIVAINS (`grep` sur les affectations, pas sur les lectures) et décider champ par champ. Ici la
liste tenait en deux entrées et l'une d'elles suffisait à renverser la décision.

---
