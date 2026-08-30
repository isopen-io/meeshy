import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * Les types signalables vivent à UN endroit — celui qui valide (#4155).
 *
 * iOS envoie « post » et « story » depuis de vrais boutons
 * (`ReportService.swift`) ; l'enum ne les acceptait pas, et ces appels
 * partaient en 400 systématique. Ce garde tenait cette liste — mais il la
 * cherchait dans `routes/admin/reports.ts`, où le schéma de création ne vit
 * plus : signaler est un geste ORDINAIRE et a déménagé sous `routes/reports/`.
 *
 * > **Un garde de source qui pointe un fichier dont la règle est partie ne
 * > protège plus rien.** Celui-ci a rougi au déménagement, ce qui est le bon
 * > comportement ; il est ici RÉORIENTÉ, pas supprimé.
 *
 * Il tient désormais DEUX choses, et la seconde est la plus importante : que
 * `routes/admin/reports.ts` ne redéclare PAS sa propre liste. Une seconde
 * copie n'échouerait aucun témoin le jour où l'une des deux bouge.
 */
describe('les types signalables — un site, et un seul', () => {
  const racine = path.join(__dirname, '..', '..');
  const siteUnique = fs.readFileSync(path.join(racine, 'reports', 'index.ts'), 'utf-8');
  const adaptateurAdmin = fs.readFileSync(path.join(racine, 'admin', 'reports.ts'), 'utf-8');

  const ligne = siteUnique.split('\n').find((l) => l.includes('reportedType: z.enum'));

  it.each(['message', 'user', 'conversation', 'community', 'post', 'story', 'sound'])(
    'test_createReportSchema_accepts_%s',
    (type) => {
      expect(ligne).toBeDefined();
      expect(ligne).toContain(`'${type}'`);
    }
  );

  it("l'adaptateur `/admin/reports` ne redéclare aucune liste de types", () => {
    // Il DÉLÈGUE — il ne recopie pas. Une copie porterait sa propre loi, et
    // c'est précisément la forme du défaut que ce lot supprime.
    expect(adaptateurAdmin).not.toContain('reportedType: z.enum');
  });
});
