## Leçon 622 — `isSet` n'existe que sur les champs OPTIONNELS ; un double qui honore MongoDB ne le sait pas

*(Numérotée 618 sur `main`, renumérotée 621 à la promotion `dev → main` du 2026-09-16, puis 622 à celle du 2026-09-17 : `dev` portait déjà une 618 dans sa série continue 617-618-619-620, puis a alloué 621 dans cette même série pendant que `main` occupait le numéro. La garde `lessons-numbering-single-key-guard` a nommé les deux collisions — « 618 : lignes 32693, 32747 », puis « 621 : lignes 32693, 32935 » — ce qu'aucune fusion n'aurait signalé toute seule : `tasks/lessons.md` s'auto-fusionne sans conflit. **Un identifiant qui ne s'alloue pas ne collisionne pas (#5102) : c'est la MÊME leçon qui se fait renuméroter à chaque promotion, parce que c'est elle qui vit hors de la série continue.**)*

#6811. Le correctif de #6452 (« un compte sans `blockedUserIds` doit rester
cherchable ») a remplacé `NOT: { blockedUserIds: { has } }` par
`OR: [{ blockedUserIds: { isSet: false } }, { NOT: { has } }]` — juste sur la
sémantique MongoDB (absent ≠ null), et rejeté EN ENTIER par le client Prisma
généré : `isSet` n'est exposé que pour les champs OPTIONNELS
(`StringNullableListFilter`, le filtre d'une liste scalaire REQUISE
`String[] @default([])`, ne le déclare pas). `PrismaClientValidationError`
AVANT tout aller-retour réseau ⇒ 500 sur toute recherche de personne, en
production, pendant toute la vie du correctif.

Le témoin de #6452 était vert : il rejouait le `where` contre un DOUBLE écrit à
la main (`mongo-where.ts`) qui implémente `isSet` sur un TABLEAU parce que
MongoDB, lui, le ferait vraiment. **Le double honorait la sémantique du moteur ;
il ne vérifiait à aucun moment que le CLIENT accepte la forme.** Et la
signature aidait à ne rien voir : `contactLookupScope` rendait
`Record<string, unknown>`, précisément pour échapper au typage Prisma — `tsc`
ne pouvait donc rien dire non plus.

> **Un double qui simule fidèlement le MOTEUR peut masquer un refus du CLIENT.**
> Les deux couches ont des règles distinctes (le client valide la FORME avant
> d'émettre, le moteur interprète le CONTENU une fois reçu), et un test qui ne
> rejoue que la seconde ne peut pas voir un défaut de la première — même s'il a
> été écrit spécifiquement pour un piège « absent vs null » déjà mesuré en
> production.

Le correctif change de FAMILLE, pas seulement de syntaxe : la direction
« qui m'a bloqué » quitte le filtre de tableau NIÉ pour une requête POSITIVE
déjà indexée (`getBlockRelatedUserIds`, `@@index([blockedUserIds])`),
résolue par l'appelant et passée en `id: { notIn }` — la même forme qui gère
déjà « les comptes que j'ai bloqués ». Une requête positive sur un champ absent
rend naturellement `false` (« ne contient rien »), sans jamais avoir besoin de
distinguer absence et négation ; c'est un filtre NIÉ qui a besoin de `isSet`
pour ne pas se tromper sur ce cas, jamais l'inverse. **Devant un `NOT: {
liste-scalaire: { has } }`, la question n'est pas « comment couvrir le cas
absent ? » mais « ce filtre a-t-il besoin d'être nié ? »** — la version
positive n'a pas le piège, et n'a pas besoin du témoin qui le couvre.

**Pour qu'un témoin puisse voir CETTE classe de défaut**, il doit confronter la
forme au client RÉEL, pas à un double — même un double « honnête » sur la
sémantique visée. `contact-lookup-scope-prisma-client.test.ts` importe le
client généré par un chemin RELATIF (`../../../../../../packages/shared/prisma/client`),
en CONTOURNANT volontairement le `moduleNameMapper` qui stubbe
`@meeshy/shared/prisma/client` pour le reste de la suite, et joue le `where`
contre un hôte MongoDB injoignable à délai de sélection court : la validation
de forme se fait AVANT la tentative réseau, donc `PrismaClientValidationError`
signe un refus de forme sans qu'aucune base ne soit nécessaire — et le test
« rougit sur le code d'hier » pour prouver qu'il peut vraiment tomber.

Prolonge la note du dépôt (`services/gateway/CLAUDE.md` § « Tests — un témoin
qui ne peut pas tomber n'est pas un témoin ») sur les doubles qui
réimplémentent le corps d'une méthode : ici ce n'est pas la méthode qui était
recopiée, c'est le MOTEUR — même défaut, une couche plus bas.
