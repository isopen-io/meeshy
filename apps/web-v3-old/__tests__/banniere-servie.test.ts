/**
 * @jest-environment node
 */
import { FEUILLE_DE_LA_BANNIERE } from '@/app/connecte/banniere-feuille';
import { documentDuFil, type EtatDuFil } from '@/app/connecte/fil-vue';
import { documentDesChats } from '@/app/connecte/liste-vue';
import { documentDesNotifs } from '@/app/connecte/notifs-vue';
import { documentDuTableau } from '@/app/connecte/vue';
import type { Conversation } from '@/lib/api/compte';

/**
 * OÙ LA BANNIÈRE EST SERVIE — et, ce qui compte autant, OÙ ELLE NE L'EST PAS
 * (#4454).
 *
 * LA RÈGLE QUE CES TÉMOINS GARDENT : **la région suit le MODULE, jamais
 * l'écran.** Un document servi sans temps réel n'expédie aucun JavaScript ;
 * personne n'y peindrait jamais rien. Une région `aria-live` vide, servie pour
 * rien, est du poids sur la 3G rurale du § 12.6 et un repère que le lecteur
 * d'écran surveille sans raison — c'est la charte règle 7 lue dans son sens le
 * moins évident : un élément n'existe que s'il a un effet.
 *
 * C'est le MÊME prédicat que le chargeur : les deux se posent sur
 * `tempsReel !== null`, et les tenir ensemble est ce qui empêche une bannière
 * sans module, ou un module sans région.
 */

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
    plein: { nom: 'plein.f.js', url: '/__v3/rt/plein.f.js', corps: '' },
    navigateur: { nom: 'navigateur.f.js', url: '/__v3/rt/navigateur.f.js', corps: '' },
    composer: { nom: 'composer.f.js', url: '/__v3/rt/composer.f.js', corps: '' },
    prefs: { nom: 'prefs.f.js', url: '/__v3/rt/prefs.f.js', corps: '' },
    socket: { nom: 'socket.io.b.js', url: '/__v3/rt/socket.io.b.js', corps: '' },
  },
};

const MAINTENANT = Date.parse('2026-09-01T12:30:00.000Z');

const filDe = (tempsReel: EtatDuFil['tempsReel']): string =>
  documentDuFil({
    porte: { genre: 'membre', cle: 'c1' },
    fil: { id: 'c1', titre: 'Équipe Lagos', membres: 4, presence: { participants: [], presents: [] }, messages: [], plusAncien: null },
    lecteur: { id: 'u1', nom: 'Amina', langues: ['fr'] },
    erreur: null,
    brouillon: '',
    maintenant: MAINTENANT,
    composeur: { genre: 'ouvert' },
    tempsReel,
    contexte: null,
    plein: null,
    profil: null,
  });

const CONVERSATION: Conversation = {
  id: '68f2a81417a557e8ce4ddfbb',
  identifiant: 'lagos',
  titre: 'Équipe Lagos',
  genre: 'group',
  membres: 4,
  nonLus: 0,
  dernierMessageA: '2026-09-01T12:00:00.000Z',
  apercu: 'On se cale à 15 h ?',
  apercuTraductions: null,
  apercuLangueOriginale: 'fr',
  sourdine: false,
  archivee: false,
  participantsInscrits: [],
};

const chatsDe = (tempsReel: Parameters<typeof documentDesChats>[0]['tempsReel']): string =>
  documentDesChats({
    conversations: [CONVERSATION],
    maintenant: MAINTENANT,
    langues: ['fr'],
    moi: 'u1',
    tempsReel,
  });

/** La classe est la couture entre le document et le module : elle se garde par son NOM. */
const REGION = 'class="banniere"';
const PREMIERE_REGLE = '.banniere{';

describe('les deux écrans qui tiennent un socket la servent', () => {
  it.each([
    ['le fil', (): string => filDe(TEMPS_REEL)],
    ['/chats', (): string => chatsDe(TEMPS_REEL)],
  ])('%s sert la région ET sa feuille', (_nom, rends) => {
    const doc = rends();

    expect(doc).toContain(REGION);
    expect(doc).toContain(PREMIERE_REGLE);
  });

  /**
   * HORS DE `.enveloppe`, ET C'EST MÉCANIQUE : une surimpression ouverte rend
   * l'enveloppe `inert`, et une croix inerte est un contrôle sans effet.
   * Sur le fil, la même contrainte vise le `<main>` — que `documentDuFil` rend
   * `inert` derrière une surimpression.
   */
  it('sert la région AVANT le contenu que toute surimpression rend inerte', () => {
    for (const doc of [filDe(TEMPS_REEL), chatsDe(TEMPS_REEL)]) {
      expect(doc.indexOf(REGION)).toBeGreaterThan(doc.indexOf('<body>'));
      expect(doc.indexOf(REGION)).toBeLessThan(doc.indexOf('<main'));
    }
  });

  it('la sert VIDE et MASQUÉE — le module la remplit, il ne la crée pas', () => {
    for (const doc of [filDe(TEMPS_REEL), chatsDe(TEMPS_REEL)]) {
      expect(doc).toContain('<span class="banniere-titre"></span>');
      expect(doc).toContain('<span class="banniere-corps" hidden></span>');
    }
  });
});

describe('les écrans sans module ne la servent pas', () => {
  it.each([
    ['le fil servi sans temps réel', (): string => filDe(null)],
    ['/chats servi sans temps réel', (): string => chatsDe(null)],
  ])('%s ne porte ni région ni feuille', (_nom, rends) => {
    const doc = rends();

    expect(doc).not.toContain(REGION);
    expect(doc).not.toContain(PREMIERE_REGLE);
  });

  /**
   * `/notifications` EST L'EXCLUSION DÉLIBÉRÉE : son module tient bien un
   * socket, mais il PRÉPEND déjà la ligne neuve à la liste qu'on regarde. Un
   * toast par-dessus dirait la même chose deux fois, à dix pixels d'écart.
   * Le tableau de bord, lui, n'expédie pas une ligne de JavaScript.
   */
  it('/notifications tient un socket et ne la sert PAS — c’est un choix, pas un oubli', () => {
    const doc = documentDesNotifs({
      notifications: [],
      nonLues: 0,
      maintenant: MAINTENANT,
      toutLu: false,
      tempsReel: { module: '/__v3/rt/notifs.f.js', socket: '/__v3/rt/socket.io.b.js', passerelle: 'https://gate.test' },
      curseurSuivant: null,
    });

    expect(doc).toContain('data-module');
    expect(doc).not.toContain(REGION);
  });

  it('le tableau de bord, qui n’expédie aucun script, ne la sert pas non plus', () => {
    const doc = documentDuTableau({
      lecteur: {
        id: 'u1',
        prenom: 'Amina',
        nomAffiche: 'Amina Diallo',
        pseudonyme: 'amina',
        systemLanguage: 'fr',
        regionalLanguage: null,
        customDestinationLanguage: null,
        nom: null,
        bio: null,
        email: null,
        telephone: null,
      },
      conversations: [CONVERSATION],
      total: 1,
      liens: { genre: 'liste', liens: [] },
      maintenant: MAINTENANT,
      espace: false,
    });

    expect(doc).not.toContain('<script type="module">');
    expect(doc).not.toContain(REGION);
  });
});

describe('la feuille de la bannière', () => {
  /**
   * ELLE SE POSE EN HAUT, PAS EN BAS, et c'est une décision d'écran : le bas
   * des deux écrans qui la servent porte le composeur (le fil) ou les deux
   * ronds flottants (`/chats`). Un toast en bas couvrirait un CONTRÔLE —
   * exactement ce que la charte règle 7 b/c interdit aux éléments fixes.
   */
  it('flotte en HAUT — le bas des deux écrans porte déjà des contrôles', () => {
    expect(FEUILLE_DE_LA_BANNIERE).toContain('position:fixed');
    expect(FEUILLE_DE_LA_BANNIERE).toContain('top:var(--space-3)');
    expect(FEUILLE_DE_LA_BANNIERE).not.toContain('bottom:');
  });

  it('donne à la croix une cible pleine — un rond de 24 px n’est pas un contrôle tactile', () => {
    expect(FEUILLE_DE_LA_BANNIERE).toContain('width:var(--target-min);height:var(--target-min)');
  });
});
