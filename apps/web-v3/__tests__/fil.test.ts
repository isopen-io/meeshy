/**
 * @jest-environment node
 */

import { GET, POST } from '@/app/chats/[cle]/route';
import { documentDuFil } from '@/app/connecte/fil-vue';
import { fil, languesDuLecteur, message, type Message } from '@/lib/api/fil';

/**
 * **Le fil d'une conversation applique le PRISME, et il ne le réécrit pas.**
 *
 * La descente vit dans `resolvePrismTranslation` (`@meeshy/shared`) : ces
 * témoins ne gardent donc pas la RÈGLE — elle a les siens, chez elle — mais ce
 * que la v3 lui donne et ce qu'elle en fait. C'est là que les trois familles
 * divergentes du § Prisme sont nées : jamais dans la boucle, toujours dans ce
 * qui l'alimente et dans ce qui l'affiche.
 */

const brut = (attributs: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'm1',
  content: 'Hello everyone',
  originalLanguage: 'en',
  createdAt: '2026-09-01T12:00:00.000Z',
  senderId: 'u2',
  sender: { id: 'u2', displayName: 'Marta Ruiz' },
  translations: [{ language: 'fr', content: 'Bonjour à tous' }],
  ...attributs,
});

const rendu = (m: Record<string, unknown>, langues: readonly string[], moi = 'u1'): Message => {
  const resultat = message(m, moi, langues);
  if (resultat === null) throw new Error('message non lu');
  return resultat;
};

describe('le Prisme sur un message', () => {
  it('sert la traduction de la langue PRIMAIRE du lecteur', () => {
    const m = rendu(brut(), ['fr']);
    expect(m.texte).toBe('Bonjour à tous');
    expect(m.langueServie).toBe('fr');
    expect(m.langueOriginale).toBe('en');
  });

  /**
   * LE TÉMOIN DE RANG — celui que le § Prisme désigne comme le seul capable
   * d'attraper la faute. Prisme `['fr','en']`, message ANGLAIS, traduction
   * française disponible : la règle juste rend « Bonjour », le court-circuit
   * « la langue d'origine est dans le prisme ⇒ afficher l'original » rendrait
   * « Hello ». Au rang 1 les deux verdicts coïncident ; il faut donc que la
   * langue d'origine occupe un rang INFÉRIEUR pour que le témoin morde.
   */
  it('ne rétrograde pas la langue primaire quand l’origine est au rang 2', () => {
    expect(rendu(brut(), ['fr', 'en']).texte).toBe('Bonjour à tous');

    // ET LE VERSANT OPPOSÉ, qui rend le témoin bilatéral : le MÊME message, le
    // MÊME jeu de langues, l'ORDRE inversé. L'anglais passe au rang 1, donc
    // l'original gagne — à son rang, comme la règle le dit. Sans cette moitié,
    // une implémentation qui servirait toujours la traduction passerait aussi.
    expect(rendu(brut(), ['en', 'fr']).texte).toBe('Hello everyone');
  });

  it('sert l’ORIGINAL quand aucune traduction n’atteint le prisme', () => {
    const m = rendu(brut({ translations: [{ language: 'es', content: 'Hola' }] }), ['fr']);
    expect(m.texte).toBe('Hello everyone');
    expect(m.langueServie).toBeNull();
  });

  it('sert l’original quand le message EST déjà dans la langue du lecteur', () => {
    const m = rendu(brut({ originalLanguage: 'fr', content: 'Salut' }), ['fr']);
    expect(m.texte).toBe('Salut');
    expect(m.langueServie).toBeNull();
  });

  /**
   * La passerelle sert un TABLEAU ; le résolveur attend une carte. L'adaptateur
   * est partagé (`buildTranslationRecord`, `@meeshy/shared`) — le témoin garde
   * que la v3 l'emploie sur les DEUX formes de clés que la passerelle connaît.
   */
  it('lit les deux formes de la carte du serveur', () => {
    const m = rendu(brut({ translations: [{ targetLanguage: 'fr', translatedContent: 'Coucou' }] }), ['fr']);
    expect(m.texte).toBe('Coucou');
  });

  /**
   * LA PROTECTION PASSE AVANT LE PRISME. Un message à vue unique, flouté ou
   * éphémère ne sort pas son texte — traduit ou non. C'est la leçon des cycles
   * 124 et 125 : une garde qui DÉCLARE une restriction sans la faire respecter
   * laisse partir ce qu'elle prétend retenir.
   */
  it.each([
    ['vue unique', { isViewOnce: true }],
    ['flouté', { isBlurred: true }],
    ['éphémère', { expiresAt: '2026-09-02T00:00:00.000Z' }],
  ])('ne sert NI le texte NI sa traduction d’un message %s', (_cas, protection) => {
    const m = rendu(brut(protection), ['fr']);
    expect(m.protege).toBe(true);
    expect(m.texte).not.toContain('Hello everyone');
    expect(m.texte).not.toContain('Bonjour à tous');
    expect(m.langueServie).toBeNull();
  });

  it('reconnaît ses propres messages', () => {
    expect(rendu(brut({ senderId: 'u1' }), ['fr']).deMoi).toBe(true);
    expect(rendu(brut(), ['fr']).deMoi).toBe(false);
  });
});

describe('les langues du lecteur', () => {
  it('suit l’ordre du Prisme, sans le réécrire', () => {
    expect(languesDuLecteur({ systemLanguage: 'fr', regionalLanguage: 'en' })).toEqual(['fr', 'en']);
  });

  /**
   * `resolveUserLanguagesOrdered` rend une liste VIDE quand rien n'est
   * configuré ; une liste vide fait rendre `null` au résolveur, donc l'original
   * — pour tout le monde. Le repli `'fr'` est celui du rang 5 de
   * `resolveUserLanguage` et celui d'Android.
   */
  it('ne laisse jamais le prisme vide', () => {
    expect(languesDuLecteur({})).toEqual(['fr']);
  });
});

describe('le fil rendu', () => {
  const FIL = {
    titre: 'Équipe Lagos',
    membres: 4,
    messages: [
      rendu(brut(), ['fr']),
      rendu(brut({ id: 'm2', senderId: 'u1', content: 'Bien reçu', originalLanguage: 'fr', translations: [] }), ['fr']),
    ],
  };
  const doc = documentDuFil({
    cle: '68f2a81417a557e8ce4ddfbb',
    fil: FIL,
    erreur: null,
    brouillon: '',
    maintenant: Date.parse('2026-09-01T12:30:00.000Z'),
  });

  it('affiche le texte SERVI, jamais l’original à côté', () => {
    expect(doc).toContain('Bonjour à tous');
    expect(doc).not.toContain('Hello everyone');
  });

  /**
   * L'indicateur est DISCRET, comme le § Prisme le demande : la langue
   * d'ORIGINE, et seulement quand une traduction est servie. Sur un message
   * déjà dans la langue du lecteur, la pastille ferait du bruit sans rien
   * apprendre.
   */
  it('signale la traduction sans la commenter, et seulement là où il y en a une', () => {
    expect(doc.split('class="langue"').length - 1).toBe(1);
    expect(doc).toContain('>en</span>');
  });

  it('distingue mes messages de ceux des autres', () => {
    expect(doc.split('<li class="mien">').length - 1).toBe(1);
  });

  it('offre un vrai formulaire d’envoi, sans JavaScript', () => {
    expect(doc).toContain('<form class="ecrire" method="post" action="/chats/68f2a81417a557e8ce4ddfbb">');
    expect(doc.split('<script').length - 1).toBe(1);
  });

  it('échappe ce qui vient du réseau', () => {
    const injecte = documentDuFil({
      cle: 'c',
      fil: {
        titre: '</h1><img src=x onerror=alert(1)>',
        membres: 1,
        messages: [rendu(brut({ translations: [], originalLanguage: 'fr', content: '</span><script>alert(2)</script>' }), ['fr'])],
      },
      erreur: null,
      brouillon: '',
      maintenant: 0,
    });
    const corps = injecte.slice(injecte.indexOf('<body>'));

    expect(corps).not.toContain('<img src=x');
    expect(corps).not.toContain('<script>alert(2)');
    expect(corps).toContain('&lt;img src=x');
  });
});

/**
 * LE DÉFAUT QUE CES TÉMOINS FERMENT, et il était une BOUCLE.
 *
 * Mesuré contre la passerelle de staging : une conversation dont on n'est pas
 * membre rend `403 — Access denied: you are not a member of this conversation
 * or it no longer exists`. Le code traitait 401 et 403 ensemble, donc ce refus
 * renvoyait vers `/login` — où le lecteur se reconnectait pour revenir au même
 * fil, refusé de la même façon, indéfiniment, en ressaisissant son mot de passe
 * à chaque tour.
 *
 * 401 dit « le JETON ne vaut plus » ; 403 dit « il vaut, mais pas pour ceci ».
 * Se reconnecter ne change rien au second.
 */
describe('ce que la passerelle refuse', () => {
  const REPONSE = (statut: number) => async () => new Response('{}', { status: statut });

  const issue = (statut: number) =>
    fil({ cle: 'c', jeton: 'j', moi: null, langues: ['fr'], base: 'https://gate.test', recuperer: REPONSE(statut) });

  it('renvoie se connecter sur un 401, et sur lui SEUL', async () => {
    expect((await issue(401)).genre).toBe('session-expiree');
  });

  it.each([403, 404])('rend « introuvable » sur un %s, jamais la connexion', async (statut) => {
    expect((await issue(statut)).genre).toBe('introuvable');
  });

  /**
   * « Introuvable » plutôt qu'« interdit » : dire « ce fil existe, mais pas pour
   * vous » répond à qui balaie des identifiants. C'est le patron
   * `resolveConsumptionTarget` du § 5.1, déjà appliqué aux jetons de lien.
   */
  it('ne distingue pas, pour le lecteur, le fil absent du fil interdit', async () => {
    expect(await issue(403)).toEqual(await issue(404));
  });

  it('dit la panne quand la passerelle se tait', async () => {
    const muette = fil({
      cle: 'c',
      jeton: 'j',
      moi: null,
      langues: ['fr'],
      base: 'https://gate.test',
      recuperer: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    expect((await muette).genre).toBe('panne');
  });
});

describe('l’envoi d’un message', () => {
  const contexte = { params: Promise.resolve({ cle: 'c1' }) };

  const poste = (corps: Record<string, string>, cookie = 'meeshy_auth=JWT') =>
    new Request('https://meeshy.me/chats/c1', {
      method: 'POST',
      body: new URLSearchParams(corps),
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
    });

  it('renvoie se connecter quand aucun jeton n’accompagne l’envoi', async () => {
    const reponse = await POST(poste({ texte: 'salut' }, 'autre=1'), contexte);
    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fchats%2Fc1');
  });

  it('renvoie se connecter quand le GET n’a pas de jeton non plus', async () => {
    const reponse = await GET(new Request('https://meeshy.me/chats/c1'), contexte);
    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fchats%2Fc1');
  });
});
