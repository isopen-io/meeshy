# Itération 288 — le plafond du lot d'impressions a UNE source de vérité : schéma et garde cessent de diverger

Priorité 1 (features récemment développées) : la campagne Android « dwell-aware
view beside its impression » (#4593→#4607) alimente les analytiques de vue/impression.
En relisant le SERVEUR de ce pipeline (`routes/posts/impressions.ts`), le plafond
du lot batch portait **deux valeurs contradictoires** — une jumelle divergente,
exactement le motif que ce dépôt combat (« Cette entité a-t-elle une JUMELLE ? »,
« UNE source de vérité par règle »).

## État actuel (avant ce lot)

```ts
const IMPRESSION_BATCH_CAP = 50;                                   // garde interne
// …
postIds: { type: 'array', items: { type: 'string' }, maxItems: 100 },  // schéma
// …
const requested = (postIds as string[]).slice(0, IMPRESSION_BATCH_CAP); // tronque à 50
```

`POST /posts/impressions/batch` déclare dans son schéma `maxItems: 100` (avec un
commentaire justifiant 100 par le précédent `user-deletions.ts`), puis tronque
**silencieusement** la liste à 50 via `.slice(0, IMPRESSION_BATCH_CAP)`.

## Problème identifié

Un lot de **51 à 100 ids valides** — que le schéma ACCEPTE — est enregistré
seulement pour ses 50 premiers ; les 51..100 disparaissent sans aucun signal.
Le champ `recorded` de la réponse (« ce qui a RÉELLEMENT été écrit », dit son
propre commentaire) plafonne à 50, et l'appelant croit avoir remonté 100
impressions quand la moitié n'a jamais atteint la base. Ni erreur, ni
avertissement, ni 400 : une troncature muette au milieu de la plage que le
contrat déclare valide.

Deux sources INDÉPENDANTES documentent le plafond comme **100**, contredisant
la garde de 50 :

1. Le schéma lui-même : `maxItems: 100`, commentaire « 100 suit le précédent de
   `user-deletions.ts` ».
2. Le cliquet `src/__tests__/security/unbounded-findmany-guard.test.ts` :
   « `/posts/impressions/batch` plafonne a 100. Une borne transitive reste
   une… ». C'est la borne dont ce cliquet dépend pour tenir le `findMany`
   d'audience pour BORNÉ.

La garde de 50 est donc la valeur DIVERGENTE, introduite à part et jamais
réconciliée avec le contrat déclaré.

## Cause racine

Deux littéraux séparés (`50` dans la constante, `100` dans le schéma) portant la
MÊME borne, sans lien entre eux : rien ne les empêchait de diverger, et ils ont
divergé. Aucun témoin ne gardait l'égalité ; deux témoins CODIFIAIENT même la
troncature à 50 comme comportement attendu (`interactions.test.ts`,
`interactions-extended.test.ts`), gelant le défaut en vert.

## Impact métier

Perte silencieuse d'impressions au-delà de 50 par salve : les analytiques de vue
que l'auteur consulte et le classement du feed (qui pèse sur `impressionCount`)
sous-comptent tout lot dense. Dimensions 11 (Maintenabilité — une source de
vérité par règle) et 13 (Complétude — « partiel » silencieux) du `CLAUDE.md`.

## Impact technique

Surface minimale : une constante (valeur alignée sur le contrat), un littéral de
schéma remplacé par la constante. Aucune requête, aucune frontière réseau, aucun
autre appelant touché. La garde de troncature devient purement défensive : le
schéma refusant déjà au-delà de la borne, `.slice` ne tronque plus rien
d'admis.

## Évaluation du risque

Très faible, et purement ADDITIF pour les clients :
- Un lot de 1..50 : inchangé.
- Un lot de 51..100 : désormais enregistré EN ENTIER (avant : tronqué à 50) —
  aucun client ne perd de fonctionnalité, il en gagne.
- Un lot de 101+ : désormais REFUSÉ en 400 (avant : tronqué en silence à 50) —
  l'appelant apprend explicitement que son lot est trop grand plutôt que d'en
  perdre la moitié. Un écran de fil « n'observe jamais plus de quelques dizaines
  de posts par salve » (commentaire du schéma), donc aucun client réel n'atteint
  cette borne.

## Améliorations proposées (implémentées)

- `IMPRESSION_BATCH_CAP` passe à **100** — la valeur que le schéma ET le cliquet
  `unbounded-findmany-guard` documentent déjà — et devient la source UNIQUE :
  le `maxItems` du schéma la RÉFÉRENCE (`maxItems: IMPRESSION_BATCH_CAP`) au lieu
  d'un littéral `100`. Divergence future impossible.
- Trois témoins alignés / ajoutés :
  - `interactions-consumption-audience.test.ts` : NOUVEAU — un lot de 60 ids
    admis est enregistré en entier (RED contre le cap de 50, GREEN à 100).
  - `interactions-extended.test.ts` : le témoin « caps at 50 occurrences »
    devient « records every occurrence up to the schema cap (100) » (100
    occurrences d'un id admis ⇒ 100 lignes).
  - `interactions.test.ts` : le témoin « caps at 50 entries » devient deux
    témoins — 100 ids admis ⇒ 200/`recorded:100`, et 101 ids ⇒ **400** sans
    écriture (le schéma refuse au lieu de tronquer).

## Critères de validation

- RED prouvé : constante remise à 50 ⇒ le nouveau témoin des 60 ids échoue
  (`recorded: 60` attendu, 50 obtenu) ; remise à 100 ⇒ GREEN.
- GREEN : 739/739 sur `src/__tests__/unit/routes/posts/`, 141/141 sur
  `src/__tests__/security/` + budget de taille de fichier.
- `unbounded-findmany-guard` (dont le commentaire dit « plafonne a 100 ») reste
  vert — la borne réelle égale enfin la borne documentée.
- `tsc --noEmit` du gateway : EXIT=0.
