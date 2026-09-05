import { axe } from 'jest-axe';

import { documentDesMedias, type EtatDesMedias } from '@/app/connecte/medias-vue';
import { message, type Message } from '@/lib/api/fil';
import { galerie } from '@/lib/api/medias';

/**
 * Gate B (§ 9.5) sur la GALERIE DES MÉDIAS : « 0 violation `axe`
 * `serious`/`critical` ». Le harnais est celui du fil — le document COMPLET,
 * tel que le gestionnaire le sert, avec `html-has-lang`, `landmark-one-main`,
 * `page-has-heading-one` et les `lang` des textes servis dans une autre langue
 * que celle du document.
 *
 * L'écran ne peut pas entrer dans le balayage automatique de
 * `v3-a11y.spec.ts` : celui-ci découvre les PAGES `(public)` que `next build` a
 * émises, et la galerie est un GESTIONNAIRE de route du groupe `(connected)` —
 * il n'apparaît dans aucun manifeste de page. Son gate vit donc ici, comme
 * celui du fil (`__tests__/fil-a11y.test.ts`), et se rejoue au navigateur dans
 * `e2e/visual/v3-medias.spec.ts`.
 */

const ORIGINE = 'https://gate.test';

const graves = async (): Promise<readonly string[]> => {
  const rapport = await axe(document.documentElement);
  return rapport.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id} — ${violation.help}`);
};

const ecris = (html: string): void => {
  document.open();
  document.write(html);
  document.close();
};

const lu = (brut: Record<string, unknown>, langues: readonly string[]): Message => {
  const resultat = message(brut, 'u1', langues, ORIGINE);
  if (resultat === null) throw new Error('message non lu');
  return resultat;
};

const PIECES: readonly Record<string, unknown>[] = [
  { id: 'a1', fileUrl: '/api/v1/attachments/file/t.jpg', originalName: 'tableau.jpg', mimeType: 'image/jpeg', fileSize: 430_080 },
  { id: 'a2', fileUrl: '/api/v1/attachments/file/r.mp4', originalName: 'revue.mp4', mimeType: 'video/mp4', fileSize: 3_100_000, duration: 42_000 },
  {
    id: 'a3',
    fileUrl: '/api/v1/attachments/file/v.m4a',
    originalName: 'vocal.m4a',
    mimeType: 'audio/mp4',
    fileSize: 96_000,
    duration: 21_000,
    transcription: { text: 'Mo n mú àwọn nọ́mbà oṣù Kẹta.', language: 'yo' },
    translations: { es: { transcription: 'Traigo las cifras de marzo.' } },
  },
  { id: 'a4', fileUrl: '2026/12/a4/budget.pdf', originalName: 'budget.pdf', mimeType: 'application/pdf', fileSize: 1_200_000 },
];

const messages = PIECES.map((piece, rang) =>
  lu(
    {
      id: `r${rang}`,
      content: '',
      originalLanguage: 'fr',
      createdAt: `2026-09-01T12:0${rang}:00.000Z`,
      senderId: 'u2',
      sender: { id: 'p2', displayName: 'Ibrahim' },
      attachments: [piece],
    },
    ['es', 'fr'],
  ),
);

const TEMPS_REEL_DES_MEDIAS = {
  passerelle: 'https://gate.test',
  actifs: {
    participate: { nom: 'participate.abc.js', url: '/__v3/rt/participate.abc.js', corps: '' },
    liste: { nom: 'liste.abc.js', url: '/__v3/rt/liste.abc.js', corps: '' },
    feed: { nom: 'feed.abc.js', url: '/__v3/rt/feed.abc.js', corps: '' },
    notifs: { nom: 'notifs.f.js', url: '/__v3/rt/notifs.f.js', corps: '' },
    contacts: { nom: 'contacts.f.js', url: '/__v3/rt/contacts.f.js', corps: '' },
    recherche: { nom: 'recherche.f.js', url: '/__v3/rt/recherche.f.js', corps: '' },
    liens: { nom: 'liens.f.js', url: '/__v3/rt/liens.f.js', corps: '' },
    commentaires: { nom: 'commentaires.f.js', url: '/__v3/rt/commentaires.f.js', corps: '' },
    plein: { nom: 'plein.abc.js', url: '/__v3/rt/plein.abc.js', corps: '' },
    navigateur: { nom: 'navigateur.abc.js', url: '/__v3/rt/navigateur.abc.js', corps: '' },
    composer: { nom: 'composer.abc.js', url: '/__v3/rt/composer.abc.js', corps: '' },
    socket: { nom: 'socket.io.def.js', url: '/__v3/rt/socket.io.def.js', corps: '' },
  },
};

const etat = (attributs: Partial<EtatDesMedias> = {}): EtatDesMedias => ({
  cle: 'c1',
  titre: 'Équipe Lagos',
  galerie: galerie({ messages, genre: null }),
  plusAncien: 'm0',
  avant: null,
  plein: null,
  tempsReel: TEMPS_REEL_DES_MEDIAS,
  ...attributs,
});

/** L'identifiant de l'image et celui du vocal, dans les fixtures ci-dessus. */
const IMAGE_ID = 'a1';
const VOCAL_ID = 'a3';

describe('la galerie des médias — gate B', () => {
  it('ne porte aucune violation grave, grille pleine', async () => {
    ecris(documentDesMedias(etat()));
    expect(await graves()).toEqual([]);
  });

  it('ne porte aucune violation grave, état vide dessiné', async () => {
    ecris(documentDesMedias(etat({ galerie: galerie({ messages: [], genre: null }), plusAncien: null })));
    expect(await graves()).toEqual([]);
  });

  it('ne porte aucune violation grave, filtre actif et vide', async () => {
    ecris(documentDesMedias(etat({ galerie: galerie({ messages, genre: 'audio' }) })));
    expect(await graves()).toEqual([]);
  });

  /**
   * LE MÊME PLEIN ÉCRAN QUE LE FIL (#4525) — gate B sur ses DEUX formes : une
   * image (`<img>`, `<dialog aria-modal>`, `<main inert>`) et la fiche d'un
   * vocal (transcription entière, `lang=` sur l'original).
   */
  it('ne porte aucune violation grave, plein écran d’une image', async () => {
    ecris(documentDesMedias(etat({ plein: IMAGE_ID })));
    expect(await graves()).toEqual([]);
  });

  it('ne porte aucune violation grave, fiche d’un vocal', async () => {
    ecris(documentDesMedias(etat({ plein: VOCAL_ID })));
    expect(await graves()).toEqual([]);
  });

  /**
   * UN SEUL `<h1>`, ET C'EST LE TITRE DE L'ÉCRAN. Le nom de la conversation est
   * son SOUS-TITRE : deux titres de rang 1 sur un écran plein feraient perdre à
   * un lecteur d'écran le repère qu'il vient de prendre dans le fil.
   */
  it('n’a qu’un seul titre de rang 1, et une région principale', () => {
    ecris(documentDesMedias(etat()));
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(document.querySelectorAll('main')).toHaveLength(1);
    expect(document.querySelector('h1')?.textContent).toBe('Médias partagés');
  });

  /**
   * TOUTE CIBLE EST ATTEIGNABLE AU CLAVIER — c'est ce que « grille atteignable
   * au clavier » veut dire : la grille n'est faite que d'éléments nativement
   * focalisables (`<a href>`, `<summary>`), donc aucun `tabindex` n'est posé et
   * aucun ordre n'est fabriqué.
   */
  it('n’offre que des cibles nativement focalisables, sans ordre fabriqué', () => {
    ecris(documentDesMedias(etat()));
    const listes = document.querySelectorAll('.grille, .lecteurs');
    expect(listes).toHaveLength(2);
    expect(document.querySelectorAll('.grille > li')).toHaveLength(3);
    expect(document.querySelectorAll('.lecteurs > li')).toHaveLength(1);
    listes.forEach((liste) => {
      expect(liste.querySelectorAll('[tabindex]')).toHaveLength(0);
      expect(liste.querySelectorAll('div[role], span[role]')).toHaveLength(0);
    });
    expect(document.querySelectorAll('.galerie a[href], .galerie summary').length).toBeGreaterThanOrEqual(5);
  });

  /**
   * SANS JAVASCRIPT, LA SURIMPRESSION RETIENT LE FOCUS. Servie devant la
   * grille et `inert` posé dessus, la seule cible que le clavier peut atteindre
   * est la croix qui ferme — exactement la règle que `fil-plein.test.ts` garde
   * pour le fil (`app/connecte/fil-vue.ts`).
   */
  it('n’expose au clavier que la surimpression quand elle recouvre la grille', () => {
    ecris(documentDesMedias(etat({ plein: IMAGE_ID })));
    expect(document.querySelector('main')?.hasAttribute('inert')).toBe(true);
    expect(document.querySelector('dialog.plein a.fermer')).not.toBeNull();
  });
});
