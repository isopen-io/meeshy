## Cycle 197 bis — deux sessions sur la même issue, et ce que l'audit de la mienne a rendu (#20143)

**Date** : 2026-11-21. **Base** : `dev` à `809011728`. **Issue** : #20143, suite
de #20129 (fermée par #20131) et de #20113.

### La collision, d'abord, parce qu'elle explique la forme de ce lot

Deux sessions de la même routine ont pris #20129 en parallèle. L'autre a fusionné
la première (#20131, dans `dev` à `809011728`) ; la mienne a découvert la
collision au moment où GitHub a signalé le conflit — **six fichiers**, dont les
cinq sites du correctif.

La directive #18654 tranche sans ambiguïté : *la correction déjà sur `dev` se
garde, et le lot s'y adapte.* Appliqué à la lettre, y compris là où ma version
me semblait meilleure :

| site | verdict |
|---|---|
| le `where` du filtre (`{ in: [userId, …] }` en ligne vs une loi partagée) | **dev gardé.** Mon helper ne gagnait rien de mesurable, et le poser re-litigeait une décision fusionnée |
| le cliquet `uploaded-by-key-space-sweep` (verdict `account` vs `account-and-legacy`) | **dev gardé.** Ma taxonomie plus fine n'ajoutait aucune mesure |
| le journal de cycle | **dev gardé**, le mien renommé (ce fichier) |
| la lecture des sièges (plafonnée vs paginée) | **la mienne**, et c'est l'objet de #20143 — voir ci-dessous |

> **La règle « celui qui n'a rien écrit cède » suppose qu'un des deux n'a rien
> écrit.** Quand les deux ont écrit et qu'un des deux a fusionné, la question
> n'est plus qui cède : c'est **qu'est-ce qui, dans mon lot, est une CORRECTION
> de ce qui est fusionné, et qu'est-ce qui n'est qu'une autre façon de l'écrire.**
> La seconde catégorie se jette, sans négociation et sans regret — elle ne coûte
> que ce qu'on a déjà payé.

### Ce que l'audit de ma version a rendu, et qui vaut contre la version FUSIONNÉE

L'audit adversarial, lancé avant fusion parce que le lot touche une purge de
données et un export RGPD, a rendu mon lot **bloquant** sur sept constats. Deux
d'entre eux décrivent **mot pour mot la version fusionnée** :

1. **« La prochaine passe reprendra le reste » est FAUX.** Écrit dans le
   doc-comment de `ownerKeysOf` sur `dev`, et je l'avais écrit à trois endroits
   dans la mienne. `MaintenanceService` dit l'inverse à l'endroit qui décide :
   `processAccountDeletionRequests` n'élit que les demandes `CONFIRMED`, et
   celle-ci ne l'est plus. Le seul rejeu manuel n'appelle pas ce balayage.
   Conséquence mesurée : une lecture de sièges qui lève laisse les octets des
   pièces transférées en base **pour toujours**, sous un `log.info` disant
   « purgé ».
2. **`take: 10_000` « ne tronque rien de réaliste » TRONQUE.** Un `take` seul
   jette au-delà de son plafond, sans compteur et sans trace — ce que la décision
   de #20131 reproche elle-même à l'alternative qu'elle écarte.

Et trois qui valent de ma version seule, mais dont la leçon est générale :

3. **la pagination n'avait AUCUN témoin**, et la pire mutation possible —
   retirer `skip += rows.length`, ce qui fait boucler la passe HORAIRE
   indéfiniment — laissait **58 témoins verts** ;
4. le premier témoin écrit pour l'attraper **PENDAIT** au lieu de rougir, ce qui
   en CI ne se distingue pas d'un environnement cassé. D'où le vrai correctif,
   de PRODUCTION : une borne de VIVACITÉ (500 pages) ;
5. un témoin **JUMEAU** existait sur le site jumeau, sous un intitulé qui
   nommait la propriété même que le lot changeait des deux côtés, et le lot ne
   l'avait pas cherché.

### Le livrable

1. **`services/participants/accountParticipantIds.ts`** — producteur UNIQUE des
   sièges d'un compte. `accountSeatIds` (liste entière, pour la route qui la
   partage) et `accountSeatIdBatches` (paginé, avec `complete`, pour le balayage
   de fond). Trois sites portaient trois `where` ; la section `calls` de l'export
   en faisait une QUATRIÈME lecture dans la même requête.
2. **La purge** pagine, rend `complete`, journalise en `error` un balayage
   incomplet, et tient `failedIds` pour la passe entière.
3. **`SECTIONS_NEEDING_PARTICIPANT_IDS`** — la liste des sections qui dépendent
   de cette lecture vit avec les sections, et `calls` l'a rejointe.
4. Un **cliquet de source** contre un second producteur, dont le discriminant est
   le `select` : une lecture qui ne demande que `id` ne peut répondre qu'à une
   question ; `contacts`, qui demande la conversation et ses co-participants, en
   pose une autre et sort par CONSTRUCTION.

### Le ROUGE, prouvé par mutation contre la version FUSIONNÉE

| mutation | témoins rouges |
|---|---|
| la lecture des sièges redevient PLAFONNÉE (la forme de `dev`) | 3 |
| une lecture en échec se dit COMPLÈTE | 3 |
| `skip` n'avance plus (boucle infinie en production) | 3, en 24 ms — plus aucune ne PEND |
| le `where` du producteur reprend `type: 'user'` | 2 |
| un consommateur relit les sièges chez lui | le cliquet de source |

### Ce qui RESTE, en issues

- **#20139** — personne ne LIT le `complete` que ce lot rend ; une étape de
  suppression qui échoue n'est reprise par personne. #10021 en est le fond.
- **#20140** — l'export des médias sert les pièces de messages SUPPRIMÉS ou
  EXPIRÉS, là où la section `messages` filtre : une décision à trancher.
- **#20138** — l'archive ne marque ni la provenance ni le chiffrement.
- **#20114** garde sa valeur d'hygiène de données, sans être le chemin critique
  d'une conformité.
