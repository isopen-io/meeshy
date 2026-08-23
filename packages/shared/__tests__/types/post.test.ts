/**
 * `post.ts` est presque entièrement du type effacé à la compilation — et
 * « presque » est ce que ce témoin garde.
 *
 * Il a longtemps affirmé que le module n'exporte AUCUNE valeur d'exécution.
 * C'était vrai, et ça ne l'est plus : `DEFAULT_PUBLICATION_VISIBILITY` a été
 * ajoutée DÉLIBÉRÉMENT comme source unique du défaut de visibilité — sa doc dit
 * exactement pourquoi (« un défaut recopié en littéral est exactement ce qui
 * avait laissé les stories web à FRIENDS pendant que les posts naissaient
 * publics »), et six modules web l'importent.
 *
 * Le témoin n'est donc pas SUPPRIMÉ, il est resserré sur l'inventaire : la
 * surface d'exécution du module est EXACTEMENT cette constante, et sa valeur
 * est `'PUBLIC'`. Ce qu'il gardait à l'origine — qu'aucune valeur ne se glisse
 * par accident dans un module de types, où un import de type deviendrait un
 * import de code — reste gardé : toute export d'exécution NEUVE le fait tomber,
 * et sa réparation est de décider si elle a le droit d'exister, jamais
 * d'allonger la liste sans raison écrite.
 */
import { describe, it, expect } from 'vitest';

/** L'inventaire des valeurs d'exécution que `types/post.ts` a le droit d'exporter. */
const ALLOWED_RUNTIME_EXPORTS = ['DEFAULT_PUBLICATION_VISIBILITY'] as const;

describe('post types module', () => {
  it('loads without error and exports only its declared runtime surface', async () => {
    // Dynamic import to catch any circular-dependency or parse errors at run time
    const mod = await import('../../types/post.js');
    expect(mod).toBeDefined();
    expect(Object.keys(mod).sort()).toEqual([...ALLOWED_RUNTIME_EXPORTS].sort());
  });

  // La constante n'a de valeur que si elle EST le défaut que les clients
  // recopiaient : un témoin sur sa seule présence laisserait passer un
  // changement de valeur silencieux, qui est précisément le défaut qu'elle
  // existe pour empêcher.
  it('publishes PUBLIC as the single source of the default publication visibility', async () => {
    const { DEFAULT_PUBLICATION_VISIBILITY } = await import('../../types/post.js');
    expect(DEFAULT_PUBLICATION_VISIBILITY).toBe('PUBLIC');
  });
});
