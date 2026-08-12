/**
 * Réconciliation one-shot du stock de notifications non lues (2026-08-04).
 *
 * Contexte : jusqu'à la PR #2560, la cascade « conversation lue → notifications
 * lues » était court-circuitée côté gateway. Résultat mesuré en prod :
 * 74 915 notifications non lues sur 102 262 (73 %), accumulées depuis janvier —
 * dont 66 216 `new_message` alors que leur conversation a souvent été lue
 * depuis longtemps.
 *
 * Ce script marque lues les notifications de type conversation dont le
 * DESTINATAIRE a un curseur de lecture (`ConversationReadCursor.lastReadAt`)
 * postérieur ou égal à la création de la notification : l'utilisateur a
 * prouvé qu'il a lu la conversation au-delà de ce point. Aucune autre famille
 * n'est touchée (sociales, amis, système restent en l'état).
 *
 * Usage (dans le container Mongo, réplica set) :
 *   DRY RUN (défaut — aucun write) :
 *     docker exec meeshy-database mongosh meeshy scripts/reconcile-read-notifications.mongodb.js
 *   EXÉCUTION RÉELLE :
 *     docker exec -e CONFIRM=yes meeshy-database mongosh meeshy scripts/reconcile-read-notifications.mongodb.js
 *
 * Idempotent : ne matche que `isRead: false` ; relancer ne change rien.
 */

const CONFIRM = (typeof process !== 'undefined' && process.env && process.env.CONFIRM) === 'yes';
const BATCH_SIZE = 5000;

// Types dont la lecture de la CONVERSATION vaut consommation.
const CONVERSATION_TYPES = [
  'new_message',
  'message_reply',
  'message_reaction',
  'user_mentioned',
  'missed_call',
];

print(`Mode : ${CONFIRM ? 'EXÉCUTION RÉELLE' : 'DRY RUN (CONFIRM=yes pour écrire)'}`);

const pipeline = [
  {
    $match: {
      isRead: false,
      type: { $in: CONVERSATION_TYPES },
      'context.conversationId': { $exists: true, $type: 'string', $ne: '' },
    },
  },
  // Participant du destinataire dans la conversation de la notification.
  {
    $lookup: {
      from: 'Participant',
      let: { convId: { $toObjectId: '$context.conversationId' }, uid: '$userId' },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ['$conversationId', '$$convId'] },
                { $eq: ['$userId', '$$uid'] },
              ],
            },
          },
        },
        { $project: { _id: 1 } },
      ],
      as: 'participant',
    },
  },
  { $unwind: '$participant' },
  // Curseur de lecture de ce participant.
  {
    $lookup: {
      from: 'ConversationReadCursor',
      let: { pid: '$participant._id', convId: { $toObjectId: '$context.conversationId' } },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ['$participantId', '$$pid'] },
                { $eq: ['$conversationId', '$$convId'] },
              ],
            },
          },
        },
        { $project: { lastReadAt: 1 } },
      ],
      as: 'cursor',
    },
  },
  { $unwind: '$cursor' },
  // Frontière : la notification est antérieure ou égale à la dernière lecture.
  {
    $match: {
      $expr: {
        $and: [
          { $ne: ['$cursor.lastReadAt', null] },
          { $lte: ['$createdAt', '$cursor.lastReadAt'] },
        ],
      },
    },
  },
  { $project: { _id: 1 } },
];

const now = new Date();
let scanned = 0;
let marked = 0;
let batch = [];

function flushBatch() {
  if (batch.length === 0) return;
  if (CONFIRM) {
    const res = db.Notification.updateMany(
      { _id: { $in: batch }, isRead: false },
      { $set: { isRead: true, readAt: now } }
    );
    marked += res.modifiedCount;
  } else {
    marked += batch.length;
  }
  batch = [];
}

db.Notification.aggregate(pipeline, { allowDiskUse: true }).forEach((doc) => {
  scanned += 1;
  batch.push(doc._id);
  if (batch.length >= BATCH_SIZE) flushBatch();
});
flushBatch();

print(`Éligibles (notification <= lastReadAt du curseur) : ${scanned}`);
print(CONFIRM ? `Marquées lues : ${marked}` : `Seraient marquées lues : ${marked} (dry run)`);
print('NOTE : les compteurs socket ne sont pas réémis par ce script — les clients');
print('se recalent au prochain refetch (refetchOnMount) ou notification:counts.');
