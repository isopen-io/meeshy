/**
 * Un seul barème de présence 1/3/5, sur les TROIS plateformes.
 *
 * `getUserPresenceStatus` classe un contact en `online` / `away` / `idle` /
 * `offline` à partir du temps écoulé depuis sa dernière activité. Le barème —
 * ≤ 60 s → online, ≤ 3 min → away, ≤ 5 min → idle, au-delà → offline — est la
 * règle produit « 1/3/5 » (2026-07-20), et il vit en TROIS exemplaires, un par
 * client, comme l'exige un état dérivé identiquement partout :
 *
 * | plateforme | site | forme |
 * |---|---|---|
 * | TypeScript (SSOT) | `PRESENCE_*_WINDOW_MS` (`utils/user-presence.ts`) | constantes, ms |
 * | Swift (iOS/SDK) | `UserPresence.state(now:)` (`PresenceModels.swift`) | littéraux inline, secondes |
 * | Kotlin (Android) | `Presence.*_WINDOW_MS` (`Presence.kt`) | constantes, ms |
 *
 * Les trois DOIVENT rendre le même état pour un même `lastActiveAt` : une
 * divergence afficherait un contact « en ligne » (point vert) sur un client et
 * « absent » (orange) sur un autre, pour la même donnée serveur — une
 * incohérence visible que seul un témoin cross-plateforme peut fermer.
 *
 * Jusqu'ici l'invariant ne tenait que par des consignes en commentaire
 * (« miroir Android `Presence.kt` », « Toute évolution de la règle doit toucher
 * les trois sites »). Une consigne n'est pas un témoin : les seuils ont pu
 * dériver sur un seul site sans que rien ne rougisse. Même esprit et même
 * mécanique que `language-normalize-mirror-parity.test.ts` et
 * `password-min-length-parity.test.ts` : une règle unique, recensée là où elle
 * se duplique, et un témoin qui peut tomber au ROUGE dès qu'un seul des trois
 * seuils change sur un seul des trois sites.
 *
 * NB : le test lit les seuils là où chaque plateforme les DÉCLARE — donc les
 * littéraux inline du `state(now:)` Swift (ancrés sur l'état retourné, jamais
 * sur la garde anti-stale `isOnline`), sans exiger que iOS extraie des
 * constantes nommées. Il n'exige AUCUNE modification des sources iOS/Android.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  PRESENCE_ONLINE_WINDOW_MS,
  PRESENCE_AWAY_WINDOW_MS,
  PRESENCE_IDLE_WINDOW_MS,
} from '../utils/user-presence.js';

const SWIFT_SOURCE = join(
  __dirname,
  '../../MeeshySDK/Sources/MeeshySDK/Models/PresenceModels.swift'
);

const KOTLIN_SOURCE = join(
  __dirname,
  '../../../apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Presence.kt'
);

type PresenceWindows = { online: number; away: number; idle: number };

/** Barème TS, ramené en SECONDES pour comparer les trois plateformes. */
const TS_WINDOWS_SECONDS: PresenceWindows = {
  online: PRESENCE_ONLINE_WINDOW_MS / 1000,
  away: PRESENCE_AWAY_WINDOW_MS / 1000,
  idle: PRESENCE_IDLE_WINDOW_MS / 1000,
};

/**
 * Extrait, du corps de `state(now:)` Swift, le seuil (en secondes) ancré sur
 * l'état RETOURNÉ — `elapsed <= N { return .online }`. L'ancrage sur `.online`/
 * `.away`/`.idle` évite de ramasser la garde anti-stale `$0 <= 300` du chemin
 * `isOnline` (dont la forme est `<= 300 }) ?? true`, sans `{ return .` derrière).
 */
function swiftWindowSeconds(source: string, state: 'online' | 'away' | 'idle'): number {
  const pattern = new RegExp(
    `elapsed\\s*<=\\s*(\\d+)\\s*\\{\\s*return\\s+\\.${state}\\b`
  );
  const match = source.match(pattern);
  if (!match) {
    throw new Error(
      `Seuil Swift pour \`.${state}\` introuvable — le corps de state(now:) a-t-il changé de forme ?`
    );
  }
  return Number(match[1]);
}

/**
 * Extrait la constante Kotlin `const val NAME_MS: Long = N_NNN_NNNL`, en
 * secondes (les littéraux Kotlin portent des underscores : `300_000L`).
 */
function kotlinWindowSeconds(source: string, name: string): number {
  const pattern = new RegExp(`${name}\\s*:\\s*Long\\s*=\\s*([\\d_]+)L`);
  const match = source.match(pattern);
  if (!match) {
    throw new Error(
      `Constante Kotlin \`${name}\` introuvable — la déclaration a-t-elle changé de forme ?`
    );
  }
  return Number(match[1].replace(/_/g, '')) / 1000;
}

describe('barème de présence 1/3/5 — TS, Swift et Kotlin ne peuvent pas diverger', () => {
  const swift = readFileSync(SWIFT_SOURCE, 'utf8');
  const kotlin = readFileSync(KOTLIN_SOURCE, 'utf8');

  it('les seuils TS sont bien la règle produit 1/3/5 (contre-épreuve)', () => {
    // Ancre le test sur les valeurs attendues : une extraction Swift/Kotlin
    // cassée qui rendrait 0 ne « passerait » pas contre un TS lui-même faux.
    expect(TS_WINDOWS_SECONDS).toEqual({ online: 60, away: 180, idle: 300 });
  });

  it('Swift state(now:) applique exactement le barème TS', () => {
    const swiftWindows: PresenceWindows = {
      online: swiftWindowSeconds(swift, 'online'),
      away: swiftWindowSeconds(swift, 'away'),
      idle: swiftWindowSeconds(swift, 'idle'),
    };
    expect(swiftWindows).toEqual(TS_WINDOWS_SECONDS);
  });

  it('Kotlin Presence.*_WINDOW_MS applique exactement le barème TS', () => {
    const kotlinWindows: PresenceWindows = {
      online: kotlinWindowSeconds(kotlin, 'ONLINE_WINDOW_MS'),
      away: kotlinWindowSeconds(kotlin, 'AWAY_WINDOW_MS'),
      idle: kotlinWindowSeconds(kotlin, 'IDLE_WINDOW_MS'),
    };
    expect(kotlinWindows).toEqual(TS_WINDOWS_SECONDS);
  });

  it('la garde anti-stale isOnline de Swift utilise bien la fenêtre idle (5 min)', () => {
    // Le chemin `isOnline` ignore un flag serveur périmé au-delà de la fenêtre
    // idle : `elapsed.map({ $0 <= 300 }) ?? true`. Ce seuil DOIT rester égal au
    // seuil idle, sinon un `isOnline=true` obsolète survivrait plus (ou moins)
    // longtemps sur iOS que ne le prévoit la garde TS
    // (`elapsed <= PRESENCE_IDLE_WINDOW_MS`).
    const guard = swift.match(/\$0\s*<=\s*(\d+)\s*\}\)\s*\?\?\s*true/);
    if (!guard) {
      throw new Error('Garde anti-stale isOnline Swift introuvable — a-t-elle changé de forme ?');
    }
    expect(Number(guard[1])).toBe(TS_WINDOWS_SECONDS.idle);
  });
});
