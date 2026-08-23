# Plan d'implémentation — Itération 254 : retrait du `participant-resolver` mort

## Objectives

Retirer le module mort `src/utils/participant-resolver.ts` (et son test) du
gateway — un util factorisé jamais câblé, homonyme du vivant
`src/socketio/utils/participant-resolver.ts` — sans toucher au moindre chemin
d'exécution vivant.

## Affected modules

- `services/gateway/src/utils/participant-resolver.ts` — **supprimé**
- `services/gateway/src/__tests__/unit/utils/participant-resolver.test.ts` — **supprimé**

Non touchés (chemins vivants, contre-preuve) :
- `services/gateway/src/socketio/utils/participant-resolver.ts` (module vivant)
- Ses importateurs : `StatusHandler.ts`, `MessageHandler.ts`, `AttachmentReactionHandler.ts`
- Méthodes privées `_resolveParticipantId` (MessageHandler, LocationHandler, ReactionHandler, CallEventsHandler)
- `services/messaging/messageMentions.ts` (`resolveSenderUserId` local, 3 args)

## Implementation phases

1. **Phase 1 — Retrait.** `git rm` des deux fichiers. ✅ Fait.
2. **Phase 2 — Typecheck.** `tsc --noEmit` gateway → exit 0. ✅ Fait.
3. **Phase 3 — Couverture.** `bun run test:coverage` → suite verte, seuils tenus.
4. **Phase 4 — Documentation.** Analyse + plan (ce fichier).
5. **Phase 5 — Publication.** Commit + push sur `claude/brave-archimedes-njhgtm`.

## Dependencies

Aucune. Retrait purement soustractif ; aucun autre module ne dépend des symboles
supprimés (grep : zéro import de production).

## Estimated risks

Très faible. Seul risque théorique : un chargement dynamique non détecté — écarté
par grep exhaustif (`require(`/`import(` sur le chemin : néant) et par
`tsc --noEmit` exit 0.

## Rollback strategy

`git revert` du commit de retrait restaure les deux fichiers à l'identique. Aucun
état externe, aucune migration, aucun schéma impliqué.

## Validation criteria

- [x] `tsc --noEmit` gateway : exit 0
- [x] Aucune référence résiduelle (`grep` hors socketio : néant)
- [x] `bun run test:coverage` : **839/840 suites vertes** — la seule suite rouge
  (`messages-list-forward-source-attachment-url-leak.test.ts`, 3 tests) est un
  **rouge PRÉEXISTANT sur `main`**, orthogonal à ce retrait (diff ne touche que
  `participant-resolver.ts` + docs, aucun code de route/pièce jointe). Rouge connu,
  adressé par les PR #3388/#3391 (« main était rouge », « débloquer main CI rouge »).
- [x] Module vivant `socketio/utils/participant-resolver.ts` intact

## Completion status

- Retrait : **fait**
- Typecheck : **fait**
- Couverture : **mesurée** — 839/840 suites vertes, unique rouge préexistant/orthogonal
- Docs : **fait**
- Publication : **poussé sur `claude/brave-archimedes-njhgtm`**

## Progress tracking

Itération 254 clôt un axe de dette (util factorisé mort, homonymie) dans la
lignée directe des itérations 250/252/253. Méthode confirmée : vérifier
l'APPELANT avant de canonicaliser ; ici l'util n'avait aucun appelant de
production, le retrait est la seule réponse correcte.

## Future improvements

Convergence éventuelle des quatre `_resolveParticipantId` privés vers un util
partagé — refactorisation de COMPORTEMENT (les copies divergent volontairement,
p. ex. résolution par `callId` vs `conversationId`), donc hors périmètre d'une
passe de retrait. À instruire séparément si la duplication devient un coût réel.
# Plan — Itération 254 : retirer le `SecurityMonitor` mort

## Objectives

Retirer `src/services/SecurityMonitor.ts` — classe de monitoring/alerting sécurité
jamais câblée, doublon des `db.securityEvent.create(...)` en ligne qui sont le
seul journal d'événements de sécurité que la production exécute — et son test de
404 lignes qui l'exerce sans pouvoir tomber.

## Affected modules

- `services/gateway/src/services/SecurityMonitor.ts` — SUPPRIMÉ.
- `services/gateway/src/__tests__/unit/services/SecurityMonitor.test.ts` — SUPPRIMÉ.
- Docs : analyse + ce plan.

## Implementation phases

1. **Preuve du code mort** — `grep -rn "SecurityMonitor"` : seul le test importe
   le symbole ; aucun `new SecurityMonitor`, aucun import/require dynamique, aucun
   barrel ; aucune ré-export de type (`SecurityEventData`, `SecurityAlert`,
   `SecurityEventType/Severity/Status`) consommée ailleurs. ✅ fait.
2. **Preuve du chemin vivant** — `securityEvent.create` en ligne dans
   `SessionService`, `PasswordResetService`, `PhonePasswordResetService`,
   `PhoneTransferService`, `MagicLinkService`, job `unlock-accounts`. ✅ fait.
3. **Retrait** des deux fichiers (`git rm`). ✅ fait.
4. **Validation** — `tsc --noEmit` gateway (exit 0 avant/après, fait), puis
   `bun run test:coverage` complète (seuils 87/80/86/83 tenus).

## Dependencies

Aucune. Additif négatif (suppression pure). `EmailService`, `enhancedLogger`,
`PrismaClient` (imports du fichier mort) restent utilisés partout ailleurs.

## Estimated risks

Très faible : suppression de code jamais exécuté + son unique témoin. Seul point à
mesurer : effet sur la couverture globale (lignes couvertes retirées du numérateur
ET du dénominateur), négligeable, vérifié par exécution complète avant publication.

## Rollback strategy

`git revert` du commit unique restaure les deux fichiers. Aucun état persistant,
aucune migration, aucun contrat de fil.

## Validation criteria

- [x] `tsc --noEmit` gateway exit 0 (avant et après).
- [x] Aucune référence de code résiduelle à `SecurityMonitor` (hors docs).
- [x] `bun run test:coverage` verte : 840/840 suites, 19252/19252 tests ;
      couverture 95.39 %/89.46 %/93.31 %/96.09 % (seuils 87/80/86/83 tenus).
- [x] Chemin vivant (`securityEvent.create` × 6 modules) inchangé.

## Completion status

**COMPLET** — 2 fichiers supprimés (751 lignes), `tsc --noEmit` exit 0,
suite complète verte, seuils tenus.

## Progress tracking

- Analyse : `docs/routine/analyses/2026-08-23-iteration-254-analyse.md`.
- Série dette de code mort : 250, 252, 253, **254**.

## Future improvements

Balayer les services gateway importés uniquement par leur test (candidats du même
patron). Corollaire de qualité : les fichiers morts concentrent souvent des `any`
non tenus — leur retrait supprime aussi la dette de typage associée.
