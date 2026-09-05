import { documentDuFil, type EtatDuFil } from '@/app/connecte/fil-vue';
import { armeLaFeuilleDeLien, soumetsLaFeuille } from '@/lib/realtime/feuille-de-lien';

/**
 * LE MODULE PARTAGÉ QUI POSTE LA FEUILLE « NOUVEAU LIEN » (#5034) — un seul
 * site pour `/links` (région `#carnet`) et le fil (région `#lien-cree`).
 * Ces témoins jouent le module sur le document que le SERVEUR sert réellement
 * (`documentDuFil`, l'état `?lien` du fil), dans jsdom — jamais un fragment
 * recomposé à la main.
 */

const CLE = 'c1';
const TITRE = 'Équipe Lagos';

// `type`/`rang` admis (`peutCreerUnLien`, correction de revue #5034) — sans
// eux la puce « Partager » ne se rend plus, et ce module refocalise `a.partager`.
const FIL: EtatDuFil['fil'] = { id: CLE, titre: TITRE, membres: 4, presence: { participants: [], presents: [] }, messages: [], plusAncien: null, type: 'group', rang: 'moderator' };

const TEMPS_REEL: EtatDuFil['tempsReel'] = {
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
    socket: { nom: 'socket.io.b.js', url: '/__v3/rt/socket.io.b.js', corps: '' },
  },
};

const ETAT = (attributs: Partial<EtatDuFil> = {}): EtatDuFil => ({
  porte: { genre: 'membre', cle: CLE },
  fil: FIL,
  lecteur: { id: 'u1', nom: 'Amina', langues: ['fr'] },
  erreur: null,
  brouillon: '',
  maintenant: 0,
  composeur: { genre: 'ouvert' },
  tempsReel: TEMPS_REEL,
  contexte: null,
  plein: null,
  profil: null,
  ...attributs,
});

/** Sert le document réel du fil (ouvert sur `?lien`) dans jsdom, et rend son `<main>`. */
const sers = (etat: Partial<EtatDuFil> = {}): HTMLElement => {
  const html = documentDuFil(ETAT(etat));
  document.body.innerHTML = html.slice(html.indexOf('<body>') + '<body>'.length, html.lastIndexOf('</body>'));
  const main = document.querySelector<HTMLElement>('main');
  if (main === null) throw new Error('aucun <main> servi');
  return main;
};

const CIBLE = { region: '#lien-cree', ouvreur: 'a.partager' } as const;

/** `jsdom` n'implémente ni `fetch` ni `Response` : un objet minimal en tient lieu — seuls `.text()` et `.url` sont lus par le module. */
const bouchonneLeFetch = (documentRecu: string, url: string): void => {
  const reponse = { text: async () => documentRecu, url: new URL(url, 'https://meeshy.test').toString() };
  global.fetch = jest.fn().mockResolvedValue(reponse) as unknown as typeof fetch;
};

afterEach(() => {
  jest.restoreAllMocks();
  // @ts-expect-error — nettoyage entre témoins.
  delete global.fetch;
});

describe('soumetsLaFeuille — succès (le lien est créé)', () => {
  it('échange la région, retire la feuille ET son voile, lève `inert`, pose l’adresse, refocalise l’ouvreur', async () => {
    sers({ lien: { saisie: { conversation: CLE, nom: TITRE, echeance: 'semaine', capacite: '', permissions: new Set() }, motif: null } });
    // `<main>` sert `inert` derrière la feuille (`documentDuFil`) — reproduit ici comme le document le sert.
    document.querySelector('main')?.setAttribute('inert', '');

    const documentRecu = documentDuFil(ETAT({ lienCree: 'mshy_x' }));
    bouchonneLeFetch(documentRecu, `/chats/${CLE}?cree=mshy_x`);

    const formulaire = document.querySelector<HTMLFormElement>('dialog.nouveau-lien form');
    if (formulaire === null) throw new Error('feuille non servie');

    await soumetsLaFeuille(formulaire, CIBLE);

    // Le dialogue est RETIRÉ DU DOM, jamais fermé par `close()` — sinon
    // l'écouteur de `plein-ecran.ts` (sur l'événement `close`) suivrait
    // `data-retour` une seconde fois vers l'adresse que ce module vient déjà
    // de poser (jsdom n'implémentant ni `showModal` ni `close` sur
    // `<dialog>`, le seul témoin possible ici est l'ABSENCE du nœud).
    expect(document.querySelector('dialog.nouveau-lien')).toBeNull();
    expect(document.querySelector('a.voile')).toBeNull();
    expect(document.querySelector('main')?.hasAttribute('inert')).toBe(false);
    expect(document.querySelector('#lien-cree .adresse')?.textContent).toContain('mshy_x');
    expect(document.querySelector<HTMLElement>('#lien-cree')?.hidden).toBe(false);
    expect(window.location.pathname + window.location.search).toBe(`/chats/${CLE}?cree=mshy_x`);
    expect(document.activeElement).toBe(document.querySelector('a.partager'));
  });
});

describe('soumetsLaFeuille — refus motivé (la feuille servie remplace la nôtre)', () => {
  it('remplace la feuille par celle du serveur, motif dit, champs REPOSÉS, focus au premier champ', async () => {
    sers({ lien: { saisie: { conversation: CLE, nom: TITRE, echeance: 'semaine', capacite: '', permissions: new Set() }, motif: null } });

    const documentRecu = documentDuFil(
      ETAT({
        lien: {
          saisie: { conversation: CLE, nom: 'Voisins', echeance: 'jour', capacite: '', permissions: new Set(['allowViewHistory']) },
          motif: 'Cette conversation est terminée',
        },
      }),
    );
    bouchonneLeFetch(documentRecu, `/chats/${CLE}`);

    const formulaire = document.querySelector<HTMLFormElement>('dialog.nouveau-lien form');
    if (formulaire === null) throw new Error('feuille non servie');

    await soumetsLaFeuille(formulaire, CIBLE);

    const dialogue = document.querySelector('dialog.nouveau-lien');
    expect(dialogue).not.toBeNull();
    expect(dialogue?.textContent).toContain('Cette conversation est terminée');
    expect(dialogue?.querySelector('input[name="nom"]')).toHaveProperty('value', 'Voisins');
    expect(document.activeElement?.tagName).toMatch(/INPUT/i);
  });
});

describe('soumetsLaFeuille — panne (rien de lisible)', () => {
  it('garde la feuille INTACTE, et le dit dans sa voix (`.avis-feuille`)', async () => {
    sers({ lien: { saisie: { conversation: CLE, nom: TITRE, echeance: 'semaine', capacite: '', permissions: new Set() }, motif: null } });
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as unknown as typeof fetch;

    const formulaire = document.querySelector<HTMLFormElement>('dialog.nouveau-lien form');
    if (formulaire === null) throw new Error('feuille non servie');
    const bouton = formulaire.querySelector<HTMLButtonElement>('button[type="submit"]');

    await soumetsLaFeuille(formulaire, CIBLE);

    expect(document.querySelector('dialog.nouveau-lien')).not.toBeNull();
    expect(formulaire.querySelector('.avis-feuille')?.hasAttribute('hidden')).toBe(false);
    expect(bouton?.disabled).toBe(false);
  });
});

/**
 * L'ÉCOUTE — armée par l'hôte, RENDUE avec sa poignée, JAMAIS DEUX À LA FOIS.
 *
 * La feuille vit hors de `<main>` : l'écoute se pose au DOCUMENT, qui SURVIT à
 * une navigation douce (§ 12.11 étage 3, le navigateur de zone rappelle
 * `monte()`). Deux écoutes sur un document, c'est DEUX `POST /api/v1/links`
 * pour un seul geste — et cette route n'est pas idempotente : deux liens de
 * partage naissent, dont un que le lecteur n'a jamais vu.
 */
describe('armeLaFeuilleDeLien — une écoute, jamais deux', () => {
  const soumets = (): boolean => {
    const formulaire = document.querySelector<HTMLFormElement>('dialog.nouveau-lien form');
    if (formulaire === null) throw new Error('feuille non servie');
    const evenement = new Event('submit', { bubbles: true, cancelable: true });
    formulaire.dispatchEvent(evenement);
    return evenement.defaultPrevented;
  };

  const ouvre = (): void => {
    sers({ lien: { saisie: { conversation: CLE, nom: TITRE, echeance: 'semaine', capacite: '', permissions: new Set() }, motif: null } });
    bouchonneLeFetch(documentDuFil(ETAT({ lienCree: 'mshy_x' })), `/chats/${CLE}?cree=mshy_x`);
  };

  it('intercepte la soumission de la feuille et poste UNE fois', () => {
    ouvre();
    const detache = armeLaFeuilleDeLien(CIBLE);

    expect(soumets()).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    detache();
  });

  it('armer une SECONDE fois détache la première — une seule requête, un seul lien créé', () => {
    ouvre();
    // Ce que produit une navigation douce : le module est ré-armé sans que le
    // document ait changé. Sans le site unique, DEUX écoutes postaient.
    armeLaFeuilleDeLien(CIBLE);
    const detache = armeLaFeuilleDeLien(CIBLE);

    soumets();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    detache();
  });

  it('détachée, elle laisse le formulaire partir comme sans JavaScript', () => {
    ouvre();
    const detache = armeLaFeuilleDeLien(CIBLE);
    detache();

    expect(soumets()).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
