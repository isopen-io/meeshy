## 2026-08-09 (13) — Une borne qui n'apparaît pas dans le résultat ment sur ce qu'elle rend

**Contexte** — Cycle 32. Quatre lectures de graphe bornées à 500 lignes alimentent les fan-out de
notification. La borne est légitime — elle tient le coût sur un post viral. Mais une liste rendue à
la borne exacte est **indiscernable** d'une liste complète : le seau paraît entier, et personne
n'apprend que le 501e destinataire n'a jamais été notifié.

**Ce que ça ajoute au corollaire du cycle 27** (« une valeur vide *établie* et une valeur vide
*qu'on n'a pas pu établir* doivent être distinguables dans le type de retour ») : le même
raisonnement vaut pour une valeur PLEINE. « Complet » et « arrêté à la borne » sont deux vérités
différentes sur l'audience réelle, et un `string[]` n'en porte qu'une.

**Règle** — tout `take`/`limit`/`slice` qui borne un ensemble de destinataires doit rendre sa
saturation avec l'ensemble, et la consigner. Sans quoi le défaut ne se manifeste que sous la forme
« je n'ai rien reçu », côté utilisateur, des mois plus tard.

**Corollaire — regarder le TRI avant de juger la gravité.** Le cas le plus grave n'était pas le post
viral (troncature ponctuelle, destinataires différents à chaque fois) mais le fan-out de publication
trié `updatedAt desc` : borne fixe + tri stable = **toujours les mêmes** contacts, les plus anciens,
qui n'apprennent aucune publication de cet auteur. Un tri stable transforme une troncature en
exclusion permanente.
