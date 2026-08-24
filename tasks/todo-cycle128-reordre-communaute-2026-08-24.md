# Cycle 128 — le glisser-déposer d'une communauté n'atteignait aucun autre appareil

## Le défaut

`POST /user-preferences/communities/reorder` PERSISTE `orderInCategory` et
**n'émet rien**. Son jumeau conversation — `reorderConversationPreferences` —
diffuse `USER_PREFERENCES_REORDERED` sur la room personnelle.

La ligne `UserCommunityPreferences` est par UTILISATEUR, pas par appareil : un
réordonnancement fait sur l'iPhone n'atteint donc jamais l'onglet web ouvert, qui
tient sa liste en `staleTime: Infinity` avec le socket pour source primaire.
L'ordre diverge jusqu'à un rechargement complet.

## Ce qui l'a rendu invisible

Le lot F71 (`community-preferences-broadcast.test.ts`) a précisément fermé cette
classe de défaut — son en-tête le dit : « PUT/DELETE … didn't emit anything, so a
second tab/device for the same user never learned ». Il a énuméré les écrivains
qui CHANGENT une préférence et laissé celui qui RÉORDONNE.

Et le handler de réordonnancement CITE son jumeau, dans un commentaire de dix
lignes, pour lui emprunter son filtre d'appartenance : l'auteur a ouvert la
jumelle, en a pris la moitié qui répondait à sa question, et a laissé l'autre.

## La décision de contrat : un NOM neuf, pas un élargissement

Mesuré avant de choisir :

| décodeur de `USER_PREFERENCES_REORDERED` | face à un item `{communityId, orderInCategory}` |
|---|---|
| iOS `UserPreferencesReorderedSocketEvent.Update.conversationId: String` (NON optionnel) | le décodage de l'ÉVÉNEMENT ENTIER échoue — les réordonnancements de conversation partent avec |
| web `applyRemoteReorder` → `current.has(update.conversationId)` | filtré en silence |

Élargir la charge d'un événement que trois clients décodent casse le cas
nominal pour en servir un nouveau. `USER_PREFERENCES_COMMUNITY_REORDERED` est
INERTE pour les deux consommateurs existants par construction.

## Le correctif

- [x] `packages/shared` — `USER_PREFERENCES_COMMUNITY_REORDERED` +
      `UserPreferencesCommunityReorderedEventData` + entrée `ServerToClientEvents`
- [x] gateway — la route calcule `applicable` (dédup + filtre d'appartenance)
      AVANT d'écrire, puis diffuse exactement ce qu'elle a écrit ; rien d'écrit
      ⇒ rien d'émis
- [x] web — abonnement (`preferences-sync.service` → orchestrateur → façade) et
      invalidation du cache de préférences communauté (liste + chaque
      communauté NOMMÉE, `orderInCategory` appartenant aussi à la ligne de détail)
- [x] témoins RED d'abord, des deux côtés
- [x] cliquet d'inventaire des écrivains des DEUX tables de préférences
      (`preference-writer-sweep.ts`), collecteur exercé sur une arborescence
      fabriquée pour prouver qu'il TOMBE
- [x] double partiel INERTE de `@meeshy/shared/types/socketio-events` retiré de
      `preferences-sync.service.test.ts` (4e exemplaire de la famille)

## Gates

- [x] témoins RED prouvés — gateway : **2 rouges** sur l'émission manquante,
      7 verts après ; web : **3 rouges** (`is not a function`), 51 verts après
- [x] `packages/shared` — build `tsc` exit 0 ; suite complète **109 fichiers,
      2587 témoins**, dont les 4 gates CI (`socket-event-emitter-gate` compris :
      le nom neuf est bien NOMMÉ par un émetteur de production)
- [x] `tsc --noEmit` gateway — exit 0 (code de retour lu SANS pipe)
- [x] suites web voisines — **21 suites, 670 témoins**
- [x] cliquet de dette de types web — **1196, inchangé**
- [x] suite gateway complète — **861/861 suites, 19564 témoins**, exit 0
      (couverture 95,47 % — identique au cycle 127). Le compte se lit dans la
      sortie, jamais par soustraction : 860/19553 au cycle 127, +4 témoins de
      diffusion, +1 suite / +7 témoins de cliquet.
- [x] gardes CI non-jest — `check-type-debt` (+ `--self-test`),
      `check-law-literals`, `check-swift-viewbuilder` : les cinq exits à 0

## Revue

Rapport complet : `tasks/realtime-sync-audit-2026-08-24-cycle128.md`.
Leçon : `tasks/lessons.md` § 281. Règles : `services/gateway/CLAUDE.md`.
Décision : `packages/shared/decisions.md`.

Suivi laissé ouvert et NON instruit : iOS et Android ne décodent pas le nouvel
événement — ils n'ont aucune surface de réordonnancement de communautés, et le
seul émetteur de la route est le web. Un décodeur posé maintenant serait un
consommateur sans producteur, que rien ne ferait tomber s'il dérive.

Suivi hérité du cycle 127, toujours ouvert : la fenêtre de rappel push est
rétrécie, pas fermée (rappel APNs `content-available` + suppression NSE, lot à
part touchant les trois clients).
