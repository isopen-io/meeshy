## Leçon 318 — `deletedAt: null` n'atteint pas les lignes où le champ est ABSENT

**Contexte.** #4160 ferme deux routes d'annuaire inversé et leur applique la loi
de leur jumelle authentifiée : compte actif, non supprimé, blocage dans les deux
sens. Gates verts — gateway 916 suites, web 801, SDK 4030. Déployé. Et en
intégration, chercher **mon propre compte, authentifié**, rendait **404**.

**La cause.** `contactLookupScope` posait `deletedAt: null`. Sur le connecteur
MongoDB, **Prisma enveloppe les filtres scalaires** : `{ deletedAt: null }` ne
matche QUE les documents où le champ est **présent-et-nul**. Les 222 comptes de
l'intégration ont `deletedAt` **absent** — la colonne a été ajoutée après leur
création et jamais remplie. La clause écartait donc **tout le monde**.

En Mongo *brut*, `{deletedAt: null}` matche présent-nul **et** absent — d'où la
mesure trompeuse : `countDocuments({deletedAt:null})` rendait bien 222. C'est
Prisma qui diffère, pas MongoDB.

**Ce qui rend la leçon coûteuse : le dépôt la documentait déjà.**
`packages/shared/CLAUDE.md` § « Absent vs `null` trap » décrit exactement ce
piège pour `firstMessageSentAt`, donne l'idiome correct
(`OR: [{ … null }, { … { isSet: false } }]`) et signale même que la **négation
ne le corrige pas**. Je l'ai reproduit en copiant la clause d'un site voisin.

> **Copier une clause d'un site voisin copie aussi ses défauts, et le fait
> silencieusement** : la ressemblance avec du code existant est le plus efficace
> des arguments d'autorité. La question à poser à toute clause reprise n'est pas
> « d'où vient-elle ? » mais **« que fait-elle sur les données RÉELLES ? »**.

**Et le voisin était déjà cassé.** `ContactDirectoryService.match()` — la
jumelle *bien faite*, citée en modèle par l'issue — portait le même
`deletedAt: null` depuis toujours. Elle ne rendait donc **jamais rien**. Personne
ne l'a vu : cette route est sans appelant, le chemin iOS qui l'utilisait est
mort. **Une route morte ne signale pas ses défauts, et sert quand même de
patron.**

**Deux parades, dans cet ordre.**

1. **La mesure sur données réelles**, qui seule attrape la classe. Aucun double
   Prisma ne reproduit la sémantique du connecteur : le témoin de handler passait
   au vert. C'est l'appel en intégration, sur un compte dont je connaissais
   l'existence, qui a rendu le 404.
2. **Un témoin de FORME** sur la clause remise — `deletedAt` absent du `where`,
   `isSet` présent dans le `AND`. Il ne prouve pas le comportement, il empêche la
   forme fautive de revenir.

**Détail de syntaxe qui compte.** L'idiome se pose en `AND: [{ OR: [...] }]`, pas
en `OR` à la racine : l'appelant pose souvent son propre `OR` (liste
d'identifiants), et deux `OR` frères dans le même objet s'écrasent en silence.

---
