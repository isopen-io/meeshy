/**
 * Vecteurs inter-plateformes pour `getUserPresenceStatus`
 * (`packages/shared/utils/user-presence.ts`, règle produit 1/3/5).
 *
 * Fixtures : `packages/shared/fixtures/reading-modes/presence-state.vectors.json`.
 *
 * Comble le trou laissé par `presence-mirror-parity.test.ts` : ce dernier
 * garde l'ÉGALITÉ DES SEUILS (les nombres 60/180/300 s) entre TS, Swift et
 * Kotlin, mais n'exerce jamais le COMPORTEMENT de branchement — en
 * particulier l'interaction entre `isOnline` et la garde anti-stale (5 min),
 * les bornes `<=` (incluses), et un horodatage futur (élapsé négatif). Une
 * dérive sur L'ORDRE des branches (garde anti-stale avant ou après la
 * cascade de seuils) ou sur une borne (`<` au lieu de `<=`) changerait le
 * VERDICT sans qu'aucun des deux seuils nommés ne change — donc sans faire
 * rougir `presence-mirror-parity.test.ts`.
 *
 * `input` = `{ isOnline, elapsedMs }` où `elapsedMs` est le temps écoulé
 * depuis `lastActiveAt` relativement à `now` (`null` = aucune activité
 * connue, négatif = horodatage dans le futur). `expected` = `{ status }`.
 *
 * Le fichier de vecteurs est la référence pour les miroirs Swift
 * (`UserPresence.state(now:)`, `PresenceModels.swift`) et Kotlin
 * (`UserPresence.state(nowEpochMillis:)`, `Presence.kt`) — mécanisme de
 * `fixtures/README.md` (XCTest via ressource de bundle XcodeGen, JUnit via
 * ressource symlinkée Gradle), à câbler par une suite native qui recalcule
 * `lastActiveAt` depuis `elapsedMs` et confronte son propre `state(...)`.
 */
import { getUserPresenceStatus, type UserPresenceStatus } from '../../utils/user-presence.js';
import { runVectors } from './harness.js';

type PresenceStateVectorInput = {
  readonly isOnline: boolean;
  readonly elapsedMs: number | null;
};

type PresenceStateVectorExpected = {
  readonly status: UserPresenceStatus;
};

const NOW = 0;

const run = ({ isOnline, elapsedMs }: PresenceStateVectorInput): PresenceStateVectorExpected => ({
  status: getUserPresenceStatus(
    { isOnline, lastActiveAt: elapsedMs === null ? null : new Date(NOW - elapsedMs) },
    NOW,
  ),
});

runVectors<PresenceStateVectorInput, PresenceStateVectorExpected>('presence-state', run);
