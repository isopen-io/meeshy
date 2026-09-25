## 2026-08-19 — Transcriptions d'appel : un signal qui décrit le MÉCANISME au lieu de l'INTENTION crée un verrou mutuel

Signalement utilisateur : « mon interlocuteur reçoit mes transcriptions, je ne
reçois pas les siennes ». Trois leçons, dont une évitée de justesse.

1. **Chercher le défaut là où le symptôme est asymétrique, pas là où le code
   est complexe.** Le relais gateway était parfaitement symétrique ; j'ai passé
   du temps à le décortiquer. L'asymétrie était en amont : un device ne
   transcrit que SON micro, et ne le faisait que pour SON panneau. Activer les
   sous-titres faisait de l'utilisateur un émetteur, jamais un récepteur. Le
   code était conforme à sa spec — la règle produit était fausse. **Une spec
   qui contredit le signalement n'est pas une défense, c'est le suspect.**

2. **Un signal de présence doit décrire l'INTENTION, jamais le MÉCANISME.**
   `call:transcription-active` était émis depuis `startTranscribing`. Dès que
   la capture démarre aussi pour servir un pair, l'émettre depuis la capture
   produit un **verrou mutuel** : A capture → A s'annonce actif → B capture →
   B s'annonce actif → plus aucun ne peut s'arrêter, micro tapé jusqu'à la fin
   de l'appel. J'allais l'introduire ; c'est en déroulant la machine à états
   à la main (A ouvre / A ferme / les deux ouvrent / les deux ferment) que le
   blocage est apparu. Le signal dit « j'écoute » (panneau), pas « je
   capture ». **Dérouler la machine à états AVANT de coder le réconciliateur.**

3. **Un booléen pour N pairs est un bug de groupe qui dort.** `remoteTranscription
   Active: Bool` : dans un appel à trois, la fermeture d'UN pair éteignait la
   capture et privait celui qui lisait encore. Un `Set<String>` d'auditeurs,
   et le booléen n'en est plus que la projection.

Et le piège SE-0466 **repris pour la troisième fois** : sous
`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, un `enum` nu devient `@MainActor`
et une loi pure cesse d'être appelable depuis son propre test (`main
actor-isolated conformance ... cannot be used in nonisolated context`).
**Tout type qui n'est qu'une règle s'écrit `nonisolated enum` du premier coup.**
Même correctif que `StoryRepostAudience` huit heures plus tôt dans la même
session — l'avoir déjà vécu n'a pas suffi à l'éviter.

---
