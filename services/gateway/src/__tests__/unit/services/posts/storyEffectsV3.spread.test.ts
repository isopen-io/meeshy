import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **Chaque branche d'OBJET du convertisseur RÉPAND, elle ne recompose pas**
 * (#4986, second volet).
 *
 * ## Pourquoi cette garde plutôt que celle qui était prévue
 *
 * L'issue annonçait de tenir la RÉPARTITION « champs exercés / champs aveugles »
 * du golden. En mesurant, la prémisse a bougé : depuis #4905 les cinq branches
 * RÉPANDENT (`...rest`), donc un champ ajouté à un modèle voyage désormais SANS
 * que le golden ait à l'exercer. La couverture du golden ne porte plus le même
 * risque.
 *
 * Ce qui immunise n'est pas le compte, c'est la FORME — et c'est elle qui doit
 * être gardée :
 *
 * > **Un inventaire humain se maintient à la main ; un `rest` se maintient tout
 * > seul.** Devant une charge opaque par contrat, la seule discipline qui tient
 * > à l'échelle est de ne pas énumérer.
 *
 * Les huit pertes silencieuses de la v3 sont TOUTES tombées sur une branche qui
 * recomposait ; la seule qui répandait portait ses 36 champs sans que personne
 * n'y pense. Ce témoin interdit le retour en arrière.
 *
 * ## Ce qu'il ne garde PAS, et pourquoi
 *
 * La branche `blob.stickers` (legacy) écrit `o.payload = { emoji }` sans
 * répandre — et c'est CORRECT : sa source est un tableau de CHAÎNES, pas
 * d'objets. Il n'y a rien à répandre. Une garde qui l'exigerait quand même
 * demanderait de réparer ce qui n'est pas cassé.
 *
 * La règle porte donc sur les branches qui lisent un OBJET, celles que
 * `asArray(blob.<collection>)` ouvre.
 */
describe('storyEffectsV3 — la forme qui immunise', () => {
  const source = readFileSync(
    join(__dirname, '../../../../services/posts/storyEffectsV3.ts'),
    'utf8',
  );

  /** Les cinq collections d'OBJETS que le convertisseur traduit. */
  const collectionsDObjets = [
    'textObjects',
    'mediaObjects',
    'stickerObjects',
    'locationObjects',
    'audioPlayerObjects',
  ] as const;

  it('voit vraiment le convertisseur', () => {
    // Un balayage au chemin faux est vert pour toujours.
    expect(source.length).toBeGreaterThan(5_000);
    expect(source).toContain('baseObject');
  });

  it.each(collectionsDObjets)('la branche %s répand plutôt que de recomposer', (collection) => {
    const debut = source.indexOf(`asArray(blob.${collection})`);
    expect(debut).toBeGreaterThan(-1);

    // La branche court jusqu'à la collection suivante, ou la fin.
    const suivantes = collectionsDObjets
      .map((c) => source.indexOf(`asArray(blob.${c})`))
      .filter((i) => i > debut);
    const fin = suivantes.length > 0 ? Math.min(...suivantes) : source.length;
    const branche = source.slice(debut, fin);

    expect(branche).toContain('...rest');
  });

  /**
   * **Le témoin qui prouve que la garde MORD.** Sans lui, une règle qui ne
   * matcherait plus rien passerait pour une règle respectée — la façon dont une
   * garde de source meurt en silence.
   */
  it('reconnaîtrait une branche qui recompose', () => {
    const brancheFictive = `for (const x of asArray(blob.textObjects)) {
      const o = baseObject(x, 'text', 'fg', z++);
      o.payload = { a: x.a, b: x.b };
    }`;
    expect(brancheFictive).not.toContain('...rest');
  });
});
