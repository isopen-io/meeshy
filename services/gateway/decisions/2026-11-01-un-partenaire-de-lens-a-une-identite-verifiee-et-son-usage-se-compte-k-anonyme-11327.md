# Un partenaire de lens a une identité vérifiée, son crédit voyage avec le média, et l'usage se compte k-anonyme (2026-11-01, #11327)

## Contexte

S26 attendait les verdicts du porteur sur #11251. Ils sont tombés le 2026-11-01 : gratuit des deux côtés en v1 ; `PartnerProfile` vérifié par BIGBOSS/ADMIN ; crédit « Lens par X » affiché sur le média reçu, l'identifiant de la lens EN CLAIR partout, conversations E2EE comprises ; géo-créneau à la position réelle partagée avec consentement ; filigrane Meeshy ET logo du partenaire.

## Décision

- **Identité.** `PartnerProfile` (un par compte, optionnel) : nom, site https, logo ré-encodé et renommé par son empreinte. `verifiedAt` nul = non vérifié. Seuls BIGBOSS et ADMIN vérifient ou retirent (`requireAdminRank`), jamais leur propre profil ; chaque geste s'écrit à `AdminAuditLog` AVANT d'agir avec l'instantané vérifié (nom, empreinte du logo), et l'écriture est conditionnelle sur cet instantané. Changer son nom ou son logo retire la vérification ; changer son site, non.
- **Crédit.** `lensCreditOf` (`@meeshy/shared/types/lens-partner`) : une lens publiée crédite son partenaire VÉRIFIÉ, sinon `partner: null` — le nom déclaré n'est jamais servi comme identité. Le filigrane Meeshy est toujours demandé ; le logo du partenaire s'y ajoute (`GET /lens/partners/:userId/logo`, vérifié seulement).
- **Le crédit voyage avec le média.** `MessageAttachment.lensSlug` et `PostMedia.lensSlug` (additifs). Le client le déclare à l'envoi (multipart `lensSlug`, TUS `lensslug`) ; la passerelle ne le retient que si la lens est publiée ET installée par l'expéditeur (`attributableLensSlug`), sans quoi n'importe qui accrocherait une marque à n'importe quel média. Fail-closed sur le crédit, jamais sur l'envoi. En clair à côté d'une pièce chiffrée. Le transfert et la diffusion le recopient. Le client résout le crédit par `GET /lens/credits?slugs=` : la liste de messages ne fait aucune jointure de plus.
- **Usage.** `LensUsageDaily` : lens × jour UTC × surface (`camera`, `story`, `message`, `call`), `devices` + `uses`, aucune identité. `devices` se dédoublonne par `HMAC(sel du jour, userId)` en `SET NX EX` 48 h ; le sel est tiré au hasard, tenu en cache et jamais persisté. Dédoublonnage injoignable ⇒ rien n'est compté. Seul un compte qui a installé une lens publiée la compte. La lecture (`GET /lens/usage/:slug`, auteur et modération, 90 jours) ne sert aucune ligne sous 20 appareils (`LENS_USAGE_K_ANONYMITY`).
- **RGPD.** `PackPrivacy` reste le seul accès : le profil s'exporte sans les octets du logo ni l'identifiant du vérificateur, et s'efface à la purge ; l'usage d'une lens que la purge efface part avec elle.
- **Préfixe `/api/v1/lens`**, distinct de `/packs/lens` : ses chemins statiques (`credits`, `partners`) y masqueraient des slugs.

## Ce qui n'est PAS tranché ici

- Le géo-créneau (point 7) : la revue retire toujours `window.geo` du document servi — un lot séparé.
- Les clients (iOS, web, Android) : afficher le crédit, composer le double filigrane, déclarer `lensSlug`, pinger l'usage — une issue par client.
- Plusieurs instances de passerelle sans Redis : le repli mémoire du `CacheStore` dédoublonne par processus ; une panne Redis multi-instance pourrait compter un compte une fois par instance le jour même.
