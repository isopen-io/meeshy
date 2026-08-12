"""Métadonnées de build exposées par /health.

Miroir Python de `packages/shared/utils/build-info.ts` : mêmes noms de champs,
même refus de fabriquer un repli. Les deux doivent évoluer ensemble, sinon les
`/health` des trois services cessent de se comparer sans traduction.

Contexte : aucun service ne disait quel code il exécutait. Savoir si un correctif
était en production supposait un `docker inspect` sur l'hôte, ou une corrélation
entre l'uptime du container et l'horodatage des tags `sha-<short>` du registre.
"""

from src.utils.build_info import resolve_build_info


def test_expose_le_commit_grave_dans_l_image():
    assert resolve_build_info({"GIT_COMMIT": "fc11ab82a1b2c3d4e5f6"})["commit"] == "fc11ab82a1b2c3d4e5f6"


def test_expose_une_forme_courte_alignee_sur_les_tags_du_registre():
    assert resolve_build_info({"GIT_COMMIT": "fc11ab82a1b2c3d4e5f6"})["commitShort"] == "fc11ab8"


def test_rend_none_plutot_qu_une_valeur_fabriquee_quand_le_commit_est_absent():
    """Un repli plausible ('unknown', 'dev') rendrait une lecture morte
    indiscernable d'une lecture réussie — le défaut même qu'on corrige."""
    info = resolve_build_info({})
    assert info["commit"] is None
    assert info["commitShort"] is None


def test_traite_une_variable_vide_ou_blanche_comme_absente():
    assert resolve_build_info({"GIT_COMMIT": ""})["commit"] is None
    assert resolve_build_info({"GIT_COMMIT": "   "})["commit"] is None


def test_expose_la_date_de_build_quand_elle_est_gravee():
    assert resolve_build_info({"BUILD_DATE": "2026-08-06T02:47:00Z"})["builtAt"] == "2026-08-06T02:47:00Z"


def test_rend_none_quand_la_date_de_build_est_absente():
    assert resolve_build_info({})["builtAt"] is None


def test_accepte_un_sha_deja_court_sans_le_mutiler():
    info = resolve_build_info({"GIT_COMMIT": "fc11ab8"})
    assert info["commit"] == "fc11ab8"
    assert info["commitShort"] == "fc11ab8"


def test_lit_os_environ_par_defaut(monkeypatch):
    monkeypatch.setenv("GIT_COMMIT", "abcdef1234567890")
    assert resolve_build_info()["commit"] == "abcdef1234567890"


def test_les_cles_sont_celles_du_contrat_partage():
    """Les noms viennent du helper TypeScript : les changer ici seul ferait
    diverger le /health du translator de celui du gateway et du web."""
    assert set(resolve_build_info({}).keys()) == {"commit", "commitShort", "builtAt"}
