# Un gate qui REJOUE une table ne garde que les sites qu'il INTERROGE — et le site qu'il oublie est celui qui n'a pas de jumeau déclaré

*2026-11-13, #18066 (cycle 155). Rouge bloquant de `dev` : TS2366 sur
`apps/web/src/lib/push/shell-push-runtime.ts`.*

## Ce qui s'est passé

#18052 a ajouté `{ route: 'community' }` à `NotificationTarget`. Le dépôt a un
gate écrit exactement pour ça — `scripts/check-push-target-parity.mjs` — dont le
doc-comment raconte le défaut historique (`firebase-messaging-sw.js` portait la
bonne règle en commentaire et servait trois routes sur trois qui n'existaient
pas) et conclut : « une règle en prose ne couvre que ce que son outil exprime.
Ce fichier est l'outil. »

Le gate est resté **vert**. Le lot a quand même laissé un site derrière :
`shellPushUrl`, le mappage route → adresse de la coque Capacitor.

## Pourquoi le gate ne pouvait pas le voir

Le gate est né d'un **jumeau déclaré** : `public/sw-push.js` est un script
classique qui ne peut pas importer `href`, donc sa table vit en double, donc un
outil interdit la dérive. Toute sa structure parle de ce couple — « le jumeau
contre la table de routes », « le jumeau contre le résolveur », « le jumeau
contre les adresses ».

`shellPushUrl` n'est le jumeau de personne. C'est un troisième mappage, écrit à
la main, dont rien ne déclare qu'il recopie quoi que ce soit — et c'est
précisément ce qui l'a tenu hors du champ de l'outil. **Un gate indexé sur une
RELATION (« A suit B ») ne balaie pas les sites qui n'ont pas de relation
déclarée, même quand ils servent la même loi.**

## Ce que `tsc` comble, et ce qu'il ne comble pas

Le trou était partiellement tenu par le compilateur, et c'est ce qui rend la
leçon fine. `tsc` attrape un membre d'union **sans `case`** : c'était le TS2366.
Il n'attrape pas un `case` qui rend la **mauvaise** adresse —
`href('communityMembers', …)` au lieu de `href('community', …)` compile, et mène
le doigt ailleurs. La protection apparente venait d'un outil qui ne garde qu'une
moitié de la loi, et l'autre moitié est justement la dérive que le gate existe
pour interdire.

> **Un type exhaustif garde la COMPLÉTUDE d'une bijection, jamais sa
> JUSTESSE.** Là où une union énumère des destinations, `tsc` dit « tu as
> répondu à tous les cas » ; il ne dit pas « tu as répondu juste ».

## Le coût réel, et pourquoi il n'a pas l'air d'un bug

`shellPushUrl` est consommé en `env.navigate(env.urlOf(...))`. Un `switch` non
exhaustif **rend `undefined`** — il ne lève pas. Le tap est consommé, la
bannière disparaît, et rien ne s'ouvre. Pas de crash, pas de trace : la loi 4 à
l'envers, sans symptôme à rapporter.

## La règle à appliquer

1. Devant un gate de parité vert, demander **« combien de sites servent cette
   loi ? »**, pas « les deux jumeaux sont-ils d'accord ? ». La réponse se compte
   en cherchant les CONSOMMATEURS de la donnée (ici : qui construit une adresse
   à partir d'un `route`), jamais en lisant la liste des sites que le gate
   nomme — par construction, il ne nomme que ceux qu'il connaît.
2. Un site de plus se branche sur **la table existante**, jamais sur une copie
   de ses attentes. `ADRESSES` est exportée ; le témoin de la coque la rejoue.
   Une famille ajoutée au critère de fin interroge désormais les trois sites.
3. Quand un compilateur garde déjà une moitié de la loi, **écrire le témoin de
   l'autre moitié** et le voir rougir sur elle. Ici : non pas « sans le `case` »
   (que `tsc` dit déjà), mais « avec un `case` qui ment » — la dérive dont le
   gate protège les deux autres sites, et qui n'était gardée sur aucun.

## Parenté

Même famille que la leçon 261 (« une énumération de sites porte DEUX
affirmations : ces sites appliquent la règle, et ce sont les sites où elle
s'applique — la seconde n'est presque jamais vérifiée ») et que les quatre
familles du Prisme, dont la quatrième était côté SERVEUR : ce qui tient un site
hors d'une énumération est le niveau d'abstraction de celui qui l'écrit, pas sa
distance au code.
