import { axe } from 'jest-axe';
import { renderToStaticMarkup } from 'react-dom/server';

import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { PLACE_ABSENTE, avisDeLaGalerie, puces } from '@/app/(public)/chats/[lien]/medias/etats';
import {
  carteAudio,
  tuileDuMedia,
  type MediaServi,
} from '@/app/(public)/chats/[lien]/medias/modele';
import { VueDesMedias, type EcranDesMedias } from '@/app/(public)/chats/[lien]/medias/vue';
import { THEME_PAR_DEFAUT } from '@/app/theme-script';

/**
 * L'ÉCRAN `media` tel qu'un visiteur SANS JAVASCRIPT le reçoit.
 *
 * Ce que ce témoin juge est le HTML STATIQUE — celui que le serveur envoie et
 * que le navigateur rend seul. C'est la population du critère de fin : la
 * grille doit être parcourable, chaque tuile doit OUVRIR quelque chose, et
 * AUCUN octet de média ne doit partir à l'ouverture de la page.
 *
 * Le document est écrit COMPLET — `<html lang>`, classe de thème, `<body>` —
 * parce qu'`axe` juge une page et non un fragment.
 */

const PHOTO: MediaServi = {
  id: 'a-1',
  nom: 'marche-de-lagos.jpg',
  url: 'https://gate.test/api/v1/attachments/file/2026/08/a-1.jpg',
  mimeType: 'image/jpeg',
  octets: 420_000,
  dureeMs: null,
  transcription: null,
  traductions: {},
  pistes: {},
  instantMs: Date.parse('2026-08-30T12:01:00.000Z'),
};

const VOCAL: MediaServi = {
  id: 'a-2',
  nom: 'note-vocale.m4a',
  url: 'https://gate.test/api/v1/attachments/file/2026/08/a-2.m4a',
  mimeType: 'audio/mp4',
  octets: 96_000,
  dureeMs: 23_000,
  transcription: { texte: 'Mo ti de ibi ipade.', langue: 'yo' },
  traductions: { fr: 'Je suis arrivé au lieu du rendez-vous.' },
  pistes: { fr: { url: 'https://gate.test/tts/a-2-fr.mp3', mimeType: 'audio/mpeg' } },
  instantMs: Date.parse('2026-08-30T12:02:00.000Z'),
};

const RETOUR = '/chats/mshy_lagos';

const ecran = (ajustements: Partial<EcranDesMedias> = {}): EcranDesMedias => ({
  nom: 'Équipe Lagos',
  retour: RETOUR,
  famille: 'images',
  puces: puces({ famille: 'images', retour: RETOUR }),
  tuiles: [tuileDuMedia({ media: PHOTO, langueDuDocument: DOCUMENT_LANGUAGE })],
  cartes: [],
  avis: null,
  ...ajustements,
});

const ecrit = (markup: string): void => {
  document.open();
  document.write(
    `<!doctype html><html lang="${DOCUMENT_LANGUAGE}" class="${THEME_PAR_DEFAUT}"><body>${markup}</body></html>`,
  );
  document.close();
};

const rend = (donnees: EcranDesMedias = ecran()): string => {
  const markup = renderToStaticMarkup(<VueDesMedias ecran={donnees} />);
  ecrit(markup);
  return markup;
};

/** La barre du § 8.5 : `serious` et `critical`, et rien d'autre ne bloque. */
const graves = async (): Promise<readonly string[]> => {
  const rapport = await axe(document.documentElement);
  return rapport.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id} — ${violation.help}`);
};

describe('la coquille de la galerie', () => {
  it('porte les repères que le § 9.5 exige', () => {
    rend();

    expect(document.querySelector('header')).not.toBeNull();
    expect(document.querySelector('nav')).not.toBeNull();
    expect(document.querySelector('main#main-content')).not.toBeNull();
    expect(document.querySelector('h1')?.textContent).toBe('Médias partagés');
  });

  it('nomme la conversation et compte ce qu’elle sert', () => {
    rend(
      ecran({
        tuiles: [PHOTO, { ...PHOTO, id: 'a-3' }].map((media) =>
          tuileDuMedia({ media, langueDuDocument: DOCUMENT_LANGUAGE }),
        ),
      }),
    );

    expect(document.body.textContent).toContain('Équipe Lagos');
    expect(document.body.textContent).toContain('2 éléments');
  });

  /**
   * Le retour est un `<a>` RÉEL : il peut mener hors du périmètre v3, où la
   * navigation client-side de Next ne va pas (§ 3.2 corollaire 4).
   */
  it('revient au fil par un lien réel', () => {
    rend();

    expect(document.querySelector('header a')?.getAttribute('href')).toBe(RETOUR);
  });
});

describe('les quatre puces — un contrôle existe s’il a un effet', () => {
  it('sont des liens, un par famille, et disent laquelle est ouverte', () => {
    rend();

    const liens = [...document.querySelectorAll('nav a')];

    expect(liens.map((lien) => lien.textContent)).toEqual([
      'Images',
      'Vidéos',
      'Audio',
      'Fichiers',
    ]);
    expect(liens.map((lien) => lien.getAttribute('href'))).toEqual([
      `${RETOUR}/medias`,
      `${RETOUR}/medias?famille=videos`,
      `${RETOUR}/medias?famille=audio`,
      `${RETOUR}/medias?famille=fichiers`,
    ]);
    expect(liens.filter((lien) => lien.getAttribute('aria-current') === 'page')).toHaveLength(1);
  });

  /**
   * Sans place, aucune famille n'est servie : les quatre puces ne trieraient
   * rien et mèneraient toutes au même écran. Un contrôle existe s'il a un effet
   * (loi 4) — celui-là n'en a pas, donc il n'est pas rendu.
   */
  it('ne propose aucune puce quand il n’y a rien à trier', () => {
    rend(ecran({ nom: null, tuiles: [], puces: [], avis: PLACE_ABSENTE }));

    expect(document.querySelectorAll('nav[aria-label="Types de médias"]')).toHaveLength(0);
  });
});

describe('la grille — le poids AVANT le premier octet', () => {
  it('rend une tuile CLIQUABLE par média, vers l’adresse servie', () => {
    rend();

    const tuile = document.querySelector('main ul a');

    expect(tuile?.getAttribute('href')).toBe(PHOTO.url);
    expect(tuile?.getAttribute('aria-label')).toContain('marche-de-lagos.jpg');
  });

  it('affiche le poids de chaque média', () => {
    rend();

    expect(document.querySelector('main ul')?.textContent).toContain('420 Ko');
  });

  /**
   * LE CRITÈRE DE FIN, gagé sur le HTML : la grille ne demande AUCUN média.
   * Un `<img>`, un `<video src>` ou une `background-image` en ligne feraient
   * partir des octets à l'ouverture — exactement ce que l'assertion CDP du spec
   * mesure ensuite dans un vrai navigateur.
   */
  it('ne demande aucun octet de média à l’ouverture', () => {
    const markup = rend();

    expect(document.querySelectorAll('img, video, picture, source')).toHaveLength(0);
    expect(markup).not.toContain('background-image');
    expect(markup).not.toContain(PHOTO.url.replace('https://', 'url(https://'));
  });

  it('dessine son état vide plutôt que de laisser un trou', () => {
    rend(ecran({ tuiles: [] }));

    expect(document.querySelector('main')?.textContent).toContain('Aucun média');
    expect(document.querySelectorAll('main ul')).toHaveLength(0);
  });
});

describe('l’audio — la transcription au Prisme, et le son qui va avec', () => {
  const galerieAudio = (prisme: readonly string[] = ['fr', 'yo']): EcranDesMedias =>
    ecran({
      famille: 'audio',
      puces: puces({ famille: 'audio', retour: RETOUR }),
      tuiles: [],
      cartes: [carteAudio({ media: VOCAL, prisme, langueDuDocument: DOCUMENT_LANGUAGE })],
    });

  /**
   * `preload="none"` est ce qui rend l'assertion CDP vraie sur un média que la
   * page MONTE : le contrôle est présent, atteignable au clavier, et n'ouvre
   * aucune connexion tant que personne n'a appuyé.
   */
  it('monte un lecteur natif qui ne précharge RIEN', () => {
    rend(galerieAudio());

    const lecteur = document.querySelector('audio');

    expect(lecteur?.getAttribute('preload')).toBe('none');
    expect(lecteur?.hasAttribute('controls')).toBe(true);
    expect(lecteur?.getAttribute('src')).toBe('https://gate.test/tts/a-2-fr.mp3');
  });

  it('rend la transcription servie, et l’annonce', () => {
    rend(galerieAudio());

    expect(document.querySelector('main')?.textContent).toContain(
      'Je suis arrivé au lieu du rendez-vous.',
    );
    expect(document.querySelector('main')?.textContent).toContain('Transcrit · yo → fr');
    expect(document.querySelector('main')?.textContent).toContain('0:23');
  });

  /**
   * `lang` sur le nœud dont le texte a été résolu dans une langue ≠ `<html lang>`
   * — le gate du § 9.5. Ici le document est en `fr` et le texte SERVI est le
   * yoruba : sans cet attribut, un lecteur d'écran le prononce en français.
   */
  it('pose `lang` sur un texte servi dans une autre langue que le document', () => {
    rend(galerieAudio(['de']));

    const texte = document.querySelector('main [lang]');

    expect(texte?.getAttribute('lang')).toBe('yo');
    expect(texte?.textContent).toContain('Mo ti de ibi ipade.');
  });

  it('ne pose aucun `lang` quand la langue servie est celle du document', () => {
    rend(galerieAudio(['fr']));

    expect(document.querySelectorAll('main [lang]')).toHaveLength(0);
  });
});

describe('ce que l’écran DIT quand il ne peut pas servir', () => {
  it('peint l’avis d’une place fermée sans effacer ce qui est déjà lu', () => {
    rend(ecran({ avis: avisDeLaGalerie({ etat: 'close' }) }));

    expect(document.body.textContent).toContain('Votre place a été fermée');
    expect(document.querySelectorAll('main ul a')).toHaveLength(1);
  });

  it('propose d’entrer quand aucune place n’ouvre cette galerie', () => {
    rend(ecran({ nom: null, tuiles: [], avis: PLACE_ABSENTE }));

    const action = document.querySelector('main nav a');

    expect(document.body.textContent).toContain('Entrez dans la conversation');
    expect(action?.getAttribute('href')).toBe(RETOUR);
  });
});

describe('accessibilité', () => {
  it.each([
    ['la grille', ecran()],
    ['la galerie vide', ecran({ tuiles: [] })],
    [
      'les cartes audio',
      ecran({
        famille: 'audio',
        puces: puces({ famille: 'audio', retour: RETOUR }),
        tuiles: [],
        cartes: [carteAudio({ media: VOCAL, prisme: ['de'], langueDuDocument: DOCUMENT_LANGUAGE })],
      }),
    ],
    ['l’avis de place absente', ecran({ nom: null, tuiles: [], avis: PLACE_ABSENTE })],
  ])('ne porte aucune violation axe — %s', async (_cas, donnees) => {
    rend(donnees);

    expect(await graves()).toEqual([]);
  });
});
