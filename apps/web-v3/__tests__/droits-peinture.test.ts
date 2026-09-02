import { documentDuFil, type EtatDuFil } from '@/app/connecte/fil-vue';
import type { Droits } from '@/lib/api/invite';
import { droitsRendus, PARAMETRE_DE_JONCTION_FRAICHE, SANS_DROITS, TOUS_LES_DROITS } from '@/lib/contenu/droits';
import { droitsDuChangement, oublieLaJonctionFraiche, peinsLesDroits, peinsLeTrombone } from '@/lib/realtime/droits-peinture';

/**
 * LES DROITS, CHANGÉS EN DIRECT (issue #4523, § 6.3.B « l'hôte a pu les
 * changer »). Le serveur sert au montage l'instantané que la passerelle rend
 * (`PATCH /guest-sessions/me`, `link-admission.ts:554-577`) ; ce que l'hôte
 * change ENSUITE arrive par `participant:rights-updated`
 * (`participants-writes.ts:403-425`), et le module repeint le bandeau servi
 * avec la MÊME source (`lib/contenu/droits.ts`) — jamais un second gabarit.
 * Ces témoins jouent le peintre sur le document que le serveur a réellement
 * servi, dans jsdom, et lisent l'événement tel que l'émetteur le compose.
 */

const TEMPS_REEL = {
  passerelle: 'https://gate.test',
  actifs: {
    participate: { nom: 'participate.a.js', url: '/__v3/rt/participate.a.js', corps: '' },
    socket: { nom: 'socket.io.b.js', url: '/__v3/rt/socket.io.b.js', corps: '' },
  },
};

const sers = (droits: Droits, tempsReel: EtatDuFil['tempsReel'] = TEMPS_REEL): HTMLElement => {
  const html = documentDuFil({
    porte: { genre: 'invite', lien: 'mshy_lagos' as never, segment: 'lagos-q1', pseudo: 'Tolu', droits, jonctionFraiche: true },
    fil: { id: 'c1', titre: 'Équipe Lagos', membres: 4, presence: { participants: [], presents: [] }, messages: [], plusAncien: null },
    lecteur: { id: 'p1', nom: 'Tolu', langues: ['fr'] },
    erreur: null,
    brouillon: '',
    maintenant: 0,
    composeur: { genre: 'ouvert' },
    tempsReel,
  } satisfies EtatDuFil);
  document.body.innerHTML = html.slice(html.indexOf('<body>') + '<body>'.length, html.lastIndexOf('</body>'));
  const main = document.querySelector<HTMLElement>('main');
  if (main === null) throw new Error('aucun <main> servi');
  return main;
};

const lignes = (main: HTMLElement): readonly { readonly cle: string; readonly verdict: string; readonly titre: string; readonly sous: string }[] =>
  [...main.querySelectorAll<HTMLElement>('.bandeau.bien li[data-droit]')].map((ligne) => ({
    cle: ligne.dataset.droit ?? '',
    verdict: ligne.classList.contains('accorde') ? 'accorde' : ligne.classList.contains('refuse') ? 'refuse' : '',
    titre: ligne.querySelector('b')?.textContent ?? '',
    sous: ligne.querySelector('p')?.textContent ?? '',
  }));

describe('le bandeau des droits, repeint', () => {
  it('reflète les droits relus — verdict, titre, phrase — sur les lignes que le serveur a servies', () => {
    const main = sers(TOUS_LES_DROITS);
    const retires: Droits = { ...SANS_DROITS, canViewHistory: true };
    peinsLesDroits(main, retires);
    expect(lignes(main)).toEqual(
      droitsRendus(retires).map((droit) => ({ cle: droit.cle, verdict: droit.accorde ? 'accorde' : 'refuse', titre: droit.titre, sous: droit.sous })),
    );
    expect(main.querySelectorAll('.bandeau.bien li.accorde.refuse')).toHaveLength(0);
  });

  it('rend un droit RETIRÉ puis RENDU dans les deux sens, sans toucher au résumé du bandeau', () => {
    const main = sers(TOUS_LES_DROITS);
    const resume = main.querySelector('.bandeau.bien summary')?.outerHTML;
    peinsLesDroits(main, SANS_DROITS);
    expect(lignes(main).map((ligne) => ligne.verdict)).toEqual(['refuse', 'refuse', 'refuse', 'refuse']);
    peinsLesDroits(main, TOUS_LES_DROITS);
    expect(lignes(main).map((ligne) => ligne.verdict)).toEqual(['accorde', 'accorde', 'accorde', 'refuse']);
    expect(main.querySelector('.bandeau.bien summary')?.outerHTML).toBe(resume);
  });

  it('ne fait rien sur un fil sans bandeau — celui du membre', () => {
    const main = sers(TOUS_LES_DROITS);
    main.querySelector('.bandeau.bien')?.remove();
    expect(() => peinsLesDroits(main, SANS_DROITS)).not.toThrow();
  });
});

describe('le trombone, suivant les droits', () => {
  it('se retire quand ni photo ni fichier ne sont plus admis, et revient quand l’un l’est de nouveau — avec l’`accept` du droit rendu', () => {
    const main = sers(TOUS_LES_DROITS);
    const trombone = main.querySelector<HTMLElement>('label.joindre');
    const champ = main.querySelector<HTMLInputElement>('#champ-piece');
    const texte = main.querySelector<HTMLTextAreaElement>('#champ-texte');
    expect(trombone).not.toBeNull();
    expect(champ).not.toBeNull();
    expect(champ?.getAttribute('accept')).toBeNull();

    peinsLeTrombone(main, SANS_DROITS);
    expect(trombone?.hidden).toBe(true);
    // Caché ET désactivé : un champ hors écran dont le libellé est caché serait un contrôle sans nom (axe `label`, serious — mesuré).
    expect(champ?.hidden).toBe(true);
    expect(champ?.disabled).toBe(true);
    // Sans pièce possible, le texte redevient obligatoire — ce que le serveur pose lui-même dans ce cas.
    expect(texte?.required).toBe(true);

    peinsLeTrombone(main, { ...SANS_DROITS, canSendImages: true });
    expect(trombone?.hidden).toBe(false);
    expect(champ?.hidden).toBe(false);
    expect(champ?.disabled).toBe(false);
    expect(champ?.getAttribute('accept')).toBe('image/*');
    expect(texte?.required).toBe(false);

    peinsLeTrombone(main, { ...SANS_DROITS, canSendFiles: true });
    expect(champ?.getAttribute('accept')).toBeNull();
  });

  /**
   * Là où un module viendra, le serveur sert le trombone CACHÉ à qui n'a pas
   * encore le droit — pour que le droit RENDU par l'hôte se voie sans
   * rechargement ; sur une lecture pure, il n'existe pas, et le peintre n'en
   * fabrique jamais un.
   */
  it('révèle celui que le serveur a servi caché, et n’en fabrique pas un sur une lecture pure', () => {
    const participation = sers({ ...TOUS_LES_DROITS, canSendFiles: false, canSendImages: false });
    const trombone = participation.querySelector<HTMLElement>('label.joindre');
    expect(trombone?.hidden).toBe(true);
    peinsLeTrombone(participation, TOUS_LES_DROITS);
    expect(trombone?.hidden).toBe(false);
    expect(participation.querySelector<HTMLInputElement>('#champ-piece')?.disabled).toBe(false);

    const lecturePure = sers({ ...TOUS_LES_DROITS, canSendFiles: false, canSendImages: false }, null);
    peinsLeTrombone(lecturePure, TOUS_LES_DROITS);
    expect(lecturePure.querySelector('label.joindre')).toBeNull();
  });
});

/**
 * `participant:rights-updated`, lu tel que `PATCH …/participants/:id/rights`
 * l'émet (`participants-writes.ts:383-425`) : `rights` est l'état RÉSOLU —
 * `anonymousSession.rights ?? permissions` —, jamais le delta ;
 * `canViewHistory` est ABSENT sur la room de conversation (#4009) et présent
 * sur la room personnelle de l'intéressé, qui reçoit les deux charges dans un
 * ordre qui ne se suppose pas. Un client discrimine donc sur la PRÉSENCE de la
 * clé et ne recopie jamais inconditionnellement — sans quoi la charge réduite
 * effacerait l'octroi que la charge complète vient de dire.
 */
describe('un changement de droits reçu de la passerelle', () => {
  const COURANTS: Droits = { canSendMessages: true, canSendFiles: false, canSendImages: false, canViewHistory: true };
  const RESOLUS = { canSendMessages: false, canSendFiles: true, canSendImages: false, canSendVideos: false, canSendAudios: false, canSendLocations: false, canSendLinks: true };

  it('rend les droits résolus qu’il porte, et garde l’historique connu quand la charge ne le dit pas (room de conversation)', () => {
    const charge = { conversationId: 'c1', participantId: 'p1', updatedBy: 'u9', rights: RESOLUS };
    expect(droitsDuChangement(charge, 'p1', COURANTS)).toEqual({ canSendMessages: false, canSendFiles: true, canSendImages: false, canViewHistory: true });
  });

  it('prend l’historique quand la charge le porte (room personnelle) — dans les deux sens', () => {
    const complete = { conversationId: 'c1', participantId: 'p1', updatedBy: 'u9', rights: { ...RESOLUS, canViewHistory: false }, historyVisibleFrom: null };
    expect(droitsDuChangement(complete, 'p1', COURANTS)?.canViewHistory).toBe(false);
    expect(droitsDuChangement({ ...complete, rights: { ...RESOLUS, canViewHistory: true } }, 'p1', { ...COURANTS, canViewHistory: false })?.canViewHistory).toBe(true);
  });

  it('ignore le changement d’un AUTRE participant, une charge sans droits, et un lecteur sans identité', () => {
    const charge = { conversationId: 'c1', participantId: 'p2', updatedBy: 'u9', rights: RESOLUS };
    expect(droitsDuChangement(charge, 'p1', COURANTS)).toBeNull();
    expect(droitsDuChangement({ conversationId: 'c1', participantId: 'p1', updatedBy: 'u9' }, 'p1', COURANTS)).toBeNull();
    expect(droitsDuChangement({ ...charge, participantId: 'p1' }, null, COURANTS)).toBeNull();
    expect(droitsDuChangement('rien', 'p1', COURANTS)).toBeNull();
  });
});

describe('la jonction fraîche, oubliée par l’adresse', () => {
  it('retire le paramètre de l’adresse sans recharger, pour qu’un rechargement ne rouvre pas le bandeau', () => {
    window.history.replaceState(null, '', `/chat/lagos-q1?${PARAMETRE_DE_JONCTION_FRAICHE}=1`);
    oublieLaJonctionFraiche();
    expect(window.location.pathname).toBe('/chat/lagos-q1');
    expect(window.location.search).toBe('');
  });

  it('garde les autres paramètres, et ne touche pas une adresse qui ne le porte pas', () => {
    window.history.replaceState(null, '', `/chat/lagos-q1?avant=m0&${PARAMETRE_DE_JONCTION_FRAICHE}=1#m-m1`);
    oublieLaJonctionFraiche();
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe('/chat/lagos-q1?avant=m0#m-m1');

    const replaceState = jest.spyOn(window.history, 'replaceState');
    oublieLaJonctionFraiche();
    expect(replaceState).not.toHaveBeenCalled();
    replaceState.mockRestore();
  });
});
