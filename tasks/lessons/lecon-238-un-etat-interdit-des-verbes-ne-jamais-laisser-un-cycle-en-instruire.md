## Leçon 238 — un ÉTAT interdit des VERBES ; ne jamais laisser un cycle en instruire un seul (2026-08-18, routine messagerie, cycle 71)

Le schéma dit de `Conversation.closedAt` : « no one can write ». Le cycle 31 a
fait respecter cette phrase, longuement, en la câblant au point de convergence
des **envois**. Trente-neuf cycles plus tard, *réagir* et *éditer* écrivaient
toujours librement dans un fil déclaré mort — même conteneur, même état, même
diffusion vers des clients qui l'ont retiré de leur cache.

> Quand une garde fait respecter un ÉTAT, énumérer les VERBES que cet état
> devrait interdire — et le faire par balayage des écrivains, jamais par
> relecture de la garde. « Écrire » se lit spontanément comme le verbe qu'on
> avait sous les yeux le jour où on l'a corrigé.

C'est le prolongement direct de la Leçon 237 (« énumérer les autres opérations
que ce même état devrait interdire »), et la preuve qu'elle n'était pas encore
apprise : le cycle 70 l'a écrite pour la famille ENTRER, en ratant que sa propre
formulation valait aussi pour ÉCRIRE.

### Le piège neuf : la liste de gardes PLAUSIBLE

`addReaction` refusait déjà : message inexistant, message supprimé, message
« system », appelant non participant. Quatre gardes, toutes justes. Une
relecture qui demande « les gardes sont-elles là ? » les trouve toutes et
s'arrête satisfaite — c'est exactement ce qui a protégé le trou.

> Une liste de gardes ne se relit pas en demandant « sont-elles correctes ? »
> mais **« de quelles FAMILLES relèvent-elles ? »**. Ici les quatre portaient
> toutes sur le MESSAGE ou sur la PERSONNE ; aucune sur le CONTENEUR. Une
> famille entière absente ne se voit pas dans une liste dont chaque membre est
> juste.

### Et le détail qui rend le constat cinglant : la donnée était déjà chargée

`addReaction` ramenait `message.conversation` par son `include` depuis toujours.
`isActive` et `closedAt` étaient dans l'objet, à chaque appel, sans un lecteur.
La garde a coûté **zéro requête**.

> Quand une garde manquante s'avère gratuite, ce n'est pas une bonne nouvelle :
> c'est la mesure de ce qui a manqué. Rien ne l'avait retardée qu'une question
> non posée.

### L'ordre d'une garde peut être une propriété de SÉCURITÉ

L'unité sœur tranche la clôture EN PREMIER ; celle-ci la tranche EN DERNIER, sur
la seule décision qui allait être admise. Ce n'est pas une incohérence : un des
quatre transports d'édition s'atteint avec un `messageId` NU et rend un 404
volontairement indistinct pour ne pas devenir un oracle d'existence. Trancher la
clôture avant l'autorisation lui rendait cet oracle.

> Avant de placer une garde « le plus tôt possible », demander ce que son refus
> RÉVÈLE, et à qui. Placée après l'autorisation, elle ne parle qu'à ceux qui
> avaient déjà le droit de savoir — et tous les transports peuvent alors en
> dire le vrai motif.

### Le corollaire de refus : un motif AJOUTÉ retombe dans le `else` de quelqu'un

Deux sites rangeaient tout motif inconnu dans leur branche par défaut. Les
transports d'édition auraient annoncé « vous n'êtes pas autorisé » pour un état
qui n'a rien d'une autorisation. Pire, `routes/reactions.ts` trie les erreurs de
son service **par comparaison de chaînes** : le refus serait sorti en **500**,
donc en panne, donc en client qui réessaie sans fin.

> Ajouter un motif de refus n'est jamais fini quand l'unité le rend : il faut
> visiter chaque traducteur de refus et vérifier ce que sa branche PAR DÉFAUT
> ferait du nouveau. Un refus métier servi en 500 est pire que pas de garde du
> tout — il transforme une règle en boucle de réessai.

### Et l'asymétrie qu'il faut ÉCRIRE plutôt que subir

Retirer une réaction et effacer un message restent permis sur un fil clos. La
clôture étant irréversible, refuser la rétraction enfermerait quelqu'un dans un
contenu qu'il ne pourrait plus jamais reprendre.

> Quand on gèle une famille de verbes, dire aussi lesquels restent ouverts, et
> poser un témoin sur ce choix. Une exception non écrite se lit au cycle suivant
> comme un oubli, et se « corrige » en régression.

### Corollaire de routine (cycle 71) — un rouge de CI n'est pas à soi tant qu'on ne l'a pas daté

La suite gateway rendait 2 rouges à la fin de ce cycle. Le réflexe coûteux
aurait été de les traiter comme une conséquence du changement — le changement
touche des routes de messages, les rouges touchent des notifications, il y a
toujours une histoire plausible qui relie les deux.

Trois mesures les ont datés en quelques minutes, et dans cet ordre :

1. **Rejouer la suite sur le commit d'AVANT** (`git checkout HEAD~1`) : mêmes
   deux rouges. Le changement est hors de cause.
2. **Dater le FICHIER** (`git log -- <fichier de témoins>`) : il vient d'un
   commit déjà ancêtre de `main`. Ce n'est donc pas « ma branche est en
   retard », c'est « `main` est rouge ».
3. **Lire ce que la production fait VRAIMENT** plutôt que ce que le témoin
   attend — une sonde `console.log` sur l'objet réellement écrit. Elle a rendu
   la réponse d'un coup : la phrase d'action avait migré vers le titre, l'emoji
   vers `metadata`.

> Devant un rouge inattendu, ne pas chercher **la cause** avant d'avoir cherché
> **la date**. « Est-ce que ça rougissait déjà hier ? » se répond en une
> commande et disqualifie ou confirme tout le reste de l'enquête.

### Et la règle qui décide quoi en faire : DÉPLACER l'assertion, jamais la retirer

Un témoin qui gèle un contrat révolu doit être mis à jour, pas supprimé — et la
frontière entre les deux est nette : **l'information a-t-elle disparu, ou
changé d'endroit ?** Ici elle avait changé d'endroit, donc l'assertion suit
l'information (`metadata.emoji`, `title`) et le témoin garde son pouvoir de
tomber. La preuve n'est pas facultative : on mute la production pour faire
disparaître l'information à son NOUVEL endroit, et on vérifie que le témoin
déplacé rougit encore.

> « Rendre vert » n'est jamais une raison d'affaiblir un témoin. Quand un
> contrat bouge, l'assertion voyage avec lui — et on redémontre son ROUGE à sa
> nouvelle adresse, sans quoi on a écrit une décoration en croyant réparer une
> garde.

Corollaire pour le partage, appliqué ici : le témoin asserte désormais les
**deux** moitiés (phrase d'action dans le titre, cible dans le corps). Une
information qui se déplace une fois se déplacera deux fois ; asserter les deux
extrémités fait rougir le déplacement qui n'écrit la phrase NULLE PART, seul
cas qui soit un vrai défaut.

---
