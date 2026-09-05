/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  reponseDemandee,
  modificationDemandee,
  resoutLeContexte,
  soumissionDuFil,
  traiteLaSoumission,
} from '@/app/connecte/fil-porte';
import { documentDuFil, type EtatDuFil } from '@/app/connecte/fil-vue';
import { adresseDeReponse, adresseDeModification, PARAM_DE_LA_MODIFICATION, PARAM_DE_LA_REPONSE } from '@/lib/api/adresses-du-fil';
import { citationDeReponse, resoutContreLaPage } from '@/lib/api/citations';
import { FENETRE_D_EDITION_MS, messages as tranche, MENTIONS_RETENUES, type Fil, type Message } from '@/lib/api/fil';
import { peutModifier, peutRetirer } from '@/lib/api/fil-mutations';
import { FIL } from '@/lib/contenu/fil';
import {
  bulleOptimiste,
  confirmeLaMutation,
  insere,
  modifieMoiMeme,
  retabli,
  retireMoiMeme,
  ETAT_VIDE,
} from '@/lib/realtime/fil-etat';

/**
 * DANS LE FIL, ON RÉPOND À UN MESSAGE, ON MODIFIE ET ON RETIRE LES SIENS
 * (issue #5163) — les témoins de la porte, de la donnée, et de l'état pur.
 */

const ORIGINE = 'https://gate.test';

const brut = (attributs: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'r1',
  content: 'On se cale a 15h ?',
  originalLanguage: 'en',
  translations: [{ language: 'fr', content: 'On se cale à 15 h pour la revue ?' }],
  createdAt: '2026-09-01T12:06:00.000Z',
  senderId: 'u2',
  sender: { id: 'p2', displayName: 'Ibrahim' },
  ...attributs,
});

const rendus = (bruts: readonly Record<string, unknown>[], langues: readonly string[] = ['fr'], moi = 'u1'): readonly Message[] =>
  tranche(bruts, moi, langues, ORIGINE);

describe('soumissionDuFil lit les cinq genres', () => {
  const formulaire = (entrees: Readonly<Record<string, string>>): FormData => {
    const donnees = new FormData();
    Object.entries(entrees).forEach(([cle, valeur]) => donnees.set(cle, valeur));
    return donnees;
  };

  it('une réponse — le champ caché reponseA porte la cible', () => {
    expect(soumissionDuFil(formulaire({ texte: 'Oui, ça marche', reponseA: 'r1' }))).toEqual({
      genre: 'reponse',
      texte: 'Oui, ça marche',
      replyToId: 'r1',
      fichiers: [],
    });
  });

  it('une modification — le champ caché modifie porte la cible, et le champ caché original le texte SERVI', () => {
    expect(soumissionDuFil(formulaire({ texte: 'Je le mets dans mars.', modifie: 'r5', original: 'Je le mets où ?' }))).toEqual({
      genre: 'modification',
      messageId: 'r5',
      texte: 'Je le mets dans mars.',
      texteOriginal: 'Je le mets où ?',
    });
  });

  it('un retrait — le bouton du menu, posté seul', () => {
    expect(soumissionDuFil(formulaire({ retirer: 'r5' }))).toEqual({ genre: 'retrait', messageId: 'r5' });
  });

  it('retirer l’emporte sur modifie, qui l’emporte sur la réponse', () => {
    expect(soumissionDuFil(formulaire({ retirer: 'r9', modifie: 'r5', reponseA: 'r1', texte: 'x' }))).toEqual({
      genre: 'retrait',
      messageId: 'r9',
    });
    expect(soumissionDuFil(formulaire({ modifie: 'r5', reponseA: 'r1', texte: 'x' }))).toEqual({
      genre: 'modification',
      messageId: 'r5',
      texte: 'x',
      texteOriginal: '',
    });
  });

  it('une réaction reste une réaction même si reponseA traîne dans le même formulaire', () => {
    expect(soumissionDuFil(formulaire({ reaction: '👍', message: 'm1', reponseA: 'r1' }))).toEqual({
      genre: 'reaction',
      messageId: 'm1',
      emoji: '👍',
    });
  });

  it('un message nu reste un message nu', () => {
    expect(soumissionDuFil(formulaire({ texte: 'salut' }))).toEqual({ genre: 'message', texte: 'salut', fichiers: [] });
  });

  it('un formulaire absent reste un message vide', () => {
    expect(soumissionDuFil(null)).toEqual({ genre: 'message', texte: '', fichiers: [] });
  });
});

describe('traiteLaSoumission — la bonne route, avec la bonne créance', () => {
  const appels: { url: string; methode: string; corps: string }[] = [];
  const original = globalThis.fetch;

  beforeEach(() => {
    appels.length = 0;
    globalThis.fetch = (async (url: string | URL | Request, options: RequestInit = {}) => {
      appels.push({ url: String(url), methode: options.method ?? 'GET', corps: String(options.body ?? '') });
      return new Response(JSON.stringify({ success: true, data: { id: 'r9' } }), { status: 200 });
    }) as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = original;
  });

  it('une réponse POSTE avec replyToId dans le corps, et redirige vers le NOUVEAU message', async () => {
    const issue = await traiteLaSoumission({
      soumission: { genre: 'reponse', texte: 'Oui, ça marche', replyToId: 'r1', fichiers: [] },
      creance: { genre: 'membre', jeton: 'JWT' },
      conversation: 'c1',
      adresse: '/chats/c1',
    });
    expect(issue).toEqual({ genre: 'redirection', vers: '/chats/c1#m-r9' });
    expect(appels[0]?.methode).toBe('POST');
    expect(appels[0]?.url).toContain('/conversations/c1/messages');
    expect(JSON.parse(appels[0]?.corps ?? '{}')).toMatchObject({ content: 'Oui, ça marche', replyToId: 'r1' });
  });

  it('une modification PUT /messages/:id, et redirige vers le message VISÉ', async () => {
    const issue = await traiteLaSoumission({
      soumission: { genre: 'modification', messageId: 'r5', texte: 'Je le mets dans mars.', texteOriginal: 'Je le mets où ?' },
      creance: { genre: 'membre', jeton: 'JWT' },
      conversation: 'c1',
      adresse: '/chats/c1',
    });
    expect(issue).toEqual({ genre: 'redirection', vers: '/chats/c1#m-r5' });
    expect(appels[0]?.methode).toBe('PUT');
    expect(appels[0]?.url).toContain('/api/v1/messages/r5');
    expect(JSON.parse(appels[0]?.corps ?? '{}')).toEqual({ content: 'Je le mets dans mars.' });
  });

  /**
   * DÉFAUT #5163 §8, CHEMIN SANS JAVASCRIPT — « Enregistrer » sans rien avoir
   * changé ne doit PAS écrire : la passerelle marquerait sinon le message
   * « modifié » pour tous et effacerait ses traductions pour un texte
   * identique. Le champ caché `original` (`fil-vue.ts`) porte le texte SERVI
   * sans qu'il faille relire la conversation.
   */
  it('« Enregistrer » un texte IDENTIQUE à l’original ne PART PAS — aucune requête', async () => {
    const issue = await traiteLaSoumission({
      soumission: { genre: 'modification', messageId: 'r5', texte: 'Rien de changé', texteOriginal: 'Rien de changé' },
      creance: { genre: 'membre', jeton: 'JWT' },
      conversation: 'c1',
      adresse: '/chats/c1',
    });
    expect(issue).toEqual({ genre: 'redirection', vers: '/chats/c1#m-r5' });
    expect(appels).toEqual([]);
  });

  it('un retrait DELETE /messages/:id, et redirige vers le message VISÉ', async () => {
    const issue = await traiteLaSoumission({
      soumission: { genre: 'retrait', messageId: 'r5' },
      creance: { genre: 'membre', jeton: 'JWT' },
      conversation: 'c1',
      adresse: '/chats/c1',
    });
    expect(issue).toEqual({ genre: 'redirection', vers: '/chats/c1#m-r5' });
    expect(appels[0]?.methode).toBe('DELETE');
    expect(appels[0]?.url).toContain('/api/v1/messages/r5');
  });

  /**
   * DÉFAUT #5163 §6 — la raison ANGLAISE nommée de la passerelle (« 24-hour
   * limit exceeded ») traverse désormais TRADUITE, dans une interface
   * entièrement française (`traduitLeRefusServi`, `lib/api/fil.ts`).
   */
  it('un refus 403 revient en erreur, avec la phrase TRADUITE (jamais l’anglais de la passerelle)', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: false, error: { message: 'You can no longer edit this message (24-hour limit exceeded)' } }), {
        status: 403,
      })) as typeof fetch;
    const issue = await traiteLaSoumission({
      soumission: { genre: 'modification', messageId: 'r5', texte: 'trop tard', texteOriginal: 'à l’heure' },
      creance: { genre: 'membre', jeton: 'JWT' },
      conversation: 'c1',
      adresse: '/chats/c1',
    });
    expect(issue).toEqual({
      genre: 'erreur',
      message: 'Ce message ne peut plus être modifié : la fenêtre de 24 heures est dépassée.',
      brouillon: 'trop tard',
      statut: 403,
    });
  });

  it('un invité qui poste modifie/retirer est refusé SANS qu’aucune requête ne parte (fail-closed, dimension 1)', async () => {
    const issueModif = await traiteLaSoumission({
      soumission: { genre: 'modification', messageId: 'r5', texte: 'x', texteOriginal: '' },
      creance: { genre: 'invite', jeton: 'SESSION' },
      conversation: 'c1',
      adresse: '/chat/lnk',
    });
    const issueRetrait = await traiteLaSoumission({
      soumission: { genre: 'retrait', messageId: 'r5' },
      creance: { genre: 'invite', jeton: 'SESSION' },
      conversation: 'c1',
      adresse: '/chat/lnk',
    });
    expect(issueModif.genre).toBe('erreur');
    expect(issueRetrait.genre).toBe('erreur');
    expect(appels).toEqual([]);
  });

  it('un invité PEUT répondre (POST porte replyToId comme un membre)', async () => {
    const issue = await traiteLaSoumission({
      soumission: { genre: 'reponse', texte: 'oui', replyToId: 'r1', fichiers: [] },
      creance: { genre: 'invite', jeton: 'SESSION' },
      conversation: 'c1',
      adresse: '/chat/lnk',
    });
    expect(issue.genre).toBe('redirection');
    expect(appels[0]?.methode).toBe('POST');
  });
});

describe('resoutLeContexte — la cible doit être SERVIE, et le composeur OUVERT', () => {
  const FIL_DE_TEST: Fil = {
    id: 'c1',
    titre: 'Équipe Lagos',
    membres: 4,
    presence: { participants: [], presents: [] },
    messages: rendus([brut()]),
    plusAncien: null,
  };
  const MAINTENANT = Date.parse('2026-09-01T12:30:00.000Z');

  it('arme une réponse quand la cible est dans la tranche', () => {
    const contexte = resoutLeContexte({ idReponse: 'r1', idModification: null, fil: FIL_DE_TEST, maintenant: MAINTENANT, composeurOuvert: true, estInvite: false });
    expect(contexte).toEqual({ genre: 'reponse', cible: FIL_DE_TEST.messages[0] });
  });

  it('n’arme rien quand la cible n’est pas dans la tranche', () => {
    expect(
      resoutLeContexte({ idReponse: 'introuvable', idModification: null, fil: FIL_DE_TEST, maintenant: MAINTENANT, composeurOuvert: true, estInvite: false }),
    ).toBeNull();
  });

  it('n’arme rien quand le composeur est FERMÉ', () => {
    expect(
      resoutLeContexte({ idReponse: 'r1', idModification: null, fil: FIL_DE_TEST, maintenant: MAINTENANT, composeurOuvert: false, estInvite: false }),
    ).toBeNull();
  });

  it('un invité n’arme JAMAIS une modification (régime 3)', () => {
    const filDeMoi: Fil = { ...FIL_DE_TEST, messages: rendus([brut()], ['fr'], 'u2') };
    expect(
      resoutLeContexte({ idReponse: null, idModification: 'r1', fil: filDeMoi, maintenant: MAINTENANT, composeurOuvert: true, estInvite: true }),
    ).toBeNull();
  });

  it('n’arme pas la modification d’un message qui n’est pas le mien', () => {
    expect(
      resoutLeContexte({ idReponse: null, idModification: 'r1', fil: FIL_DE_TEST, maintenant: MAINTENANT, composeurOuvert: true, estInvite: false }),
    ).toBeNull();
  });

  it('arme la modification de MON message, dans la fenêtre de 24 h', () => {
    const filDeMoi: Fil = { ...FIL_DE_TEST, messages: rendus([brut()], ['fr'], 'u2') };
    const contexte = resoutLeContexte({ idReponse: null, idModification: 'r1', fil: filDeMoi, maintenant: MAINTENANT, composeurOuvert: true, estInvite: false });
    expect(contexte).toEqual({ genre: 'modification', cible: filDeMoi.messages[0] });
  });

  it('n’arme pas une modification hors fenêtre de 24h', () => {
    const filDeMoi: Fil = { ...FIL_DE_TEST, messages: rendus([brut()], ['fr'], 'u2') };
    const troisJoursPlusTard = Date.parse('2026-09-01T12:06:00.000Z') + FENETRE_D_EDITION_MS + 1;
    expect(
      resoutLeContexte({ idReponse: null, idModification: 'r1', fil: filDeMoi, maintenant: troisJoursPlusTard, composeurOuvert: true, estInvite: false }),
    ).toBeNull();
  });
});

describe('les adresses de réponse et de modification', () => {
  it('portent chacune leur paramètre', () => {
    expect(adresseDeReponse('/chats/c1', 'r1')).toBe(`/chats/c1?${PARAM_DE_LA_REPONSE}=r1`);
    expect(adresseDeModification('/chats/c1', 'r5')).toBe(`/chats/c1?${PARAM_DE_LA_MODIFICATION}=r5`);
  });

  it('reponseDemandee et modificationDemandee lisent leur propre paramètre', () => {
    expect(reponseDemandee(new Request('https://meeshy.me/chats/c1?repondre=r1'))).toBe('r1');
    expect(modificationDemandee(new Request('https://meeshy.me/chats/c1?modifier=r5'))).toBe('r5');
    expect(reponseDemandee(new Request('https://meeshy.me/chats/c1'))).toBeNull();
  });
});

describe('la fenêtre d’édition suit la passerelle', () => {
  const FICHIER = join(__dirname, '..', '..', '..', 'services', 'gateway', 'src', 'services', 'messaging', 'messageEditAdmission.ts');

  it('relit MESSAGE_EDIT_WINDOW_MS — jamais recopié à l’aveugle', () => {
    const source = readFileSync(FICHIER, 'utf8');
    const lu = /MESSAGE_EDIT_WINDOW_MS\s*=\s*(\d+\s*\*\s*\d+\s*\*\s*\d+\s*\*\s*\d+)/.exec(source);
    if (lu === null) throw new Error('MESSAGE_EDIT_WINDOW_MS introuvable');
    expect(FENETRE_D_EDITION_MS).toBe(eval(lu[1]!));
  });
});

describe('peutModifier / peutRetirer — le prédicat lu par le serveur ET le peintre', () => {
  const CANDIDAT = { deMoi: true, systeme: false, supprime: false, protege: false, ecritA: '2026-09-01T12:00:00.000Z' };
  const PILE = Date.parse('2026-09-01T12:00:00.000Z') + FENETRE_D_EDITION_MS;

  it('est vrai à 24h PILE (borne inclusive) et faux une milliseconde après', () => {
    expect(peutModifier({ ...CANDIDAT, maintenant: PILE })).toBe(true);
    expect(peutModifier({ ...CANDIDAT, maintenant: PILE + 1 })).toBe(false);
  });

  it('est faux si ce n’est pas le mien, si c’est système, supprimé, protégé ou pas encore servi', () => {
    const maintenant = Date.parse('2026-09-01T12:00:00.000Z');
    expect(peutModifier({ ...CANDIDAT, deMoi: false, maintenant })).toBe(false);
    expect(peutModifier({ ...CANDIDAT, systeme: true, maintenant })).toBe(false);
    expect(peutModifier({ ...CANDIDAT, supprime: true, maintenant })).toBe(false);
    expect(peutModifier({ ...CANDIDAT, protege: true, maintenant })).toBe(false);
    expect(peutModifier({ ...CANDIDAT, envoi: 'en-attente', maintenant })).toBe(false);
    expect(peutRetirer({ ...CANDIDAT, envoi: 'en-attente' })).toBe(false);
  });

  it('peutRetirer n’a pas de fenêtre de temps', () => {
    expect(peutRetirer(CANDIDAT)).toBe(true);
  });
});

describe('citationDeReponse / resoutContreLaPage', () => {
  it('le squelette est SANS aperçu ni langue, la cible dans la page le complète', () => {
    const squelette = citationDeReponse({ cible: 'r1', source: 'Ibrahim' });
    expect(squelette).toEqual({ genre: 'reponse', source: 'Ibrahim', sorte: null, pourMoi: false, apercu: '', langue: null, cible: 'r1', surLaPage: false });

    const page = rendus([brut()]);
    const resolue = resoutContreLaPage(squelette, page, MENTIONS_RETENUES);
    expect(resolue.apercu).toBe('On se cale à 15 h pour la revue ?');
    expect(resolue.langue).toBe('fr');
    expect(resolue.surLaPage).toBe(true);
  });

  it('reste tel quel quand la cible n’est pas dans la page', () => {
    const squelette = citationDeReponse({ cible: 'introuvable', source: 'Ibrahim' });
    expect(resoutContreLaPage(squelette, [], MENTIONS_RETENUES)).toEqual(squelette);
  });
});

describe('bulleOptimiste avec une réponse — la citation AVANT l’accusé', () => {
  it('porte sa citation, résolue par citantes à l’insertion', () => {
    const avecCible = insere(ETAT_VIDE, { ...rendus([brut()])[0]!, envoi: 'servi', raison: null });
    const bulle = bulleOptimiste({
      clientMessageId: 'cid_1',
      texte: 'Oui, ça marche',
      auteur: 'Amina',
      auteurId: 'u1',
      langue: 'fr',
      horsLigne: false,
      maintenant: Date.parse('2026-09-01T12:10:00.000Z'),
      reponseA: { cible: 'r1', source: 'Ibrahim' },
    });
    const apres = insere(avecCible, bulle);
    const inseree = apres.bulles.find((b) => b.clientMessageId === 'cid_1');
    expect(inseree?.citations).toHaveLength(1);
    expect(inseree?.citations[0]).toMatchObject({ genre: 'reponse', cible: 'r1', apercu: 'On se cale à 15 h pour la revue ?', langue: 'fr', surLaPage: true });
  });

  it('sans reponseA, aucune citation', () => {
    const bulle = bulleOptimiste({ clientMessageId: 'cid_2', texte: 'salut', auteur: 'Amina', auteurId: 'u1', langue: 'fr', horsLigne: false, maintenant: 0 });
    expect(bulle.citations).toEqual([]);
  });
});

describe('modifier / retirer — optimiste, confirmé, rétabli (fil-etat pur)', () => {
  const SERVIE = { ...rendus([brut()], ['fr'], 'u2')[0]!, envoi: 'servi' as const, raison: null };

  it('modifieMoiMeme pose le texte en attente, confirmeLaMutation le finalise', () => {
    const avant = insere(ETAT_VIDE, SERVIE);
    const modifiee = modifieMoiMeme(avant, 'r1', 'Je le mets dans mars.');
    const bulle = modifiee.bulles.find((b) => b.id === 'r1');
    expect(bulle).toMatchObject({ texte: 'Je le mets dans mars.', texteOriginal: 'Je le mets dans mars.', langueServie: null, traductions: {}, edite: true, envoi: 'en-attente' });

    const confirmee = confirmeLaMutation(modifiee, 'r1');
    expect(confirmee.bulles.find((b) => b.id === 'r1')?.envoi).toBe('servi');
  });

  it('un refus RÉTABLIT la bulle à l’identique', () => {
    const avant = insere(ETAT_VIDE, SERVIE);
    const bulleDAvant = avant.bulles.find((b) => b.id === 'r1')!;
    const modifiee = modifieMoiMeme(avant, 'r1', 'texte qui sera refusé');
    const restauree = retabli(modifiee, bulleDAvant);
    expect(restauree.bulles.find((b) => b.id === 'r1')).toEqual(bulleDAvant);
  });

  it('retireMoiMeme efface le contenu tout de suite, en attente', () => {
    const avant = insere(ETAT_VIDE, SERVIE);
    const retiree = retireMoiMeme(avant, 'r1');
    const bulle = retiree.bulles.find((b) => b.id === 'r1');
    expect(bulle).toMatchObject({ supprime: true, texte: '', pieces: [], citations: [], reactions: [], envoi: 'en-attente' });
  });

  it('un retrait refusé RÉTABLIT texte, pièces, citations, réactions', () => {
    const avecReaction = { ...SERVIE, reactions: [{ emoji: '👍', nombre: 1, mienne: false }] };
    const avant = insere(ETAT_VIDE, avecReaction);
    const bulleDAvant = avant.bulles.find((b) => b.id === 'r1')!;
    const retiree = retireMoiMeme(avant, 'r1');
    const restauree = retabli(retiree, bulleDAvant);
    expect(restauree.bulles.find((b) => b.id === 'r1')).toEqual(bulleDAvant);
  });
});

const MAINTENANT_DOC = Date.parse('2026-09-01T12:30:00.000Z');

const ETAT_DOC = (messages: readonly Message[], attributs: Partial<EtatDuFil> = {}): EtatDuFil => ({
  porte: { genre: 'membre', cle: 'c1' },
  fil: { id: 'c1', titre: 'Équipe Lagos', membres: 4, presence: { participants: [], presents: [] }, messages, plusAncien: null },
  lecteur: { id: 'u1', nom: 'Amina', langues: ['fr'] },
  erreur: null,
  brouillon: '',
  maintenant: MAINTENANT_DOC,
  composeur: { genre: 'ouvert' },
  tempsReel: null,
  contexte: null,
  plein: null,
  profil: null,
  ...attributs,
});

const SANS_GABARIT = (etat: EtatDuFil): string => documentDuFil(etat).replace(/<template[\s\S]*?<\/template>/g, '');

describe('le menu d’une ligne (§ 12.10.1, issue #5163)', () => {
  const MIEN_RECENT = rendus(
    [brut({ id: 'm1', content: 'Je le mets dans mars.', originalLanguage: 'fr', translations: [], senderId: 'u1', sender: { id: 'u1', displayName: 'Amina' } })],
    ['fr'],
    'u1',
  );
  const AUTRUI = rendus([brut({ id: 'm2' })], ['fr'], 'u1');
  const MIEN_VIEUX = rendus(
    [
      brut({
        id: 'm3',
        content: 'Vieux message',
        originalLanguage: 'fr',
        translations: [],
        createdAt: '2020-01-01T00:00:00.000Z',
        senderId: 'u1',
        sender: { id: 'u1', displayName: 'Amina' },
      }),
    ],
    ['fr'],
    'u1',
  );

  it('mes lignes portent répondre, modifier ET retirer', () => {
    const html = SANS_GABARIT(ETAT_DOC(MIEN_RECENT));
    expect(html).toContain('<details class="actions">');
    expect(html).toContain(`name="repondre" value="m1"`);
    expect(html).toContain(`name="modifier" value="m1"`);
    expect(html).toContain(`name="retirer" value="m1" formmethod="post" class="grave"`);
    expect(html).toContain(FIL.actionsSurMonMessage);
  });

  it('les lignes d’autrui ne portent QUE répondre', () => {
    const html = SANS_GABARIT(ETAT_DOC(AUTRUI));
    expect(html).toContain('name="repondre" value="m2"');
    expect(html).not.toContain('name="modifier" value="m2"');
    expect(html).not.toContain('name="retirer" value="m2"');
  });

  it('un message mien vieux de plus de 24h ne porte plus modifier — mais garde répondre et retirer', () => {
    const html = SANS_GABARIT(ETAT_DOC(MIEN_VIEUX));
    expect(html).toContain('name="repondre" value="m3"');
    expect(html).not.toContain('name="modifier" value="m3"');
    expect(html).toContain('name="retirer" value="m3"');
  });

  it('composeur FERMÉ : aucun menu sur les lignes d’autrui', () => {
    const html = SANS_GABARIT(ETAT_DOC(AUTRUI, { composeur: { genre: 'ferme', raison: 'Fermé', cause: 'lien' } }));
    expect(html).not.toContain('<details class="actions">');
  });

  it('un invité ne voit jamais modifier ni retirer, même sur ses propres lignes', () => {
    const mienInvite = rendus(
      [brut({ id: 'm4', content: 'Le mien', originalLanguage: 'fr', translations: [], senderId: 'p9', sender: { id: 'p9', displayName: 'Tolu' } })],
      ['fr'],
      'p9',
    );
    const html = SANS_GABARIT(
      ETAT_DOC(mienInvite, {
        porte: { genre: 'invite', lien: 'lnk' as never, segment: 'lnk', pseudo: 'Tolu', droits: { canSendMessages: true, canSendFiles: false, canSendImages: false, canViewHistory: true }, jonctionFraiche: false },
      }),
    );
    expect(html).toContain('name="repondre" value="m4"');
    expect(html).not.toContain('name="modifier" value="m4"');
    expect(html).not.toContain('name="retirer" value="m4"');
  });
});

describe('le contexte du composeur — ?repondre= et ?modifier= (§ 12.10.1, issue #5163)', () => {
  const CIBLE = rendus([brut()])[0]!;

  it('?repondre= arme le composeur SERVI, citation lue par le MÊME site', () => {
    const html = SANS_GABARIT(ETAT_DOC([CIBLE], { contexte: { genre: 'reponse', cible: CIBLE } }));
    expect(html).toContain('id="contexte-du-composeur" aria-live="polite" data-genre="reponse"');
    expect(html).not.toMatch(/id="contexte-du-composeur"[^>]*hidden/);
    expect(html).toContain('li class="citation" data-genre="reponse" data-cite="r1"');
    expect(html).toContain('On se cale à 15 h pour la revue ?');
    expect(html).toContain('name="reponseA" value="r1"');
    expect(html).toContain('href="/chats/c1"');
  });

  it('?modifier= préremplit le composeur avec le texte ORIGINAL, jamais la traduction', () => {
    const html = SANS_GABARIT(ETAT_DOC([CIBLE], { contexte: { genre: 'modification', cible: CIBLE } }));
    const champ = /<textarea[^>]*id="champ-texte"[^>]*>([\s\S]*?)<\/textarea>/.exec(html)?.[1] ?? '';
    expect(html).toContain('data-genre="modification"');
    expect(html).toContain('name="modifie" value="r1"');
    expect(champ).toBe('On se cale a 15h ?');
    expect(html).toContain(`aria-label="${FIL.enregistrer}"`);
    expect(html).not.toContain('class="joindre"');
  });

  it('sans contexte et sans temps réel, la fente n’est pas servie du tout', () => {
    const html = SANS_GABARIT(ETAT_DOC([CIBLE]));
    expect(html).not.toContain('contexte-du-composeur');
  });
});

describe('les gestes du fil — source unique et budget (issue #5163)', () => {
  const RACINE = join(__dirname, '..');
  const source = (chemin: string): string => readFileSync(join(RACINE, chemin), 'utf8');

  it('participate.ts reste sous le budget après extraction', () => {
    const lignes = source('lib/realtime/participate.ts').split('\n').length;
    expect(lignes).toBeLessThanOrEqual(1000);
  });

  it('fil-gestes.ts n’importe rien de app/ (leçon 518)', () => {
    expect(source('lib/realtime/fil-gestes.ts')).not.toMatch(/from ['"]@\/app\//);
  });

  it('fil-gestes.ts importe FIL de lib/contenu/fil, jamais une copie de ses libellés', () => {
    const gestes = source('lib/realtime/fil-gestes.ts');
    expect(gestes).toContain("from '@/lib/contenu/fil'");
  });

  it('adresseDeReponse et adresseDeModification ne sont composées que dans adresses-du-fil.ts', () => {
    ['lib/realtime/fil-gestes.ts', 'app/connecte/fil-vue.ts', 'app/connecte/fil-lignes.ts', 'app/connecte/fil-porte.ts'].forEach((chemin) => {
      expect(source(chemin)).not.toMatch(/\?repondre=\$\{/);
      expect(source(chemin)).not.toMatch(/\?modifier=\$\{/);
    });
  });
});
