import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { attachmentUrlStore, postMediaUrlStore } from '../../../services/attachments/mediaUrlStores';

/**
 * LES DEUX MAGASINS PRISMA DU BALAYAGE (#7022) — et pourquoi ils vivent sous
 * `src/` plutôt que dans le script qui les emploie.
 *
 * `mediaUrlSweep.test.ts` dit, en tête, que « c'est `tsc` qui valide les deux
 * vraies requêtes ». C'était FAUX tant qu'elles vivaient dans le script, et
 * mesuré : `services/gateway/tsconfig.json` n'inclut que `src/**` et
 * `shared/**`, donc `npx tsc --noEmit` ne lit AUCUN des vingt fichiers de
 * `scripts/` — vérifié par `tsc --listFiles | grep -c normalize-media-urls`,
 * qui rend `0`. Les deux `select` n'étaient jugés par rien : ni par `tsc` (hors
 * programme), ni par un témoin (un faux Prisma accepte n'importe quelle forme
 * de requête). La division du travail que le doc-comment décrivait était juste ;
 * l'une des deux moitiés n'existait pas.
 *
 * CE QUE CE TÉMOIN MESURE est ce que `tsc` ne sait PAS dire : la PAGINATION.
 * Le curseur porte le dernier id rendu et la page suivante le reprend avec
 * `skip: 1` — stable sous les écritures du passage lui-même, là où un `skip`
 * numérique glisserait sous ses propres réécritures et sauterait des lignes.
 * C'est la forme des ARGUMENTS qu'on interroge, pas ce que Mongo en ferait.
 *
 * LE DOUBLE EST CASTÉ, ET C'EST LE POINT. Les magasins prennent les délégués de
 * PRISMA (`PrismaClient['messageAttachment']`) et non une interface écrite à la
 * main — sans quoi rien, dans `mediaUrlStores.ts`, ne rattacherait `fileUrl` à
 * une vraie colonne. Un délégué de papier ne peut donc entrer que par un cast
 * explicite : il atteste un COMPORTEMENT (quels arguments partent), jamais une
 * FORME (ça, c'est `tsc`, et le tableau de `mediaUrlStores.ts` dit exactement
 * ce qu'il attrape et le seul cas qu'il manque).
 */
describe('mediaUrlStores — #7022', () => {
  type Appel = Readonly<Record<string, unknown>>;

  type DéléguéDePapier = {
    readonly delegate: PrismaClient['messageAttachment'] & PrismaClient['postMedia'];
    readonly findMany: Appel[];
    readonly updates: Appel[];
  };

  function fauxDélégué(pages: readonly (readonly { id: string; fileUrl: string; thumbnailUrl: string | null }[])[]): DéléguéDePapier {
    const findMany: Appel[] = [];
    const updates: Appel[] = [];
    let page = 0;
    const papier = {
      findMany: async (args: Appel) => {
        findMany.push(args);
        const rendue = pages[page] ?? [];
        page += 1;
        return rendue;
      },
      update: async (args: Appel) => {
        updates.push(args);
      },
    };
    return { findMany, updates, delegate: papier as unknown as DéléguéDePapier['delegate'] };
  }

  const LIGNE = { id: '68f33afa8ae497b2054c84d7', fileUrl: '2026/09/u/a.jpg', thumbnailUrl: null };

  test('les deux magasins portent le NOM de leur collection — le compte du `--check` les sépare', () => {
    expect(attachmentUrlStore(fauxDélégué([]).delegate).name).toBe('MessageAttachment');
    expect(postMediaUrlStore(fauxDélégué([]).delegate).name).toBe('PostMedia');
  });

  test('la PREMIÈRE page ne porte aucun curseur, et ne demande que les trois colonnes utiles', async () => {
    const { delegate, findMany } = fauxDélégué([[LIGNE]]);

    await attachmentUrlStore(delegate).list(null);

    expect(findMany[0]).toEqual({
      select: { id: true, fileUrl: true, thumbnailUrl: true },
      orderBy: { id: 'asc' },
      take: expect.any(Number),
    });
  });

  test('la page SUIVANTE reprend au dernier id rendu et le SAUTE — jamais un `skip` numérique', async () => {
    const { delegate, findMany } = fauxDélégué([[LIGNE]]);

    await postMediaUrlStore(delegate).list(LIGNE.id);

    expect(findMany[0]).toMatchObject({
      cursor: { id: LIGNE.id },
      skip: 1,
      orderBy: { id: 'asc' },
    });
  });

  test("l'écriture vise UNE ligne par son id, et ne pose que les colonnes du correctif", async () => {
    const { delegate, updates } = fauxDélégué([]);

    await attachmentUrlStore(delegate).write(LIGNE.id, { fileUrl: '2026/09/u/a.jpg' });

    expect(updates).toEqual([{ where: { id: LIGNE.id }, data: { fileUrl: '2026/09/u/a.jpg' } }]);
  });

  test('les lignes rendues traversent TELLES QUELLES — un magasin ne décide de rien', async () => {
    const { delegate } = fauxDélégué([[LIGNE]]);

    expect(await attachmentUrlStore(delegate).list(null)).toEqual([LIGNE]);
  });
});
