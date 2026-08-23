# Analyse — Itération 254 : un `participant-resolver` mort, homonyme du vivant

## Current state

Le gateway porte **DEUX modules `participant-resolver`**, dans deux
répertoires distincts, qui n'exportent PAS les mêmes symboles :

| fichier | exports | câblé en production ? |
|---|---|---|
| `src/socketio/utils/participant-resolver.ts` | `resolveParticipant`, `resolveParticipantFromMessage` | **OUI** — importé par `StatusHandler.ts`, `MessageHandler.ts`, `AttachmentReactionHandler.ts` |
| `src/utils/participant-resolver.ts` | `resolveParticipantId`, `resolveSenderUserId` | **NON** — aucun import de production |

Le second (racine `utils/`, 24 lignes) est accompagné d'un test de **104 lignes**
(`src/__tests__/unit/utils/participant-resolver.test.ts`) qui l'exerce
intégralement.

## Problems identified

`src/utils/participant-resolver.ts` est du **code mort**, exactement au sens que
les itérations 250 (`_findUsersForLanguage`), 252 (`TranslationCache` Redis) et
253 (`CaptchaService`) viennent d'établir :

```
$ grep -rn "utils/participant-resolver'" services/gateway/src --include="*.ts" | grep -v socketio
services/gateway/src/__tests__/unit/utils/participant-resolver.test.ts:13: } from '../../../utils/participant-resolver';
```

- **Zéro import de production** dans tout le monorepo (le seul consommateur du
  chemin `utils/participant-resolver` — hors `socketio/utils/` — est son propre
  test).
- **Aucun chargement dynamique** (`require(`/`import(` sur ce chemin : néant).
- **Aucun barrel** ne le ré-exporte (`src/utils/index.ts` n'existe pas).
- Les symboles qu'il exporte sont **réimplémentés inline** ailleurs, ce qui est
  la preuve que rien ne dépend de cette copie :
  - `resolveParticipantId` : méthodes privées `_resolveParticipantId` dans
    `MessageHandler.ts:1934`, `LocationHandler.ts:547`, `ReactionHandler.ts:399`,
    et `CallEventsHandler.ts:1428` — chacune déclarée localement, aucune n'importe
    le util.
  - `resolveSenderUserId` : fonction locale `async function resolveSenderUserId`
    dans `services/messaging/messageMentions.ts:49` (signature à **3** arguments
    `(prisma, senderId, onError)`, appelée à `:444`) — distincte de la version du
    util (2 arguments), et non importée de lui.

Deux défauts en découlent :

1. **Homonymie trompeuse (défaut principal).** Deux modules `participant-resolver`
   dans l'arbre : un lecteur qui cherche « le » résolveur de participant a une
   chance de tomber sur une implémentation que la production n'exécute jamais.
   C'est précisément le piège que le harnais du gateway documente — « Cette entité
   a-t-elle une JUMELLE ? ». Le fait que les deux modules exportent des symboles
   *différents* aggrave la confusion : ce ne sont pas deux copies identiques, mais
   deux surfaces qui se recouvrent partiellement.
2. **104 lignes de témoins-décoration.** Le test exerce des fonctions que rien
   n'appelle : aucune de ses assertions ne peut tomber sous une régression
   PRODUIT. Il atteste une implémentation morte et suggère faussement qu'un util
   de résolution de participant est couvert et maintenu.

## Root causes

Vestige d'une factorisation jamais adoptée : quelqu'un a extrait
`resolveParticipantId`/`resolveSenderUserId` dans un util partagé, mais les sites
appelants ont continué de réimplémenter la logique inline (méthodes privées de
handler, fonction locale de `messageMentions`). L'util n'a jamais été câblé ; son
test a survécu avec lui. Personne ne l'a signalé parce que, homonyme du vivant
`socketio/utils/participant-resolver.ts`, il se fond dans les résultats de
recherche du module VIVANT.

## Business impact

Nul aujourd'hui : les chemins de résolution de participant vivants (méthodes
privées de handler + `messageMentions.resolveSenderUserId`) fonctionnent. **Le
risque est un piège de maintenance**, identique à celui nommé par les itérations
250/252/253 : la prochaine personne qui doit toucher à la résolution de
participant peut ouvrir le mauvais fichier, « corriger » une implémentation
morte, et voir ses témoins verts confirmer un travail sans effet.

## Technical impact

Surface minimale, purement soustractive : suppression d'un util de 24 lignes +
son test de 104 lignes (128 lignes au total). Aucune signature publique, aucun
contrat de fil, aucun schéma, aucun import de production modifié
(`tsc --noEmit` gateway : exit 0 après retrait). Le module vivant
`socketio/utils/participant-resolver.ts` — cité par le `CLAUDE.md` comme
implémentation de référence — reste **inchangé**, la doc reste exacte.

## Risk assessment

Très faible. On retire du code qu'aucun chemin d'exécution n'atteint et le seul
témoin qui l'exerçait. Contre-preuve du chemin VIVANT :
`socketio/utils/participant-resolver.ts` et ses importateurs
(`StatusHandler`, `MessageHandler`, `AttachmentReactionHandler`) restent intacts ;
les méthodes privées `_resolveParticipantId` et
`messageMentions.resolveSenderUserId` restent intactes.

Effet sur la couverture : le fichier mort était couvert par son test ; on retire
donc des lignes couvertes du numérateur ET du dénominateur. L'effet global sur un
dépôt de centaines de fichiers est négligeable, et il est **mesuré** par une
exécution complète de `bun run test:coverage` avant publication (seuils
87/80/86/83). Publication conditionnée à seuils tenus.

## Proposed improvements (implemented)

1. **Suppression** de `src/utils/participant-resolver.ts` (util mort).
2. **Suppression** de `src/__tests__/unit/utils/participant-resolver.test.ts`
   (104 lignes exerçant l'util mort).

Résolution par RETRAIT, pas par correction — même doctrine que les itérations
250/252/253 : un défaut sur du code mort se retire, il ne se maintient pas. On ne
canonicalise pas, on ne refactore pas une implémentation que la production
n'exécute jamais.

## Expected benefits

- Un homonyme trompeur de moins : le module `participant-resolver` désigne
  désormais un seul emplacement de résolution partagée, celui que la production
  utilise (`socketio/utils/`).
- 128 lignes de code + test mortes retirées du bundle et du compte de suites.
- Le lecteur qui cherche le résolveur de participant est envoyé vers le seul site
  vivant, pas vers un util orphelin.

## Implementation complexity

Triviale : deux suppressions de fichiers, aucune addition de production.

## Validation criteria

- `tsc --noEmit` gateway : exit 0 (fait).
- Aucune référence résiduelle au chemin supprimé (`grep` : néant hors le test
  supprimé).
- `bun run test:coverage` : suite complète verte, seuils 87/80/86/83 tenus.
- Chemins vivants inchangés : `socketio/utils/participant-resolver.ts` +
  importateurs, `_resolveParticipantId` privés, `messageMentions.resolveSenderUserId`
  intacts.

## Future improvements

Le motif « util factorisé mais jamais câblé, tandis que les appelants
réimplémentent inline » suggère un axe futur : plutôt que de retirer, on pourrait
un jour *câbler* un util unique de résolution de participant et faire converger
les quatre `_resolveParticipantId` privés vers lui. Mais ce serait une
refactorisation de comportement (les copies inline diffèrent subtilement : p. ex.
`CallEventsHandler.resolveParticipantIdFromCall` vérifie l'appartenance via
`callId`, pas via `conversationId`), donc hors périmètre d'une passe de retrait de
dette. À instruire séparément si la duplication devient un coût réel. Pour cette
itération, le retrait est la seule réponse correcte : câbler l'util aurait
fabriqué de la convergence là où les comportements divergent volontairement.
