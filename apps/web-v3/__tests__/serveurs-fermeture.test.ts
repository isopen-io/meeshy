import { spawn } from 'node:child_process';

import { tueLeGroupeDeProcessus } from '../e2e/visual/lib/serveurs';

/**
 * La fuite mesurée avant ce correctif : `serveurDeLaV3()` lançait `next
 * start` SANS `detached: true`, et fermait la suite avec `enfant.kill()` —
 * qui ne touche que le processus CLI. `next start` forke pourtant son propre
 * `next-server` : orphelin à chaque fermeture, 71 processus accumulés
 * (~250 Mo chacun) avant que la mémoire ne se mette à manquer et ne fasse
 * échouer des suites SANS RAPPORT (l'import ESM dynamique de
 * `mesure-reseau.mjs` explosait sous pression mémoire — cf. `tasks/lessons.md`).
 *
 * Le test ne rejoue pas Next.js — trop lent, trop lourd pour un test unitaire
 * — mais REPRODUIT la forme exacte du défaut : un processus détaché qui forke
 * lui-même un second processus, comme `next start` forke `next-server`.
 */
const estVivant = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const attendQue = async (condition: () => boolean, delaiMs = 3_000): Promise<void> => {
  const jusqua = Date.now() + delaiMs;
  while (!condition()) {
    if (Date.now() > jusqua) throw new Error('condition jamais atteinte');
    await new Promise((resoud) => setTimeout(resoud, 25));
  }
};

describe('tueLeGroupeDeProcessus — corrige la fuite de `next-server` orphelins', () => {
  it("tue aussi le PETIT-FILS qu'un enfant détaché a forké, pas seulement l'enfant direct", async () => {
    // Un enfant DÉTACHÉ (comme serveurDeLaV3 en lance un) qui forke à son tour
    // un petit-fils long-vivant et annonce son PID sur stdout — exactement la
    // forme de `next start` forkant `next-server`.
    const enfant = spawn('bash', ['-c', 'sleep 30 & echo $!; wait'], {
      detached: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    try {
      const petitFilsPid = await new Promise<number>((resoud, rejette) => {
        let sortie = '';
        enfant.stdout?.on('data', (bloc: Buffer) => {
          sortie += bloc.toString();
          const ligne = sortie.trim();
          if (/^\d+$/.test(ligne)) resoud(Number(ligne));
        });
        enfant.once('error', rejette);
        setTimeout(() => rejette(new Error('petit-fils jamais annoncé')), 5_000);
      });

      expect(estVivant(petitFilsPid)).toBe(true);
      expect(enfant.pid).toBeDefined();

      tueLeGroupeDeProcessus(enfant.pid as number);

      await attendQue(() => !estVivant(petitFilsPid));

      expect(estVivant(petitFilsPid)).toBe(false);
    } finally {
      if (enfant.pid !== undefined) tueLeGroupeDeProcessus(enfant.pid);
    }
  });

  it('ne lève rien quand le groupe est déjà mort — la fermeture reste silencieuse', () => {
    // Un PID qui n'existe (quasi) certainement pas : le processus mort ne
    // doit jamais faire échouer la fermeture d'une suite.
    expect(() => tueLeGroupeDeProcessus(999_999)).not.toThrow();
  });
});
