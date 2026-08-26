import {
  uploaderIdOrNull,
  uploaderIdFromFilePath,
  claimableMediaWhere,
  describeClaimShortfall,
  isPostMediaUploadContext,
  postMediaUploaderOrNull,
} from '../mediaOwnership';
import { isPostMediaUploadContext as isPostMediaUploadContextShared } from '@meeshy/shared/types/attachment';

const OWNER = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd799439012';

describe('isPostMediaUploadContext', () => {
  it('reconnait_les_quatre_contextes_de_post_media', () => {
    for (const context of ['post', 'story', 'status', 'comment']) {
      expect(isPostMediaUploadContext(context)).toBe(true);
    }
  });

  it('refuse_les_contextes_message_et_inconnus', () => {
    // Les pièces jointes de MESSAGE (participants anonymes compris) ne passent
    // pas par PostMedia — elles ne sont jamais concernées par le rejet.
    expect(isPostMediaUploadContext('message')).toBe(false);
    expect(isPostMediaUploadContext(undefined)).toBe(false);
    expect(isPostMediaUploadContext(null)).toBe(false);
    expect(isPostMediaUploadContext('')).toBe(false);
    expect(isPostMediaUploadContext('POST')).toBe(false);
  });
});

describe('isPostMediaUploadContext — délégation au vocabulaire partagé (cycle composer W7bis)', () => {
  // Le web (attachmentTransport) a besoin de la MÊME définition que le
  // handler TUS pour taguer ses uploads — deux copies auraient pu diverger
  // silencieusement (aucun gate ne les aurait comparées). Le module partagé
  // est donc la source, et celui-ci délègue au lieu de réimplémenter.
  it('est_le_MEME_export_reexporte_jamais_une_copie_locale', () => {
    expect(isPostMediaUploadContext).toBe(isPostMediaUploadContextShared);
  });

  it('rend_le_meme_verdict_que_le_module_partage_sur_les_neuf_cas', () => {
    const cases: unknown[] = ['post', 'story', 'status', 'comment', 'message', undefined, null, '', 'POST'];
    for (const c of cases) {
      expect(isPostMediaUploadContext(c)).toBe(isPostMediaUploadContextShared(c));
    }
  });
});

describe('postMediaUploaderOrNull', () => {
  it('rend_lidentifiant_dun_utilisateur_enregistre', () => {
    expect(postMediaUploaderOrNull({ userId: OWNER, isAnonymous: false })).toBe(OWNER);
  });

  it('rend_null_pour_une_session_anonyme_MEME_si_le_jeton_a_la_forme_dun_objectid', () => {
    // Un jeton de session qui matcherait par hasard /^[a-f0-9]{24}$/ ne doit
    // JAMAIS devenir un propriétaire : l'égalité stricte du claim comparerait
    // alors un jeton à un id utilisateur — au mieux irréclamable, au pire un
    // alias involontaire d'un vrai compte.
    expect(postMediaUploaderOrNull({ userId: OWNER, isAnonymous: true })).toBeNull();
    expect(postMediaUploaderOrNull({ userId: 'sess_abc', isAnonymous: true })).toBeNull();
  });

  it('rend_null_pour_le_repli_anonymous_et_les_identites_invalides', () => {
    expect(postMediaUploaderOrNull({ userId: 'anonymous', isAnonymous: false })).toBeNull();
    expect(postMediaUploaderOrNull({ userId: null, isAnonymous: false })).toBeNull();
    expect(postMediaUploaderOrNull({ userId: undefined, isAnonymous: false })).toBeNull();
  });
});

describe('uploaderIdOrNull', () => {
  it('accepte_un_identifiant_utilisateur', () => {
    expect(uploaderIdOrNull(OWNER)).toBe(OWNER);
  });

  it('REFUSE_le_repli_anonymous_du_handler_dupload', () => {
    // L'écrire comme propriétaire créerait un compte fourre-tout sous lequel
    // N utilisateurs pourraient se revendiquer mutuellement — strictement pire
    // que `null`, qui n'autorise rien de plus qu'aujourd'hui.
    expect(uploaderIdOrNull('anonymous')).toBeNull();
  });

  it('REFUSE_un_jeton_de_session_anonyme', () => {
    expect(uploaderIdOrNull('sess_a1b2c3d4e5f6')).toBeNull();
  });

  it('refuse_vide_null_et_non_chaine', () => {
    expect(uploaderIdOrNull('')).toBeNull();
    expect(uploaderIdOrNull(null)).toBeNull();
    expect(uploaderIdOrNull(undefined)).toBeNull();
    expect(uploaderIdOrNull(42 as unknown as string)).toBeNull();
  });

  it('refuse_un_objectid_en_majuscules_ou_tronque', () => {
    expect(uploaderIdOrNull(OWNER.toUpperCase())).toBeNull();
    expect(uploaderIdOrNull(OWNER.slice(0, 23))).toBeNull();
    expect(uploaderIdOrNull(OWNER + 'a')).toBeNull();
  });
});

describe('uploaderIdFromFilePath', () => {
  it('extrait_luploadeur_du_chemin_annee_mois_user_fichier', () => {
    // Seule source restante pour un média EN ATTENTE créé avant le champ —
    // c'est-à-dire pour les médias vulnérables.
    expect(uploaderIdFromFilePath(`2026/07/${OWNER}/abc.jpg`)).toBe(OWNER);
  });

  it('rend_null_plutot_que_dinventer_un_proprietaire', () => {
    expect(uploaderIdFromFilePath('2026/07/anonymous/abc.jpg')).toBeNull();
    expect(uploaderIdFromFilePath('abc.jpg')).toBeNull();
    expect(uploaderIdFromFilePath('')).toBeNull();
    expect(uploaderIdFromFilePath(null)).toBeNull();
  });

  it('tolere_un_prefixe_ou_des_separateurs_en_trop', () => {
    expect(uploaderIdFromFilePath(`/uploads//2026/07/${OWNER}/abc.jpg`)).toBe(OWNER);
  });
});

describe('claimableMediaWhere', () => {
  it('exige_un_media_LIBRE_de_post_ET_de_commentaire', () => {
    const where = claimableMediaWhere(OWNER);
    // « Libre » sous les DEUX formes MongoDB — présent à `null` OU absent du
    // document : Prisma-Mongo ne matche pas un champ absent avec `null`, et le
    // handler TUS ne pose pas `commentId`. Sans la branche `isSet: false`,
    // aucun média fraîchement téléversé n'était réclamable (incident prod
    // 2026-07-31→08-01).
    expect(where.AND).toEqual([
      { OR: [{ postId: null }, { postId: { isSet: false } }] },
      { OR: [{ commentId: null }, { commentId: { isSet: false } }] },
    ]);
  });

  it('PHASE_2_exige_une_EGALITE_stricte_sur_le_proprietaire', () => {
    // Plus aucune tolérance : ni `null`, ni champ absent. C'est cette ligne
    // qui ferme le trou.
    expect(claimableMediaWhere(OWNER).uploaderId).toBe(OWNER);
    expect(claimableMediaWhere(OWNER)).not.toHaveProperty('OR');
  });

  it('nadmet_PAS_un_autre_uploadeur', () => {
    expect(claimableMediaWhere(OWNER).uploaderId).not.toBe(OTHER);
  });

  it('la_clause_ne_melange_pas_deux_proprietaires', () => {
    expect(claimableMediaWhere(OTHER).uploaderId).toBe(OTHER);
  });
});

describe('describeClaimShortfall', () => {
  it('rend_null_quand_tout_a_ete_rattache', () => {
    expect(describeClaimShortfall(['a', 'b'], 2)).toBeNull();
  });

  it('signale_lecart_quand_un_media_est_ecarte', () => {
    // `updateMany` ignore en silence : sans cette trace, un média refusé
    // disparaît de la publication et le symptôme est indiscernable d'un vol.
    const message = describeClaimShortfall(['a', 'b'], 1);
    expect(message).toContain('1 média(s) sur 2');
  });

  it('dedoublonne_les_ids_demandes_avant_de_comparer', () => {
    // Un id répété ne compte qu'une fois côté base : sans dédoublonnage, un
    // rattachement PARFAIT déclencherait une fausse alerte à chaque appel.
    expect(describeClaimShortfall(['a', 'a', 'a'], 1)).toBeNull();
  });

  it('ne_signale_rien_si_la_base_en_a_rattache_plus_que_demande', () => {
    expect(describeClaimShortfall(['a'], 2)).toBeNull();
  });

  it('ne_signale_rien_sur_une_demande_vide', () => {
    expect(describeClaimShortfall([], 0)).toBeNull();
  });
});
