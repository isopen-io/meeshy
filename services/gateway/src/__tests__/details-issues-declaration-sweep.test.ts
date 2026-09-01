/**
 * Le CLIQUET de #4648, critère 4 — plus aucun site ne sert `details: { issues }`
 * sans déclarer la forme de ces issues.
 *
 * Le lot #4487 avait fermé quatre sites ; le cinquième (`routes/posts/core.ts`)
 * a survécu parce qu'il n'appelait pas `issuesServies` — un balayage nommé
 * d'après le helper partagé rend les sites DÉJÀ conformes et manque exactement
 * ceux qu'on cherche. Le balayage part donc de la donnée SERVIE ; sa mécanique
 * et ses limites sont documentées dans `details-issues-declaration-sweep.ts`.
 *
 * Trois choses se prouvent ici, et aucune n'est décorative :
 *
 * 1. **L'inventaire est VIDE** — il n'y a pas de service non déclaré légitime à
 *    porter, la forme juste étant toujours la même constante partagée.
 * 2. **Le balayage n'est pas VACUEUX** — un balayage qui ne trouve aucun site
 *    passerait au vert pour la pire des raisons (§ « un témoin qui ne peut pas
 *    tomber n'est pas un témoin »). La borne est basse et NOMMÉE : les cinq
 *    sites connus du 2026-09-01.
 * 3. **Il TOMBE sous la mutation qu'il nomme** — un site conforme dont on
 *    retire la déclaration est nommé. La mutation s'applique à une COPIE
 *    verbatim d'un site réel du dépôt, écrite dans un répertoire temporaire :
 *    le fichier de production n'est pas touché, et la preuve reste rejouable à
 *    chaque exécution plutôt que d'être une phrase dans un journal.
 *
 * @jest-environment node
 */

import { describe, it, expect, afterAll } from '@jest/globals';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  balayerServicesDIssues,
  sitesNonDeclares,
} from './details-issues-declaration-sweep';

const SRC = join(__dirname, '..');

/** Les cinq sites qui SERVENT, mesurés sur `dev` le 2026-09-01. */
const SITES_SERVANTS_CONNUS = [
  'routes/me/consents.ts',
  'routes/me/preferences/preference-router-factory.ts',
  'routes/me/preferences/unified-routes.ts',
  'routes/posts/core.ts',
].sort();

const bacs: string[] = [];

const bacAvec = (fichiers: Readonly<Record<string, string>>): string => {
  const racine = mkdtempSync(join(tmpdir(), 'issues-declaration-'));
  bacs.push(racine);
  for (const [nom, contenu] of Object.entries(fichiers)) {
    const chemin = join(racine, nom);
    mkdirSync(join(chemin, '..'), { recursive: true });
    writeFileSync(chemin, contenu, 'utf8');
  }
  return racine;
};

afterAll(() => {
  for (const bac of bacs) rmSync(bac, { recursive: true, force: true });
});

describe('balayage : servir `details: { issues }` oblige à déclarer sa forme (#4648)', () => {
  it("voit bien les sources du gateway — un balayage aveugle passerait au vert", () => {
    expect(balayerServicesDIssues(SRC).length).toBeGreaterThan(0);
  });

  it('trouve les sites SERVANTS connus — la borne de non-vacuité', () => {
    const servants = balayerServicesDIssues(SRC).map((site) => site.fichier);

    // `preference-router-factory.ts` sert DEUX fois : le balayage rend un site
    // par FICHIER, pas par appel.
    expect(servants.length).toBeGreaterThanOrEqual(SITES_SERVANTS_CONNUS.length);
    for (const connu of SITES_SERVANTS_CONNUS) {
      expect(servants).toContain(connu);
    }
  });

  it("ne nomme AUCUN fichier qui ne sert que la PHRASE — les commentaires sont dépouillés", () => {
    // `utils/response.ts` porte « `details: { issues }` — étalé à la RACINE,
    // non déclaré au schéma » dans le doc-comment de `sendBadRequest`. Sans
    // dépouillement, il serait nommé, et il ne sert rien.
    expect(readFileSync(join(SRC, 'utils/response.ts'), 'utf8')).toContain('details: { issues }');
    expect(balayerServicesDIssues(SRC).map((site) => site.fichier)).not.toContain('utils/response.ts');
  });

  it("n'a AUCUN site qui sert sans déclarer", () => {
    expect(sitesNonDeclares(SRC)).toEqual([]);
  });

  it('accepte la déclaration EN LIGNE comme celle du voisin importé, et refuse le silence', () => {
    const racine = bacAvec({
      'en-ligne.ts': [
        "const s = { properties: { issues: { type: 'array', items: zodIssueSchema } } };",
        "sendBadRequest(reply, 'X', { details: { issues: issuesServies(e.issues) } });",
      ].join('\n'),
      'schema-voisin.ts': "export const s = { properties: { issues: { items: zodIssueSchema } } };",
      'extrait.ts': [
        "import { s } from './schema-voisin';",
        "sendBadRequest(reply, 'X', { details: { issues: e.issues.slice(0, 5) } });",
      ].join('\n'),
      'muet.ts': "sendBadRequest(reply, 'X', { details: { issues: e.issues.slice(0, 5) } });",
      'sans-issues.ts': "sendBadRequest(reply, 'X', { details: { mediaIds: ids } });",
    });

    expect(balayerServicesDIssues(racine)).toEqual([
      { fichier: 'en-ligne.ts', declare: true },
      { fichier: 'extrait.ts', declare: true },
      { fichier: 'muet.ts', declare: false },
    ]);
  });

  it("ne se laisse pas déclarer conforme par le seul IMPORT de `zodIssueSchema`", () => {
    // Le piège exact que le balayage doit refuser : `core.ts` importe
    // `issuesServies` depuis le module qui DÉFINIT `zodIssueSchema`. Un test de
    // présence de l'identifiant, ou de son import, rendrait ce fichier conforme
    // sans qu'aucun schéma n'existe.
    const racine = bacAvec({
      'utils/zod-issue-schema.ts': [
        'export const zodIssueSchema = { type: 12 };',
        'export function issuesServies(x) { return x; }',
      ].join('\n'),
      'route.ts': [
        "import { issuesServies } from './utils/zod-issue-schema';",
        "sendBadRequest(reply, 'X', { details: { issues: issuesServies(e.issues) } });",
      ].join('\n'),
    });

    expect(sitesNonDeclares(racine)).toEqual(['route.ts']);
  });

  it('TOMBE quand on retire la déclaration d’un site conforme RÉEL', () => {
    const conforme = readFileSync(join(SRC, 'routes/me/consents.ts'), 'utf8');
    expect(conforme).toMatch(/\bitems:\s*zodIssueSchema\b/);

    const mutant = conforme.replace(/\bitems:\s*zodIssueSchema\b/g, "items: { type: 'object' }");
    const racine = bacAvec({ 'consents.ts': mutant });

    expect(sitesNonDeclares(racine)).toEqual(['consents.ts']);
  });
});
