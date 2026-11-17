# Ajouter un appareil en confirmant un code, et propager la confiance entre mes appareils — spécification

**Date** : 2026-11-17 · **Version** : v3 · **Statut** : **comparaison VALIDÉE, registre (§ 6) EN REVUE.** La COMPARAISON (§ 3 et 4, la capacité, le relais, l'annonce et les clés servies des § 5.1 à 5.3 et 5.5, les états du § 7 qui ne viennent pas du registre, les vecteurs de comparaison du § 8) a été jugée tenue par la revue de confirmation et ne change pas d'un octet depuis la v2 : elle est versée avec ses vecteurs (lot 0a, #19153) et ses lots démarrent (2-0, 1a, 2a : #19155, #19154, #19156). Le REGISTRE DE CONFIANCE (§ 6, et ce qui en dépend : le canal du § 5.4, les cas du registre au § 8, les lots 0b, 1b et 2b) a été jugé BLOQUANT en v2 puis refondu en v3 sur des **entrées signées par leur auteur** (Arb. 7 à 9, onze corrections obligatoires portées) ; **le § 6 v3 n'est pas relu** : sa contre-relecture par `auditeur-adversarial` conditionne ses lots, aucune ligne de production n'en dépend encore, et son fichier de vecteurs (`trust-ledger-v1.cases.json`) n'est pas versé. « Validée » veut dire « tenue par les revues adversariales internes », jamais « prouvée » : la revue externe et le modèle formel restent requis (§ 11, #3710) · **Rédaction** : agent `crypto-e2ee`
**Décision porteur 2026-11-17 (#18906)**, qui fixe le modèle : « Code à confirmer » — le nouvel appareil se présente SEUL à mes autres appareils (aucun scan, aucune saisie au chemin nominal) ; un code court se confirme sur les deux écrans, d'un geste par écran ; UNE SEULE approbation suffit : mes autres appareils déjà approuvés font confiance au nouveau d'eux-mêmes, et le nouveau fait confiance à tous mes appareils approuvés. Le protocole reste sûr même si le serveur est compromis (substitution de clé, appareil fantôme) et face à un voleur de mot de passe. Le QR actuel (iOS) reste le dernier recours.
**Milestone** : #209 « Une conversation chiffrée se lit sur tous mes appareils, navigateur et téléphone ».
**Cadre** : #9224 (E2EE optionnel par conversation), #9229 (fail-closed), #9223 et #9231 (rétrocompatibilité, staging d'abord), spec `docs/superpowers/specs/2026-10-23-e2ee-libsignal-ios-macos.md` § 3.1 (une identité libsignal par appareil), § 3.4 (Sesame), § 3.5 (approbation de mes appareils).
**Ce que ce document remplace ou complète** : #13005 (remplacée par le § 4), #13004 (intégrée au § 6), #13043 (complétée au § 4.9 et au § 7.6 ; le chemin QR la garde), #13031 (résolue par le § 5.5), #13034 (le bandeau mène à la confirmation, § 7.5), #13016 (redéfinie : le QR Android devient un dernier recours, § 7.4). Issue parapluie : #18906.
**Audits du 2026-11-17 pris en compte** (comptes rendus d'audit de la passerelle, du web, d'Android et d'iOS, joints à #18906) : GW-04 et WEB-18 et IOS-02 (une session volée enrôle un appareil que mes contacts chiffrent, sans annonce), GW-09 (réveil iOS seulement), GW-13 et AND-21 (la fin de session efface les enveloppes d'une installation qui revient), GW-14 et IOS-19 (lire une clé de mes appareils réserve des pré-clés uniques), WEB-05 (le pont WASM n'a ni accord X25519, ni HKDF, ni signature d'un message arbitraire), AND-03 (Android n'émet ni n'applique aucun signal), GW-02 et AND-08 et IOS-09 (aucune rotation de pré-clé), IOS-17 (un serveur hostile efface une approbation en omettant l'appareil de la liste), et la recommandation de l'audit web contre l'approbation distraite (§ 4.9).
**Contre-revue du 2026-11-17** (compte rendu de l'agent `auditeur-adversarial`, joint à #18906, verdict BLOQUANT : 30 amendements obligatoires, 6 recommandés) : tous portés ci-dessous ; cinq points tranchés autrement que le texte de la revue, chacun avec sa raison (« Arbitrages », Arb. 1 à 6).
**Revue de confirmation du 2026-11-17** (second compte rendu de l'agent `auditeur-adversarial`, joint à #18906, verdict : BLOQUANT pour le registre, constats R-1 à R-5, corrections obligatoires 1 à 11) : toutes portées en v3 (« Journal », partie v3) ; les corrections 1 et 3 le sont par la SIGNATURE des entrées plutôt que par des règles d'émetteur (Arb. 7), parce que la variante sans signature de la revue laisse elle-même passer trois de ses cas ; un défaut de plus, trouvé en écrivant la v3 (R-6 : la confiance ne remontait pas vers le premier appareil), est corrigé par le parrainage signé (Arb. 8).

Ce document ne déclare aucune garantie acquise. La construction du § 4 est une **instanciation propre à Meeshy** de structures publiées (§ 1) à partir de primitives standard ; le registre de confiance du § 6 (entrées signées XEdDSA par la primitive de libsignal, parrainage, rang d'admission) et le canal de synchronisation du § 5.4 sont des **compositions propres à Meeshy**. Aucun des trois n'a reçu de revue externe. Une revue cryptographique tierce est requise avant la production (#3710), et une vérification formelle du protocole de comparaison, de la correspondance des codes et de la sémantique du registre (Tamarin ou ProVerif, propriétés P1 à P10 du § 11) est requise avant de présenter l'ajout d'appareil comme sûr face à un serveur compromis ; elle n'est pas faite ici. Les vecteurs, deux évaluateurs indépendants et une simulation aléatoire (§ 8) ne sont pas une preuve.

---

## Journal des amendements

### v2 (contre-revue)

Numérotation de la contre-revue (synthèse, « Amendements OBLIGATOIRES » 1 à 30, puis « RECOMMANDÉS » R1 à R6). « Arb. » renvoie aux arbitrages ci-dessous. Les lignes 10 et 11 sont remplacées en v3 (signatures, ci-dessous).

| N° | Constat | § modifiés | Résumé |
|---|---|---|---|
| 1 | B.1 | § 4.6, § 3.5 | Un code ne change jamais sans geste : un envoi automatique par enrôlement, états terminaux, aucune transaction ouverte remplacée, `accept` une fois par ouverture, au plus 5 codes par heure et 10 par 24 h |
| 2 | C.1, C.2 | § 4.9, § 3.5, § 9, § 11 | Options tirées une fois et conservées ; aucun symbole ni aucun nombre seul ne départage ; bornes chiffrées — porté sous la forme du **carré à quatre options** (Arb. 1) |
| 3 | C.3 | § 4.3, § 4.9 | Une bascule `method` ne redessine pas un écran qui montre un code ; un toucher dans les 1,5 s qui suivent un changement de rendu est ignoré ; en mode renforcé, l'écran le dit lui-même |
| 4 | C.4 | § 4.9 | Mode renforcé : saisie des TROIS nombres, comparés tous les trois (2⁻³⁹) |
| 5 | C.5 | § 7.3, § 9 | Focus dans l'ordre visuel ; aucun identifiant ne distingue l'option juste ; options annoncées ensemble ; lecteur d'écran actif ⇒ chiffres et saisie ; passages VoiceOver et TalkBack |
| 6 | C.6 | § 4.6, § 7.2 | Seuls les échecs décidés par l'utilisateur comptent ; `commitment-mismatch` et `key-mismatch` alertent sans compter ; le plafond d'invites ne bloque jamais un geste ; « Trop d'invites » liste [Confirmer] [Retirer] |
| 7 | C.7 | § 4.8, § 4.6, § 7.2, § 6.8, § 2, § 11 | Un appareil en attente n'initie que ; second `accept` ⇒ annulation et alerte ; `accepted-elsewhere` ⇒ alerte ; code affiché sous le numéro du pair ; § 2 et § 11 corrigés — et le cas est **fermé** par l'accusé (Arb. 3) et la sémantique du registre (Arb. 2) |
| 8 | E.1 | § 4.8, § 5.2 | Messages d'un tiers à la transaction ignorés ; `ack` et balayage bornés à la génération de l'appelant ; copies en attente remplacées par `cancel(accepted-elsewhere)` qui nomme la génération qui a répondu |
| 9 | D.1 | § 6.1, § 6.2 | Une approbation est désignée par la génération ET son auteur ; l'inscription de soi est une déclaration |
| 10 | D.2 | § 6.2, § 6.5 | Ce qu'un appareil reprend d'un pair qu'il confirme ; le reste reste PROPOSÉ — rendu vrai sur TOUS mes appareils par le rang d'admission, le parrainage et la règle « on ne croit un appareil que pour lui-même » (Arb. 2) |
| 11 | D.3 | § 6.2, § 6.6, § 11 | Pierre tombale par CLÉ ; état effectif calculé depuis soi ; `reattested` ; `sig` réservé ; l'approbation « à mon nom » non faite alerte, sans pierre tombale automatique (Arb. 4) |
| 12 | D.4 | § 6.6, § 11 | L'appareil qui n'a pas appliqué un retrait en 24 h est nommé, avec « Retirer X depuis cet appareil » |
| 13 | D.5 | § 6.2 | Une pierre tombale ne se compacte jamais ; un registre hors bornes applique ses pierres tombales et ignore ses approbations en excès |
| 14 | D.6 | § 6.2, § 6.3, § 8 | Ordre total de départage et bornes numériques écrits ; cinq cas communs ajoutés |
| 15 | D.7 | § 6.3, § 6.5 | Mémoire du régime : `{ conversationId, since }`, envois en parties, « confirmé » seulement une fois complète ; issue `décision-produit` |
| 16 | D.8-1 | § 6.7 | La clé présentée est celle de la génération LISTÉE et celle que l'annuaire sert ; plus de « toute génération confondue » |
| 17 | D.8-2 | § 5.4 | Émetteur = génération de la session ; destinataires capables ; `type` ∈ {2, 3} ; `senderRegistrationId` |
| 18 | D.8-3 | § 6.3 | Un clair porte exactement une des clés `v`, `s`, `d` ; un contenu sur le mauvais canal n'est jamais un verdict |
| 19 | D.8-4 | § 6.3 | Champs inconnus ignorés ; version future de `d` ⇒ « Mettez à jour » ; `accountKey` et `sig` réservés |
| 20 | D.9 | § 6.8, § 7.5, § 5.3 | Fermer la session d'un appareil chiffré demande « perdu ou volé ? » ; le retour d'une installation déconnectée s'annonce |
| 21 | E.2 | § 5.2, § 5.3 | Débits par génération ET par compte ; 8 envois par `tx` et par émetteur ; annonces et pushes d'enrôlement regroupés |
| 22 | E.3 | § 5.3, § 9 | Chaque appareil rapproche l'annuaire de ce qu'il connaît au démarrage et à chaque reconnexion |
| 23 | E.4 | § 7.6 | Le libellé n'apparaît dans aucune notification, distante ou locale, ni dans un identifiant de regroupement |
| 24 | E.5 | § 5.7, § 6.2 | « Déconnectés, encore approuvés » listés et retirables ; bornes ; une place reprise ne fait jamais revaloir l'ancienne |
| 25 | B.3 | § 4.1, § 8 | `userId` en minuscules sur le fil, sinon refus ; l'ex-vecteur 5 devient un négatif |
| 26 | B.4 | § 4.1, § 5.2 | Libellé bien formé, NFC, ≤ 64 unités UTF-16, vide = omis ; contrôles au relais seulement ; libellé du fil = libellé de l'annuaire |
| 27 | B.5 | § 4.3, § 4.6, § 4.8, § 7.1 | `relayedFrom` ; `prompted` expire ; « Calcul du code… » ; plateforme inconnue ⇒ réenrôlement |
| 28 | B.2 | § 4.4 | Le temps constant n'est plus exigé là où il ne protège rien ; les vrais secrets sont nommés |
| 29 | A.3 | § 8 | N2 renommé, N2-bis, un négatif par champ, inversion des rôles, refus de forme |
| 30 | F.3 | § 4.5, § 8, § 10 | Avis Apache-2.0 complet, fichier marqué modifié, licences tierces dans chaque application, AGPL #11548 |
| R1 | F.1 | § 3.3, § 8 | Chaque banc rejoue RFC 5869 A.1 et A.3 |
| R2 | F.2 | § 3.3 | Tableau des pièges par plateforme, chacun tenu par un vecteur |
| R3 | D.7 | § 6.3, § 6.6 | Provenance par entrée de la mémoire du régime (`learnedBy`) |
| R4 | § 10 | § 10 | Issue de la liste attestée ouverte dès maintenant |
| R5 | § 11 | § 11 | Propriétés P1 à P5 écrites pour le modèle formel (P6, P7 ajoutées par les arbitrages) |
| R6 | B.5 | § 3.5 | Hypothèse de la borne écrite (oracle aléatoire, sept symboles comparés) |

### v3 (revue de confirmation)

Numérotation de la revue de confirmation : « Corrections OBLIGATOIRES » 1 à 11 (C1 à C11), puis les recommandées (Ra à Rg) ; V1 à V6 : ce que la v3 a trouvé en s'écrivant.

| N° | Constat | § modifiés | Résumé |
|---|---|---|---|
| C1 | R-1 | § 6.1, § 6.2, § 6.8, § 7.2 | **Chaque entrée est signée par son auteur** (XEdDSA de libsignal, encodage binaire à longueurs préfixées, trois étiquettes `meeshy-device-trust:v1\|…`, le compte dans les octets signés) et vaut par sa signature, quel que soit celui qui la relaie ; une signature fausse fait refuser le contenu entier et nomme l'appareil qui l'a transmis ; mes propres entrées ne viennent que de mon magasin (« clé copiée » sinon). Remplace la règle « écrite ici » sans signature (Arb. 7) |
| C2 | R-2, R-5 | § 6.1, § 6.2 | F(x) ne prend que les approbations qui COMPTENT, dans le même plus petit point fixe ; F_adm (pierres tombales) et F (effectifs, proposées) nommés ; `fromSeq` obligatoire pour `sas`, `qr`, `reattested` ; une approbation s'écrit une fois par auteur et par sujet (aucune « reconfirmation » n'écrit) ; texte et générateur identiques, montré par un évaluateur indépendant (§ 8) |
| C3 | R-3, R-4 | § 6.1, § 6.2, § 6.4 | Plus de « registre transmis » à définir, plus de relais privilégié, plus de provenance : une entrée relayée vaut par sa signature ; **une approbation n'est signée qu'à l'ouverture du `ledger(verified)` du pair**, donc après les deux confirmations : rien de non fixé n'existe (Arb. 7) |
| C4 | « retenu », parrain déclaré | § 6.1, § 6.3, § 6.5 | « Propagation retenue » supprimée (N est à moi, l'admettre ne fait entrer P nulle part) ; `verification.sponsor` supprimé, l'alerte se lit dans l'approbation de parrainage signée de N ; `verification.head` fixe `fromSeq` ; le parrain n'est plus un état local mais une approbation `sponsor` signée (Arb. 8) |
| C5 | amendement 6 dévié | § 4.6 | Le `cancel(user-mismatch)` reçu de l'autre écran ne compte plus : il retire l'épingle posée par la transaction et alerte |
| C6 | amendement 21 | § 5.2 | Plus aucune borne par compte ; par génération seulement (16 appareils : 64 `request` et 480 messages par heure au pire) |
| C7 | amendement 7(e), § 11 | § 2, § 6.5, § 6.8, § 11, décision passerelle (point 3) | Borne réécrite : **le voleur ne gagne, une fois sur quatre au plus, que l'appareil qu'il a capturé, et seulement jusqu'au retrait de son appareil** ; déni du détenteur du mot de passe nommé (course, `DELETE /e2ee/devices/:deviceId` ouvert à toute session, `routes/e2ee.ts:158`, enrôlements répétés) et sa conduite (changer le mot de passe dès la deuxième course) |
| C8 | Arb. 1, réserve 3 | § 4.9, `primitives.options` | Ordre de lecture des octets (positions du bit 1, puis du bit 2, rejet octet par octet, puis l'octet de permutation) et `écran[i] = options[perm[i]]` |
| C9 | Arb. 1, réserve 1 | § 3.5 | « contre l'utilisateur qui ne vérifie que ce qui départage les options ; 1/4 contre celui qui touche sans regarder » |
| C10 | Arb. 6 | Arb. 6, § 6.2, § 6.3 | La borne écrite comme le générateur l'applique : au plus 32 approbations par contenu (toutes méthodes, inscriptions comprises), les plus petites selon l'ordre total gardées AVANT toute vérification ; toutes les pierres tombales appliquées ; un registre plus grand se découpe (la signature pèse 64 octets : 64 entrées signées tiennent sous le plafond de remplissage à quinze destinataires) |
| C11 | D.6 | § 6.2 | Pierres tombales départagées par `seq`, puis la génération retirée (`deviceId`, `registrationId`, clé), puis `sig` (vecteur de l'ordre total) |
| Ra | course | § 4.3, § 4.6, § 7.2 | [Réessayer] après « Deux réponses » ou « Acceptée ailleurs » adresse la demande à l'appareil que l'utilisateur désigne ; le nouvel appareil affiche son numéro |
| Rb | QR | § 7.4, § 10 | QR Android DANS le lot 5 ; QR affiché par le navigateur et lu par le téléphone (lot 6, issue) ; rôles du QR (qui rejoint, qui admet) |
| Rc | racine | § 6.1, § 7.2 | Une racine seule qui découvre une génération active plus ancienne repasse en attente et alerte ; les entrées proposées s'affichent « à confirmer », sans retrait à un geste |
| Rd | Arb. 1, réserve 2 | Arb. 1, § 3.5 | « ⌈log₂ n⌉ » réécrit : le plafond vaut parmi les dispositions où l'écran seul ne désigne rien (P7) ; ligne « un symbole puis au hasard : 2⁻⁷ » |
| Re | CI | § 8, § 10 | Table amont de matrix-spec versée (licence et avis) ; le script tourne sans réseau et `--check` compare à l'octet |
| Rf | § 11 | § 11 | P8 et P9 écrites ; P10 ajoutée (le filleul adopte la vue de son parrain) |
| Rg | lot 1 | § 9, § 10 | Simulation multi-appareils tirée au hasard dans la référence (lot 1b) ; une première sonde de 400 scénarios faite ici (P5, P8, P10) |
| V1 | R-6 (trouvé ici) | § 6.1, § 6.2, § 6.5 | En v2, un appareil confirmé par un autre que le premier ne faisait pas confiance au premier (cas `le-filleul-d-un-filleul-fait-confiance-a-la-racine`) : l'initiateur signe une approbation de PARRAINAGE, les ancres se suivent de proche en proche (Arb. 8) |
| V2 | taille | § 6.3 | Mémoire du régime : 200 entrées par partie (les 1 000 de la v2 dépassaient l'enveloppe de 64 Kio) ; ses entrées ne sont pas signées, une forge n'y produit qu'un déni |
| V3 | relais libre | § 6.6, § 11 | Pierre tombale d'une clé retirée puis volée : risque évalué, accepté, écrit et épinglé par un cas (Arb. 9) |
| V4 | QR | § 7.4 | Les approbations `qr` portent `fromSeq` (la v2 les comptait pour 0 : elles ouvraient tout l'historique antérieur du pair) |
| V5 | lots | § 10 | Lots 0 et 1 coupés : comparaison (0a, 1a, démarrent) et registre (0b, 1b, après contre-relecture du § 6 v3) |
| V6 | fenêtres | § 4.6, § 5.2 | Tous les plafonds en fenêtres glissantes ; les « générations inconnues » des invites définies |

## Arbitrages

**Arb. 1 — L'amendement 2, pris à la lettre, fait désigner le code juste par l'écran seul ; la correspondance passe à QUATRE options en carré.**
L'amendement 2 veut que chaque leurre coïncide avec le code juste partout sauf en deux symboles, aux positions disjointes. Alors, à chaque position, au plus une option s'écarte des deux autres, et ce n'est jamais le code juste : **le code juste est la médiane, symbole par symbole, des trois options**. Mesuré (simulation de l'amendement, 200 000 tirages ; versée avec le lot 1a : `packages/shared/scripts/measure-device-verification-options.mjs`) : l'heuristique « l'option la plus semblable aux autres », appliquée SANS regarder l'autre écran, trouve le code juste dans **100 %** des cas. Un hameçonneur la dicte en une phrase, et un utilisateur pressé la découvre seul : la parade contre l'approbation distraite disparaît, et face à un serveur actif l'homme du milieu réussit à coup sûr contre qui l'applique.
Ce n'est pas un défaut de réglage : **avec trois options, aucune règle n'obtient à la fois (i) qu'aucune option ne se distingue de l'écran seul et (ii) qu'il faille vérifier deux positions pour isoler le code juste.** Si le code juste ne doit être isolé par aucune position seule, il n'est jamais l'option singulière d'une position ; s'il n'y a aucune position à trois symboles distincts, il est donc l'option majoritaire partout, c'est-à-dire la médiane. La symétrie (chaque option singulière en deux positions) rend l'écran muet mais fait retomber à 4,6 × 10⁻³ l'utilisateur qui lit de gauche à droite (mesuré).
Alternatives chiffrées, sous homme du milieu (code de l'autre écran indépendant), 200 000 tirages chacune :

| Variante | Gestes au chemin nominal | Toucher au hasard | Écran seul (« la plus typique ») | « Juste assez » (positions qui départagent), emoji | idem, chiffres | Gauche-droite | Sept symboles comparés |
|---|---|---|---|---|---|---|---|
| Bouton « Identiques » + sept symboles, saisie en mode renforcé | 1 | 1 | 1 | rien n'oblige à lire : 1 à 2⁻⁶ᵏ pour k symboles lus | idem | idem | 2⁻⁴² |
| Trois codes, règle de la v1 (premier symbole distinct) | 1 | 1/3 | 1/3 | 1,6 × 10⁻² (2⁻⁶) | 1,3 × 10⁻⁴ | 1,6 × 10⁻² | 2⁻⁴² |
| Trois codes, amendement 2 littéral | 1 | 1/3 | **1** | 2,3 × 10⁻⁴ (2⁻¹²) | 7,5 × 10⁻⁵ | 3,5 × 10⁻⁵ | 2⁻⁴² |
| Trois codes symétriques | 1 | 1/3 | 1/3 | 2,0 × 10⁻⁴ | 1,1 × 10⁻⁴ | **4,6 × 10⁻³** | 2⁻⁴² |
| **Quatre codes en carré (retenu)** | 1 | **1/4** | **1/4** | **2,45 × 10⁻⁴ (2⁻¹²)** | **0 sur 200 000 (2⁻²⁶ analytique)** | **0 sur 200 000 (2⁻²⁴ analytique)** | 2⁻⁴² |
| Huit codes en cube | 1 | 1/8 | 1/8 | 1,0 × 10⁻⁵ (2⁻¹⁸) | 0 sur 200 000 | 0 sur 200 000 | 2⁻⁴² |
| Saisie des trois nombres, toujours | 13 | 2⁻³⁹ | 2⁻³⁹ | 2⁻³⁹ | 2⁻³⁹ | 2⁻³⁹ | 2⁻³⁹ |

Retenu : **quatre options en carré** (§ 4.9) — deux « bits » de deux symboles chacun, chaque option partageant chaque symbole avec exactement une autre : l'écran ne désigne rien, aucun symbole ni aucun nombre seul n'isole une option, et la borne ≈ 2⁻¹² devient celle de tous les comportements mesurés qui lisent ce qui départage ; l'utilisateur qui lit UN symbole puis touche au hasard l'une des deux options restantes reste à ≈ 2⁻⁷ (mesuré 8,1 × 10⁻³ par la revue de confirmation, ligne ajoutée au § 3.5). Le cube (2⁻¹⁸) montrerait huit rangées de sept symboles : écarté pour la lisibilité et l'erreur honnête, à réexaminer si l'essai d'utilisabilité (§ 9, 2 bis) le permet. La saisie systématique contredit « un geste par écran ».
**Parmi les dispositions où l'écran seul ne désigne rien (P7), ≈ 2⁻¹² est le plafond de toute correspondance à moins de huit options** face à un utilisateur qui ne vérifie que ce qui départage les options. Ces dispositions sont symétriques, engendrées par un groupe ; parmi les groupes d'ordre au plus huit, seul Z₂³ a trois sous-groupes deux à deux d'intersection non triviale et d'intersection commune triviale — d'où le cube de huit options, seul à forcer trois positions (2⁻¹⁸) ; avec quatre options, deux positions départagent. (Sans P7, l'énoncé « départager n options demande au mieux ⌈log₂ n⌉ positions » de la v2 est faux : trois leurres qui diffèrent du code juste en positions disjointes forcent trois positions avec quatre options — mais l'écran désigne alors le code juste, qui n'y est jamais singulier. Correction de la revue de confirmation.) Seule la comparaison des sept symboles atteint 2⁻⁴². D'où la règle qui ferme C.1 combinée à B.1 : **à partir du premier code affiché sans succès (leurre touché, « Aucun ne correspond », abandon ou expiration), et pendant 24 h, l'appareil fait SAISIR les trois nombres** (§ 4.9) — l'amendement 4 le prévoyait après un leurre touché seulement, ce qui laissait à un serveur actif jusqu'à dix tentatives « juste assez » par jour (plafond de l'amendement 1). Le serveur obtient donc au plus UNE tentative à ≈ 2⁻¹² par appareil approuvé et par 24 h, les suivantes à 2⁻³⁹.

**Arb. 2 — (v2, REMPLACÉ en v3 par les Arb. 7 et 8 ; gardé pour l'histoire) Le texte de D.2, appliqué au seul appareil qui confirme, ne ferme pas C.7 + D.2 : il fuit par les fusions ordinaires et par les attributions forgées.** La revue de confirmation a montré que ses trois règles fuyaient à leur tour (R-1 à R-5) ; la v3 garde le rang d'admission (corrigé, C2), remplace « on ne croit un appareil que pour lui-même » par la signature des entrées (Arb. 7), et remplace le parrainage local par une approbation de parrainage signée (Arb. 8).
L'amendement 10 dit ce que reprend « l'appareil qui confirme un pair ». Mais B et C ne confirment pas N : ils fusionnent son registre par les règles ordinaires (R1, R4) dès que N leur est effectif, et l'approbation du fantôme par N, qui n'est « proposée » que chez A, devient effective chez eux (son auteur N est effectif, D.3-2). Et un registre relayé porte des entrées dont l'auteur n'est pas signé : un N empoisonné par son pair relaie des approbations « faites par A » que B croit. Trois règles, écrites au § 6.2 et tenues par des cas communs, rendent la propriété vraie sur tous mes appareils, quel que soit l'ordre des messages :
1. **On ne croit un appareil que pour lui-même** : d'un registre reçu, on ne retient que les entrées dont l'émetteur authentifié est l'AUTEUR — sauf de son PARRAIN.
2. **Le parrainage** : quand un appareil EN ATTENTE confirme un pair, il n'écrit aucune approbation ; il prend ce pair pour parrain (localement) et reprend tout son registre. C'est la dernière phrase de l'amendement 10.
3. **Le rang d'admission** : un membre qui confirme un pair note dans son approbation le rang (`fromSeq`) à partir duquel les entrées du pair comptent ; partout, celles d'avant restent PROPOSÉES, sauf son inscription. C'est le reste de l'amendement 10, rendu calculable par tous.
Un fantôme confirmé par un nouvel appareil distrait n'entre ainsi dans aucun registre que mes autres appareils croient (cas `entree-anterieure-a-l-admission-reste-proposee`, `entree-relayee-par-un-non-parrain-ignoree`, `pierre-tombale-d-un-auteur-jamais-admis-ignoree`). Coût : un appareil qui n'a jamais reçu les entrées d'un auteur disparu ne les apprend que de son parrain ; si celui-ci est retiré, il repasse « en attente » (cas `parrain-revoque-ses-relais-tombent`).

**Arb. 3 — Côté nouvel appareil, « Identiques » devient le toucher d'un ACCUSÉ.**
La revue borne le cas C.7 au nouvel appareil (« sauf sur un nouvel appareil dont l'utilisateur touche « Identiques » quand l'appareil du voleur a répondu le premier »). La décision du porteur demande la sûreté face au voleur de mot de passe ; un bouton unique sur N y laisse un succès proche de 1 pour l'utilisateur pressé, qui installe justement N et attend un code. Retenu : après le BON toucher sur l'appareil qui répond, celui-ci affiche un accusé de deux symboles (octets 6 et 7 de la sortie HKDF) ; le nouvel appareil le fait toucher parmi quatre (même carré). Le geste sur N exige alors l'écran de l'appareil que j'ai en main : dans la course du voleur, mon appareil n'affiche aucun accusé (il a reçu `accepted-elsewhere` et alerte) et un toucher au hasard réussit une fois sur quatre au plus, puis fait saisir. Le code court reste le même sur les deux écrans (montré par N, trouvé sur A) ; l'accusé en est la réponse. Un geste par écran au chemin nominal, inchangé. Les six premiers octets ne changent pas : les codes de la v1 de la spec restent vrais (L = 8 n'en modifie pas le préfixe).

**Arb. 4 — Aucune pierre tombale automatique sur la foi d'une entrée forgée.** En v2, une approbation « à mon nom » relayée par un parrain était écartée en prose seulement (R-1). En v3, une entrée forgée ne se vérifie pas sous la clé de l'auteur qu'elle nomme : le contenu qui la porte est refusé en entier, et l'appareil qui l'a transmis est nommé avec [Retirer « S »] (§ 6.2). La pierre tombale reste un geste : la forge d'un appareil malveillant ne doit jamais devenir le retrait de mes vrais appareils.

**Arb. 5 — Amendement 7 (a) contre « l'appareil en main initie » (§ 4.2, § 5.3).** Un appareil en attente ne répondant plus, un membre ne lance jamais de demande vers lui : « C'est moi » et « Confirmer » le guident vers le nouvel appareil (« Sur « iPad », touchez « Confirmer cet appareil » »), qui initie. Exception : le premier appareil d'un compte (racine, § 6.1), qui doit pouvoir répondre au deuxième. La racine est la parole du serveur (l'annuaire vide à l'enrôlement) : **une racine seule qui découvre au rapprochement une génération active plus ancienne repasse en attente** (revue de confirmation) ; une racine qui a déjà confirmé d'autres appareils garde ses approbations, qui restent « à confirmer » chez les autres (C2).

**Arb. 6 — Bornes, écrites comme le générateur les applique.** Un contenu porte au plus 32 approbations (toutes méthodes, inscriptions comprises) et 32 pierres tombales ; à la réception, au-delà de 32 approbations, les plus petites selon l'ordre total sont gardées AVANT toute vérification de signature, les autres ignorées et signalées ; toutes les pierres tombales sont vérifiées et appliquées. La v2 disait « 64 approbations des générations listées », une donnée (l'annuaire) que la réception n'a pas, et que le générateur n'appliquait pas (C10). La borne passe de 64 à 32 parce qu'une entrée signée pèse environ 350 octets et que le plafond d'un clair rempli est de 32 904 octets pour quinze destinataires ; un registre plus grand se découpe en plusieurs contenus, ce que la signature rend sans risque (chaque entrée est autonome).

**Arb. 7 — Les entrées du registre sont SIGNÉES par leur auteur (XEdDSA, clé d'identité libsignal).**
*Pourquoi.* R-1 à R-5 ont une cause commune : le registre relayait des entrées dont seul l'ÉMETTEUR du canal était authentifié, pas l'AUTEUR. La v2 compensait par des règles de provenance (on ne croit un appareil que pour lui-même, sauf son parrain), de parrain et de `fromSeq` ; chacune a fui. Les corrections 1 et 3 de la revue les durcissaient encore, mais ce sont des règles d'ÉMETTEUR (ce que l'émetteur transmet) qu'un récepteur ne peut pas vérifier : rejoués dans l'évaluateur de la revue elle-même, avec ses corrections sans signature, trois de ses propres cas passent toujours (R-1 vue d'un membre, R-1 pierre tombale, R-3 ; § 8, tableau avant/après). La signature fait de chaque entrée une affirmation vérifiable par quiconque, à la réception.
*Plus sûr.* Elle ferme la forge d'une entrée « à mon nom » (R-1), la transitivité du parrain (R-3 : plus de relais privilégié, une entrée relayée au second rang se vérifie comme au premier) et le relais d'entrées non fixées (R-4 : une approbation n'est signée qu'après les deux confirmations, il n'existe rien de non fixé). Les cas de la revue, rejoués signés, sont tous refusés ou proposés (§ 8).
*Plus simple.* Disparaissent : la provenance par entrée, la règle « auteur = émetteur sauf parrain », la définition du registre transmis, l'état « propagation retenue » (qui n'avait ni stockage ni levée), `verification.sponsor`, la règle « écrite ici ». La réception tient en cinq temps (§ 6.2) ; le registre se découpe librement.
*Ce que la signature ne fait pas.* Elle ne dit pas si l'auteur méritait confiance : la sémantique d'état (rang d'admission, ancres, pierres tombales) reste, et R-2 et R-5 se corrigent par elle (C2), non par la signature. **Un appareil approuvé compromis signe ce qu'il veut** : c'est inhérent à « une approbation suffit ». Et le relais libre a un prix, l'Arb. 9.
*Coût.* 64 octets par entrée (bornes divisées par deux, découpage) ; une vérification par entrée reçue ; un encodage de plus à tenir sur quatre plateformes, avec ses vecteurs ; XEdDSA étant aléatoire, des vecteurs à signatures FIXES et un générateur qui les reprend. *Disponibilité*, relevée le 2026-11-17 : iOS `PrivateKey.generateSignature` / `PublicKey.verifySignature` (`packages/LibSignalClient`) ; Android `ECPrivateKey.calculateSignature` (déjà en production pour la preuve de liaison) / `ECPublicKey.verifySignature` (libsignal 0.106.2) ; Node `PrivateKey.sign` / `PublicKey.verify` ; web : le pont WASM v2 (`signWithIdentity`, `verifyWithIdentity`, `lib.rs:436-448`) sur la branche `claude/nifty-hawking-osab15-web`, pas encore dans `dev` — **il y est, et il vérifie les signatures produites par Node, et inversement** (contre-vérification du § 8).
*Bénéfice de plus.* La liste d'appareils attestée que mes contacts vérifieraient (§ 11) n'a plus besoin d'une autre signature : celle-ci suffit.

**Arb. 8 — Le parrainage devient une approbation SIGNÉE, et les ancres se suivent de proche en proche (R-6).**
En v2, un appareil en attente qui confirmait un pair n'écrivait rien : le parrain était un état local. Conséquence, trouvée en écrivant la v3 et vérifiée sur le générateur v2 : quand C est confirmé par B, lui-même confirmé par le premier appareil A, C ne compte que B et lui-même — A, qui n'a été approuvé par personne (il est la racine), lui reste inconnu, et C ne lit pas ce que A lui envoie. Écrire « l'initiateur approuve le répondeur » ne suffit pas : avec `fromSeq` = 1 + la tête du parrain, le filleul d'un filleul perd l'historique légitime du parrain amont ; avec `fromSeq` = 1 (« tout l'historique »), l'approbation BLANCHIRAIT, chez tous les autres, ce que le parrain avait écrit avant son admission (la classe de R-2). Retenu : l'initiateur signe une approbation de parrainage (`sponsor: true`, `fromSeq` = 1 + la tête du parrain) ; chez lui et chez ceux qui l'ont rejoint, de proche en proche, le parrain est une ANCRE (F = 0 : on adopte toute sa vue) ; partout ailleurs, c'est une approbation ordinaire, qui n'ouvre rien d'antérieur. Le parrain n'est plus un état local : il se lit dans le registre. Effets : le nouveau fait confiance à tous mes appareils quel que soit celui qui l'a confirmé (P10, cas `le-filleul-d-un-filleul-fait-confiance-a-la-racine`) ; la sortie de la course n'exige plus de reconfirmation (le nouvel appareil a deux ancres ; retirer celle du voleur suffit, cas `sortie-de-course-par-le-retrait-de-P`) ; hors de la chaîne, rien n'est blanchi (cas `approbation-de-parrainage-hors-chaine-ne-blanchit-rien`). P6 se relit : ce qu'un appareil a écrit avant son admission ne compte nulle part hors de sa chaîne de parrainage.

**Arb. 9 — La pierre tombale d'une clé retirée garde sa valeur, y compris relayée ; une coupure par rang a été évaluée et écartée.**
Une pierre tombale compte si son auteur a été admis, même retiré depuis : c'est ce qui garde dehors l'appareil volé qu'un appareil avait retiré avant d'être retiré lui-même. En v2, un appareil retiré ne pouvait plus rien faire parvenir (ses enveloppes ne s'ouvrent plus, et seul l'auteur relayait ses entrées). Avec le relais libre d'entrées signées, une clé retirée PUIS volée qui signe de nouvelles pierres tombales les voit compter partout dès qu'un appareil en retard les ouvre et les relaie (cas `pierre-tombale-d-un-auteur-retire-compte-encore`). Évalué : couper chaque pierre tombale d'un auteur retiré au rang que son révocateur avait vu (`untilSeq`). Écarté : un attaquant qui détient la clé répond en signant une pierre tombale de son révocateur en feignant de ne pas l'avoir vue ; les deux coupures se visent l'une l'autre, et il faut trancher le cycle — en comptant les deux (fail-safe), on retrouve le même déni ; en n'en comptant aucune, l'appareil compromis SURVIT, ce qui est une fuite. Sans ordre de confiance entre appareils, il n'y a pas de bonne coupure. Retenu : la règle de la v2 (fail-safe), le risque écrit au § 11 avec ses conditions (la clé privée extraite ET un serveur complice, la session de l'appareil retiré étant fermée) et son effet (un déni, jamais une fuite) ; une autorité de révocation (`accountKey`) est une suite.

---
## 0. Constat de départ (`origin/dev` 00633b89)

| Ce qui existe | Où | Ce qui manque pour la décision du 2026-11-17 |
|---|---|---|
| Approbation par QR, **par paire et dans les deux sens** : A lit le QR de B, puis B lit celui de A. Empreinte `NumericFingerprintGenerator` v2, 5 200 itérations, identifiant `meeshy-own-device:v1:<userId>.<deviceId>` | `packages/MeeshySDK/Sources/MeeshyE2EE/E2EEOwnDeviceLinking.swift` | Une approbation par paire : avec trois appareils, six lectures de QR. Rien ne se propage |
| Les 60 chiffres s'affichent « pour information » : la moitié de l'approbateur est identique sur les deux écrans, et un attaquant peut aligner jusqu'à ~40 chiffres par force brute hors ligne | idem ; constat M4 de l'audit de #12976 | Aucune comparaison à l'œil sûre : #13005 |
| L'épingle (clé d'identité + `registrationId`) est appliquée par libsignal à l'ENVOI (`isTrustedIdentity`) et relue à la RÉCEPTION dans la transaction de déchiffrement ; l'enveloppe d'un de mes appareils non approuvé attend au serveur | `MeeshySignalProtocolStore.swift:56`, `E2EEEnvelopeOpener.swift:123` et `:135`, `E2EEMessageSealer.swift:160` | Rien. C'est la fondation sur laquelle tout ce document s'appuie |
| Les approbations sont rangées **par numéro d'appareil** (une seule clé par place) | `E2EELocalRecords.swift:173` | Une place qui change d'occupant ne peut pas porter deux générations |
| Une approbation d'un appareil que l'annuaire ne liste plus est **effacée** | `E2EEOwnDeviceLinking.swift:149` et `:195` (`forgetApprovals`) | Un effacement ne se représente pas dans un registre qui converge par union (§ 6.2) |
| « Approuvé » s'affiche sans comparer la clé épinglée à la clé servie quand aucune session n'existe | `E2EEOwnDeviceLinking.swift:208` | #13031 |
| Aucun message n'annonce une approbation ou une révocation à mes autres appareils ; un appareil révoqué n'en sait rien | — | #13004 |
| Le canal des signaux chiffrés exige une conversation `e2ee` et un membre | `services/gateway/src/services/e2ee/E2EESignalRelay.ts:100-101` | Aucun canal chiffré entre MES appareils hors conversation |
| `GET /e2ee/devices` sert mes appareils sans clé publique | `services/gateway/src/services/e2ee/E2EEDirectory.ts:384` | Lire la clé d'un de mes appareils réserve aujourd'hui une pré-clé unique |
| Le push de réveil e2ee ne part que vers iOS | `services/gateway/src/services/e2ee/e2ee-wake.ts:20` (GW-09) | Android, plus tard le web |
| La socket rejoint la room de SA génération d'appareil par le `sid` du JWT, sans `e2eeDeviceId` au handshake ; à l'enrôlement, les sockets déjà ouvertes de la session la rejoignent | `services/gateway/src/socketio/handlers/AuthHandler.ts:416`, `device-room.ts` (`joinSessionSocketsToDeviceRoom`) | Rien : le transport du § 5 s'appuie sur ces rooms tels quels |
| Une session volée enrôle un appareil sans que rien ne m'en prévienne ; mes contacts lui chiffrent aussitôt une copie (TOFU) | `routes/e2ee.ts:135-144`, `sesame.ts` (GW-04, WEB-18, IOS-02) | Une annonce qui ne dépende PAS de la coopération du nouvel appareil (§ 5.3) ; la protection côté contacts reste hors de ce lot (§ 11) |
| Android déchiffre et range les signaux sans les appliquer, et n'en émet aucun | `apps/android/core/e2ee/.../open/E2eeEnvelopeOpener.kt:55-61` (AND-03, #13202) | La propagation ne peut pas s'appuyer sur le canal des signaux (§ 5.4) |
| Aucune plateforme ne fait tourner la pré-clé signée ni la Kyber de dernier recours | GW-02, AND-08, IOS-09 | Rien ici ne s'appuie sur leur fraîcheur : la confiance porte sur la clé d'IDENTITÉ épinglée, et libsignal vérifie la signature du bundle quel que soit son âge |
| Android : magasin d'approbations, épingle appliquée par le store, report des enveloppes, exclusion au scellement — mais **aucun appelant de `approve`** | `apps/android/core/e2ee/src/main/kotlin/me/meeshy/core/e2ee/store/E2eeLocalRecords.kt:134`, `MeeshySignalProtocolStore.kt:51` | Tous mes autres appareils partent en `unapprovedOwnDevices` (#13016) |
| Web : pont WASM sans état ; magasin d'identités en mémoire (TOFU) ; `trustIdentity` permet de charger une épingle ; sur `dev`, **ni signature XEdDSA, ni accord de clés** exportés | `packages/libsignal-wasm/src/lib.rs:173`, `:211` (`dev`) | **Le pont v2 de la branche `claude/nifty-hawking-osab15-web` (commit `d7b4492078`, 2026-11-17) exporte `signWithIdentity` et `verifyWithIdentity` (`lib.rs:436-448`)** : la preuve de liaison de l'enrôlement, et les signatures du registre (§ 6.1). Contre-vérifié ici : il vérifie les signatures des vecteurs produites par libsignal Node, et Node vérifie les siennes. Il n'est pas encore dans `dev` ; la pile E2EE web reste à faire (#10788) |

---

## 1. Références publiées, et ce que chacune fixe ici

| Référence | Ce qu'on en prend |
|---|---|
| S. Vaudenay, *Secure Communications over Insecure Channels Based on Short Authenticated Strings*, CRYPTO 2005, LNCS 3621 — protocoles SAS-MA et **SAS-MCA** (authentification croisée de messages par chaîne courte) | La structure : l'initiateur s'**engage** sur son message et son aléa, le répondeur envoie son message et son aléa en clair, l'initiateur **révèle**, les deux dérivent la chaîne courte. Borne : un adversaire actif réussit avec une probabilité de l'ordre de 2^-k par tentative pour une chaîne de k bits. On n'en reprend pas la formule exacte de la chaîne : notre dérivation est une fonction de hachage (§ 4.4), donc l'argument vaut dans le modèle de l'oracle aléatoire et demande la revue du § 11 |
| S. Pasini, S. Vaudenay, *SAS-Based Authenticated Key Agreement*, PKC 2006, LNCS 3958 | Les variantes à base d'engagement et de hachage, et l'idée qu'aucun secret partagé n'est nécessaire pour authentifier des clés publiques par une chaîne courte |
| Bluetooth Core Specification (v5.x), Vol 3, Part H, § 2.3.5.6.2 « Authentication stage 1 — Numeric Comparison », fonctions f4 (§ 2.2.6) et g2 (§ 2.2.9) | L'**ordre** des messages : celui qui s'engage révèle en dernier ; la valeur comparée lie les deux clés publiques et les deux aléas. On ne reprend ni P-256 ni AES-CMAC (absents de WebCrypto, de CryptoKit et de la JCE standard), ni les 6 chiffres (≈ 20 bits) |
| Y. Lindell, *Comparison-Based Key Exchange and the Security of the Numeric Comparison Mode in Bluetooth v2.1*, CT-RSA 2009, LNCS 5473 | L'analyse publiée de la structure engagement–révélation de la comparaison numérique, et sa borne ≈ 2^-k par tentative, sous les hypothèses de l'article |
| P. Zimmermann, A. Johnston, J. Callas, **RFC 6189** (ZRTP), § 4.4.1.1 (engagement de hachage `hvi`) et § 7 (SAS) | L'engagement de hachage SHA-256 qui empêche de « moudre » une valeur publique jusqu'à faire coïncider un code court |
| Spécification Matrix, Client-Server API, « Short Authentication String (SAS) verification », méthode `m.sas.v1` (accord `curve25519-hkdf-sha256`, MAC `hkdf-hmac-sha256.v2`, chaînes `decimal` et `emoji`) et `data-definitions/sas-emoji.json` (Apache-2.0) | Les deux **encodages** du code (7 emoji de 6 bits, ou 3 nombres de 13 bits + 1000) et la **table des 64 emoji** avec leurs noms traduits, copiée telle quelle (§ 4.5, empreinte SHA-256 du fichier source `2b4defb2…e887`). On ne reprend ni l'accord X25519 éphémère ni la phase de MAC (§ 3.4) |
| H. Krawczyk, P. Eronen, **RFC 5869** (HKDF), dont les vecteurs de l'annexe A (cas 1, sel non vide ; cas 3, sel et `info` vides) que chaque banc rejoue (§ 3.3) ; RFC 2104 et FIPS 198-1 (HMAC) ; FIPS 180-4 (SHA-256) ; RFC 4648 § 4 (base64) | Les seules primitives du protocole de comparaison |
| M. Marlinspike, T. Perrin, *The Sesame Algorithm*, rév. 2 (2017-04-14) | Les appareils d'un même compte, l'envoi à chacun, la resynchronisation (déjà en place, § 5.4) |
| M. Shapiro et al., *Conflict-free Replicated Data Types*, SSS 2011 (et INRIA RR-7506, « 2P-Set ») | La sémantique du registre de confiance : union des ajouts, union des retraits, le retrait gagne (§ 6.2) |
| libsignal (0.106.2), PQXDH, Double Ratchet | Le canal authentifié entre mes appareils une fois l'épingle posée (§ 5.4, § 6) |
| T. Perrin, *The XEdDSA and VXEdDSA Signature Schemes*, rév. 1 (Signal, 2016-10-20), tel que libsignal 0.106.2 l'implémente (`PrivateKey.sign`, `calculateSignature`, `generateSignature`) | La signature de chaque entrée du registre par la clé d'identité de son AUTEUR (§ 6.1) : une clé X25519 qui signe sans seconde paire de clés. On n'en reprend aucune construction ; on appelle la primitive de libsignal, sur les quatre plateformes |
| Matrix « cross-signing » ; *WhatsApp Encryption Overview*, « Advanced Device Verification » ; chaînes de signatures de Keybase | L'idée qu'une liste d'appareils dont chaque lien est SIGNÉ par un appareil déjà de confiance se vérifie sans croire le serveur ; on n'en reprend ni la clé maîtresse (Matrix), ni l'appareil principal (WhatsApp), ni la chaîne linéaire séquencée par le serveur (Keybase) : chaque appareil signe ses propres entrées, et l'union se fait sans ordre global (§ 6.2) |
| *WhatsApp Encryption Overview* (livre blanc), « Linking Companion Devices » ; Matrix « cross-signing » | Hors de ce lot : la liste d'appareils SIGNÉE que mes contacts pourraient vérifier (§ 11) |
| Rapports publics de 2025 sur l'hameçonnage de l'appairage d'appareils liés de Signal (Google Threat Intelligence Group) | Le motif d'attaque que #13043 vise, transposé au code (§ 7.6) |
| La « correspondance de nombres » (*number matching*) des authentificateurs à notification, adoptée contre la fatigue d'approbation | Le principe du § 4.9 : le geste qui approuve exige une information que seul l'autre écran affiche. On n'en reprend pas la forme (un nombre parmi trois) : sa borne face à un homme du milieu se mesure ici (Arb. 1) |

---

## 2. Modèle de menace

| Adversaire | Couvert | Comment | Limite |
|---|---|---|---|
| **Serveur actif** qui SUBSTITUE la clé du nouvel appareil, ou celle de l'approbateur, dans les messages relayés | Oui | La clé d'identité, le numéro d'appareil, la `registrationId`, la plateforme et le libellé des DEUX appareils entrent dans le code (§ 4.4). Une substitution donne deux codes indépendants (vecteur N1 et un négatif par champ, § 8) | Par tentative : 2⁻⁴² (2⁻³⁹ en chiffres) contre un utilisateur qui compare les sept symboles ; ≈ 2⁻¹² contre celui qui ne vérifie que ce qui départage les options, et cela UNE fois par appareil approuvé et par 24 h, les tentatives suivantes se faisant par saisie (2⁻³⁹) ; ces bornes supposent qu'aucun code ne change sans geste (§ 3.5, § 4.6, § 4.9) |
| **Serveur actif** qui crée un **appareil fantôme** sur mon compte et se pose en homme du milieu entre le vrai nouvel appareil et un de mes appareils | Oui, aux mêmes bornes | L'engagement de l'initiateur fige sa clé et son aléa AVANT qu'il ne voie l'aléa du répondeur ; le répondeur choisit le sien sans connaître celui de l'initiateur. Aucun des deux rôles ne peut être « moulu » (§ 3.5). Chaque entrée du registre est signée par la clé d'identité de son auteur : le serveur, qui ne détient aucune clé privée, n'en forge ni n'en modifie aucune (P8). Une approbation n'entre dans mon groupe que par une comparaison faite sur un appareil de mon groupe, et ce qu'un appareil a approuvé avant d'y être admis y reste PROPOSÉ (§ 6.2, P2, P6) | Idem |
| **Serveur actif** qui forge, rejoue, retarde ou retient des messages | Partiellement | Les messages de comparaison sont liés à leur transaction et expirent en 10 min ; un message d'une transaction qui ne vient pas de la génération pair est ignoré (§ 4.8) ; les synchronisations voyagent par libsignal (le rejeu est refusé par le ratchet) ; les entrées du registre sont signées et immuables, le registre ne fait que croître et converge quel que soit l'ordre (§ 6.2) | Retenir ou retarder est un déni de service. Retenir une RÉVOCATION chez un appareil prolonge, chez lui seul, les copies vers l'appareil retiré ; les approbations de celui-ci ne valent nulle part ailleurs (§ 6.6, § 11) |
| **Serveur compromis en lecture** | Oui pour le registre | Le registre ne voyage que chiffré par libsignal | Les messages de comparaison sont publics par construction (clés publiques, aléas révélés) : le serveur peut CALCULER le code et l'accusé, ce qui ne lui donne rien (§ 3.5). Les options affichées ne quittent jamais l'appareil |
| **Attaquant réseau** | Oui | TLS en transport ; la comparaison ne repose pas sur TLS | Analyse de trafic |
| **Détenteur de mon mot de passe ou d'une session** qui enrôle un appareil P, avec un client modifié qui ne se présente pas, ou qui se présente et répond le premier | Pour mes copies : oui, sauf sur un nouvel appareil dont l'utilisateur touche AU HASARD le bon accusé (≤ 1/4) quand l'appareil P du voleur a répondu le premier. Ce nouvel appareil seul est alors capturé : il envoie à P les copies de ce qu'il écrit, jusqu'au retrait de P, qui le libère sans nouvelle confirmation (§ 6.5) ; si P avait signé des pierres tombales de mes appareils, elles ne comptent que chez lui, qui se réinitialise. Rien de ce que P signe ne compte chez mes autres appareils (P6, P8 ; cas `course-du-voleur-*`, `pierres-tombales-preventives-*`). Pour ce que mes contacts m'écrivent : non. Déni de service : oui (§ 11) | La passerelle annonce TOUT nouvel appareil à mes autres appareils, et chacun le rapproche de l'annuaire à chaque reconnexion (§ 5.3) ; « Ce n'est pas moi » le retire et ferme sa session. Course à la réponse : mon appareil reçoit `cancel(accepted-elsewhere)` et alerte (§ 4.6) ; le nouvel appareil ne confirme qu'en touchant l'accusé que montre l'appareil qui a répondu (§ 4.9) ; et l'approbation de P par le nouvel appareil, antérieure à son admission, reste PROPOSÉE chez tous mes autres appareils (§ 6.2), d'où l'alerte « s'est d'abord confirmé avec n° 5 » (§ 6.5) ; après une course, [Réessayer] vise l'appareil que je désigne (§ 4.6) | Mes contacts lui chiffrent une copie jusqu'à son retrait (GW-04, WEB-18, IOS-02) : la liste d'appareils attestée est hors de ce lot (§ 11) |
| **Approbation distraite** : une invite inattendue sur mon appareil, touchée par réflexe (fatigue, comme pour les notifications d'authentification à deux facteurs) | Oui, borné | L'appareil qui répond ne montre pas un bouton « Identiques » mais QUATRE codes, dont un seul est celui de l'autre écran, et dont aucun ne se distingue sans cet écran (§ 4.9) : un toucher au hasard réussit avec une probabilité ≤ 1/4 ; tout code affiché sans succès fait SAISIR les trois nombres pendant 24 h | Hameçonnage par téléphone : m'amener à toucher le code qu'on me dicte (§ 7.6, § 11) |
| **Un de mes appareils approuvés compromis** (déverrouillé, logiciel malveillant) | Non | — | Il signe ce qu'il veut, et c'est inhérent à « une approbation suffit » : il peut approuver un appareil de l'attaquant, que tous mes appareils croiront ; il peut retirer mes vrais appareils. Bornes : annonce sur tous mes appareils, approbation signée qui le nomme, retrait en cascade automatique (une approbation dont l'auteur est retiré ne compte plus, § 6.2, P3). Ses pierres tombales gardent leur valeur après son retrait : une clé retirée puis volée, avec un serveur complice, peut encore faire tuer des clés (déni, § 6.6, Arb. 9) |
| **Un appareil d'un CONTACT** ajouté par le serveur, ou **un appareil fantôme de mon compte vu par mes contacts** | Non | — | Hors de ce lot : sans liste d'appareils attestée, mes contacts chiffrent pour tout appareil que l'annuaire annonce sur mon compte (§ 11) |

Hypothèses : chaque plateforme tire ses aléas d'un générateur sûr (`SecRandomCopyBytes`, `SecureRandom`, `crypto.getRandomValues`) et refuse de continuer si ce générateur échoue ; libsignal tient ses garanties ; HKDF et SHA-256 se comportent comme un oracle aléatoire (§ 3.5). Les bornes sont données pour trois comportements de l'utilisateur, jamais pour un seul : il compare les sept symboles (ou les trois nombres) ; il ne vérifie que ce qui départage les options ; il touche sans regarder.

---
## 3. Choix du protocole

### 3.1 Ce qu'il faut authentifier, et ce dont on n'a pas besoin

Après la comparaison, l'approbateur A épingle la clé d'identité libsignal du nouvel appareil N, et N épingle celle de A. Toute communication ultérieure entre eux passe par une session libsignal (PQXDH puis Double Ratchet) que `isTrustedIdentity` lie à la clé épinglée. Il faut donc authentifier, dans les deux sens, le **descripteur** de chaque appareil : compte (`userId`), place (`deviceId`), génération (`registrationId`), clé d'identité publique (33 octets), plateforme et libellé affiché.

On n'a **pas** besoin d'établir un secret partagé : la confidentialité vient ensuite de libsignal. C'est ce qui distingue le besoin de Meeshy de celui de Bluetooth ou de ZRTP (qui négocient une clé de session) et de Matrix (qui authentifie ses clés à long terme par un MAC calculé sous un secret X25519 éphémère, parce que ses clés d'appareil sont distinctes de ce que le code compare). Une authentification croisée de messages par chaîne courte (SAS-MCA) suffit.

### 3.2 Candidats évalués

| Candidat | Primitives | Messages | Bits du code | Verdict |
|---|---|---|---|---|
| Comparaison numérique Bluetooth (LE Secure Connections) | P-256 ECDH, AES-CMAC (f4, g2) | échange des clés + 3 | ≈ 20 (6 chiffres) | Structure retenue ; primitives écartées (AES-CMAC n'est natif ni dans WebCrypto, ni dans CryptoKit, ni dans la JCE) ; 20 bits trop courts pour un serveur adversaire |
| Matrix `m.sas.v1` | X25519 éphémère, HKDF, HMAC | ≈ 7 (start, accept avec engagement, key ×2, mac ×2, done) | 42 (emoji) / 39 (chiffres) | Encodages retenus ; accord X25519 et phase de MAC inutiles ici (§ 3.4), et X25519 manque au pont WASM |
| ZRTP (RFC 6189) | DH, engagement de hachage, KDF | ≥ 4 | 16 à 20 | Engagement retenu ; conçu pour une clé de flux média ; code trop court |
| Vaudenay SAS-MCA | engagement + hachage | 3 | k | **Retenu** : c'est exactement le besoin (authentifier deux messages, aucune clé à établir) |
| Comparaison des 60 chiffres libsignal (#13005) | empreinte itérée | 0 | ≈ 100 bits seulement si les 30 chiffres de l'approuvé sont saisis | Écartée : elle se moud hors ligne (pas d'engagement), et la saisie de 30 chiffres contredit « aucune saisie » |
| vodozemac (implémentation Rust de `m.sas.v1` de Matrix, auditée, Apache-2.0) | X25519, HKDF, HMAC | ≈ 7 | 42 / 39 | Écartée pour ce lot : une dépendance native de plus sur iOS, Android et dans le WASM, deux messages de plus, et son audit couvre SON protocole, pas son usage pour authentifier des clés libsignal, qui resterait une composition à revoir. Le transport (§ 5) et le registre (§ 6) ne dépendent pas de la méthode : le champ `methods` de `request` permettra de lui céder la place si la revue externe le demande |

**Écart avec les propositions des audits du 2026-11-17.** L'audit web (§ 7.3) et l'audit iOS (§ 5.3 A) proposent des clés X25519 ÉPHÉMÈRES, un code de 6 chiffres et une phase de MAC. Trois corrections : (1) ce qui empêche de « moudre » une clé n'est pas l'éphémère mais l'ENGAGEMENT pris avant de voir la contribution de l'autre ; des aléas de 32 octets y suffisent, et les clés d'identité entrent directement dans la transcription ; (2) la phase de MAC sert, chez Matrix, à authentifier des clés à long terme distinctes de ce que le code compare ; ici le code les compare elles-mêmes, et la confirmation repart ensuite par libsignal, authentifiée par l'épingle (§ 6.5) ; (3) 6 chiffres donnent ≈ 20 bits face à un serveur adversaire qui recommence à volonté ; on garde 42 bits (39 en chiffres). Résultat : aucune fonction à ajouter au pont WASM pour comparer (WEB-05) ; WebCrypto fournit SHA-256, HMAC et HKDF.

**Les messages de comparaison ne passent pas par libsignal.** L'audit iOS suggère un type de charge « appairage » que l'ouvreur accepterait d'un de mes appareils non approuvé. On s'en abstient : la règle « une enveloppe d'un de mes appareils non approuvé n'est jamais ouverte » (`E2EEEnvelopeOpener.swift:123`) reste sans exception, et la comparaison voyage par un relais en clair dont rien n'a besoin d'être secret (§ 4.3, § 5.2).

### 3.3 Construction retenue

**Une authentification croisée à engagement puis révélation (structure SAS-MCA de Vaudenay, ordre de la comparaison numérique de Bluetooth), avec un engagement SHA-256, un code et un accusé dérivés par HKDF-SHA-256, rendus par les encodages publiés de `m.sas.v1`.** Trois messages relayés en clair (`request`, `accept`, `reveal`), puis un geste sur chaque écran : sur le répondeur, toucher parmi quatre le code que montre l'initiateur ; sur l'initiateur, toucher parmi quatre l'accusé que le répondeur affiche alors (§ 4.9). Primitives : SHA-256, HMAC-SHA-256 (sous HKDF), un générateur d'aléa sûr. Toutes sont natives :

| Plateforme | SHA-256 | HKDF-SHA-256 | Aléa |
|---|---|---|---|
| iOS / Mac (iOS 16+) | CryptoKit `SHA256` | CryptoKit `HKDF<SHA256>` (iOS 14+) | `SecRandomCopyBytes` |
| Android (`:core:e2ee`, JVM nue) | `java.security.MessageDigest` | `javax.crypto.Mac("HmacSHA256")` en deux appels (extraction, puis un bloc d'expansion : 8 octets ≤ 32). **Le sel vide s'écrit en 32 octets nuls** : `SecretKeySpec` refuse une clé vide, et HMAC rend le même résultat pour les deux ; toutes les plateformes emploient cette valeur, pour qu'aucune ne dépende du traitement d'une clé vide | `java.security.SecureRandom` |
| Web et référence TypeScript | `crypto.subtle.digest` | `crypto.subtle.deriveBits({ name: 'HKDF' })` | `crypto.getRandomValues` |
| Passerelle (témoins) | `node:crypto` ou WebCrypto | `hkdfSync` ou WebCrypto | `randomBytes` |

Le script de vecteurs (§ 8) rejoue d'abord les vecteurs publiés RFC 5869 A.1 (sel non vide) et A.3 (sel et `info` vides) par les trois chemins, puis calcule chaque code par `node:crypto`, le recalcule par WebCrypto et par un HKDF recomposé à la main sur HMAC, et s'arrête au moindre écart. **Chaque banc de plateforme rejoue lui aussi A.1 et A.3 avant les vecteurs Meeshy** : une plateforme qui se tromperait de sel tombe sur un vecteur public d'abord.

**Pièges par plateforme** (relevés par la contre-revue, F.2 ; chacun est tenu par un vecteur du § 8 ou par un témoin nommé) :

| Plateforme | Piège | Règle | Tenu par |
|---|---|---|---|
| iOS / macOS (CryptoKit, Foundation) | `SecRandomCopyBytes` rend un statut | tout statut ≠ `errSecSuccess` annule la transaction ; jamais d'aléa nul | témoin à générateur défaillant injecté (§ 9) |
| | `Data(base64Encoded:)` accepte des bits de remplissage non nuls | réencoder et comparer (§ 4.1) | `alea-en-base64-non-canonique-refuse` |
| | `JSONDecoder` rejette une chaîne à demi-paire par une erreur générique | refus explicite `unexpected-message`, pas une erreur de décodage | `libelle-a-demi-paire-refuse` |
| | horodatages | `Int64`, refus d'un nombre non entier ou ≥ 2⁵³ | `horodatage-hors-borne-refuse` |
| Android (`:core:e2ee`, JVM nue) | `String.toByteArray(UTF_8)` remplace une demi-paire par `?` (`3F`) | vérifier la bonne forme AVANT d'encoder | `libelle-a-demi-paire-refuse` |
| | `Base64.getDecoder()` ignore les bits de remplissage | réencoder et comparer | `alea-en-base64-non-canonique-refuse` |
| | `Mac` et `MessageDigest` ne sont pas sûrs entre fils | une instance par calcul | témoin qui rejoue les vecteurs en parallèle |
| | `SecretKeySpec` refuse une clé vide | sel = 32 octets nuls | RFC 5869 A.3, tous les vecteurs |
| | horodatages | `Long`, refus d'un non-entier ou d'une valeur ≥ 2⁵³ | `horodatage-hors-borne-refuse` |
| Web et référence TS (WebCrypto) | `crypto.subtle` n'existe qu'en contexte sûr (HTTPS, `capacitor://localhost`, `https://localhost`) | son absence est un refus de vérifier, jamais un repli | témoin « sans `crypto.subtle`, aucune comparaison ne démarre » |
| | `TextEncoder` encode une demi-paire en `EF BF BD` | vérifier `isWellFormed()` avant d'encoder | `libelle-a-demi-paire-refuse` |
| | `JSON.parse` arrondit au-delà de 2⁵³ | refuser toute valeur hors de [0, 2⁵³ − 1] avant la fusion | `horodatage-hors-borne-refuse` |
| | `atob` est laxiste (blancs, remplissage) | réencoder et comparer | `alea-en-base64-non-canonique-refuse`, `cle-en-base64-avec-blanc-refusee` |
| | HKDF à sel vide dans WebKit (Safari, WKWebView) et Firefox : non vérifié | le banc du lot 6 tourne dans Chromium, WebKit et Firefox | RFC 5869 A.3 |
| Passerelle (témoins) | ses schémas Zod pourraient relayer ce qu'un client refusera | ses schémas refusent ce que les clients refusent | tous les négatifs « refus » du § 8 passent par les schémas du relais |

### 3.4 Pourquoi aucun accord X25519

Un accord X25519 n'apporte rien quand aucun secret n'est à établir (§ 3.1), et il coûterait : `PrivateKey.keyAgreement(with:)` existe dans `LibSignalClient` Swift (`packages/LibSignalClient/Sources/LibSignalClient/PrivateKey.swift:62`) et `ECPrivateKey.calculateAgreement` dans libsignal Java, mais le pont WASM du web, sur `dev`, n'exporte ni accord de clés, ni HKDF, ni signature d'un message arbitraire (`packages/libsignal-wasm/src/lib.rs`, WEB-05 ; le pont v2 ajoute la signature, pas l'accord), et X25519 n'est arrivé que récemment dans WebCrypto. Le protocole retenu n'en dépend pas : SHA-256, HMAC et HKDF viennent de WebCrypto, nativement. La comparaison ne demande pas non plus de signature XEdDSA. **Le registre de confiance, lui, en demande une par entrée (§ 6.1)** : libsignal l'expose sur les quatre plateformes (iOS `generateSignature`, Android `calculateSignature`, Node `sign`, et le pont WASM v2 `signWithIdentity`, sur la branche du web, `lib.rs:436`), où elle sert déjà la preuve de liaison de l'enrôlement.


### 3.5 Sécurité chiffrée

**Hypothèse de toutes les bornes de ce paragraphe** : HKDF-SHA-256 et SHA-256 se comportent comme un oracle aléatoire (l'argument de Vaudenay et de Lindell porte sur la STRUCTURE, § 1), chaque appareil tire ses aléas d'un générateur sûr, et **aucun écran ne change de code sans un geste** (§ 4.6, « Un code ne change jamais sans geste »). Les bornes sont données par comportement de l'utilisateur ; 2⁻⁴² n'est vrai que pour celui qui compare les sept symboles.

- **Code** : les 6 premiers octets de la sortie HKDF. Rendu emoji : les 42 premiers bits, soit 7 symboles parmi 64. Rendu chiffres : 39 bits, soit trois nombres de 4 chiffres (1000 à 9191). Les deux rendus viennent des mêmes octets ; la sécurité est celle du rendu comparé.
- **Accusé** : les octets 6 et 7 de la même sortie. Rendu emoji : 12 bits, deux symboles ; rendu chiffres : 13 bits, un nombre. L'appareil qui répond ne l'affiche qu'après le BON toucher (§ 4.9) ; il ne protège que la confirmation de l'initiateur, et n'entre pas dans la borne de l'homme du milieu sur le répondeur.
- **Probabilité de succès d'un homme du milieu, par tentative, sur l'appareil qui répond** (celui dont la confirmation se propage) :

| Comportement de l'utilisateur | Emoji | Chiffres |
|---|---|---|
| compare les sept symboles (ou les trois nombres) | 2⁻⁴² ≈ 2,3 × 10⁻¹³ | 2⁻³⁹ ≈ 1,8 × 10⁻¹² |
| ne vérifie que ce qui départage les quatre options | ≈ 2⁻¹² ≈ 2,4 × 10⁻⁴ (mesuré 2,45 × 10⁻⁴) | ≈ 2⁻²⁶ ≈ 1,5 × 10⁻⁸ (aucun nombre seul ne départage) |
| lit UN symbole qui départage, puis touche au hasard l'une des deux options qui restent | ≈ 2⁻⁷ ≈ 7,8 × 10⁻³ (mesuré 8,1 × 10⁻³, revue de confirmation) | — |
| lit de gauche à droite jusqu'à ce qu'une seule option reste | ≤ 2⁻²⁴ (0 sur 200 000 mesurés) | — |
| saisit les trois nombres (mode renforcé) | — | 2⁻³⁹ |

  Pour mémoire : Bluetooth 10⁻⁶ ; ZRTP 2⁻¹⁶ à 2⁻²⁰. **Parmi les dispositions où l'écran seul ne désigne rien (P7), ≈ 2⁻¹² est le plafond de toute correspondance à moins de huit options** face à l'utilisateur qui ne vérifie que ce qui départage les options (Arb. 1).
- **Pourquoi il n'y a qu'une tentative par échange.** Soit M l'attaquant entre N (initiateur) et A (répondeur). Vers A, M doit envoyer un engagement (sur une clé et un aléa qu'il choisit) AVANT que A ne publie son aléa : le code de A est alors entièrement fixé dès que M reçoit l'aléa de A. Vers N, M doit choisir son faux aléa de répondeur APRÈS avoir reçu l'engagement de N mais AVANT la révélation de l'aléa de N (32 octets cachés par SHA-256) : le code de N est, pour M, uniforme. M ne réussit que si les deux coïncident sur ce que l'utilisateur vérifie. L'engagement couvre le **descripteur entier** de l'initiateur, pas seulement son aléa : sans cela, M pourrait choisir la clé de son fantôme après avoir vu l'aléa de A et « moudre » 2^k clés jusqu'à obtenir le code voulu. L'argument tient pour UNE comparaison : il suppose qu'aucun écran n'affiche un nouveau code sans un nouveau geste (contre-revue, B.0).
- **Nombre de tentatives — la condition de la borne.** Les quatre règles du § 4.6 « Un code ne change jamais sans geste » en sont la condition : (1) un seul envoi automatique de `request` par enrôlement, et des états terminaux que seule une action de l'utilisateur rouvre ; (2) aucune transaction ouverte n'est remplacée ; (3) `accept` une fois par geste d'ouverture ; (4) au plus 5 codes affichés par heure et 10 par 24 h. S'y ajoute la règle du § 4.9 : **à partir du premier code affiché sans succès, et pendant 24 h, la confirmation se fait par saisie**. Un serveur actif obtient donc, par appareil approuvé et par 24 h, au plus une tentative non saisie puis au plus neuf à 2⁻³⁹, soit ≤ 2,5 × 10⁻⁴ contre l'utilisateur qui ne vérifie que ce qui départage les options, ≈ 2⁻⁷ contre celui qui en lit un seul symbole puis touche au hasard, **1/4 contre celui qui touche sans regarder**, et ≤ 1,7 × 10⁻¹¹ contre celui qui compare (2⁻⁴², puis neuf saisies à 2⁻³⁹). Il ne peut pas provoquer ces tentatives : chacune suppose que j'ajoute un appareil et que je fasse le geste.
- **Le code n'est pas secret.** Les aléas sont publics après la révélation ; le serveur peut calculer le code et l'accusé. Cela ne lui sert à rien : la sécurité vient de ce qu'il ne peut pas faire afficher le MÊME code aux deux appareils sans être le relais honnête. Ce qui est secret, et ne quitte jamais l'appareil, ce sont l'aléa `nonce_I` jusqu'à `reveal`, et les options affichées avec leur ordre (§ 4.4).
- **Toucher sans regarder** : sur l'appareil qui répond, la correspondance parmi quatre codes (§ 4.9) borne à 1/4 le succès d'un toucher au hasard (contre 1 pour un bouton « Identiques »), puis à 2⁻³⁹ par tentative pendant 24 h (saisie). L'écran seul ne désigne pas l'option juste : chaque option affichée est la bonne avec une probabilité 1/4 au vu de l'écran (propriété P7, § 11). Sur l'initiateur, toucher au hasard le bon accusé réussit au plus une fois sur quatre.
- **Le serveur ne voit ni n'influence les options** : elles sont tirées localement, une fois par transaction, jamais émises ; il connaît le code juste (il le calcule), ce qui ne lui dit rien des trois autres options ni de leur ordre.

---

## 4. Protocole de vérification

### 4.1 Notations et encodage

- `u32(x)` : 4 octets, grand-boutien. `LP(b) = u32(longueur de b) ‖ b`. `‖` : concaténation.
- `utf8(s)` : octets UTF-8 de la chaîne **telle qu'elle a été sérialisée** par son auteur. Personne ne la renormalise.
- **`userId` voyage en minuscules ; toute autre forme est refusée (`unexpected-message`) ; `enc` ne le normalise pas.** C'est la forme qu'impose déjà le schéma de la passerelle (`objectId`, `packages/shared/types/e2ee-directory.ts:163`, `/^[a-f0-9]{24}$/`) : un seul encodage sur le fil, des validateurs qui ne divergent pas.
- **Le libellé est une suite de scalaires Unicode bien formée (aucune demi-paire de substitution ; `String.prototype.isWellFormed()` côté passerelle), en NFC, sans caractère de contrôle, d'au plus 64 unités UTF-16 ; un client tronque son nom d'appareil sur une frontière de graphème. Ces contrôles s'appliquent au RELAIS des messages de comparaison, jamais au schéma d'enrôlement existant** (`e2eeEnrollDeviceRequestSchema` reste `z.string().max(64).optional()` : un client publié qui enrôle un libellé NFD continue de s'enrôler, #9223). **Un libellé vide s'écrit en OMETTANT le champ (`""` est refusé).** Pour `request` et `accept`, le relais refuse un `from.label` différent du libellé que l'annuaire tient pour cette génération (hygiène, § 5.2) ; l'écran confirmé affiche le libellé AUTHENTIFIÉ, celui du descripteur. Une génération dont le libellé d'annuaire ne passe pas ces contrôles (posé par un client ancien) se réenrôle avec un libellé conforme avant toute comparaison ; un client qui sait comparer compose toujours un libellé conforme.
- base64 : RFC 4648 § 4, avec remplissage, **canonique** (décodé puis réencodé, identique ; sinon refus). Un décodeur laxiste (`atob`, `Data(base64Encoded:)`, `Base64.getDecoder()`) ne suffit pas : on réencode et on compare (§ 3.3).
- **Descripteur** d'un appareil X :
  `enc(X) = LP(ascii(userId)) ‖ u32(deviceId) ‖ u32(registrationId) ‖ LP(identityKey) ‖ LP(utf8(platform)) ‖ LP(utf8(label ?? ""))`
  avec `userId` un ObjectId (24 caractères hexadécimaux minuscules, tel que reçu), `deviceId` dans 1…127, `registrationId` dans 1…16383 (`e2eeRegistrationIdSchema`), `identityKey` la clé publique sérialisée par libsignal (33 octets, premier octet `0x05`), `platform` ∈ {`ios`, `macos`, `android`, `web`}, un libellé omis s'encodant comme la chaîne vide (`LP("") = 00000000`).
- Étiquettes de séparation de domaine, en UTF-8 :
  `meeshy-device-verification:v1|commitment`, `meeshy-device-verification:v1|transcript`, `meeshy-device-verification:v1|sas`.
- Tailles : `tx` 16 octets aléatoires (tirés par l'initiateur) ; aléas `nonce_I`, `nonce_R` 32 octets ; engagement 32 octets ; sortie HKDF 8 octets, dont le code (6) et l'accusé (2).

### 4.2 Rôles

- **Initiateur (I)** : l'appareil qui s'engage. Au chemin nominal, c'est le **nouvel appareil N**, qui se présente seul à l'enrôlement (§ 7.1).
- **Répondeur (R)** : l'appareil qui accepte. Au chemin nominal, c'est l'**approbateur A**, l'appareil que j'ai en main.
- **Qui peut tenir quel rôle** (§ 6.1 pour les définitions) : un appareil **en attente** (ni premier appareil du compte, ni entré dans un groupe) ne fait qu'INITIER ; il ne répond à aucune demande (§ 4.8). Un **membre** (le premier appareil du compte, dit racine, ou un appareil entré dans un groupe) répond, et n'initie que lorsqu'il est lui-même le SUJET de la confirmation (un conflit sur sa propre place, une de ses entrées « à confirmer »). **Un membre ne lance jamais de demande vers un appareil en attente** : « C'est moi » sur une annonce et « Confirmer » dans la liste guident l'utilisateur vers le nouvel appareil (« Sur « iPad », touchez « Confirmer cet appareil » »), qui initie (Arb. 5).
- **Le rôle dit aussi ce que chacun signe** (§ 6.1) : l'initiateur est l'appareil qui REJOINT, le répondeur celui qui ADMET. Une fois les deux confirmations faites, le répondeur signe une approbation de l'initiateur, et l'initiateur une approbation de PARRAINAGE du répondeur, par laquelle il adopte toute la vue de celui-ci (Arb. 8).
- **Le geste de confirmation dépend du rôle, pas de l'appareil** : le répondeur PROPOSE quatre codes et l'utilisateur touche celui que montre l'autre écran ; l'initiateur MONTRE le code puis, une fois le bon code touché sur le répondeur, propose quatre accusés et l'utilisateur touche celui que le répondeur affiche alors (§ 4.9). Une invite non sollicitée tombe toujours sur un répondeur : c'est là que l'approbation distraite se joue. Les deux chemins restent à un geste, et chacun exige de regarder l'autre écran.
- **Collision** : si deux membres s'adressent chacun une demande avant que l'un ou l'autre n'ait envoyé `accept` ou affiché un code, la transaction dont le `tx` est le plus petit (ordre des octets) l'emporte ; l'autre est annulée (`superseded`). Une transaction ouverte (`accept` envoyé, ou code affiché) n'est jamais remplacée (§ 4.6).

### 4.3 Messages

Les messages de comparaison sont des objets JSON relayés **en clair** par la passerelle (sous TLS) entre deux appareils du même compte (§ 5.2). Ils ne portent que des données publiques. Chacun porte `v: 1`, `type` et `tx`. **Le relais y ajoute, hors du message, la génération émettrice qu'il a vérifiée, sous le nom `relayedFrom: { deviceId, registrationId }`.** Le `from` porté DANS `request` et `accept` est le descripteur que le code authentifie ; `relayedFrom` ne sert qu'aux contrôles du § 4.8 et n'entre dans aucun calcul.

| `type` | Sens | Champs | Effet |
|---|---|---|---|
| `request` | I → tous mes autres appareils capables (`to: "others"`), ou l'appareil que l'utilisateur a désigné après une course (`to: { deviceId, registrationId }`, § 4.6) | `from` (descripteur complet : `userId`, `deviceId`, `registrationId`, `identityKey`, `platform`, `label` s'il existe), `commitment`, `methods: ["emoji","decimal"]` | Annonce l'appareil et l'engage |
| `accept` | R → I | `from` (descripteur de R), `nonce` (= `nonce_R`), `method` (`emoji` par défaut) | R publie son aléa |
| `reveal` | I → R (le seul répondeur retenu) | `nonce` (= `nonce_I`) | I ouvre son engagement ; I affiche le code, R les quatre options (§ 4.9) |
| `method` | I ↔ R | `method` | **Une bascule `method` reçue ne redessine pas un écran qui affiche déjà le code ou les options : elle y propose « L'autre appareil affiche des chiffres — Afficher en chiffres ».** Un écran qui n'affiche encore rien adopte le rendu demandé |
| `cancel` | I ↔ R, I → autres, ou synthétisé par le relais | `reason` ∈ {`user-denied`, `user-mismatch`, `commitment-mismatch`, `key-mismatch`, `timeout`, `accepted-elsewhere`, `superseded`, `unexpected-message`, `unsupported`, `limit`} | Termine la transaction. Le `cancel(accepted-elsewhere)` que le relais substitue à une copie en attente porte, hors du message, `answeredBy: { deviceId, registrationId }`, la génération qui a répondu (§ 5.2) |

**Un toucher dans les 1,5 s qui suivent un changement de rendu (apparition, bascule emoji/chiffres, rotation, changement de taille de texte, retour au premier plan) est ignoré : ni succès, ni échec.** En mode renforcé, l'écran du répondeur dit lui-même « Sur l'autre appareil, touchez « Comparer en chiffres » » au lieu de compter sur `accept.method`, que le serveur peut réécrire.

Un `cancel` n'est pas authentifié : un serveur peut en forger (déni de service) ou en retenir. Il ne pose jamais d'épingle ; il ne peut qu'en faire RETIRER une posée pendant cette même transaction (§ 4.7), dans le sens sûr. Un `cancel` qui ne vient pas de la génération pair de la transaction est ignoré (§ 4.8).

La confirmation de l'utilisateur ne voyage PAS par ce canal : elle part, après l'épinglage, par le canal libsignal authentifié (§ 6.5).

### 4.4 Calculs

```
C   = SHA-256( LP(utf8("meeshy-device-verification:v1|commitment")) ‖ LP(tx) ‖ LP(enc(I)) ‖ LP(nonce_I) )
T   = LP(utf8("meeshy-device-verification:v1|transcript")) ‖ LP(tx) ‖ LP(enc(I)) ‖ LP(enc(R)) ‖ LP(C)
OKM = HKDF-SHA-256( IKM  = nonce_I ‖ nonce_R,
                    salt = 32 octets nuls (équivalent au sel vide de la RFC 5869),
                    info = utf8("meeshy-device-verification:v1|sas") ‖ SHA-256(T),
                    L    = 8 )
code   = OKM[0..5]      (identique à la v1 de ce document : HKDF rend un préfixe)
accusé = OKM[6..7]
```

- L'initiateur calcule `enc(I)` sur les valeurs qu'il SÉRIALISE dans `request` ; le répondeur sur celles qu'il DÉSÉRIALISE. Ce sont les mêmes octets si personne ne réécrit le message (le relais valide et refuse, il ne corrige jamais, § 5.2). Un libellé altéré dans `request` fait échouer l'ouverture de l'engagement (vecteur N2-bis), il ne produit pas « deux codes ».
- Le répondeur ne calcule le code qu'après avoir recalculé `C` à partir du descripteur reçu dans `request`, du `tx` et du `nonce` reçu dans `reveal`, et constaté l'égalité (aucune donnée secrète n'y entre). Sinon : `cancel(commitment-mismatch)` et alerte de sécurité (vecteurs N2-bis, N3 et N4, § 8).
- **`nonce_I` est tiré par le générateur sûr, gardé en mémoire (ou dans la base scellée si la transaction survit à la mort du processus), et n'apparaît dans aucun journal, aucun rapport d'incident ni aucune analytique avant `reveal` ; les options affichées et la position du code juste n'apparaissent dans aucun journal, identifiant d'accessibilité, `testTag`/`data-testid`, analytique ou rapport de plantage (§ 4.9).** L'accusé n'est montré qu'après le bon toucher et ne se journalise pas davantage.
- Les rôles sont fixés par la position dans `T` (initiateur d'abord) et par l'ordre de l'IKM (vecteur « inversion des rôles », § 8). Aucun appareil n'accepte un pair dont le descripteur est le sien (place, génération ou clé), ni un pair d'un autre compte : cela ferme la réflexion d'un message vers son propre auteur.

### 4.5 Rendu du code et de l'accusé

- **Emoji** (méthode `emoji` de `m.sas.v1`) : `N = B0‖B1‖…‖B5` sur 48 bits ; le symbole `i` (0…6) a l'indice `(N >> (42 − 6i)) & 0x3F` dans la table `sas-emoji-v1.json` (64 entrées, noms traduits dans les sept langues du catalogue : fr, en, es, de, it, pt-BR, ar).
- **Chiffres** (méthode `decimal`) : `(B0<<5 | B1>>3) + 1000`, `((B1&7)<<10 | B2<<2 | B3>>6) + 1000`, `((B3&63)<<7 | B4>>1) + 1000`, affichés dans cet ordre, séparés par des espaces.
- **Accusé** : avec `A0 = OKM[6]`, `A1 = OKM[7]` : en emoji les indices `A0 >> 2` et `((A0 & 3) << 4) | (A1 >> 4)` ; en chiffres le nombre `((A0 << 5) | (A1 >> 3)) + 1000`.
- **Ordre gauche → droite imposé** sur toutes les plateformes, y compris en arabe : une pile miroir inverserait l'ordre sur un appareil RTL et pas sur l'autre (§ 7.3).
- **La table et sa licence.** La table copiée porte, dans son `_doc` et dans le README des fixtures : « Dérivée de matrix-org/matrix-spec `data-definitions/sas-emoji.json` (SHA-256 `2b4defb276d61f11cb9cbfb0ba326b96a8dbd9e768e6bc53fa0f565cd598e887`), Apache-2.0 ; modifiée par Meeshy le 2026-11-17 : clés renommées, sept langues retenues, métadonnées ajoutées. » Le texte de la licence est copié à côté (`LICENSE-sas-emoji.txt`, texte Apache-2.0 complet, identique au `LICENSE` du dépôt amont ; aucun fichier `NOTICE` amont au 2026-11-17, à revérifier à chaque mise à jour). Chaque application qui embarque les noms (iOS, Android, web) les cite dans son écran ou sa page de licences tierces, avec le texte Apache-2.0 ; les catalogues générés portent en tête un commentaire qui renvoie à cette source. L'avis juridique AGPL (#11548) inclut ce composant dans son périmètre (compatibilité Apache-2.0 → AGPL-3.0 dans un seul sens). Ce paragraphe n'est pas un avis juridique : l'agent `conformite-juridique` et un avis signé restent requis.

### 4.6 Machine à états, délais, essais

Chaque appareil tient au plus **une** transaction active à la fois, et une file d'au plus une demande entrante NON ouverte par génération émettrice (la plus récente remplace la précédente dans la file : `superseded`).

**Un code ne change jamais sans geste** (condition de la borne du § 3.5) :
1. L'envoi AUTOMATIQUE d'une `request` n'a lieu qu'une fois par enrôlement d'une génération (puis au plus une fois par lancement de l'app, jamais pendant qu'un code est affiché). `expired`, `cancelled`, `failed` et `limit` sont TERMINAUX : seule une action de l'utilisateur (« Recommencer », « Confirmer cet appareil », « Réessayer ») ouvre une nouvelle transaction.
2. Une transaction pour laquelle l'appareil a envoyé `accept`, ou affiché un code, ne peut être remplacée par aucune autre (`superseded` ne vise que la file des demandes NON ouvertes) ; une nouvelle demande reçue pendant ce temps attend, sans `accept`.
3. La feuille n'envoie `accept` qu'une fois par geste d'ouverture ; elle ne renvoie jamais `accept` d'elle-même.
4. Plafond local : au plus 5 codes affichés par heure et 10 par 24 h (fenêtres glissantes, comme tous les plafonds de ce document), toutes transactions et tous rôles confondus ; au-delà, l'appareil n'affiche plus de code et montre l'alerte « Plusieurs tentatives de confirmation en peu de temps. Réessayez plus tard, ou retirez les appareils que vous ne reconnaissez pas. »
5. Le § 3.5 « Nombre de tentatives » cite ces quatre règles comme la condition de la borne.

**Initiateur**

| État | Entrée | Sortie |
|---|---|---|
| `idle` | l'appareil est enrôlé, EN ATTENTE (§ 6.1), mon compte a d'autres appareils capables, et la règle 1 permet l'envoi automatique ; ou geste « Confirmer cet appareil » / « Recommencer » | tirer `tx`, `nonce_I` ; calculer `C` ; envoyer `request` à `others` ; → `requested` (minuterie 10 min) |
| `idle` | geste [Réessayer] après « Deux réponses », « Acceptée ailleurs » ou un échec : l'utilisateur DÉSIGNE dans la liste l'appareil qu'il a en main | même chose, mais `request` adressée à cette seule génération (`to: { deviceId, registrationId }`, § 5.2) : la course d'un tiers est impossible pour cette tentative |
| `requested` | premier `accept` valide (§ 4.8) | envoyer `reveal` à ce répondeur ; `cancel(accepted-elsewhere)` aux autres répondeurs ; calculer code et accusé ; tirer une fois les quatre accusés (§ 4.9) ; → `showing` (minuterie 5 min) |
| `requested` | `accept` suivant, d'une autre génération | `cancel(accepted-elsewhere)` à son auteur |
| `requested` | 10 min sans `accept` | → `expired` (l'écran propose « Recommencer », qui ouvre une nouvelle transaction) |
| `showing` | toucher du bon accusé | épingler R (§ 4.7) ; → `confirmed-local` |
| `showing` | toucher d'un autre accusé, ou « Aucun ne correspond » | `cancel(user-mismatch)` ; compter un échec ; alerte ; mode renforcé 24 h (§ 4.9) ; → `failed` |
| `showing` | un `accept` d'une AUTRE génération pour le même `tx` | annuler : `cancel(superseded)` aux deux répondeurs, aucune épingle ; alerte « Deux appareils ont répondu à cette demande : l'un d'eux n'est peut-être pas à vous » ; → `failed` (sans compter d'échec) |
| `showing` | `cancel` de la génération pair, ou 5 min | → `cancelled` / `expired` |
| `confirmed-local` | `ledger(verified)` de R ouvert par libsignal (§ 6.5) — preuve que R a confirmé | signer l'approbation de PARRAINAGE de R (`fromSeq` = `head` de R + 1, `sponsor: true`, § 6.1) ; envoyer mon `ledger(verified)` ; → `done` |
| `confirmed-local` | `cancel(user-mismatch)` de R | retirer l'épingle de R posée par CETTE transaction (aucune approbation n'est encore signée) ; alerte ; → `failed`, sans compter d'échec |
| `confirmed-local` | un `accept` d'une AUTRE génération pour le même `tx` | retirer l'épingle posée par cette transaction (sens sûr, § 4.7) ; même alerte « Deux appareils ont répondu… » ; → `failed` |
| `confirmed-local` | 10 min | rester épinglé, l'écran dit « Confirmez aussi sur l'autre appareil » ; aucune propagation (§ 6.4) |

**Répondeur**

| État | Entrée | Sortie |
|---|---|---|
| `idle` | `request` valide (§ 4.8), et cet appareil est MEMBRE | → `prompted` : invite à l'écran (§ 7.2), aucune donnée envoyée ; **`prompted` expire 10 min après la réception de la `request`** |
| `prompted` | l'utilisateur ouvre l'invite (geste) | tirer `nonce_R` ; envoyer `accept` (une fois par geste) ; la feuille affiche « Calcul du code… » ; → `accepted` (minuterie 60 s) |
| `prompted` | « Ce n'est pas moi » | `cancel(user-denied)` ; taire cette génération 24 h ; proposer de la retirer du compte (§ 7.2) |
| `prompted` | 10 min | → `expired` |
| `prompted` ou `accepted` | `cancel(accepted-elsewhere)` (du relais ou de l'initiateur) | si l'invite a été montrée ou ouverte : alerte « La demande de n° 4 a été acceptée par un autre appareil de votre compte. Si ce n'était pas vous, retirez l'appareil que vous ne reconnaissez pas. », avec mes appareils en attente, chacun avec [Retirer] (§ 7.2) ; → `cancelled` |
| `accepted` | `reveal` qui ouvre `C` | calculer code et accusé ; tirer UNE fois les quatre options (§ 4.9) ; afficher les quatre ENSEMBLE ; → `choosing` (minuterie 5 min) |
| `accepted` | `reveal` qui n'ouvre pas `C` | `cancel(commitment-mismatch)` ; alerte, sans compter d'échec ; → `failed` |
| `accepted` | 60 s sans `reveal`, ou autre `cancel` de la génération pair | → `expired` / `cancelled` |
| `choosing` | toucher du code juste | épingler I (§ 4.7) ; afficher l'accusé : « Touchez « ❤️ 🌙 » sur « iPad de Zoé » » ; → `confirmed-local` |
| `choosing` | toucher d'une autre option, ou « Aucun ne correspond » | `cancel(user-mismatch)` ; compter un échec ; alerte ; **mode renforcé 24 h** (§ 4.9) ; → `failed` |
| `choosing` | `cancel` de la génération pair, ou 5 min | → `cancelled` / `expired` ; mode renforcé 24 h (un code affiché sans succès) |
| `confirmed-local` | `ledger(verified)` de I ouvert par libsignal — preuve que I a confirmé | signer mon approbation de I (`fromSeq` = `head` de I + 1, § 6.1) ; → `done` ; propagation (§ 6.4) |
| `confirmed-local` | `cancel(user-mismatch)` de I (accusé faux touché sur l'autre écran) | retirer l'épingle de I posée par CETTE transaction (aucune approbation n'est encore signée) ; alerte ; → `failed`, sans compter d'échec |

**Essais.** Seuls comptent les échecs DÉCIDÉS par l'utilisateur SUR CET APPAREIL : une option ou un accusé faux touché, « Aucun ne correspond », une saisie fausse. **Le `cancel(user-mismatch)` reçu de l'autre écran ne compte pas** : il n'est pas authentifié (§ 4.3), et trois messages forgés bloqueraient sinon la paire 24 h, renouvelable (revue de confirmation) ; il retire l'épingle posée par cette transaction et alerte, sans compter. `commitment-mismatch` et `key-mismatch` annulent la transaction et lèvent l'alerte sans compter ; au troisième en 24 h avec la même génération, l'écran dit « Les échanges avec « X » semblent modifiés en chemin » et propose le QR (iOS) ou « Réessayer plus tard », sans bloquer une confirmation lancée par un geste. Au troisième échec décidé en 24 h avec une même génération, l'appareil refuse toute nouvelle comparaison avec elle (`cancel(limit)`) et propose le QR (iOS) ou le retrait de l'appareil. Les compteurs vivent dans la base scellée de l'appareil, pas au serveur.

**Invites non sollicitées.** Un appareil affiche au plus **deux** invites par 24 h (fenêtre glissante) pour des générations inconnues — qui ne sont, chez lui, ni effectives ni nommées par une entrée proposée ; au-delà, il n'affiche plus de code, seulement l'alerte « Plusieurs appareils inconnus essaient de rejoindre votre compte », qui liste les appareils en attente, chacun avec [Confirmer] et [Retirer], et « Changer mon mot de passe ». Le plafond ne s'applique jamais à une confirmation lancée par un geste sur l'appareil qui l'affiche : « C'est moi » ou « Confirmer » y rend SOLLICITÉE, pendant 10 min, la prochaine demande de cette génération. « Ce n'est pas moi » tait la génération concernée 24 h.

**Après une course** (« Deux réponses », « Acceptée ailleurs ») : [Réessayer] sur le nouvel appareil n'adresse plus la demande à `others` mais à l'appareil que l'utilisateur désigne dans la liste (ligne `idle` ci-dessus) ; et **dès la deuxième course en 24 h, sur n'importe lequel de mes appareils, l'écran pousse « Changer mon mot de passe »** : quelqu'un d'autre détient une session de mon compte (§ 11, « Déni de service »). Pour que l'utilisateur sache quel numéro désigner, **le nouvel appareil affiche le sien** (« Cet appareil : n° 4 ») à l'accueil et pendant l'attente : un libellé est libre (le voleur peut nommer son appareil « iPad de Zoé »), le numéro est celui que l'annuaire a attribué.

**Mémoire des transactions.** Un appareil garde 24 h les `tx` qu'il a vus et refuse une `request` dont le `tx` est déjà connu.

### 4.7 Confirmer et refuser

« Confirmer » désigne le geste qui approuve, selon le rôle : toucher le code juste parmi quatre (répondeur), toucher le bon accusé parmi quatre (initiateur), ou la saisie juste en mode renforcé. « Refuser » désigne une autre option ou un autre accusé touché, une saisie fausse, ou « Aucun ne correspond ».

- **Confirmer** sur un appareil :
  1. il épingle LOCALEMENT la génération pair `(deviceId, registrationId, identityKey)` tirée du descripteur AUTHENTIFIÉ, dans la même transaction de la base scellée — une épingle, pas une entrée du registre. **Il ne signe son approbation du pair qu'à l'ouverture du `ledger(verified)` de celui-ci**, preuve que le pair a confirmé aussi, avec `fromSeq` = `head` + 1 (§ 6.1, § 6.5) ; l'initiateur (celui qui rejoint) la signe en approbation de PARRAINAGE (`sponsor: true`) et adopte ainsi la vue du répondeur ;
  2. il ouvre, si besoin, une session libsignal vers le pair depuis son bundle ; `isTrustedIdentity` refuse un bundle dont la clé n'est pas celle qui vient d'être épinglée (substitution APRÈS la comparaison : rien ne part, alerte) ;
  3. il envoie au pair `ledger(verified)` par le canal libsignal (§ 6.5) ;
  4. il relance le rattrapage de ses enveloppes reportées (spec 2026-10-23 § 3.5) et de son canal de synchronisation.
- **Refuser** : rien n'est épinglé. `cancel(user-mismatch)` part vers le pair. L'écran dit « Les codes ne correspondent pas. Rien n'a été approuvé. » et l'appareil consigne un événement de sécurité local (horodatage, génération pair) que l'écran « Mes appareils chiffrés » montre.
- **Jamais** : épingler avant le geste ; rendre un code avant d'avoir ouvert l'engagement ; afficher l'accusé avant le bon toucher ; réutiliser un aléa ou un `tx` ; accepter un second `accept` dans une transaction ; signer une approbation avant les DEUX confirmations (§ 6.1) ; ranger ou relayer une entrée dont la signature n'a pas été vérifiée (§ 6.2).

### 4.8 Règles de validation à la réception (refus = `cancel(unexpected-message)` sauf mention)

- `v == 1`, sinon `cancel(unsupported)` ; `type` connu ; champs en trop refusés (schéma strict) ; aucun champ dont le nom évoque une clé privée (`containsPrivateKeyField`).
- `from.userId` égal à mon compte, en minuscules (§ 4.1) ; `from` différent de moi (place, génération et clé) ; pour `request` et `accept`, `from.deviceId`/`from.registrationId` égaux à `relayedFrom`.
- **Tout message d'une transaction autre que `request` et `accept` doit venir de la génération pair de cette transaction, telle que le relais l'a vérifiée (`relayedFrom`) ; sinon il est ignoré : pas de `cancel`, aucun échec compté.** Le `cancel(accepted-elsewhere)` que le relais substitue à une copie en attente porte en `relayedFrom` la génération de l'initiateur.
- Clé d'identité : 33 octets, `0x05` en tête, base64 canonique. Aléas et engagement : 32 octets ; `tx` : 16 octets ; libellé : § 4.1.
- **Plateforme** dans l'énumération du § 4.1. Une génération de plateforme inconnue (ligne d'annuaire hors schéma, `platform: "unknown"`) ne peut ni demander ni répondre : elle se réenrôle (le réenrôlement déclare la plateforme) avant toute comparaison.
- **Cohérence avec l'annuaire** (hygiène, pas sécurité) : la clé du descripteur doit être celle que `GET /e2ee/devices` sert pour cette génération (§ 5.5). Sinon `cancel(key-mismatch)` et alerte, sans compter d'échec (§ 4.6). La sécurité, elle, vient de la comparaison des codes.
- **L'appareil qui reçoit une `request` ne peut y répondre que s'il est enrôlé, non révoqué, et si son registre approuve au moins un autre appareil que lui-même. Un appareil en attente ne répond à aucune demande ; il ne fait qu'initier.** « Approuve au moins un autre appareil » se lit : il est MEMBRE (§ 6.1) ; le premier appareil du compte (racine) est membre seul et répond au deuxième (Arb. 5).

### 4.9 Correspondance du code sur les deux écrans (approbation distraite, #13043)

**La menace.** Une invite inattendue sur mon téléphone (« Nouvel appareil, est-ce vous ? ») est exactement la surface de la fatigue d'approbation : l'utilisateur touche le gros bouton pour la faire taire. Avec « Identiques », un toucher réflexe approuve à coup sûr l'appareil d'un voleur de mot de passe, ou le fantôme d'un serveur actif. Et sur le nouvel appareil, que j'installe en attendant un code, un bouton unique approuve le premier appareil qui a répondu, fût-il celui du voleur (contre-revue, C.7). L'audit web recommandait de faire SAISIR le code ; la décision du porteur fixe un geste par écran.

**Le choix.** Chaque écran demande un geste qui ne peut se faire qu'en REGARDANT l'autre écran :
- le **répondeur** affiche **quatre codes** et la phrase « Touchez le code affiché sur « iPad de Zoé » » ; un seul est le sien ; toucher le code juste confirme, toute autre option ou « Aucun ne correspond » refuse ;
- après le BON toucher, il affiche l'**accusé** : « Touchez « ❤️ 🌙 » sur « iPad de Zoé » » ;
- l'**initiateur** affiche le code, et dessous **quatre accusés** : « Puis touchez ici les deux symboles que votre autre appareil affichera » ; toucher le bon confirme, tout autre ou « Aucun ne correspond » refuse.
C'est la parade que les authentificateurs à notification ont adoptée contre la fatigue d'approbation (« number matching »), appliquée dans les deux sens, et construite pour que l'écran seul ne trahisse rien (Arb. 1).

**Les options : un carré.**
- Le code a sept symboles `s0…s6`. Deux « bits » sont portés par des positions fixes : le bit 1 par `{0, 1}` (symboles entièrement dans le premier nombre), le bit 2 par `{3, 5}` (symboles entièrement dans le deuxième et le troisième nombre). L'accusé suit la même construction sur ses deux symboles (bit 1 = position 0, bit 2 = position 1).
- **Ordre de lecture des octets** du générateur sûr, qui fixe la construction à l'octet près (et que les exemples du § 8 rejouent depuis un flux donné) :
  1. pour chaque position du bit 1, puis du bit 2, par ordre croissant (`0, 1, 3, 5` pour le code ; `0, 1` pour l'accusé) : lire des octets jusqu'au premier `b` < 252 (un octet ≥ 252 est sauté, et le suivant lu : rejet octet par octet, aucun biais), et poser `a_p = (s_p + 1 + (b mod 63)) mod 64` ;
  2. puis lire des octets jusqu'au premier `b` < 240, et prendre `perm` = la permutation n° `b mod 24` de `[0, 1, 2, 3]`, les 24 permutations étant rangées dans l'ordre lexicographique.
- **Les options et l'écran** : `options[0]` = le code ; `options[1]` = le code avec `a_p` aux positions du bit 1 ; `options[2]` = avec `a_p` aux positions du bit 2 ; `options[3]` = avec les deux. **L'écran montre en position `i` (de haut en bas) l'option `options[perm[i]]`** ; le code juste y est en position `perm.indexOf(0)`. Exemple (§ 8, `carre-du-code-vecteur-1`) : permutation n° 19 = `[3, 0, 2, 1]`, le code juste est en 2e position.
- Propriétés (tenues par construction, vérifiées par le générateur et par chaque banc) : les quatre options sont deux à deux distinctes dans les DEUX rendus ; aucun symbole, ni aucun nombre, ne suffit seul à départager les options (chaque symbole et chaque nombre partage ses valeurs deux à deux) ; chaque option partage chaque symbole changeant avec exactement une autre, donc **aucune n'est « la plus typique »** : au vu de l'écran seul, chacune est la bonne avec une probabilité 1/4 (P7). Les options ne sont jamais émises ni journalisées.
- **Les options et la position du code juste sont tirées une seule fois, à l'entrée en `choosing` (l'accusé : à l'entrée en `showing`), et conservées avec la transaction (en mémoire, ou dans la base scellée si la transaction survit à la mort du processus). Tout rendu (emoji, chiffres, taille de texte, rotation, retour au premier plan, restauration) les redessine depuis ces mêmes octets, à la même position. S'ils ne peuvent pas être relus, la transaction est annulée ; ils ne sont jamais retirés au sort.** Une option qui resterait la même quand les autres changent désignerait le code juste à coup sûr (contre-revue, C.2).
- En mode chiffres, la correspondance porte sur les trois nombres (l'accusé : sur son nombre). Une bascule `method` ne redessine pas un écran qui affiche déjà des options (§ 4.3).

**Mode renforcé.** **À partir du premier code affiché sans succès (option ou accusé faux touché, « Aucun ne correspond », annulation ou expiration après l'affichage), et pendant 24 h, toute confirmation faite par CET appareil se fait par SAISIE** :
- répondeur : **l'utilisateur saisit les TROIS nombres affichés sur l'autre appareil (12 chiffres, un champ par nombre) ; l'appareil les compare tous les trois** ; l'écran dit « Sur l'autre appareil, touchez « Comparer en chiffres » » ; puis l'accusé s'affiche en chiffres ;
- initiateur : l'utilisateur saisit le nombre de l'accusé (4 chiffres).
C'est la « confirmation renforcée » de #13043, réservée à l'anomalie : le chemin nominal reste à un geste. Elle borne le serveur actif à UNE tentative à ≈ 2⁻¹² par appareil et par 24 h (§ 3.5) ; un leurre touché sous une bascule forgée ne coûte qu'une saisie, jamais un blocage (le toucher qui suit un changement de rendu est d'ailleurs ignoré, § 4.3).

**Probabilités de succès d'un attaquant, par tentative.**

| Situation | Bouton « Identiques » | Quatre codes et accusé (retenu) |
|---|---|---|
| Homme du milieu (serveur actif), utilisateur qui compare les sept symboles | 2⁻⁴² (2⁻³⁹ en chiffres) | 2⁻⁴² (2⁻³⁹ en chiffres) |
| Homme du milieu, utilisateur qui ne vérifie que ce qui départage les options | 1 s'il ne lit rien ; 2⁻⁶ᵏ s'il lit k symboles | ≈ 2⁻¹² (mesuré 2,45 × 10⁻⁴) en emoji, ≈ 2⁻²⁶ en chiffres ; une fois par appareil et par 24 h |
| (règle des trois codes de la v1, premier symbole distinct) | — | 2⁻⁶ ≈ 1,6 × 10⁻² (mesuré, contre-revue C.1) |
| (règle des trois codes de l'amendement 2 littéral : le code juste est la médiane) | — | 1 pour qui applique « l'option la plus typique » (mesuré, Arb. 1) |
| Mode renforcé, homme du milieu ou saisie au hasard | — | 2⁻³⁹ (trois nombres) |
| Toucher sans regarder, une invite (voleur de mot de passe, ou fantôme d'un serveur actif) | 1 | ≤ 1/4 ; puis saisie pendant 24 h |
| Course du voleur de mot de passe : son appareil a répondu le premier au nouvel appareil, et j'y touche un accusé sans le voir | 1 (« Identiques ») | ≤ 1/4 ; mon appareil en main a reçu `accepted-elsewhere` et alerte ; et même alors, l'appareil du voleur n'entre dans aucun registre que mes autres appareils croient (§ 6.2) |
| Code dicté par téléphone (« touchez les emoji chien, chat… ») | 1 | 1 si l'utilisateur obéit : la friction et l'avertissement ne l'empêchent pas (§ 7.6, § 11) |

**Pourquoi un geste sur chaque écran, et dans cet ordre.** Le répondeur est l'appareil déjà approuvé : sa confirmation se propage à tous mes appareils, et l'invite non sollicitée tombe sur lui. L'initiateur est l'appareil que j'installe : son geste ne compte que pour lui, mais c'est lui qui a choisi le répondeur (le premier venu), et la course du voleur se joue là. L'accusé n'apparaît qu'après le bon toucher sur le répondeur : l'ordre est imposé (le répondeur d'abord), et un nouvel appareil ne peut se confirmer que si l'appareil que j'ai en main vient de le confirmer.

**Pourquoi pas la saisie au chemin nominal.** Saisir 12 chiffres coûte un clavier et treize touchers ; la décision du porteur fixe un geste. La saisie reste la réponse graduée à l'anomalie (mode renforcé), et le geste nominal sous lecteur d'écran (§ 7.3).

**Pourquoi quatre options et pas trois, ni huit** : Arb. 1 (mesures de la simulation de l'amendement, § 10, lot 1a).
---

## 5. Transport par la passerelle

La passerelle reste un relais aveugle : elle ne détient que des clés publiques, ne voit aucun clair du registre, et **aucune de ses vérifications n'est une garantie de sécurité** — ce sont des contrôles d'hygiène qui réduisent le bruit et les abus. Les clients ne fondent aucune décision de sécurité sur un champ que le serveur pose.

### 5.1 Capacité déclarée par appareil

- Champ additif `E2EEDevice.capabilities String[]` (absent = `[]`, lu défensivement : le connecteur MongoDB de Prisma distingue champ absent et champ nul).
- Un client qui sait vérifier et synchroniser déclare `["device-trust-v1"]` à l'enrôlement (`POST /e2ee/devices`, champ additif `capabilities`, ≤ 8 chaînes de ≤ 32 caractères ; une passerelle plus ancienne le retire sans erreur). Un réenrôlement le met à jour : la capacité apparaît avec la mise à jour de l'app.
- La passerelle ne relaie une vérification ou une synchronisation que vers des générations qui la déclarent. Un ancien client ne reçoit donc rien de ce qu'il ne sait pas lire.


### 5.2 Relais des messages de comparaison

**Modèle** (additif, à côté de `MessageEnvelope`, qui n'est pas touché) :

```
model E2EEDeviceVerificationMessage {
  id                       String   @id @default(auto()) @map("_id") @db.ObjectId
  userId                   String   @db.ObjectId
  tx                       String          // base64, 16 octets
  kind                     String          // request | accept | reveal | method | cancel
  senderDeviceId           Int             // relayedFrom : la génération liée à la session émettrice
  senderRegistrationId     Int
  recipientDeviceId        Int
  recipientRegistrationId  Int
  answeredByDeviceId       Int?            // seulement sur un cancel(accepted-elsewhere) substitué par le relais
  answeredByRegistrationId Int?
  body                     String          // le message validé, tel que reçu (≤ 2 Kio)
  createdAt                DateTime @default(now())
  expiresAt                DateTime        // createdAt + 10 min
  ackedAt                  DateTime?       // l'accusé : plus jamais servi (voir la note d'implémentation)
  @@index([userId, recipientDeviceId, recipientRegistrationId, createdAt])
  @@index([userId, tx])
  @@index([expiresAt])
}
```

**Routes** (sous `/api/v1`, même garde d'authentification que `/e2ee/*`, appelant lié à un appareil actif par sa session `sid`) :

| Méthode | Chemin | Rôle |
|---|---|---|
| `POST` | `/e2ee/devices/self/verifications` | `{ to: "others" | { deviceId, registrationId }, message }` ; rend `{ ids, recipients: [{ deviceId, registrationId }] }` |
| `GET` | `/e2ee/devices/self/verifications?after=` | les messages non expirés adressés à la génération de CET appareil, chacun `{ id, relayedFrom, message, answeredBy? }` |
| `POST` | `/e2ee/devices/self/verifications/ack` | `{ ids }` : efface, parmi eux, ceux qui sont adressés à la génération de l'appelant ; les autres sont ignorés |

**Socket** : `e2ee:send-verification` (client → serveur, même charge, accusé `{ success, data | error, code }`) ; `e2ee:verification` (serveur → client, `{ id, relayedFrom, message, answeredBy? }`) vers la room de la génération destinataire `device:<userId>:<deviceId>:<registrationId>`. Une socket y entre par le `sid` de son JWT (`AuthHandler.ts:416`, `joinE2EEDeviceRoom`), et les sockets déjà ouvertes d'une session y entrent à l'enrôlement (`joinSessionSocketsToDeviceRoom`) : aucun changement de handshake, aucun `e2eeDeviceId` déclaré par le client. Une émission perdue ne perd rien : `GET` relit.

**Contrôles** (hygiène : aucun n'est une garantie, § 5) :
- seulement entre appareils du **même compte** : les destinataires se résolvent parmi les appareils ACTIFS de l'appelant ; `to: "others"` = tous ceux qui déclarent `device-trust-v1`, sauf l'émetteur ; une génération nommée doit être active et capable, sinon `409 E2EE_DEVICE_CHANGED` ;
- l'émetteur est la génération liée à la session (`deviceOfSession`) : c'est elle que le relais pose en `relayedFrom` ; pour `request` et `accept`, `from.userId`, `from.deviceId`, `from.registrationId`, `from.identityKey` et `from.platform` doivent être ceux de cette génération dans l'annuaire, et `from.label` doit être le libellé que l'annuaire tient pour elle (absent si l'annuaire n'en a pas) ; une plateforme `unknown` est refusée (réenrôlement d'abord) ;
- **le libellé est validé au relais seulement** (§ 4.1 : scalaires bien formés par `String.prototype.isWellFormed()`, NFC, aucun caractère de contrôle, 1 à 64 unités UTF-16, `""` refusé) et relayé **tel quel**, jamais corrigé ; le schéma d'enrôlement n'est pas touché ;
- schéma Zod strict (tailles et longueurs exactes des champs binaires, base64 canonique, `userId` minuscule), `containsPrivateKeyField` refusé, corps ≤ 2 Kio ; ces schémas refusent tout ce que les clients refusent (négatifs « refus » du § 8) ;
- **débit par génération émettrice : ≤ 4 `request` par heure, ≤ 30 messages par heure ; ≤ 8 ENVOIS par `tx` et par émetteur, un envoi à « others » comptant pour un ; fenêtres glissantes d'une heure. AUCUNE borne par compte** : avec quatre ou cinq appareils enrôlés, le détenteur de mon mot de passe épuisait la borne par compte de la v2 (20 `request`, 120 messages) et privait mon nouvel appareil de toute demande (revue de confirmation). La borne par génération suffit à la charge : un compte a au plus 16 appareils actifs (`E2EE_MAX_ACTIVE_DEVICES`, `packages/shared/types/e2ee-directory.ts:38`), soit au pire 64 `request` et 480 messages par heure ;
- **durée de vie** : 10 min (`expiresAt`), filtrée à la lecture et balayée. **`ack` et le balayage ne touchent que les messages adressés à la génération de l'appelant** (le balayage, ceux qui ont expiré). **Quand une `request` est prise par un répondeur** (le relais transmet un `reveal` pour ce `tx`), **le relais ne fait pas disparaître ses copies en attente : il les remplace par un `cancel(accepted-elsewhere)` qui porte, hors du message, la génération qui a répondu (`answeredBy`)** ; l'appareil qui aurait montré l'invite affiche l'alerte du § 4.6 (« La demande de n° 4 a été acceptée par un autre appareil de votre compte… »). Un `cancel` de l'initiateur remplace de même les copies en attente. Un retrait de génération (`device-retirement.ts`, `takeSlot`) efface ce qui lui était adressé ;
- les journaux ne portent que `tx` tronqué, `kind` et les générations, jamais le corps ni le libellé.

**Note d'implémentation (#19156, passerelle).** L'accusé retire un message de ce qui est servi (`ackedAt`) ; la ligne vit jusqu'à son échéance (dix minutes, balayage toutes les dix minutes), pour que le relais sache à qui une `request` a été adressée quand elle est prise : la copie que l'appareil avait déjà accusée — celle qui lui a fait montrer l'invite — devient elle aussi `cancel(accepted-elsewhere)`, servie de nouveau. Le relais exige une génération NOMMÉE pour `accept`, `reveal` et `method`. Aux débits par génération s'ajoute une cadence par SESSION (`userId:sessionId`), avant toute lecture de l'annuaire (60 dépôts par minute, socket et route), qui ne borne que ce qui est tenté : comptée par compte, une session sans appareil chiffré l'épuisait au détriment du vrai nouvel appareil (audit de la PR #19170). Un dépôt refusé (génération nommée périmée, débit atteint) ne consomme aucun budget : toutes les fenêtres sont lues avant qu'une seule soit débitée, après la lecture des destinataires. Le push de l'annonce part détaché : un fournisseur lent ne retient ni l'enrôlement ni le dépôt.

### 5.3 Annonce temps réel et push

- **L'annonce part de la passerelle, à l'enrôlement, sans attendre le nouvel appareil.** Un intrus qui enrôle un appareil par l'API, avec un client modifié, ne se présentera jamais (GW-04, WEB-18). Dès qu'un enrôlement crée une NOUVELLE génération (`created: true`, place neuve ou reprise par une autre installation), **ou fait revenir une génération qui avait été retirée** (`created: false` après une fin de session : le retour d'une installation déconnectée, § 6.8, contre-revue D.9), la passerelle émet `e2ee:own-device-enrolled { deviceId, registrationId, platform, label, enrolledAt, capabilities, returning }` vers les rooms de mes AUTRES appareils, et envoie le push visible ci-dessous. Au retrait, `e2ee:own-device-retired { deviceId, registrationId }`. Ces données sont celles du serveur : elles déclenchent un affichage (« Un nouvel appareil a rejoint votre compte : n° 5 · « iPhone » · iOS — Ce n'est pas moi / C'est moi », ou « n° 2 « iPhone de Zoé » est de nouveau connecté — Ce n'est pas moi »), jamais une approbation. « C'est moi » guide vers le nouvel appareil, qui initie (§ 4.2) ; s'il n'est pas capable : le QR (iOS) ou « Mettez-le à jour ».
- **Rapprochement, qui ne dépend pas de la présence en ligne.** Au démarrage et à chaque reconnexion, chaque appareil compare `GET /e2ee/devices` (§ 5.5 : génération, plateforme, libellé, date d'enrôlement) à son registre et à la liste des générations qu'il a déjà annoncées (base scellée) : toute génération listée qu'il n'a ni approuvée ni annoncée s'annonce comme si l'événement venait d'arriver. L'événement socket et le push n'en sont que l'accélération. Un intrus enrôlé la nuit, téléphone en veille et navigateur fermé, s'annonce donc au premier réveil de chacun de mes appareils.
- **Regroupement** : annonces et pushes d'enrôlement, au plus 3 par heure et par compte ; les suivants sont regroupés (« 4 nouveaux appareils ont rejoint votre compte »). Un voleur qui retire et réenrôle en boucle n'use pas l'attention que la correspondance des codes cherche à préserver.
- **Temps réel de la confirmation** : la `request` d'un appareil capable part vers la room de chaque génération capable (`e2ee:verification`) ; l'invite qu'elle ouvre remplace l'annonce de la même génération.
- **Push** : un push **visible** de type neuf `e2ee_device_verification`, vers les jetons du compte, au chokepoint `sendToUser`, à l'enrôlement d'une nouvelle génération (ou au retour d'une génération retirée), puis à une `request` seulement si aucun push n'est parti pour cette génération depuis 10 min, et sous le regroupement ci-dessus :
  - titre et corps génériques, dans la langue de CADRAGE du destinataire (`recipientLanguage`, `utils/recipient-language.ts`) : « Nouvel appareil sur votre compte » / « Ouvrez Meeshy pour le confirmer. » ;
  - `data: { type: "e2ee_device_verification", fromDeviceId }` — ni libellé (texte choisi par un éventuel attaquant), ni clé, ni `tx` ; aucun identifiant de regroupement (`thread-id`, `collapseKey`, `tag`) ne porte le libellé (§ 7.6) ;
  - planchers par client dans `PUSH_TYPE_ROUTING_FLOORS` (`services/push-type-routing.ts`, décision `2026-10-25-un-push-de-type-neuf-ne-part-que-vers-les-appareils-qui-savent-l-ouvrir-10267`) : `null` partout tant que le lot client qui route le type n'est pas publié ; chaque lot client pose son plancher dans la même PR. Le rapprochement ci-dessus ne dépend pas de ces planchers ;
  - les jetons ne sont pas reliés à un appareil chiffré tant que `E2EEDevice.pushTokenId` reste vide : l'initiateur reçoit aussi le push et l'ignore (`fromDeviceId` = le sien).
- **Réveil des synchronisations** : un envoi par le canal du § 5.4 avec `wake: true` réutilise le push SILENCIEUX `e2ee_wake` (le même pour tout, il ne nomme rien). Il ne vise aujourd'hui qu'iOS (`e2ee-wake.ts:20`, GW-09) : le lot 2b le route par la plateforme déclarée de l'appareil et par la table des planchers, et le lot Android pose le plancher `android-native` (message FCM de données) dans sa PR. Le web n'a pas de push : il relit à l'ouverture et vit sur la socket tant qu'il est ouvert.
- **Le serveur ne sait pas quels appareils sont approuvés** : annonce et push vont à tous mes appareils capables, et chacun décide s'il peut agir (§ 4.8).
- **Fermer une session n'est pas retirer un appareil.** Fermer à distance la session d'un appareil qui tient une génération chiffrée (liste des sessions : `DELETE /auth/sessions/:sessionId` et `DELETE /auth/sessions`, `routes/auth/magic-link.ts:710` et `:793` ; côté administration, `DELETE /admin/users/:userId/sessions/:sessionId`) demande d'abord, dans l'application qui la ferme, « Cet appareil est-il perdu ou volé ? » ; « Oui » le RETIRE (pierre tombale posée par l'appareil qui ferme, § 6.6, puis `DELETE /e2ee/devices/:deviceId?registrationId=`) en plus de fermer sa session. La route de session reste inchangée (un ancien client la sert comme avant) : la question est l'affaire de l'écran.
### 5.4 Canal de synchronisation chiffré entre mes appareils

**Un canal dédié, pas les signaux existants (`E2EESignal`).** Quatre raisons, mesurées :
1. le relais des signaux exige une conversation `e2ee` dont l'émetteur est membre (`E2EESignalRelay.ts:100-101`), et un signal porte sa conversation DANS le chiffré, que l'ouvreur vérifie (`belongs(to:)`) : une synchronisation de compte n'a pas de conversation, et en choisir une arbitraire dirait au serveur laquelle ;
2. la loi d'un signal (`E2EESignalAuthority`) juge une action sur un MESSAGE visé ; le registre n'en vise aucun ;
3. Android n'émet ni n'applique aucun signal (AND-03, #13202) : s'appuyer sur eux mettrait la propagation derrière un chantier qui n'est pas le sien ;
4. un canal séparé laisse intact le chemin des conversations, et un ancien client n'en voit rien (§ 5.7).

Ce que chaque plateforme doit écrire pour ce canal, sans rien attendre de #13201 ni de #13202 :

| Pièce | iOS (`MeeshyE2EE` + app) | Android (`:core:e2ee` + `:sdk-core`) | Web (`apps/web`, sur la référence `packages/shared`) |
|---|---|---|---|
| Transport : routes, `e2ee:device-envelope`, rattrapage par curseur PERSISTANT, accusé | `E2EEDirectoryClient`, runtime | `RetrofitE2eeDirectoryClient`, `EndToEndEnvelopeBinding` | client TS partagé, socket |
| Ouverture : genre `d` seulement sur ce canal (et `v`/`s` seulement sur celui des messages, § 6.3), épingle relue dans la transaction, fusion dans la même transaction, génération révoquée ⇒ écartée | `E2EEEnvelopeOpener` | `E2eeEnvelopeOpener` | contrôle de l'approbation AVANT `open` du pont (§ 6.7), puis coffre IndexedDB |
| Scellement vers mes seuls appareils, sans pair | `E2EEMessageSealer` | `E2eeMessageSealer` | façade du pont, `trustIdentity` chargé avant `processPreKeyBundle` |
| Registre (auteur, parrain, rang d'admission, § 6.2), fusion, projection en épingles | `E2EETrustLedger`, `E2EEOwnDeviceApprovals` | `trust/TrustLedger`, `E2eeOwnDeviceApprovals` | `ledger.ts` de la référence |
| Mémoire du régime partagée (§ 6.3) | `EndToEndRegimeLedger` | `EndToEndRegimeLedger.kt` | `end-to-end-regime-ledger.ts` |
| Règles d'émission R1 à R8 (§ 6.4) | app (coordinateur) | runtime `:sdk-core` | app |

**Modèle** :

```
model E2EEOwnDeviceEnvelope {
  id                      String   @id @default(auto()) @map("_id") @db.ObjectId
  syncId                  String   @db.ObjectId
  userId                  String   @db.ObjectId
  recipientDeviceId       Int
  recipientRegistrationId Int
  senderDeviceId          Int
  senderRegistrationId    Int             // la génération émettrice : pierre tombale et épingle s'appliquent par génération
  type                    Int             // 2 = SignalMessage, 3 = PreKeySignalMessage
  body                    String          // chiffré libsignal, base64
  createdAt               DateTime @default(now())
  @@unique([syncId, recipientDeviceId])
  @@index([userId, recipientDeviceId, recipientRegistrationId, createdAt])
  @@index([createdAt])
}
```

**Routes et socket** :

| Méthode / événement | Chemin | Rôle |
|---|---|---|
| `POST` | `/e2ee/devices/self/sync` | `{ protocol: "libsignal-v1", senderDeviceId, envelopes: [{ userId, deviceId, registrationId, type, body }], wake }` ; rend `{ syncId, envelopes }` ; la passerelle y ajoute `senderRegistrationId` (celle de la session) |
| `GET` | `/e2ee/devices/self/sync?after=` | les enveloppes de CETTE génération, par curseur |
| `POST` | `/e2ee/devices/self/sync/ack` | `{ ids }` |
| `e2ee:send-device-sync` | client → serveur | même charge que `POST` |
| `e2ee:device-envelope` | serveur → client | l'enveloppe servie, vers la room de la génération destinataire |

**Admission** (Sesame relâché, spec 2026-10-23 § 3.4) : **`senderDeviceId` doit être la génération liée à la session (`deviceOfSession`), sinon 403 ; chaque destinataire déclare `device-trust-v1`, sinon 409 avec la liste des générations incapables (la passerelle ne relaie un `d` qu'à qui sait le lire, § 5.1) ; `type` ∈ {2, 3}** ; chaque destinataire est un appareil ACTIF de l'appelant, différent de l'émetteur, sans doublon ; une `registrationId` qui ne correspond plus rend `409 E2EE_DEVICES_MISMATCH` avec `stale` (le client efface la session et rescelle) ; les appareils **manquants sont admis** (l'émetteur choisit à qui il écrit : ses seuls appareils approuvés et capables) ; ≤ 15 enveloppes, 64 Kio chacune, 512 Kio au total ; ≤ 120 envois par heure et par appareil.

**Rétention** : 30 jours ; effacement à l'accusé, à la RÉVOCATION de la génération (retrait par le propriétaire) et à la reprise de la place par une autre génération. Une simple fin de session ne l'efface PAS : la même installation peut revenir sous sa génération et doit retrouver ses synchronisations (le défaut GW-13 / AND-21, qui touche aujourd'hui les enveloppes de messages, ne se reproduit pas ici).

**Rattrapage** : l'appareil tient son curseur `after` dans sa base scellée et l'avance au-delà de tout ce qu'il a traité, reports compris. Une enveloppe reportée (expéditeur pas encore approuvé) est inscrite dans un ensemble local avec la valeur du curseur qui la précédait ; un rattrapage ordinaire ne la retélécharge pas. Après un changement du registre qui approuve son expéditeur, l'appareil relit depuis cette valeur. Rien n'est relu à chaque rattrapage (GW-14, IOS-21).

### 5.5 Mes appareils servis avec leur clé publique

`GET /e2ee/devices` ajoute, pour chacun de MES appareils, `identityKey` (publique, la même que celle des bundles) et `capabilities` ; il sert déjà la génération, la plateforme, le libellé et `enrolledAt` (`E2EEDirectory.ownDevices`), dont le rapprochement du § 5.3 a besoin. **Ce paragraphe et le § 5.1 ne dépendent d'aucun défaut relevé par la contre-revue : leur lot peut démarrer tout de suite (§ 10).** Le contact n'y a pas accès (route réservée au propriétaire). Effets : lire la clé d'un de mes appareils ne coûte plus aucune pré-clé unique (aujourd'hui, montrer ou lire un code d'appairage en réserve une EC et une Kyber par appareil examiné : GW-14, IOS-19) ; la cohérence du § 4.8 se lit d'un appel ; l'état « Approuvé » compare la clé épinglée à la clé servie (#13031). Le même ajout dans `GET /e2ee/keys/:userId/devices` (appareils d'un contact) servira les numéros de sécurité par appareil (#12520) ; il n'est pas requis par ce document.


### 5.6 Ce que voit le serveur

| Il voit | Il ne voit pas |
|---|---|
| Qu'un appareil de mon compte demande une confirmation, quand, lequel répond, combien de messages, leur taille | Le registre de confiance, son contenu et ses changements (chiffrés par libsignal, remplis par paliers), ni quel appareil est le parrain de quel autre |
| Les descripteurs (clés publiques déjà dans l'annuaire, plateforme, libellé déjà connu), l'engagement, puis les deux aléas révélés : il peut calculer le code et l'accusé | Quelle option l'utilisateur a touchée, sauf par le `cancel(user-mismatch)` en clair qui suit un refus, et indirectement quand les copies commencent à partir |
| Qu'une synchronisation passe entre deux de mes appareils, sa taille remplie | Quel appareil est approuvé par lequel |
| L'annonce d'un nouvel appareil : il la produit lui-même, à partir de l'annuaire | Si je l'ai reconnu ou retiré, sauf par le retrait qui suit |
| — | Les options affichées sur chaque écran et leur ordre (tirés localement, jamais émis) ; l'état du mode renforcé, sauf ce qu'en trahit un `accept` en chiffres |

### 5.7 Rétrocompatibilité (#9223, #9231)

- **Ancien client, nouvelle passerelle** : il ne déclare aucune capacité, donc ne reçoit ni demande, ni enveloppe de synchronisation (l'admission du § 5.4 refuse en `409` un envoi vers une génération incapable), ni push de type neuf (planchers) ; il ignore les événements socket qu'il ne connaît pas (`e2ee:own-device-enrolled`, `e2ee:own-device-retired`). Aucun client n'écrit un contenu `d` sur le canal des messages (§ 6.3) : un client publié ne le juge donc jamais illisible. Son QR marche comme avant. Ses copies vers un appareil confirmé par code partent dès que cet appareil est aussi approuvé chez lui (QR).
- **Nouveau client, ancienne passerelle** : `capabilities` et `identityKey` absents, routes neuves en 404 ⇒ le client se replie sur le QR (iOS) ou dit « Mettez à jour Meeshy sur vos autres appareils » (Android, web). Rien ne se perd en silence.
- **Version future du contenu `d`** : un champ inconnu est ignoré ; une version supérieure est acquittée sans rien appliquer et l'appareil affiche « Mettez à jour Meeshy » (§ 6.3).
- **Approbations QR existantes** : migrées dans le registre au premier lancement (§ 6.8).
- **Changement de comportement assumé** : une approbation n'est plus effacée parce que l'annuaire ne liste plus l'appareil (`forgetApprovals`, `E2EEOwnDeviceLinking.swift:195`) ; elle reste INERTE (aucune copie ne part vers un appareil non listé) et seule une pierre tombale la retire (§ 6.2). Raison : un effacement ne se représente pas dans un registre qui converge par union, la fusion suivante le ressusciterait ; et une génération qui revient est la même installation, qui détient la même clé (#12593). Trois bornes, que la v1 de ce document n'avait pas : **« Mes appareils chiffrés » liste aussi les générations approuvées que l'annuaire ne sert plus (« Déconnectés, encore approuvés »), chacune avec [Retirer]. La borne de 64 ne compte que les générations listées ; au-delà de 128 approbations inertes, les plus anciennes sont compactées localement (elles demanderont une nouvelle confirmation si elles reviennent). Une approbation dont la place est tenue par une autre génération ne revaut jamais** ; une approbation ne revaut sans confirmation que pour la MÊME génération et la même clé (§ 6.7), et ce retour s'annonce (§ 5.3).
- **Schéma de production** : deux collections et un champ additifs, et des champs additifs dans les deux collections neuves. Leur mise en production suit la règle de promotion de #9223 ; la création d'index en production attend le feu vert du porteur.

---

## 6. Confiance transitive : le registre de confiance

### 6.1 Le registre

Chaque appareil tient, dans sa base scellée (`e2ee.sqlite` sur iOS, coffre transactionnel sur Android, IndexedDB scellée par une clé WebCrypto non extractible sur le web), un **registre** de mes appareils : un ensemble d'**entrées signées**, qui ne fait que croître.

- Une **génération** se désigne par `(deviceId, registrationId, identityKey)`.
- Chaque entrée a un **auteur** (une génération, clé comprise), un **rang** `seq` et une **signature** `sig`. `seq` est le compteur de son auteur : 1 pour son inscription, puis 2, 3… dans l'ordre où il écrit, jamais réutilisé. **Une entrée s'écrit une fois et ne se modifie jamais** : l'auteur la signe à l'écriture, la range avec sa signature, et la transmet toujours telle quelle.
- **Inscription** : `{ deviceId, registrationId, identityKey, approvedAt, approvedBy: (moi), method: "self", seq: 1, sig }`. Chaque appareil s'inscrit à son enrôlement. Elle publie la clé et prouve qu'il la détient ; elle n'approuve personne.
- **Approbation** : `{ deviceId, registrationId, identityKey, approvedAt, approvedBy: { deviceId, registrationId, identityKey }, method, seq, fromSeq?, sponsor?, sig }`, `method` ∈ {`sas`, `qr`, `migrated`, `reattested`}.
  - `fromSeq` (rang d'admission) est **obligatoire** pour `sas`, `qr` et `reattested`, **interdit** pour `self` et `migrated`. Pour `sas` et `qr`, c'est `head` + 1, où `head` est le plus grand rang que le PAIR avait écrit à son geste, qu'il déclare dans son `ledger(verified)` (§ 6.3, § 6.5) : ce que le pair avait écrit avant de rejoindre reste « à confirmer », ce qu'il écrit ensuite compte. `head` est une déclaration du pair : un pair qui la falsifierait est un appareil qui a passé la comparaison, et qui pourrait de toute façon signer ce qu'il veut une fois admis ; pour `reattested`, le `fromSeq` de l'approbation qu'elle remplace (§ 6.6).
  - `sponsor: true` marque l'approbation de **parrainage** : celle que signe l'appareil qui **rejoint** (l'initiateur d'une comparaison par code, ou l'appareil qu'on confirme par QR, § 7.4) pour l'appareil qui l'admet. Seulement avec `sas` ou `qr` ; absent sinon (`false` est refusé).
  - Une approbation est désignée par la génération ET son auteur : `(deviceId, registrationId, identityKey, approvedBy)`. Un auteur approuve une génération une fois ; un doublon de cette identité (auteur fautif, ou la même entrée signée deux fois, § 6.2) garde la plus petite selon l'ordre total.
  - **Une approbation `sas` ou `qr` n'est signée qu'après les DEUX confirmations de sa vérification** (une `migrated` l'est au premier lancement, une `reattested` au geste « Garder », § 6.6) : chaque appareil la signe à l'OUVERTURE du `ledger(verified)` du pair pour cette transaction, qui prouve que le pair a confirmé aussi (§ 4.7, § 6.5). Avant, il n'existe qu'une épingle LOCALE (ce qui permet à libsignal d'ouvrir la session), jamais une entrée : rien de non fixé ne voyage ni ne compte.
- **Pierre tombale** : `{ deviceId, registrationId, identityKey, revokedAt, revokedBy: { deviceId, registrationId, identityKey }, seq, sig }`. Elle vise la **CLÉ** d'identité ; la place et la `registrationId` qu'elle porte disent seulement quelle génération a été retirée. Désignée par `(identityKey, revokedBy)`.
- **Nom réservé** : `accountKey`, au niveau du contenu (future clé de compte, § 6.3). (`sig`, réservé en v2, est désormais OBLIGATOIRE sur chaque entrée.)

**La signature** (XEdDSA de libsignal, par la clé d'identité de l'AUTEUR, 64 octets en base64 canonique). Elle porte sur un encodage binaire à longueurs préfixées, avec les notations du § 4.1 (`LP`, `u32`) et `u64(x)` = 8 octets grand-boutiens (x ≤ 2⁵³ − 1) :

```
gen(g)        = u32(deviceId) ‖ u32(registrationId) ‖ LP(identityKey, 33 octets)
inscription   = LP(utf8("meeshy-device-trust:v1|inscription")) ‖ LP(ascii(userId)) ‖ gen(moi)
                ‖ u64(approvedAt) ‖ u64(seq)
approbation   = LP(utf8("meeshy-device-trust:v1|approval")) ‖ LP(ascii(userId)) ‖ gen(sujet) ‖ gen(auteur)
                ‖ u64(approvedAt) ‖ LP(utf8(method)) ‖ u64(seq) ‖ u64(fromSeq, ou 0 s'il est absent) ‖ u8(sponsor ? 1 : 0)
pierre tombale= LP(utf8("meeshy-device-trust:v1|revocation")) ‖ LP(ascii(userId)) ‖ gen(clé retirée) ‖ gen(auteur)
                ‖ u64(revokedAt) ‖ u64(seq)
```

- `userId` est le compte de l'appareil qui VÉRIFIE (24 caractères hexadécimaux minuscules) : il n'est pas un champ de l'entrée, et une entrée signée pour un autre compte ne se vérifie pas.
- Trois étiquettes, une par genre : une signature d'un genre ne vaut pour aucun autre (vecteur `autre-domaine`, § 8).
- Un champ inconnu n'entre pas dans les octets signés : il est ignoré (§ 6.3).
- Primitives, déjà présentes sur les quatre bancs (relevé du 2026-11-17) :

| Plateforme | Signer | Vérifier | Déjà employé pour |
|---|---|---|---|
| iOS / macOS (`packages/LibSignalClient`, v0.106.2) | `PrivateKey.generateSignature(message:)` (`PrivateKey.swift:50`) | `PublicKey.verifySignature(message:signature:)` (`PublicKey.swift:51`) | la preuve de liaison d'enrôlement |
| Android (`org.signal:libsignal-android` 0.106.2) | `ECPrivateKey.calculateSignature` | `ECPublicKey.verifySignature` | la preuve de liaison (`E2eeDeviceKeyFactory.kt:78`) |
| Web (pont WASM v2, `packages/libsignal-wasm`) | `signWithIdentity(identityKeyPair, message)` | `verifyWithIdentity(identityKey, message, signature)` (rend `false` pour une signature fausse, lève pour une clé indécodable) | la preuve de liaison ; présents sur la branche `claude/nifty-hawking-osab15-web` (commit `d7b4492078`, `lib.rs:436-448`), pas encore dans `dev` |
| Passerelle et vecteurs (`@signalapp/libsignal-client` 0.106.2) | `PrivateKey.sign` | `PublicKey.verify` | la vérification de la preuve de liaison |

XEdDSA est aléatoire : deux signatures des mêmes octets diffèrent, et toutes deux se vérifient. Les vecteurs portent donc des signatures FIXES (§ 8) ; une plateforme vérifie les signatures publiées et prouve sa propre signature par un aller-retour (signer, puis vérifier), jamais par une égalité d'octets.

**Trois situations d'un appareil**, que chacun déduit de son registre (§ 4.2 et § 4.8 les emploient) :
- **racine** : le premier appareil d'un compte (l'annuaire ne listait aucune autre génération active à son enrôlement) tant que son registre ne contient que lui. **Une racine seule qui découvre, au rapprochement (§ 5.3), une génération active enrôlée AVANT elle cesse d'être racine : elle passe en attente et alerte « Le serveur a présenté cet appareil comme le premier de votre compte. Confirmez-le depuis « iPhone de Zoé ». »** Une racine qui a déjà confirmé d'autres appareils garde ses approbations (elles sont les siennes) et alerte de même ; sa comparaison avec l'appareil plus ancien laisse ses entrées antérieures « à confirmer » chez lui (§ 6.2) ;
- **membre** : la racine, ou un appareil dont l'état effectif (§ 6.2) compte au moins un autre appareil que lui ;
- **en attente** : ni l'un ni l'autre. Il n'initie que (§ 4.2).
Le **parrain** d'un appareil est le sujet de l'une de SES approbations `sponsor` : il n'y a pas d'autre état local. Un appareil peut avoir plusieurs parrains (sortie d'une course, § 6.5).

### 6.2 Fusion et état effectif

**Qui peut m'apporter des entrées** (inchangé, § 6.3) : un contenu `d` ne s'ouvre que s'il vient d'un de MES appareils effectifs sous la clé que libsignal authentifie, ou du pair d'une vérification en cours (son `ledger(verified)`). Mais une fois ouvert, **ce qu'il porte vaut par ses signatures, non par celui qui l'a relayé** : aucune provenance n'est tenue, aucun appareil n'est cru « pour lui-même seulement », et aucun relais n'a de privilège.

**Réception d'un contenu** (`ledger`), dans cet ordre :
1. **Forme** : chaque entrée doit être bien formée — générations bien formées (sujet et auteur : `deviceId` dans 1…127, `registrationId` dans 1…16383, clé de 33 octets commençant par `0x05`, base64 canonique), bornes ci-dessous, `method` connue, `self` si et seulement si sujet = auteur et alors `seq` = 1, `fromSeq` présent si et seulement si `method` ∈ {`sas`, `qr`, `reattested`}, `sponsor` absent ou `true` et seulement avec `sas` ou `qr`, `sig` en base64 canonique de 64 octets. **Une seule entrée mal formée fait refuser le contenu entier**, avant toute vérification.
2. **Bornes** : un contenu porte au plus **32 approbations** (toutes méthodes, inscriptions comprises) et **32 pierres tombales** ; un émetteur découpe son registre en autant de contenus qu'il faut (chaque entrée se suffit, l'ordre et le découpage n'y changent rien). **À la réception, au-delà de 32 approbations, on garde les 32 plus petites selon l'ordre total, AVANT toute vérification, et on ignore les autres** (l'écran le signale : « Une partie de la liste de vos appareils n'a pas pu être lue. ») ; **toutes les pierres tombales sont vérifiées et appliquées** (l'enveloppe de 64 Kio les borne à environ deux cents).
3. **Signatures** : chaque entrée gardée se vérifie sous la clé de son AUTEUR, telle que l'entrée la nomme, sur les octets du § 6.1 calculés avec MON compte. **Une seule signature fausse fait refuser le contenu entier** et lever l'alerte « « Pixel 8 » a transmis une entrée dont la signature est fausse. » avec [Retirer « Pixel 8 »] : un appareil honnête ne range jamais une entrée qu'il n'a pas vérifiée, donc n'en relaie jamais. Aucune pierre tombale n'est posée automatiquement (Arb. 4).
4. **Mes propres entrées** ne viennent que de mon magasin. Une entrée dont je suis l'auteur, reçue d'un autre, est ignorée ; si je ne la tiens pas (les mêmes octets signés), l'appareil alerte « Une entrée signée par la clé de cet appareil m'est revenue sans que je l'aie écrite : la clé de cet appareil a peut-être été copiée. » et propose « Réinitialiser le chiffrement ici ».
5. **Union** : chaque entrée vérifiée est rangée ; pour un doublon de la même identité (§ 6.1), on garde la plus petite selon l'ordre total. La signature n'entre dans l'identité qu'en dernier départage : la même entrée reçue sous deux signatures valides reste UNE entrée (cas `doublon-signe-deux-fois-une-seule-entree`).

**Ordre total** (départage des doublons et de la borne) : **approbations : `approvedAt` croissant, puis `approvedBy` (`deviceId`, puis `registrationId`, puis `identityKey` en octets), puis `method` dans l'ordre des octets UTF-8 (`migrated` < `qr` < `reattested` < `sas` < `self`), puis `seq`, puis `fromSeq` (absent = 0), puis `sponsor` (absent d'abord), puis le sujet (`deviceId`, `registrationId`, `identityKey` en octets), puis `sig` (octets). Pierres tombales : `revokedAt`, puis `revokedBy` de même, puis `seq`, puis la génération retirée (`deviceId`, puis `registrationId`, puis `identityKey`), puis `sig`.** Bornes : `approvedAt`, `revokedAt` et `sentAt` entiers de millisecondes dans [0, 2⁵³ − 1] ; `deviceId` dans 1…127 ; `registrationId` dans 1…16383 ; `seq` et `fromSeq` dans [1, 2⁵³ − 1]. La fusion est commutative, associative et idempotente (P5) : chaque cas commun est rejoué dans tous les ordres d'arrivée et en double.

**Pourquoi le rejeu ne peut rien.** Le registre ne fait que croître et ses entrées sont immuables : un contenu ancien rejoué ne retire rien et n'ajoute que ce qui était déjà retenu ; une entrée rejouée est la même entrée. Le compteur `seq`, signé, ordonne les entrées d'un auteur : c'est lui que lit le rang d'admission. **Une révocation l'emporte sur toute approbation de la même clé, plus ancienne ou plus récente, du même auteur ou d'un autre** : une pierre tombale comptée tue la CLÉ pour toujours (pour revenir, l'appareil tire une nouvelle identité) ; le rang ne décide que si la pierre tombale COMPTE (son auteur doit être admis, à un rang ≥ son rang d'admission). Un serveur qui RETIENT une pierre tombale retarde le retrait chez celui qu'il prive (§ 11) ; il ne peut ni la défaire, ni la forger.

**État effectif — calculé depuis soi, sur les seules entrées retenues** (A = les approbations, inscriptions exclues ; T = les pierres tombales) :

```
ancres(M)     = plus petite partie qui contient moi (si clé(moi) ∉ M) et qui, pour toute ancre x,
                contient le sujet de chaque approbation sponsor écrite par x (sujet ≠ x, clé(sujet) ∉ M)
                — mes parrains, leurs parrains… : F = 0, j'adopte la vue de ce que j'ai rejoint
membres(M), F = plus petit point fixe de :
                toute ancre est membre, F = 0 ;
                une approbation a de x COMPTE si auteur(a) est membre, auteur(a) ≠ x, clé(x) ∉ M
                  et seq(a) ≥ F(auteur(a)) ; alors x est membre ;
                pour un membre x qui n'est pas une ancre, F(x) = le plus petit, parmi les approbations
                  de x qui COMPTENT, de leur fromSeq (0 pour une approbation migrated)
admis, F_adm  = membres(∅)                       (pierres tombales ignorées)
comptées      = pierres tombales t dont l'auteur est moi, ou un admis avec seq(t) ≥ F_adm(auteur(t))
mortes        = clés visées par les pierres tombales comptées
effectifs, F  = membres(mortes)
conflits      = places (deviceId, registrationId) qui portent au moins deux clés dans effectifs ;
                s'il y en a, recalculer membres(mortes ∪ ces clés, sauf la mienne)
proposées     = entrées (approbations et pierres tombales) d'un effectif x qui n'est pas une ancre,
                de rang < F(x)
retiré        = clé(moi) ∈ mortes ; alors effectifs = ∅
parrains retirés = sujets de MES approbations sponsor dont la clé est morte
```

Le point fixe est monotone (les membres ne font que s'ajouter, F ne fait que baisser) : il est unique et ne dépend pas de l'ordre de calcul. **« Ajouté par »** (affichage, § 7.5, et attendu des cas communs) : « parrain » pour une ancre autre que moi ; sinon la place (`deviceId:registrationId`) de l'auteur de la plus petite, selon l'ordre total, des approbations de la génération qui comptent.

- **Le rang d'admission ne prend que les approbations qui COMPTENT** (correction de la revue, R-2 et R-5) : une approbation proposée, ou écrite par un auteur retiré, n'abaisse pas F. Les deux F sont nommés : `F_adm` (pierres tombales ignorées) décide quelles pierres tombales comptent ; `F` (après les morts) décide des effectifs et des proposées. Cas `rang-d-admission-non-abaisse-par-une-approbation-proposee`, `F-non-abaisse-par-un-auteur-retire`.
- **Les ancres** : un appareil qui a REJOINT un autre (approbation `sponsor`) en adopte toute la vue, et la vue de ce que celui-ci a rejoint, de proche en proche. C'est ce qui fait que le nouveau fait confiance à tous mes appareils, quel que soit celui qui l'a confirmé (cas `le-filleul-d-un-filleul-fait-confiance-a-la-racine` ; R-6, Arb. 8). **Hors de la chaîne, une approbation `sponsor` est une approbation ordinaire** : son `fromSeq` (1 + la tête du parrain au moment où l'on rejoint) n'ouvre aucune entrée que le parrain aurait écrite avant (cas `approbation-de-parrainage-hors-chaine-ne-blanchit-rien`).
- **Les proposées** : ce qu'un appareil a écrit avant d'être admis dans mon groupe reste PROPOSÉ hors de sa chaîne — non effectif, jamais compté, montré « à confirmer » (§ 7.2). Il ne devient effectif que par une comparaison (code ou QR) avec un appareil effectif. Avec l'amendement 7 (un appareil en attente ne répond pas), le parcours nominal n'en produit aucune : leur présence signe une anomalie (racine fabriquée, course du voleur, groupes séparés), et l'écran la montre.
- **La pierre tombale gagne** : une clé visée par une pierre tombale comptée n'est plus jamais approuvée, quels que soient l'ordre et les rangs. **Une pierre tombale vise la CLÉ** : toute génération qui présente une clé morte est écartée, quelles que soient sa place et sa `registrationId` (cas `cle-revoquee-sous-une-autre-generation`). **Un auteur retiré garde la valeur des pierres tombales qu'il a posées** (on compte celles des ADMIS) : c'est ce qui garde retiré un appareil volé qu'il avait retiré avant d'être retiré lui-même ; le prix en est écrit au § 11 (Arb. 9).
- **Deux clés vivantes pour la même génération ⇒ conflit** : aucune des deux n'est effective, l'écran le signale, et seule une comparaison (code ou QR) avec le vrai appareil le résout (l'appareil qui confirme pose une pierre tombale sur l'autre clé). L'annuaire interdit de reprendre une place sous la `registrationId` d'une autre identité (`E2EEDirectory.ts`, `isBlocked`) : un conflit signe une erreur ou une attaque.
- **Moi-même révoqué** : une pierre tombale comptée sur ma propre clé me fait entrer dans l'état « retiré » (§ 6.6).
- **Bornes locales** : une pierre tombale ne se compacte jamais (elle vise une clé) ; au-delà de 256, l'appareil refuse d'ajouter une approbation et propose « Réinitialiser les appareils chiffrés », jamais de retirer une pierre tombale. Une approbation dont la clé porte une pierre tombale peut être compactée localement (la pierre tombale suffit, et ne tombe jamais) ; au-delà de 128 approbations INERTES (générations que l'annuaire ne sert plus), les plus anciennes sont compactées et redemanderont une confirmation si elles reviennent (§ 5.7). Une approbation dont la place est tenue par une autre génération ne revaut jamais.

**Cas communs** : `trust-ledger-v1.cases.json` (§ 8) : 41 cas, avec leurs attendus écrits à la main, l'ordre total et les vecteurs de signature.
### 6.3 Le contenu chiffré `E2EEDeviceSync`

Un troisième genre de clair libsignal, à côté du message (`v`) et du signal (`s`) : la version se dit sous la clé **`d`**. JSON canonique (clés triées, aucun champ absent écrit), rempli au palier comme les messages et les signaux (`E2EE_PADDING_TIERS`) :

```json
{
  "d": 1,
  "kind": "ledger",
  "reason": "verified",
  "verification": { "method": "sas", "tx": "js9ZfbnKQkUsjRiSP4MDWw==", "peer": { "deviceId": 2, "registrationId": 9054 }, "head": 1 },
  "authorUserId": "6745a1b2c3d4e5f601234567",
  "authorDeviceId": 1,
  "sentAt": 1790000000000,
  "approvals": [ { "approvedAt": 1790000000000, "approvedBy": { "deviceId": 1, "identityKey": "BTrGmcffmEaEo9tzkw0HIJk7IxP4t9WDZDpvSKRpacZr", "registrationId": 4211 }, "deviceId": 1, "identityKey": "BTrGmcffmEaEo9tzkw0HIJk7IxP4t9WDZDpvSKRpacZr", "method": "self", "registrationId": 4211, "seq": 1, "sig": "<64 octets, base64>" } ],
  "revocations": []
}
```

- `kind` ∈ {`ledger`, `ledger-request`, `regime`} ; `reason` (pour `ledger`) ∈ {`verified`, `changed`, `reply`, `requested`} ; `verification` seulement avec `verified` : `method` (`sas` ou `qr`), `tx` (pour `sas`), `peer` (la génération à qui il est adressé), **`head`** : le plus grand rang des entrées que l'émetteur avait écrites à son geste. **Le pair qui l'ouvre signe son approbation de l'émetteur avec `fromSeq` = `head` + 1** (§ 6.5). `verification.sponsor` de la v2 n'existe plus : ce qu'il annonçait se lit dans les entrées signées de l'émetteur (§ 6.5, « course du voleur »).
- **Bornes** : `sentAt`, `approvedAt`, `revokedAt` entiers de millisecondes dans [0, 2⁵³ − 1] ; `seq`, `fromSeq` et `head` dans [1, 2⁵³ − 1] ; un nombre non entier ou hors bornes fait refuser le contenu entier ; **au plus 32 approbations et 32 pierres tombales par contenu** (réception au-delà : § 6.2). Une entrée signée pèse en moyenne 364 octets (approbation) et 338 (pierre tombale) dans les cas communs ; le plafond d'un clair rempli est de 32 904 octets pour quinze destinataires (`e2eePaddingCeiling`, 512 Kio ÷ 15 − 2 048) ; un contenu de 32 approbations et 32 pierres tombales aux champs les plus longs possibles pèse 25 641 octets (mesuré). **Un registre plus grand part en plusieurs contenus** — chaque entrée étant signée et autonome, ni l'ordre ni le découpage ne changent ce qu'ils valent ; un `ledger(verified)` découpé répète sa `verification` dans chaque contenu.
- **`regime` — la mémoire du régime partagée** (proposée par l'audit iOS, § 5.3 B) : `{ "d": 1, "kind": "regime", "batch": "<16 octets base64>", "part": 1, "parts": 3, "entries": [ { "conversationId": "<ObjectId>", "since": 1790000000000, "learnedBy": { "deviceId": 1, "registrationId": 4211, "identityKey": "…" } } ], … }`, **au plus 200 entrées par partie** (une entrée pèse environ 160 octets ; les « 1 000 » de la v2 dépassaient l'enveloppe de 64 Kio). **Chaque entrée de `regime` porte `{ conversationId, since }` (ms, la plus ancienne preuve connue). Les messages `regime` portent `part` et `parts` ; la mémoire d'un nouvel appareil est COMPLÈTE quand toutes les parties d'un même envoi (`batch`) sont reçues, et l'écran « Cet appareil est confirmé » n'apparaît qu'alors.** `learnedBy` est l'appareil qui a VU la conversation chiffrée (R3) ; on ne retient une entrée que de son `learnedBy` ou d'une de mes ancres (§ 6.2). **Les entrées de `regime` ne sont pas signées** : en forger ne peut que marquer chiffrée une conversation qui ne l'est pas (un appareil y refuse alors d'écrire en clair : un déni, jamais une fuite) ; leur signature est une suite (§ 10). Chaque appareil garde déjà les conversations qu'il a vues chiffrées de bout en bout, et ignore ensuite toute rétrogradation servie (#12949 ; `EndToEndRegimeLedger` iOS et Android, `end-to-end-regime-ledger.ts` web). Un nouvel appareil, lui, n'a rien vu : un serveur menteur pourrait lui servir une conversation chiffrée comme si elle était en clair et recevoir ce qu'il y écrit. La fusion est une union (ensemble qui ne fait que croître, comme l'irréversibilité qu'il porte), `since` gardant la plus ancienne valeur. **Un clair d'avant `since` reçu par un nouvel appareil s'affiche « Antérieur au chiffrement, non vérifié sur cet appareil » ; un clair daté d'après `since` reste scellé.** **Tant que la mémoire n'est pas complète**, le comportement est une décision du porteur, ouverte en issue `décision-produit` par le lot 0 : (a) l'appareil n'envoie aucun message en clair dans une conversation qu'il n'a pas créée, le composeur disant « Confirmez cet appareil pour écrire ici » ; ou (b) il envoie, et la fenêtre est écrite au § 11. Recommandation de ce document : (a), fail-closed (#9229). Le serveur sait déjà quelles conversations sont chiffrées : ce message ne lui apprend rien, il l'empêche de mentir.
- **Ouverture** : seulement depuis le canal du § 5.4. **Un clair porte exactement une des trois clés `v`, `s`, `d` (sinon refus). Le canal des messages n'accepte que `v` et `s` ; le canal du § 5.4 que `d`. Un contenu reçu sur le mauvais canal n'est PAS un verdict : la transaction de déchiffrement est annulée (ni ratchet ni pré-clé ne bougent), rien n'est rangé « illisible », l'enveloppe est acquittée et l'événement journalisé. Aucun client n'écrit jamais un `d` sur le canal des messages, et aucun ne l'écrit vers une génération qui n'a pas déclaré `device-trust-v1` : un client publié le jugerait illisible et l'acquitterait (contre-analyse iOS, IOS-04).** L'expéditeur doit être un de MES appareils, **effectif** (§ 6.2) sous la clé que libsignal vient d'authentifier — relu dans la transaction de déchiffrement, comme aujourd'hui (`E2EEEnvelopeOpener.swift:135`) — ou le pair d'une vérification en cours (son `ledger(verified)`) ; sinon l'enveloppe est reportée (elle attend l'approbation) ou, si la clé de l'expéditeur porte une pierre tombale, écartée et acquittée. `authorUserId`/`authorDeviceId` doivent désigner l'expéditeur authentifié.
- **La fusion se fait dans la transaction du déchiffrement** : le ratchet n'avance jamais sans que le registre reçu soit fusionné, et la projection en épingles (§ 6.7) est réécrite dans la même transaction. La vérification des signatures se fait avant (elle ne dépend que du contenu) : un contenu refusé pour une signature fausse est acquitté sans rien ranger.
- **Compatibilité future.** **Un champ inconnu de `E2EEDeviceSync` ou d'une entrée est ignoré, jamais refusé (il n'entre pas dans les octets signés) ; un `d` supérieur à la version connue est acquitté sans rien appliquer, l'appareil affiche « Mettez à jour Meeshy » et envoie `ledger-request` (R6) au premier lancement d'une version qui le lit. Nom RÉSERVÉ dès la v1, absent tant que son lot n'existe pas : `accountKey` (future clé de compte, contre-analyse iOS IOS-02) au niveau du contenu.** Un client qui ne connaît pas une `reason` ou un `kind` ultérieur l'ignore sans rien appliquer. Un client plus ancien ne reçoit jamais ce contenu (canal et capacité).

### 6.4 Quand un appareil émet

**Ce qu'un appareil transmet** : toutes les entrées qu'il retient (vérifiées, § 6.2), découpées en contenus de ≤ 32 approbations et ≤ 32 pierres tombales. Il n'y a plus de « registre transmis » à définir (revue, R-3 et R-4) : rien de non signé n'existe, et le destinataire juge chaque entrée lui-même.

| Règle | Déclencheur | Envoi |
|---|---|---|
| R1 | **Changement local** : approbation signée (à l'ouverture du `ledger(verified)` du pair), révocation, maintien `reattested`, migration | `ledger(changed)` à chaque appareil effectif et capable — et, pour une révocation, une dernière fois à l'appareil révoqué |
| R2 | Confirmation faite ici, par code ou par QR (§ 4.7, § 7.4) | `ledger(verified, { method, tx, peer, head })` au pair seulement : mon registre tel qu'il était à mon geste (il l'ouvrira après sa propre confirmation) |
| R3 | `ledger(verified)` reçu d'un pair, pour une vérification que j'ai confirmée | signer mon approbation du pair (`fromSeq` = `head` + 1 ; `sponsor: true` si c'est moi qui rejoins : initiateur du code, ou appareil confirmé par QR), fusionner, puis R1. **Aucune approbation n'existe avant les DEUX confirmations** |
| R4 | `ledger(changed)` reçu | fusion, puis `ledger(reply)` à l'expéditeur seul (accusé et réparation) |
| R5 | `ledger(reply)` ou `ledger(requested)` reçu | fusion seulement |
| R6 | Démarrage après plus de 7 jours sans registre reçu ; génération de mon compte listée par l'annuaire depuis plus de 10 min et absente de mon registre ; premier lancement d'une version qui lit un `d` jusque-là inconnu | `ledger-request` à mes appareils effectifs ; chacun répond `ledger(requested)` |
| R7 | Une fusion me révoque | état « retiré » (§ 6.6) |
| R8 | Une conversation devient `e2ee` à mes yeux (mode servi, avis d'activation) ; ou R3 | `regime` avec la nouvelle entrée à mes appareils effectifs ; avec R3, l'ensemble complet, en parties, au pair qui vient d'être confirmé |

Toutes les synchronisations d'approbation et de révocation partent avec `wake: true`.

### 6.5 Déroulé après une comparaison réussie

Mon compte a A, B, C, membres ; N est nouveau, EN ATTENTE. Rangs : A a écrit ses entrées jusqu'au rang 3.

1. N et A comparent (§ 4). L'utilisateur touche sur A, parmi quatre, le code que montre N : A épingle N (épingle LOCALE, pas une entrée), affiche l'accusé et envoie `ledger(verified, { tx, head: 3 })` à N : tout son registre, en un ou plusieurs contenus. N n'a pas encore épinglé A : l'enveloppe ATTEND au serveur (report du § 3.5 de la spec 2026-10-23).
2. L'utilisateur touche sur N, parmi quatre, l'accusé que montre A : N épingle A, rattrape son canal et ouvre l'enveloppe de A — preuve que A a confirmé. **N signe alors son approbation de parrainage de A** (`sas`, `seq` 2, `fromSeq` 4, `sponsor: true`) : A devient son ancre, et N adopte la vue de A — B et C, et tout ce que A a rejoint (**le nouveau fait confiance à tous mes appareils approuvés**, quel que soit celui qui l'a confirmé : cas `le-filleul-d-un-filleul-fait-confiance-a-la-racine`). Puis la mémoire du régime que A lui envoie en parties (R8) : toute conversation que mes appareils ont vue chiffrée l'est aussi pour N, quoi que le serveur lui serve. N envoie `ledger(verified, { tx, head: 1 })` à A (son registre à son geste : son inscription) ; « Cet appareil est confirmé » n'apparaît qu'une fois toutes les parties reçues.
3. A ouvre `ledger(verified)` de N — preuve que N a confirmé — et **signe son approbation de N** (`sas`, `seq` 4, `fromSeq` 2). R3 : A envoie `ledger(changed)` à B, C et N.
4. B et C ouvrent le registre de A (ils ont A épinglé) : l'approbation de N, signée par A, compte (A est effectif chez eux) ; N leur est effectif (**mes autres appareils font confiance au nouveau d'eux-mêmes**). Les enveloppes de N qui attendaient chez eux s'ouvrent au rattrapage qui suit. Ils répondent `ledger(reply)` à A. Le registre de N, quand il leur parvient (de N, ou relayé par A : peu importe), n'apporte que ce que N a signé ; son approbation de parrainage de A (rang 2 ≥ `fromSeq` 2) y est une approbation ordinaire.
5. Dès lors, les copies de mes messages partent vers N depuis A, B et C, et vers A, B et C depuis N. L'accusé imposant l'ordre (A d'abord), il n'y a qu'un ordre de confirmation ; la convergence ne dépend pas de l'ordre d'arrivée des messages (§ 6.2).

**La course du voleur (C.7) : bornée à l'appareil qui l'a perdue, et réparée sans nouvelle confirmation.** Si l'appareil P d'un voleur de mot de passe a répondu le premier et que l'utilisateur a touché au hasard le bon accusé sur N (≤ 1/4), N a signé une approbation de parrainage de P (rang 2) et adopté sa vue. Mes autres appareils n'en savent rien : P n'est approuvé par aucun d'eux. L'utilisateur, alerté sur A (« La demande de n° 4 a été acceptée par un autre appareil… », § 4.6), confirme N depuis A (« Réessayer » sur N, dirigé vers A, § 4.6) : N rejoint aussi A (seconde approbation de parrainage, rang 3 : A est sa seconde ancre), et A admet N avec `fromSeq` 3. Chez A, B et C, **l'approbation de P par N, de rang 2 < 3, est PROPOSÉE** : P n'entre dans aucun de leurs registres (cas `course-du-voleur-vue-de-A`). A alerte, à partir de cette entrée signée : « « iPad de Zoé » s'est d'abord confirmé avec n° 5 « iPhone » · iOS, que vos autres appareils ne connaissent pas. Si ce n'est pas le vôtre, retirez-le. » [Retirer n° 5] [C'est le mien]. **L'approbation de N part quand même** (aucune « propagation retenue », dont la v2 ne définissait ni le stockage ni la levée) : N est à moi, l'admettre ne fait entrer P nulle part, et ses entrées postérieures exigent chacune un geste sur N. [Retirer n° 5] pose la pierre tombale de A sur la clé de P ; chez N, elle compte (A est son ancre) : P tombe, et ce qu'il tenait avec lui (cas `sortie-de-course-par-le-retrait-de-P`) — **N garde la vue de A sans nouveau couple de gestes**. [C'est le mien] demande une comparaison avec n° 5 (§ 4).

**Ce que la course coûte encore, et à qui seulement.** D'ici le retrait, N envoie à P les copies de ce qu'il écrit. Et si P avait signé des pierres tombales de mes appareils, elles comptent CHEZ N (P y a été admis) : N ne peut plus faire confiance à ceux-là et doit « Réinitialiser le chiffrement ici » (nouvelle identité, nouvelle confirmation) ; chez A, B et C, P n'est admis nulle part et ces pierres tombales ne comptent pas (cas `pierres-tombales-preventives-du-voleur-bornees-a-N`, `pierres-tombales-preventives-du-voleur-sans-effet-chez-A`). La borne exacte est donc : **le voleur ne gagne, une fois sur quatre au plus, que l'appareil qu'il a capturé, et seulement jusqu'au retrait de son appareil**.

Deux groupes « en attente » ne se rejoignent pas (amendement 7) : un appareil en attente ne répond pas, et ne peut donc confirmer qu'un membre.

### 6.6 Révocation (#13004)

- « Retirer » un appareil X, depuis n'importe lequel de mes appareils effectifs Y : Y signe une pierre tombale sur la **clé** de X, l'envoie (R1) à tous mes appareils effectifs **et une dernière fois à X**, puis appelle `DELETE /e2ee/devices/:deviceId?registrationId=` (retrait du compte, fermeture de sa session, révocation de son identité au serveur, #13013). Si le serveur ment ou refuse, la pierre tombale protège quand même mes copies ; et comme elle vise la clé, elle couvre aussi toute génération future de la même clé (D.3, D.8-1).
- **L'appareil révoqué le sait** : X ouvre l'enveloppe (Y y est encore épinglé), fusionne, se trouve révoqué (R7) : il cesse tout envoi à mes autres appareils, ne garde plus d'épingle effective, et dit « Cet appareil a été retiré de vos appareils chiffrés par « Y ». Il ne reçoit plus vos messages chiffrés. » avec « Réinitialiser le chiffrement ici » (nouvelle identité, puis nouvelle confirmation).
- **Cascade, automatique** : une approbation dont l'auteur est retiré ne compte plus (§ 6.2), et les appareils qui avaient REJOINT X perdent cette ancre, et ce qu'ils ne tenaient que par elle (s'il ne leur reste rien, ils repassent en attente). **La feuille de retrait propose de GARDER, en les confirmant de nouveau par l'appareil qui retire (`method: "reattested"`), les appareils qui ne tenaient que par l'appareil retiré** : chacun est listé, case DÉCOCHÉE, avec la provenance que montre son approbation signée (« confirmé par « X » il y a 3 jours ») ; « Garder » signe une approbation de Y, au même rang d'admission (`fromSeq`) que celle qu'elle remplace. Un appareil volé a pu confirmer celui de l'attaquant : rien ne le garde sans un geste.
- **Ce que X a retiré reste retiré** : une pierre tombale compte si son auteur a été admis (§ 6.2), même retiré depuis. C'est ce qui garde dehors un appareil volé que X avait retiré avant d'être retiré lui-même. Le prix : une clé retirée PUIS volée peut encore signer des pierres tombales, et un appareil en retard qui les relaie les fait compter partout (cas `pierre-tombale-d-un-auteur-retire-compte-encore`) ; il faut pour cela la clé privée extraite de l'appareil ET un serveur complice (la session de X est fermée à son retrait : il ne peut plus rien poster) ; l'effet est un déni (des clés tuées, à réenrôler), jamais une fuite (Arb. 9, § 11).
- **Suivi** : Y note quels appareils ont appliqué la révocation (leur `ledger(reply)` porte la pierre tombale) ; l'écran dit « Retrait appliqué sur 2 appareils sur 3 ». **L'appareil qui n'a pas appliqué la révocation en 24 h est nommé avec le geste « Retirer X depuis cet appareil » : on ouvre l'appareil nommé et on y retire X directement (sa propre pierre tombale ne dépend d'aucun relais).**
- **Après la révocation** : une enveloppe de X (copie ou synchronisation), même ancienne, n'est plus ouverte ; elle est rangée illisible et acquittée.
- **Mémoire du régime** : les entrées que seul X attestait (`learnedBy` = X, aucune autre provenance) et que le serveur sert aujourd'hui en clair sont retirées de la mémoire partagée ; une conversation que l'appareil a lui-même vue chiffrée le reste (#12949). Un appareil compromis ne scelle donc plus à vie toutes mes conversations en clair (R3).
- **Annonces** : chaque approbation et chaque révocation retenues par fusion s'annoncent sur l'appareil qui les reçoit (§ 7.5), retirables d'un geste ; une entrée PROPOSÉE s'annonce comme une anomalie « à confirmer » (§ 6.2, § 7.2) ; une entrée à signature fausse fait refuser son contenu et nomme l'appareil qui l'a transmise (§ 6.2).

### 6.7 Application de l'épingle

Les points d'application d'aujourd'hui ne changent pas de place ; seule leur source change, du magasin `approvedOwnDevice` (une clé par place) vers une **projection du registre** réécrite dans la même transaction que chaque changement :

- **Envoi** (`isTrustedIdentity`, iOS `MeeshySignalProtocolStore.swift:56`, Android `MeeshySignalProtocolStore.kt:51`) : **la clé présentée doit être celle d'une approbation effective de la génération LISTÉE `(deviceId, registrationId)`, et égale à l'`identityKey` que l'annuaire sert pour elle (§ 5.5) ; sinon rien ne part, et l'écran dit « Conflit de clé » ou « En attente de confirmation ». Le scelleur ferme et rouvre une session dont la clé distante diffère de la clé servie, même à `registrationId` égale. Une approbation ne revaut sans confirmation (retour d'une installation, § 6.8) que pour la MÊME génération et la même clé.** Il n'y a plus de « toute génération confondue » : une clé approuvée sous une génération ne vaut pour aucune autre (contre-revue D.8-1, IOSX-09) ;
- **Réception** (`E2EEEnvelopeOpener.swift:123` et `:135`, `E2eeEnvelopeOpener.kt:86` et `:94`) : la clé que libsignal authentifie doit être celle d'une approbation effective de la génération émettrice (`senderDeviceId`, `senderRegistrationId`) ; sinon report (attente) ; pierre tombale sur la clé : écartée ;
- **Scellement** (`E2EEMessageSealer.swift:160`, `E2eeMessageSealer.kt:91`) : un appareil listé reçoit son enveloppe si sa génération `(deviceId, registrationId)` a une approbation effective dont la clé est celle que l'annuaire sert ; sinon il part en `unapprovedOwnDevices` ;
- **Web** : le pont WASM a un magasin d'identités en mémoire qui croit toute clé inconnue. Avant tout envoi vers un de mes appareils, le web charge la clé épinglée par `trustIdentity` (le magasin refuse alors toute autre clé) ; avant toute ouverture d'une enveloppe d'un de mes appareils, il vérifie l'approbation effective SANS déchiffrer ; il ne scelle jamais vers un de mes appareils non approuvé.

### 6.8 Cas limites

| Cas | Ce qui se passe |
|---|---|
| **Rejeu** d'un ancien message de comparaison | Lié à son `tx` (mémoire 24 h, durée de vie 10 min) ; un engagement rejoué sous un autre `tx` ne s'ouvre pas (vecteur N4) |
| **Rejeu** d'une ancienne synchronisation | Refusé par libsignal ; même accepté, les entrées sont signées et immuables, le registre ne fait que croître : un état plus ancien ne retire rien et n'ajoute que ce qui était déjà retenu (§ 6.2) |
| **Entrée forgée** (attribuée à un autre appareil, ou « à mon nom ») | Sa signature ne se vérifie pas sous la clé de l'auteur nommé : le contenu est refusé en entier, l'appareil qui l'a transmis est nommé avec [Retirer] ; aucune pierre tombale automatique (§ 6.2, Arb. 4) |
| **Entrée signée par MA clé que je n'ai pas écrite** | Ignorée ; alerte « la clé de cet appareil a peut-être été copiée » et « Réinitialiser le chiffrement ici » (§ 6.2) |
| **Conflit** (deux clés pour une génération) | § 6.2 : aucune n'est effective, alerte, résolution par une comparaison avec le vrai appareil |
| **Ordre** révocation / approbation | Indifférent : la pierre tombale gagne |
| **Course du voleur** : l'appareil P d'un voleur de mot de passe répond le premier au nouvel appareil N | Mon appareil reçoit `cancel(accepted-elsewhere)` et alerte (§ 4.6) ; [Réessayer] sur N vise alors l'appareil que je désigne (§ 4.6) ; N ne confirme P qu'en touchant au hasard l'accusé que montre P (≤ 1/4, puis saisie) ; si N a confirmé P, P n'entre dans aucun registre de mes autres appareils (son approbation par N y est proposée), la confirmation suivante de N avec un de mes appareils le signale, et [Retirer n° 5] fait tomber P chez N sans nouvelle confirmation (§ 6.5). Ce que P a signé ne compte que chez N |
| **Appareil hors ligne** | Ses enveloppes attendent 30 jours ; au retour, rattrapage, rapprochement de l'annuaire (§ 5.3) puis R6 |
| **Hors ligne plus de 30 jours** | Les synchronisations sont balayées ; R6 au démarrage rapatrie un registre complet ; tant qu'il n'est pas reçu, l'appareil n'envoie qu'aux appareils qu'il approuve déjà |
| **Retour d'une installation** (même génération et même clé après une fin de session, #12593) | Son approbation, restée inerte, revaut ; aucune nouvelle confirmation ; le retour s'annonce sur mes autres appareils (« n° 2 « iPhone de Zoé » est de nouveau connecté — Ce n'est pas moi », § 5.3) |
| **Le serveur omet un de mes appareils de la liste** | L'approbation ne s'efface plus (elle était effacée, IOS-17) : aucune copie ne part vers un appareil non listé ; l'appareil apparaît dans « Déconnectés, encore approuvés », retirable ; rien n'est à refaire s'il réapparaît sous la même génération et la même clé |
| **Intrus enrôlé sans se présenter** (client modifié, GW-04) | L'annonce de la passerelle et le rapprochement à chaque reconnexion (§ 5.3) le montrent sur mes appareils ; sans confirmation il n'est dans aucun registre, ne reçoit aucune de mes copies, et « Ce n'est pas moi » le retire. Ce que mes contacts lui ont scellé entre-temps reste hors de ce lot (§ 11) |
| **Place reprise par une autre installation** | Nouvelle génération : en attente, jamais héritée (#12543) ; l'ancienne approbation de la place ne revaut jamais |
| **Clé servie ≠ clé épinglée** | Rien ne part vers cette génération, alerte « Le serveur présente une autre clé pour « X » » ; le scelleur rouvre la session (§ 6.7) |
| **Premier appareil** | Racine : registre `{ moi, self }` ; aucune confirmation demandée ; il répond au deuxième appareil (§ 4.8). Racine fabriquée par un serveur qui cache mes autres appareils : seule, elle repasse en attente dès que le rapprochement montre une génération active plus ancienne ; sinon ses entrées antérieures restent « à confirmer » chez les autres (§ 6.1, cas `rang-d-admission-non-abaisse-par-une-approbation-proposee`) |
| **Perte de tous mes autres appareils** | Sur le nouvel appareil : « Je n'ai plus mes autres appareils » ⇒ confirmation explicite ⇒ retrait au serveur de chacun (`DELETE`, session fermée) et pierres tombales sur leurs clés. Le nouvel appareil devient racine, seul dans son registre. L'historique chiffré antérieur n'y est pas lisible (spec 2026-10-23 § 4.5). Rien n'est approuvé chez lui sans comparaison : un serveur malveillant ne gagne rien à ce chemin ; la mémoire du régime y est vide, d'où la décision du § 6.3. **Le même geste, fait par le détenteur de mon mot de passe depuis son appareil, retire mes appareils AU SERVEUR** (`DELETE /e2ee/devices/:deviceId`, ouvert à toute session du compte, `routes/e2ee.ts:158`) : ses pierres tombales ne comptent nulle part (il n'est admis chez aucun de mes appareils), mais mes appareils sont déconnectés et doivent se réenrôler ; c'est un déni par le détenteur du mot de passe, écrit au § 11 avec sa conduite |
| **Déconnexion simple** (fermer une session) | Ne révoque pas, mais **fermer à distance la session d'un appareil qui tient une génération chiffrée demande « Cet appareil est-il perdu ou volé ? » ; « Oui » le RETIRE (pierre tombale, § 6.6) en plus de fermer sa session** (§ 5.3). « Retirer cet appareil » reste l'acte de révocation |
| **Migration des approbations QR** | Au premier lancement, avant toute autre écriture : chaque approbation existante devient `method: "migrated"`, signée par moi (auteur), sans `fromSeq` ni `sponsor` (rangs 2, 3… juste après l'inscription) ; une approbation sans `registrationId` reçoit celle de la génération listée si la clé servie (§ 5.5) est la clé épinglée, sinon elle tombe (une nouvelle comparaison la refera) ; puis R1 si au moins une approbation existait. Un appareil qui avait des approbations QR est membre : ses approbations migrées rendent effectifs mes autres appareils, et y comptent pour 0 (tout l'historique du sujet) : l'appariement QR, appareils en main, précède le registre (P6, § 11) |
| **Compromission d'un appareil approuvé** | Il signe ce qu'il veut : il peut confirmer un appareil de l'attaquant (propagé partout), retirer mes vrais appareils (déni de service), lire tout ce qu'il reçoit. C'est inhérent à « une approbation suffit » et aucune signature ne l'empêche. Bornes : annonces sur tous mes appareils, approbation signée qui le nomme, cascade automatique à son retrait (ses approbations cessent de compter, ses parrainages cessent d'ancrer) ; ses pierres tombales gardent leur valeur (§ 6.6) ; hors modèle (§ 11) |

---

## 7. Expérience

### 7.1 Parcours nominal

| Écran | Gestes | Ce que voit l'utilisateur |
|---|---|---|
| **A** (appareil en main, répondeur), en premier | **2** : toucher l'annonce (push ou bannière) ; toucher, parmi quatre, le code que montre N | **La feuille s'ouvre sur un état d'attente (« Calcul du code… ») ; les quatre codes apparaissent ensemble, jamais l'un après l'autre (un code juste rendu avant les autres le désignerait).** Après le bon toucher : « Touchez « ❤️ 🌙 » sur « iPad de Zoé » » |
| **N** (nouvel appareil, initiateur), ensuite | **1** : toucher, parmi quatre, l'accusé que montre A | « Confirmez cet appareil » ; « En attente de votre autre appareil… » ; le code dès que A l'ouvre, sous « Code pour n° 1 · « iPhone de Zoé » · iOS », avec « Touchez ce code sur votre autre appareil. Il vous montrera deux symboles : touchez-les ici. » et les quatre accusés ; « Cet appareil est confirmé » une fois la mémoire du régime complète (§ 6.3) |
| **B, C** (mes autres appareils) | **0** | Une annonce discrète : « « iPad de Zoé » a été ajouté par « iPhone de Zoé » », avec « Ce n'est pas moi » |

### 7.2 États et textes (fr ; les sept langues du catalogue suivent)

**Nouvel appareil (N)**

| État | Texte |
|---|---|
| Accueil | « Confirmez cet appareil » — « Cet appareil : n° 4 » — « Ouvrez Meeshy sur un autre de vos appareils, puis touchez-y le code affiché ici. » Liste « Vos appareils » (numéro, libellé et plateforme servis), les incapables marqués « à mettre à jour » |
| En attente | « En attente de votre autre appareil… » |
| Aucun appareil ouvert | « Aucun de vos appareils n'est ouvert. La demande les attend dix minutes. » [Renvoyer] |
| Aucun appareil capable | « Vos autres appareils doivent être mis à jour pour confirmer celui-ci par un code. » [Utiliser un QR code] (iOS) |
| Code | « Code pour n° 1 · « iPhone de Zoé » · iOS » (le numéro d'abord) ; le code ; « Touchez ce code sur votre autre appareil. Il vous montrera deux symboles : touchez-les ici. » ; quatre accusés ; [Aucun ne correspond] — « Comparer en chiffres » ; un toucher dans les 1,5 s qui suivent un changement de rendu est ignoré |
| Mode renforcé | « Saisissez le nombre affiché sur « iPhone de Zoé ». » (4 chiffres) |
| Confirmé ici, pas encore partout | « Confirmation en cours : récupération de vos conversations chiffrées… » (mémoire du régime incomplète, § 6.3) |
| Confirmé | « Cet appareil est confirmé. Vos messages chiffrés y arrivent. » |
| Codes différents | « Les codes ne correspondent pas. Rien n'a été approuvé. Pendant 24 h, vous saisirez le code au lieu de le toucher. » [Réessayer] — « Si cela se reproduit, quelqu'un tente peut-être de s'interposer. Utilisez le QR code. » |
| Deux réponses | « Deux appareils ont répondu à cette demande : l'un d'eux n'est peut-être pas à vous. Rien n'a été approuvé. » [Réessayer] : « Choisissez l'appareil que vous avez en main », la liste par numéro, puis une demande à lui seul (§ 4.6) ; dès la deuxième course en 24 h : [Changer mon mot de passe] |
| Expiré | « La demande a expiré. » [Recommencer] |
| Annulé ailleurs | « La confirmation a été annulée sur l'autre appareil. » |
| Limite | « Trop d'essais avec cet appareil. Réessayez demain ou utilisez le QR code. » |
| Trop de codes | « Plusieurs tentatives de confirmation en peu de temps. Réessayez plus tard, ou retirez les appareils que vous ne reconnaissez pas. » |
| Échanges altérés | « Les échanges avec « iPhone de Zoé » semblent modifiés en chemin. » [Réessayer plus tard] [Utiliser un QR code] (iOS) |
| Parrain retiré | « L'appareil qui avait confirmé celui-ci a été retiré. Confirmez de nouveau cet appareil depuis un autre de vos appareils. » |
| Actions secondaires | « Utiliser un QR code » (iOS) · « Je n'ai plus mes autres appareils » · « Plus tard » |
| Bandeau après « Plus tard » | « Confirmez cet appareil pour lire ici ce que vous écrivez ailleurs. » |

**Appareil qui approuve (A)**

| État | Texte |
|---|---|
| Push | « Nouvel appareil sur votre compte » / « Ouvrez Meeshy pour le confirmer. » |
| Annonce sans demande (§ 5.3) | « Un nouvel appareil a rejoint votre compte : n° 5 · « iPhone » · iOS. » [Ce n'est pas moi] [C'est moi] ; « C'est moi » : « Sur cet appareil, touchez « Confirmer cet appareil ». » |
| Retour d'un appareil déconnecté | « n° 2 « iPhone de Zoé » est de nouveau connecté. » [Ce n'est pas moi] |
| Feuille | Titre « Est-ce votre appareil ? » ; ligne « n° 4 · « iPad de Zoé » · iOS · inscrit à 14:02 » (le numéro d'abord, #13043) ; « Calcul du code… », puis « Touchez le code affiché sur « iPad de Zoé » » ; quatre codes ; [Aucun ne correspond] ; lien « Ce n'est pas moi » ; « N'approuvez que l'appareil que vous avez en main. Meeshy ne vous demandera jamais de code par message ni par téléphone. » |
| Bon code touché | « Touchez « ❤️ 🌙 » sur « iPad de Zoé ». » (l'accusé) |
| Mauvais code touché | « Ce n'était pas le code de l'autre appareil. Rien n'a été approuvé. Pendant 24 h, vous saisirez le code au lieu de le toucher. » [Réessayer] [Ce n'est pas moi] |
| Mode renforcé | « Sur l'autre appareil, touchez « Comparer en chiffres ». » puis « Saisissez les trois nombres affichés sur « iPad de Zoé ». » (trois champs de 4 chiffres) |
| Acceptée ailleurs | « La demande de n° 4 a été acceptée par un autre appareil de votre compte. Si ce n'était pas vous, retirez l'appareil que vous ne reconnaissez pas. » ; mes appareils en attente, chacun avec [Retirer] ; « Sur n° 4, touchez « Réessayer » et choisissez cet appareil » ; dès la deuxième course en 24 h : [Changer mon mot de passe] |
| S'est d'abord confirmé ailleurs (§ 6.5 ; tiré de l'approbation de parrainage signée, proposée) | « « iPad de Zoé » s'est d'abord confirmé avec n° 5 « iPhone » · iOS, que vos autres appareils ne connaissent pas. Si ce n'est pas le vôtre, retirez-le. » [Retirer n° 5] [C'est le mien] |
| Entrées à confirmer (§ 6.2) | « « iPhone de Zoé » avait approuvé n° 9 « iPhone » avant d'être confirmé ici. » [Confirmer] (une comparaison avec n° 9) ; le retrait n'est pas à côté : il se fait depuis la fiche de n° 9, pour qu'un geste réflexe ne retire jamais un vrai appareil |
| Racine fabriquée (§ 6.1) | « Le serveur a présenté cet appareil comme le premier de votre compte, mais n° 1 « iPhone de Zoé » était déjà là. Confirmez cet appareil depuis « iPhone de Zoé ». » |
| Signature fausse (§ 6.2) | « « Pixel 8 » a transmis une entrée dont la signature est fausse. Rien n'a été appliqué. » [Retirer « Pixel 8 »] |
| Clé copiée (§ 6.2) | « Une entrée signée par la clé de cet appareil m'est revenue sans que je l'aie écrite : la clé de cet appareil a peut-être été copiée. » [Réinitialiser le chiffrement ici] |
| Trop d'invites | « Plusieurs appareils inconnus essaient de rejoindre votre compte. » ; mes appareils en attente, chacun avec [Confirmer] et [Retirer] ; [Changer mon mot de passe] |
| Confirmé | « « iPad de Zoé » est confirmé. Vos autres appareils lui font confiance. » puis « Confirmé sur 3 appareils » |
| Ce n'est pas moi | « Retirer cet appareil de votre compte ? Il sera déconnecté. Changez votre mot de passe si vous ne l'avez pas ajouté. » [Retirer] [Annuler] |
| Cet appareil en attente | « Cet appareil n'est pas encore confirmé : il ne peut pas en confirmer un autre. Confirmez-le d'abord depuis un de vos appareils. » |

**Autres** : appareil révoqué (§ 6.6) ; alerte de sécurité « Une confirmation a échoué avec « X ». Si ce n'était pas vous, retirez cet appareil. » ; entrée à confirmer (ci-dessus) ; retrait en retard « « Pixel 8 » n'a pas encore appliqué le retrait de « X ». Ouvrez-le et touchez « Retirer X depuis cet appareil ». » ; fermeture de session « Cet appareil est-il perdu ou volé ? » [Oui, le retirer] [Non, seulement le déconnecter] ; registre hors bornes « Une partie de la liste de vos appareils n'a pas pu être lue. »

### 7.3 Accessibilité

- Chaque symbole a un nom dans la langue de l'appareil, tiré de la table (`sas-emoji-v1.json`) : VoiceOver et TalkBack lisent « 1 sur 7 : Parapluie », et le groupe « Code : Parapluie, Ballon, Chat, Panda, Banane, Ciseaux, Punaise ». Le web pose `role="group"` et un `aria-label` équivalent.
- **Comparer en chiffres** : indépendant de la langue (deux appareils dans deux langues différentes donnent deux noms différents pour le même symbole). Les chiffres se lisent chiffre par chiffre (« 5 8 4 8, 1 2 8 9, 4 9 5 1 »). Le geste envoie `method` : un écran qui n'affiche encore rien bascule ; un écran qui affiche déjà des options propose « Afficher en chiffres » (§ 4.3).
- **Ordre imposé de gauche à droite** pour les symboles et les groupes de chiffres, y compris en arabe (`layoutDirection` gauche → droite sur iOS, `LocalLayoutDirection` sur Android, `dir="ltr"` sur le web).
- Taille de texte : une rangée de 7 quand elle tient, sinon 4 puis 3, dans le même ordre ; chaque case porte son rang.
- Cibles ≥ 44 pt ; « Aucun ne correspond » a la taille d'une option et n'est caché derrière rien. Retour haptique à l'apparition du code ; aucune animation quand « Réduire les animations » est actif.
- Chez le répondeur, chaque option est UN élément accessible (« Option 2 sur 4 : Parapluie, Ballon, Chat, Panda, Banane, Ciseaux, Punaise »), suivie de « Aucun ne correspond » ; de même pour les quatre accusés de l'initiateur. Les options ont la même taille, dans une colonne, et l'option juste n'a aucune marque visuelle ni sonore qui la distingue. **L'ordre de focus suit l'ordre visuel ; aucun identifiant d'accessibilité, `testTag`, `data-testid`, trait ni libellé ne distingue l'option juste ; les quatre options sont annoncées ensemble (aucune région vive n'en annonce une seule). Quand un lecteur d'écran est actif, la feuille ouvre en chiffres et propose la saisie (mode renforcé) comme geste nominal.**

### 7.4 Le QR, dernier recours

- **Le QR reste le seul chemin qui authentifie hors du relais** : contre un serveur qui substitue les clés à chaque essai, ou un voleur qui gagne chaque course, c'est lui qui débloque l'ajout. Il doit donc exister partout.
- **Rôles et registre** : l'appareil qu'on confirme (« Confirmer cet appareil ») REJOINT, celui qui confirme (feuille de l'appareil, « Autres méthodes ») ADMET. Après la lecture, chacun envoie `ledger(verified, { method: "qr", peer, head })` à l'autre par libsignal (§ 6.4, R2) et signe à son ouverture son approbation `qr`, avec `fromSeq` = `head` + 1 — `sponsor: true` pour celui qui rejoint. Une approbation par QR se propage (R1) comme une autre, et n'ouvre pas plus qu'elle ce que le pair avait écrit avant (la v2 la comptait pour 0).
- **iOS** : la lecture de QR existante (`E2EEOwnDeviceLinking`) reste, sous « Autres méthodes » dans la feuille de l'appareil, et proposée après la limite d'essais, après des échanges altérés, après une course, ou quand l'autre appareil n'est pas capable.
- **Android** : #13016 redéfinie entre DANS le jalon du lot 5 (pas après) : lire et montrer le QR, mêmes rôles, même registre.
- **Web** : le navigateur AFFICHE un QR (aucune caméra n'est requise) que le téléphone lit : le téléphone épingle hors relais la clé du navigateur, et le navigateur confirme par la saisie de l'accusé que le téléphone affiche alors (4 chiffres). Issue à ouvrir par le lot 0, dans le jalon du lot 6.

### 7.5 Annonces et liste des appareils

- Une approbation ou une révocation retenue par fusion s'annonce : « « iPad de Zoé » a été ajouté par « iPhone de Zoé » » — retirable d'un geste (« Ce n'est pas moi » ouvre la feuille de retrait) (#13004). Une entrée PROPOSÉE s'annonce « à confirmer » (§ 7.2), jamais avec un retrait à un geste.
- « Mes appareils chiffrés » : « Cet appareil » · « Confirmé · par « iPhone de Zoé » · il y a 2 min » · « En attente de confirmation » [Confirmer] · « Conflit de clé, à vérifier » · **« Déconnectés, encore approuvés »**, chacun avec [Retirer] · « Retrait appliqué sur 2 appareils sur 3 », et l'appareil en retard nommé avec « Retirer X depuis cet appareil ».
- Le retour d'une installation déconnectée s'annonce (§ 5.3) ; fermer à distance la session d'un appareil chiffré demande s'il est perdu ou volé (§ 6.8).
- Le bandeau du fil (#13034) qui dit qu'une copie attend un de mes appareils mène à la confirmation de cet appareil.

### 7.6 Hameçonnage (#13043)

- Une feuille de confirmation ne s'ouvre que pour une demande ENTRANTE ; aucun écran n'invite à « approuver un code reçu ».
- L'appareil qui répond fait toucher le code de l'autre écran parmi quatre, et l'écran seul ne désigne aucune option (§ 4.9) : un toucher réflexe n'approuve plus à coup sûr, tout code affiché sans succès fait saisir le code pendant 24 h, et au-delà de deux invites inconnues par jour il ne montre plus de code. Le nouvel appareil fait toucher l'accusé que seul l'appareil en main affiche.
- Tout nouvel appareil est annoncé par la passerelle dès son enrôlement, qu'il se présente ou non, et chaque appareil rapproche l'annuaire à chaque reconnexion (§ 5.3) : un intrus muni de mon mot de passe se voit sur mes appareils avant toute invite.
- Le libellé d'un appareil est un texte choisi par celui qui l'a enrôlé, peut-être un attaquant : **il n'apparaît dans aucune notification, distante ou locale, ni dans aucun identifiant de regroupement (`thread-id`, `collapseKey`, `tag`) ; seulement dans l'app, entre guillemets, tronqué (32 caractères affichés), après le numéro et la plateforme.**
- L'avertissement de la feuille (§ 7.2) et l'annonce sur tous mes appareils (§ 7.5) sont les parades ; elles réduisent l'hameçonnage par téléphone (« lisez-moi le code »), elles ne l'empêchent pas (§ 11).
- Le chemin QR garde la confirmation renforcée que #13043 demande (appareil inscrit depuis peu).

---

## 8. Vecteurs de test communs

**Fichiers** (posés par le lot 0 dans `packages/shared/fixtures/e2ee-device-verification/`, générés par `packages/shared/scripts/generate-device-verification-vectors.mjs`, décrits par le `README.md` du dossier) :

- `sas-v1.vectors.json` : `primitives` (les formules, dont l'ordre de lecture des octets du carré, § 4.9), `rfc5869` (annexe A, cas 1 et 3), `vectors` (entrées → descripteurs en hexadécimal, engagement, SHA-256 de la transcription, sortie HKDF de 8 octets, octets du code, indices et symboles, noms dans les sept langues, chiffres, accusé, et les messages `request`/`accept`/`reveal` tels qu'ils voyagent, avec `relayedFrom`), `properties`, `negatives`, `options` ;
- `sas-emoji-v1.json` : la table des 64 symboles (`number`, `emoji`, `unicode`, `names` en fr, en, es, de, it, pt-BR, ar), avec sa source, son empreinte SHA-256 (`2b4defb276d61f11cb9cbfb0ba326b96a8dbd9e768e6bc53fa0f565cd598e887`), la mention de sa modification et sa licence ;
- `LICENSE-sas-emoji.txt` : le texte complet d'Apache-2.0, copié du dépôt amont (§ 4.5) ;
- `trust-ledger-v1.cases.json` (**lot 0b, pas encore versé** : il attend la contre-relecture du § 6 v3) : `signing` (l'encodage signé du § 6.1), identités des entrées, bornes, `account`, `testKeys` (cinq clés de TEST : étiquette de la graine, clé publique, clé privée CLAMPÉE), `signatures` (7 vecteurs positifs — inscription, approbations `sas`, de parrainage, `qr`, `migrated`, `reattested`, pierre tombale — chacun avec ses octets signés en hexadécimal et une signature FIXE ; 9 négatifs : clé d'un autre appareil, octet signé modifié, parrainage ajouté, `fromSeq` abaissé, autre domaine, autre compte, octet de signature retourné, signature de 63 octets, base64 non canonique), **ordre total de départage** (listes mélangées d'approbations et de pierres tombales, et leur ordre attendu, dont le départage par `deviceId` de la génération retirée), les **42 cas communs** (situation locale : compte, génération, racine ; contenus reçus ; attendus : effectifs avec « ajouté par », conflits, `revokedSelf`, `sponsorsRevoked`, proposées, contenus refusés, approbations au-delà des bornes, alertes « clé copiée »), et `signatureIndex` (chaque signature du fichier par signataire et SHA-256 des octets signés : le script les reprend, une plateforme peut y contrôler son encodage) ;
- `upstream/matrix-sas-emoji.json`, `upstream/LICENSE`, `upstream/NOTICE.md` : la table AMONT de matrix-spec (Apache-2.0, 72 Kio, SHA-256 `2b4defb2…e887`), son texte de licence et l'avis de provenance, versés pour que le script tourne en CI sans réseau (revue de confirmation, recommandée).

**Oracle.** Comparaison : `node:crypto` ; RFC 5869 A.1 et A.3 rejoués d'abord par trois chemins, chaque code recalculé par WebCrypto et par un HKDF recomposé sur HMAC. Registre : les entrées sont signées par `@signalapp/libsignal-client` (déjà résolu par `packages/shared`, comme pour `generate-libsignal-vectors.mjs`) avec les clés de TEST ; **XEdDSA étant aléatoire, le script REPREND les signatures déjà publiées dans le fichier (par `signatureIndex`) quand elles se vérifient, et ne signe que ce qui est nouveau : il régénère donc les quatre fichiers à l'octet près** (vérifié : trois exécutions successives identiques). Il écrit à la main les attendus du registre, rejoue chaque cas dans tous les ordres d'arrivée et en double, vérifie chaque signature, et s'arrête au premier écart. **`--check`** régénère dans un dossier temporaire et compare à l'octet aux fichiers versés : c'est le témoin de CI du lot 0. Clés de TEST (graines tirées d'étiquettes publiques, jamais réutilisées).

**Contre-vérification indépendante** (faite à la rédaction ; scripts et journaux joints à #18906) :
- les codes, sorties HKDF, accusés et engagements ont été retrouvés par une implémentation Python de SHA-256, HMAC et HKDF écrite à la main (contre-revue A.2), et de nouveau par la revue de confirmation ; la v3 ne change aucun de ces octets (seul le texte de `primitives.options` change) ;
- les octets signés de chaque entrée sont recalculés en Python depuis le TEXTE du § 6.1 : identiques aux `signedHex` des 16 vecteurs ;
- chaque signature (181 triplets clé, octets, signature) est vérifiée par le **pont libsignal WASM du web** (`verifyWithIdentity`, construction de la branche `claude/nifty-hawking-osab15-web`) : un binaire compilé d'une autre façon que celui de Node. Les 7 positifs se vérifient, les 7 négatifs « invalide » échouent, les 2 « refus-forme » sont refusés ; dans l'autre sens, une signature produite par le pont se vérifie sous Node ;
- un évaluateur Python écrit depuis le TEXTE du § 6.2, sans lire le générateur, rend les attendus des **42 cas, dans tous les ordres d'arrivée et avec chaque contenu en double** (345 rejeux).

**Vecteurs nominaux** (compte `6745a1b2c3d4e5f601234567`) — les codes de la v1 de ce document sont inchangés (L = 8 ne modifie pas les 6 premiers octets) :

| # | Nom | Initiateur → répondeur | Code (hex) | Emoji | Chiffres | Accusé |
|---|---|---|---|---|---|---|
| 1 | `ios-nouveau-android-approuve` | iPhone n° 1 (4211, « iPhone de Zoé ») → Pixel n° 2 (9054) | `9780485edff4` | ☂️ ⚽ 🐱 🐼 🍌 ✂️ 📌 (Parapluie, Ballon, Chat, Panda, Banane, Ciseaux, Punaise) | 5848 1289 4951 | `754c` ❤️ 🌙 (Cœur, Lune) · 4753 |
| 2 | `web-nouveau-ios-approuve` | Navigateur n° 3 (15022, « Navigateur — Mac de Zoé ») → iPhone n° 1 | `9b244f18549f` | ⌛ 🏁 🌵 🌷 🐘 🐷 🍄 | 5964 5412 4114 | `c32f` 🔨 🏁 · 7245 |
| 3 | `android-nouveau-web-approuve` | Pixel n° 2 → Navigateur n° 3 | `9dc4da3f0181` | ⏰ 🎂 🌏 🌽 🌷 🔨 🐘 | 6048 5968 9064 | `e2dc` ⚽ ✂️ · 8259 |
| 4 | `ipad-sans-libelle-ios-approuve` | iPad n° 4 (1, libellé OMIS : le descripteur finit par `00000000`, le champ est absent du fil) → iPhone n° 1 | `de830b801cdf` | 🏆 🎁 🐟 🐢 🎩 🐱 🚂 | 8120 4118 1014 | `f19f` ⚓ 🍓 · 8731 |

Vecteur 1 en détail : engagement `GkC3ozQLweKVHnDTvaLb2Hc47zIHyCzSsRhkL2KAIgs=`, SHA-256(T) `ab559894333f879418e2e11cd42d21deb072f6e96edf39b8865ece05677f26e1`, sortie HKDF `9780485edff4754c`, indices `[37, 56, 1, 8, 23, 45, 63]`, accusé `[29, 20]`.

**Propriétés de la fonction** (un champ change ⇒ le code change ; calculées avec les VRAIS aléas, ce qu'un serveur ne peut pas faire) :

| Nom | Attendu |
|---|---|
| `libelle-entre-dans-le-code` (ex-N2) | code `bef552b9449e` ≠ vecteur 1 : le libellé entre dans le code |
| `inversion-des-roles` (mêmes appareils, mêmes aléas, rôles échangés : `T` et l'IKM changent d'ordre) | code `02b3e9849433` ≠ vecteur 1 |

**Vecteurs négatifs** :

| # | Nom | Attendu |
|---|---|---|
| N1 | `cle-du-repondeur-substituee` (homme du milieu, mêmes aléas) | code `59262699baa3` (🔥 🍄 🍎 ⌛ ⌛ 🍕 📕) ≠ vecteur 1 : « codes différents » |
| N1-u | `userId-du-repondeur-substitue` | code `54b2a21a9b62` ≠ vecteur 1 ; à la réception, un `from.userId` qui n'est pas mon compte est refusé avant tout code |
| N1-d | `deviceId-du-repondeur-substitue` | code `d43f7b626a28` ≠ vecteur 1 |
| N1-r | `registrationId-du-repondeur-substitue` | code `0c6bdbc0b59d` ≠ vecteur 1 |
| N1-p | `platform-du-repondeur-substituee` | code `755cf8089a17` ≠ vecteur 1 |
| N2-bis | `libelle-altere-dans-request` (« Support Meeshy » réécrit par le relais) | `cancel(commitment-mismatch)` avant tout code : l'engagement recalculé sur la `request` reçue ne s'ouvre pas |
| N3 | `revelation-qui-n-ouvre-pas-l-engagement` | `cancel(commitment-mismatch)` avant tout code |
| N4 | `engagement-rejoue-sous-un-autre-tx` | `cancel(commitment-mismatch)` |
| N5 | `userId-majuscules-refuse` (ex-vecteur 5) | refus (`unexpected-message`) : le `userId` voyage en minuscules, rien ne le normalise |
| N6 | `cle-de-34-octets-refusee`, `cle-de-type-inconnu-refusee` (`0x06`), `cle-en-base64-avec-blanc-refusee` | refus |
| N7 | `alea-de-31-octets-refuse`, `alea-en-base64-non-canonique-refuse` (mêmes octets décodés, bits de remplissage non nuls) | refus |
| N8 | `libelle-a-demi-paire-refuse` (`"iPhone \ud83d"`), `libelle-vide-refuse` (`""`), `libelle-non-nfc-refuse` | refus |
| N9 | `plateforme-inconnue-refusee` (`unknown`) | refus ; la génération se réenrôle avant toute comparaison |

**Options en carré** (§ 4.9) — exemples déterministes, à partir d'octets fixés (`streamHex`), pour que les quatre plateformes construisent les options à l'identique : `carre-du-code-vecteur-1` (autres symboles `{0: 38, 1: 37, 3: 5, 5: 39}`, permutation n° 19 = `[3, 0, 2, 1]`, code juste en 2e position) et `carre-de-l-accuse-vecteur-1` (`{0: 19, 1: 2}`, permutation n° 7 = `[1, 0, 3, 2]`, accusé juste en 2e position). Chaque exemple donne les quatre options rendues (indices, emoji, noms, chiffres) ; le générateur y vérifie : options distinctes dans les deux rendus, aucun symbole ni aucun nombre seul ne départage. Le tirage réel vient du générateur sûr de l'appareil ; ses propriétés statistiques se testent au § 9 (2 bis).

**Cas communs du registre** (`trust-ledger-v1.cases.json`, 42 cas). Ceux de la v2, sur entrées signées : `propagation-par-un-appareil-effectif`, `la-revocation-gagne-quel-que-soit-l-ordre`, `deux-cles-pour-une-generation-conflit`, `conflit-resolu-par-pierre-tombale`, `nouvelle-generation-sur-la-meme-place`, `doublon-garde-la-plus-petite-approbation`, `pierre-tombale-de-moi-meme`, `approbations-ex-aequo-departagees`, `horodatage-hors-borne-refuse`, `inscription-self-ne-masque-pas-l-approbation`, `cle-revoquee-sous-une-autre-generation`, `approbation-d-un-auteur-revoque`, `entree-anterieure-a-l-admission-reste-proposee`, `parrain-retire-ce-qu-il-tenait-tombe` (ex-`parrain-revoque-ses-relais-tombent`), `revocation-retenue-n-ouvre-rien-ailleurs`, `pierre-tombale-d-un-auteur-jamais-admis-sans-effet`, `registre-au-dela-des-bornes` (32 par contenu), `champ-inconnu-ignore`. Ceux de la revue de confirmation, chacun avec son résultat v2 dans sa description : `a-mon-nom-forgee-par-le-parrain-refusee`, `a-mon-nom-retransmise-refusee`, `pierre-tombale-a-mon-nom-refusee` (R-1), `rang-d-admission-non-abaisse-par-une-approbation-proposee` (R-2), `relais-de-second-rang-ne-transmet-rien-de-forge` (R-3), `approbation-sas-sans-fromSeq-refusee` (R-4), `F-non-abaisse-par-un-auteur-retire` (R-5) ; et `le-filleul-d-un-filleul-fait-confiance-a-la-racine` (R-6, trouvé en écrivant la v3). La signature : `entree-signee-relayee-par-un-tiers-compte`, `attribution-forgee-refusee`, `signature-absente-refusee`, `signature-d-une-autre-cle-refusee`, `signature-d-un-autre-compte-refusee`, `signature-sur-un-autre-domaine-refusee`, `doublon-signe-deux-fois-une-seule-entree`, `cle-copiee-entree-a-mon-nom-valide`. La course et le parrainage : `course-du-voleur-vue-de-A`, `course-du-voleur-vue-de-N`, `sortie-de-course-par-le-retrait-de-P`, `pierres-tombales-preventives-du-voleur-bornees-a-N`, `pierres-tombales-preventives-du-voleur-sans-effet-chez-A`, `approbation-de-parrainage-hors-chaine-ne-blanchit-rien`, `le-filleul-adopte-la-vue-de-son-parrain`. Et la limite écrite au § 11 : `pierre-tombale-d-un-auteur-retire-compte-encore`. Chaque banc vérifie aussi que l'issue ne dépend ni de l'ordre d'arrivée des contenus ni de leurs doublons, et rejoue l'ordre total.

**Avant / après, sur les cas de la revue de confirmation** (rejoués par l'évaluateur indépendant de la revue ; « sans signature » = sa variante corrigée, qui applique les corrections 1 et 2 sans signature) :

| Constat | v2 (texte et générateur) | Corrections 1-2 sans signature | v3 (entrées signées) |
|---|---|---|---|
| R-1, vue du filleul N | P2 effectif | P2 écarté, alerte | contenu refusé (signature de P sous le nom de N) ; P2 absent |
| R-1, vue d'un membre A | P2 (ou P) effectif | **P2 effectif** (la règle tient chez l'émetteur, pas au récepteur) | contenu refusé ; P2 et P absents |
| R-1, pierre tombale « de N » sur A | A retiré | **A retiré** | contenu refusé ; A intact |
| R-2, racine fabriquée | P2 effectif | P2 proposé | P2 absent, trois entrées « à confirmer » |
| R-3, filleul d'un filleul | P2 effectif ; la pierre tombale forgée « de A » sur B compte | **P2 effectif** | contenu forgé refusé ; P2 absent, B effectif, P mort (vraie pierre tombale de A) |
| R-4, approbation sans `fromSeq` | P2 effectif chez B | non modélisé | contenu refusé (forme) |
| R-5, F abaissé par un auteur retiré | texte : P2 effectif ; générateur : proposé | proposé | proposé ; texte et générateur identiques (évaluateur indépendant) |

**Ce qui n'a pas de vecteur** : le tirage aléatoire lui-même (les exemples ci-dessus fixent seulement la construction à partir d'octets donnés), la signature d'une plateforme (aléatoire : chaque banc la prouve par un aller-retour, signer puis vérifier, et vérifie les signatures FIXES publiées), les minuteries et les plafonds (§ 9.2), le comportement de l'utilisateur (§ 9, 2 bis).

**Rejeu par plateforme** (par chemin relatif, comme `libsignal/cross-platform.vectors.json`) : référence TypeScript `packages/shared` ; passerelle (les messages `wire` passent ses schémas Zod, et ses schémas refusent chaque négatif « refus ») ; SDK iOS `MeeshySDKTests/E2EE/DeviceVerificationVectorTests` ; Android `:core:e2ee` `DeviceVerificationVectorsTest` (JVM nue) ; web `apps/web/src/lib/e2ee/device-verification/*.test.ts` (bun, puis Chromium, WebKit et Firefox). **Chaque banc rejoue d'abord RFC 5869 A.1 et A.3, puis les vecteurs de signature** (octets signés recalculés égaux à `signedHex` ; 7 signatures publiées vérifiées ; 7 négatives refusées par la vérification, 2 par la forme ; une signature produite sur place se vérifie). Un témoin par plateforme compare les 64 × 7 noms de son catalogue à `sas-emoji-v1.json`, et un autre vérifie que l'écran ou la page de licences tierces de l'application cite la table et le texte Apache-2.0 (§ 4.5).

---

## 9. Tests et recette

1. **Vecteurs** (§ 8) sur les quatre bancs, RFC 5869 d'abord ; chaque banc prouve son ROUGE en altérant un octet d'entrée.
2. **Machine à états** : chaque transition du § 4.6, minuteries (dont l'expiration de `prompted`), collision (`superseded` seulement dans la file), `accepted-elsewhere` et son alerte, double `accept` (annulation en `showing`, retrait de l'épingle en `confirmed-local`), messages d'un tiers à la transaction ignorés, limite d'essais (seuls les échecs décidés comptent), mémoire des `tx`, plafond des invites non sollicitées (jamais appliqué à une demande sollicitée). **Un code ne change jamais sans geste** : un relais simulé qui forge en boucle `cancel`, `accept` et `request` n'obtient jamais plus d'un code affiché par geste, ni plus de 5 par heure et 10 par 24 h ; une bascule `method` reçue ne redessine pas des options affichées ; un toucher dans les 1,5 s qui suivent un changement de rendu est ignoré.
2 bis. **Correspondance du code** (§ 4.9) : sur 30 000 tirages, la position du code juste est uniforme (χ² à 3 degrés de liberté, seuil 1 % = 11,34) ; les quatre options sont distinctes dans les deux rendus ; aucune position seule et aucun nombre seul ne les départagent ; l'heuristique « l'option la plus semblable aux autres » trouve le code juste dans 25 % ± 1 % des cas ; deux rendus successifs de la même transaction (bascule, rotation, taille de texte, arrière-plan puis premier plan, mort puis restauration du processus) montrent les mêmes options aux mêmes places, et une transaction dont les options ne peuvent être relues est annulée ; tout code affiché sans succès fait saisir les trois nombres pendant 24 h, et la saisie compare les trois ; les options et leur position n'apparaissent dans aucun journal, identifiant d'accessibilité, `testTag`/`data-testid`, analytique ni rapport de plantage. **Essai d'utilisabilité consigné dans l'issue du lot 4** : au moins dix personnes, nombre de symboles comparés, durée, taux d'erreur honnête avec le carré (et, pour comparaison, avec trois options) ; s'il le permet, le cube à huit options est réexaminé (Arb. 1).
2 ter. **Annonce** : un enrôlement fait par l'API seule (client de test qui ne se présente pas) produit `e2ee:own-device-enrolled` vers les rooms de mes autres appareils et le push `e2ee_device_verification` (charge assertée valeur par valeur : ni libellé, ni clé, ni identifiant de regroupement qui le porte) ; le retour d'une installation dont la génération avait été retirée s'annonce (`returning: true`) ; au-delà de 3 annonces par heure, elles se regroupent ; **un enrôlement fait pendant que l'appareil témoin est hors ligne s'annonce à sa reconnexion** (rapprochement).
2 quater. **Registre** : les 42 cas communs ; et, dans la référence du lot 1, une **simulation multi-appareils tirée au hasard** (5 à 16 appareils, comparaisons, courses, révocations, contenus perdus, retardés, dupliqués, réordonnés, relais forgés) qui vérifie à chaque pas P2 à P10 du § 11 : fusion commutative, associative, idempotente ; la pierre tombale gagne ; rien de ce qu'un appareil a écrit avant son admission ne compte hors de sa chaîne de parrainage ; après un retrait, rien ne tient par ce que l'appareil retiré a signé ; aucune entrée ne compte sans la signature de son auteur ; aucune approbation n'existe avant les deux confirmations. **Signatures** : sur chaque plateforme, un contenu dont une entrée porte une signature fausse (autre clé, autre compte, autre domaine, octet modifié) est refusé en entier, et rien n'en est rangé ; une signature produite sur place se vérifie sur les trois autres bancs (§ 9.5).
3. **Homme du milieu simulé** (référence TS) : un relais adverse substitue clé, descripteur ou aléas ; sur 10 000 exécutions, aucune paire de codes identiques n'est affichée (au seuil près de 2⁻⁴²), et toute révélation forgée est refusée avant le code. Un utilisateur simulé « juste assez » face au carré, sous les règles du § 4.6, approuve le fantôme avec une fréquence compatible avec ≈ 2⁻¹² par appareil et par 24 h, jamais davantage.
4. **Deux appareils sur la vraie passerelle** (Node, `@signalapp/libsignal-client`) : demande, acceptation, révélation, code touché parmi quatre, accusé touché, échange `ledger(verified)` par libsignal, propagation à un troisième appareil qui épingle le nouveau sans geste, puis révocation apprise par l'appareil révoqué. **Course du voleur** : un troisième appareil de test répond le premier ; l'appareil en main reçoit `cancel(accepted-elsewhere)` avec `answeredBy` et alerte ; un accusé touché au hasard sur le nouvel appareil n'aboutit qu'une fois sur quatre ; s'il aboutit, [Réessayer] dirigé vers un membre aboutit, ce membre admet le nouvel appareil sans que l'appareil de test n'entre chez aucun autre, alerte « s'est d'abord confirmé avec n° … », et [Retirer] libère le nouvel appareil sans nouvelle confirmation. **Aucun octet du registre en clair** : le JSON canonique du registre et les sous-chaînes `"kind":"ledger"` et `"kind":"regime"` sont absents de MongoDB (toutes collections), Redis, des journaux capturés et des charges push.
5. **Croisé** : un `E2EEDeviceSync` scellé sur iOS s'ouvre sur Android et sur le web, et l'inverse (extension des vecteurs croisés libsignal) ; une entrée signée sur iOS se vérifie sur Android, sur le web (pont WASM) et dans Node, et l'inverse (fichier `trust-ledger/signed-by/<plateforme>.json`, comme `libsignal/sealed-by/`) ; un `d` reçu sur le canal des messages n'est jamais un verdict.
6. **Recette staging** : iPhone (simulateur), Android (appareil), Chrome. Le navigateur se confirme depuis l'iPhone ; puis l'Android depuis le navigateur : l'iPhone fait confiance à l'Android sans geste ; un message écrit sur l'Android se lit sur les deux autres. Retrait du navigateur depuis l'Android : l'iPhone l'apprend, le navigateur le dit et cesse d'envoyer. Une option fausse touchée sur l'iPhone fait saisir les trois nombres à la tentative suivante. Un enrôlement fait par l'API seule s'annonce sur les trois, y compris sur celui qui était hors ligne. Fermer la session d'un appareil chiffré demande s'il est perdu ou volé. Un ancien build dans le compte : aucune invite, QR intact. **Un passage VoiceOver et un passage TalkBack sur la feuille à quatre codes** (focus dans l'ordre visuel, options annoncées ensemble, ouverture en chiffres et saisie proposée). Prolonge #12977 et #12782.
7. Agent `auditeur-adversarial` sur chaque lot avant fusion ; revue externe et modèle formel avant la production (§ 11).

---

## 10. Lots, dans l'ordre de dépendance

| Lot | Titre d'issue (le résultat) | Dépend de | Peut démarrer |
|---|---|---|---|
| 2-0 | La passerelle sert la clé publique et les capacités de mes appareils, sans réserver de pré-clé, et accepte la capacité déclarée à l'enrôlement | — | **tout de suite** (§ 5.1, § 5.5 : indépendants de tout constat des deux revues) |
| 0a | La comparaison d'un appareil par code court a sa spécification, ses vecteurs communs et une table d'emoji sous licence, régénérables en CI | — (corrections 8 à 11 portées) | **tout de suite** ; fusion après `auditeur-adversarial` (#9226) |
| 1a | Le code à confirmer, l'accusé et leurs options en carré ont une référence TypeScript que les vecteurs communs tiennent | 0a | dès 0a |
| 0b | Le registre de confiance a ses entrées signées, sa sémantique et ses 42 cas communs, contre-relus | contre-relecture du § 6 v3 par `auditeur-adversarial` | dès cette contre-relecture |
| 1b | Le registre de confiance signé a une référence TypeScript que les cas communs et une simulation multi-appareils tiennent | 0b | après 0b |
| 2a | La passerelle relaie la confirmation d'un nouvel appareil entre mes seuls appareils, dix minutes au plus, et prévient mes autres appareils | 1a (schémas), 2-0 | après 1a |
| 2b | Mes appareils s'échangent leur registre de confiance chiffré par libsignal, sur un canal qui ne passe par aucune conversation | 1b (schémas), 2-0 | après 1b |
| 3 | Le SDK iOS calcule le code à confirmer et tient un registre de confiance dont chaque entrée est signée par son auteur | 1a, 1b ; contrats de 2a, 2b | après 1b (sa partie comparaison dès 1a) |
| 4 | Sur iOS, un nouvel appareil se confirme par un code touché sur les deux écrans, et mes autres appareils lui font confiance d'eux-mêmes | 3, 2a, 2b | — |
| 5 | Sur Android, j'ajoute mon téléphone à mes appareils chiffrés en confirmant un code, sans scanner — et par QR si le relais est hostile | 1a, 1b, 2a, 2b ; enrôlement libsignal Android (#13015 ou son successeur) ; PAS les signaux (#13202) | — |
| 6 | Dans le navigateur, j'ajoute cet appareil à mes appareils chiffrés en confirmant un code sur mon téléphone — ou par un QR que le téléphone lit | 1a, 1b, 2a, 2b ; pile E2EE web (#10788) ; pont WASM v2 (`signWithIdentity`, `verifyWithIdentity`) fusionné dans `dev` | — |
| 7 | Sur staging, un iPhone, un Android et un navigateur s'ajoutent par code, se font confiance de proche en proche, et un appareil retiré le sait | 4, 5, 6 | — |

**Ce qui démarre tout de suite** : le lot **2-0** (déjà désigné par la revue) ; la partie **comparaison** des lots 0 et 1 (**0a**, puis **1a**) — la revue de confirmation la jugeait tenue et démarrable dès les corrections 8 à 11, qui sont portées (§ 4.9, § 3.5, § 6.2, § 6.3) ; ses octets n'ont pas changé depuis la v2 (vecteurs nominaux, propriétés, négatifs et carrés identiques, seule la formule écrite de `primitives.options` est complétée). **Ce qui attend** : tout ce qui touche au registre (0b, 1b, 2b, puis 3 à 6 pour leur partie registre) attend la contre-relecture du § 6 v3 par `auditeur-adversarial` : la signature des entrées est un changement de conception, et ce document ne se déclare pas relu. 2a dépend des seuls schémas de comparaison (1a) : il démarre dès 1a.

**Le découpage change en un point** : le lot 0 se coupe en 0a (comparaison) et 0b (registre), et le lot 1 en 1a et 1b, pour que la partie déjà tenue n'attende pas la partie neuve. Les frontières des lots 2a à 7 ne bougent pas ; leur contenu suit la v3 (entrées signées, parrainage, bornes, QR sur Android et sur le web).

**Lot 2-0 — passerelle, clés et capacités servies**
- Fichiers : `schema.prisma` (`E2EEDevice.capabilities String[]`, absent = `[]`), `E2EEDirectory.enrollDevice` (champ additif `capabilities`, ≤ 8 chaînes de ≤ 32 caractères ; un réenrôlement le met à jour), `E2EEDirectory.ownDevices` (+ `identityKey`, `capabilities`), schémas `packages/shared/types/e2ee-directory.ts` (champs additifs, optionnels à la lecture), `route-manifest.json` régénéré.
- Critère de fin : `GET /e2ee/devices` sert `identityKey` et `capabilities` pour chacun de MES appareils, et lire la clé d'un de mes appareils ne réserve plus aucune pré-clé (GW-14, IOS-19) ; un ancien client voit des champs en plus et rien en moins ; un contact n'y a pas accès.
- Témoins : réponse assertée champ par champ ; aucune pré-clé consommée par la lecture ; enrôlement sans `capabilities` ⇒ `[]` ; champ absent en base ⇒ `[]` (lecture défensive). Ferme la partie serveur de #13031.

**Lot 0a — partagé : comparaison (documents, vecteurs, générateur en CI)**
- Fichiers : `docs/superpowers/specs/2026-11-17-e2ee-ajout-appareil-par-code.md` (ce document), `services/gateway/decisions/2026-11-17-un-appareil-s-ajoute-par-un-code-a-confirmer.md` (et sa ligne dans `services/gateway/decisions.md`), `packages/shared/fixtures/e2ee-device-verification/{sas-v1.vectors.json, sas-emoji-v1.json, LICENSE-sas-emoji.txt, README.md}`, `packages/shared/fixtures/e2ee-device-verification/upstream/{matrix-sas-emoji.json, LICENSE, NOTICE.md}`, `packages/shared/scripts/generate-device-verification-vectors.mjs`, un témoin `packages/shared/__tests__/ci/device-verification-vectors-regenerate.test.ts` (lance `--check`).
- Critère de fin : `node packages/shared/scripts/generate-device-verification-vectors.mjs --check` passe en CI sans réseau (table amont versée, empreinte vérifiée par le script) ; la table porte la mention de sa modification et le texte Apache-2.0 complet (§ 4.5) ; #13005 fermée comme remplacée (renvoi au § 4), #13004 et #13043 mises à jour (renvoi aux § 6 et 7.6) ; issues ouvertes : la `décision-produit` de la mémoire incomplète (§ 6.3), le QR affiché par le navigateur (§ 7.4, jalon du lot 6), la liste attestée (§ 11), la signature des entrées de `regime` (§ 6.3), la revue externe et le modèle formel (#3710).
- Témoins : `--check` ; un test qui relit les fichiers et vérifie leur forme ; un test qui vérifie la présence et l'empreinte du texte de licence et de la table amont.

**Lot 0b — partagé : registre signé (vecteurs)**
- Fichiers : `packages/shared/fixtures/e2ee-device-verification/trust-ledger-v1.cases.json` (même générateur, même `--check`), le paragraphe du README qui le décrit.
- Critère de fin : la contre-relecture du § 6 v3 est faite et ses constats portés ; `--check` passe ; les 42 cas, l'ordre total et les 16 vecteurs de signature sont rejoués par la référence (lot 1b).
- Témoins : `--check` ; un test qui vérifie chaque signature publiée avec `@signalapp/libsignal-client` et chaque négatif.

**Lot 1a — référence TypeScript : comparaison**
- Fichiers : `packages/shared/encryption/device-verification/{descriptor.ts, sas.ts, options.ts, messages.ts, emoji.ts}`, `packages/shared/types/e2ee-device-trust.ts` (schémas Zod des messages de comparaison, des charges de route et socket), export par `types/index.ts`, `packages/shared/scripts/measure-device-verification-options.mjs` (la simulation des règles d'options sous homme du milieu qui fonde l'Arb. 1, rejouable).
- Critère de fin : WebCrypto seul (Node 22 et navigateurs) ; RFC 5869 A.1 et A.3, les vecteurs et les carrés passent ; aucun journal ne porte `nonce_I` ni les options.
- Témoins : `__tests__/device-verification-vectors.test.ts`, `__tests__/device-verification-options.test.ts` (§ 9, 2 bis), homme du milieu simulé et utilisateur « juste assez » simulé (§ 9.3).

**Lot 1b — référence TypeScript : registre signé**
- Fichiers : `packages/shared/encryption/device-verification/ledger.ts` (encodage signé du § 6.1, réception en cinq temps et état effectif du § 6.2), `ledger-signature.ts` (un VÉRIFICATEUR INJECTÉ, `(identityKey, message, signature) => boolean` : `@signalapp/libsignal-client` dans Node et la passerelle, `verifyWithIdentity` du pont WASM dans le navigateur ; la référence n'importe aucune bibliothèque de signature), schémas Zod de `E2EEDeviceSync` dans `types/e2ee-device-trust.ts`.
- Critère de fin : les 42 cas, l'ordre total et les vecteurs de signature passent ; la simulation multi-appareils du § 9 (2 quater) tient P2 à P10 sur des scénarios tirés au hasard.
- Témoins : `__tests__/trust-ledger.test.ts`, `__tests__/trust-ledger-signatures.test.ts`, `__tests__/trust-ledger-simulation.test.ts`.

**Lot 2a — passerelle, relais de confirmation**
- Fichiers : `schema.prisma` (`E2EEDeviceVerificationMessage`, avec `answeredBy*`), `services/gateway/src/services/e2ee/E2EEDeviceVerificationRelay.ts`, `routes/e2ee-device-trust.ts`, gestionnaire socket `e2ee:send-verification`, `packages/shared/types/socketio-events/e2ee-event-names.ts` (`e2ee:verification`, `e2ee:send-verification`, `e2ee:own-device-enrolled`, `e2ee:own-device-retired`), annonce branchée sur l'enrôlement (`routes/e2ee.ts`, `onEnrolled` : `created: true`, et retour d'une génération retirée) et sur le retrait (`device-retirement.ts`), regroupement des annonces, `push-type-routing.ts` (type `e2ee_device_verification`, planchers `null`), balayage et nettoyage au retrait, `route-manifest.json` régénéré.
- Critère de fin : § 5.2 et 5.3 ; aucun message entre deux comptes ; adressage par génération (rooms rejointes par `sid`, inchangées) ; `relayedFrom` posé par le relais ; `ack` et balayage bornés à la génération de l'appelant ; copies en attente remplacées par `cancel(accepted-elsewhere)` avec `answeredBy` ; débits par génération et par compte ; libellé contrôlé au relais seulement et égal à celui de l'annuaire ; tout nouvel appareil (et tout retour d'une génération retirée) annoncé ; push sans libellé ni clé.
- Témoins : un autre compte ne reçoit ni ne lit rien ; une génération retirée ne reçoit plus ; `from` incohérent refusé ; chaque négatif « refus » du § 8 refusé par les schémas ; un `ack` d'ids d'une autre génération n'efface rien ; l'appareil d'un intrus n'épuise pas le quota du vrai nouvel appareil ; seize appareils peuvent demander une confirmation ; enrôlement par l'API seule ⇒ annonce et push (§ 9.2 ter) ; charge du push assertée VALEUR par valeur ; gardes `socket-event-*` de `packages/shared/__tests__/ci/`. Ferme la première moitié de GW-04 (« aucune annonce »).

**Lot 2b — passerelle, canal de synchronisation**
- Fichiers : `schema.prisma` (`E2EEOwnDeviceEnvelope`, avec `senderRegistrationId`), `services/gateway/src/services/e2ee/E2EEOwnDeviceSyncRelay.ts`, routes `/e2ee/devices/self/sync*`, socket `e2ee:send-device-sync` et `e2ee:device-envelope`, balayage 30 jours, `e2ee-wake.ts` (réveil par plateforme déclarée et par planchers, GW-09).
- Critère de fin : § 5.4 ; aucune conversation requise ; émetteur = génération de la session (403 sinon) ; destinataires ⊆ mes appareils actifs ET capables (409 avec les générations incapables sinon) ; `type` ∈ {2, 3} ; `409 stale` ; manquants admis ; une fin de session n'efface pas les synchronisations d'une génération qui peut revenir ; test « aucun octet clair » (§ 9.4) avec deux appareils libsignal Node.
- Témoins : un appareil d'un autre compte en destinataire ⇒ 400 ; doublon ⇒ 400 ; `senderDeviceId` d'une autre génération ⇒ 403 ; destinataire sans capacité ⇒ 409 ; rétention ; ancien client (sans capacité) qui ne voit rien sur `GET /e2ee/envelopes`.

**Lot 3 — SDK iOS (`packages/MeeshySDK/Sources/MeeshyE2EE`)**
- Fichiers : `E2EEDeviceVerification.swift` (descripteur, engagement, code et accusé, rendus, options en carré tirées une fois, réducteur pur de la machine à états avec les gestes des deux rôles, mode renforcé), `E2EETrustLedger.swift` (entrées signées : encodage du § 6.1, `PrivateKey.generateSignature` et `PublicKey.verifySignature` ; réception en cinq temps ; ancres de parrainage, rang d'admission, état effectif depuis soi), `E2EEDeviceSync.swift` (contenus `ledger`, `ledger-request`, `regime` en parties, codage canonique, champs inconnus ignorés), `E2EEOwnDeviceApprovals` (projection du registre, épingle par génération LISTÉE et clé servie), `MeeshySignalProtocolStore.isTrustedIdentity`, `E2EEEnvelopeOpener` (genre `d` sur le seul canal du § 5.4, fusion dans la transaction, pierre tombale par clé écartée), `E2EEMessageSealer` (scellement vers mes seuls appareils, réouverture si la clé servie change), `E2EEDirectoryClient` (routes neuves), migration des approbations QR ; retrait de l'effacement `forgetApprovals`.
- Critère de fin : RFC 5869, vecteurs, carrés et cas du registre ; aller-retour à deux magasins en mémoire (code identique, accusé, épinglage croisé, `ledger(verified)` ouvert après la seconde confirmation, propagation à un troisième magasin) ; une clé substituée après la comparaison ne reçoit rien ; une course gagnée par un tiers ne propage rien.
- Témoins : `DeviceVerificationVectorTests`, `DeviceVerificationOptionsTests`, `TrustLedgerCasesTests`, `DeviceVerificationReducerTests`, `OwnDeviceTrustRoundTripTests`.

**Lot 4 — app iOS**
- Fichiers : `apps/ios/Meeshy/Features/Main/Services/E2EE/EndToEndDeviceVerificationCoordinator.swift` (orchestration : quand demander, annonces et rapprochement, invites et leur plafond, minuteries, plafonds de codes, mode renforcé, rattrapage), `EndToEndOwnDeviceTrustSync.swift` (règles R1 à R8, mémoire du régime en parties), vues sous `apps/ios/Meeshy/Features/Settings/Views/EncryptedDevices/` (écran du nouvel appareil avec code et accusés, feuille d'approbation à quatre codes, saisie des trois nombres, provenance, « Déconnectés, encore approuvés », retrait avec maintien, question « perdu ou volé ? » ; QR sous « Autres méthodes »), routage du push `e2ee_device_verification` et plancher iOS posé dans `push-type-routing.ts` (même PR), `Localizable.xcstrings` (sept langues, 64 noms de symboles), écran des licences tierces (table et texte Apache-2.0).
- Critère de fin : parcours du § 7.1 (deux gestes sur A, un sur N) ; tous les états du § 7.2 ; VoiceOver (ouverture en chiffres, saisie), taille de texte, arabe (ordre imposé) ; QR toujours accessible ; bandeau de #13034 ; « Approuvé » comparé à la clé servie (#13031) ; **essai d'utilisabilité consigné (§ 9, 2 bis)** ; `./apps/ios/meeshy.sh test`, gardes de cohésion.
- Témoins : tests du coordinateur (mocks `…Providing`), instantanés des états, témoin des noms de symboles contre la fixture, témoin de la page de licences.

**Lot 5 — Android**
- Fichiers : `apps/android/core/e2ee/src/main/kotlin/me/meeshy/core/e2ee/verification/*` (code, accusé, options en carré, réducteur), `…/trust/*` (registre signé : encodage du § 6.1, `ECPrivateKey.calculateSignature` et `ECPublicKey.verifySignature`, réception, ancres, état effectif), `…/sync/*` (contenus `d`), `store/MeeshySignalProtocolStore.kt` et `store/E2eeLocalRecords.kt` (épingle par génération listée, projection), `open/E2eeEnvelopeOpener.kt` (genre `d`), `seal/E2eeMessageSealer.kt` (vers mes seuls appareils) ; `:sdk-core` (routes, socket `e2ee:verification`, `e2ee:device-envelope`, `e2ee:own-device-enrolled`, rapprochement, push FCM `e2ee_device_verification` et `e2ee_wake`, planchers `android-native`, mémoire du régime partagée) ; écran « Mes appareils chiffrés » (#13014) en Compose (écran du nouvel appareil, feuille à quatre codes, saisie, retrait) ; chaînes dans les sept langues ; écran des licences tierces. **Aucune dépendance au canal des signaux** (#13202, AND-03) : le canal du § 5.4 est le sien.
- Critère de fin : RFC 5869, vecteurs, carrés et cas du registre sur JVM nue ; un iPhone et un Android se confirment par code et se lisent ; TalkBack ; `assembleDebug` et `testDebugUnitTest` verts sur la CI `android.yml` (seul compilateur joignable).
- Témoins : `DeviceVerificationVectorsTest`, `DeviceVerificationOptionsTest`, `TrustLedgerCasesTest`, réducteur, ouverture croisée d'un `E2EEDeviceSync` scellé sur iOS. **#13016 (QR) redéfinie, DANS ce lot** : lire et montrer le QR, mêmes rôles et même registre (§ 7.4) ; c'est le recours d'Android contre un relais hostile ou un voleur qui gagne chaque course.

**Lot 6 — web**
- Fichiers : `apps/web/src/lib/e2ee/device-verification/*` (sur la référence du lot 1 : SHA-256, HMAC et HKDF par WebCrypto, aucune fonction de plus au pont pour comparer), registre, épingles et mémoire du régime dans IndexedDB scellée par une clé WebCrypto non extractible, chargement des épingles par `trustIdentity` avant tout envoi vers un de mes appareils, contrôle avant toute ouverture (§ 6.7), écrans (nouvel appareil, approbation à quatre codes, saisie, liste), page des licences tierces, le pont WASM v2 fusionné dans `dev` (`signWithIdentity`, `verifyWithIdentity` : preuve de liaison de l'enrôlement et signatures du registre, WEB-05) ; le QR AFFICHÉ par le navigateur et lu par le téléphone (§ 7.4), sous son issue, dans le jalon de ce lot.
- Critère de fin : le navigateur se confirme depuis un iPhone et confirme un Android ; le banc des vecteurs passe dans Chromium, WebKit et Firefox (HKDF à sel vide, § 3.3) ; suite web complète et budgets (`on_demand_chunks`) verts.
- Témoins : vecteurs (bun puis navigateurs), réducteur, témoin « jamais de scellement vers un appareil non approuvé », témoin « sans `crypto.subtle`, aucune comparaison ».

**Lot 7 — recette croisée** : § 9.6, comptes de recette sur staging, consignée dans l'issue avec captures et journaux.

**Suites à ouvrir** (issues, pas des lignes de ce document) :
- **la liste d'appareils attestée (dès maintenant, R4)** : mes entrées de registre sont désormais signées par leur auteur ; la passerelle peut les servir à mes contacts, qui ne scelleraient plus qu'aux appareils attestés par un appareil de mon compte qu'ils ont déjà vérifié. Ce qui reste à décider est ce que mes contacts croient, pas comment ils le vérifient : seconde moitié de GW-04, WEB-18 et IOS-02 ; décision du porteur, revue externe ;
- **une autorité de révocation** (`accountKey`, réservé) : une clé de compte qui signerait les révocations fermerait la pierre tombale posthume d'une clé retirée puis volée (§ 6.6, Arb. 9), au prix d'une clé à sauvegarder ; à évaluer, pas à décider ici ;
- **la signature des entrées de `regime`** (§ 6.3) : aujourd'hui une forge n'y produit qu'un déni ;
- la `décision-produit` de la mémoire du régime incomplète (§ 6.3) ; le QR affiché par le navigateur (§ 7.4) ;
- les messages écrits sur un appareil avant sa confirmation rejoignent mes autres appareils après elle ; les enveloppes de MESSAGES d'une génération qui peut revenir survivent à la fin de sa session (GW-13, AND-21 ; le canal du § 5.4 le fait déjà) ;
- revue cryptographique externe de ce protocole et modèle formel des propriétés P1 à P10 (rattachés à #3710) ; réexamen du cube à huit options si l'essai d'utilisabilité le permet.

---
## 11. Hors du modèle de menace, et ce qui exige une revue externe

**Hors modèle** :
- **L'utilisateur qui confirme sans comparer**, ou qui ne compare qu'une partie du code. Sur l'appareil qui répond, la correspondance parmi quatre codes ramène un toucher au hasard à 1/4, l'utilisateur qui lit un seul symbole puis touche au hasard à ≈ 2⁻⁷, et celui qui ne vérifie que ce qui départage les options à ≈ 2⁻¹² par tentative face à un serveur actif ; **ces bornes ne tiennent que parce qu'aucun code ne change sans geste (§ 4.6)**, et le mode renforcé les limite à une tentative par appareil et par 24 h (§ 4.9). Sur le nouvel appareil, toucher au hasard le bon accusé réussit une fois sur quatre. Aucun protocole ne se substitue à l'attention.
- **L'hameçonnage** : quelqu'un qui détient mon mot de passe enrôle un appareil et me dicte « son » code par téléphone. La correspondance, le texte de la feuille et l'annonce sur tous mes appareils réduisent le risque ; ils ne l'empêchent pas.
- **La course du voleur de mot de passe, dans son dernier quart** : pour mes copies, la protection tient, sauf sur un nouvel appareil N dont l'utilisateur touche au hasard le bon accusé (≤ 1/4) quand l'appareil P du voleur a répondu le premier. **N seul est alors capturé** : il adopte la vue de P et lui envoie les copies de ce qu'il écrit, **jusqu'au retrait de P**, qui le libère sans nouvelle confirmation dès que N a rejoint un de mes appareils (§ 6.5). Rien de ce que P signe ne compte chez mes autres appareils (P6, P8) : l'approbation de P par N y reste « à confirmer », et c'est d'elle que vient l'alerte. Si P avait signé des pierres tombales de mes appareils, elles comptent chez N seul, qui doit se réinitialiser (cas `pierres-tombales-preventives-du-voleur-bornees-a-N`). Après une course, [Réessayer] ne vise plus que l'appareil que je désigne (§ 4.6) : la course suivante est impossible.
- **Un appareil approuvé compromis** : il signe ce qu'il veut. Il peut confirmer un appareil de l'attaquant (que tous mes appareils croiront ensuite : c'est le prix de « une seule approbation suffit », et aucune signature ne le change), retirer mes vrais appareils, lire tout ce qu'il reçoit, et grossir les registres de mes appareils d'entrées signées par des clés jetables (un déni de stockage). À son retrait, ses approbations cessent de compter et ses parrainages d'ancrer (P3) ; ce qu'il a lu reste lu.
- **La pierre tombale posthume** : une pierre tombale compte si son auteur a été ADMIS, même retiré depuis — c'est ce qui garde dehors l'appareil volé qu'un appareil avait retiré avant d'être retiré lui-même. Le prix : une clé d'identité retirée PUIS extraite d'un appareil volé peut encore signer des pierres tombales, et un appareil qui n'a pas encore appris le retrait peut les ouvrir et les relayer ; elles comptent alors partout et tuent des clés (cas `pierre-tombale-d-un-auteur-retire-compte-encore`). Il faut pour cela la clé privée ET un serveur complice : à son retrait, la session de l'appareil retiré est fermée et sa génération révoquée au serveur, il ne peut plus rien poster. L'effet est un déni (les appareils visés se réenrôlent avec une nouvelle identité), jamais une fuite. Une coupure par rang (« ne compte que ce que le révocateur avait vu ») a été évaluée et écartée (Arb. 9) ; une clé de compte qui signerait les révocations est une suite (§ 10).
- **Mes contacts face à un appareil qui n'est pas à moi** : la confirmation protège les copies que MES appareils s'envoient. Un appareil enrôlé sur mon compte reçoit encore ce que mes contacts m'écrivent, car ils chiffrent pour tout appareil que l'annuaire annonce (TOFU, spec 2026-10-23 § 1). Et ce n'est pas seulement l'affaire d'un serveur compromis : **un voleur de mot de passe ou de session y suffit** (GW-04, WEB-18, IOS-02), ce qui rend ce risque bien plus probable. L'annonce à l'enrôlement et le rapprochement à chaque reconnexion (§ 5.3) en raccourcissent la durée ; ils ne le ferment pas. La parade est une **liste d'appareils attestée** (modèle « Advanced Device Verification » de WhatsApp, « cross-signing » de Matrix ; lot L12 de l'audit web). **Les entrées du registre étant désormais signées par leur auteur, la matière de cette liste existe** : il reste à la publier et à décider ce que mes contacts croient. C'est un changement du modèle de confiance des contacts : issue ouverte dès maintenant, décision du porteur, revue externe.
- **Retenue ou retard d'une révocation** par un serveur actif : **retenir une révocation chez un appareil prolonge, chez lui seul, les copies vers l'appareil révoqué et l'ouverture de ses enveloppes ; les approbations faites par l'appareil révoqué ne valent nulle part ailleurs (P4).** Bornes : retrait au serveur, suivi « appliqué sur n appareils » et appareil en retard nommé avec « Retirer X depuis cet appareil » (§ 6.6), requête de registre (R6). Une pierre tombale étant signée, n'importe lequel de mes appareils peut la relayer : le serveur doit la retenir sur TOUS les chemins.
- **La mémoire du régime pendant sa transmission** : avant qu'elle soit complète, un nouvel appareil ne sait pas quelles conversations sont chiffrées ; la `décision-produit` du § 6.3 tranche entre ne rien envoyer en clair (recommandé) et une fenêtre écrite ici. Ses entrées ne sont pas signées : une forge n'y produit qu'un déni (§ 6.3).
- **La vivacité du registre** : la sûreté (P2 à P9) ne dépend d'aucun relais ; l'exhaustivité, si. Une entrée signée se relaie par n'importe lequel de mes appareils effectifs : un appareil apprend l'approbation faite par un appareil disparu de quiconque la détient. Un serveur qui retient des synchronisations retarde la confiance, il ne la fabrique pas.
- **Métadonnées** : le serveur sait quand j'ajoute un appareil, lequel l'a confirmé, combien j'en ai, et à quel rythme ils se synchronisent.
- **Déni de service** : le serveur peut retenir les messages, forger des `cancel` (qui ne comptent plus comme échecs, § 4.6), refuser le relais, provoquer des `commitment-mismatch`. **Le détenteur de mon mot de passe, sans le serveur, a trois leviers** : (1) la **course** — son appareil répond à chaque demande de mon nouvel appareil ; parade : la demande dirigée après une course (§ 4.6) ; (2) **« Je n'ai plus mes autres appareils »** fait depuis son appareil, qui s'appuie sur `DELETE /e2ee/devices/:deviceId`, ouvert à toute session du compte (`services/gateway/src/routes/e2ee.ts:158`) : mes appareils sont retirés AU SERVEUR (sessions fermées) et doivent se réenrôler ; ses pierres tombales ne comptent chez aucun de mes appareils (il n'y est admis nulle part), mais son appareil reste seul actif au serveur jusqu'à ce que je reprenne la main ; (3) des enrôlements répétés, que le regroupement des annonces (§ 5.3) et le plafond d'invites (§ 4.6) amortissent. La borne de débit par compte de la v2, que quatre ou cinq de ses appareils épuisaient, est supprimée (§ 5.2). **Il n'y a pas de parade cryptographique à un déni par le détenteur du mot de passe : la conduite est de le changer.** Dès la deuxième course en 24 h (« Deux réponses », « Acceptée ailleurs »), et à tout retrait de mes appareils que je n'ai pas fait, l'écran pousse « Changer mon mot de passe » ; un changement de mot de passe qui fermerait toutes les autres sessions est hors de ce lot (route de la passerelle, à vérifier dans son issue). Le QR, qui authentifie hors du relais, existe désormais sur iOS, Android (lot 5) et le web (QR affiché, lot 6).
- **Générateur d'aléa défaillant** sur un appareil : l'engagement ne cache plus rien, et les options deviennent prévisibles ; chaque plateforme refuse de continuer quand son générateur signale un échec (§ 3.3), mais un générateur faible qui ne le signale pas reste hors modèle. (La signature XEdDSA, elle, ne dépend pas d'un bon aléa pour protéger la clé : son nonce dérive aussi de la clé privée et du message.)
- **Appareil déverrouillé volé**, logiciel malveillant, captures d'écran.
- **Historique** : un nouvel appareil ne lit pas les messages antérieurs à sa confirmation (spec 2026-10-23 § 4.5) ; ce qui s'écrit pendant l'attente n'est pas rattrapé (suite au § 10).

**Exige une revue externe (#3710), et n'est pas déclaré acquis** :
- l'instanciation du § 4 (engagement SHA-256 sur le descripteur, dérivation HKDF du code et de l'accusé, encodage des descripteurs, ordre des messages, validations) : les références du § 1 en analysent la STRUCTURE, pas cette instanciation ;
- la correspondance du § 4.9 (carré à quatre options, accusé, mode renforcé) : ses bornes viennent d'un argument structurel et de simulations de comportements stylisés (§ 10, lot 1a, et la revue de confirmation), pas d'une étude d'utilisabilité ; l'essai du lot 4 n'en tient pas lieu ;
- le registre de confiance (§ 6) : encodage et signature des entrées, réception en cinq temps, ancres de parrainage, rang d'admission, pierres tombales par clé, état effectif depuis soi, conflits, révocation, projection en épingles, règles d'émission. La signature ferme la forge ; elle ne prouve pas que la sémantique d'état est la bonne : deux revues adversariales y ont trouvé des défauts (R-1 à R-5), et cette version en a trouvé un de plus (R-6) ;
- le canal de synchronisation (§ 5.4) et le contenu `E2EEDeviceSync` ;
- l'application de l'épingle sur le web, faite par l'appelant autour d'un magasin libsignal en mémoire (§ 6.7).

**Propriétés que la vérification formelle doit prouver** (Tamarin ou ProVerif ; REQUISE avant de présenter l'ajout d'appareil comme sûr face à un serveur compromis) :
- **P1** — Sous les règles du § 4.6, chaque code confirmé donne à un homme du milieu au plus 2⁻ᵏ, où k est le nombre de bits que le geste vérifie réellement (42 ou 39 en comparant tout, ≈ 12 en touchant une option, ≈ 7 en lisant un symbole puis au hasard, 39 en saisissant), et au plus une tentative non saisie par appareil approuvé et par 24 h.
- **P2** — Une approbation n'entre dans mon groupe (ne compte sur aucun de mes appareils effectifs) que par un geste fait sur un appareil de mon groupe : comparaison par code ou QR, migration, ou maintien explicite lors d'un retrait.
- **P3** — Après la révocation de X, aucune génération n'est effective par une approbation signée par X, et aucun appareil n'ancre plus rien par un parrainage de X.
- **P4** — Une pierre tombale retenue chez un appareil ne rend effective nulle part ailleurs une approbation de X.
- **P5** — La fusion (union des entrées signées, la plus petite selon l'ordre total pour une même identité) reste commutative, associative et idempotente ; l'état effectif est une fonction du registre fusionné et de soi.
- **P6** — Une entrée qu'un appareil x a écrite avant son admission ne compte sur aucun appareil hors de sa chaîne de parrainage (les appareils qui ont rejoint x, directement ou par leurs parrains, par un geste), sauf son inscription.
- **P7** — Au vu du seul écran du répondeur (ou des seuls accusés de l'initiateur), chaque option est la bonne avec une probabilité 1/4.
- **P8** — Aucune entrée ne compte sans la signature valide de son auteur, sur ses octets canoniques et dans le compte : aucun relais — serveur, appareil, parrain — ne peut en créer, en modifier, ni en attribuer une à un autre ; et aucune entrée n'est tenue pour écrite par moi sans l'avoir été ici.
- **P9** — Aucune approbation n'existe (n'est signée, ne voyage, ne compte) avant les deux confirmations de sa vérification.
- **P10** — À registres égaux, si N a rejoint A et que la clé de A n'est pas morte chez N, tout appareil effectif chez A l'est chez N, sauf ce qu'écarte chez N seul une pierre tombale comptée ou un conflit (le nouveau fait confiance à tous mes appareils, quel que soit celui qui l'a confirmé).

L'avis juridique AGPL (#11548) reste requis pour toute promotion d'un build qui lie libsignal, et son périmètre inclut la table Apache-2.0 du § 4.5.

---

## 12. Choix tranchés par ce document (contestables par une issue `décision-produit`)

- **Un geste par écran, chacun exigeant l'autre écran** : sur l'appareil qui répond, toucher le code juste parmi QUATRE, disposés en carré pour que l'écran seul ne désigne rien ; sur le nouvel appareil, toucher parmi quatre l'accusé que l'autre écran affiche après le bon toucher (Arb. 1, Arb. 3).
- À partir du premier code affiché sans succès, et pendant 24 h, la confirmation se fait par saisie des trois nombres (ou du nombre de l'accusé).
- Tout nouvel appareil, et tout retour d'une génération retirée, est annoncé par la passerelle, et chaque appareil rapproche l'annuaire à chaque reconnexion.
- La mémoire du régime (conversations vues chiffrées) voyage avec le registre, en parties, chaque entrée datée et attribuée ; « confirmé » n'apparaît qu'une fois elle complète.
- Emoji par défaut, chiffres en alternative ; une bascule ne redessine jamais des options affichées.
- **Aucune approbation n'est signée avant les DEUX confirmations** ; l'épingle locale part dès la première.
- Tout membre peut confirmer un nouvel appareil : il n'y a pas d'appareil « principal » ; un appareil en attente n'initie que, et un membre ne lui adresse jamais de demande.
- **Chaque entrée du registre est signée par son auteur et vaut par sa signature, quel que soit celui qui la relaie** ; une signature fausse fait refuser le contenu entier. Celui qui rejoint un appareil en adopte la vue (parrainage) ; ce qu'un appareil a écrit avant d'être admis reste « à confirmer » hors de sa chaîne.
- Une révocation vise la CLÉ et est définitive ; revenir demande une nouvelle identité. Une pierre tombale garde sa valeur après le retrait de son auteur.
- Une déconnexion simple ne révoque pas ; « Retirer cet appareil » révoque ; fermer la session d'un appareil chiffré demande s'il est perdu ou volé.
- La cascade est automatique ; garder un appareil qui ne tenait que par l'appareil retiré est un geste (case décochée).
- Aucune pierre tombale n'est posée automatiquement sur la foi d'une entrée forgée (Arb. 4).
- Après une course, la demande suivante vise l'appareil que l'utilisateur désigne ; dès la deuxième course en 24 h, l'écran pousse « Changer mon mot de passe ».
- Le QR, dernier recours, existe sur les trois plateformes.
- Les messages écrits pendant l'attente ne sont pas rattrapés dans ce lot.
