## Leçon 237 — une garde à moitié posée est une garde qu'on croit posée (2026-08-18, routine messagerie, cycle 70)

> Numérotation : 236 était le dernier occupé — vérifié sur le carnet, pas supposé.

Le schéma documente `Conversation.closedAt` par « closed for all — **no one can
write**, messages stay readable ». Le cycle 31 a fait respecter cette phrase, et
l'a documentée longuement. Trente-neuf cycles plus tard, on pouvait toujours
**ENTRER** dans une conversation close, par les quatre portes, indéfiniment.

Personne n'avait menti. La phrase du schéma parle d'écriture, la garde parle
d'écriture, les deux s'accordent. **La question voisine n'a simplement jamais été
posée** — et une question non posée n'a pas de réponse fausse à corriger : elle a
une réponse par défaut, ici « oui », que rien n'écrit nulle part.

> Quand une garde fait respecter un état sur UNE opération, énumérer les autres
> opérations que ce même état devrait interdire — **avant** de la déclarer posée.
> Un état terminal touche au moins trois familles : écrire, entrer, être admis à
> rester. Une garde qui n'en couvre qu'une laisse les autres avec une réponse par
> défaut, et la documentation de la garde posée fait passer tout le sujet pour
> traité.

### Le corollaire qui fait tenir le défaut : un état porté par UN modèle est invisible aux autorisations dérivées d'un AUTRE

Fermer une conversation n'écrit sur **aucune** ligne `Participant`. Les deux
portes d'ajout autorisaient sur le rang de l'appelant — donc sur `Participant` —
et le rang survit intact à la clôture. Elles étaient exactement aussi ouvertes le
lendemain de la clôture que la veille, et aucune relecture de leur logique
d'autorisation ne pouvait le montrer : cette logique est correcte, elle regarde
juste ailleurs.

C'est la variante exacte du piège déjà noté par `conversationWriteAdmission` —
« `isActive` existe sur DEUX modèles, une relecture le trouve partout et
s'arrête ». Ici ce n'est plus une confusion de lecture, c'est une propriété du
schéma : **une autorisation dérivée de A ne peut pas voir un fait porté par B.**

### Et la variante « le prédicat existait, exporté, avec son mode d'emploi »

`isConversationClosed` était exporté, lisait les deux colonnes, et son en-tête
désignait nommément les routes de lien de partage comme ses clientes. Les routes
l'appelaient — sur le chemin d'ÉCRITURE. La porte d'ENTRÉE du même fichier, à
trois cents lignes de là, ne l'appelait pas.

> Devant un prédicat partagé, ne pas se demander « est-il appelé ? » mais
> **« quels appelants lui manquent ? »**. Chercher par nom de symbole rend les
> sites qui l'utilisent ; il faut chercher par la QUESTION qu'il répond, et la
> poser à chaque route qui devrait se la poser.

### Ce qui rend le correctif durable, et c'est du typage, pas de la vigilance

Le paramètre ajouté à `resolveConversationEntry` est **requis**, jamais optionnel.
Optionnel, la porte qui l'oublie garde le trou et personne ne le voit. Requis, il
fait échouer la compilation de toute porte — y compris une porte future — qui n'y
répond pas.

> Quand on ajoute une question qu'un appelant DOIT se poser, la rendre
> obligatoire dans le type plutôt que documentée dans l'en-tête. Un défaut par
> omission ne se corrige durablement qu'en rendant l'omission impossible à
> exprimer.

### Et la mesure du rouge, encore

Le stash des fichiers de production a produit un rouge sur le fichier d'unité —
mais un rouge de COMPILATION (`TS2561`, champ inconnu), pas de comportement,
puisque le stash retirait aussi le type. Un rouge dont la cause n'est pas celle
qu'on croit ne prouve rien. La mutation a dû être refaite au scalpel : la seule
ligne de court-circuit retirée, le type conservé.

> Rappel de la leçon 234 dans son cas le plus traître : **quand une livraison
> touche un TYPE et un COMPORTEMENT, le stash global ne peut pas prouver le
> comportement.** Muter la ligne, pas le fichier.

---
