# Iteration 131 — Plan d'implémentation (2026-07-08)

## Objectifs
Corriger deux défauts de calcul de statistiques WebRTC dans `apps/web/hooks/use-call-quality.ts` :
- **F131a** — `bitrate` dérivé d'un compteur cumulatif → le convertir en débit par intervalle (delta).
- **F131b** — `jitter` en last-write-wins cross-stream → l'agréger en max (cohérent avec packet loss).

## Affected modules
- `apps/web/hooks/use-call-quality.ts` (production)
- `apps/web/__tests__/hooks/use-call-quality.test.ts` (tests)

Aucun consommateur (`ConnectionQualityBadge`, `CallQualityOverlay`, `VideoCallInterface`,
`use-adaptive-degradation`) ne change : le contrat de type `ConnectionQualityStats` est **inchangé**,
seule la valeur numérique de `bitrate`/`jitter` devient correcte.

## Implementation phases

### Phase 1 — RED (tests d'abord)
1. Test bitrate delta-based : deux échantillons successifs de `bytesReceived` cumulatif croissant avec
   `timestamp` → le premier échantillon donne un débit `0` ; le second donne `delta*8/elapsedMs` kbps ;
   un troisième avec le **même** taux de croissance donne le **même** débit (invariance à la durée →
   prouve la non-croissance sans borne). RED : le code cumulatif donne une valeur non nulle et croissante.
2. Test jitter max cross-stream : audio jitter 40 ms itéré avant video jitter 3 ms → attendu 40 ms.
   RED : last-write-wins donne 3 ms.

### Phase 2 — GREEN (production minimale)
1. Ajouter `previousInboundRef` (`{ audioBytes, videoBytes, timestamp } | null`) au niveau du hook.
2. Dans `updateStats` : accumuler `audioBytesReceived`/`videoBytesReceived` cumulés par `kind` et
   capturer `sampleTimestamp` depuis `report.timestamp`.
3. Après la boucle : calculer `elapsedMs = sampleTimestamp − prev.timestamp` ; bitrate par kind =
   `max(0, bytes_now − bytes_prev) * 8 / elapsedMs` (kbps) ; premier échantillon (`prev === null`) → 0.
   Mémoriser le nouvel état dans `previousInboundRef`.
4. Jitter : `jitter = Math.max(jitter, report.jitter * 1000)`.
5. Réinitialiser `previousInboundRef.current = null` au changement/perte de `peerConnection`
   (branche `!peerConnection` + cleanup de l'effet de monitoring) pour ne pas calculer un delta à
   cheval sur deux appels.

### Phase 3 — Adaptation des tests existants
Convertir les 2 tests qui assertaient le bitrate cumulatif depuis un unique échantillon
(`computes video bitrate…`, `handles both audio and video…`) en tests à deux échantillons avec
`timestamp`, assertant un débit > 0 sur le second.

## Dependencies
Aucune. Fonction locale au hook.

## Estimated risks
Faible. Le type de sortie est inchangé. Risque résiduel : reset inter-appel oublié → première mesure
d'un nouvel appel fausse. Mitigé par le reset explicite (branche null + cleanup) et un test de
non-régression `clears interval when peerConnection becomes null`.

## Rollback strategy
Révert du commit unique. Aucune migration, aucun changement de contrat/schema/socket.

## Validation criteria
- [ ] Nouveaux tests RED prouvés (bitrate cumulatif / jitter last-wins) puis verts.
- [ ] Suite `use-call-quality.test.ts` intégralement verte.
- [ ] `tsc --noEmit` propre sur le hook et son test.
- [ ] Aucun consommateur modifié.

## Completion status
**COMPLET** — F131a + F131b corrigés, tests verts.

## Progress tracking
- [x] Analyse rédigée.
- [x] Plan rédigé (ce fichier).
- [x] RED (tests) — 4 échecs prouvés (bitrate cumulatif 800/received, jitter last-wins 3).
- [x] GREEN (production) — bitrate delta-based + jitter max cross-stream + reset inter-appel.
- [x] Adaptation tests existants (2 tests single-sample → deux échantillons).
- [x] Suite verte : `use-call-quality.test.ts` 44/44 ; aire video-calls **84/84** (10 suites).
- [x] `tsc --noEmit` : 0 erreur sur le hook ET son test (2 erreurs préexistantes `RTCPeerConnection`
      vs `null` dans le test corrigées opportunément, +0 nouvelle).
- [ ] Commit + push.

## Future improvements
Voir la section backlog de l'analyse (F131c, F132, **F133 message sort — prioritaire**, F134, F135, F90).
