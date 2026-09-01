/**
 * @jest-environment node
 *
 * Les témoins de `applyMediaText` — le corps partagé par `PostService.applyMediaAlt`
 * et `PostService.applyMediaCaption` (#4714).
 *
 * ## Pourquoi ils vivent ICI et plus dans `__tests__/unit/PostService.test.ts`
 *
 * La fonction a quitté la classe : elle ne touchait pas `this`, et sa seule
 * entrée est ses cinq paramètres. Un témoin qui l'exerçait via
 * `service.createPost` avait donc besoin de tout le harnais de `PostService`
 * (Prisma complet, `MediaService`, `PostReactionService`, la fabrique de post)
 * pour observer un `updateMany` dont l'entrée réelle tient en une carte
 * `id → texte`. Ici, la surface de montage est `{ postMedia: { updateMany } }`.
 *
 * **Ce que ces témoins ne prouvent PAS, et où c'est prouvé.** Ils n'attestent
 * pas que `createPost` / `updatePost` passent BIEN par cette fonction — c'est
 * le rôle des témoins restés dans `__tests__/unit/PostService.test.ts`, qui
 * traversent `service.createPost` et observent la forme exacte d'`updateMany`
 * qu'elle seule produit, dont un qui pousse une charge `<script>` de bout en
 * bout. Les deux moitiés se tiennent : le câblage là-bas, la règle ici.
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { applyMediaText } from '../mediaText';

type UpdateManyArgs = {
  readonly where: { readonly id: string; readonly postId: string };
  readonly data: Record<string, string | null>;
};

/**
 * Le double n'imite QUE ce que la fonction appelle. Un `updateMany` qui rend
 * `{ count }` — la forme réelle de Prisma — et qui garde ses arguments : c'est
 * sur eux, jamais sur un retour, que porte tout ce qui suit.
 */
function recordingClient() {
  const calls: UpdateManyArgs[] = [];
  const client = {
    postMedia: {
      updateMany: (args: UpdateManyArgs) => {
        calls.push(args);
        return Promise.resolve({ count: 1 });
      },
    },
  } as unknown as Pick<PrismaClient, 'postMedia'>;
  return { calls, client };
}

describe('applyMediaText — assainissement (#4714)', () => {
  // `content` est assaini à TROIS sites de la route (`routes/posts/core.ts`) ;
  // `mediaAlt` et `mediaCaption` ne l'étaient à AUCUN — le texte partait brut de
  // `parsed.data` jusqu'à `postMedia.updateMany`.
  //
  // Le plus troublant n'était pas l'absence de la garde mais sa PRÉSENCE :
  // `sanitizeMediaCaptions` vivait dans `core.ts`, son doc-comment citait #4055,
  // et aucune ligne du dépôt ne l'appelait. Une garde écrite puis jamais câblée
  // ne se signale nulle part — elle compile, elle se relit bien, et elle donne à
  // qui la croise l'impression que le champ est gardé.

  it('assainit la légende avant qu\'elle atteigne la base', async () => {
    const { calls, client } = recordingClient();

    await applyMediaText(
      'caption',
      'post-1',
      ['media-1'],
      { 'media-1': 'Coucher de soleil <script>alert(1)</script>' },
      client,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].data.caption).not.toContain('<script>');
    expect(calls[0].data.caption).toContain('Coucher de soleil');
  });

  // Les deux colonnes partagent CE corps, donc elles partagent son
  // assainissement — c'est toute la raison de l'extraction, et le témoin qui la
  // tient. Une seconde règle posée à la route n'aurait couvert que `caption`.
  it('assainit le texte alternatif aussi — les deux colonnes partagent une écriture', async () => {
    const { calls, client } = recordingClient();

    await applyMediaText(
      'alt',
      'post-1',
      ['media-1'],
      { 'media-1': '<img src=x onerror=alert(1)>un chat' },
      client,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].data.alt).not.toContain('onerror');
    expect(calls[0].data.alt).toContain('un chat');
  });

  // Un texte qui n'est QUE du balisage devient vide, donc `null` — la même
  // phrase que la chaîne blanche : « il n'y a pas de légende ». Sans ce témoin,
  // l'assainissement pourrait écrire `''`, une valeur que la lecture rend comme
  // une légende présente et vide.
  it('efface la colonne quand l\'assainissement ne laisse rien', async () => {
    const { calls, client } = recordingClient();

    await applyMediaText('caption', 'post-1', ['media-1'], { 'media-1': '<script>x</script>' }, client);

    expect(calls[0].data.caption).toBeNull();
  });
});

describe('applyMediaText — normalisation du vide', () => {
  // Déplacés depuis `__tests__/unit/PostService.test.ts` : « une chaîne blanche
  // efface » est une propriété de CETTE fonction, pas une décision de
  // `createPost`. La tester au niveau de la fonction la rend indépendante du
  // harnais du service, sans rien perdre de ce qu'elle affirmait.
  it('efface alt (null) quand le client envoie une chaîne blanche', async () => {
    const { calls, client } = recordingClient();

    await applyMediaText('alt', 'post-1', ['media-1'], { 'media-1': '   ' }, client);

    expect(calls).toEqual([{ where: { id: 'media-1', postId: 'post-1' }, data: { alt: null } }]);
  });

  it('efface caption (null) quand le client envoie une chaîne blanche', async () => {
    const { calls, client } = recordingClient();

    await applyMediaText('caption', 'post-1', ['media-1'], { 'media-1': '   ' }, client);

    expect(calls).toEqual([{ where: { id: 'media-1', postId: 'post-1' }, data: { caption: null } }]);
  });
});

describe('applyMediaText — les deux gardes', () => {
  // Garde 1 : la carte est filtrée aux clés présentes dans `requestedMediaIds`.
  // Un id absent de la carte de la requête n'est pas une permission d'écrire
  // ailleurs — il est ignoré, jamais interprété.
  it('n\'écrit que pour les ids présents dans requestedMediaIds', async () => {
    const { calls, client } = recordingClient();

    await applyMediaText(
      'caption',
      'post-1',
      ['media-1', 'media-2'],
      { 'media-1': 'Coucher de soleil à Dakar', 'media-foreign': 'jamais demandé' },
      client,
    );

    expect(calls).toEqual([
      { where: { id: 'media-1', postId: 'post-1' }, data: { caption: 'Coucher de soleil à Dakar' } },
    ]);
  });

  // Garde 2 : le `where` porte `postId` — déjà réécrit par le claim qui précède
  // l'appel. Un id dont le claim a échoué (propriété refusée) garde son ancien
  // `postId`, et cette clause ne le trouve pas. Le témoin assert la CLAUSE, la
  // seule chose que la fonction contrôle.
  it('borne chaque écriture au postId courant, jamais au seul id de média', async () => {
    const { calls, client } = recordingClient();

    await applyMediaText('alt', 'post-42', ['m-1', 'm-2'], { 'm-1': 'un', 'm-2': 'deux' }, client);

    expect(calls.map((c) => c.where)).toEqual([
      { id: 'm-1', postId: 'post-42' },
      { id: 'm-2', postId: 'post-42' },
    ]);
  });
});

describe('applyMediaText — le silence', () => {
  // La clé absente veut dire « je ne dis rien des légendes ». Fabriquer une
  // écriture dirait « aucune », ce qui n'est pas la même phrase.
  it('ne touche à rien quand la carte de textes est absente', async () => {
    const { calls, client } = recordingClient();

    await applyMediaText('caption', 'post-1', ['media-1'], undefined, client);

    expect(calls).toEqual([]);
  });

  it('ne touche à rien quand aucun média n\'est demandé', async () => {
    const { calls, client } = recordingClient();

    await applyMediaText('caption', 'post-1', [], { 'media-1': 'une légende' }, client);
    await applyMediaText('caption', 'post-1', undefined, { 'media-1': 'une légende' }, client);

    expect(calls).toEqual([]);
  });

  it('ne touche à rien quand aucune clé de la carte n\'a été demandée', async () => {
    const { calls, client } = recordingClient();

    await applyMediaText('alt', 'post-1', ['media-1'], { 'media-foreign': 'jamais demandé' }, client);

    expect(calls).toEqual([]);
  });
});
