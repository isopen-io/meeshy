## Leçon 249 — Une amnistie de CI ne pardonne pas un package, elle pardonne le RÉPERTOIRE (2026-08-23, cycle 105 bis)

Six cycles (99–104) ont bâti pour la passerelle un contrat d'émission
Socket.IO : une charge typée par événement, une porte d'émission dérivée du
contrat, un cliquet au TYPE sur la forme de la porte. Le cycle 105 bis a posé la
question qu'aucun des six n'avait posée : **qu'est-ce qui, en CI, devient rouge
quand ce contrat est violé ?**

Réponse mesurée : rien.

| garde | ce qu'elle fait d'un couple (événement, charge) faux |
|---|---|
| étape `Type-check` de `ci.yml` | `continue-on-error: true` — rouge sans conséquence |
| job de test (`ts-jest`) | `ignoreCodes: [2307, **2322**, 2339, **2345**, 2740]` |
| `next build` (web) | `typescript.ignoreBuildErrors: true` |

Or `2322` et `2345` sont EXACTEMENT les codes qu'une charge dépareillée produit.
Mesuré en retirant un champ requis d'une émission de `preferences-broadcast.ts` :
`error TS2345`, avalé par le premier, pardonné par le second.

> **Un cliquet de types n'est pas une garde tant qu'on n'a pas nommé l'outil qui
> le rend rouge ET vérifié que cet outil ne l'a pas mis sur sa liste d'exclusion.**
> Le cycle 104 avait fait la moitié du chemin — il a corrigé sa propre
> documentation en découvrant que c'était `ts-jest` et non `tsc` qui gardait son
> cliquet (via `TS2344`). Il n'a pas posé la question suivante : ce cliquet garde
> la FORME DE LA PORTE ; qu'est-ce qui garde ce qui PASSE dedans ? Deux codes
> ignorés plus loin, la réponse était « personne ».

### Le mécanisme : une amnistie se dimensionne sur le package le PIRE

Le drapeau `continue-on-error: true` n'était l'avis de personne sur le typage.
C'était la seule façon pour une étape UNIQUE couvrant quatre packages d'être
verte, `apps/web` portant 1241 erreurs quand les trois autres sont à zéro.

> **Une garde à granularité de dépôt s'aligne sur son membre le plus endetté, et
> ce qu'elle coûte n'est pas visible chez lui : c'est chez les membres SAINS
> qu'elle annule quelque chose.** Web ne perdait rien à l'amnistie — il n'avait
> rien à perdre. La passerelle, elle, y perdait six cycles de contrat.

Le geste n'est donc pas de lever l'amnistie (1241 erreurs à corriger d'abord)
mais de la SCINDER : bloquant pour les packages à zéro, cliquet chiffré pour
l'endetté. Une dette qui ne peut que descendre n'est plus une amnistie.

Corollaire sur le cliquet chiffré : il doit échouer dans les DEUX sens. Un
cliquet qui n'exige pas d'être resserré quand il peut l'être ne cliquette pas —
la marge regagnée redevient silencieusement dépensable. Et il n'est honnête que
si son chiffre ne dérive pas avec l'environnement : les trois sources de dérive
(`.next/types/**` présent seulement après un `next build`, client Prisma généré
seulement dans le job de test, `@meeshy/shared` résolu vers la source et non
`dist/`) ont été vérifiées une par une, et la première est exclue par chemin.

### Le corollaire de portée, et il a rendu deux défauts

Le cycle 104 avait écrit la phrase juste sans l'instruire : « un fichier de
production qu'AUCUN test n'atteint n'a, en CI, aucune vérification de type du
tout ». Instruite, elle rend six fichiers dans `services/gateway/src/` — parce
que l'`include` de `tsconfig.json` était une ÉNUMÉRATION de dix-huit répertoires
tenue à la main, qui ne nommait ni `adapters`, ni `migrations`, ni `validation`,
et n'atteignait `socketio/` que par le graphe d'imports de `server.ts`.

Deux des six étaient cassés, et le second l'était de façon opérationnelle :

- `adapters/node-signal-stores.ts` importait deux types que `@meeshy/shared`
  n'exporte plus, et déclarait `saveIdentity(): Promise<boolean>` là où
  `IdentityKeyStore` de libsignal exige `Promise<IdentityChange>`.
- `migrations/migrate-from-legacy.ts` — que
  `infrastructure/scripts/migrate-to-staging.sh` EXÉCUTE — adressait
  `prisma.conversationMember` et `prisma.messageTranslation`, deux modèles qui
  n'existent pas.

> **Une énumération de répertoires dans un `include` est une liste tenue à la
> main : elle est en retard par construction, et son retard ne ressemble pas à
> une erreur — il ressemble à des fichiers qui compilent.** `src/**/*` n'a pas
> ce mode de défaillance. Vérifier la couverture, ne pas la supposer :
> `tsc --listFiles` contre `find src -name '*.ts'` rend l'écart en une commande.

### Et le défaut le plus cher du lot n'était pas un type : c'était une BRANCHE

`migrateCollection` écrit sous `if (!DRY_RUN)`. Une cible Prisma `undefined` ne
casse donc que la course RÉELLE ; le `--dry-run` — le mode que le script de
déploiement lance en PREMIER pour décider s'il continue — n'atteint jamais la
ligne fautive et compte `stat.migrated += batch.length`.

> **Un galop d'essai qui saute l'écriture ne teste pas l'écriture : il teste
> tout SAUF elle, et il est interrogé précisément sur elle.** Devant un mode
> « simulation » gardé par un drapeau, lire ce que le drapeau saute et se
> demander si c'est justement l'objet de la question. Ici, deux collections
> étaient annoncées intégralement migrées par le seul mode que l'opérateur
> consulte avant de se lancer.
