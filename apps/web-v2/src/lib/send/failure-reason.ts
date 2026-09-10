import type { ApiFailure } from '@/lib/api/http';

/**
 * LA CAUSE D'UN ENVOI QUI N'EST PAS PARTI (#5813, revue-correction) — le
 * SITE UNIQUE qui traduit un `ApiFailure` en une phrase que L'UTILISATEUR
 * peut lire.
 *
 * POURQUOI CE FICHIER EXISTE. `lastError` était STOCKÉ sur l'entrée d'outbox
 * et lu par PERSONNE : ni la bande de reprise, ni l'annonce, ni un journal.
 * C'est le défaut du cycle 122 du `CLAUDE.md` racine — « un correctif dont la
 * valeur n'atteint aucun lecteur n'a corrigé personne » : la question à poser
 * n'est pas « la cause est-elle capturée ? » mais « QUI l'affiche ? ».
 *
 * ON NE SERT JAMAIS `failure.error` TEL QUEL : c'est la prose de la
 * passerelle, écrite pour un développeur et pas toujours en français
 * (« You are not a participant of this conversation », mesuré sur
 * `gate.staging.meeshy.me` le 2026-09-09). Le STATUT, lui, est un contrat.
 *
 * `undefined` ⇒ AUCUNE cause à dire : c'est l'échec HORS LIGNE, que le
 * bandeau de coupure explique déjà en haut de l'écran (D-16) — le redire sur
 * chaque bulle serait du bruit.
 */
export function sendFailureReason(failure: ApiFailure | undefined): string | undefined {
  if (failure === undefined) return undefined;
  if (failure.status === 0) return failure.code === 'TIMEOUT' ? 'la passerelle n’a pas répondu' : 'réseau indisponible';
  /**
   * UN LOT DE PIÈCES INCOMPLET (#5668, § 0 « UPLOAD_PARTIAL ») — synthétisé
   * par `send/perform-send.ts` quand `POST /attachments/upload` rend MOINS
   * d'attachements que de fichiers envoyés (`UploadProcessor.ts:744-751`,
   * qui avale les échecs PAR FICHIER sous `success: true`, statut 200 ici).
   * Distinct de tout statut HTTP réel : c'est ce module-ci, et lui seul, qui
   * doit reconnaître ce code AVANT de tomber dans les branches par statut.
   */
  if (failure.code === 'UPLOAD_PARTIAL') return 'une pièce n’a pas pu être téléversée';
  /**
   * PAS DE BRANCHE `ATTACHMENT_RIGHT_NOT_PERMITTED` ICI, ET C'EST MESURÉ
   * (revue-correction #5668) — la passerelle FABRIQUE bien ce code
   * (`MessagingService.ts:294-297`) et la route le LIT pour choisir son statut
   * (`messages-send.ts:363`), mais elle le rend par
   * `sendForbidden(reply, result.error)` SANS `options.code`
   * (`messages-send.ts:364`) : `sendError` pose alors `code: undefined`
   * (`utils/response.ts:89`), que JSON supprime. Aucun 403 servi à ce client
   * ne porte donc ce code — une branche écrite dessus serait morte, et son
   * témoin ne prouverait que sa propre cohérence (`tasks/lessons.md`, « un
   * témoin qui épingle un chemin d'API »). Le refus se dit ici par le 403
   * générique ci-dessous, et le composeur n'OFFRE pas la porte qu'il sait
   * refusée (`send/attachments.ts § acceptPendingFiles`). Une issue compagnon
   * de passerelle (servir le `code`) est proposée à la clôture.
   */
  if (failure.status === 401) return 'session expirée — reconnectez-vous';
  if (failure.status === 403) return 'envoi refusé pour cette conversation';
  if (failure.status === 429) return 'trop de messages d’un coup — réessayez dans un instant';
  if (failure.status >= 400 && failure.status < 500) return 'message refusé';
  return 'la passerelle est indisponible';
}
