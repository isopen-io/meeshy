## Leçon 503 — Ajouter un paramètre optionnel à une fonction que le FRAMEWORK appelle change ce qu'elle reçoit

(Jumelle de la **502**, qui couvre le réflexe d'AMONT — tirer `dev` avant de bâtir. Celle-ci couvre
la signature elle-même : les deux se complètent, et le même défaut les a produites.)

**Le fait.** `/chats` (web v3) exportait sa porte directement :
`export const GET = LISTE_DES_CHATS`. C'était juste, et ça l'est resté jusqu'au jour où la porte a
gagné un **second paramètre optionnel** — un récupérateur, pour que les témoins puissent lui opposer
un serveur de bouchon. Next appelle un gestionnaire de route avec **deux** arguments,
`(requête, { params })` : l'objet du framework est arrivé à la place du récupérateur, et
`(recuperant ?? recuperer)(…)` a tenté d'**appeler** `{ params }`.

    TypeError: (c ?? (intermediate value)) is not a function
        at <unknown> (.next/server/app/chats/route.js:1:2367)

L'écran le plus visité de la zone connectée rendait **500**, en production, et le lot était déjà
fusionné.

**Ce qui rend le défaut invisible aux trois filets habituels :**

1. **jsdom appelle avec UN argument.** Les 1962 témoins de la suite restaient verts — ils
   appellent `PORTE(requete, stub)`, jamais `PORTE(requete, {params})`.
2. **TypeScript accepte.** Les paramètres de fonction sont **bivariants** en TS : une fonction à
   deux paramètres est assignable là où le framework en déclare deux d'autres types. `tsc` était
   propre.
3. **Le build réussit.** L'erreur naît à l'EXÉCUTION, dans le chunk assemblé — pas à la
   compilation.

> **Un point d'entrée appelé par un framework n'a pas la signature que vous lui donnez : il a celle
> que le framework lui passe.** Y ajouter un paramètre optionnel — pour un test, pour une horloge,
> pour une injection — ne l'ajoute pas à la FIN d'une liste vide : ça le met en face de ce que
> l'appelant transmet déjà et que vous ignoriez. La question à poser avant d'élargir une signature
> n'est pas « qui appelle ça ? » mais **« avec quoi, exactement, l'appelant l'appelle-t-il ? »**.

**La forme qui protège.** Un fichier de route n'exporte jamais un identifiant nu ; il exporte une
**lambda**, qui ne transmet que ce qu'elle nomme :

    export const GET = (requete: Request): Promise<Response> => PORTE(requete);

Toutes les autres routes de la v3 avaient déjà cette forme — par habitude, pas par règle. C'est ce
qui a limité le défaut à une seule route.

**Le garde, et pourquoi c'est le COMPORTEMENTAL qui a été retenu.** J'avais écrit un garde de
FORME — interdire l'export nu sur les 31 routes. Le porteur en avait écrit un autre,
`apps/web-v3/__tests__/routes-signature-app-router.test.ts`, qui APPELLE chaque `GET`/`POST` comme
App Router le fait — `(requête, { params })`, jeton présenté, `after()` bouchonné — et exige une
`Response`. Le sien a été gardé, le mien retiré, et la raison vaut d'être écrite : **un garde de
FORME prouve qu'une ligne existe ; un garde de COMPORTEMENT prouve qu'elle s'exécute.** Le mien
serait resté vert le jour où quelqu'un aurait écrit le même défaut autrement — une lambda qui
relaie ses deux arguments, `(...args) => PORTE(...args)`, passe le grep et casse pareil.

**Et sur la découverte.** Ce sont les témoins Playwright de l'écran voisin, écrits APRÈS la fusion,
qui l'ont trouvée : **les neuf ont échoué**, y compris les quatre audits qui ne font que naviguer.
J'ai d'abord soupçonné mon propre témoin (un `.first()` mal visé la veille m'y avait entraîné), puis
un cookie manquant. La cause n'est apparue qu'en démarrant le serveur construit à la main et en
lisant son journal — que le harnais Playwright avale (`stdio: 'ignore'`).

> **Quand des témoins échouent EN BLOC, y compris ceux qui ne font que naviguer, la cause n'est pas
> dans les témoins.** Un échec qui touche l'audit le plus bête de la liste dit que la page ne se
> sert pas. Aller lire le journal du serveur AVANT de relire ses propres sélecteurs.

---
