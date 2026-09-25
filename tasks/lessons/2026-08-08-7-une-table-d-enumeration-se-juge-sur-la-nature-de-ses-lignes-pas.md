## 2026-08-08 (7) — Une table d'énumération se juge sur la NATURE de ses lignes, pas sur leur nombre

Le cycle 17 annonçait la clé « ce que TOUT message doit à ses DESTINATAIRES » et produisait six
lignes. Les six étaient des `SERVER_EVENTS.*`. La clé annoncée était produit, la clé réellement
appliquée était technique — « ce que le manager Socket.IO émet » — et la notification, qui ne
passe par aucun émetteur socket, ne pouvait pas apparaître comme une absence dans une table
dont chaque ligne était un nom d'événement.

**Leçons :**
1. **Relire une table d'énumération en demandant : mes lignes sont-elles toutes du même TYPE
   TECHNIQUE ?** Si oui, la clé appliquée n'est pas la clé annoncée, et tout ce qui vit dans un
   autre mécanisme est invisible. Ici : six événements socket, zéro écriture en base, zéro
   push. Le test tient en une question et se pose avant d'écrire la ligne « reste ouvert ».
2. **Classer les canaux par QUI ils atteignent, pas par ce qu'ils transportent.** Room live,
   file hors ligne et pastille de non-lus ne parlent qu'à un client déjà OUVERT. La
   notification est le seul canal qui atteigne quelqu'un qui ne regarde pas. Sur cette échelle,
   son absence dominait les cinq autres obligations réunies — et l'ordre de priorité n'était
   lisible sur aucune table triée par mécanisme.
3. **Rendre une unité atteignable ne suffit pas si elle porte une hypothèse sur qui l'appelle.**
   Extraire l'éventail aurait servi la route de lien authentifiée et laissé la route ANONYME
   muette, `if (!sender) return` butant sur un expéditeur sans ligne `User`. Règle : avant de
   rendre appelable un corps `private`, lire ce corps en se demandant ce qu'il suppose du
   NOUVEL appelant — pas seulement ce qu'il fait pour l'ancien.
4. **Un défaut découvert sur un chemin périphérique est souvent déjà en production sur le
   chemin principal.** L'abandon sur expéditeur anonyme se manifestait sur le chemin de lien,
   mais il frappait aussi tout anonyme envoyant par socket `message:send`. Quand on trouve une
   hypothèse implicite, vérifier qui d'autre la viole DÉJÀ avant de la traiter comme le défaut
   d'un seul appelant.
5. **Quand le correctif de correctness et l'optimisation sont le même changement, on a trouvé
   le bon endroit.** `senderProfile` rend nommable un acteur absent de `User` ET supprime une
   lecture `User` par destinataire. Deux motifs indépendants convergeant sur un seul paramètre
   est un signal fort ; deux motifs qui exigent deux paramètres différents en est un contraire.
6. **Un paramètre mort peut être la trace d'une intention perdue, pas seulement du bruit.**
   `createMentionNotificationsBatch` recevait `senderUsername`/`senderAvatar` sans jamais les
   lire, pendant que la méthode qu'elle appelle rechargeait l'utilisateur. L'information qui
   manquait pour servir un acteur sans compte traversait l'API depuis toujours. Avant de
   supprimer un paramètre inutilisé, se demander ce qu'il aurait résolu s'il avait été lu.
