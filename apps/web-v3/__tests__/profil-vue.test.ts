import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { svgDuSprite } from '@/app/actifs-inlines';
import { documentDuFil, type EtatDuFil } from '@/app/connecte/fil-vue';
import { documentDesChats, type EtatDesChats } from '@/app/connecte/liste-vue';
import type { Message } from '@/lib/api/fil';
import type { Conversation } from '@/lib/api/compte';
import type { ProfilServi } from '@/lib/api/profil';
import { PROFIL } from '@/lib/contenu/profil';
import { FIL } from '@/lib/contenu/fil';
import { CHATS } from '@/lib/contenu/liste';
import { ADRESSE_DE_MON_COMPTE, RANGEES_DE_L_ESPACE } from '@/lib/contenu/espace';

/**
 * LE PROFIL D'UN PARTICIPANT (§ 12.10.3) — un ÉTAT (`?profil=`) rendu par UN
 * SEUL module de vue (`app/connecte/profil-vue.ts`) aux TROIS adresses de
 * l'écran : `/chats/:cle` (membre), `/chat/:lien` (invité) et `/chats` (la
 * liste). Ces témoins gardent :
 *
 *   • la MÊME surimpression aux trois hôtes (au retour près, qui est leur
 *     adresse à chacun) — aucune jumelle ;
 *   • les trois chemins de fermeture (croix, voile, poignée), tous vers
 *     l'adresse NUE de l'hôte ;
 *   • le `<main>` (fil) / `<div class="enveloppe">` (liste) INERTE derrière
 *     la surimpression, comme le plein écran d'un média ;
 *   • ce que le panneau NE LIT ni NE FABRIQUE JAMAIS : une langue du profil
 *     (elle vient du FIL), une présence hors de ce qui est servi ;
 *   • les trois actions d'AUTRUI gardées par `peutAgir` (un compte) — un
 *     invité anonyme n'en voit AUCUNE, y compris « Écrire » ;
 *   • la branche SOI (#5030) : « C'est vous », UNE action « Mon compte » vers
 *     `ADRESSE_DE_MON_COMPTE`, et aucune des trois d'autrui — un membre qui
 *     touche son propre avatar dans le fil atteint son compte ;
 *   • le sous-état de confirmation d'un blocage, sans un octet de
 *     `confirm()`.
 */

const PROFIL_TROUVE = (extra: Partial<Extract<ProfilServi, { genre: 'profil' }>> = {}): ProfilServi => ({
  genre: 'profil',
  profil: {
    id: 'u-marta',
    nom: 'Marta Ruiz',
    pseudonyme: 'marta',
    bio: 'Traductrice · Madrid.',
    membreDepuis: '2024-03-01T00:00:00.000Z',
    anonyme: false,
  },
  relation: 'none',
  estSoi: false,
  ...extra,
});

const MESSAGE = (attributs: Partial<Message> = {}): Message => ({
  id: 'r1',
  clientMessageId: null,
  auteur: 'Marta',
  auteurId: 'u-marta',
  anonyme: false,
  deMoi: false,
  systeme: false,
  texte: 'Hola',
  texteOriginal: 'Hola',
  langueServie: null,
  langueOriginale: 'es',
  traductions: {},
  ecritA: '2026-09-01T12:00:00.000Z',
  protege: false,
  edite: false,
  supprime: false,
  pieces: [],
  lieu: null,
  citations: [],
  reactions: [],
  accuse: 'lu',
  ...attributs,
});

const ETAT_FIL = (messages: readonly Message[], attributs: Partial<EtatDuFil> = {}): EtatDuFil => ({
  porte: { genre: 'membre', cle: 'c1' },
  fil: { id: 'c1', titre: 'Équipe Lagos', membres: 4, presence: { participants: [], presents: [] }, messages, plusAncien: null },
  lecteur: { id: 'u1', nom: 'Amina', langues: ['fr'] },
  erreur: null,
  brouillon: '',
  maintenant: Date.parse('2026-09-01T12:30:00.000Z'),
  composeur: { genre: 'ouvert' },
  tempsReel: null,
  contexte: null,
  plein: null,
  profil: null,
  ...attributs,
});

const servi = (etat: EtatDuFil): string => documentDuFil(etat).replace(/<template[\s\S]*?<\/template>/g, '');

const dialogue = (doc: string): string => /<dialog class="profil"[\s\S]*?<\/dialog>/.exec(doc)?.[0] ?? '';

describe('le profil d’un participant — surimpression du fil (membre)', () => {
  it('ne rend rien tant que l’adresse ne le demande pas', () => {
    const doc = servi(ETAT_FIL([MESSAGE()]));
    expect(doc).not.toContain('<dialog class="profil"');
  });

  it('ouvre la surimpression sur le profil SERVI', () => {
    const doc = servi(ETAT_FIL([MESSAGE()], { profil: { handle: 'u-marta', servi: PROFIL_TROUVE(), confirmerBlocage: false } }));
    expect(doc).toContain('<dialog class="profil"');
    expect(doc).toContain(' open');
    expect(doc).toContain('Marta Ruiz');
    expect(doc).toContain('@marta');
    expect(doc).toContain('Traductrice · Madrid.');
  });

  it('rend AUCUNE langue et AUCUNE présence — ce que le profil ne sert jamais', () => {
    const doc = dialogue(servi(ETAT_FIL([MESSAGE()], { profil: { handle: 'u-marta', servi: PROFIL_TROUVE(), confirmerBlocage: false } })));
    expect(doc).not.toContain('isOnline');
    expect(doc).not.toContain('en ligne');
  });

  /** La ligne de langue vient du FIL — le message le plus récent de CET auteur, jamais du profil. */
  it('dit la langue DEPUIS LE FIL — « Écrit en Español dans ce fil »', () => {
    const doc = dialogue(servi(ETAT_FIL([MESSAGE({ langueOriginale: 'es' })], { profil: { handle: 'u-marta', servi: PROFIL_TROUVE(), confirmerBlocage: false } })));
    expect(doc).toContain(PROFIL.ecritDansCeFil('Español'));
    expect(doc).toContain(PROFIL.lecteurPrisme('Español'));
  });

  it('ne rend AUCUNE ligne de langue sans message de cet auteur dans la tranche', () => {
    const doc = dialogue(
      servi(ETAT_FIL([MESSAGE({ auteurId: 'u-autre' })], { profil: { handle: 'u-marta', servi: PROFIL_TROUVE(), confirmerBlocage: false } })),
    );
    expect(doc).not.toContain('ph-translate');
  });

  it('dit « Sur Meeshy depuis mars 2024 »', () => {
    const doc = dialogue(servi(ETAT_FIL([MESSAGE()], { profil: { handle: 'u-marta', servi: PROFIL_TROUVE(), confirmerBlocage: false } })));
    expect(doc).toMatch(/mars 2024/);
  });

  it('dit la conversation EN COMMUN — le titre du fil ouvert', () => {
    const doc = dialogue(servi(ETAT_FIL([MESSAGE()], { profil: { handle: 'u-marta', servi: PROFIL_TROUVE(), confirmerBlocage: false } })));
    expect(doc).toContain(PROFIL.participeA('Équipe Lagos'));
  });

  it('rend les TROIS actions à un membre, sur une personne qui n’est pas encore amie', () => {
    const doc = dialogue(servi(ETAT_FIL([MESSAGE()], { profil: { handle: 'u-marta', servi: PROFIL_TROUVE(), confirmerBlocage: false } })));
    expect(doc).toContain(PROFIL.ecrire('Marta'));
    expect(doc).toContain(PROFIL.ajouterEnAmi);
    expect(doc).toContain(PROFIL.bloquerOuSignaler);
    expect(doc).toContain(PROFIL.pasEncoreAmis);
  });

  it('cache « Ajouter en ami » quand la relation est déjà FRIEND, et dit « Ami »', () => {
    const doc = dialogue(
      servi(ETAT_FIL([MESSAGE()], { profil: { handle: 'u-marta', servi: PROFIL_TROUVE({ relation: 'friend' }), confirmerBlocage: false } })),
    );
    expect(doc).not.toContain(PROFIL.ajouterEnAmi);
    expect(doc).toContain(PROFIL.ami);
    // Écrire et Bloquer restent : la relation ne les gouverne pas.
    expect(doc).toContain(PROFIL.ecrire('Marta'));
    expect(doc).toContain(PROFIL.bloquerOuSignaler);
  });

  it('relation=self : « C’est vous », UNE action « Mon compte », et aucune des trois d’autrui', () => {
    const doc = dialogue(
      servi(ETAT_FIL([MESSAGE()], { profil: { handle: 'u1', servi: PROFIL_TROUVE({ relation: 'self', estSoi: true }), confirmerBlocage: false } })),
    );
    expect(doc).toContain('data-relation="self"');
    expect(doc).toContain(PROFIL.cEstVous);
    expect(doc.match(/<a class="action primaire"/g)).toHaveLength(1);
    expect(doc).toContain(`<a class="action primaire" href="${ADRESSE_DE_MON_COMPTE}">`);
    expect(doc).toContain(PROFIL.monCompte);
    expect(doc).toContain(svgDuSprite('ph-user-circle'));
    expect(doc).not.toContain(PROFIL.ecrire('Marta'));
    expect(doc).not.toContain(PROFIL.ajouterEnAmi);
    expect(doc).not.toContain(PROFIL.bloquerOuSignaler);
    expect(doc).not.toContain('<form');
  });

  it('relation=self : ?confirmer=bloquer est ignoré — on ne se bloque pas', () => {
    const doc = dialogue(
      servi(ETAT_FIL([MESSAGE()], { profil: { handle: 'u1', servi: PROFIL_TROUVE({ relation: 'self', estSoi: true }), confirmerBlocage: true } })),
    );
    expect(doc).not.toContain(PROFIL.confirmer);
    expect(doc).toContain(PROFIL.monCompte);
  });

  it('relation=self : ni « en commun » ni la langue — ces deux phrases parlent de l’AUTRE', () => {
    const doc = dialogue(
      servi(
        ETAT_FIL([MESSAGE({ auteurId: 'u1', langueOriginale: 'es' })], {
          profil: { handle: 'u1', servi: PROFIL_TROUVE({ relation: 'self', estSoi: true }), confirmerBlocage: false },
        }),
      ),
    );
    expect(doc).not.toContain(PROFIL.participeA('Équipe Lagos'));
    expect(doc).not.toContain(PROFIL.ecritDansCeFil('Español'));
    expect(doc).not.toContain(PROFIL.lecteurPrisme('Español'));
    expect(doc).toMatch(/mars 2024/);
  });

  it('rend introuvable, limite et panne — chacun sa phrase, aucune action', () => {
    const introuvable = dialogue(servi(ETAT_FIL([], { profil: { handle: 'x', servi: { genre: 'introuvable' }, confirmerBlocage: false } })));
    expect(introuvable).toContain(PROFIL.introuvable);
    expect(introuvable).not.toContain('actions-profil');

    const limite = dialogue(servi(ETAT_FIL([], { profil: { handle: 'x', servi: { genre: 'limite', message: 'Patientez.' }, confirmerBlocage: false } })));
    expect(limite).toContain('Patientez.');

    const panne = dialogue(servi(ETAT_FIL([], { profil: { handle: 'x', servi: { genre: 'panne' }, confirmerBlocage: false } })));
    expect(panne).toContain(PROFIL.panne);
  });

  it('ferme par la croix, le voile ET la poignée — les trois vers l’adresse NUE de l’hôte', () => {
    const doc = servi(ETAT_FIL([MESSAGE()], { profil: { handle: 'u-marta', servi: PROFIL_TROUVE(), confirmerBlocage: false } }));
    expect(doc).toContain('<a class="voile" href="/chats/c1"');
    expect(doc).toContain('<a class="fermer" href="/chats/c1"');
    expect(doc).toContain('<a class="poignee" href="/chats/c1"');
  });

  it('rend le fil INERTE derrière la surimpression, et la déclare modale', () => {
    const doc = servi(ETAT_FIL([MESSAGE()], { profil: { handle: 'u-marta', servi: PROFIL_TROUVE(), confirmerBlocage: false } }));
    expect(doc.indexOf('<dialog class="profil"')).toBeLessThan(doc.indexOf('<main'));
    expect(doc).toContain('<main id="main-content" class="fil-ecran" inert');
    expect(doc).toContain('aria-modal="true"');
  });

  it('ne floute PAS le fond — aucun filter:blur, un voile suffit', () => {
    const html = documentDuFil(ETAT_FIL([MESSAGE()], { profil: { handle: 'u-marta', servi: PROFIL_TROUVE(), confirmerBlocage: false } }));
    // Le seul filter:blur du dépôt reste celui du cadre inerte de /chat/:lien (charte).
    expect(html).not.toMatch(/dialog\.profil[^}]*filter:blur/);
  });

  it('confirme un blocage SANS confirm() — un second état de la même adresse', () => {
    const doc = dialogue(
      servi(ETAT_FIL([MESSAGE()], { profil: { handle: 'u-marta', servi: PROFIL_TROUVE(), confirmerBlocage: true } })),
    );
    expect(doc).toContain(PROFIL.confirmerLeBlocage('Marta Ruiz'));
    expect(doc).toContain(PROFIL.confirmer);
    expect(doc).toContain('<a class="action discrete" href="/chats/c1?profil=u-marta">');
    // Aucune des trois actions nominales pendant la confirmation.
    expect(doc).not.toContain(PROFIL.ajouterEnAmi);
  });

  it('ignore ?confirmer= sur un profil qui n’a pas les trois actions (introuvable)', () => {
    const doc = dialogue(servi(ETAT_FIL([], { profil: { handle: 'x', servi: { genre: 'introuvable' }, confirmerBlocage: true } })));
    expect(doc).not.toContain(PROFIL.confirmer);
    expect(doc).toContain(PROFIL.introuvable);
  });
});

describe('le profil d’un participant — surimpression du fil (invité)', () => {
  const ETAT_INVITE = (attributs: Partial<EtatDuFil> = {}): EtatDuFil =>
    ETAT_FIL([MESSAGE()], {
      porte: { genre: 'invite', lien: 'mshy_lagos' as never, segment: 'lagos-q1', pseudo: 'Tolu', droits: { canSendMessages: true, canSendFiles: false, canSendImages: false, canViewHistory: true }, jonctionFraiche: false },
      lecteur: { id: 'p9', nom: 'Tolu', langues: ['fr'] },
      ...attributs,
    });

  it('rend la MÊME identité, badge, bio et infos que le membre — au retour près, et sans actions (peutAgir=false)', () => {
    const membre = dialogue(servi(ETAT_FIL([MESSAGE()], { profil: { handle: 'u-marta', servi: PROFIL_TROUVE(), confirmerBlocage: false } })));
    const invite = dialogue(servi(ETAT_INVITE({ profil: { handle: 'u-marta', servi: PROFIL_TROUVE(), confirmerBlocage: false } })));
    const sansActions = (html: string): string => html.replace(/<div class="actions-profil">[\s\S]*?<\/div>/, '');
    expect(sansActions(invite).replaceAll('/chat/lagos-q1', '/chats/c1')).toBe(sansActions(membre));
  });

  it('un invité anonyme ne voit AUCUNE des trois actions — pas même « Écrire »', () => {
    const doc = dialogue(servi(ETAT_INVITE({ profil: { handle: 'u-marta', servi: PROFIL_TROUVE(), confirmerBlocage: false } })));
    expect(doc).not.toContain(PROFIL.ecrire('Marta'));
    expect(doc).not.toContain(PROFIL.ajouterEnAmi);
    expect(doc).not.toContain(PROFIL.bloquerOuSignaler);
    // Le badge de relation reste rendu — c'est une INFORMATION, pas une action.
    expect(doc).toContain(PROFIL.pasEncoreAmis);
  });

  it('estSoi SANS compte : « C’est vous », et AUCUNE action — /settings/profile rendrait /login', () => {
    const doc = dialogue(
      servi(
        ETAT_INVITE({
          lecteur: { id: 'p9', nom: 'Tolu', langues: ['fr'] },
          profil: { handle: 'p9', servi: PROFIL_TROUVE({ relation: 'self', estSoi: true }), confirmerBlocage: false },
        }),
      ),
    );
    expect(doc).toContain(PROFIL.cEstVous);
    expect(doc).not.toContain(ADRESSE_DE_MON_COMPTE);
    expect(doc).not.toContain(PROFIL.monCompte);
    expect(doc).not.toContain('actions-profil');
  });

  it('rend la MÊME surimpression de SOI aux deux portes du fil — au retour et aux actions près', () => {
    const soi = { handle: 'u1', servi: PROFIL_TROUVE({ relation: 'self', estSoi: true }), confirmerBlocage: false } as const;
    const membre = dialogue(servi(ETAT_FIL([MESSAGE()], { profil: soi })));
    const invite = dialogue(servi(ETAT_INVITE({ profil: soi })));
    const sansActions = (html: string): string => html.replace(/<div class="actions-profil">[\s\S]*?<\/div>/, '');
    expect(sansActions(invite).replaceAll('/chat/lagos-q1', '/chats/c1')).toBe(sansActions(membre));
  });

  it('ferme vers l’adresse NUE de l’invité — /chat/:lien', () => {
    const doc = servi(ETAT_INVITE({ profil: { handle: 'u-marta', servi: PROFIL_TROUVE(), confirmerBlocage: false } }));
    expect(doc).toContain('<a class="voile" href="/chat/lagos-q1"');
    expect(doc).toContain('<a class="fermer" href="/chat/lagos-q1"');
  });
});

describe('le profil d’un participant — surimpression de la LISTE (/chats)', () => {
  const CONVERSATION = (attributs: Partial<Conversation> = {}): Conversation => ({
    id: 'c1',
    identifiant: 'lagos',
    titre: 'Équipe Lagos',
    genre: 'direct',
    membres: 2,
    nonLus: 0,
    dernierMessageA: '2026-09-01T12:00:00.000Z',
    apercu: null,
    apercuTraductions: null,
    apercuLangueOriginale: null,
    sourdine: false,
    archivee: false,
    participantsInscrits: [{ id: 'u-marta', nom: 'Marta Ruiz' }],
    ...attributs,
  });

  const ETAT_LISTE = (attributs: Partial<EtatDesChats> = {}): EtatDesChats => ({
    conversations: [CONVERSATION()],
    maintenant: Date.parse('2026-09-01T12:30:00.000Z'),
    langues: ['fr'],
    moi: 'u1',
    tempsReel: null,
    profil: null,
    ...attributs,
  });

  it('ne rend rien sans ?profil=', () => {
    expect(documentDesChats(ETAT_LISTE())).not.toContain('<dialog class="profil"');
  });

  it('ouvre la surimpression, avec la conversation EN COMMUN retrouvée LOCALEMENT', () => {
    const doc = dialogue(documentDesChats(ETAT_LISTE({ profil: { handle: 'u-marta', servi: PROFIL_TROUVE(), confirmerBlocage: false } })));
    expect(doc).toContain('Marta Ruiz');
    expect(doc).toContain(PROFIL.participeA('Équipe Lagos'));
    // Aucune langue : la liste ne charge aucun message.
    expect(doc).not.toContain('ph-translate');
  });

  it('rend les trois actions — /chats est un écran du MEMBRE', () => {
    const doc = dialogue(documentDesChats(ETAT_LISTE({ profil: { handle: 'u-marta', servi: PROFIL_TROUVE(), confirmerBlocage: false } })));
    expect(doc).toContain(PROFIL.ecrire('Marta'));
    expect(doc).toContain(PROFIL.ajouterEnAmi);
  });

  it('ferme vers /chats, et rend l’ENVELOPPE inerte derrière elle', () => {
    const doc = documentDesChats(ETAT_LISTE({ profil: { handle: 'u-marta', servi: PROFIL_TROUVE(), confirmerBlocage: false } }));
    expect(doc).toContain('<a class="voile" href="/chats"');
    expect(doc).toContain('<a class="fermer" href="/chats"');
    expect(doc).toContain('<div class="enveloppe" inert>');
  });

  it('l’AVATAR d’un tête-à-tête ouvre le profil de l’AUTRE personne', () => {
    const doc = documentDesChats(ETAT_LISTE());
    expect(doc).toContain('<a class="avatar-lien" draggable="false" href="/chats?profil=u-marta"');
    expect(doc).toContain(CHATS.voirLeProfil('Marta Ruiz'));
  });

  it('un GROUPE n’a personne à ouvrir — l’avatar reste dans la ligne', () => {
    const doc = documentDesChats(ETAT_LISTE({ conversations: [CONVERSATION({ genre: 'group', participantsInscrits: [] })] }));
    expect(doc).not.toContain('class="avatar-lien"');
    expect(doc).toContain('<a class="ligne"');
  });

  it('un tête-à-tête dont le pair n’a pas de compte n’a pas de lien non plus', () => {
    const doc = documentDesChats(ETAT_LISTE({ conversations: [CONVERSATION({ participantsInscrits: [] })] }));
    expect(doc).not.toContain('class="avatar-lien"');
  });
});

describe('l’avatar et le nom d’un auteur ouvrent son profil, dans le fil', () => {
  it('lie l’avatar ET le nom vers ?profil=<auteurId>', () => {
    const doc = servi(ETAT_FIL([MESSAGE()]));
    expect(doc).toContain('<a class="avatar-lien" href="/chats/c1?profil=u-marta"');
    expect(doc).toContain('<a class="nom-lien" href="/chats/c1?profil=u-marta">');
    expect(doc).toContain(FIL.voirLeProfil('Marta'));
  });

  it('ne lie RIEN pour un message ANONYME (invité de lien, sans compte)', () => {
    const doc = servi(ETAT_FIL([MESSAGE({ anonyme: true })]));
    expect(doc).not.toContain('class="avatar-lien"');
    expect(doc).not.toContain('class="nom-lien"');
  });

  /**
   * LE TÉMOIN RETOURNÉ (#5030). Il affirmait l'INVERSE : « ne lie RIEN pour
   * SES PROPRES messages ». Il disait vrai de l'implémentation d'alors, et
   * FAUX du produit — un membre a un compte, `/settings/profile` est servi
   * (#5093), et un écran sans issue n'est pas un choix de design. On le
   * RETOURNE plutôt que de le supprimer : c'est la même question, l'autre
   * réponse (leçon 507).
   */
  it('lie l’avatar ET le nom de SES PROPRES messages — le membre a un compte', () => {
    const doc = servi(ETAT_FIL([MESSAGE({ deMoi: true, auteurId: 'u1', auteur: 'Amina' })]));
    expect(doc).toContain('<a class="avatar-lien" href="/chats/c1?profil=u1"');
    expect(doc).toContain('<a class="nom-lien" href="/chats/c1?profil=u1">');
    expect(doc).toContain(`<span class="nom">${FIL.vous}</span>`);
    expect(doc).toContain(FIL.voirVotreProfil);
    expect(doc).not.toContain(FIL.voirLeProfil('Amina'));
  });

  it('ne lie RIEN pour SES PROPRES messages quand on est l’INVITÉ — deMoi sans compte', () => {
    const doc = servi(ETAT_FIL([MESSAGE({ deMoi: true, anonyme: true, auteurId: 'p9', auteur: 'Tolu' })]));
    expect(doc).not.toContain('class="avatar-lien"');
    expect(doc).not.toContain('class="nom-lien"');
    expect(doc).toContain(`>${FIL.vous}<`);
  });

  it('ne lie RIEN pour un message de soi SANS identifiant — un href="?profil=null" mentirait', () => {
    const doc = servi(ETAT_FIL([MESSAGE({ deMoi: true, auteurId: null })]));
    expect(doc).not.toContain('class="avatar-lien"');
    expect(doc).not.toContain('class="nom-lien"');
  });

  it('ne lie RIEN pour une ligne SYSTÈME', () => {
    const doc = servi(ETAT_FIL([MESSAGE({ systeme: true, texte: 'A rejoint la conversation' })]));
    expect(doc).not.toContain('class="avatar-lien"');
    expect(doc).not.toContain('class="nom-lien"');
  });
});

/**
 * LA DESTINATION DE « MON COMPTE » EST LUE, JAMAIS ÉCRITE (#5030). Deux
 * littéraux `/settings/profile` — un dans l'espace membre, un dans le panneau
 * de profil — seraient deux sources de vérité pour UNE adresse : le jour où la
 * route déménage, l'une des deux mentirait en silence. `espace-membre.test.ts`
 * oppose déjà `RANGEES_DE_L_ESPACE[].href` aux `app/**\/route.ts` réellement
 * émis, donc lire la constante fait hériter ce témoin-là au panneau.
 */
describe('la destination « Mon compte » — un seul site', () => {
  const source = (chemin: string): string =>
    readFileSync(join(__dirname, '..', chemin), 'utf8');

  it('n’est écrite NULLE PART dans le panneau de profil ni dans sa copie', () => {
    expect(source('app/connecte/profil-vue.ts')).not.toContain(ADRESSE_DE_MON_COMPTE);
    expect(source('lib/contenu/profil.ts')).not.toContain(ADRESSE_DE_MON_COMPTE);
  });

  it('est celle de la première rangée de l’espace membre — même adresse, même glyphe', () => {
    const rangee = RANGEES_DE_L_ESPACE.find((item) => item.href === ADRESSE_DE_MON_COMPTE);
    expect(rangee).toBeDefined();
    expect(rangee?.glyphe).toBe('ph-user-circle');
  });

  it('est bien celle que le panneau REND — la constante, pas une chaîne voisine', () => {
    const doc = dialogue(
      servi(ETAT_FIL([MESSAGE()], { profil: { handle: 'u1', servi: PROFIL_TROUVE({ relation: 'self', estSoi: true }), confirmerBlocage: false } })),
    );
    expect(doc).toContain(`href="${ADRESSE_DE_MON_COMPTE}"`);
  });
});
