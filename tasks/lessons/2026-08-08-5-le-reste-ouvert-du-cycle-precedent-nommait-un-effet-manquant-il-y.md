## 2026-08-08 (5) — Le « Reste ouvert » du cycle précédent nommait UN effet manquant ; il y en avait trois

Le cycle 15 avait relevé, sans le traiter : « le chemin de lien ne déclenche aucune
traduction ». Vérification faite, le chemin de lien n'exécutait **aucun** des effets
post-commit du chemin nominal — ni le bump de `lastMessageAt`, ni les statistiques. La note
avait décrit le symptôme qu'on avait sous les yeux au moment où on l'écrivait, pas la classe.

**Leçons :**
1. **Un « reste ouvert » se relit comme une hypothèse, jamais comme un inventaire.** La note
   disait « aucune traduction » ; la bonne question au moment de la traiter n'était pas
   « comment ajouter la traduction » mais « qu'est-ce que ce chemin ne fait PAS, que le
   chemin nominal fait ? ». Poser la question sous cette forme a coûté une lecture de
   `runPostSaveSideEffects` et a triplé le périmètre réel du défaut.
2. **Troisième cycle consécutif sur la même racine : une obligation produit dans un
   `private`.** Cycle 14 (diffusion), cycle 15 (file hors ligne), cycle 16 (effets
   post-commit). À chaque fois la classe entière est contournée par un autre écrivain, donc
   la question « ce contrat est-il atteignable par quelqu'un qui n'est pas dans cette
   classe ? » aurait suffi. Règle opérationnelle : **tout `private` dont le docstring décrit
   une garantie côté produit (« tout message doit… », « chaque participant reçoit… ») est un
   défaut en attente d'un second écrivain.**
3. **Un correctif client peut MASQUER l'absence de la donnée serveur, et le commentaire qui
   l'explique devient alors la preuve du trou.** Le docstring de `broadcastLinkMessage`
   justifiait de ne pas émettre `conversation:updated` par « le handler web remonte lui-même
   la conversation depuis cet événement ». C'est exact — et c'est précisément ce qui rendait
   `lastMessageAt` périmé invisible : le client remontait la conversation, le refetch la
   redescendait. Quand une optimisation s'appuie sur un effet client, vérifier que le
   serveur porte la même vérité, sinon le prochain refetch est une régression silencieuse.
4. **Ce qu'on pousse en aval, c'est ce qui est STOCKÉ, pas ce qui est reçu.** Deux pièges au
   même endroit : le contenu (les URLs sont réécrites en liens de tracking avant l'insert) et
   la langue source (normalisée avant l'insert). Pousser `body.*` aurait traduit un texte que
   personne ne verra, rangé sous la clé du message — donc des traductions désalignées de leur
   original —, et fait retomber NLLB sur l'anglais pour toute locale région-taggée. Les deux
   sont invisibles à la lecture du site d'appel : ils n'existent que si un test les nomme.
   Vérifiés par mutation (`body.content`, `body.originalLanguage`), chacun faisant tomber
   exactement les deux tests qui le couvrent.
5. **Une omission de parité se justifie par deux faits vérifiés, pas par une intuition.**
   Le curseur de lecture de l'auteur n'est pas dans l'unité partagée pour deux raisons
   CONSTATÉES : le décompte de non-lus exclut déjà ses propres messages
   (`senderId: { not: participantId }`, trois occurrences), et la route authentifiée peut
   porter un participant synthétique `{ id: userId }` sous lequel l'upsert créerait un
   curseur orphelin. Sans ces deux vérifications, « je n'inclus pas cet effet » aurait été
   la même négligence que celle qu'on corrige, avec un meilleur vocabulaire.
6. **Extraire d'une classe, c'est aussi laisser un orphelin derrière soi.** `updateStats` et
   `updateConversation` sont devenus inatteignables au moment où `runPostSaveSideEffects` a
   délégué. Une extraction non suivie du retrait des méthodes qu'elle vide laisse deux
   implémentations de la même chose dans le fichier — exactement la divergence que
   l'extraction visait à rendre inécrivable.
