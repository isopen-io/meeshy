import { claimableMediaWhere } from '../mediaOwnership';

/**
 * Les trois sites de rattachement, vus depuis la BASE.
 *
 * On simule le comportement réel de `updateMany` — filtrer un jeu de documents
 * par la clause produite — plutôt que d'inspecter la forme de l'objet. C'est ce
 * qui distingue « la clause contient bien un `uploaderId` » (vrai même si elle
 * laisse passer le voleur) de « le voleur est effectivement refusé ».
 */

const ALICE = '507f1f77bcf86cd799439011';
const BOB = '507f1f77bcf86cd799439012';

interface MediaDoc {
  id: string;
  postId: string | null;
  commentId: string | null;
  uploaderId?: string | null;
}

/** Applique la clause comme le ferait MongoDB. */
function matches(doc: MediaDoc, where: ReturnType<typeof claimableMediaWhere>): boolean {
  if (doc.postId !== where.postId) return false;
  if (doc.commentId !== where.commentId) return false;
  return where.OR.some((clause) => {
    const expected = (clause as { uploaderId: unknown }).uploaderId;
    if (expected && typeof expected === 'object' && 'isSet' in (expected as object)) {
      // `isSet: false` ⟺ la clé est ABSENTE du document.
      return !('uploaderId' in doc);
    }
    return ('uploaderId' in doc ? doc.uploaderId : undefined) === expected;
  });
}

function claimedBy(docs: MediaDoc[], owner: string): string[] {
  const where = claimableMediaWhere(owner);
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

  it('PHASE_1_un_media_HERITE_sans_proprietaire_reste_reclamable_par_tous', () => {
    // Comportement VOULU et transitoire : resserrer avant le rattrapage
    // rendrait tout média hérité impossible à rattacher, en silence.
    // Ce test documente la brèche restante — il devra être INVERSÉ en phase 2.
    const absent: MediaDoc = { id: 'herite-absent', postId: null, commentId: null };
    const nul: MediaDoc = { id: 'herite-nul', postId: null, commentId: null, uploaderId: null };

    expect(claimedBy([absent, nul], BOB)).toEqual(['herite-absent', 'herite-nul']);
  });

  it('les_deux_formes_dabsence_sont_couvertes', () => {
    // MongoDB distingue un champ ABSENT d'un champ à `null`. N'en couvrir
    // qu'une aurait laissé la moitié des lignes héritées non rattachables.
    const absent: MediaDoc = { id: 'a', postId: null, commentId: null };
    const nul: MediaDoc = { id: 'b', postId: null, commentId: null, uploaderId: null };

    expect(claimedBy([absent], ALICE)).toEqual(['a']);
    expect(claimedBy([nul], ALICE)).toEqual(['b']);
  });

  it('un_lot_mixte_ne_laisse_passer_que_ce_qui_appartient_au_demandeur', () => {
    const docs: MediaDoc[] = [
      { id: 'sien', postId: null, commentId: null, uploaderId: BOB },
      { id: 'autrui', postId: null, commentId: null, uploaderId: ALICE },
      { id: 'herite', postId: null, commentId: null },
      { id: 'pris', postId: 'p1', commentId: null, uploaderId: BOB },
    ];

    // « herite » passe encore en phase 1 ; « autrui » et « pris », jamais.
    expect(claimedBy(docs, BOB)).toEqual(['sien', 'herite']);
  });
});
