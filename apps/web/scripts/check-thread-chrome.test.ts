import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * LA LECTURE DE LA LANGUE SERVIE ATTEND UN FAIT, JAMAIS UN DÉLAI (#9260).
 *
 * `check-thread-chrome.mjs` § 6 mesure que la langue choisie au composeur
 * descend jusque dans la bulle SERVIE. La lecture était gardée par un
 * `waitForTimeout(500)` ; le fil étant VIRTUALISÉ
 * (`check-thread-virtualization.mjs`, `MAX_CELLS = 60` sur 500 messages), la
 * rangée envoyée n'est pas montée à cet instant, et `rows[rows.length - 1]`
 * rend une rangée de FIXTURE — toutes en `fr`
 * (`src/lib/api/fixtures-catchup.ts`). Le pari produisait donc un FAUX ROUGE
 * qui accusait le produit quand c'était la charge de la machine.
 *
 * CE TÉMOIN NE DEMANDE PAS « ZÉRO DÉLAI », et c'est la moitié qui compte. Ce
 * fichier porte vingt-deux `waitForTimeout` LÉGITIMES : attendre une
 * TRANSITION (une opacité de chrome qui se stabilise après un geste) n'a aucun
 * fait à sonder, le délai EST l'instrument. Exiger zéro ici convertirait les
 * transitions par imitation et rendrait le gate plus lent sans le rendre plus
 * sûr — l'erreur symétrique de celle qu'on corrige. Le cliquet frère
 * (`lib/no-fixed-delays.test.ts`, #7054) peut exiger zéro parce qu'il garde le
 * gate des ÉTATS, dont toutes les lectures ont une condition ; celui-ci garde
 * UNE lecture nommée.
 *
 * Il assert donc deux choses, et deux seulement :
 *   1. la lecture passe par la SSOT `awaitCondition` (`lib/await-fact.mjs`) ;
 *   2. aucun délai ne subsiste ENTRE l'envoi et cette lecture.
 *
 * La seconde est celle qui tombe si quelqu'un remet un pari : la première
 * resterait verte si l'on ajoutait un `waitForTimeout` à côté de l'attente.
 */

const gatePath = fileURLToPath(new URL('./check-thread-chrome.mjs', import.meta.url));

const ENVOI = "await page.keyboard.press('Enter');";
const LECTURE = 'const servedInEnglish = await awaitCondition(page, () => {';

describe('le gate du chrome du fil attend la bulle servie (#9260)', () => {
  test('la lecture de la langue servie passe par la SSOT awaitCondition', async () => {
    const source = await readFile(gatePath, 'utf8');

    expect(source).toContain("import { awaitCondition } from './lib/await-fact.mjs';");
    expect(source).toContain(LECTURE);
  });

  test("aucun délai ne s'intercale entre l'envoi du message et cette lecture", async () => {
    const source = await readFile(gatePath, 'utf8');

    // Le § 6 est le seul endroit du fichier qui envoie un message au composeur
    // puis lit une langue : la borne de gauche est son `press('Enter')`, la
    // borne de droite l'attente elle-même. Les deux repères sont vérifiés
    // présents AVANT d'être employés comme bornes — un `indexOf` qui rend -1
    // ferait une tranche silencieusement fausse, et un témoin qui mesure une
    // tranche vide est vert sans rien attester.
    const envoi = source.lastIndexOf(ENVOI);
    const lecture = source.indexOf(LECTURE);
    expect(envoi).toBeGreaterThan(-1);
    expect(lecture).toBeGreaterThan(envoi);

    const entreLesDeux = source.slice(envoi + ENVOI.length, lecture);
    expect(entreLesDeux).not.toContain('page.waitForTimeout(');
  });
});
