## Leçon 510 — Le repli d'une LECTURE n'est pas la valeur d'une ÉCRITURE

**Le fait.** `/composer` (#4966) doit revendiquer, à la publication, la langue dans laquelle le
texte est écrit — `CreatePostSchema.originalLanguage`. La première écriture la prenait au site
évident, celui que tout le reste de la v3 emploie :

```ts
const langueRevendiquee = (lecteur) => languesDuLecteur(lecteur ?? {})[0] ?? null;
```

`languesDuLecteur` est le site UNIQUE qui ordonne le Prisme, et c'est le bon site — pour LIRE. Il
ne rend jamais une liste vide : `ordonnees.length === 0 ? [REPLI_DE_LANGUE] : ordonnees`
(`lib/api/fil.ts`), parce qu'un lecteur doit toujours avoir une langue dans laquelle lire. Le
`?? null` était donc mort, et un compte n'ayant configuré aucune langue aurait publié **tout son
contenu étiqueté français**.

Ce n'est pas un défaut d'affichage. `originalLanguage` est le PIVOT de la descente du Prisme chez
tous les LECTEURS : une personne écrivant en yoruba sans langue configurée aurait vu chacun de ses
lecteurs traduire depuis un français qu'elle n'a jamais écrit — et **l'erreur ne se voit jamais
chez l'auteur**, qui lit son propre texte.

> **Un repli existe pour une QUESTION, et il ne voyage pas avec la donnée.** « Dans quelle langue
> servir ce texte à cette personne ? » n'a pas le droit de rendre « rien » — d'où le repli. « Dans
> quelle langue cette personne écrit-elle ? » a parfaitement le droit de rendre « on ne sait pas »,
> et l'ABSENCE est alors la bonne réponse : la passerelle détecte depuis le texte, ce qu'elle fait
> mieux qu'une valeur inventée. Réutiliser le résolveur de la première question pour la seconde
> importe son repli avec lui.

**Comment le trouver.** Le témoin qui l'a attrapé n'interrogeait pas la langue : il posait un
lecteur SANS langue configurée et regardait le corps envoyé. La question à poser à tout appel d'un
résolveur partagé est donc : **ce résolveur a-t-il un repli, et mon appelant a-t-il le droit de
recevoir ce repli ?** Un `?? null` derrière un appel qui ne rend jamais `null` est le signe visible
du malentendu — il compile, il se lit bien, et il ne s'exécute jamais.

**La forme générale.** C'est la jumelle de la leçon 261 (« une énumération de sites dit *ces sites
appliquent la règle*, presque jamais *ce sont les sites où elle s'applique* ») déplacée du SITE vers
la VALEUR : un site unique répond à UNE question, et l'employer pour une autre en hérite les
défauts par lesquels il répond à la sienne.

Sites : `apps/web-v3/app/connecte/composer-porte.ts` (`langueRevendiquee`, qui lit désormais
`Lecteur.systemLanguage` — ce que le lecteur a DÉCLARÉ), `apps/web-v3/__tests__/composer.test.ts`
§ « se tait sur la langue quand le lecteur n'en déclare aucune » et « ne revendique aucune langue ».
Issue #4966.
