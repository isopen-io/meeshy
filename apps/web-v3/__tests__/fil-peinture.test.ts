import { documentDuFil, type EtatDuFil } from '@/app/connecte/fil-vue';
import { message } from '@/lib/api/fil';
import { initiales, teinteDeLAvatar } from '@/lib/avatar';
import { FIL } from '@/lib/contenu/fil';
import { GENRES_DE_PIECE } from '@/lib/api/formes';
import { ETAT_VIDE, bulleOptimiste, confirme, depuisLaCharge, insere, presence, reagit, retire, traduit } from '@/lib/realtime/fil-etat';
import {
  bullesDuDocument,
  choisisUneReaction,
  peins,
  peinsLaPresence,
  peintre,
  recale,
  recaleLesHeures,
  retireLesControlesDeReaction,
} from '@/lib/realtime/fil-peinture';

/**
 * LA PEINTURE — le module de participation ne compose aucune balise : il
 * REMPLIT le gabarit que le serveur a rendu. Ces témoins ouvrent le document
 * SERVI dans jsdom, puis le font évoluer comme le socket le ferait : une bulle
 * qui arrive, une traduction qui la fait changer de langue, une bulle optimiste
 * confirmée. Le témoin de fond : la ligne peinte en direct porte le MÊME
 * balisage que la ligne servie — et le même auteur a la même teinte, les mêmes
 * mots, les mêmes jours, parce qu'ils viennent des mêmes modules.
 */

const LANGUES = ['fr', 'en'];
const ORIGINE = 'https://gate.test';

const servi = message(
  { id: 'm1', content: 'Hello', originalLanguage: 'en', createdAt: '2026-09-01T12:00:00.000Z', senderId: 'u2', sender: { id: 'p2', displayName: 'Ibrahim' }, translations: [{ language: 'fr', content: 'Bonjour' }] },
  'u1',
  LANGUES,
  ORIGINE,
);

const etatServi = (): EtatDuFil => ({
  porte: { genre: 'membre', cle: 'c1' },
  fil: { id: 'c1', titre: 'T', membres: 2, presence: { participants: ['u2'], presents: [] }, messages: servi === null ? [] : [servi], plusAncien: null },
  lecteur: { id: 'u1', nom: 'Amina', langues: LANGUES },
  erreur: null,
  brouillon: '',
  maintenant: Date.parse('2026-09-01T12:30:00.000Z'),
  composeur: { genre: 'ouvert' },
  contexte: null,
  plein: null,
  profil: null,
  tempsReel: {
    passerelle: 'https://gate.test',
    actifs: {
      participate: { nom: 'p.js', url: '/__v3/rt/p.js', corps: '' },
      liste: { nom: 'l.js', url: '/__v3/rt/l.js', corps: '' },
      feed: { nom: 'feed.l.js', url: '/__v3/rt/feed.l.js', corps: '' },
      notifs: { nom: 'notifs.f.js', url: '/__v3/rt/notifs.f.js', corps: '' },
      contacts: { nom: 'contacts.f.js', url: '/__v3/rt/contacts.f.js', corps: '' },
      recherche: { nom: 'recherche.f.js', url: '/__v3/rt/recherche.f.js', corps: '' },
      liens: { nom: 'liens.f.js', url: '/__v3/rt/liens.f.js', corps: '' },
      commentaires: { nom: 'commentaires.f.js', url: '/__v3/rt/commentaires.f.js', corps: '' },
      plein: { nom: 'plein.f.js', url: '/__v3/rt/plein.f.js', corps: '' },
      navigateur: { nom: 'n.js', url: '/__v3/rt/n.js', corps: '' },
      composer: { nom: 'composer.f.js', url: '/__v3/rt/composer.f.js', corps: '' },
      prefs: { nom: 'prefs.f.js', url: '/__v3/rt/prefs.f.js', corps: '' },
      socket: { nom: 's.js', url: '/__v3/rt/s.js', corps: '' },
    },
  },
});

const monte = () => {
  document.open();
  document.write(documentDuFil(etatServi()));
  document.close();
  const main = document.querySelector<HTMLElement>('main')!;
  const p = peintre(main)!;
  return { main, p };
};

const charge = (attributs: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'm2',
  conversationId: 'c1',
  content: 'Perfecto',
  originalLanguage: 'es',
  createdAt: '2026-09-01T12:05:00.000Z',
  senderId: 'u3',
  sender: { id: 'p3', displayName: 'Marta Ruiz', type: 'user' },
  translations: [{ language: 'fr', content: 'Parfait' }],
  ...attributs,
});

const arrivee = (attributs: Record<string, unknown> = {}) => depuisLaCharge(charge(attributs), 'u1', LANGUES, ORIGINE)!;

const idsDuDom = (p: ReturnType<typeof peintre> & object): readonly string[] =>
  [...p.liste.querySelectorAll<HTMLElement>('li.ligne')].map((ligne) => ligne.dataset.id ?? '');

describe('l’état initial vient du document servi', () => {
  it('relit les lignes servies, langue servie comprise', () => {
    const { p } = monte();
    const bulles = bullesDuDocument(p);
    expect(bulles).toHaveLength(1);
    expect(bulles[0]).toMatchObject({ id: 'm1', texte: 'Bonjour', langueServie: 'fr', langueOriginale: 'en', texteOriginal: 'Hello', traductions: { fr: 'Bonjour' } });
  });

  it('remonte les heures relatives en heure locale, et pose un séparateur de jour cloné du gabarit', () => {
    const { p } = monte();
    recaleLesHeures(p);
    recale(p, Date.parse('2026-09-01T12:30:00.000Z'));
    expect(p.liste.querySelector('li.ligne time')?.textContent).toMatch(/^\d{2}:\d{2}$/);
    const jour = p.liste.querySelector<HTMLElement>('li.jour')!;
    expect(jour.textContent).toBe(FIL.aujourdhui);
    expect(jour.dataset.jour).toBe('2026-09-01');
    // Dans le DOM — servi du plus récent au plus ancien —, le jour SUIT la première ligne de son jour.
    expect(jour.previousElementSibling?.getAttribute('data-id')).toBe('m1');
    expect(p.liste.querySelectorAll('li.jour')).toHaveLength(1);
  });
});

/**
 * LA FENTE DE PRÉSENCE, SERVIE PUIS REPEINTE — la même phrase des deux côtés,
 * séparateur compris. La directive § 12.10.2 a rendu ce séparateur VARIABLE :
 * dans une conversation à DEUX, le compte de participants se tait, et rien ne
 * précède plus « N en ligne ». Sans la source unique (`presenceServie`), le
 * module repeignait « · 1 en ligne » sur un sous-titre vide — un point médian
 * orphelin, à la première présence reçue.
 */
describe('la présence de l’en-tête — servie et repeinte disent la même chose', () => {
  it('ne pose aucun séparateur quand rien ne la précède (conversation à deux)', () => {
    const { main, p } = monte();
    const fente = main.querySelector<HTMLElement>('.fil-tete .en-ligne')!;
    expect(fente.dataset.sep).toBe('0');
    peinsLaPresence(p, 1);
    expect(fente.textContent).toBe(`1 ${FIL.enLigne}`);
    expect(main.querySelector('.fil-tete .sous')?.textContent).toBe(`1 ${FIL.enLigne}`);
  });

  it('le pose quand le compte de participants le précède (trois et plus)', () => {
    document.open();
    const etat = etatServi();
    document.write(documentDuFil({ ...etat, fil: { ...etat.fil, membres: 4 } }));
    document.close();
    const main = document.querySelector<HTMLElement>('main')!;
    const p = peintre(main)!;
    const fente = main.querySelector<HTMLElement>('.fil-tete .en-ligne')!;
    expect(fente.dataset.sep).toBe('1');
    peinsLaPresence(p, 2);
    expect(main.querySelector('.fil-tete .sous')?.textContent).toBe(`4 ${FIL.participants} · 2 ${FIL.enLigne}`);
  });

  it('se tait à zéro, des deux côtés', () => {
    const { main, p } = monte();
    peinsLaPresence(p, 0);
    expect(main.querySelector<HTMLElement>('.fil-tete .en-ligne')?.hidden).toBe(true);
  });
});

describe('une bulle qui arrive', () => {
  it('est clonée du gabarit et remplie — le même balisage que la ligne servie', () => {
    const { p } = monte();
    const etat = { bulles: bullesDuDocument(p), frappeurs: [], presents: [] };
    const neuves = peins(p, insere(etat, arrivee()), Date.parse('2026-09-01T12:30:00.000Z'));

    expect(neuves).toHaveLength(1);
    const ligne = p.liste.querySelector<HTMLElement>('li[data-id="m2"]')!;
    expect(ligne.querySelector('.nom')?.textContent).toBe('Marta Ruiz');
    expect(ligne.querySelector('.texte')?.textContent).toBe('Parfait');
    expect(ligne.querySelector('.texte')?.getAttribute('lang')).toBeNull();
    expect(ligne.querySelector('details.original p')?.textContent).toBe('Perfecto');
    expect(ligne.querySelector('details.original p')?.getAttribute('lang')).toBe('es');
    expect(ligne.querySelector('.langue .code')?.textContent).toBe('es');
    expect(ligne.querySelector<HTMLElement>('.langue')?.hidden).toBe(false);
    expect(ligne.querySelector('.avatar')?.textContent).toBe('MR');
    const servie = p.liste.querySelector<HTMLElement>('li[data-id="m1"]')!;
    // Les fentes des deux rendus portent les mêmes classes : rien n'a été composé.
    // `a.avatar-lien` / `a.nom-lien` sont entrées dans cette liste avec #5030 : elles
    // manquaient au GABARIT depuis #4958, donc une bulle PEINTE n'avait aucun chemin
    // vers le profil quand la MÊME bulle rechargée en avait deux — et cette
    // énumération, écrite avant elles, ne pouvait pas le dire. `.corps.colonnes >
    // .bulle` et `.corps.colonnes > .datation time` remplacent `.meta time` depuis
    // #5136 : l'heure et l'accusé ont quitté la ligne méta pour la SECONDE COLONNE
    // du corps — servie et directe doivent porter la MÊME géographie, pas
    // seulement les mêmes classes.
    [
      'a.avatar-lien',
      '.avatar',
      'a.nom-lien',
      '.qui .nom',
      '.texte',
      'details.original',
      '.meta .langue',
      '.corps.colonnes > .bulle',
      '.corps.colonnes > .datation time',
      'ul.reactions',
    ].forEach((fente) => {
      expect(ligne.querySelector(fente)).not.toBeNull();
      expect(servie.querySelector(fente)).not.toBeNull();
    });
  });

  /**
   * ET LA FENTE MÈNE QUELQUE PART — la même règle que la ligne servie
   * (`handleDeLAuteur`) : un auteur avec compte a son `href`, un auteur
   * ANONYME (lui-même compris) n'en a pas. Un `<a>` sans `href` n'est ni
   * focusable ni cliquable : c'est le patron de la fiche d'un vocal.
   */
  it('pose le href du profil sur une bulle PEINTE — et le RETIRE pour un auteur sans compte', () => {
    const { p } = monte();
    const etat = { bulles: bullesDuDocument(p), frappeurs: [], presents: [] };
    peins(p, insere(etat, arrivee()), Date.parse('2026-09-01T12:30:00.000Z'));

    const ligne = p.liste.querySelector<HTMLElement>('li[data-id="m2"]')!;
    const attendu = `${p.adresse}?profil=u3`;
    expect(ligne.querySelector('a.avatar-lien')?.getAttribute('href')).toBe(attendu);
    expect(ligne.querySelector('a.nom-lien')?.getAttribute('href')).toBe(attendu);
    expect(ligne.querySelector('a.avatar-lien')?.getAttribute('aria-label')).toBe(FIL.voirLeProfil('Marta Ruiz'));

    const anonyme = { ...arrivee({ id: 'm9' }), anonyme: true, auteur: 'Tolu', auteurId: 'p9' };
    peins(p, insere(etat, anonyme), Date.parse('2026-09-01T12:30:00.000Z'));
    const sans = p.liste.querySelector<HTMLElement>('li[data-id="m9"]')!;
    expect(sans.querySelector('a.avatar-lien')?.hasAttribute('href')).toBe(false);
    expect(sans.querySelector('a.nom-lien')?.hasAttribute('href')).toBe(false);
    expect(sans.querySelector('a.avatar-lien')?.hasAttribute('aria-label')).toBe(false);
  });

  /** Le DOM va du plus récent au plus ancien : ce qui arrive se pose EN TÊTE, et l'état se relit dans l'ordre d'écriture. */
  it('se pose en tête du DOM — le plus récent d’abord —, et l’état se relit dans l’ordre d’écriture', () => {
    const { p } = monte();
    const etat = insere({ bulles: bullesDuDocument(p), frappeurs: [], presents: [] }, arrivee());
    peins(p, etat, 0);
    expect(idsDuDom(p)).toEqual(['m2', 'm1']);
    expect(bullesDuDocument(p).map((b) => b.id)).toEqual(['m1', 'm2']);

    // Un message plus ANCIEN qui arrive (une page chargée par le haut) se range à sa place — en fin de DOM.
    peins(p, insere(etat, arrivee({ id: 'm0', createdAt: '2026-09-01T11:00:00.000Z' })), 0);
    expect(idsDuDom(p)).toEqual(['m2', 'm1', 'm0']);
  });

  /**
   * PEINDRE n'est pas SIGNALER. Une page d'historique chargée par le haut, une
   * file hors ligne relue à l'ouverture et un message qui ARRIVE passent tous
   * par la même projection ; seul le dernier est une arrivée. La teinte
   * « neuve » est donc posée par l'appelant qui la signale — et retirée par
   * lui —, jamais par le peintre : mesuré avant, vingt-quatre lignes
   * d'historique restaient surlignées jusqu'au rechargement.
   */
  it('ne teinte rien de ce qu’elle peint — la classe « neuve » appartient à qui signale une arrivée', () => {
    const { p } = monte();
    const etat = insere({ bulles: bullesDuDocument(p), frappeurs: [], presents: [] }, arrivee({ id: 'm0', createdAt: '2026-09-01T11:00:00.000Z' }));
    const peintes = peins(p, etat, 0);
    expect(peintes.map((ligne) => ligne.dataset.id)).toEqual(['m0']);
    expect(p.liste.querySelectorAll('li.neuve')).toHaveLength(0);
  });

  /** Un auteur a UNE teinte et UNES initiales — `lib/avatar.ts`, lu par le serveur ET par le peintre. */
  it('donne à l’auteur peint la teinte et les initiales que le serveur lui donne', () => {
    const { p } = monte();
    peins(p, insere({ bulles: bullesDuDocument(p), frappeurs: [], presents: [] }, arrivee({ id: 'm3', senderId: 'u2', sender: { id: 'p2', displayName: 'Ibrahim' } })), 0);
    const servie = p.liste.querySelector<HTMLElement>('li[data-id="m1"] .avatar:not(.fantome)')!;
    const peinte = p.liste.querySelector<HTMLElement>('li[data-id="m3"] .avatar:not(.fantome)')!;
    expect(peinte.className).toBe(servie.className);
    expect(peinte.className).toContain(teinteDeLAvatar('Ibrahim'));
    expect(peinte.textContent).toBe(initiales('Ibrahim'));
    expect(peinte.textContent).toBe(servie.textContent);
  });

  it('donne le fantôme à un auteur anonyme, et cache ses initiales', () => {
    const { p } = monte();
    peins(p, insere({ bulles: bullesDuDocument(p), frappeurs: [], presents: [] }, arrivee({ id: 'm4', senderId: 'p9', sender: { id: 'p9', displayName: 'Tolu', type: 'anonymous' } })), 0);
    const ligne = p.liste.querySelector<HTMLElement>('li[data-id="m4"]')!;
    expect(ligne.querySelector<HTMLElement>('.avatar.fantome')?.hidden).toBe(false);
    expect(ligne.querySelector<HTMLElement>('.avatar:not(.fantome)')?.hidden).toBe(true);
    expect(ligne.querySelector<HTMLElement>('.anonyme')?.hidden).toBe(false);
  });

  it('passe à la langue du lecteur quand la traduction arrive, pastille et lang compris', () => {
    const { p } = monte();
    const anglais = arrivee({ id: 'm3', content: 'See you', originalLanguage: 'en', createdAt: '2026-09-01T12:06:00.000Z', senderId: 'u2', sender: { id: 'p2', displayName: 'Ibrahim' }, translations: [] });
    const avant = insere({ bulles: bullesDuDocument(p), frappeurs: [], presents: [] }, anglais);
    peins(p, avant, 0);
    const ligne = p.liste.querySelector<HTMLElement>('li[data-id="m3"]')!;
    expect(ligne.querySelector('.texte')?.textContent).toBe('See you');
    expect(ligne.querySelector('.texte')?.getAttribute('lang')).toBe('en');
    expect(ligne.querySelector<HTMLElement>('.langue')?.hidden).toBe(true);

    peins(p, traduit(avant, 'm3', [{ targetLanguage: 'fr', translatedContent: 'À plus' }], ['fr']), 0);
    expect(ligne.querySelector('.texte')?.textContent).toBe('À plus');
    expect(ligne.querySelector('.texte')?.getAttribute('lang')).toBeNull();
    expect(ligne.querySelector<HTMLElement>('.langue')?.hidden).toBe(false);
    expect(ligne.querySelector<HTMLElement>('details.original')?.hidden).toBe(false);
  });

  it('peint une bulle optimiste en attente, puis la confirme sans la déplacer', () => {
    const { p } = monte();
    const optimiste = bulleOptimiste({ clientMessageId: 'cid_1', texte: 'Salut', auteur: 'Amina', auteurId: 'u1', langue: 'fr', horsLigne: false, maintenant: Date.parse('2026-09-01T12:10:00.000Z') });
    const etat = insere({ bulles: bullesDuDocument(p), frappeurs: [], presents: [] }, optimiste);
    peins(p, etat, 0);
    const ligne = p.liste.querySelector<HTMLElement>('li[data-cid="cid_1"]')!;
    expect(ligne.classList.contains('envoi-attente')).toBe(true);
    expect(ligne.classList.contains('mien')).toBe(true);
    expect(ligne.querySelector('.nom')?.textContent).toBe(FIL.vous);

    const confirmee = arrivee({ id: 'm9', content: 'Salut', originalLanguage: 'fr', clientMessageId: 'cid_1', createdAt: '2026-09-01T12:10:01.000Z', senderId: 'u1', sender: { id: 'p1', displayName: 'Amina' }, translations: [] });
    peins(p, insere(etat, confirmee), 0);
    expect(p.liste.querySelectorAll('li.ligne')).toHaveLength(2);
    expect(ligne.dataset.id).toBe('m9');
    expect(ligne.classList.contains('envoi-attente')).toBe(false);
  });

  /** La servie a devancé l'accusé SANS `clientMessageId` (envoi anonyme par la route) : l'optimiste s'efface, sa ligne aussi. */
  it('retire la ligne optimiste que la bulle servie a remplacée', () => {
    const { p } = monte();
    const optimiste = bulleOptimiste({ clientMessageId: 'cid_2', texte: 'Salut', auteur: 'Amina', auteurId: 'u1', langue: 'fr', horsLigne: false, maintenant: Date.parse('2026-09-01T12:10:00.000Z') });
    const avecServie = insere(insere({ bulles: bullesDuDocument(p), frappeurs: [], presents: [] }, optimiste), arrivee({ id: 'm9', content: 'Salut', originalLanguage: 'fr', senderId: 'u1', sender: { id: 'p1', displayName: 'Amina' }, translations: [], createdAt: '2026-09-01T12:10:01.000Z' }));
    peins(p, avecServie, 0);
    expect(p.liste.querySelectorAll('li.ligne')).toHaveLength(3);

    peins(p, confirme(avecServie, 'cid_2', 'm9'), 0);
    expect(p.liste.querySelectorAll('li.ligne')).toHaveLength(2);
    expect(p.liste.querySelector('li[data-cid="cid_2"]')).toBeNull();
    expect(p.liste.querySelector('li[data-id="m9"]')).not.toBeNull();
  });

  it('peint qui écrit', () => {
    const { p } = monte();
    peins(p, { ...ETAT_VIDE, frappeurs: [{ id: 'u2', nom: 'Ibrahim' }] }, 0);
    expect(p.frappe?.hidden).toBe(false);
    expect(p.frappe?.textContent).toBe(`Ibrahim ${FIL.frappe}`);
  });
});

describe('une parole retirée', () => {
  it('montre sa mention — la même que le serveur — et perd tout ce qui la citait', () => {
    const { p } = monte();
    const etat = retire({ bulles: bullesDuDocument(p), frappeurs: [], presents: [] }, 'm1');
    peins(p, etat, 0);
    const ligne = p.liste.querySelector<HTMLElement>('li[data-id="m1"]')!;
    expect(ligne.classList.contains('supprime')).toBe(true);
    expect(ligne.querySelector('.texte')?.textContent).toBe(FIL.supprime);
    expect(ligne.querySelector('.texte')?.getAttribute('lang')).toBeNull();
    expect(ligne.querySelector<HTMLElement>('details.original')?.hidden).toBe(true);
    expect(ligne.querySelector<HTMLElement>('.langue')?.hidden).toBe(true);
    expect(ligne.querySelector<HTMLElement>('ul.reactions')?.hidden).toBe(true);
    expect(ligne.querySelector('.reagir')).toBeNull();
  });
});

describe('les réactions', () => {
  it('clone le bouton « Réagir » dans chaque ligne, et le retire quand la porte se ferme', () => {
    const { p } = monte();
    peins(p, insere({ bulles: bullesDuDocument(p), frappeurs: [], presents: [] }, arrivee()), 0);
    expect(p.liste.querySelectorAll('li.ligne button.reagir')).toHaveLength(2);
    expect(p.liste.querySelector('button.reagir')?.getAttribute('aria-label')).toBe(FIL.reagir);
    retireLesControlesDeReaction(p);
    expect(p.liste.querySelectorAll('button.reagir')).toHaveLength(0);
  });

  it('peint chaque pastille comme le formulaire servi, aria-pressed disant la mienne', () => {
    const { p } = monte();
    const etat = reagit(reagit({ bulles: bullesDuDocument(p), frappeurs: [], presents: [] }, 'm1', '👍', 2, false), 'm1', '❤️', 1, true);
    peins(p, etat, 0);
    const liste = p.liste.querySelector<HTMLElement>('li[data-id="m1"] ul.reactions')!;
    expect(liste.hidden).toBe(false);
    const pouce = liste.querySelector<HTMLElement>('li[data-emoji="👍"]')!;
    expect(pouce.querySelector('form.reagir-par')?.getAttribute('method')).toBe('post');
    expect(pouce.querySelector<HTMLInputElement>('input[name="reaction"]')?.value).toBe('👍');
    expect(pouce.querySelector<HTMLInputElement>('input[name="message"]')?.value).toBe('m1');
    expect(pouce.querySelector('button.reaction')?.getAttribute('aria-pressed')).toBe('false');
    expect(pouce.querySelector('.nombre')?.textContent).toBe('2');
    expect(liste.querySelector('li[data-emoji="❤️"] button.reaction')?.getAttribute('aria-pressed')).toBe('true');

    peins(p, reagit(etat, 'm1', '👍', 0), 0);
    expect(liste.querySelector('li[data-emoji="👍"]')).toBeNull();
  });

  it('ouvre la palette clonée du gabarit, une fois, et rend l’emoji choisi', async () => {
    const { p } = monte();
    HTMLDialogElement.prototype.showModal = function ouvre(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    const choix = choisisUneReaction(p);
    const palette = document.body.querySelector<HTMLDialogElement>('dialog.palette')!;
    expect(palette.hasAttribute('open')).toBe(true);
    expect(palette.querySelectorAll('button.emoji')).toHaveLength(6);
    palette.returnValue = '❤️';
    palette.dispatchEvent(new Event('close'));
    expect(await choix).toBe('❤️');

    void choisisUneReaction(p);
    expect(document.body.querySelectorAll('dialog.palette')).toHaveLength(1);
  });
});

/**
 * LA LIGNE DU LECTEUR porte le nom « Vous » — et c'est ce nom que le module
 * relisait comme AUTEUR : au premier tour de peinture, mes lignes servies
 * perdaient leurs initiales (« AD » devenait « V ») et changeaient de teinte,
 * sous les yeux du lecteur. Un même auteur a UNE couleur, servie ou peinte
 * (`lib/avatar.ts`) — c'est exactement la jumelle que ce module interdit.
 */
describe('la ligne du lecteur', () => {
  const mienne = message(
    { id: 'm0', content: 'Bien reçu', originalLanguage: 'fr', createdAt: '2026-09-01T11:59:00.000Z', senderId: 'u1', sender: { id: 'p1', displayName: 'Amina Diallo' } },
    'u1',
    LANGUES,
    ORIGINE,
  );

  const monteAvecLaMienne = () => {
    const etat = etatServi();
    document.open();
    document.write(documentDuFil({ ...etat, fil: { ...etat.fil, messages: [...(mienne === null ? [] : [mienne]), ...etat.fil.messages] }, lecteur: { ...etat.lecteur, nom: 'Amina Diallo' } }));
    document.close();
    const main = document.querySelector<HTMLElement>('main')!;
    return { main, p: peintre(main)! };
  };

  it('garde ses initiales et sa teinte quand le module relit puis repeint le document — jamais celles du mot « Vous »', () => {
    const { p } = monteAvecLaMienne();
    const avatar = p.liste.querySelector<HTMLElement>('li[data-id="m0"] .avatar:not(.fantome)')!;
    expect(avatar.textContent).toBe(initiales('Amina Diallo'));
    expect(bullesDuDocument(p).find((b) => b.id === 'm0')?.auteur).toBe('Amina Diallo');

    peins(p, { bulles: bullesDuDocument(p), frappeurs: [], presents: [] }, 0);
    expect(avatar.textContent).toBe(initiales('Amina Diallo'));
    expect(avatar.classList.contains(teinteDeLAvatar('Amina Diallo'))).toBe(true);
    expect(p.liste.querySelector('li[data-id="m0"] .nom')?.textContent).toBe(FIL.vous);
  });
});

/**
 * « N en ligne » est une FENTE de l'en-tête : le serveur l'a servie avec le
 * compte de la page, le module la repeint depuis l'état — et la tait à zéro,
 * comme le serveur le fait.
 */
describe('la présence dans l’en-tête', () => {
  /**
   * La conversation du harnais compte DEUX membres : depuis la directive
   * § 12.10.2, son compte de participants se tait, donc rien ne précède la
   * fente et la phrase n'a pas de séparateur (cf. le témoin de parité, plus
   * haut, qui oppose les deux cas).
   */
  it('repeint « N en ligne » depuis l’état, et le cache à zéro', () => {
    const { main, p } = monte();
    const fente = main.querySelector<HTMLElement>('.fil-tete .en-ligne')!;
    expect(fente.hidden).toBe(true);
    const etat = { bulles: bullesDuDocument(p), frappeurs: [], presents: [] };
    peins(p, presence(etat, ['u2'], { id: 'u2', enLigne: true }), 0);
    expect(fente.hidden).toBe(false);
    expect(fente.textContent).toBe(`1 ${FIL.enLigne}`);
    peins(p, etat, 0);
    expect(fente.hidden).toBe(true);
  });
});

/**
 * LES SIX FORMES, PEINTES (issue #4835). Le module ne compose aucune balise :
 * il clone le gabarit et remplit les fentes. Le témoin de fond est le même que
 * pour le reste du fil — une bulle RICHE peinte en direct et une bulle riche
 * SERVIE portent le même balisage, les mêmes classes et le même libellé,
 * parce qu'ils viennent des mêmes modules (`fil-lignes.ts`, `lib/contenu/fil.ts`).
 */
describe('une bulle riche qui arrive', () => {
  const PIECE_AUDIO = {
    id: 'a1',
    fileUrl: '/api/v1/attachments/file/2026/vocal.m4a',
    originalName: 'vocal.m4a',
    mimeType: 'audio/mp4',
    fileSize: 96_000,
    duration: 21_000,
    transcription: { text: 'Mo n mú àwọn nọ́mbà', language: 'yo' },
    translations: { fr: { transcription: 'J’apporte les chiffres de mars.', url: '/api/v1/attachments/file/2026/vocal-fr.m4a' } },
  };

  const peinsUne = (attributs: Record<string, unknown>) => {
    const { p } = monte();
    const etat = insere({ bulles: bullesDuDocument(p), frappeurs: [], presents: [] }, arrivee(attributs));
    peins(p, etat, 0);
    return { p, ligne: p.liste.querySelector<HTMLElement>('li[data-id="m2"]')! };
  };

  it('peint un vocal : UN bloc, un lecteur qui joue la PISTE de la langue servie', () => {
    const { ligne } = peinsUne({ content: '', translations: [], attachments: [PIECE_AUDIO] });
    const item = ligne.querySelector<HTMLLIElement>('ul.pieces > li')!;
    expect(item.dataset.genre).toBe('audio');
    // UN bloc : le lecteur. L'affiche de téléchargement a quitté le clone.
    expect(item.querySelector('a.media')).toBeNull();
    expect(item.querySelector('video')).toBeNull();
    expect(item.querySelector('details.lecteur > summary .poids')?.textContent).toBe('0:21 · 94 Ko');
    expect(item.querySelector<HTMLAudioElement>('audio')?.getAttribute('src')).toBe('https://gate.test/api/v1/attachments/file/2026/vocal-fr.m4a');
    expect(item.querySelector('.transcription')?.textContent).toContain('J’apporte les chiffres de mars.');
    // Le transcrit DIT ce qu'il sert, et son original est à un geste.
    expect(item.querySelector('.transcrit')?.textContent).toBe(FIL.transcrit('yo', 'fr'));
    expect(item.querySelector<HTMLElement>('details.transcrit-original')?.hidden).toBe(false);
    expect(item.querySelector('details.transcrit-original p')?.textContent).toBe('Mo n mú àwọn nọ́mbà');
    expect(ligne.querySelector<HTMLElement>('.meta .langue')?.hidden).toBe(false);
    expect(ligne.querySelector('.meta .langue .code')?.textContent).toBe('yo');
    // La FICHE mène à la tranche qui porte le vocal, jamais à l'adresse nue.
    expect(item.querySelector<HTMLAnchorElement>('a.fiche')?.getAttribute('href')).toBe('/chats/c1?autour=m2&media=a1');
  });

  /**
   * LA PUCE « FICHE » N'EXISTE QUE S'IL Y A UNE FICHE. La transcription arrive
   * APRÈS le vocal (Whisper, puis NLLB) : peindre la puce dès l'arrivée du
   * message ouvrait, pendant tout ce temps, une fiche VIDE — un contrôle sans
   * effet portant le nom de ce qu'il ne livre pas (charte règle 7).
   */
  it('ne peint AUCUNE fiche sur un vocal dont la transcription n’est pas revenue', () => {
    const { ligne } = peinsUne({
      content: '',
      translations: [],
      attachments: [{ ...PIECE_AUDIO, transcription: undefined, translations: {} }],
    });
    const item = ligne.querySelector<HTMLLIElement>('ul.pieces > li')!;
    expect(item.dataset.genre).toBe('audio');
    expect(item.querySelector('details.lecteur')).not.toBeNull();
    expect(item.querySelector('a.fiche')).toBeNull();
    expect(item.querySelector('.transcription')).toBeNull();
  });

  /**
   * UNE PIÈCE LOCALE N'OUVRE RIEN. La bulle optimiste porte ses pièces NOMMÉES
   * et PESÉES, sans adresse (`piecesLocales`) : tant que rien n'est parti, il
   * n'y a ni fichier à ouvrir ni plein écran à servir — et un lien sans `href`
   * n'est pas un contrôle (charte règle 7).
   */
  it('ne pose aucun lien sur la pièce d’une bulle qui n’est pas encore partie', () => {
    const { p } = monte();
    const locale = {
      ...bulleOptimiste({ clientMessageId: 'cid-1', texte: '', auteur: 'Amina', auteurId: 'u1', langue: 'fr', horsLigne: false, maintenant: 0 }),
      pieces: [
        {
          id: 'cid-1:0',
          genre: 'image' as const,
          nom: 'photo.jpg',
          url: '',
          piste: '',
          octets: 96_000,
          dureeMs: null,
          largeur: null,
          hauteur: null,
          transcription: null,
          transcriptionOriginale: null,
          langueDeTranscription: null,
          langueServie: null,
        },
      ],
    };
    peins(p, insere({ bulles: bullesDuDocument(p), frappeurs: [], presents: [] }, locale), 0);
    const affiche = p.liste.querySelector<HTMLAnchorElement>('li[data-cid="cid-1"] a.media');
    expect(affiche).not.toBeNull();
    expect(affiche?.getAttribute('href')).toBeNull();
  });

  /**
   * UNE VIDÉO EST UNE AFFICHE QUI MÈNE AU PLEIN ÉCRAN (§ 12.10.1) — plus un
   * lecteur posé dans la ligne : c'est la surimpression `?media=` qui la joue,
   * et la ligne n'embarque donc AUCUN `<video>`. Le Prisme, lui, reste dit dans
   * la ligne, et rien n'y promet des sous-titres que la passerelle n'expose pas.
   */
  it('peint une vidéo : une affiche vers le plein écran, et AUCUNE promesse de sous-titres', () => {
    const { ligne } = peinsUne({
      content: '',
      translations: [],
      attachments: [{ ...PIECE_AUDIO, id: 'a2', mimeType: 'video/mp4', originalName: 'revue.mp4', translations: { fr: { transcription: 'Bonjour' } } }],
    });
    const item = ligne.querySelector<HTMLLIElement>('ul.pieces > li')!;
    expect(item.dataset.genre).toBe('video');
    expect(item.querySelector('audio')).toBeNull();
    expect(item.querySelector('video')).toBeNull();
    // L'adresse nomme la TRANCHE autant que la pièce : la ligne PEINTE mène là
    // où mène la ligne servie, et la pièce s'ouvre quelle que soit la
    // profondeur d'historique où le module l'a posée.
    expect(item.querySelector<HTMLAnchorElement>('a.media')?.getAttribute('href')).toBe('/chats/c1?autour=m2&media=a2');
    expect(item.querySelector<HTMLAnchorElement>('a.media')?.getAttribute('target')).toBeNull();
    expect(item.querySelector('.transcrit')?.textContent).toBe(FIL.transcrit('yo', 'fr'));
    expect(ligne.innerHTML).not.toContain('Sous-titres');
    expect(item.querySelector('track')).toBeNull();
  });

  it.each([
    [{ forwardedFromId: 'x1', forwardedFromConversation: { id: 'c9', title: 'Diaspora FR-EN' } }, 'transfert', 'Transféré depuis Diaspora FR-EN'],
    [{ replyToId: 'm1', replyTo: { id: 'm1', content: 'Le tableau final', originalLanguage: 'en', sender: { id: 'p2', displayName: 'Ibrahim' } } }, 'reponse', 'En réponse à Ibrahim'],
    [
      { storyReplyToId: 's1', postReplyTo: { id: 's1', type: 'STORY', previewText: 'Trois graphiques', authorId: 'u1', authorName: 'Amina' } },
      'story',
      'A répondu à votre story',
    ],
  ])('peint la citation %#, du genre %s, avec son libellé', (charge, genre, libelle) => {
    const { ligne } = peinsUne(charge);
    const citation = ligne.querySelector<HTMLElement>('ul.citations li.citation')!;
    expect(ligne.querySelector<HTMLElement>('ul.citations')?.hidden).toBe(false);
    expect(citation.dataset.genre).toBe(genre);
    expect(citation.querySelector('.quoi')?.textContent).toBe(libelle);
  });

  /**
   * LA CITATION SUIT SA CIBLE quand la cible est dans le fil : `m1` est déjà
   * peint en français, l'aperçu qui le cite l'est aussi. Servir ici l'original
   * anglais ferait DEUX TEXTES pour un même message sur le même écran (cycle
   * 122) — le défaut que `citationsDeLaPage` referme des deux côtés.
   */
  it('cite ce que la bulle CIBLE affiche quand elle est dans le fil', () => {
    const { ligne } = peinsUne({ replyToId: 'm1', replyTo: { id: 'm1', content: 'Hello', originalLanguage: 'en', sender: { id: 'p2', displayName: 'Ibrahim' } } });
    const apercu = ligne.querySelector<HTMLElement>('.citation .apercu')!;
    expect(apercu.textContent).toBe('Bonjour');
    expect(apercu.getAttribute('lang')).toBeNull();
  });

  /** Cible HORS du fil : ce que la passerelle a servi reste ce qui s'affiche, avec sa langue (régime 3). */
  it('pose lang= sur l’aperçu d’un message cité qui n’est PAS dans le fil', () => {
    const { ligne } = peinsUne({ replyToId: 'x9', replyTo: { id: 'x9', content: 'Le tableau final', originalLanguage: 'en', sender: { id: 'p2', displayName: 'Ibrahim' } } });
    const apercu = ligne.querySelector<HTMLElement>('.citation .apercu')!;
    expect(apercu.textContent).toBe('Le tableau final');
    expect(apercu.getAttribute('lang')).toBe('en');
  });

  /**
   * Le module RELIT le document servi pour son état initial, et n'en
   * reconstruit ni les pièces ni les citations : repeindre cet état ne doit
   * effacer NI l'une NI l'autre. C'est la même adoption que pour les pièces —
   * `data-cite` distingue une citation servie du gabarit, dont la cible est vide.
   */
  it('n’efface pas les citations qu’une ligne SERVIE porte quand le module repeint son état', () => {
    const cite = message(
      {
        id: 'm9',
        content: 'Je le mets dans le dossier de mars.',
        originalLanguage: 'fr',
        createdAt: '2026-09-01T12:10:00.000Z',
        senderId: 'u2',
        sender: { id: 'p2', displayName: 'Ibrahim' },
        replyToId: 'm1',
        replyTo: { id: 'm1', content: 'Le tableau final', originalLanguage: 'en', sender: { id: 'p2', displayName: 'Ibrahim' } },
      },
      'u1',
      LANGUES,
      ORIGINE,
    )!;
    const etat = etatServi();
    document.open();
    document.write(documentDuFil({ ...etat, fil: { ...etat.fil, messages: [...etat.fil.messages, cite] } }));
    document.close();
    const p = peintre(document.querySelector<HTMLElement>('main')!)!;
    expect(p.liste.querySelectorAll('li[data-id="m9"] .citation')).toHaveLength(1);

    peins(p, { bulles: bullesDuDocument(p), frappeurs: [], presents: [] }, 0);
    expect(p.liste.querySelectorAll('li[data-id="m9"] .citation')).toHaveLength(1);
    expect(p.liste.querySelector('li[data-id="m9"] .citation .quoi')?.textContent).toBe('En réponse à Ibrahim');
  });
});

/**
 * **UNE LIGNE SERVIE QUI APPREND SA TRANSCRIPTION** — le chemin le plus
 * courant, et celui où le défaut vivait.
 *
 * `bullesDuDocument` pose `pieces: []` sur TOUTE ligne servie : le premier
 * `peins` d'un vocal déjà à l'écran passait donc par `remplisLesPieces` avec un
 * tableau vide, et l'ancienne garde de tête (`|| pieces.length === 0`) sortait
 * AVANT l'estampille. `data-empreinte` restait indéfini, si bien que le PREMIER
 * `audio:transcription-ready` tombait dans la branche d'ADOPTION du DOM servi :
 * elle estampillait l'empreinte NEUVE et rendait sans rien peindre. La
 * transcription n'apparaissait jamais, et le lecteur continuait d'entendre la
 * piste ORIGINALE alors que la française était calculée (cycle 128). Seul un
 * SECOND événement peignait.
 *
 * Le témoin d'avant émettait `message:new` AVANT l'événement audio : la ligne y
 * était PEINTE, jamais servie — écrit sur le seul chemin où le défaut n'existe
 * pas (leçon 261). Celui-ci part du document.
 */
describe('le premier audio:*-ready d’un vocal SERVI', () => {
  const VOCAL = (transcription: Record<string, unknown> | null) => ({
    id: 'v1',
    content: '',
    originalLanguage: 'yo',
    createdAt: '2026-09-01T12:02:00.000Z',
    senderId: 'u2',
    sender: { id: 'p2', displayName: 'Ibrahim' },
    attachments: [
      {
        id: 'av1',
        fileUrl: '/api/v1/attachments/file/2026/vocal.m4a',
        originalName: 'vocal.m4a',
        mimeType: 'audio/mp4',
        fileSize: 96_000,
        duration: 21_000,
        ...(transcription ?? {}),
      },
    ],
  });

  const monteLeVocal = () => {
    const etat = etatServi();
    const servi = message(VOCAL(null), 'u1', LANGUES, ORIGINE)!;
    document.open();
    document.write(documentDuFil({ ...etat, fil: { ...etat.fil, messages: [servi] } }));
    document.close();
    return peintre(document.querySelector<HTMLElement>('main')!)!;
  };

  const etatDuVocalTranscrit = (p: ReturnType<typeof peintre> & object) =>
    insere(
      { bulles: bullesDuDocument(p), frappeurs: [], presents: [] },
      depuisLaCharge(
        VOCAL({
          transcription: { text: 'Mo n mú àwọn nọ́mbà', language: 'yo' },
          translations: { fr: { transcription: 'J’apporte les chiffres de mars.', url: '/api/v1/attachments/file/2026/vocal-fr.m4a' } },
        }),
        'u1',
        LANGUES,
        ORIGINE,
      )!,
    );

  it('peint la transcription et la piste servie DÈS le premier événement', () => {
    const p = monteLeVocal();
    // Ce que le document sert : un lecteur sur la piste d'ORIGINE, sans transcrit.
    expect(p.liste.querySelector<HTMLAudioElement>('li[data-id="v1"] audio')?.getAttribute('src')).toBe(
      'https://gate.test/api/v1/attachments/file/2026/vocal.m4a',
    );
    expect(p.liste.querySelector<HTMLElement>('li[data-id="v1"] .transcription')).toBeNull();

    // Le module relit son état initial (`pieces: []`), puis l'événement arrive.
    peins(p, { bulles: bullesDuDocument(p), frappeurs: [], presents: [] }, 0);
    peins(p, etatDuVocalTranscrit(p), 0);

    const ligne = p.liste.querySelector<HTMLElement>('li[data-id="v1"]')!;
    expect(ligne.querySelector('.texte-transcrit')?.textContent).toBe('J’apporte les chiffres de mars.');
    expect(ligne.querySelector<HTMLElement>('.transcription')?.hidden).toBe(false);
    expect(ligne.querySelector<HTMLAudioElement>('audio')?.getAttribute('src')).toBe(
      'https://gate.test/api/v1/attachments/file/2026/vocal-fr.m4a',
    );
    expect(ligne.querySelector('.transcrit')?.textContent).toBe(FIL.transcrit('yo', 'fr'));
    expect(ligne.querySelector<HTMLElement>('.meta .langue')?.hidden).toBe(false);
  });

  it('n’efface pas les pièces qu’une ligne SERVIE porte quand le module repeint son état', () => {
    const p = monteLeVocal();
    peins(p, { bulles: bullesDuDocument(p), frappeurs: [], presents: [] }, 0);
    expect(p.liste.querySelectorAll('li[data-id="v1"] ul.pieces > li')).toHaveLength(1);
    expect(p.liste.querySelector<HTMLElement>('li[data-id="v1"] ul.pieces')?.hidden).toBe(false);
  });

  /**
   * MAIS ELLE SE RETIRE QUAND L'ÉTAT PORTE LA PREUVE. « Ne pas contredire le
   * document » n'est pas « ne jamais retirer » : sur une ligne SANS pièce, ou
   * sur une bulle dont l'état porte ses pièces, l'absence d'annonce est une
   * information — et la pastille tombe.
   */
  it('retire la pastille d’une bulle sans traduction dont l’état porte tout', () => {
    const p = monteLeVocal();
    const sansPrisme = message(
      { ...VOCAL(null), id: 'v2', content: 'Bonjour', originalLanguage: 'fr', createdAt: '2026-09-01T12:04:00.000Z' },
      'u1',
      LANGUES,
      ORIGINE,
    )!;
    peins(p, insere({ bulles: [], frappeurs: [], presents: [] }, { ...sansPrisme, envoi: 'servi', raison: null }), 0);
    expect(p.liste.querySelector<HTMLElement>('li[data-id="v2"] .meta .langue')?.hidden).toBe(true);
  });

  /**
   * ET N'EFFACE PAS NON PLUS CE QUE LES PIÈCES ANNONCENT. `bullesDuDocument`
   * pose `pieces: []` : une pastille dont la source est un VOCAL traduit n'est
   * connue que du document. Le module la MONTRE quand l'état la porte, il ne la
   * RETIRE que sur une preuve — une parole retirée.
   */
  it('garde la pastille qu’un vocal traduit a fait SERVIR, au premier repeint', () => {
    const etat = etatServi();
    const servi = message(
      VOCAL({
        transcription: { text: 'Mo n mú àwọn nọ́mbà', language: 'yo' },
        translations: { fr: { transcription: 'J’apporte les chiffres de mars.' } },
      }),
      'u1',
      LANGUES,
      ORIGINE,
    )!;
    document.open();
    document.write(documentDuFil({ ...etat, fil: { ...etat.fil, messages: [servi] } }));
    document.close();
    const p = peintre(document.querySelector<HTMLElement>('main')!)!;
    expect(p.liste.querySelector('li[data-id="v1"] .meta .langue .code')?.textContent).toBe('yo');

    peins(p, { bulles: bullesDuDocument(p), frappeurs: [], presents: [] }, 0);
    expect(p.liste.querySelector<HTMLElement>('li[data-id="v1"] .meta .langue')?.hidden).toBe(false);
    expect(p.liste.querySelector('li[data-id="v1"] .meta .langue .code')?.textContent).toBe('yo');
  });
});

/**
 * **UNE TABLE, DEUX RENDUS** (défaut de revue croisée, issue #4835). Pour CHAQUE
 * genre de `FORME_PAR_GENRE`, la ligne SERVIE et la ligne PEINTE montent le
 * même jeu d'éléments. Écrite en comparaisons littérales de genre dans le
 * peintre, la règle était une seconde table : donner un lecteur à un genre neuf
 * changeait la ligne servie sans changer la ligne peinte, et il fallait
 * recharger pour voir le lecteur apparaître.
 */
describe('la forme d’une pièce dérive d’UNE table, servie comme peinte', () => {
  const MIME: Readonly<Record<string, string>> = {
    image: 'image/jpeg',
    video: 'video/mp4',
    audio: 'audio/mp4',
    fichier: 'application/pdf',
  };

  const chargeAvecPiece = (genre: string) => ({
    id: `g-${genre}`,
    content: '',
    originalLanguage: 'fr',
    createdAt: '2026-09-01T12:03:00.000Z',
    senderId: 'u2',
    sender: { id: 'p2', displayName: 'Ibrahim' },
    attachments: [
      { id: `a-${genre}`, fileUrl: `/api/v1/attachments/file/2026/f.${genre}`, originalName: `f.${genre}`, mimeType: MIME[genre], fileSize: 96_000, duration: 21_000 },
    ],
  });

  const elements = (racine: Element): readonly string[] =>
    [...racine.querySelectorAll('*')].map((noeud) => `${noeud.tagName.toLowerCase()}.${noeud.className || '—'}`);

  it.each(GENRES_DE_PIECE)('monte le même balisage pour le genre %s', (genre) => {
    const etat = etatServi();
    const servi = message(chargeAvecPiece(genre), 'u1', LANGUES, ORIGINE)!;

    document.open();
    document.write(documentDuFil({ ...etat, fil: { ...etat.fil, messages: [servi] } }));
    document.close();
    const p = peintre(document.querySelector<HTMLElement>('main')!)!;
    const attendu = elements(p.liste.querySelector(`li[data-id="g-${genre}"] ul.pieces > li`)!);

    // La même pièce, PEINTE : le module clone le gabarit et le dépouille.
    peins(p, insere({ bulles: [], frappeurs: [], presents: [] }, depuisLaCharge({ ...chargeAvecPiece(genre), id: `p-${genre}` }, 'u1', LANGUES, ORIGINE)!), 0);
    const peinte = elements(p.liste.querySelector(`li[data-id="p-${genre}"] ul.pieces > li`)!);

    expect(peinte).toEqual(attendu);
    expect(attendu.length).toBeGreaterThan(0);
  });
});

/**
 * LE MENU D'UNE LIGNE PEINTE (issue #5163) — une ligne reçue en direct naît
 * d'un CLONE du gabarit, qui porte déjà son `<details class="actions">` : ce
 * qu'un menu doit à sa ligne (son nom accessible, l'identifiant de ses
 * boutons, l'action de son formulaire) se pose donc à CHAQUE peinture, jamais
 * au seul clonage. Sans cela, chaque message reçu portait un `<summary>` SANS
 * NOM — « Summary elements must have discernible text », violation axe
 * SERIOUS, mesurée par `e2e/visual/v3-fil-a11y.spec.ts`.
 */
describe('le menu d’une ligne PEINTE dit à qui il appartient', () => {
  const MAINTENANT = Date.parse('2026-09-01T12:30:00.000Z');

  it('nomme son summary, pose l’action et l’identifiant sur chaque bouton', () => {
    const { p } = monte();
    const etat = { bulles: bullesDuDocument(p), frappeurs: [], presents: [] };
    peins(p, insere(etat, arrivee()), MAINTENANT);

    const menu = p.liste.querySelector<HTMLElement>('li[data-id="m2"] details.actions')!;
    expect(menu.querySelector('summary .hors-ecran')?.textContent).toBe(FIL.actionsSurLeMessage('Marta Ruiz'));
    expect(menu.querySelector('form')?.getAttribute('action')).toBe('/chats/c1');
    expect(menu.querySelector<HTMLButtonElement>('button[name="repondre"]')?.value).toBe('m2');
    // Le message d'AUTRUI ne se modifie ni ne se retire : les deux boutons sont là mais MASQUÉS.
    expect(menu.querySelector<HTMLButtonElement>('button[name="modifier"]')?.hidden).toBe(true);
    expect(menu.querySelector<HTMLButtonElement>('button[name="retirer"]')?.hidden).toBe(true);
  });

  it('« modifié » APPARAÎT sur une ligne servie que l’édition atteint en direct', () => {
    const { p } = monte();
    const etat = { bulles: bullesDuDocument(p), frappeurs: [], presents: [] };
    // La ligne servie de m1 n'était PAS éditée : le document ne porte donc
    // aucun `.modifie` à révéler — il faut le poser.
    expect(p.liste.querySelector('li[data-id="m1"] .modifie')).toBeNull();
    const apres = { ...etat, bulles: etat.bulles.map((b) => (b.id === 'm1' ? { ...b, edite: true, texte: 'Bonjour, corrigé' } : b)) };
    peins(p, apres, MAINTENANT);
    const mention = p.liste.querySelector<HTMLElement>('li[data-id="m1"] .modifie');
    expect(mention).not.toBeNull();
    expect(mention!.hidden).toBe(false);
    expect(mention!.textContent).toBe(FIL.modifie);
  });
});

/**
 * UN LIEU PARTAGÉ QUI ARRIVE EN DIRECT (#5061) — la ligne peinte porte le
 * MÊME `.lieu-lien` que la ligne servie (`app/connecte/fil-lignes.ts` ›
 * `lieuHtml`), cloné du gabarit et rempli par `remplisLeLieu`
 * (`fil-peinture.ts`) — jamais composé à part.
 */
describe('un lieu partagé qui arrive en direct, et se relit du document', () => {
  const MAINTENANT = Date.parse('2026-09-01T12:30:00.000Z');

  it('peint .lieu-lien (href geo:), le nom et l’adresse — jamais deux nombres bruts', () => {
    const { p } = monte();
    const etat = { bulles: bullesDuDocument(p), frappeurs: [], presents: [] };
    const bulleAvecLieu = arrivee({ content: '', location: { latitude: 6.5244, longitude: 3.3792, name: 'Marché de Balogun' } });
    peins(p, insere(etat, bulleAvecLieu), MAINTENANT);

    const ligne = p.liste.querySelector<HTMLElement>('li[data-id="m2"]')!;
    const lien = ligne.querySelector<HTMLAnchorElement>('.lieu-lien')!;
    expect(lien.getAttribute('href')).toBe('geo:6.5244,3.3792');
    expect(ligne.querySelector('.nom-du-lieu')?.textContent).toBe('Marché de Balogun');
  });

  it('ne retire JAMAIS un lieu déjà peint — un repeint identique le laisse en place', () => {
    const { p } = monte();
    const etat = { bulles: bullesDuDocument(p), frappeurs: [], presents: [] };
    const avecLieu = insere(etat, arrivee({ content: '', location: { latitude: 1, longitude: 2 } }));
    peins(p, avecLieu, MAINTENANT);
    // Un second passage — la même bulle, mais l'état RELU du document (bullesDuDocument)
    // ne reconstruit pas `lieu` : il ne doit PAS effacer ce qui est déjà peint.
    const relu = { bulles: bullesDuDocument(p), frappeurs: [], presents: [] };
    peins(p, relu, MAINTENANT);
    expect(p.liste.querySelector<HTMLElement>('li[data-id="m2"] .lieu-lien')).not.toBeNull();
  });

  it('bullesDuDocument relit un lieu SERVI depuis son geo: — round-trip exact', () => {
    document.open();
    document.write(
      documentDuFil({
        ...etatServi(),
        fil: {
          id: 'c1',
          titre: 'T',
          membres: 2,
          presence: { participants: [], presents: [] },
          messages: [
            message(
              { id: 'm9', content: '', createdAt: '2026-09-01T12:10:00.000Z', senderId: 'u2', sender: { id: 'p2', displayName: 'Ibrahim' }, location: { latitude: 48.8566, longitude: 2.3522, name: 'Le Central', address: '12 rue de Rivoli' } },
              'u1',
              LANGUES,
              ORIGINE,
            )!,
          ],
          plusAncien: null,
        },
      }),
    );
    document.close();
    const main = document.querySelector<HTMLElement>('main')!;
    const p = peintre(main)!;
    const bulles = bullesDuDocument(p);
    expect(bulles.find((b) => b.id === 'm9')?.lieu).toEqual({ latitude: 48.8566, longitude: 2.3522, nom: 'Le Central', adresse: '12 rue de Rivoli' });
  });

  it('un message SANS lieu relu du document rend lieu: null', () => {
    const { p } = monte();
    expect(bullesDuDocument(p).find((b) => b.id === 'm1')?.lieu).toBeNull();
  });
});
