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
# Analyse — Itération 254 : retirer le `SecurityMonitor` mort (supplanté par les `securityEvent.create` en ligne)

## Current state

`services/gateway/src/services/SecurityMonitor.ts` (347 lignes) expose une classe
`SecurityMonitor` — « Real-time security event monitoring, anomaly detection, and
alerting » — avec un constructeur qui initialise des seuils, charge des e-mails
admin et démarre un `setInterval` de nettoyage, plus une douzaine de méthodes
(`logEvent`, `logBatch`, `getRecentEvents`, `getMetrics`, `getUserEvents`,
`checkThresholds`, `sendAlert`, `addAdminEmail`, `getAlertStats`, …).

Son unique consommateur est son propre test,
`src/__tests__/unit/services/SecurityMonitor.test.ts` (404 lignes). Aucune route,
aucun job, aucun service ne l'instancie.

Pendant ce temps, le journal d'événements de sécurité que la production exécute
réellement est **en ligne** : `db.securityEvent.create({ … })` appelé
directement dans six modules vivants —
`SessionService`, `PasswordResetService`, `PhonePasswordResetService`,
`PhoneTransferService`, `MagicLinkService` et le job `unlock-accounts`.

## Problems identified

1. **Code mort avec test-décoration.** 751 lignes (source + test) qui ne peuvent
   pas tomber en cas de régression produit : le test exerce une classe que rien
   n'appelle. Faux signal de couverture.
2. **Homonymie fonctionnelle / duplication.** Deux implémentations du « log
   d'événement de sécurité » coexistent : la classe orpheline et le
   `securityEvent.create` en ligne des six modules. La classe est la copie morte.
3. **Qualité non tenue.** La classe recourt largement à `any`
   (`metadata?: any`, `getMetrics(): Promise<any>`, `getAlertStats(): any`),
   ce que la charte TypeScript du dépôt interdit — signe qu'elle n'a jamais
   atteint le niveau production.

## Root causes

Service « aspirationnel » (anomaly detection + alerting e-mail) esquissé mais
jamais câblé ; la production a résolu le besoin minimal (persister l'événement)
en ligne, laissant la classe complète en orbite morte. Même patron que les
itérations 250 / 252 / 253.

## Business impact

Nul en exécution (jamais chargé). Coût = friction de maintenance : un lecteur
suppose à tort que l'alerting de sécurité est actif ; toute évolution du modèle
`SecurityEvent` doit maintenir un fichier fantôme et son test.

## Technical impact

- −751 lignes de dette (source 347 + test 404).
- Suppression d'une source de `any` dans le gateway.
- Un seul chemin de journalisation d'événement sécurité reste : l'appel en ligne.

## Risk assessment

Très faible. Suppression pure de code jamais exécuté + son unique témoin.
`tsc --noEmit` gateway reste à 0 après retrait (vérifié). Aucun autre module
n'importe la classe ni ses ré-exports de types (`SecurityEventData`,
`SecurityAlert`, `SecurityEventType/Severity/Status`) — ces types proviennent de
`@meeshy/shared/utils/validation`, seule source consommée ailleurs.

Seul point mesuré : l'effet sur la couverture globale (retrait de lignes
couvertes du numérateur ET du dénominateur), négligeable et vérifié par une
exécution `test:coverage` complète avant publication (seuils 87/80/86/83).

## Proposed improvements

Supprimer les deux fichiers. Aucun remplacement nécessaire : le chemin vivant
(`securityEvent.create` en ligne) est déjà la source de vérité.

## Expected benefits

Dépôt gateway allégé de 751 lignes de dette, un chemin de journalisation unique,
une source de `any` en moins, couverture désormais mesurée uniquement sur du code
exécuté.

## Implementation complexity

Triviale : `git rm` × 2, `tsc`, `test:coverage`.

## Validation criteria

- `tsc --noEmit` gateway exit 0 (avant et après). ✅
- Aucune référence de code résiduelle à `SecurityMonitor` (hors docs historiques).
- `bun run test:coverage` verte, seuils 87/80/86/83 tenus.
- Chemin vivant (`securityEvent.create` × 6 modules) inchangé.

## Suivi — série dette de code mort

- 250 : `_findUsersForLanguage`
- 252 : `TranslationCache` Redis (homonyme mort)
- 253 : `CaptchaService` (doublon de `verifyCaptcha` en ligne)
- **254 : `SecurityMonitor` (doublon des `securityEvent.create` en ligne)**

Prochain candidat potentiel du même patron : rechercher d'autres services
gateway instanciés uniquement par leur test (`grep` « importé seulement par
son test »).
