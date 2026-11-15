## Leçon 555 — Un doc-comment qui NOMME son propre manque est un défaut mesuré que personne n'a lu

2026-09-09, #5847. Le porteur demande que la vue de succès s'affiche quand on
réalise l'opération qui le déclenche. Mesure : **cent quatorze succès composés
se gravaient en silence** — `git grep createNotification --
services/gateway/src/services/achievements` rendait ZÉRO, et la célébration
n'était atteignable que par un tap dans le centre de notifications.

Le plus troublant n'est pas le défaut : c'est que **le code le disait**, dans le
doc-comment de la fonction fautive, en toutes lettres :

> *« Ce qu'il ne donne PAS, et qui reste à gagner : la notification AU MOMENT du
> geste. Un succès balayé tombe quand l'utilisateur regarde, pas quand il agit. »*

Cette phrase est honnête, juste, et datée du lot qui a livré la feature. Elle
décrit un produit à moitié livré, et elle est restée là — parce qu'un
doc-comment n'est ni une issue, ni un test rouge, ni une ligne de tableau. **Rien
dans le dépôt ne relit les aveux.**

> **Chercher les aveux est une technique d'audit à part entière**, et la moins
> chère du dépôt : `git grep -iE "ne (donne|fait|couvre) pas|reste à gagner|pour
> l'instant|à étendre|TODO"` dans le dossier d'une feature qu'on suspecte
> incomplète. Un auteur consciencieux écrit précisément où il s'est arrêté ; ce
> qui manque, c'est quelqu'un pour transformer la phrase en issue.

**Corollaire de gouvernance, et c'est lui qui compte** : `CLAUDE.md` dit qu'une
issue fermée doit ouvrir *une issue par dimension qui n'est pas mûre*. Ce
doc-comment EST une dimension non mûre (13 — complétude), écrite au bon endroit,
au bon moment, par la bonne personne — **et pas dans le bon substrat**. La règle
se relit donc : ce qu'on découvre en chemin devient une issue, y compris quand
on l'a soi-même écrit dans un commentaire trois lignes plus haut.
