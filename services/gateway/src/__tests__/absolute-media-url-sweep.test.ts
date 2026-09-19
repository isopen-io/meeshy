/**
 * LE CLIQUET DE #7022 — aucune adresse de média ne peut PLUS se composer avec
 * un hôte de déploiement.
 *
 * La base porte 2784 adresses absolues (1600 `fileUrl` + 1184 `thumbnailUrl`,
 * mesurées le 2026-09-18 sur `meeshy-database`). Elles ont cessé d'entrer le
 * 2026-09-08 — non par une garde, mais parce que le dernier appelant a disparu
 * au fil des lots. Rien n'empêchait le prochain, et c'est ce que ce cliquet
 * ferme.
 *
 * Quatre choses se prouvent ici, et aucune n'est décorative :
 *
 * 1. **L'inventaire des appels est VIDE** — aucun site de production ne compose
 *    une adresse absolue de média.
 * 2. **Le balayage n'est pas VACUEUX** — un balayage qui ne saurait rien
 *    trouver passerait au vert pour la pire des raisons. Il RETROUVE les deux
 *    composeurs là où ils sont définis dès qu'on lève leur exemption.
 * 3. **Il TOMBE sous la mutation qu'il nomme** — un appel réintroduit dans une
 *    COPIE verbatim du dépôt est nommé, avec son fichier et sa ligne. Le
 *    fichier de production n'est pas touché : la preuve reste rejouable.
 * 4. **L'exemption PORTE quelque chose** — retirée, le balayage nomme le
 *    fichier qu'elle couvre, et pour la raison qu'elle écrit.
 *
 * @jest-environment node
 */
import { afterAll, describe, expect, it } from '@jest/globals';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { balayerAppelsDAbsolu, COMPOSEURS_D_ABSOLU, EXEMPTIONS } from './helpers/absolute-media-url-sweep';

const SRC = join(__dirname, '..');

const temporaires: string[] = [];

function dépôtJetable(): string {
  const racine = mkdtempSync(join(tmpdir(), 'absolute-media-url-'));
  temporaires.push(racine);
  return racine;
}

afterAll(() => {
  for (const racine of temporaires) rmSync(racine, { recursive: true, force: true });
});

describe('cliquet #7022 — aucune adresse absolue de média ne se compose', () => {
  it("aucun site de production n'appelle un composeur d'absolu", () => {
    const appels = balayerAppelsDAbsolu(SRC);

    expect(
      appels.map((appel) => `${appel.fichier}:${appel.ligne}  ${appel.composeur}  ${appel.texte}`),
    ).toEqual([]);
  });

  it('les deux composeurs gardés sont bien ceux qui posent un hôte', () => {
    expect([...COMPOSEURS_D_ABSOLU]).toEqual(['getAttachmentUrl', 'buildFullUrl']);
  });

  it("le balayage N'EST PAS VACUEUX — il nomme un appel réintroduit", () => {
    const racine = dépôtJetable();
    mkdirSync(join(racine, 'routes'), { recursive: true });
    writeFileSync(
      join(racine, 'routes', 'regression.ts'),
      ['export function persister(processor: UploadProcessor, chemin: string) {', '  return processor.getAttachmentUrl(chemin);', '}', ''].join(
        '\n',
      ),
      'utf8',
    );

    const appels = balayerAppelsDAbsolu(racine);

    expect(appels).toHaveLength(1);
    expect(appels[0]?.fichier).toBe('routes/regression.ts');
    expect(appels[0]?.composeur).toBe('getAttachmentUrl');
    expect(appels[0]?.ligne).toBe(2);
  });

  /**
   * LE BALAYAGE ERRE DU CÔTÉ QUI ACCUSE, ET C'EST VOULU. Une SIGNATURE de
   * méthode dans un type littéral a la même forme qu'un appel, et le cliquet la
   * nomme. Ce n'est pas un défaut à corriger : DÉCLARER le composeur dans un
   * port, c'est se donner le moyen de l'appeler — ce que ce cliquet garde. Un
   * balayage qui trancherait entre les deux demanderait un analyseur
   * syntaxique, et se tromperait du côté qui LAISSE PASSER.
   *
   * Ce témoin fige ce choix pour que le prochain lecteur ne le prenne pas pour
   * un bug et n'affaiblisse pas le cliquet en « corrigeant » ce faux positif.
   */
  it("une SIGNATURE dans un type compte aussi — le cliquet se trompe du côté qui accuse", () => {
    const racine = dépôtJetable();
    writeFileSync(join(racine, 'port.ts'), 'export type P = { getAttachmentUrl(p: string): string };\n', 'utf8');

    expect(balayerAppelsDAbsolu(racine)).toHaveLength(1);
  });

  it("une MENTION en commentaire n'est pas un appel — le cliquet n'accuse pas la prose", () => {
    const racine = dépôtJetable();
    writeFileSync(
      join(racine, 'note.ts'),
      ['/**', ' * `getAttachmentUrl(chemin)` pose `publicUrl` devant la route.', ' */', '// buildFullUrl(x) est mort', 'export const rien = 1;', ''].join(
        '\n',
      ),
      'utf8',
    );

    expect(balayerAppelsDAbsolu(racine)).toEqual([]);
  });

  it("les tests ne sont pas balayés — ils EXERCENT les composeurs, c'est leur rôle", () => {
    const racine = dépôtJetable();
    mkdirSync(join(racine, '__tests__'), { recursive: true });
    writeFileSync(join(racine, '__tests__', 'x.test.ts'), 'p.getAttachmentUrl("f.jpg");\n', 'utf8');

    expect(balayerAppelsDAbsolu(racine)).toEqual([]);
  });

  it("L'EXEMPTION PORTE QUELQUE CHOSE — levée, le balayage nomme le fichier qu'elle couvre", () => {
    const racine = dépôtJetable();
    for (const exemption of EXEMPTIONS) {
      const dossier = join(racine, 'services', 'attachments');
      mkdirSync(dossier, { recursive: true });
      const nom = exemption.fichier.split('/').pop() ?? 'x.ts';
      writeFileSync(join(dossier, nom), '  return this.uploadProcessor.buildFullUrl(relativePath);\n', 'utf8');
    }

    // Le balayage RÉEL les exempte…
    expect(balayerAppelsDAbsolu(racine)).toEqual([]);

    // …et le même contenu, sous un autre nom, est bien vu : l'exemption
    // couvre un fichier PRÉCIS, pas un motif de code.
    const nu = dépôtJetable();
    mkdirSync(join(nu, 'services', 'attachments'), { recursive: true });
    writeFileSync(join(nu, 'services', 'attachments', 'AutreService.ts'), '  return this.uploadProcessor.buildFullUrl(relativePath);\n', 'utf8');

    expect(balayerAppelsDAbsolu(nu)).toHaveLength(1);
  });

  it('chaque exemption écrit sa raison', () => {
    for (const exemption of EXEMPTIONS) {
      expect(exemption.raison.length).toBeGreaterThan(20);
    }
  });
});
