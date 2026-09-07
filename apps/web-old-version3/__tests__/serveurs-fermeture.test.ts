import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { tueLeGroupeDeProcessus, verifieQueLeBuildNAPasInlineUnePasserelleReelle } from '../e2e/visual/lib/serveurs';

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

/**
 * DÉFAUT MAJEUR DE REVUE (#5387) — un `apps/web-old-version3/.env.local` de confort
 * déclarant `NEXT_PUBLIC_API_URL` vers une origine RÉELLE fait échouer toute
 * la suite d'une façon qui ne nomme pas sa cause : Next.js inline cette
 * variable au moment de `next build` (`lib/api/passerelle.ts`), donc
 * l'affectation faite à `next start` par `serveurDeLaV3` arrive TROP TARD.
 * Un répertoire TEMPORAIRE, jamais `.env.local` du dépôt lui-même : le témoin
 * ne doit dépendre d'aucun état laissé par un poste de développement.
 */
describe('verifieQueLeBuildNAPasInlineUnePasserelleReelle — le build ne peut pas avoir inliné une passerelle réelle', () => {
  const dans = (contenu: string): string => {
    const racine = mkdtempSync(join(tmpdir(), 'meeshy-v3-env-'));
    writeFileSync(join(racine, '.env.local'), contenu, 'utf8');
    return racine;
  };

  it("ne lève rien quand .env.local n'existe pas", () => {
    const racine = mkdtempSync(join(tmpdir(), 'meeshy-v3-env-'));
    try {
      expect(() => verifieQueLeBuildNAPasInlineUnePasserelleReelle(racine)).not.toThrow();
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });

  it("ne lève rien quand NEXT_PUBLIC_API_URL pointe la boucle locale", () => {
    const racine = dans('NEXT_PUBLIC_API_URL=http://127.0.0.1:3000\n');
    try {
      expect(() => verifieQueLeBuildNAPasInlineUnePasserelleReelle(racine)).not.toThrow();
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });

  it("ne lève rien quand .env.local ne déclare pas NEXT_PUBLIC_API_URL du tout", () => {
    const racine = dans('MEESHY_GATEWAY_URL=http://127.0.0.1:3000\n');
    try {
      expect(() => verifieQueLeBuildNAPasInlineUnePasserelleReelle(racine)).not.toThrow();
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });

  it('lève, en NOMMANT la cause, quand NEXT_PUBLIC_API_URL pointe une origine RÉELLE — le cas mesuré en revue', () => {
    const racine = dans('NEXT_PUBLIC_API_URL=https://gate.staging.meeshy.me\nMEESHY_GATEWAY_URL=https://gate.staging.meeshy.me\n');
    try {
      expect(() => verifieQueLeBuildNAPasInlineUnePasserelleReelle(racine)).toThrow(/NEXT_PUBLIC_API_URL=https:\/\/gate\.staging\.meeshy\.me/);
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });
});
