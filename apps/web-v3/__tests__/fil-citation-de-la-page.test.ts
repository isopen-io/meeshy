/**
 * @jest-environment node
 */

import { documentDuFil, type EtatDuFil } from '@/app/connecte/fil-vue';
import { MENTION_PROTEGEE, MENTION_SUPPRIMEE, messages, type Message } from '@/lib/api/fil';

/**
 * **CE QU'UNE CITATION MONTRE D'UN MESSAGE QUI EST DÉJÀ DANS LA PAGE.**
 *
 * Deux défauts, une seule cause : `replyTo` était lu comme si la cible était
 * TOUJOURS hors de la tranche, alors que dans le cas nominal elle y est.
 *
 *   1. **LE PRISME.** La passerelle ne sert aucune traduction sous `replyTo`
 *      (`messages-list-query.ts:262-296`), donc l'aperçu était l'ORIGINAL —
 *      pendant que la bulle citée, deux lignes plus haut, affichait sa
 *      traduction (`:255-257`, `include_translations` vaut `true` par défaut).
 *      Deux textes pour un même message, sur le même écran : la forme exacte du
 *      cycle 122. Rien ne manquait au document — la traduction n'était pas
 *      CHERCHÉE.
 *
 *   2. **LA PROTECTION.** `estProtege(replyTo)` ne pouvait jamais se déclencher
 *      sur le chemin REST : le `select` ne demande NI `isViewOnce`, NI
 *      `isBlurred`, NI `expiresAt`, NI `deletedAt`. Le chemin SOCKET
 *      (`MessageProcessor.ts:462`, un `include`) les fait tous voyager. Le même
 *      message avait donc deux rendus selon son chemin d'arrivée : la mention en
 *      direct, le TEXTE EN CLAIR après un simple rechargement. Le témoin de
 *      l'itération précédente donnait une charge de forme SOCKET à une règle
 *      qui garde le chemin REST — un témoin écrit sur le seul chemin où le
 *      défaut n'existe pas (leçon 261).
 *
 * La cible dans la page tranche les deux : c'est la BULLE qui fait foi, et elle
 * est résolue identiquement sur les deux chemins. Hors page, la charge est tout
 * ce qu'on a — régime 3, et la parité du `select` est une issue de la
 * passerelle.
 */

const ORIGINE = 'https://gate.test';
const LANGUES = ['fr'];

const CITE = {
  id: 'r1',
  content: 'The final review board.',
  originalLanguage: 'en',
  createdAt: '2026-09-01T12:00:00.000Z',
  senderId: 'u2',
  sender: { id: 'p2', displayName: 'Ibrahim' },
  translations: [{ language: 'fr', content: 'Le tableau final de la revue.' }],
};

/** La forme que la LISTE sert : `replyTo` par un `select` qui ne demande AUCUN drapeau. */
const REPONSE_FORME_LISTE = {
  id: 'r5',
  content: 'Je le mets dans le dossier de mars.',
  originalLanguage: 'fr',
  createdAt: '2026-09-01T12:10:00.000Z',
  senderId: 'u1',
  sender: { id: 'p1', displayName: 'Amina' },
  replyToId: 'r1',
  replyTo: { id: 'r1', content: 'The final review board.', originalLanguage: 'en', sender: { id: 'p2', displayName: 'Ibrahim' } },
};

/** La forme que le SOCKET sert : `replyTo` par un `include`, donc tous les scalaires de la ligne. */
const reponseFormeSocket = (drapeaux: Record<string, unknown>): Record<string, unknown> => ({
  ...REPONSE_FORME_LISTE,
  replyTo: { ...REPONSE_FORME_LISTE.replyTo, isViewOnce: false, isBlurred: false, expiresAt: null, deletedAt: null, ...drapeaux },
});

const tranche = (bruts: readonly Record<string, unknown>[]): readonly Message[] => messages(bruts, 'u1', LANGUES, ORIGINE);

const citationDe = (bruts: readonly Record<string, unknown>[]): { apercu: string; langue: string | null } => {
  const r5 = tranche(bruts).find((m) => m.id === 'r5');
  const citation = r5?.citations[0];
  if (citation === undefined) throw new Error('aucune citation');
  return { apercu: citation.apercu, langue: citation.langue };
};

describe('la cible est dans la page — le Prisme descend une seule fois, et la citation le suit', () => {
  it('cite ce que la BULLE affiche, pas l’original que la passerelle a servi', () => {
    const page = tranche([CITE, REPONSE_FORME_LISTE]);
    const cible = page.find((m) => m.id === 'r1');
    const citation = page.find((m) => m.id === 'r5')?.citations[0];

    expect(cible?.texte).toBe('Le tableau final de la revue.');
    expect(cible?.langueServie).toBe('fr');
    expect(citation?.apercu).toBe(cible?.texte);
    expect(citation?.langue).toBe('fr');
  });

  it('sert le même aperçu à un lecteur anglophone — celui de sa bulle, l’original', () => {
    const anglais = messages([CITE, REPONSE_FORME_LISTE], 'u1', ['en'], ORIGINE);
    const cible = anglais.find((m) => m.id === 'r1');
    expect(cible?.langueServie).toBeNull();
    expect(anglais.find((m) => m.id === 'r5')?.citations[0]?.apercu).toBe('The final review board.');
  });

  it('n’écrit pas deux textes pour un même message dans le document servi', () => {
    const page = tranche([CITE, REPONSE_FORME_LISTE]);
    const document_ = documentDuFil(fil(page)).replace(/<template[\s\S]*?<\/template>/g, '');
    // La bulle citée sert sa traduction ; l'aperçu qui la cite sert la MÊME
    // chaîne, sans `lang=` puisqu'elle est dans la langue du document.
    expect(document_).toContain('<p class="texte">Le tableau final de la revue.</p>');
    expect(document_).toContain('<span class="apercu">Le tableau final de la revue.</span>');
    expect(document_).not.toMatch(/<span class="apercu"[^>]*>The final review board\.</);
    // L'original reste atteignable là où il doit l'être : sous « Voir l'original ».
    expect(document_).toContain('<p lang="en">The final review board.</p>');
  });
});

describe('la protection d’un message cité — le même rendu par les deux chemins', () => {
  it.each([
    ['à vue unique', { isViewOnce: true }],
    ['flouté', { isBlurred: true }],
    ['éphémère', { expiresAt: '2026-09-01T13:00:00.000Z' }],
  ])('retient le texte d’une cible %s, servie par la LISTE comme par le SOCKET', (_nom, drapeaux) => {
    const protege = { ...CITE, ...drapeaux };
    const parLaListe = citationDe([protege, REPONSE_FORME_LISTE]);
    const parLeSocket = citationDe([protege, reponseFormeSocket(drapeaux)]);

    expect(parLaListe.apercu).toBe(MENTION_PROTEGEE);
    expect(parLaListe.apercu).not.toContain('final review board');
    expect(parLeSocket).toEqual(parLaListe);
  });

  it('ne cite pas une parole RETIRÉE — par la liste comme par le socket', () => {
    const supprime = { ...CITE, deletedAt: '2026-09-01T12:05:00.000Z' };
    const parLaListe = citationDe([supprime, REPONSE_FORME_LISTE]);
    const parLeSocket = citationDe([supprime, reponseFormeSocket({ deletedAt: '2026-09-01T12:05:00.000Z' })]);

    expect(parLaListe.apercu).toBe(MENTION_SUPPRIMEE);
    expect(parLaListe.apercu).not.toContain('final review board');
    expect(parLeSocket).toEqual(parLaListe);
  });

  /**
   * HORS PAGE, la charge est tout ce qu'on a — régime 3. Le chemin SOCKET la
   * porte et la garde tient ; le chemin REST ne la porte pas, et c'est la
   * PARITÉ du `select` de la passerelle qui manque, jamais un contournement
   * d'ici. Ce témoin fixe la frontière : ce qui suit est une issue de la
   * passerelle, pas un défaut de la v3.
   */
  it('retient encore ce que la charge SOCKET déclare quand la cible n’est pas dans la page', () => {
    expect(citationDe([reponseFormeSocket({ isViewOnce: true })]).apercu).toBe(MENTION_PROTEGEE);
    expect(citationDe([reponseFormeSocket({ deletedAt: '2026-09-01T12:05:00.000Z' })]).apercu).toBe(MENTION_SUPPRIMEE);
    // La forme LISTE ne déclare rien : elle sert ce que la passerelle a servi.
    expect(citationDe([REPONSE_FORME_LISTE]).apercu).toBe('The final review board.');
  });
});

function fil(messages: readonly Message[]): EtatDuFil {
  return {
    porte: { genre: 'membre', cle: 'c1' },
    fil: { id: 'c1', titre: 'Types de messages', membres: 4, presence: { participants: [], presents: [] }, messages, plusAncien: null },
    lecteur: { id: 'u1', nom: 'Amina', langues: LANGUES },
    erreur: null,
    brouillon: '',
    maintenant: Date.parse('2026-09-01T12:30:00.000Z'),
    composeur: { genre: 'ouvert' },
    tempsReel: null,
  };
}
