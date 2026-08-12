// Répare `Mention.mentionedParticipantId` : ramène les lignes keyées par
// `Participant.id` vers le `User.id` que la colonne porte partout ailleurs.
//
// Pourquoi
// --------
// `Mention` a toujours été écrite et lue en `User.id` (`MentionService.createMentions`,
// `getRecentMentionsForUser`), mais le schéma la DÉCLARAIT comme une relation vers
// `Participant` — et `migrate-to-participant-model.ts` a réécrit les lignes
// historiques dans cet espace-là (`$set: mentionedParticipantId`, `$unset: mentionedUserId`).
// Ces lignes-là sont depuis invisibles depuis l'inbox `/mentions/me`, qui cherche
// par `User.id`. Le schéma dit maintenant la vérité (`mentionedUserId`, relation
// vers `User`, même colonne physique) ; ce script aligne les données restées en
// arrière.
//
// Comment une ligne est classée
// -----------------------------
// L'id porté est cherché dans `Participant`. S'il y correspond un document, la
// ligne est keyée participant et doit être réécrite avec le `userId` de ce
// participant. Sinon elle est déjà keyée utilisateur et n'est pas touchée. Les
// deux espaces sont disjoints (deux collections, des ObjectId distincts), donc le
// classement est déterministe — et le script est idempotent : un second passage
// ne trouve plus aucun participant à réécrire.
//
// Écriture explicite
// -----------------
// Contrairement à `migrate-to-participant-model.ts`, ce script NE MODIFIE RIEN par
// défaut : il faut `--apply`. Un `--dry-run` oublié sur un script qui écrit par
// défaut est irréversible ; l'inverse ne coûte qu'un second lancement.
//
// Usage:
//   npx tsx scripts/migrations/repair-mention-user-ids.ts [--apply] [--production]
//
// Default: inspecte et rapporte sans écrire, sur MONGODB_URL depuis .env
// --apply:      applique réellement les réécritures
// --production: utilise MONGODB_PRODUCTION_URL

import { MongoClient, ObjectId } from 'mongodb'
import type { AnyBulkWriteOperation, Document } from 'mongodb'
import dotenv from 'dotenv'
import path from 'node:path'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const APPLY = process.argv.includes('--apply')
const PRODUCTION = process.argv.includes('--production')

const MONGODB_URL = PRODUCTION
  ? process.env.MONGODB_PRODUCTION_URL
  : process.env.MONGODB_URL || process.env.DATABASE_URL

if (!MONGODB_URL) {
  console.error('No MongoDB URL found. Set MONGODB_URL or DATABASE_URL in .env')
  process.exit(1)
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

type RepairStats = {
  scanned: number
  alreadyUserKeyed: number
  rewritten: number
  droppedAsDuplicate: number
  anonymousParticipant: number
  errors: string[]
}

async function main() {
  const stats: RepairStats = {
    scanned: 0,
    alreadyUserKeyed: 0,
    rewritten: 0,
    droppedAsDuplicate: 0,
    anonymousParticipant: 0,
    errors: [],
  }

  log(`Connecting to MongoDB... ${APPLY ? '(APPLY)' : '(inspection only — pass --apply to write)'}`)
  const client = new MongoClient(MONGODB_URL!)
  await client.connect()
  const db = client.db()

  try {
    const mentions = db.collection('Mention')
    const participants = db.collection('Participant')

    const total = await mentions.countDocuments()
    log(`Scanning ${total} Mention documents...`)

    // ---- Passe 1 : classer chaque ligne, sans rien décider encore.
    //
    // La classification doit être complète AVANT de trancher les collisions :
    // une ligne déjà keyée utilisateur peut apparaître après la ligne keyée
    // participant qu'elle rend redondante, et l'ordre du curseur n'est pas un
    // contrat. Seules des CLÉS sont retenues en mémoire, pas les documents.
    type PendingRewrite = { id: ObjectId; messageId: string; targetUserId: string }

    const userKeyedKeys = new Set<string>()
    const pending: PendingRewrite[] = []
    const docs: { id: ObjectId; messageId: string; mentionedId: ObjectId }[] = []

    const cursor = mentions.find({}, { projection: { _id: 1, messageId: 1, mentionedParticipantId: 1 } })
    for await (const doc of cursor) {
      stats.scanned++
      const currentId = doc.mentionedParticipantId
      if (!currentId) continue
      try {
        docs.push({
          id: doc._id,
          messageId: doc.messageId?.toString() ?? '',
          mentionedId: typeof currentId === 'string' ? new ObjectId(currentId) : currentId,
        })
      } catch (err) {
        stats.errors.push(`Mention ${doc._id}: ${err}`)
      }
      if (stats.scanned % 1000 === 0) log(`  Scanned ${stats.scanned}/${total}`)
    }

    // Les participants sont résolus par lots : une requête par document ferait
    // de ce script une tempête de round-trips sur une collection volumineuse.
    const BATCH = 500
    const participantUserById = new Map<string, string | null>()
    const distinctIds = [...new Map(docs.map(d => [d.mentionedId.toString(), d.mentionedId])).values()]
    for (let i = 0; i < distinctIds.length; i += BATCH) {
      const slice = distinctIds.slice(i, i + BATCH)
      const found = await participants
        .find({ _id: { $in: slice } }, { projection: { userId: 1 } })
        .toArray()
      for (const p of found) {
        participantUserById.set(p._id.toString(), p.userId ? p.userId.toString() : null)
      }
    }

    for (const doc of docs) {
      const key = doc.mentionedId.toString()
      if (!participantUserById.has(key)) {
        // Aucun participant ne porte cet id : la ligne est déjà keyée utilisateur.
        stats.alreadyUserKeyed++
        userKeyedKeys.add(`${doc.messageId}:${key}`)
        continue
      }
      const targetUserId = participantUserById.get(key)
      if (!targetUserId) {
        // Un participant anonyme n'a pas d'utilisateur à désigner. La ligne est
        // signalée et laissée intacte : la détruire perdrait une trace qu'aucun
        // autre document ne porte.
        stats.anonymousParticipant++
        continue
      }
      pending.push({ id: doc.id, messageId: doc.messageId, targetUserId })
    }

    // ---- Passe 2 : trancher les collisions, puis composer les écritures.
    //
    // `(messageId, mentionedParticipantId)` est unique. Réécrire un participant
    // vers son utilisateur peut donc entrer en collision avec une ligne déjà
    // keyée utilisateur pour le même message — la même mention, écrite une fois
    // avant la migration et une fois après. La ligne redondante est supprimée
    // plutôt que réécrite : elle ne porte aucune information que l'autre n'ait.
    const ops: AnyBulkWriteOperation<Document>[] = []
    for (const row of pending) {
      const key = `${row.messageId}:${row.targetUserId}`
      if (userKeyedKeys.has(key)) {
        stats.droppedAsDuplicate++
        ops.push({ deleteOne: { filter: { _id: row.id } } })
        continue
      }
      userKeyedKeys.add(key)
      stats.rewritten++
      ops.push({
        updateOne: {
          filter: { _id: row.id },
          update: { $set: { mentionedParticipantId: new ObjectId(row.targetUserId) } },
        },
      })
    }

    if (ops.length > 0 && APPLY) {
      // Les suppressions d'abord : une réécriture ne doit jamais buter sur un
      // doublon que ce même lot s'apprête à retirer.
      const deletes = ops.filter(op => 'deleteOne' in op)
      const updates = ops.filter(op => !('deleteOne' in op))
      if (deletes.length > 0) await mentions.bulkWrite(deletes, { ordered: false })
      if (updates.length > 0) await mentions.bulkWrite(updates, { ordered: false })
    }

    log('')
    log('=== Repair summary ===')
    log(`  Scanned:                 ${stats.scanned}`)
    log(`  Already user-keyed:      ${stats.alreadyUserKeyed}`)
    log(`  Rewritten to User.id:    ${stats.rewritten}`)
    log(`  Dropped as duplicate:    ${stats.droppedAsDuplicate}`)
    log(`  Anonymous (left as-is):  ${stats.anonymousParticipant}`)
    log(`  Errors:                  ${stats.errors.length}`)
    for (const err of stats.errors.slice(0, 20)) log(`    ${err}`)
    if (!APPLY && (stats.rewritten > 0 || stats.droppedAsDuplicate > 0)) {
      log('')
      log('Nothing was written. Re-run with --apply to perform the repair.')
    }
  } finally {
    await client.close()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
