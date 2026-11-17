# Cycle 175 — la chaîne horloge/position est fermée, et le dernier maillon n'était atteignable que depuis un état précis

*2026-11-17. Branche `claude/exciting-planck-8rzxd0`, dans la continuité directe
du cycle 174 (même session).*

**Livré** : #19261 — la fenêtre du gel de livraison s'ancre sur la POSITION du
curseur, jamais sur son horloge murale.

---

## La chaîne, enfin complète

Trois lots, trois endroits où une horloge se comparait à une position :

| lot | ce qu'il a retiré |
|---|---|
| #18701 | ce que la livraison **SERT** — `resolveCursorDeliveredAt`, borné au message ET à la bascule |
| #18731 | ce que le **CURSEUR** écrit — le préfixe contigu des entrées figées |
| **#19261** | la borne basse de la **PLAGE DU GEL** |

Les trois suites qui les gardent sont vertes ensemble à la tête de `dev`
(`9200a893d6`) : **22 témoins**.

## Le défaut, et sa précondition

```ts
freezeMessageStatus({ since: prevDeliveredAt, … })   // lastDeliveredAt = `now`
```

En mode FENÊTRE pur l'invariant TIENT : la borne haute d'un ack est `at`, qui
devient la borne basse du suivant. Il se rompt là où un ack avance l'horloge
**sans avoir figé toute la fenêtre qu'elle recouvre** — le seul chemin de
périmètre EXACT. Après un préfixe PARTIEL (#18731 : cible M1, trou M2), le
curseur porte `{ position: 10:00, lastDeliveredAt: 11:00 }` et la plage suivante
partait de 11:00, sautant M2 (10:05) que plus rien ne gravait.

Impact BORNÉ, et le dire fait partie du lot : `readAt` est le dernier repli de
`resolveReceivedAt`, et le gel de LECTURE part d'un curseur distinct — un M2 lu
récupérait son `receivedAt`. L'écart ne vivait que dans l'état « remis, pas
encore lu », soit précisément celui que la coche ✓✓ de l'expéditeur affiche.

Les DEUX sites de plage sont repris ensemble (mode fenêtre, cascade
« lu ⇒ remis ») ; le troisième, le périmètre exact, est sans objet — la liste
nommée y est la borne. Coût : zéro lecture de plus, `prevDeliveredPosition`
existant déjà depuis #18731.

---

## Ce que ce cycle a appris

### Une précondition de défaut s'écrit AVANT le témoin, pas après

Le commentaire d'allocation de l'issue porte la phrase qui a cadré tout le lot :
« un témoin posé sur un curseur dont la position et l'horloge CONCORDENT ne peut
pas tomber ». Elle a été écrite avant la première ligne de test, et chaque témoin
construit la divergence explicitement.

C'est la leçon du cycle 174 (« une mutation verte accuse le témoin ») déplacée
d'un cran en amont : au lieu de découvrir par mutation qu'un témoin ne pouvait
pas tomber, on se demande **ce qui doit être vrai de l'état pour que le défaut
existe**, et on le construit. La mutation reste le contrôle, elle cesse d'être
la découverte.

### L'horloge RETIRÉE vaut mieux que l'horloge interdite

`tsc` a signalé `prevDeliveredAt` devenu mort dans la portée de la cascade
(TS6133). Le retirer plutôt que le garder change la nature de la garantie : le
mauvais ancrage n'est plus seulement *interdit par un témoin*, il n'est plus
**disponible**. Un lot suivant ne peut pas l'écrire par inadvertance — il ne
compilerait pas.

> C'est la même famille que le type marqué `CursorDeliveredAt` de #18701 (« le
> curseur brut ne compile plus ») : quand on peut rendre une erreur
> inexprimable, c'est strictement mieux que de la rendre détectable.

Corollaire mesuré : la mutation « la cascade repasse sur l'horloge » cesse d'être
exprimable après ce retrait. On la perd comme mutation **parce qu'on l'a gagnée
comme impossibilité** — et il faut le noter, sans quoi un relevé de mutations
futur conclura à un trou de couverture.

### Un doc-comment peut nommer une méthode qui n'a jamais existé

Mon témoin de la cascade appelait `markConversationAsRead`. Échec : *« is not a
function »*. Le nom venait d'un doc-comment de `read-exactness.ts` — et
`grep -rn markConversationAsRead` sur tout le dépôt ne rend que cette citation
et mon témoin. **Aucune méthode n'a jamais porté ce nom.**

Famille connue (un commentaire qui ÉNONCE est une affirmation), avec une variante
utile : ici l'affirmation portait un IDENTIFIANT, donc elle était vérifiable par
une seule commande, et personne ne l'avait lancée. Corrigé sur place, en disant
ce qu'il disait avant.

Et le détour n'a été évité que parce que le message d'échec a été LU : un témoin
rouge « pour la bonne raison » et un témoin rouge « parce qu'il appelle du vide »
se ressemblent dans un compte de suites.

---

## Preuve

- `MessageReadStatusService.freezeWindowAnchor.test.ts` : **6 témoins verts**,
  3 prouvés ROUGES avant implémentation, **3 mutations rouges** après (fenêtre
  réancrée sur l'horloge, cascade réancrée sur l'horloge, repli hérité retiré) ;
- suite gateway **ENTIÈRE** : **2 801 suites vertes / 2 807**, **42 832 témoins
  verts** / 42 850 ;
- `tsc --noEmit` **EXIT=0** (code de sortie, jamais à travers un pipe) ;
- les 6 suites rouges sont la famille codec du conteneur (`heif`, `avif`,
  `ExifStrip` — `sharp` sans codecs), préexistantes, vérifiées par `git stash`.

**Chaque mutation est ancrée sur le NOM de l'unité visée et échoue bruyamment si
elle ne trouve pas sa cible** (`assert old in tail`) : au cycle 174, trois
mutations avaient muté la jumelle trente lignes plus haut et rendu un faux vert.

## Suivis

- **#19286 reste ouvert** : la garde des négations ne voit que la forme bloc
  `NOT:`, jamais la forme champ `{ champ: { not: … } }`. Trouvé au cycle 174 en
  vérifiant pourquoi mon propre `deliveredAt: { not: null }` n'était pas relevé.
  L'élargir allumera vraisemblablement beaucoup de sites : c'est un lot à soi, et
  son relevé se MESURE avant d'être gelé (cycle 107 : un balayage faux gelé mente
  plus longtemps qu'un journal).
- **#18760 n'est pas refermé** : les runs `ci.yml` de `dev` concluent
  `cancelled`, si bien que `dev` n'a pas de verdict à sa tête. Deux rouges y ont
  vécu invisibles jusqu'au cycle 174 bis (#19285). C'est le défaut
  d'INFRASTRUCTURE qui a le plus coûté à cette session, et aucun des trois lots
  ne l'adresse.
- **La valeur 500 du plafond de la file** et sa politique d'éviction ne sont
  toujours pas touchées (#18733 en a posé la trace ; la mesure manque).
