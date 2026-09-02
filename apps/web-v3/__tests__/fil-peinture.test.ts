import { documentDuFil, type EtatDuFil } from '@/app/connecte/fil-vue';
import { message } from '@/lib/api/fil';
import { initiales, teinteDeLAvatar } from '@/lib/avatar';
import { FIL } from '@/lib/contenu/fil';
import { ETAT_VIDE, bulleOptimiste, confirme, depuisLaCharge, insere, presence, reagit, retire, traduit } from '@/lib/realtime/fil-etat';
import {
  bullesDuDocument,
  choisisUneReaction,
  peins,
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
  tempsReel: {
    passerelle: 'https://gate.test',
    actifs: { participate: { nom: 'p.js', url: '/__v3/rt/p.js', corps: '' }, socket: { nom: 's.js', url: '/__v3/rt/s.js', corps: '' } },
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
    // Les fentes des deux rendus portent les mêmes classes : rien n'a été composé.
    const servie = p.liste.querySelector<HTMLElement>('li[data-id="m1"]')!;
    ['.avatar', '.qui .nom', '.texte', 'details.original', '.meta .langue', '.meta time', 'ul.reactions'].forEach((fente) => {
      expect(ligne.querySelector(fente)).not.toBeNull();
      expect(servie.querySelector(fente)).not.toBeNull();
    });
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
  it('repeint « N en ligne » depuis l’état, et le cache à zéro', () => {
    const { main, p } = monte();
    const fente = main.querySelector<HTMLElement>('.fil-tete .en-ligne')!;
    expect(fente.hidden).toBe(true);
    const etat = { bulles: bullesDuDocument(p), frappeurs: [], presents: [] };
    peins(p, presence(etat, ['u2'], { id: 'u2', enLigne: true }), 0);
    expect(fente.hidden).toBe(false);
    expect(fente.textContent).toBe(` · 1 ${FIL.enLigne}`);
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

  it('peint un vocal : l’affiche annonce durée et poids, le lecteur joue la PISTE de la langue servie', () => {
    const { ligne } = peinsUne({ content: '', translations: [], attachments: [PIECE_AUDIO] });
    const affiche = ligne.querySelector<HTMLAnchorElement>('a.media')!;
    expect(affiche.dataset.genre).toBe('audio');
    expect(affiche.href).toBe('https://gate.test/api/v1/attachments/file/2026/vocal.m4a');
    expect(ligne.querySelector('.poids')?.textContent).toBe('0:21 · 94 Ko');
    const lecteur = ligne.querySelector<HTMLAudioElement>('audio')!;
    expect(lecteur.hidden).toBe(false);
    expect(lecteur.getAttribute('src')).toBe('https://gate.test/api/v1/attachments/file/2026/vocal-fr.m4a');
    expect(ligne.querySelector('.transcription')?.textContent).toContain('J’apporte les chiffres de mars.');
    expect(ligne.querySelector<HTMLElement>('.sous-titres')?.hidden).toBe(true);
  });

  it('peint une vidéo : ses sous-titres disent la langue servie', () => {
    const { ligne } = peinsUne({
      content: '',
      translations: [],
      attachments: [{ ...PIECE_AUDIO, id: 'a2', mimeType: 'video/mp4', originalName: 'revue.mp4', translations: { fr: { transcription: 'Bonjour' } } }],
    });
    expect(ligne.querySelector<HTMLAnchorElement>('a.media')?.dataset.genre).toBe('video');
    expect(ligne.querySelector<HTMLElement>('.sous-titres')?.hidden).toBe(false);
    expect(ligne.querySelector('.sous-titres')?.textContent).toBe(FIL.sousTitres('fr'));
    expect(ligne.querySelector<HTMLVideoElement>('video')?.hidden).toBe(false);
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

  it('pose lang= sur l’aperçu d’un message cité écrit dans une autre langue', () => {
    const { ligne } = peinsUne({ replyToId: 'm1', replyTo: { id: 'm1', content: 'Le tableau final', originalLanguage: 'en', sender: { id: 'p2', displayName: 'Ibrahim' } } });
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
