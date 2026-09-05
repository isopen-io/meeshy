import { axe } from 'jest-axe';

import { documentDuFil, type EtatDuFil } from '@/app/connecte/fil-vue';
import { message, type Message } from '@/lib/api/fil';

/**
 * LE COMPOSEUR ENREGISTRE UN VOCAL ET PARTAGE LA POSITION, ET UNE POSITION
 * REÇUE SE LIT COMME UN LIEU — PAS COMME DES COORDONNÉES (#5061).
 *
 * Deux AMÉLIORATIONS PROGRESSIVES de plus dans le composeur (micro,
 * position), servies CACHÉES inconditionnellement (charte règle 7 : sans
 * JavaScript, ni `MediaRecorder` ni `navigator.geolocation` n'existent — le
 * module les révèle). Et un SEPTIÈME genre de contenu dans la ligne servie :
 * un LIEU (`Message.lieu`), rendu comme une PLACE — un glyphe, un nom, une
 * adresse, un lien `geo:` — jamais comme deux nombres bruts.
 */

const ORIGINE = 'https://gate.test';
const LANGUES = ['fr'];

const ACTIFS = {
  passerelle: ORIGINE,
  actifs: Object.fromEntries(
    ['participate', 'liste', 'feed', 'notifs', 'contacts', 'recherche', 'liens', 'commentaires', 'plein', 'navigateur', 'composer', 'socket'].map((nom) => [
      nom,
      { nom: `${nom}.js`, url: `/__v3/rt/${nom}.js`, corps: '' },
    ]),
  ),
} as unknown as EtatDuFil['tempsReel'];

const rendu = (brut: Record<string, unknown>, moi = 'u1'): Message => {
  const resultat = message(brut, moi, LANGUES, ORIGINE);
  if (resultat === null) throw new Error('message non lu');
  return resultat;
};

const BASE: Omit<EtatDuFil, 'porte' | 'fil' | 'composeur' | 'tempsReel'> = {
  lecteur: { id: 'u1', nom: 'Amina', langues: LANGUES },
  erreur: null,
  brouillon: '',
  maintenant: Date.parse('2026-09-01T12:30:00.000Z'),
  contexte: null,
  plein: null,
  profil: null,
};

const document_ = (partiel: Partial<EtatDuFil>): string =>
  documentDuFil({
    ...BASE,
    porte: { genre: 'membre', cle: 'c1' },
    fil: { id: 'c1', titre: 'Équipe Lagos', membres: 2, presence: { participants: [], presents: [] }, messages: [], plusAncien: null },
    composeur: { genre: 'ouvert' },
    tempsReel: ACTIFS,
    ...partiel,
  });

const ecris = (html: string): void => {
  document.open();
  document.write(html);
  document.close();
};

describe('un lieu partagé se lit comme un LIEU, jamais comme deux nombres', () => {
  const LIEU_BRUT = { latitude: 48.8566, longitude: 2.3522, name: 'Café Le Central', address: '12 rue de Rivoli' };

  it('message() lit brut.location dans Message.lieu', () => {
    const m = rendu({
      id: 'm1',
      content: '',
      createdAt: '2026-09-01T12:00:00.000Z',
      senderId: 'u2',
      sender: { id: 'p2', displayName: 'Ibrahim' },
      location: LIEU_BRUT,
    });
    expect(m.lieu).toEqual({ latitude: 48.8566, longitude: 2.3522, nom: 'Café Le Central', adresse: '12 rue de Rivoli' });
  });

  const docAvecLieu = (locationBrute: Record<string, unknown>): string =>
    document_({
      fil: {
        id: 'c1',
        titre: 'Équipe',
        membres: 2,
        presence: { participants: [], presents: [] },
        messages: [
          rendu({
            id: 'm1',
            content: '',
            createdAt: '2026-09-01T12:00:00.000Z',
            senderId: 'u2',
            sender: { id: 'p2', displayName: 'Ibrahim' },
            location: locationBrute,
          }),
        ],
        plusAncien: null,
      },
    });

  it('rend un lien geo: — la seule adresse qui n’engage aucune requête', () => {
    expect(docAvecLieu(LIEU_BRUT)).toContain('href="geo:48.8566,2.3522"');
  });

  it('rend le nom et l’adresse servis, jamais un texte de coordonnées brutes', () => {
    const html = docAvecLieu(LIEU_BRUT);
    expect(html).toContain('Café Le Central');
    expect(html).toContain('12 rue de Rivoli');
  });

  it('porte un repli vers une carte, ouvert dans un onglet — jamais une image préchargée', () => {
    const html = docAvecLieu(LIEU_BRUT);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener"');
    expect(html).toContain('openstreetmap.org');
    expect(html).not.toMatch(/<img[^>]*openstreetmap/);
  });

  it('sans nom servi, affiche « Position partagée » — jamais un nom inventé', () => {
    expect(docAvecLieu({ latitude: 1, longitude: 2 })).toContain('Position partagée');
  });

  it('un message sans location ne rend aucun bloc .lieu — le gabarit, hors des lignes servies, en porte un CACHÉ', () => {
    const html = document_({
      fil: {
        id: 'c1',
        titre: 'Équipe',
        membres: 2,
        presence: { participants: [], presents: [] },
        messages: [rendu({ id: 'm1', content: 'Bonjour', createdAt: '2026-09-01T12:00:00.000Z', senderId: 'u2', sender: { id: 'p2', displayName: 'Ibrahim' } })],
        plusAncien: null,
      },
    });
    // La ligne SERVIE (dans <ol id="lignes">) ne rend AUCUN `.lieu` ; seul le
    // `<template>` du gabarit, cloné par le module, en porte un — hidden.
    const [lignesServies] = html.split('<template');
    expect(lignesServies).not.toContain('class="lieu"');
    expect(html).toContain('<p class="lieu" hidden>');
  });

  /**
   * CE QUE LA PROTECTION RETIENT, ELLE LE RETIENT EN ENTIER (cycles 124/125
   * du § Prisme, revue de #5061) : une position est un CONTENU comme un
   * autre. Un message éphémère / à vue unique / flouté / chiffré, ou retiré,
   * ne sert AUCUNE coordonnée — sans quoi la garde qui masque le texte
   * laisserait partir, douze lignes plus bas, l'endroit où se trouve son
   * auteur.
   */
  it('un message PROTÉGÉ ne sert aucune coordonnée — ni dans l’état, ni dans le document', () => {
    const protege = rendu({
      id: 'm1',
      content: '',
      createdAt: '2026-09-01T12:00:00.000Z',
      senderId: 'u2',
      sender: { id: 'p2', displayName: 'Ibrahim' },
      isViewOnce: true,
      location: LIEU_BRUT,
    });
    expect(protege.lieu).toBeNull();
    const [lignesServies] = docAvecLieu(LIEU_BRUT).split('<template');
    expect(lignesServies).toContain('geo:');
    const [servies] = document_({
      fil: { id: 'c1', titre: 'Équipe', membres: 2, presence: { participants: [], presents: [] }, messages: [protege], plusAncien: null },
    }).split('<template');
    expect(servies).not.toContain('geo:');
    expect(servies).not.toContain('48.8566');
  });

  it('un message RETIRÉ ne sert aucune coordonnée non plus', () => {
    const supprime = rendu({
      id: 'm1',
      content: '',
      createdAt: '2026-09-01T12:00:00.000Z',
      senderId: 'u2',
      sender: { id: 'p2', displayName: 'Ibrahim' },
      deletedAt: '2026-09-01T12:05:00.000Z',
      location: LIEU_BRUT,
    });
    expect(supprime.lieu).toBeNull();
  });

  it('0 violation axe serious/critical sur un fil qui rend un lieu', async () => {
    ecris(docAvecLieu(LIEU_BRUT));
    const rapport = await axe(document.documentElement);
    const graves = rapport.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(graves).toEqual([]);
  });
});

describe('le micro et la position — servis cachés, gouvernés par le droit d’écrire', () => {
  /**
   * Correctif CLS (revue de #5061/#5034) — un membre connaît `ecrire`
   * (`true`) AU SSR : sa PLACE se réserve donc dès le rendu (SANS `hidden`),
   * avec `en-attente` pour rester INVISIBLE (`visibility:hidden`) tant que
   * `capture.ts` n'a pas confirmé la capacité du navigateur — jamais
   * `hidden`, qui retirerait la boîte et ferait bouger la rangée du
   * composeur au premier tour de `capture.ts` (mesuré `cls 0.116 > 0.05`).
   */
  it('un membre les sert (place réservée, en-attente jusqu’à révélation par le module — jamais absents, jamais hidden)', () => {
    const html = document_({});
    expect(html).toContain('id="bouton-micro"');
    expect(html).toContain('id="bouton-position"');
    expect(html).toMatch(/class="micro en-attente" id="bouton-micro"/);
    expect(html).toMatch(/class="position en-attente" id="bouton-position"/);
    expect(html).not.toMatch(/id="bouton-micro"[^>]*hidden/);
    expect(html).not.toMatch(/id="bouton-position"[^>]*hidden/);
  });

  it('un invité SANS canSendMessages et sans temps réel ne les sert PAS — rien à révéler un jour', () => {
    const html = documentDuFil({
      ...BASE,
      porte: {
        genre: 'invite',
        lien: 'lnk' as never,
        segment: 'lagos-q1',
        pseudo: 'Tolu',
        droits: { canSendMessages: false, canSendFiles: false, canSendImages: false, canViewHistory: false },
        jonctionFraiche: false,
      },
      fil: { id: 'c1', titre: 'Équipe', membres: 2, presence: { participants: [], presents: [] }, messages: [], plusAncien: null },
      composeur: { genre: 'ferme', raison: 'Le lien est clos.', cause: 'lien' },
      tempsReel: null,
    });
    expect(html).not.toContain('id="bouton-micro"');
    expect(html).not.toContain('id="bouton-position"');
  });

  it('un invité fermé par un DROIT retiré, avec temps réel armé, les sert CACHÉS — revelable plus tard', () => {
    const html = documentDuFil({
      ...BASE,
      porte: {
        genre: 'invite',
        lien: 'lnk' as never,
        segment: 'lagos-q1',
        pseudo: 'Tolu',
        droits: { canSendMessages: false, canSendFiles: true, canSendImages: true, canViewHistory: true },
        jonctionFraiche: false,
      },
      fil: { id: 'c1', titre: 'Équipe', membres: 2, presence: { participants: [], presents: [] }, messages: [], plusAncien: null },
      composeur: { genre: 'ferme', raison: 'Le droit a été retiré.', cause: 'droit' },
      tempsReel: ACTIFS,
    });
    expect(html).toContain('id="bouton-micro"');
    expect(html).toContain('id="bouton-position"');
  });

  it('la position suit canSendMessages — jamais canSendFiles/canSendImages (§ 2.3 : la passerelle ne les applique à aucun des deux)', () => {
    const html = documentDuFil({
      ...BASE,
      porte: {
        genre: 'invite',
        lien: 'lnk' as never,
        segment: 'lagos-q1',
        pseudo: 'Tolu',
        droits: { canSendMessages: true, canSendFiles: false, canSendImages: false, canViewHistory: false },
        jonctionFraiche: false,
      },
      fil: { id: 'c1', titre: 'Équipe', membres: 2, presence: { participants: [], presents: [] }, messages: [], plusAncien: null },
      composeur: { genre: 'ouvert' },
      tempsReel: ACTIFS,
    });
    expect(html).toContain('id="bouton-micro"');
    expect(html).toContain('id="bouton-position"');
  });

  it('aucun bouton n’est rendu inerte — micro et position portent toujours un aria-label', () => {
    const html = document_({});
    expect(html).toMatch(/id="bouton-micro"[^>]*aria-label="[^"]+"/);
    expect(html).toMatch(/id="bouton-position"[^>]*aria-label="[^"]+"/);
  });

  it('n’écrit ni la position ni le micro sur un composeur en MODIFICATION — une édition ne joint rien', () => {
    const cible: Message = rendu(
      { id: 'm1', content: 'Bonjour', createdAt: '2026-09-01T12:00:00.000Z', senderId: 'u1', sender: { id: 'p1', displayName: 'Amina' } },
      'u1',
    );
    const html = document_({
      fil: { id: 'c1', titre: 'Équipe', membres: 2, presence: { participants: [], presents: [] }, messages: [cible], plusAncien: null },
      contexte: { genre: 'modification', cible },
    });
    expect(html).not.toContain('id="bouton-micro"');
    expect(html).not.toContain('id="bouton-position"');
  });
});
