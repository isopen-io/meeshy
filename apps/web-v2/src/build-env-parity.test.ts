import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * **UNE VARIABLE DE CONSTRUCTION QUE PERSONNE NE FOURNIT EST UN INTERRUPTEUR
 * QUI N'EXISTE PAS** (#5929).
 *
 * `import.meta.env.VITE_*` est remplacé par Vite À LA CONSTRUCTION : une
 * variable posée au démarrage du conteneur n'atteint jamais le bundle. Le
 * `Dockerfile` le dit déjà pour `VITE_API_BASE`, dans un commentaire qui nomme
 * exactement le risque — et deux autres variables lisaient dans le vide.
 *
 * CE QUE ÇA A COÛTÉ, mesuré le 2026-09-10 sur le bundle SERVI par
 * `staging.meeshy.me` : l'environnement gravé était
 * `{ BASE_URL, DEV, MODE, PROD, SSR, VITE_API_BASE }` — sans `VITE_DATA_SOURCE`.
 * Or `config.ts` rend `=== 'gateway' ? 'gateway' : 'fixtures'`. **staging
 * servait donc la v3.1 sur des FIXTURES**, avec la bonne adresse de passerelle :
 * l'app AVAIT L'AIR branchée. Les conversations et les messages affichés étaient
 * Kwame Mensah et Amina Diallo, pas ceux du compte connecté.
 *
 * Le chemin réel existait pourtant : `api/conversations.ts` et `api/messages.ts`
 * retombent tous deux sur le transport HTTP dès que la source n'est pas
 * `fixtures`, et `scripts/check-gateway-build.mjs` PROUVE au navigateur qu'un
 * build `VITE_DATA_SOURCE=gateway` parle vraiment à la passerelle.
 *
 * > **Le mécanisme était écrit, testé, et jamais activé** — et son garde ne
 * > tournait lui-même dans aucune CI avant #5921. Deux couches de la même
 * > omission sur le même chemin.
 *
 * CE TÉMOIN NE RECOPIE AUCUNE LISTE : il lit les `VITE_*` que le CODE consomme
 * et exige que le `Dockerfile` les DÉCLARE. Une variable lue mais non déclarée
 * n'est pas réglable au déploiement — quelle que soit la valeur qu'on croit lui
 * donner.
 */

const V3 = dirname(fileURLToPath(import.meta.url)) + '/..';

/**
 * Les COMMENTAIRES sont ôtés avant de chercher — et ce témoin l'a appris de
 * lui-même : le doc-comment de `lib/build-flag.ts` cite `VITE_X` comme EXEMPLE,
 * et le témoin exigeait alors du `Dockerfile` qu'il déclare une variable qui
 * n'existe pas. Un témoin qui compte des MENTIONS au lieu de LECTURES rougit sur
 * la prose qui l'explique — même piège que son jumeau `gate-ci-parity`.
 */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Toute occurrence `VITE_XXX` dans les sources et la configuration de build. */
function variablesLues(): Set<string> {
  const vues = new Set<string>();
  const balayer = (dir: string): void => {
    for (const nom of readdirSync(dir)) {
      const chemin = join(dir, nom);
      if (statSync(chemin).isDirectory()) {
        balayer(chemin);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(nom)) continue;
      /* Les fichiers de TEST sont écartés : un témoin peut nommer une variable
         pour la falsifier (`{ VITE_DATA_SOURCE: 'gateway' }` dans un cas
         fabriqué) sans que le PRODUIT la lise. Les compter ferait exiger du
         `Dockerfile` qu'il déclare des variables qui n'existent que dans des
         fixtures — un rouge sur un produit sain. */
      if (/\.test\.tsx?$/.test(nom)) continue;
      for (const m of sansCommentaires(readFileSync(chemin, 'utf8')).matchAll(/\bVITE_[A-Z0-9_]+/g)) {
        vues.add(m[0]);
      }
    }
  };
  balayer(join(V3, 'src'));
  const config = sansCommentaires(readFileSync(join(V3, 'vite.config.ts'), 'utf8'));
  for (const m of config.matchAll(/\bVITE_[A-Z0-9_]+/g)) {
    vues.add(m[0]);
  }
  return vues;
}

/** Les `ARG VITE_*` que le `Dockerfile` déclare. */
function variablesDeclarees(): Set<string> {
  const df = readFileSync(join(V3, 'Dockerfile'), 'utf8');
  return new Set([...df.matchAll(/^ARG\s+(VITE_[A-Z0-9_]+)/gm)].map((m) => m[1]!));
}

describe('les variables de construction lues sont fournissables au déploiement', () => {
  test('l’inventaire n’est pas vide — sinon ce témoin ne garde rien', () => {
    expect(variablesLues().size).toBeGreaterThan(1);
  });

  test('TOUTE VITE_* lue par le code est déclarée en ARG dans le Dockerfile', () => {
    const lues = variablesLues();
    const declarees = variablesDeclarees();
    const muettes = [...lues].filter((v) => !declarees.has(v)).sort();
    expect(muettes).toEqual([]);
  });

  /**
   * LE SENS INVERSE : un `ARG` que plus personne ne lit est un réglage MORT.
   * Il survit aux déploiements, se recopie dans les workflows, et donne
   * l'illusion d'un levier — c'est la même famille que l'étape de CI qui lance
   * un garde retiré du composite (#5910).
   */
  test('aucun ARG VITE_* du Dockerfile n’est devenu illisible', () => {
    const lues = variablesLues();
    const morts = [...variablesDeclarees()].filter((v) => !lues.has(v)).sort();
    expect(morts).toEqual([]);
  });
});
