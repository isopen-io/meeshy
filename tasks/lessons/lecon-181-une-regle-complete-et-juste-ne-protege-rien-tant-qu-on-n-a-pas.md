## Leçon 181 — Une règle complète et juste ne protège rien tant qu'on n'a pas répondu « qui l'appelle ? » (2026-08-15, routine temps réel, cycle 31, seconde passe)

*Jumelle de la leçon 180 : là-bas la garde MANQUAIT, ici elle EXISTE et ne
protège rien. Le second cas est le plus coûteux des deux, parce qu'il se
défend tout seul contre l'audit qui le cherche.*

`MessageValidator.checkPermissions` portait la règle d'écriture des
conversations en ENTIER : hiérarchie `everyone < member < moderator < admin <
creator`, dispense de la conversation globale, échappatoire du staff plateforme,
messages d'erreur soignés en français, tests verts. Un `grep` sur tout le
monorepo rendait **un seul invocateur : son propre fichier de test**. Le canal
d'annonces — créé par `type: 'broadcast'`, réglable par `PATCH`, refusé aux
modérateurs, servi aux clients dans la liste, documenté au schéma Prisma —
acceptait donc les messages de n'importe quel membre, avec le client officiel et
sans rien contourner.

**La règle.** Une règle métier n'est appliquée que par son SITE D'APPEL. Avant
de conclure « cette contrainte est respectée » parce qu'on vient d'en lire
l'implémentation, exécuter la seule requête qui le prouve : **`grep` le nom de
la fonction et compter les appelants HORS tests.** Zéro appelant ⇒ la règle
n'existe pas, quelle que soit sa qualité.

**Pourquoi c'est la classe de défaut la moins visible du dépôt.** Un audit
part naturellement du NOM DU CHAMP (`isAnnouncementChannel`), tombe sur
l'implémentation, la trouve correcte, et s'arrête. Le champ est écrit, lu,
sérialisé, documenté — toute la chaîne paraît vivante. Seul le sens de lecture
INVERSE (du champ vers ses lecteurs, puis de chaque lecteur vers ses appelants)
distingue une règle appliquée d'une règle simplement écrite. Corollaire
pratique : **un audit de garde n'est jamais terminé au fichier qui l'implémente ;
il se termine au chemin de production qui l'atteint.**

**Le corollaire aggravant — l'orphelin DISSUADE la correction.** Une garde
absente finit par se remarquer ; une garde présente et morte, jamais : le
prochain lecteur la trouve, conclut « c'est déjà fait », et referme. C'est
pourquoi le correctif SUPPRIME l'orphelin au lieu de le câbler. Le câbler aurait
marché ici, mais laisse ouverte la question qui a produit le défaut ; le
supprimer et republier la règle à l'endroit que l'entonnoir traverse la ferme.
**Un garde orphelin à côté d'un garde réel est pire qu'aucun garde.**

**Corollaire de placement — un garde d'admission a DEUX bornes, et les deux se
justifient.** Après le dedup précoce, parce qu'un rejeu porte une ligne déjà
écrite et diffusée : la refuser transforme un envoi RÉUSSI en erreur rendue au
client, qui rejouera indéfiniment. Avant la détection de langue, parce qu'un
refus ne doit pas payer un aller-retour HTTP de 266 ms. Un garde posé « au début
pour être sûr » aurait cassé l'idempotence ; posé « à la fin près de l'écriture »,
il aurait payé le translator pour rien.

**Corollaire d'asymétrie — un mode d'échec ne se choisit pas globalement, il se
choisit par ce qui MANQUE.** Police illisible ⇒ ADMETTRE : le garde AJOUTE une
restriction, un hoquet de base ne doit pas convertir un envoi ordinaire en
erreur (et c'est ce qui protège les documents hérités, dont les champs récents
sont ABSENTS et non `null`). Rang illisible ⇒ REFUSER : la restriction est
CONNUE, seule l'identité manque, et admettre ouvrirait le canal à tout le monde
pendant la panne. « Fail open » et « fail closed » ne sont pas des politiques de
module : ce sont des réponses à *quelle information manque-t-il ?*

**Corollaire de cache — une autorisation se lit fraîche.** La tentation de
mémoriser la police d'écriture (elle change une fois par an) a été écartée : un
cache de 30 s laisse une conversation CLÔTURÉE accepter des messages pendant une
demi-minute, et exige d'invalider à cinq sites. Le dépôt porte déjà la cicatrice
— `participant-lookup-cache` documente comment `unban` avait manqué à la liste
et refusait les messages de la personne qu'on venait de réintégrer. Avant de
mettre une décision de sécurité en cache, énumérer les sites qui doivent
l'invalider ; si la liste dépasse deux, la lecture fraîche est moins chère que
la dette.

---
