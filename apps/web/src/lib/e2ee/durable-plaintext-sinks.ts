/**
 * **LA LISTE NOIRE DU CLAIR DÉCHIFFRÉ** (#18991) — les stockages DURABLES du
 * navigateur qui peuvent porter le contenu d'une conversation, chacun avec le
 * site qui le garde.
 *
 * Un clair déchiffré sur l'appareil vit dans le coffre scellé, et en mémoire au
 * rendu ; il n'entre dans AUCUN de ces puits, qui survivent à la session, se
 * rangent dans l'étagère des comptes ou partent en sauvegarde (audit E2EE web
 * du 2026-11-17, WEB-09 ; contre-analyse WEBX-04, WEBX-05). La garde est UNE
 * fonction, `mayPersistConversationContent` (`lib/end-to-end-regime-ledger.ts`) :
 * le contenu d'une conversation fermée au clair (`endToEndSealed`) ne se range
 * pas ; la traduction d'un clair que le serveur ne lit pas reste en mémoire.
 *
 * La liste est TYPÉE et VÉRIFIÉE (`durable-plaintext-sinks.test.ts`) : chaque
 * puits nomme son site de garde, et un témoin à la SENTINELLE
 * (`test-support/e2ee-plaintext-sentinel.ts`) le traverse par son chemin
 * d'écriture normal. Un puits ajouté au navigateur entre ici avec son témoin ;
 * un consommateur qui laisse fuir un clair fait rougir le sien.
 *
 * Ce module n'est importé que par les témoins : la liste ne pèse rien dans le
 * bundle, la garde vit dans le module du régime, déjà dans le socle.
 */

export type DurablePlaintextSink = {
  readonly id: string;
  /** Où le puits range — pour la personne qui lit la liste. */
  readonly where: string;
  /** Le fichier (relatif à `src/`) qui garde le puits. */
  readonly guardFile: string;
  /** L'appel de garde que ce fichier doit porter. */
  readonly guardCall: string;
};

export const DURABLE_PLAINTEXT_SINKS = [
  {
    id: 'query-cache',
    where: "localStorage `meeshy.query-cache` — le cache TanStack déshydraté, rangé par compte",
    guardFile: 'lib/api/query-client.ts',
    guardCall: '!mayPersistConversationContent(key[1])',
  },
  {
    id: 'drafts',
    where: 'localStorage `meeshy.draft.<lecteur>.<conversation>`',
    guardFile: 'lib/send/draft-store.ts',
    guardCall: 'else if (mayPersist(conversationId)) write(',
  },
  {
    id: 'outbox',
    where: "IndexedDB `thread-outbox:<lecteur>` — la file d'envoi durable, texte et fichiers",
    guardFile: 'lib/send/outbox-durability.ts',
    guardCall: 'entries.length > 0 && mayPersist(conversationId)',
  },
  {
    id: 'device-translation',
    where: 'IndexedDB `meeshy-device-translation` — traductions et empreinte du texte dans la clé',
    guardFile: 'lib/device-translation/scheduler.ts',
    guardCall: 'durable: job.origin.shareable',
  },
  {
    id: 'shell-widgets',
    where: "SharedPreferences `meeshy_widgets` de la coque — PART en sauvegarde",
    guardFile: 'lib/shell-widgets/snapshot.ts',
    guardCall: 'previewInputOf(',
  },
] as const satisfies readonly DurablePlaintextSink[];

export type DurablePlaintextSinkId = (typeof DURABLE_PLAINTEXT_SINKS)[number]['id'];
