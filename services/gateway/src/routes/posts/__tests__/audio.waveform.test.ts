import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/** `Sound.waveform` n'avait aucun écrivain : toute la bibliothèque servait un
 *  tableau vide. Cette garde ancre le câblage de l'upload manuel — le second
 *  chemin de création d'un `Sound`.
 *
 *  Garde de SOURCE et non test d'intégration : ce dépôt n'a aucun harnais
 *  Fastify pour cette route (son voisin `audio.duration.test.ts` lit lui aussi
 *  le texte du fichier). Les commentaires sont retirés, sans quoi une simple
 *  mention du nom en prose suffirait à faire passer la garde. */
describe("routes/posts/audio.ts — forme d'onde", () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'audio.ts'), 'utf-8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('test_audioRoute_readsWaveformField', () => {
    // Notation indifférente : ce qui compte est que le champ multipart soit LU.
    expect(code).toMatch(/data\.fields\[['"]waveform['"]\]|data\.fields\.waveform/);
    expect(code).toContain('parseWaveformField');
  });

  it('test_audioRoute_writesWaveformOnSoundCreate', () => {
    const start = code.indexOf('prisma.sound.create');
    expect(start).toBeGreaterThan(-1);
    // Fenêtre BORNÉE au seul appel de création, ancrée sur deux repères du
    // code : `slice(start)` courrait jusqu'à la fin du fichier — deux routes de
    // plus — et n'importe quel `waveform` ailleurs la satisferait.
    const createBlock = code.slice(start, code.indexOf('include: soundUploaderInclude', start));
    // Le RACCOURCI d'objet, pas un littéral : `waveform: []` écrit en dur
    // satisferait un `toContain('waveform')` tout en gravant le tableau vide
    // que cette tâche existe pour corriger.
    expect(createBlock).toMatch(/^\s*waveform,\s*$/m);
  });
});
