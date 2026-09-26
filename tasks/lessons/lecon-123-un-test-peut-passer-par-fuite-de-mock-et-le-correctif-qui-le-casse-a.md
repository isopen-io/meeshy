## Leçon 123 — un test peut passer par FUITE de mock, et le correctif qui le casse a raison (2026-08-12, routine messaging, cycle 88)

**Contexte.** Après avoir gardé le `reconnect()` de montage sur les diagnostics de connexion, deux
tests jusque-là verts sont tombés : « should attempt reconnection on mount if token available » et
son jumeau anonyme. Ni l'un ni l'autre ne posait de diagnostics — ils héritaient d'un
`mockGetConnectionDiagnostics.mockReturnValue({ isConnected: true })` posé par un test « Initial
State » **soixante lignes plus haut**.

**La leçon.** `jest.clearAllMocks()` remet à zéro les APPELS, pas les IMPLÉMENTATIONS (`mockReturnValue`
survit ; il faut `resetAllMocks` / `mockReset`). Un `beforeEach` qui n'appelle que `clearAllMocks`
laisse donc chaque test hériter des stubs de ses prédécesseurs — dans l'ORDRE de déclaration, ce qui
rend la fuite invisible tant qu'on lance le fichier entier.

**Le réflexe à avoir.** Quand un correctif fait tomber un test qui ne le concerne pas
frontalement, se demander d'abord *pourquoi ce test passait avant*. Ici la réponse était : parce que
le code de production **ignorait** la valeur que le test ne posait pas. Le test n'affirmait donc rien
sur la précondition qu'il prétendait couvrir. Le corriger = rendre la précondition EXPLICITE, pas
neutraliser le correctif.

**Signature à reconnaître.** Un test qui devient sensible à un mock qu'il ne configure pas est un
test dont la précondition était implicite. C'est vrai à chaque fois qu'on rend un code de production
*plus* attentif à son état : les tests qui passaient par indifférence deviennent des tests qui
passent par hasard.

---
