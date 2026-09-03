/**
 * @jest-environment node
 */

import {
  filDeLaPublication,
  publicationLue,
  type Commentaire,
} from '@/lib/api/publication';

/**
 * CE QUE CES TÉMOINS ÉPROUVENT — la lecture du post et de son fil, et surtout
 * le PRISME, qui est la raison d'être de cet écran (#4896).
 *
 * Les bouchons sont copiés des producteurs :
 *
 *   - `PostComment` (`packages/shared/prisma/schema.prisma:3509-3530`) — dont
 *     `translations` est une carte d'OBJETS `{ text, translationModel, … }`,
 *     « même format et pipeline que Post.translations et Message.translations » ;
 *   - `PostCommentService.getComments` (`services/PostCommentService.ts:346-364`)
 *     — le `select` exact : `content`, `originalLanguage`, `translations`,
 *     `likeCount`, `replyCount`, `author` ;
 *   - `GET /posts/:postId/comments` (`routes/posts/comments.ts:61-113`) — qui
 *     sert `{ success, data, pagination: { limit, hasMore, nextCursor } }` et
 *     ne déclare AUCUN schéma de réponse, donc ne retire rien.
 *
 * LE TÉMOIN DE RANG EST ÉCRIT SUR UN RANG AUTRE QUE LE PREMIER, et le critère
 * de fin dit pourquoi : au rang 1, le court-circuit interdit (« si la langue
 * d'origine appartient au prisme ⇒ afficher l'original ») et la règle juste
 * rendent le MÊME verdict — un témoin posé là ne peut pas tomber. Le cas
 * nominal du cycle 120 est celui-ci : rang 1 absent, rang inférieur présent,
 * ce qui survient dès que la locale appareil (rang 4) diffère de la langue
 * applicative.
 */

const json = (corps: unknown, statut = 200): Response =>
  new Response(JSON.stringify(corps), { status: statut });

/** La carte de traductions telle que Prisma la stocke — des OBJETS, pas des chaînes. */
const carte = (paires: Readonly<Record<string, string>>) =>
  Object.fromEntries(
    Object.entries(paires).map(([code, text]) => [
      code,
      { text, translationModel: 'nllb-200', confidenceScore: 0.94, createdAt: '2026-09-01T10:00:00.000Z' },
    ]),
  );

const commentaireServi = (extra: Record<string, unknown> = {}) => ({
  id: 'k1',
  content: 'Are the Q1 numbers up to date?',
  originalLanguage: 'en',
  translations: carte({ es: '¿Están actualizadas las cifras del Q1?' }),
  likeCount: 4,
  replyCount: 0,
  reactionCount: 0,
  parentId: null,
  createdAt: '2026-09-02T20:00:00.000Z',
  author: { id: 'u-marta', username: 'marta', displayName: 'Marta Ruiz' },
  ...extra,
});

const filServi = (commentaires: readonly unknown[], hasMore = false) => ({
  success: true,
  data: commentaires,
  pagination: { limit: 30, hasMore, nextCursor: null },
  meta: { mentionedUsers: [] },
});

const passerelle = (reponse: () => Response) => {
  const vus: string[] = [];
  const recuperer = async (url: string): Promise<Response> => {
    vus.push(url);
    return reponse();
  };
  return { recuperer, vus };
};

const litLeFil = async ({
  commentaires = [commentaireServi()],
  langues,
  moiId = null,
  hasMore = false,
}: {
  readonly commentaires?: readonly unknown[];
  readonly langues: readonly string[];
  readonly moiId?: string | null;
  readonly hasMore?: boolean;
}): Promise<readonly Commentaire[]> => {
  const { recuperer } = passerelle(() => json(filServi(commentaires, hasMore)));
  const fil = await filDeLaPublication({
    id: 'p1',
    jeton: 'j',
    langues,
    moiId,
    base: 'https://gate.test',
    recuperer,
  });
  if (fil.genre !== 'fil') throw new Error(fil.genre);
  return fil.commentaires;
};

describe('le Prisme d’un commentaire', () => {
  /**
   * LE TÉMOIN QUI COMPTE. Le lecteur préfère le français (rang 1), puis
   * l'espagnol (rang 2). Le commentaire est écrit en anglais et n'est traduit
   * qu'en espagnol. Un résolveur qui ne regarde que le rang 1 rend `null` et
   * sert l'ORIGINAL anglais ; la règle juste descend et sert l'espagnol.
   *
   * C'est le défaut exact du cycle 120, et il est NOMINAL dès que la locale
   * appareil — rang 4 — diffère de la langue applicative.
   */
  it('sert une traduction d’un rang INFÉRIEUR quand le rang 1 manque', async () => {
    const [k] = await litLeFil({ langues: ['fr', 'es'] });

    expect(k?.texte).toBe('¿Están actualizadas las cifras del Q1?');
    expect(k?.langueServie).toBe('es');
    // L'original reste disponible — « voir l'original » de la cible en dépend.
    expect(k?.texteOriginal).toBe('Are the Q1 numbers up to date?');
  });

  it('préfère le rang 1 quand il existe, sans descendre plus bas', async () => {
    const [k] = await litLeFil({
      commentaires: [
        commentaireServi({
          translations: carte({
            fr: 'Les chiffres du Q1 sont à jour ?',
            es: '¿Están actualizadas las cifras del Q1?',
          }),
        }),
      ],
      langues: ['fr', 'es'],
    });

    expect(k?.texte).toBe('Les chiffres du Q1 sont à jour ?');
    expect(k?.langueServie).toBe('fr');
  });

  /**
   * LA RÈGLE 1 DU PRISME : sans traduction vers une langue préférée, on sert
   * l'ORIGINAL — jamais `translations.first`, qui servirait une langue que
   * personne n'a demandée.
   */
  it('sert l’original quand aucune langue préférée n’est traduite', async () => {
    const [k] = await litLeFil({ langues: ['de'] });

    expect(k?.texte).toBe('Are the Q1 numbers up to date?');
    // `langueServie` porte la langue du texte AFFICHÉ, l'original compris.
    // Elle valait `null` ici, et deux choses en dépendaient à tort : le `lang=`
    // (servir de l'anglais dans un document français sans l'annoncer le fait
    // lire à voix française) et la ligne du Prisme, dont la vraie question est
    // « est-ce une TRADUCTION ? », c'est-à-dire `langueServie !== langueOriginale`.
    expect(k?.langueServie).toBe('en');
    expect(k?.langueServie).toBe(k?.langueOriginale);
  });

  /**
   * LA LANGUE D'ORIGINE CONCOURT À SON RANG, elle ne court-circuite pas. Le
   * lecteur préfère l'anglais (rang 1) puis le français ; le commentaire est
   * ÉCRIT en anglais. Le rang 1 est donc déjà servi par l'original, et
   * descendre au français serait le défaut que `CLAUDE.md` interdit
   * explicitement (« Prisme ['fr','en'], message anglais, traduction française
   * disponible ⇒ Bonjour, jamais Hello » — ici dans l'autre sens).
   */
  it('ne descend PAS sous la langue d’origine quand elle est mieux classée', async () => {
    const [k] = await litLeFil({
      commentaires: [
        commentaireServi({ translations: carte({ fr: 'Les chiffres du Q1 sont à jour ?' }) }),
      ],
      langues: ['en', 'fr'],
    });

    expect(k?.texte).toBe('Are the Q1 numbers up to date?');
    // Servie = originale ⇒ aucune traduction n'a eu lieu, et la vue n'annonce rien.
    expect(k?.langueServie).toBe(k?.langueOriginale);
  });

  /**
   * LE PIÈGE DE FORME, GARDÉ. `resolvePrismTranslation` attend
   * `Record<langue, texte>` et teste `typeof text !== 'string'` — passer la
   * carte d'objets telle quelle IGNORE chaque entrée, rend `null` partout, et
   * sert l'original à tout le monde SANS QU'AUCUNE ERREUR NE LE DISE. Ce
   * témoin tombe si l'adaptateur `traductions()` disparaît du chemin.
   */
  it('aplatit la carte d’OBJETS que Prisma stocke — sans quoi le Prisme est mort', async () => {
    const [k] = await litLeFil({
      commentaires: [commentaireServi({ translations: carte({ fr: 'À jour ?' }) })],
      langues: ['fr'],
    });

    expect(k?.texte).toBe('À jour ?');
    expect(k?.langueServie).toBe('fr');
  });
});

describe('le fil d’une publication', () => {
  it('demande la page explicitement plutôt que de laisser le schéma décider', async () => {
    const { recuperer, vus } = passerelle(() => json(filServi([commentaireServi()])));

    await filDeLaPublication({
      id: 'p1',
      jeton: 'j',
      langues: ['fr'],
      moiId: null,
      base: 'https://gate.test',
      recuperer,
    });

    expect(vus).toHaveLength(1);
    expect(vus[0]).toContain('/api/v1/posts/p1/comments?limit=');
  });

  it('relaie `hasMore` sans le déduire d’un décompte de page', async () => {
    const { recuperer } = passerelle(() => json(filServi([commentaireServi()], true)));

    const fil = await filDeLaPublication({
      id: 'p1',
      jeton: 'j',
      langues: ['fr'],
      moiId: null,
      base: 'https://gate.test',
      recuperer,
    });
    if (fil.genre !== 'fil') throw new Error(fil.genre);

    expect(fil.encore).toBe(true);
  });

  it('ne dit « à moi » que sur MES commentaires, et jamais sans identité', async () => {
    const [mien, autre] = await litLeFil({
      commentaires: [
        commentaireServi({ id: 'k-moi', author: { id: 'u-moi', username: 'amina' } }),
        commentaireServi({ id: 'k-autre' }),
      ],
      langues: ['fr'],
      moiId: 'u-moi',
    });

    expect(mien?.aMoi).toBe(true);
    expect(autre?.aMoi).toBe(false);

    // Sans identité, AUCUN commentaire n'est « à moi » : offrir « Supprimer »
    // sur celui d'un autre serait un contrôle que la passerelle refuserait —
    // après avoir fait croire au lecteur qu'il le peut.
    const [sansMoi] = await litLeFil({
      commentaires: [commentaireServi({ id: 'k-moi', author: { id: 'u-moi' } })],
      langues: ['fr'],
      moiId: null,
    });
    expect(sansMoi?.aMoi).toBe(false);
  });

  it('distingue introuvable, session expirée et panne', async () => {
    const issue = async (statut: number) => {
      const { recuperer } = passerelle(() => json({ success: false }, statut));
      return (
        await filDeLaPublication({
          id: 'p1',
          jeton: 'j',
          langues: ['fr'],
          moiId: null,
          base: 'https://gate.test',
          recuperer,
        })
      ).genre;
    };

    expect(await issue(401)).toBe('session-expiree');
    // Le 404 est le refus que la passerelle sert quand le lecteur n'a pas le
    // droit de voir le post — délibérément indiscernable d'un post absent.
    expect(await issue(404)).toBe('introuvable');
    expect(await issue(403)).toBe('introuvable');
    expect(await issue(500)).toBe('panne');
  });
});

describe('un lecteur pour les TROIS sources', () => {
  const publication = (type: string, extra: Record<string, unknown> = {}) => ({
    id: 'p1',
    type,
    title: 'Revue de mars',
    content: 'The March review is ready.',
    originalLanguage: 'en',
    translations: carte({ fr: 'La revue de mars est prête.' }),
    createdAt: '2026-09-02T18:00:00.000Z',
    author: { id: 'u-ibrahim', displayName: 'Ibrahim' },
    ...extra,
  });

  it.each(['POST', 'REEL', 'STORY'])('lit un %s, et le DIT', (type) => {
    const lue = publicationLue({
      brut: publication(type),
      langues: ['fr'],
      langueDemandee: null,
    });

    expect(lue?.genre).toBe(type);
    expect(lue?.titre).toBe('Revue de mars');
    expect(lue?.auteur).toBe('Ibrahim');
    // La descente est la MÊME que celle des commentaires et de la story.
    expect(lue?.texte).toBe('La revue de mars est prête.');
    expect(lue?.langueServie).toBe('fr');
  });

  it('refuse un STATUS — une humeur d’une heure n’a pas de fil', () => {
    expect(
      publicationLue({ brut: publication('STATUS'), langues: ['fr'], langueDemandee: null }),
    ).toBeNull();
  });

  it('refuse une publication supprimée', () => {
    expect(
      publicationLue({
        brut: publication('POST', { deletedAt: '2026-09-02T19:00:00.000Z' }),
        langues: ['fr'],
        langueDemandee: null,
      }),
    ).toBeNull();
  });

  it('honore `?lang=` sur la publication, mais pas sur le fil', async () => {
    const lue = publicationLue({
      brut: publication('POST', {
        translations: carte({ fr: 'La revue de mars est prête.', es: 'La revisión de marzo está lista.' }),
      }),
      langues: ['fr'],
      langueDemandee: 'es',
    });
    expect(lue?.langueServie).toBe('es');

    // Le fil, lui, descend le Prisme du LECTEUR : imposer à trente
    // commentaires la langue choisie pour un seul masquerait ceux qu'elle ne
    // traduit pas.
    const [k] = await litLeFil({
      commentaires: [commentaireServi({ translations: carte({ fr: 'À jour ?' }) })],
      langues: ['fr'],
    });
    expect(k?.langueServie).toBe('fr');
  });
});
