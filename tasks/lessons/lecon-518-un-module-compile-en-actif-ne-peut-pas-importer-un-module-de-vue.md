## Leçon 518 — Un module compilé en ACTIF ne peut pas importer un module de VUE : mesuré, +54 % sur ce que le lecteur télécharge

Revue de #5030 (v3 web). Le fil peint ses bulles en direct (`lib/realtime/fil-peinture.ts`, compilé
en `participate.js` par `scripts/build-participate.mjs`) et le serveur les rend (`app/connecte/`).
Les deux doivent composer LA MÊME adresse de profil — c'est exactement ce qu'un site unique existe
pour garantir. J'ai donc importé, depuis le peintre, la fonction qui la compose :

```ts
import { adresseDuProfil } from '@/app/connecte/profil-vue';
```

Trente caractères de composition de chaîne. Mesuré, `participate.js` est passé de **26 719 à
41 107 o gzip (+14 388, +54 %)** — le graphe entier de `profil-vue.ts` descendait chez le lecteur,
`getLanguageInfo` de `@meeshy/shared` compris, sur l'actif que la 3G rurale télécharge.

**La règle n'est pas « ne pas partager » — c'est l'inverse du site unique.** C'est : *ce que les
deux rendus partagent vit sous `lib/`, jamais sous `app/`.* La règle a rejoint
`lib/api/adresses-du-fil.ts`, où vivent déjà les autres adresses du fil ; `profil-vue.ts` la
RÉ-EXPORTE, donc aucun appelant ne change, le site reste unique, et le module retombe à 26 722 o
(+3 o, le prix réel).

### Le témoin qui l'attrape n'est pas un ratchet d'octets

Un ratchet dirait QU'un module a grossi, jamais POURQUOI — et il n'en existait aucun pour ces neuf
actifs. Le témoin est sur l'IMPORT : aucun fichier de `lib/realtime/` ne contient `from '@/app/`
(`__tests__/fil-source-unique.test.ts`). Il rougit AVANT la mesure, il nomme la cause, et il ne
demande à personne de relire un chiffre.

### Deux corollaires du même lot, de la même famille

- **Un commentaire dans une feuille INLINE est expédié.** `compacte()` retire les retours à la
  ligne, pas les commentaires : sept lignes de prose CSS coûtaient **303 o gzip par document**,
  dix-sept fois les deux règles qu'elles expliquaient. La raison d'une règle va dans le
  doc-comment du MODULE (qui ne part pas), la règle seule dans la feuille.
- **Le nom le plus COURT devient la cible la plus PETITE le jour où il devient un lien.**
  « Vous » — quatre lettres — mesure 40 × 44 px : sous la règle des 44 px, quand « Marta Ruiz » ne
  l'a jamais été. Un `min-height` ne suffit pas à faire une cible ; c'est la LARGEUR qui tombe, et
  seule une mesure au navigateur le dit.

### La forme générale

Les trois défauts sont **le coût invisible d'un geste juste**. Partager une règle, expliquer une
règle, rendre un nom cliquable : rien à redire sur l'intention, et chacun se paie ailleurs que là
où on l'écrit — dans un bundle, dans chaque document, dans un pixel de largeur. La question à se
poser n'est pas « est-ce correct ? » mais **« qu'est-ce que ce geste fait DESCENDRE, et où ? »** —
et elle ne se répond qu'en mesurant.
