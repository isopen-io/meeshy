import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RACINE_DES_SUITES = join(__dirname, '..', 'e2e', 'visual');

/**
 * LE MOTIF QUI A COÛTÉ HUIT CI ROUGES (#5139) — un témoin qui observe la seule
 * PRÉSENCE de `data-participation="<nom>"` (posée par le serveur dès le
 * premier pixel, avant que le module n'ait câblé quoi que ce soit) puis
 * complète par un `waitForTimeout` : un pari sur la vitesse du runner, tenu en
 * local et perdu en CI (run 33911055635, `v3-composer.spec.ts`).
 *
 * Le correctif est `attendsLeModuleArme` (`e2e/visual/lib/attente-de-module.ts`),
 * qui observe `data-arme="1"` — posé par `signaleArme` (`lib/realtime/arme.ts`)
 * une fois les écouteurs du module réellement câblés. Ce témoin lit le
 * RÉPERTOIRE plutôt qu'une liste de fichiers : un neuvième spec qui
 * réintroduirait le motif rougirait ici sans qu'il faille l'énumérer d'avance
 * (même réparation que `playwright.config.ts` › `SUITES_QUI_IMPORTENT_LA_LOI`).
 */
const MOTIF_DE_LA_SUBSTITUTION = /data-participation[\s\S]{0,120}\n\s*await page\.waitForTimeout\(/;

const SPECS: readonly string[] = readdirSync(RACINE_DES_SUITES).filter((fichier) => fichier.endsWith('.spec.ts'));

describe("aucun témoin e2e n'attend un module de participation par une minuterie (#5139)", () => {
  it('la liste des suites scannées est non vide — un répertoire vide ferait passer ce gate par omission', () => {
    expect(SPECS.length).toBeGreaterThan(10);
  });

  SPECS.forEach((fichier) => {
    it(`${fichier} n'enchaîne pas waitForFunction(data-participation) puis waitForTimeout`, () => {
      const source = readFileSync(join(RACINE_DES_SUITES, fichier), 'utf8');
      expect(source).not.toMatch(MOTIF_DE_LA_SUBSTITUTION);
    });
  });
});
