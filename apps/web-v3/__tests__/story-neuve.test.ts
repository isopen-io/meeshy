/**
 * @jest-environment node
 */

import { LIS_LA_STORY_NEUVE, PUBLIE_UNE_STORY } from '@/app/connecte/story-neuve-porte';
import { COMPOSER, CHAMPS_DU_COMPOSER, OCTETS_MAX_D_UNE_STORY, OCTETS_MAX_PAR_MEDIA } from '@/lib/contenu/composer';
import { HEURES_DE_VIE_D_UNE_STORY, STORY_NEUVE } from '@/lib/contenu/story-neuve';
import { STORY } from '@/lib/contenu/story';

/**
 * `/stories/new` (#5033) — LES DEUX CONTRÔLES DE LA CIBLE, ET LEUR ASYMÉTRIE.
 *
 * L'audience MUTE la charge ; l'expiration n'a AUCUNE capacité serveur. Les
 * témoins les jugent donc différemment : le premier sur le corps envoyé, le
 * second sur l'ABSENCE de champ — c'est ce qui distingue un réglage d'une
 * mention, et les confondre produirait un contrôle qui ne règle rien.
 */

const COOKIE = 'meeshy_auth=jeton-de-test';
const ORIGINE = 'https://meeshy.test';

const requete = (chemin: string, avecJeton = true): Request =>
  new Request(`${ORIGINE}${chemin}`, { headers: avecJeton ? { cookie: COOKIE } : {} });

const poste = (
  corps: Readonly<Record<string, string>>,
  options: { readonly origine?: string | null } = {},
): Request =>
  new Request(`${ORIGINE}/stories/new`, {
    method: 'POST',
    headers: {
      cookie: COOKIE,
      ...(options.origine === null ? {} : { origin: options.origine ?? ORIGINE }),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(corps).toString(),
  });

const json = (corps: unknown, statut = 200): Response => new Response(JSON.stringify(corps), { status: statut });

/** Un fichier de test — `File` est global depuis Node 20 (Undici), pas besoin d'un polyfill. */
const fichierDeTest = (nom: string, type: string, contenu = 'contenu'): File => new File([contenu], nom, { type });

/**
 * UN FORMULAIRE MULTIPART (#5389) — même patron que `composer.test.ts` :
 * `Content-Type: multipart/form-data; boundary=…` posé par la plateforme,
 * jamais à la main.
 */
const posteMultipart = (
  champs: Readonly<Record<string, string>>,
  fichiers: readonly File[] = [],
  options: { readonly avecJeton?: boolean; readonly origine?: string | null } = {},
): Request => {
  const donnees = new FormData();
  Object.entries(champs).forEach(([cle, valeur]) => donnees.append(cle, valeur));
  fichiers.forEach((fichier) => donnees.append(CHAMPS_DU_COMPOSER.medias, fichier));
  return new Request(`${ORIGINE}/stories/new`, {
    method: 'POST',
    headers: {
      ...(options.avecJeton === false ? {} : { cookie: COOKIE }),
      ...(options.origine === null ? {} : { origin: options.origine ?? ORIGINE }),
    },
    body: donnees,
  });
};

/**
 * UN `<p>` DANS UN `<p>` N'EXISTE PAS (revue #5389) — l'analyseur HTML referme
 * le premier en rencontrant le second, puis fabrique un `<p></p>` VIDE là où
 * traîne le `</p>` devenu orphelin. Le témoin ne cherche donc AUCUNE balise
 * nommée : il compte les ouvertures pendant qu'une l'est déjà, sur le document
 * SERVI — c'est ce qui l'attrape où qu'il naisse. (`<pre>`, `<path>` : `\b`
 * ne coupe pas entre deux lettres, ils ne matchent pas.)
 */
const pImbriqueDans = (html: string): boolean => {
  let ouvert = false;
  for (const balise of html.matchAll(/<(\/?)p\b[^>]*>/g)) {
    if (balise[1] === '/') {
      ouvert = false;
      continue;
    }
    if (ouvert) return true;
    ouvert = true;
  }
  return false;
};

const LECTRICE = {
  id: 'u-amina',
  username: 'amina',
  displayName: 'Amina Diallo',
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
};

const serveur = (
  options: {
    readonly statut?: number;
    readonly lecteur?: unknown;
    /** Fait échouer `/api/v1/uploads` — copie `onUploadCreate` (texte brut, pas de JSON). */
    readonly refusUpload?: { readonly statut: number; readonly message: string };
  } = {},
) => {
  const corps: unknown[] = [];
  const uploads: { readonly url: string; readonly metadonnees: string }[] = [];
  const suppressions: string[] = [];
  const recuperer = async (url: string, init?: RequestInit): Promise<Response> => {
    if (url.includes('/auth/me')) return json({ success: true, data: options.lecteur ?? LECTRICE });
    if (url.endsWith('/api/v1/uploads')) {
      const metadonnees = String((init?.headers as Record<string, string> | undefined)?.['upload-metadata'] ?? '');
      uploads.push({ url, metadonnees });
      if (options.refusUpload) return new Response(options.refusUpload.message, { status: options.refusUpload.statut });
      return json({ success: true, data: { attachment: { id: `m-${uploads.length}` } } });
    }
    if (url.includes('/api/v1/posts/media/')) {
      suppressions.push(url);
      return json({ success: true, data: { message: 'Media deleted' } });
    }
    if (url.endsWith('/api/v1/posts')) {
      corps.push(JSON.parse(String(init?.body ?? '{}')));
      const statut = options.statut ?? 201;
      return statut >= 400
        ? json({ success: false, error: { message: 'Contenu refusé.' } }, statut)
        : json({ success: true, data: { id: 's-neuve' } }, statut);
    }
    throw new Error(`appel non prévu : ${url}`);
  };
  return { corps, uploads, suppressions, recuperer };
};

describe('l’écran de nouvelle story', () => {
  it('renvoie vers la connexion sans jeton', async () => {
    const reponse = await LIS_LA_STORY_NEUVE(requete('/stories/new', false), serveur().recuperer);

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fstories%2Fnew');
  });

  /**
   * L'EXPIRATION N'EST PAS UN CHAMP — aucune capacité serveur
   * (`CreatePostSchema` ne porte aucune échéance). Le témoin garde l'ABSENCE :
   * un `<select>` ou un `<input>` sur cette ligne serait un réglage qui ne
   * règle rien, et il ne se verrait qu'à l'usage.
   */
  it('dit l’expiration, et n’en fait pas un contrôle', async () => {
    const html = await (await LIS_LA_STORY_NEUVE(requete('/stories/new'), serveur().recuperer)).text();

    expect(html).toContain(`${STORY_NEUVE.expiration} ${HEURES_DE_VIE_D_UNE_STORY} h`);
    expect(html).not.toContain('name="expiration"');
    expect(html).not.toContain('id="s-expiration"');
  });

  /**
   * ET LA VALEUR EST 20 h, JAMAIS 24 — la cible écrit « 24 h » et la copie du
   * LECTEUR portait la même erreur. Le nombre vient du gateway
   * (`EPHEMERAL_POST_TTL_HOURS.STORY`), pas d'un document de design.
   */
  it('sert la durée que la passerelle applique, pas celle de la planche', async () => {
    const html = await (await LIS_LA_STORY_NEUVE(requete('/stories/new'), serveur().recuperer)).text();

    expect(HEURES_DE_VIE_D_UNE_STORY).toBe(20);
    expect(html).not.toContain('24 h');
    // La MÊME durée est servie au lecteur d'une story indisponible : deux
    // phrases qui divergent diraient deux vérités sur le même fait.
    expect(STORY.indisponible.corps).toContain(`${HEURES_DE_VIE_D_UNE_STORY} h`);
    expect(STORY.indisponible.corps).not.toContain('24 h');
  });

  /**
   * LE DÉFAUT EST « CONTACTS », PAS « PUBLIC ». C'est le défaut SERVEUR d'une
   * story, et reprendre celui du composer aurait ouvert au monde entier ce que
   * le service ferme aux contacts — sans aucun message pour le dire.
   */
  it('propose « Contacts » par défaut, comme le serveur', async () => {
    const html = await (await LIS_LA_STORY_NEUVE(requete('/stories/new'), serveur().recuperer)).text();

    expect(html).toContain('value="FRIENDS" selected');
    expect(html).not.toContain('value="PUBLIC" selected');
  });
});

describe('publier une story', () => {
  it('refuse un formulaire venu d’un autre site', async () => {
    const { corps, recuperer } = serveur();
    const reponse = await PUBLIE_UNE_STORY(
      poste({ texte: 'Bonjour' }, { origine: 'https://ailleurs.test' }),
      recuperer,
    );

    expect(reponse.status).toBe(403);
    expect(corps).toEqual([]);
  });

  it('envoie un STORY avec son texte et sa langue revendiquée', async () => {
    const { corps, recuperer } = serveur();
    const reponse = await PUBLIE_UNE_STORY(poste({ texte: 'Les coulisses de la revue.' }), recuperer);

    expect(corps).toEqual([
      { type: 'STORY', content: 'Les coulisses de la revue.', visibility: 'FRIENDS', originalLanguage: 'fr' },
    ]);
    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/stories/new?publie=1');
  });

  /** L'AUDIENCE MUTE LA CHARGE — c'est le critère de fin, et il porte sur ce qui PART. */
  it.each(['PUBLIC', 'FRIENDS', 'PRIVATE'])('l’audience %s part telle quelle', async (choisie) => {
    const { corps, recuperer } = serveur();
    await PUBLIE_UNE_STORY(poste({ texte: 'Bonjour', audience: choisie }), recuperer);

    expect(corps[0]).toMatchObject({ visibility: choisie });
  });

  /** Une audience inventée retombe sur le défaut SERVEUR, jamais sur PUBLIC. */
  it('retombe sur Contacts devant une audience inconnue', async () => {
    const { corps, recuperer } = serveur();
    await PUBLIE_UNE_STORY(poste({ texte: 'Bonjour', audience: 'COMMUNITY' }), recuperer);

    expect(corps[0]).toMatchObject({ visibility: 'FRIENDS' });
  });

  it('refuse une story vide sans appeler la passerelle', async () => {
    const { corps, recuperer } = serveur();
    const reponse = await PUBLIE_UNE_STORY(poste({ texte: '  ' }), recuperer);

    expect(corps).toEqual([]);
    expect(reponse.status).toBe(422);
    expect(await reponse.text()).toContain(STORY_NEUVE.vide);
  });

  it('un refus garde le texte et l’audience choisis', async () => {
    const { recuperer } = serveur({ statut: 422 });
    const reponse = await PUBLIE_UNE_STORY(poste({ texte: 'Ce que j’ai écrit', audience: 'PRIVATE' }), recuperer);
    const html = await reponse.text();

    expect(html).toContain('Ce que j’ai écrit');
    expect(html).toContain('value="PRIVATE" selected');
  });

  it('ne revendique aucune langue quand le lecteur n’en déclare aucune', async () => {
    const sans = { ...LECTRICE, systemLanguage: null };
    const { corps, recuperer } = serveur({ lecteur: sans });
    await PUBLIE_UNE_STORY(poste({ texte: 'Ẹ káàbọ̀' }), recuperer);

    expect(corps[0]).not.toHaveProperty('originalLanguage');
  });
});

/**
 * LE MÉDIA D'UNE STORY (#5389) — même patron que `composer.test.ts` : le
 * CORPS ENVOYÉ à la passerelle, jamais la forme du document seule.
 */
describe('le média d’une story', () => {
  it('le document porte le champ fichier', async () => {
    const html = await (await LIS_LA_STORY_NEUVE(requete('/stories/new'), serveur().recuperer)).text();

    expect(html).toContain('type="file"');
    expect(html).toContain(`name="${CHAMPS_DU_COMPOSER.medias}"`);
    expect(html).toContain('enctype="multipart/form-data"');
    const accept = /accept="([^"]+)"/.exec(html)?.[1] ?? '';
    expect(accept).toContain('image/');
    expect(accept).toContain('video/');
    expect(html).not.toContain('multiple');
    expect(html).not.toContain(
      'Pour l’instant, une story se publie en texte depuis le web. Photo et vidéo arrivent avec le téléversement.',
    );
  });

  it('une story média-seule part', async () => {
    const { corps, uploads, recuperer } = serveur();
    const reponse = await PUBLIE_UNE_STORY(
      posteMultipart({ texte: '' }, [fichierDeTest('vue.png', 'image/png')]),
      recuperer,
    );

    expect(uploads).toHaveLength(1);
    expect(corps).toEqual([{ type: 'STORY', content: '', visibility: 'FRIENDS', originalLanguage: 'fr', mediaIds: ['m-1'] }]);
    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/stories/new?publie=1');
  });

  it('texte et média partent ensemble', async () => {
    const { corps, recuperer } = serveur();
    await PUBLIE_UNE_STORY(
      posteMultipart({ texte: 'Les coulisses.' }, [fichierDeTest('vue.png', 'image/png')]),
      recuperer,
    );

    expect(corps[0]).toMatchObject({ content: 'Les coulisses.', mediaIds: ['m-1'] });
  });

  it('un type refusé se dessine à l’écran, rien ne part', async () => {
    const { corps, uploads, recuperer } = serveur();
    const reponse = await PUBLIE_UNE_STORY(
      posteMultipart({ texte: 'ceci reste' }, [fichierDeTest('notes.txt', 'text/plain')]),
      recuperer,
    );
    const html = await reponse.text();

    expect(uploads).toEqual([]);
    expect(corps).toEqual([]);
    expect(reponse.status).toBe(422);
    expect(html).toContain(COMPOSER.mediasRefuse('notes.txt'));
    expect(html).toContain('ceci reste');
  });

  it('refuse un fichier au-dessus de la borne, sans un octet envoyé', async () => {
    const gros = new File(['x'.repeat(OCTETS_MAX_PAR_MEDIA + 1)], 'enorme.png', { type: 'image/png' });
    const { corps, uploads, recuperer } = serveur();
    const reponse = await PUBLIE_UNE_STORY(posteMultipart({ texte: 'trop lourd' }, [gros]), recuperer);
    const html = await reponse.text();

    expect(uploads).toEqual([]);
    expect(corps).toEqual([]);
    expect(reponse.status).toBe(422);
    expect(html).toContain(`${OCTETS_MAX_PAR_MEDIA / (1024 * 1024)} Mo`);
  });

  /** Contre-épreuve — un fichier EXACTEMENT à la borne part : un seuil a deux moitiés. */
  it('accepte un fichier exactement à la borne', async () => {
    const juste = new File(['x'.repeat(OCTETS_MAX_PAR_MEDIA)], 'juste.png', { type: 'image/png' });
    const { corps, recuperer } = serveur();
    await PUBLIE_UNE_STORY(posteMultipart({ texte: 'pile' }, [juste]), recuperer);

    expect(corps[0]).toMatchObject({ mediaIds: ['m-1'] });
  });

  it('deux fichiers sont refusés — une story ne porte qu’un média', async () => {
    const { corps, uploads, recuperer } = serveur();
    const reponse = await PUBLIE_UNE_STORY(
      posteMultipart({ texte: 'deux' }, [fichierDeTest('un.png', 'image/png'), fichierDeTest('deux.png', 'image/png')]),
      recuperer,
    );
    const html = await reponse.text();

    expect(uploads).toEqual([]);
    expect(corps).toEqual([]);
    expect(reponse.status).toBe(422);
    expect(html).toContain(STORY_NEUVE.mediaUnSeul);
  });

  it('un échec de téléversement se refuse, texte conservé', async () => {
    const { corps, recuperer } = serveur({ refusUpload: { statut: 500, message: 'boom' } });
    const reponse = await PUBLIE_UNE_STORY(
      posteMultipart({ texte: 'mon texte' }, [fichierDeTest('vue.png', 'image/png')]),
      recuperer,
    );
    const html = await reponse.text();

    expect(corps).toEqual([]);
    expect(reponse.status).toBe(422);
    expect(html).toContain(COMPOSER.mediasEchec);
    expect(html).toContain('mon texte');
  });

  it('un refus de la passerelle après téléversement relâche le média', async () => {
    const { corps, suppressions, recuperer } = serveur({ statut: 422 });
    const reponse = await PUBLIE_UNE_STORY(
      posteMultipart({ texte: 'refusé' }, [fichierDeTest('vue.png', 'image/png')]),
      recuperer,
    );

    expect(corps).toHaveLength(1);
    expect(suppressions.map((u) => u.endsWith('/api/v1/posts/media/m-1'))).toEqual([true]);
    expect(reponse.status).toBe(422);
  });

  it('la légende part zippée au média', async () => {
    const { corps, recuperer } = serveur();
    await PUBLIE_UNE_STORY(
      posteMultipart({ texte: 'avec légende', 'medias-alt': 'Une vue de la revue' }, [fichierDeTest('vue.png', 'image/png')]),
      recuperer,
    );

    expect(corps[0]).toMatchObject({ mediaAlt: { 'm-1': 'Une vue de la revue' } });
  });

  it('une légende vide ne pose aucune clé', async () => {
    const { corps, recuperer } = serveur();
    await PUBLIE_UNE_STORY(posteMultipart({ texte: 'sans légende' }, [fichierDeTest('vue.png', 'image/png')]), recuperer);

    expect(corps[0]).not.toHaveProperty('mediaAlt');
  });

  it('la charge annoncée trop grosse se refuse SANS lire', async () => {
    const { corps, uploads, recuperer } = serveur();
    const requeteLourde = new Request(`${ORIGINE}/stories/new`, {
      method: 'POST',
      headers: {
        cookie: COOKIE,
        origin: ORIGINE,
        'content-type': 'multipart/form-data; boundary=x',
        'content-length': String(OCTETS_MAX_D_UNE_STORY + 1),
      },
      body: '--x--',
    });
    const reponse = await PUBLIE_UNE_STORY(requeteLourde, recuperer);
    const html = await reponse.text();

    expect(reponse.status).toBe(413);
    expect(requeteLourde.bodyUsed).toBe(false);
    expect(uploads).toEqual([]);
    expect(corps).toEqual([]);
    expect(html).toContain(COMPOSER.mediasCharge);
  });

  it('le contexte d’upload est « story »', async () => {
    const { uploads, recuperer } = serveur();
    await PUBLIE_UNE_STORY(posteMultipart({ texte: 'contexte' }, [fichierDeTest('vue.png', 'image/png')]), recuperer);

    expect(uploads[0]?.metadonnees).toContain(`uploadcontext ${Buffer.from('story').toString('base64')}`);
  });

  /**
   * REVUE #5389 — le refus vit dans le MÊME bloc que le champ, et ce bloc est
   * un `<div>` : le mesurer par la VALIDITÉ du document plutôt que par le nom
   * de la balise attrape aussi le prochain conteneur mal choisi.
   */
  it('le document reste valide quand le refus s’affiche', async () => {
    const { recuperer } = serveur();
    const nominal = await (await LIS_LA_STORY_NEUVE(requete('/stories/new'), recuperer)).text();
    const refuse = await (
      await PUBLIE_UNE_STORY(posteMultipart({ texte: 'x' }, [fichierDeTest('notes.txt', 'text/plain')]), recuperer)
    ).text();

    expect(pImbriqueDans(nominal)).toBe(false);
    expect(pImbriqueDans(refuse)).toBe(false);
  });

  it('le champ fichier se déclare invalide quand il est refusé, et pas avant', async () => {
    const { recuperer } = serveur();
    const nominal = await (await LIS_LA_STORY_NEUVE(requete('/stories/new'), recuperer)).text();
    const refuse = await (
      await PUBLIE_UNE_STORY(posteMultipart({ texte: 'x' }, [fichierDeTest('notes.txt', 'text/plain')]), recuperer)
    ).text();

    expect(nominal).not.toContain('aria-invalid');
    expect(refuse).toContain('aria-invalid="true"');
  });

  /** Un refus ne doit pas faire payer DEUX fois : le texte revient déjà, la légende aussi. */
  it('la légende est reposée après un refus', async () => {
    const { recuperer } = serveur();
    const reponse = await PUBLIE_UNE_STORY(
      posteMultipart({ texte: 'x', 'medias-alt': 'Le marché de Bonabéri' }, [fichierDeTest('notes.txt', 'text/plain')]),
      recuperer,
    );

    expect(await reponse.text()).toContain('value="Le marché de Bonabéri"');
  });

  /** Le test existant `:155-162` du fichier — une story sans texte NI média reste refusée. */
  it('une story vide sans média reste refusée', async () => {
    const { corps, recuperer } = serveur();
    const reponse = await PUBLIE_UNE_STORY(poste({ texte: '  ' }), recuperer);

    expect(corps).toEqual([]);
    expect(reponse.status).toBe(422);
    expect(await reponse.text()).toContain(STORY_NEUVE.vide);
  });
});
