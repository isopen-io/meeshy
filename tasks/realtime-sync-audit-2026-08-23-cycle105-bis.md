# Audit temps réel — cycle 105 bis (2026-08-23)

> Renommé « bis » : un lot homonyme (`_seq` / cast, PR #3370) a atterri sur main
> pendant que celui-ci se construisait. Même convention qu'au cycle 104 bis.

## Question du cycle

Les cycles 99 à 104 ont bâti pour la passerelle un contrat d'émission Socket.IO :
une charge typée par événement, une porte dérivée du contrat
(`socketio/serverEmit.ts`), un cliquet au TYPE sur la forme de la porte, un
balayage contre les portes contournées.

Le cycle 104 a laissé écrit, sans l'instruire, ce corollaire : *« un fichier de
production qu'AUCUN test n'atteint n'a, en CI, aucune vérification de type du
tout. »*

Instruit, il ouvre la question que six cycles n'avaient pas posée :

> **Qu'est-ce qui, en CI, devient ROUGE quand ce contrat est violé ?**

## Mesure

Rien.

| garde | ce qu'elle fait d'un couple `(événement, charge)` faux |
|---|---|
| étape `Type-check` de `.github/workflows/ci.yml` | `continue-on-error: true` |
| job de test — `ts-jest` de la passerelle | `ignoreCodes: [2307, **2322**, 2339, **2345**, 2740]` |
| `next build` (web) | `typescript.ignoreBuildErrors: true` |

`2322` et `2345` sont exactement les codes qu'une charge dépareillée produit.

**Protocole de mesure** — retrait d'un champ requis d'une émission gouvernée
(`services/gateway/src/services/preferences/preferences-broadcast.ts:53`) :

```
error TS2345: Argument of type '{ userId: string; }' is not assignable to
              parameter of type 'UserPreferencesUpdatedEventData'.
```

`tsc` le voit ; `ts-jest` l'ignore ; `continue-on-error` le pardonne. C'est la
forme exacte du défaut du cycle 101 — `message:edited` servi sans `senderId`,
`messageType` ni `createdAt`, rejeté en silence par tout décodeur iOS pendant des
mois.

*Note d'honnêteté* : sur ce site précis, un témoin de VALEUR
(`me-preferences.test.ts`) assertait `category` et est tombé. Ce n'est pas le
contrat qui l'a attrapé, c'est une assertion qui se trouvait exister. Le
cycle 101 est le contre-exemple où il n'y en avait aucune.

## Comptes

| package | erreurs `tsc --noEmit` |
|---|---|
| `@meeshy/shared` | 0 |
| `@meeshy/gateway` | 0 |
| `@meeshy/agent` | 0 |
| `@meeshy/web` | **1241** (863 hors `__tests__`, 185 fichiers) |

Une étape UNIQUE couvrant les quatre ne pouvait être verte qu'amnistiée. **Une
amnistie se dimensionne sur son membre le plus endetté, et ce qu'elle coûte n'est
pas visible chez lui** : web n'avait rien à perdre ; la passerelle y perdait six
cycles de contrat.

## Second trou — les fichiers hors de tout compilateur

`services/gateway/tsconfig.json` portait une ÉNUMÉRATION de dix-huit répertoires.
`tsc --listFiles` contre `find src -name '*.ts'` :

| | |
|---|---|
| fichiers de production | 473 |
| lus par `tsc` | 469 |
| **hors de tout compilateur** | **6** |

```
src/adapters/node-crypto-adapter.ts
src/adapters/node-signal-stores.ts          ← cassé
src/migrations/migrate-from-legacy.ts       ← cassé
src/socketio/handlers/index.ts
src/socketio/utils/index.ts
src/validation/notification-schemas.ts
```

### Défaut 1 — `adapters/node-signal-stores.ts`

- deux imports (`SignalProtocolStores`, `SignalStoreConfig`) vers des types que
  `@meeshy/shared/encryption/signal/signal-store-interface` n'exporte plus (il
  exporte `SignalProtocolStore`, au singulier) ; `SignalStoreConfig` typait un
  paramètre qu'aucune ligne du corps ne lit ;
- `saveIdentity(): Promise<boolean>` là où `IdentityKeyStore` de libsignal
  déclare `Promise<IdentityChange>`.

Aucune valeur observable ne change (`NewOrUnchanged` = 0, `ReplacedExisting` = 1,
ce que le booléen produisait par coercition). **NON supprimé** malgré ses zéro
consommateurs : la leçon 234 a tranché qu'il relève d'un chantier ÉTAGÉ, pas d'un
oubli.

### Défaut 2 — `migrations/migrate-from-legacy.ts`

Exécuté par `infrastructure/scripts/migrate-to-staging.sh`. Deux cibles Prisma
inexistantes : `prisma.conversationMember` (le modèle est `Participant`, et il
exige `type`, `displayName`, `permissions`) et `prisma.messageTranslation` (les
traductions sont EMBARQUÉES dans `Message.translations`).

**Et le défaut le plus cher n'était pas un type, c'était une BRANCHE.**
`migrateCollection` écrit sous `if (!DRY_RUN)` :

| mode | ce que le rapport annonçait |
|---|---|
| `--dry-run` (lancé en PREMIER par le script de déploiement) | collections **intégralement migrées** |
| course réelle | un warning par batch, `migrated = 0` |

> Un galop d'essai qui saute l'écriture ne teste pas l'écriture — et il est
> interrogé précisément sur elle.

## Livré

1. **`ci.yml` — deux étapes, aucune amnistie.** Les trois packages à zéro
   deviennent bloquants (`turbo --filter`) ; `apps/web` passe par
   `scripts/check-type-debt.sh`.
2. **Cliquet chiffré, échouant dans les DEUX sens** — à la hausse (régression) et
   à la baisse (amélioration non enregistrée, avec la valeur à écrire). Un
   cliquet qu'on n'exige pas de resserrer ne cliquette pas.
3. **`--self-test` en trois assertions**, chacune prouvée rouge SÉPARÉMENT
   (compteur cassé ⇒ 1 tombe ; filtre `.next/` retiré ⇒ 3 tombe). Compilateur du
   dépôt en chemin ABSOLU : dans le `mktemp -d` du self-test, `npx tsc` prenait
   TypeScript **6.0.2** depuis un cache quand le dépôt est en **6.0.3**, et sur
   un runner neuf serait parti le télécharger.
4. **Stabilité du chiffre**, trois sources de dérive vérifiées une par une :
   `.next/types/**` (exclu par chemin), client Prisma (absent du job qualité,
   web ne l'importe pas), `@meeshy/shared` (résolu vers la SOURCE, pas `dist/`).
5. **`include` = `src/**/*`** — 475 fichiers lus, **0 manquant**. Les deux
   fichiers cassés corrigés dans le même lot ;
   `reportUnmigratableCollection` compte les deux collections en erreurs
   identiquement dans les deux modes.

## Gates

- `tsc --noEmit` : 0 erreur sur `shared`, `gateway`, `agent`
- build passerelle (`tsc`) : vert
- banc passerelle : **836/836 suites, 19253/19253 témoins**
- cliquet web : 1241, self-test vert
- re-vérifié APRÈS merge de `origin/main` (PR #3369, #3370)

## Suivis laissés ouverts

1. **`services/gateway/tsconfig.json` est `strict: false`**, avec *tous* les
   drapeaux stricts éteints (`noImplicitAny`, `strictNullChecks`,
   `strictFunctionTypes`, `noUncheckedIndexedAccess`…). Le contrat d'émission est
   désormais gardé — sous un compilateur qui ne vérifie ni `null` ni les
   paramètres implicites. C'est la marche suivante, et elle se monte package par
   package.
2. **La dette de `apps/web` (1241) n'a pas commencé à descendre.** Le cliquet
   l'empêche de croître ; le réduire est un chantier à part. Candidat le mieux
   groupé : les fonctions déclarées `(x: unknown)` dont le corps accède aux
   propriétés (`components/conversations/conversation-item/message-formatting.tsx`,
   35 erreurs à lui seul) — un `unknown` qui ment vaut moins qu'un `any` assumé.
3. **`apps/web/next.config.ts` porte `typescript.ignoreBuildErrors: true`** : la
   BUILD de web ne type-check pas non plus. Le cliquet couvre la CI, pas le
   build ; les deux tomberont ensemble le jour où la dette atteint zéro.
