/**
 * Aucun gabarit d'e-mail ne survit sans appelant de production (#4500, suite de #4255).
 *
 * `EmailService` portait **trois** méthodes `send*Email` sur quatorze qu'aucun
 * code de production n'appelait : `sendFriendRequestEmail`,
 * `sendFriendAcceptedEmail`, `sendUsernameReminderEmail`. Chacune composait un
 * gabarit HTML complet, traduit en six langues, avec ses tests — du travail
 * fini, entretenu, et jamais envoyé à personne.
 *
 * ## Pourquoi une garde, et pas seulement un nettoyage
 *
 * #4255 nommait UN site mort. Le balayage de la FAMILLE en a rendu trois. Une
 * issue qui nomme un site porte deux affirmations : « ce site est mort »
 * (vérifiable) et « c'est LE site mort » (presque jamais vérifiée). Cette garde
 * transforme la seconde en propriété tenue.
 *
 * Un gabarit non exercé n'est pas inerte : il dérive. Il est relu, traduit,
 * corrigé, cité en revue — et il coûte à chaque passage, pour un envoi qui
 * n'arrive jamais.
 *
 * ## Ce que la garde mesure exactement
 *
 * Pour chaque `async send<X>Email(` déclarée dans `EmailService.ts`, elle exige
 * au moins un `.send<X>Email(` HORS des tests et hors du fichier lui-même. Elle
 * ne prouve pas que l'appel s'exécute — un appel derrière un drapeau mort
 * passerait. Elle ferme le cas grossier, qui est celui qu'on a rencontré trois
 * fois.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const RACINE_DEPOT = join(__dirname, '../../../../..');
const SERVICE = join(__dirname, '../../services/EmailService.ts');

function methodesDeclarees(): string[] {
  const source = readFileSync(SERVICE, 'utf8');
  return [...source.matchAll(/async (send[A-Za-z]+Email)\(/g)].map((m) => m[1]);
}

/**
 * Les fichiers qui appellent chaque `.send<X>Email(`, hors tests et hors
 * `EmailService.ts`, en UN seul `git grep` borné dans le temps. Un `git grep`
 * par méthode coûtait quinze secondes en local et figeait la tranche de CI
 * jusqu'à son délai (2026-10-27) : la garde rougit désormais au lieu de pendre.
 */
function appelantsParMethode(): ReadonlyMap<string, ReadonlySet<string>> {
  let sortie = '';
  try {
    sortie = execFileSync(
      'git',
      ['grep', '-o', '-E', '\\.send[A-Za-z]+Email\\(', '--', 'services', 'apps', 'packages'],
      { cwd: RACINE_DEPOT, encoding: 'utf8', timeout: 60_000, maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (erreur) {
    if ((erreur as { status?: number }).status === 1) return new Map(); // `git grep` sort en 1 quand il ne trouve rien
    throw erreur;
  }
  const appelants = new Map<string, Set<string>>();
  for (const ligne of sortie.split('\n').filter(Boolean)) {
    const separateur = ligne.lastIndexOf(':.');
    const fichier = ligne.slice(0, separateur);
    if (fichier.includes('__tests__') || fichier.endsWith('EmailService.ts')) continue;
    const methode = ligne.slice(separateur + 2, -1);
    appelants.set(methode, (appelants.get(methode) ?? new Set<string>()).add(fichier));
  }
  return appelants;
}

function appelantsDeProduction(methode: string): string[] {
  return [...(appelantsParMethode().get(methode) ?? [])];
}

describe('Aucun gabarit d\'e-mail sans appelant de production (#4500)', () => {
  const methodes = methodesDeclarees();

  it('balaie réellement les méthodes — une liste vide passerait au vert sans rien mesurer', () => {
    expect(methodes.length).toBeGreaterThan(8);
    // Témoin de balayage : une méthode dont on SAIT qu'elle est appelée. Sans
    // lui, un `git grep` cassé rendrait « zéro appelant » partout et cette
    // garde rougirait pour la mauvaise raison — ou, si on l'inversait, se
    // tairait pour la mauvaise raison.
    expect(appelantsDeProduction('sendPasswordResetEmail').length).toBeGreaterThan(0);
  });

  it('chaque méthode déclarée a au moins un appelant hors tests', () => {
    const appelants = appelantsParMethode();
    const orphelines = methodes.filter((m) => (appelants.get(m)?.size ?? 0) === 0);
    expect(orphelines).toEqual([]);
  });
});
