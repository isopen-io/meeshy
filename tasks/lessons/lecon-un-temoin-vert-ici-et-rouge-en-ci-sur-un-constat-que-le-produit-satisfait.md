## Leçon — un témoin VERT ici et ROUGE en CI, sur un constat que le produit satisfait, mesure la MACHINE (#6862, PR #6934)

`check-admin-souverain` — le gate navigateur de la lecture souveraine — est passé
**vert sur le poste** et **rouge en CI**, sur UN de ses cinquante constats :
« `<dialog>` natif, réellement ouvert ». Les quarante-neuf autres, dont le Prisme
du membre prouvé par contraste et l'absence de trace sur le disque, étaient verts
des deux côtés.

Le dépôt connaît déjà les deux formes symétriques : « ROUGE des deux côtés du diff
mesure aussi la machine », « VERT des deux côtés mesure la machine ». **Celle-ci
est la troisième, et c'est la plus instructive : vert d'un côté, rouge de l'autre,
sur un produit INCHANGÉ.** Elle ne dit rien du produit — elle dit que le témoin a
mesuré autre chose que sa règle. Deux défauts vivaient dans la même ligne :

1. **`document.querySelector('dialog')` rend le PREMIER `<dialog>` du document.**
   La fiche d'un membre en monte quatre (mot de passe, édition, bannissement,
   conversation) et rien n'ordonne celui qu'on vient d'ouvrir en tête. Le témoin
   interrogeait un voisin — et lequel dépendait de l'ordre de peinture.
   *Un sélecteur non SCOPÉ dans une page qui monte plusieurs instances du même
   élément est un tirage au sort déguisé en assertion.*
2. **`showModal()` vit dans un effet.** L'interroger juste après le clic, sans
   attendre, mesure l'ORDONNANCEMENT de l'exécuteur. Rapide sur un poste, chargé
   sur un runner. Les constats voisins du même gate passaient tous par une boucle
   d'attente ; celui-là, seul, ne l'avait pas.

**La correction DURCIT, elle ne cède pas.** La condition passe de `.open` à
`.open && matches(':modal')` — `:modal` est vrai pour `showModal()` et **faux**
pour `<dialog open>`. Le témoin n'accepte plus un panneau simplement visible : il
exige celui qui piège le focus et répond à Échap, ce que la doctrine de `Sheet`
promet en toutes lettres.

C'est le point décisif. Ce constat était la **seule** garde de ce comportement :
`showModal()` ne piège rien sous happy-dom, donc aucun unitaire ne peut le rendre
— tous les rapports du chantier le portaient en « reste ouvert ». Le faire verdir
en l'affaiblissant aurait retiré la garde en laissant le libellé, c'est-à-dire
**fabriqué le pire état possible : un témoin vert qui ne garde plus rien.**

> Devant un témoin vert ici et rouge là-bas, la question n'est pas « comment le
> faire passer ? » mais **« qu'a-t-il mesuré d'autre que sa règle ? »** — et la
> réponse se cherche dans ce que l'assertion touche EN PLUS de son sujet :
> l'ordre du document, l'ordonnancement, l'horloge, la locale de la machine.
> Puis on resserre sur le sujet, et on en profite pour serrer la règle.

Mutation jouée : `dialog.showModal()` → `dialog.show()` dans `sheet.tsx` ⇒ gate
ROUGE, « 1 échec(s) sur 50 constats », sur ce constat exactement. Source
restaurée, gate vert, 50/50.
