## Leçon 210 — un nettoyage keyé « par appel » qui a commencé keyé « par un seul occupant » reste par-appel pour toujours, sauf audit explicite (2026-08-16, routine calling, cycle 137)

**Le constat.** Le buffer de signalisation §4.6 (`bufferedOffers`) est keyé PAR DESTINATAIRE
(`${callId}:${to}`) depuis sa création — le commentaire d'origine dit noir sur blanc qu'une offre
bufferisée pour un destinataire et une réponse bufferisée pour un AUTRE destinataire du même appel
doivent coexister. Mais son NETTOYAGE, sur les trois chemins « ce participant part »
(`call:leave`, `call:force-leave`, `call:end` traité comme un leave), balayait tout le `callId` —
tous les destinataires, pas seulement celui qui part. Ça a tenu tant que « un participant part » et
« l'appel se termine » étaient le MÊME événement (appel 1:1, seule forme qui existait quand §4.6 a
été écrit). Le keyage a changé pour anticiper le multi-destinataire ; le nettoyage, lui, n'a jamais
été relu à cette lumière — et rien dans le typage ne force cette relecture : `clearBufferedOffer(callId: string)`
compile très bien, qu'il balaie un seul occupant ou dix.

**Le commentaire qui contredit son propre code, sans que personne ne s'en aperçoive.** La branche
`call:end`-traitée-comme-leave porte un commentaire DATÉ DU MÊME JOUR affirmant explicitement
« group call continues for other participants » — et appelle `clearBufferedOffer(callId)` (balayage
total) deux lignes plus bas. Le commentaire décrit le nouveau monde (le groupe continue) ; l'appel
qu'il documente appartient encore à l'ancien (un seul occupant). Personne n'a menti : la personne
qui a écrit ce commentaire raisonnait juste sur la PARTIE du comportement qu'elle venait de changer
(qui reçoit quel broadcast), pas sur un appel de nettoyage hérité, déjà présent, qui n'avait pas
besoin d'être touché pour que ses propres tests passent.

**Le test qui codifiait le bug comme une spec.** `CallEventsHandler-force-leave.test.ts` avait un
test nommé « clears any buffered offer for the force-left call » qui bufferisait une entrée pour un
destinataire ARBITRAIRE (`some-recipient`, sans lien avec l'utilisateur testé) et affirmait qu'elle
disparaissait après le force-leave d'un AUTRE utilisateur — l'exact comportement bogué, écrit et
vert. *Un test « clear » qui n'affirme que « l'entrée cible a disparu » ne peut jamais détecter un
nettoyage trop large : il faut TOUJOURS une seconde assertion, sur une entrée SŒUR qui ne devrait
PAS disparaître, pour que « trop large » ait quelque chose à casser.* Sans ce second témoin, balayer
toute la Map et balayer une seule clé produisent EXACTEMENT le même vert.

**La règle.** Dès qu'une structure passe d'un keyage « un seul par scope » (`callId` → une entrée)
à un keyage « plusieurs par scope » (`callId:destinataire` → N entrées), CHAQUE nettoyage existant
qui itère sur ce scope doit être ré-audité — pas seulement les nouveaux call sites. Le signal à
chercher : une fonction de nettoyage dont le nom porte le nom du SCOPE PARENT (`clearBufferedOffer(callId)`)
alors que la structure qu'elle nettoie est maintenant keyée sur un ENFANT de ce scope
(`callId:destinataire`) — le nom ment par omission sur ce qu'elle balaie réellement. Et tout test
« ça se nettoie » écrit contre une telle fonction doit inclure un occupant frère qui survit, sinon
il ne teste que la moitié du contrat.
