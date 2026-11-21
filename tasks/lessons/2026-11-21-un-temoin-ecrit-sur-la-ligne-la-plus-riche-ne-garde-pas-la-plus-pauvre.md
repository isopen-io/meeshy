## Un témoin écrit sur la ligne la plus RICHE ne garde pas la plus pauvre (2026-11-21, #20163)

Trois leçons d'un même lot, rendues par son audit adversarial. Elles n'ont rien en commun de thématique, et tout en commun de FORME : à chaque fois, ce qui était vérifié n'était pas ce qui comptait.

### 1. La garantie qui compte le plus était celle que personne ne testait

Le lot servait les lignes de l'export RGPD par `revealAtRestRowsForWire`, la variante qui RETIRE le chiffré — nécessaire parce que le schéma de cette section est ouvert. Huit témoins, dont un nommé « ne met ni le chiffré ni ses métadonnées dans l'archive ». Il assertait sur une ligne **scellée**.

Or sur une ligne scellée, `servedClearAtRest` met DÉJÀ `encryptedContent: null` et `encryptionMetadata: null`. Le témoin ne pouvait donc pas voir disparaître le délestage. L'audit l'a mesuré : rendre le délestage conditionnel au régime au repos laissait **les huit témoins verts** en publiant l'enveloppe libsignal d'une ligne `e2ee` — `registrationId` / `deviceId` / `type`, l'identité d'APPAREIL du client.

> **La famille à exercer n'est pas la plus représentative, c'est celle que la couche d'en dessous ne touche pas.** `revealAtRest` rend INTACTES exactement deux familles : `e2ee`, et une ligne scellée sans `conversationId` — les deux seules qui ont besoin du délestage, les deux seules absentes des fixtures. Devant un témoin de protection, demander : *sur quelle ligne cette protection est-elle la SEULE à agir ?* S'il n'y en a pas dans les fixtures, le témoin atteste le travail d'un autre.

C'est la famille « un témoin qui ne peut pas tomber n'est pas un témoin », avec le raffinement qui la rend difficile : celui-ci tombait bien — sur deux mutations sur trois.

### 2. Une vérification de CODE n'est pas une vérification de DONNÉES

J'ai écrit que `deletedAt: null` était juste sur `Message` (contrairement à `Post`, #19909) parce que `LIVE_MESSAGE_MARK` est répandu par tous ses créateurs, et j'ai signé « vérifié avant d'être supposé ». J'avais ouvert les six créateurs : tous le répandent. C'était vrai.

Ce que je n'avais pas ouvert, c'est l'HISTOIRE. `liveMessage.ts` dit lui-même que deux de ces créateurs — les messages d'appel de `CallService` — l'avaient PERDU ; `git log -S` date leur réparation de **trois jours** avant mon lot ; et aucune migration ne rattrape la colonne. Les lignes écrites avant ont la clé absente, et l'égalité nue les omet en silence.

> **« Tous les créateurs écrivent le marqueur » est une propriété du code d'AUJOURD'HUI, et ne dit rien des lignes écrites avant qu'ils ne le fassent.** Devant une discipline d'écriture, la question n'est pas « est-elle tenue ? » mais **« depuis quand, et qui a rattrapé l'avant ? »** — `git log -S` sur la constante, et la recherche d'une migration. Et la mention « vérifié » engage : elle doit nommer CE qui a été vérifié.

Corollaire : la forme qui apparie les deux états (`unsetOrNull`) se choisit **parce que** la population n'est pas mesurable depuis une session sans base — pas parce qu'on sait qu'elle existe.

### 3. Un cache vérifié SYNCHRONEMENT puis `await` n'absorbe rien sous `Promise.all`

`ServerKeyVault.loadKey` lit `keyCache` puis `await` la base. Sous un `Promise.all` de N lignes, les N appels franchissent la vérification avant que le premier ne résolve : le cache n'absorbe **aucun** des N, quel que soit sa taille et le nombre de clés distinctes. Mesuré sur 10 000 lignes scellées sous UNE clé : 10 000 lectures **et** 10 000 écritures de `lastAccessedAt` sur le MÊME document.

> **Un cache de lecture ne protège que les appels SÉRIALISÉS.** Pour protéger une rafale, il faut mémoïser la PROMESSE, pas la valeur — et l'oublier à la résolution, pour ne garder ni verdict périmé ni échec. Le signe à chercher : un `Promise.all` dont le corps appelle une fonction qui met son cache à jour APRÈS un `await`.
>
> Et le réflexe à ne pas avoir : borner la concurrence de l'appelant. Cela traite le symptôme chez UN appelant quand la cause est chez le collaborateur — ici quatorze autres lecteurs avaient le même trou.

### Et une erreur de méthode, qui a coûté deux rouges

J'ai poussé avant que la suite complète ait fini, deux fois. Elle a ensuite rendu deux rouges que les gates ciblés ne pouvaient pas voir : deux inventaires de surfaces clés par CHEMIN (périmés par un déménagement de fonction), puis un budget de taille de suite dont le fichier vivait à **une ligne** de son plafond. Les deux étaient de moi, et les deux étaient évitables en attendant vingt minutes — c'est la directive #18654 § 2, qui demande de rejouer sur l'arbre fusionné.

> **Une suite d'inventaire qui vit à une ligne de son plafond n'est pas l'endroit où raconter un lot.** Le récit va dans le fichier de décision ; l'entrée d'inventaire garde la forme de celle qu'elle remplace, au nombre de lignes près.

Preuve : commentaire d'audit sur la PR #20165, `services/gateway/decisions/2026-11-21-l-export-rgpd-ouvre-le-sceau-au-repos-de-ses-messages-20163.md`, témoins `export-rgpd-messages-sceles-au-repos.test.ts` et `serverKeyVaultInFlightDedupe.test.ts`.
