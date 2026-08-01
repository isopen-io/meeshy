import { claimableMediaWhere } from '../mediaOwnership';

/**
 * Les trois sites de rattachement, vus depuis la BASE.
 *
 * On simule le comportement réel de `updateMany` — filtrer un jeu de documents
 * par la clause produite — plutôt que d'inspecter la forme de l'objet. C'est ce
 * qui distingue « la clause contient bien un `uploaderId` » (vrai même si elle
 * laisse passer le voleur) de « le voleur est effectivement refusé ».
 *
 * La sémantique simulée est celle de Prisma sur MongoDB, PROUVÉE en production
 * le 2026-08-01 : un prédicat `field: null` ne matche qu'un champ PRÉSENT à
 * `null` — jamais un champ absent du document. Seul `{ isSet: false }` matche
 * l'absence. Un simulateur qui confond les deux ne peut pas voir l'incident
 * que ce fichier épingle.
 */

const ALICE = '507f1f77bcf86cd799439011';
const BOB = '507f1f77bcf86cd799439012';

interface MediaDoc {
  id: string;
  postId?: string | null;
  commentId?: string | null;
  uploaderId?: string | null;
}

type FieldPredicate = string | null | { isSet: boolean };

type WhereShape = {
  AND?: WhereShape[];
  OR?: WhereShape[];
} & Record<string, unknown>;

function fieldMatches(doc: MediaDoc, field: string, predicate: FieldPredicate): boolean {
  const present = field in doc;
  const value = (doc as unknown as Record<string, unknown>)[field];
  if (predicate !== null && typeof predicate === 'object') {
    return predicate.isSet === present;
  }
  if (predicate === null) return present && value === null;
  return present && value === predicate;
}

/** Applique la clause comme le ferait MongoDB à travers Prisma. */
function matches(doc: MediaDoc, where: WhereShape): boolean {
  return Object.entries(where).every(([key, predicate]) => {
    if (key === 'AND') return (predicate as WhereShape[]).every((w) => matches(doc, w));
    if (key === 'OR') return (predicate as WhereShape[]).some((w) => matches(doc, w));
    return fieldMatches(doc, key, predicate as FieldPredicate);
  });
}

function claimedBy(docs: MediaDoc[], owner: string): string[] {
  const where = claimableMediaWhere(owner) as WhereShape;
  return docs.filter((d) => matches(d, where)).map((d) => d.id);
}

describe('garde de revendication — le scénario de vol', () => {
  it('BOB_ne_peut_PAS_reclamer_le_media_en_attente_dALICE', () => {
    // Le cœur du point 21 : les ObjectId voisins ne diffèrent que d'un
    // compteur, et un upload abandonné reste en attente jusqu'au nettoyage.
    // Deviner l'id suffisait.
    const docs: MediaDoc[] = [{ id: 'media-alice', postId: null, commentId: null, uploaderId: ALICE }];

    expect(claimedBy(docs, BOB)).toEqual([]);
    expect(claimedBy(docs, ALICE)).toEqual(['media-alice']);
  });

  it('un_media_deja_rattache_a_un_post_nest_reclamable_par_PERSONNE', () => {
    const docs: MediaDoc[] = [{ id: 'm', postId: 'post-1', commentId: null, uploaderId: ALICE }];

    expect(claimedBy(docs, ALICE)).toEqual([]);
    expect(claimedBy(docs, BOB)).toEqual([]);
  });

  it('un_media_de_COMMENTAIRE_nest_plus_capturable_par_un_post', () => {
    // `createPost` ne testait que `postId` : le média d'un commentaire, dont
    // `postId` est nul, satisfaisait la garde alors que les deux champs sont
    // exclusifs par construction.
    const docs: MediaDoc[] = [{ id: 'm', postId: null, commentId: 'comment-1', uploaderId: ALICE }];

    expect(claimedBy(docs, ALICE)).toEqual([]);
  });

  it('le_media_TUS_reel_sans_champ_commentId_EST_reclamable_par_son_uploadeur', () => {
    // Reproduction de l'incident prod du 2026-07-31→08-01 : le handler TUS
    // crée `{ postId: null }` SANS poser `commentId`. Prisma sur MongoDB ne
    // matche pas un champ ABSENT avec `null` — la clause de phase 2 refusait
    // donc TOUT média fraîchement téléversé, et chaque publication (réels,
    // stories) perdait son image en silence.
    const tusDoc: MediaDoc = { id: 'tus', postId: null, uploaderId: ALICE };

    expect(claimedBy([tusDoc], ALICE)).toEqual(['tus']);
    expect(claimedBy([tusDoc], BOB)).toEqual([]);
  });

  it('labsence_des_DEUX_champs_de_rattachement_reste_un_media_libre', () => {
    // Même robustesse pour `postId` : un writer qui omettrait le champ au lieu
    // de le poser à `null` ne doit pas rendre le média irréclamable.
    const bare: MediaDoc = { id: 'bare', uploaderId: ALICE };

    expect(claimedBy([bare], ALICE)).toEqual(['bare']);
    expect(claimedBy([bare], BOB)).toEqual([]);
  });

  it('PHASE_2_un_media_SANS_proprietaire_nest_reclamable_par_PERSONNE', () => {
    // Inversion du test de phase 1, qui documentait la brèche transitoire.
    // Le rattrapage a été appliqué en production : le seul média restant sans
    // propriétaire est un instantané orphelin généré côté serveur, que
    // personne n'a vocation à rattacher.
    const absent: MediaDoc = { id: 'herite-absent', postId: null, commentId: null };
    const nul: MediaDoc = { id: 'herite-nul', postId: null, commentId: null, uploaderId: null };

    expect(claimedBy([absent, nul], BOB)).toEqual([]);
    expect(claimedBy([absent, nul], ALICE)).toEqual([]);
  });

  it('les_deux_formes_dabsence_echouent_pareil', () => {
    // MongoDB distingue un champ ABSENT d'un champ à `null` ; l'égalité
    // stricte rejette les deux, sans qu'on ait à les énumérer.
    const absent: MediaDoc = { id: 'a', postId: null, commentId: null };
    const nul: MediaDoc = { id: 'b', postId: null, commentId: null, uploaderId: null };

    expect(claimedBy([absent, nul], ALICE)).toEqual([]);
  });

  it('un_lot_mixte_ne_laisse_passer_que_ce_qui_appartient_au_demandeur', () => {
    const docs: MediaDoc[] = [
      { id: 'sien', postId: null, commentId: null, uploaderId: BOB },
      { id: 'sien-tus', postId: null, uploaderId: BOB },
      { id: 'autrui', postId: null, commentId: null, uploaderId: ALICE },
      { id: 'sans-proprietaire', postId: null, commentId: null },
      { id: 'pris', postId: 'p1', commentId: null, uploaderId: BOB },
    ];

    // SEUL le sien passe — sous ses deux formes de stockage. C'est la
    // définition de la phase 2, sans l'angle mort de l'incident.
    expect(claimedBy(docs, BOB)).toEqual(['sien', 'sien-tus']);
  });
});
