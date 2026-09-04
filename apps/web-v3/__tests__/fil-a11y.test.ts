import { axe } from 'jest-axe';

import { documentDuChoix } from '@/app/(public)/chat/[lien]/choix-vue';
import { documentDuFil, type EtatDuFil } from '@/app/connecte/fil-vue';
import { ETATS_DU_TEMPS_REEL } from '@/lib/contenu/fil';
import { message } from '@/lib/api/fil';
import type { CleDeLien } from '@/lib/api/guest-session';

/**
 * Gate B (§ 9.5) sur LE FIL, à ses deux portes, et sur l'état CHOIX : « 0
 * violation `axe` `serious`/`critical` ». Le harnais est celui de la vitrine :
 * le document COMPLET, tel que le gestionnaire le sert — `html-has-lang`,
 * `landmark-one-main`, `page-has-heading-one`, les `lang` des textes traduits.
 */

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

const messages = [
  message({ id: 'm1', content: 'Shall we meet?', originalLanguage: 'en', createdAt: '2026-09-01T12:00:00.000Z', senderId: 'u2', sender: { id: 'p2', displayName: 'Ibrahim' }, translations: [{ language: 'fr', content: 'On se voit ?' }] }, 'u1', ['fr'], 'https://gate.test'),
  message({ id: 'm2', content: 'Oui', originalLanguage: 'fr', createdAt: '2026-09-01T12:01:00.000Z', senderId: 'u1', sender: { id: 'p1', displayName: 'Amina' }, readCount: 1 }, 'u1', ['fr'], 'https://gate.test'),
  message({ id: 'm3', content: 'Ça me va', originalLanguage: 'fr', createdAt: '2026-09-01T12:02:00.000Z', senderId: 'p9', sender: { id: 'p9', displayName: 'Tolu', type: 'anonymous' } }, 'u1', ['fr'], 'https://gate.test'),
].filter((m): m is NonNullable<typeof m> => m !== null);

const TEMPS_REEL = {
  passerelle: 'https://gate.test',
  actifs: {
    participate: { nom: 'participate.a.js', url: '/__v3/rt/participate.a.js', corps: '' },
    liste: { nom: 'liste.a.js', url: '/__v3/rt/liste.a.js', corps: '' },
    feed: { nom: 'feed.a.js', url: '/__v3/rt/feed.a.js', corps: '' },
    notifs: { nom: 'notifs.f.js', url: '/__v3/rt/notifs.f.js', corps: '' },
    contacts: { nom: 'contacts.f.js', url: '/__v3/rt/contacts.f.js', corps: '' },
    recherche: { nom: 'recherche.f.js', url: '/__v3/rt/recherche.f.js', corps: '' },
    liens: { nom: 'liens.f.js', url: '/__v3/rt/liens.f.js', corps: '' },
    commentaires: { nom: 'commentaires.f.js', url: '/__v3/rt/commentaires.f.js', corps: '' },
    navigateur: { nom: 'navigateur.f.js', url: '/__v3/rt/navigateur.f.js', corps: '' },
    composer: { nom: 'composer.f.js', url: '/__v3/rt/composer.f.js', corps: '' },
    socket: { nom: 'socket.io.b.js', url: '/__v3/rt/socket.io.b.js', corps: '' },
  },
};

const etat = (attributs: Partial<EtatDuFil> = {}): EtatDuFil => ({
  porte: { genre: 'membre', cle: 'c1' },
  fil: { id: 'c1', titre: 'Équipe Lagos', membres: 4, presence: { participants: ['u2'], presents: ['u2'] }, messages, plusAncien: 'm0' },
  lecteur: { id: 'u1', nom: 'Amina', langues: ['fr'] },
  erreur: null,
  brouillon: '',
  maintenant: Date.parse('2026-09-01T12:30:00.000Z'),
  composeur: { genre: 'ouvert' },
  tempsReel: TEMPS_REEL,
  plein: null,
  profil: null,
  ...attributs,
});

/**
 * LES SIX FORMES (issue #4835) sur le même harnais : une image, une vidéo
 * sous-titrée, un vocal transcrit, un transfert, une réponse et une réponse à
 * une story — dans UN document, tel que le gestionnaire le sert.
 */
const RICHES = [
  { id: 'r1', content: 'Le tableau final de la revue.', attachments: [{ id: 'a1', fileUrl: '/api/v1/attachments/file/p.jpg', originalName: 'photo.jpg', mimeType: 'image/jpeg', fileSize: 96_000 }] },
  {
    id: 'r2',
    content: '',
    attachments: [
      { id: 'a2', fileUrl: '/api/v1/attachments/file/v.mp4', originalName: 'revue.mp4', mimeType: 'video/mp4', fileSize: 3_100_000, duration: 42_000, transcription: { text: 'Hola', language: 'es' }, translations: { fr: { transcription: 'Bonjour' } } },
    ],
  },
  {
    id: 'r3',
    content: '',
    attachments: [
      { id: 'a3', fileUrl: '/api/v1/attachments/file/a.m4a', originalName: 'vocal.m4a', mimeType: 'audio/mp4', fileSize: 96_000, duration: 21_000, transcription: { text: 'Mo n mú', language: 'yo' }, translations: { fr: { transcription: 'J’apporte les chiffres.', url: '/api/v1/attachments/file/a-fr.m4a' } } },
    ],
  },
  { id: 'r4', content: 'Le glossaire a changé.', forwardedFromId: 'x1', forwardedFromConversation: { id: 'c9', title: 'Diaspora FR-EN' } },
  { id: 'r5', content: 'Je le mets dans le dossier.', replyToId: 'r1', replyTo: { id: 'r1', content: 'The final review board.', originalLanguage: 'en', sender: { id: 'p2', displayName: 'Ibrahim' } } },
  { id: 'r6', content: 'Superbe, c’était où ?', storyReplyToId: 's1', postReplyTo: { id: 's1', type: 'STORY', previewText: 'Trois graphiques', authorId: 'u1', authorName: 'Amina' } },
].map((brut, rang) =>
  message(
    { originalLanguage: 'fr', createdAt: `2026-09-01T12:0${rang}:00.000Z`, senderId: 'u2', sender: { id: 'p2', displayName: 'Ibrahim' }, ...brut },
    'u1',
    ['fr'],
    'https://gate.test',
  ),
).filter((m): m is NonNullable<typeof m> => m !== null);

describe('le fil face à axe', () => {
  it('ne porte aucune violation grave — les six formes de message dans un même fil', async () => {
    ecris(documentDuFil(etat({ fil: { id: 'c1', titre: 'Types de messages', membres: 4, presence: { participants: [], presents: [] }, messages: RICHES, plusAncien: null } })));
    expect(await graves()).toEqual([]);
  });

  it('ne porte aucune violation grave — porte du membre, temps réel greffé', async () => {
    ecris(documentDuFil(etat()));
    expect(await graves()).toEqual([]);
  });

  it('ne porte aucune violation grave — porte de l’invité, bandeau des droits ouvert', async () => {
    ecris(
      documentDuFil(
        etat({
          porte: {
            genre: 'invite',
            lien: 'mshy_lagos' as CleDeLien,
            segment: 'lagos-q1',
            pseudo: 'Tolu',
            droits: { canSendMessages: true, canSendFiles: false, canSendImages: false, canViewHistory: true },
            jonctionFraiche: true,
          },
          lecteur: { id: 'p9', nom: 'Tolu', langues: ['fr'] },
        }),
      ),
    );
    expect(await graves()).toEqual([]);
  });

  it('ne porte aucune violation grave — composeur fermé, fil vide', async () => {
    ecris(etatFerme());
    expect(await graves()).toEqual([]);
  });

  /**
   * LE PLEIN ÉCRAN (§ 12.10.1) est un `<dialog open>` SERVI — donc dans le même
   * document que le fil qu'il recouvre, et jugé avec lui : une image nommée par
   * son `alt`, un titre qui étiquette la surimpression, une croix qui ferme.
   * Les trois genres qui en ont un sont regardés, l'image (`<img alt>`), la
   * vidéo et le vocal (`<video>` / `<audio controls>`).
   */
  it.each([
    ['a1', 'image'],
    ['a2', 'vidéo'],
    ['a3', 'vocal'],
  ])('ne porte aucune violation grave — plein écran ouvert sur %s (%s)', async (piece) => {
    ecris(
      documentDuFil(
        etat({
          fil: { id: 'c1', titre: 'Types de messages', membres: 4, presence: { participants: [], presents: [] }, messages: RICHES, plusAncien: null },
          plein: piece,
        }),
      ),
    );
    // NON VACUEUX : sans surimpression rendue, le témoin jugerait le fil seul.
    expect(document.querySelector('dialog.plein')).not.toBeNull();
    expect(await graves()).toEqual([]);
  });

  it('ne porte aucune violation grave — état CHOIX, modale ouverte sur le cadre inerte', async () => {
    ecris(
      documentDuChoix({
        segment: 'lagos-q1',
        apercu: { lien: 'mshy_lagos' as CleDeLien, nom: 'Équipe Lagos', description: 'Le canal.', conversationId: 'c1', requireNickname: true, requireAccount: false, requireEmail: false, requireBirthday: false, languesAutorisees: [], participants: 12 },
        langueProposee: 'fr',
        saisie: { pseudo: '', courriel: '', naissance: '' },
        refus: null,
        clos: null,
        maintenant: 0,
      }),
    );
    expect(await graves()).toEqual([]);
  });

  /**
   * LE POINT D'ÉTAT DIT CE QU'IL MONTRE — et il le dit DÈS LE SERVEUR.
   *
   * Il naît en `inconnu` : le module de participation n'est pas encore arrivé,
   * et c'est vrai. Mais son libellé hors-écran était VIDE, et le module ne
   * l'écrivait jamais : un `aria-live` sans texte n'annonce rien, et un lecteur
   * d'écran n'avait aucun moyen de savoir si le fil était vivant.
   *
   * Le défaut se voyait aussi à l'œil, autrement : `inconnu` et `creux`
   * partageaient le MÊME rendu — un point creux —, donc « le temps réel n'est
   * jamais arrivé » était indiscernable de « il respire ». C'est ce qui a rendu
   * un module absent en staging invisible pendant tout un tour : la page se
   * dégradait en Post/Redirect/Get sans qu'aucun témoin, à l'écran ou dans
   * l'arbre d'accessibilité, ne dise pourquoi.
   */
  it('nomme son état AVANT que le module arrive — un aria-live vide n’annonce rien', () => {
    ecris(documentDuFil(etat()));

    const point = document.querySelector('.etat');
    expect(point?.getAttribute('data-etat')).toBe('inconnu');
    expect(point?.textContent?.trim()).toBe(ETATS_DU_TEMPS_REEL.inconnu);
    expect(point?.textContent?.trim()).not.toBe('');
  });

  it('rougit sur un document dont la structure est fautive', async () => {
    ecris('<html><body><div tabindex="0"><img src="x"></div></body></html>');
    expect(await graves()).not.toEqual([]);
  });
});

const etatFerme = (): string =>
  documentDuFil(etat({ fil: { id: 'c1', titre: 'T', membres: 1, presence: { participants: [], presents: [] }, messages: [], plusAncien: null }, composeur: { genre: 'ferme', raison: 'Ce lien a expiré.', cause: 'lien' } }));
