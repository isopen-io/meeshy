## 2026-10-10 : Un son utilisé ne se supprime pas — il cesse seulement d'être réutilisable (#9848)

Décision porteur du 2026-10-10 : **supprimer un son qui sert encore dans au moins une publication ne le supprime pas vraiment.** Le son quitte la bibliothèque de son auteur, la découverte, la recherche et le sélecteur : personne ne peut plus le poser sur une NOUVELLE publication. Toutes les publications qui l'utilisent déjà — celles de l'auteur comme celles des autres — continuent de le jouer, à l'identique.

### Ce que cela fixe

- **La donnée.** Le retrait est logique : `Sound.deletedAt DateTime?` (aucun booléen jumeau). La ligne `Sound` reste, pour que `@@unique([uploaderId, contentHash])` empêche une extraction suivante de la recréer, et `SoundUsage` reste intact.
- **La diffusion.** La route de service du fichier (`GET /static/:filename`) ne regarde que `mutedAt` (arrêt de diffusion pour modération) — jamais `deletedAt`. Retirer un son n'arrête aucune lecture.
- **Le fichier.** Il n'est effacé du volume que lorsque plus AUCUNE publication ne l'utilise (`SoundUsage` à zéro), par une passe distincte et idempotente (#9854) ; un son encore utilisé garde son fichier, quel que soit son `deletedAt`.
- **Le vocabulaire.** L'interface dit « Retirer de ma bibliothèque », jamais « Supprimer définitivement », et la confirmation annonce combien de publications l'utilisent encore et qu'elles continueront de le jouer.
- **L'arrêt de diffusion** reste l'affaire de la modération (`mutedAt`), pas du retrait par l'auteur.

### Pourquoi

Une publication est un objet que d'autres ont vu, partagé, republié. Lui retirer son son sous les pieds d'un lecteur casserait un contenu qui ne lui appartient pas (le réel d'un autre qui a emprunté le son) et changerait rétroactivement ce qui a été publié. Le retrait agit donc vers l'AVENIR : il ferme la porte aux nouveaux usages, il ne touche pas aux usages passés.
