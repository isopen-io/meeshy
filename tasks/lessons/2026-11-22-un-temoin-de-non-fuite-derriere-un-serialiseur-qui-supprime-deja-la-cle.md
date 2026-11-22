# Un témoin de non-fuite posé derrière un sérialiseur qui supprime déjà la clé atteste la discrétion du sérialiseur

**2026-11-22, cycle 210 de la routine temps réel, #20277.**

## Ce qui s'est passé

Le lot chargeait `anonymousSession.rights` pour que `GET /conversations/:id`
serve les droits RÉSOLUS d'un visiteur sans compte. Cet objet porte
`canViewHistory`, un fait de modération réservé aux hôtes (#4056). Deux retraits
ont donc été faits dans le code : l'ensemble servi n'énumère que les droits
d'ÉMISSION, et la ligne servie ne porte pas la source de la surcharge.

Les deux ont reçu un témoin **par la route** — `app.inject`, le vrai contrat de
fil — parce que c'est la forme que le dépôt exige d'un témoin de confidentialité
(« un témoin de confidentialité assert sur la VALEUR SERVIE », cycle 83).

Passé à la mutation « la fabrique laisse passer la source de la surcharge », ce
témoin est resté **VERT**. `conversationParticipantSchema` ne déclare ni
`anonymousSession` ni `canViewHistory` : fast-json-stringify les retire quoi que
la fabrique remette.

## La règle

**La règle « assert sur la valeur servie » garde une FUITE. Elle ne garde pas un
RETRAIT.**

- Pour une FUITE, le sérialiseur est en AVAL du défaut : si la clé sort, c'est
  qu'elle a traversé, et le témoin de route tombe.
- Pour un RETRAIT, le sérialiseur est une SECONDE garde, indépendante et
  invisible. Le témoin de route ne distingue plus « le code a retiré » de « le
  schéma a supprimé » — et c'est la seconde qui répond, parce qu'elle répond
  toujours.

Le seul niveau où un témoin de retrait peut tomber est celui de **l'objet, avant
sérialisation** : la loi, la fabrique, le helper. C'est là que la décision vit,
donc c'est là que son témoin doit vivre.

## Et le témoin de route se garde quand même

Il ne devient pas inutile : il garde que rien de tout cela n'atteint le fil
AUJOURD'HUI, et c'est le piège armé du cycle 84 posé à l'endroit — le jour où
quelqu'un déclare l'une de ces deux clés pour une raison parfaitement légitime,
c'est lui qui l'obligera à voir ce qu'il ouvre.

**Ce qui change, c'est son doc-comment** : il doit ÉCRIRE ce qu'il ne prouve pas,
et nommer le témoin qui, lui, tombe. Un témoin dont la limite n'est pas écrite se
lit comme une garde complète, et la prochaine personne ne cherchera pas la
seconde.

## Le test du test

Devant tout témoin de non-fuite, poser la mutation la plus bête : **faire
produire la clé par le code, et vérifier que le témoin ROUGIT.** S'il reste vert,
le témoin ne garde pas le code — il garde le schéma. Chercher alors le niveau où
la décision est prise.

## Famille

- Cycle 84 — « une non-fuite ACCIDENTELLE se garde par un témoin » : la même
  situation, vue du côté du piège. Cette leçon-ci dit où poser le témoin.
- Cycle 92 bis — « un schéma qui *marche* peut cacher une fuite au lieu de
  l'empêcher » : le même mécanisme, avec la conclusion opposée (ce qui ne fuit
  pas n'est pas gardé).
- « Toujours prouver le ROUGE » (`services/gateway/CLAUDE.md` § Tests) : c'est
  cette discipline, et elle seule, qui a rendu la faute visible — le témoin
  passait, le lot aurait été livré avec une garde décorative.
