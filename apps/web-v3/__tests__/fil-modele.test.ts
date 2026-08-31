import {
  RANG_DE_LA_FILE,
  bulleServie,
  bulleEnAttente,
  filAPeindre,
  fusionneLesBulles,
  heureDe,
  initiales,
  prismeDuLecteur,
  type MessageServi,
} from '@/app/(public)/chats/[lien]/fil-modele';

/**
 * LE MODÈLE DU FIL — ce qui se peint, avant qu'un pixel n'existe.
 *
 * Trois lois y sont mesurées, et aucune n'est vérifiable depuis un navigateur
 * sans un serveur, un lien et un jeton :
 *
 *   1. le Prisme descend ORDONNÉ (§ 5.4), et il n'est descendu que par
 *      `resolvePrismTranslation()` — la v3 ne réécrit pas la boucle ;
 *   2. `lang="xx"` est posé sur tout nœud dont le texte a été résolu dans une
 *      langue ≠ celle du document, ce qui « part à côté » du texte (cycle 123) ;
 *   3. une file hors-ligne se vide DANS L'ORDRE D'ÉCRITURE (§ 7), et un envoi
 *      refusé reste VISIBLE (§ 6.3 G) — jamais perdu en silence.
 */

const message = (partiel: Partial<MessageServi> = {}): MessageServi => ({
  id: 'm1',
  auteur: 'Ibrahim',
  moi: false,
  anonyme: false,
  contenu: 'On se cale à 15 h pour la revue ?',
  langueOriginale: 'fr',
  traductions: {},
  instantMs: Date.UTC(2026, 7, 30, 12, 1),
  ...partiel,
});

describe('le Prisme descend ORDONNÉ, jamais le rang 1 seul', () => {
  it('sert le rang 2 quand le rang 1 n’a pas de traduction', () => {
    const bulle = bulleServie({
      message: message({
        langueOriginale: 'en',
        contenu: 'Hello',
        traductions: { fr: 'Bonjour' },
      }),
      prisme: ['yo', 'fr'],
      langueDuDocument: 'fr',
    });

    expect(bulle.texte).toBe('Bonjour');
  });

  /**
   * LA RÈGLE 3 DU PRISME, dans sa forme qui tombe : la langue d'origine
   * concourt à SON RANG, jamais comme court-circuit. Prisme `['fr','en']`,
   * message anglais, traduction française disponible ⇒ « Bonjour », jamais
   * « Hello ».
   */
  it('ne court-circuite pas sur la langue d’origine quand elle est d’un rang inférieur', () => {
    const bulle = bulleServie({
      message: message({
        langueOriginale: 'en',
        contenu: 'Hello',
        traductions: { fr: 'Bonjour' },
      }),
      prisme: ['fr', 'en'],
      langueDuDocument: 'fr',
    });

    expect(bulle.texte).toBe('Bonjour');
  });

  it('sert l’ORIGINAL quand aucune traduction ne matche le prisme', () => {
    const bulle = bulleServie({
      message: message({ langueOriginale: 'es', contenu: 'Perfecto', traductions: {} }),
      prisme: ['fr'],
      langueDuDocument: 'fr',
    });

    expect(bulle.texte).toBe('Perfecto');
  });
});

describe('« lang » est ce qui part À CÔTÉ du texte résolu', () => {
  it('pose la langue servie quand elle diffère de celle du document', () => {
    const bulle = bulleServie({
      message: message({ langueOriginale: 'es', contenu: 'Perfecto', traductions: {} }),
      prisme: ['fr'],
      langueDuDocument: 'fr',
    });

    expect(bulle.langue).toBe('es');
  });

  it('ne pose RIEN quand le texte servi est déjà dans la langue du document', () => {
    const bulle = bulleServie({
      message: message({
        langueOriginale: 'en',
        contenu: 'Hello',
        traductions: { fr: 'Bonjour' },
      }),
      prisme: ['fr'],
      langueDuDocument: 'fr',
    });

    expect(bulle.langue).toBeNull();
  });

  /**
   * Une traduction servie dans une langue ≠ document DOIT porter son `lang` :
   * sans lui, un lecteur d'écran francophone prononce une bulle yoruba en
   * phonétique française (§ 2, ligne i18n).
   */
  it('pose la langue de la TRADUCTION quand c’est elle qui est servie', () => {
    const bulle = bulleServie({
      message: message({
        langueOriginale: 'fr',
        contenu: 'Bonjour',
        traductions: { yo: 'Bawo ni' },
      }),
      prisme: ['yo'],
      langueDuDocument: 'fr',
    });

    expect(bulle.texte).toBe('Bawo ni');
    expect(bulle.langue).toBe('yo');
  });
});

describe('le prisme d’un lecteur anonyme', () => {
  /**
   * Un invité n'a ni `systemLanguage`, ni `regionalLanguage` : la SEULE langue
   * qu'il déclare est celle du formulaire d'entrée, et la locale de l'appareil
   * entre au rang suivant (§ Prisme, règle 2) — jamais en remplacement.
   */
  it('range la langue déclarée AVANT la locale de l’appareil, sans doublon', () => {
    expect(prismeDuLecteur({ declaree: 'yo', locale: 'en-GB' })).toEqual(['yo', 'en', 'fr']);
    expect(prismeDuLecteur({ declaree: 'fr', locale: 'fr-FR' })).toEqual(['fr']);
    expect(prismeDuLecteur({ declaree: null, locale: null })).toEqual(['fr']);
  });
});

describe('la file hors-ligne se vide DANS L’ORDRE, et ses refus restent visibles', () => {
  const enAttente = [
    bulleEnAttente({ cle: 'b1', texte: 'premier', auteur: 'Tolu', instantMs: 10 }),
    bulleEnAttente({ cle: 'b2', texte: 'second', auteur: 'Tolu', instantMs: 20 }),
  ];

  it('peint la file APRÈS les messages servis, dans son ordre d’écriture', () => {
    const fil = filAPeindre({
      servis: [
        bulleServie({ message: message({ id: 'm2', instantMs: 99 }), prisme: ['fr'], langueDuDocument: 'fr' }),
        bulleServie({ message: message({ id: 'm1', instantMs: 5 }), prisme: ['fr'], langueDuDocument: 'fr' }),
      ],
      enAttente,
      lacune: false,
    });

    expect(fil.bulles.map((bulle) => bulle.id)).toEqual(['m1', 'm2', 'b1', 'b2']);
    expect(fil.bulles.map((bulle) => bulle.rang)).toEqual([0, 0, RANG_DE_LA_FILE, RANG_DE_LA_FILE]);
  });

  it('rend un envoi REFUSÉ visible, avec sa raison', () => {
    const refusee = { ...enAttente[0]!, etat: 'refusee' as const, raison: 'Ce lien a été fermé.' };
    const fil = filAPeindre({ servis: [], enAttente: [refusee], lacune: false });

    expect(fil.bulles[0]?.etat).toBe('refusee');
    expect(fil.bulles[0]?.raison).toBe('Ce lien a été fermé.');
  });

  /**
   * Le séparateur du § 7 : « des messages manquent ici ». Il n'est peint que
   * quand `hasGap` le dit — un séparateur inventé ferait douter d'un fil
   * complet.
   */
  it('ne peint le séparateur de lacune que sur hasGap', () => {
    expect(filAPeindre({ servis: [], enAttente: [], lacune: false }).lacune).toBe(false);
    expect(filAPeindre({ servis: [], enAttente: [], lacune: true }).lacune).toBe(true);
  });

  it('ne peint pas deux fois un message que la passerelle a fini par servir', () => {
    const servi = bulleServie({
      message: message({ id: 'm9' }),
      prisme: ['fr'],
      langueDuDocument: 'fr',
    });
    const fil = filAPeindre({
      servis: [servi],
      enAttente: [{ ...enAttente[0]!, id: 'm9' }],
      lacune: false,
    });

    expect(fil.bulles.map((bulle) => bulle.id)).toEqual(['m9']);
    expect(fil.bulles[0]?.etat).toBe('servie');
  });
});

/**
 * CE QUE LA CIBLE POSE SUR CHAQUE LIGNE, et que l'écran ne rendait pas :
 * l'avatar à initiales, le fait d'être sans compte, et l'HEURE. `instantMs`
 * était calculé, transporté, et ne servait qu'au tri.
 */
describe('les éléments de la cible que la bulle porte', () => {
  it('tire les initiales de l’avatar du nom, deux lettres au plus', () => {
    expect(initiales('Marta Ruiz')).toBe('MR');
    expect(initiales('Ibrahim')).toBe('IB');
    expect(initiales('  Tolu  Adé  Ola ')).toBe('TA');
  });

  /**
   * Un disque sans lettre, jamais un « ? » : un point d'interrogation
   * ressemble à une erreur de chargement, ce qu'un nom vide n'est pas.
   */
  it('rend une chaîne vide sur un nom vide', () => {
    expect(initiales('   ')).toBe('');
  });

  /**
   * Le fuseau est EXPLICITE des deux côtés de l'hydratation : `UTC` est la
   * seule heure que le serveur et le navigateur calculent pareil, et c'est ce
   * qui évite une divergence sur CHAQUE bulle.
   */
  it('rend l’heure en UTC quand on la lui demande, à la minute', () => {
    expect(
      heureDe({ instantMs: Date.UTC(2026, 7, 30, 12, 1), langue: 'fr', fuseau: 'UTC' }),
    ).toBe('12:01');
  });

  it('propage « sans compte » du message à la bulle', () => {
    const bulle = bulleServie({
      message: message({ anonyme: true }),
      prisme: ['fr'],
      langueDuDocument: 'fr',
    });

    expect(bulle.anonyme).toBe(true);
  });
});

/**
 * LA FUSION D'UN DELTA — `GET /sync` relit parfois ce qu'on a déjà (le
 * watermark est reculé côté serveur), donc la déduplication par `id` est à la
 * charge du client, et le delta GAGNE : c'est lui qui porte la version la plus
 * récente d'un message ÉDITÉ.
 */
describe('la fusion d’un delta', () => {
  const bulle = (id: string, texte: string) =>
    bulleServie({
      message: message({ id, contenu: texte }),
      prisme: ['fr'],
      langueDuDocument: 'fr',
    });

  it('déduplique par id et laisse gagner le delta', () => {
    const fusionnees = fusionneLesBulles(
      [bulle('m1', 'avant'), bulle('m2', 'autre')],
      [bulle('m1', 'après')],
    );

    expect(fusionnees.map((b) => b.id)).toEqual(['m1', 'm2']);
    expect(fusionnees.find((b) => b.id === 'm1')?.texte).toBe('après');
  });

  it('ajoute ce qui est neuf', () => {
    expect(fusionneLesBulles([bulle('m1', 'a')], [bulle('m2', 'b')]).map((b) => b.id)).toEqual([
      'm1',
      'm2',
    ]);
  });
});
