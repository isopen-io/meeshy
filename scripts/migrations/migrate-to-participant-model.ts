// Usage:
//   npx tsx scripts/migrations/migrate-to-participant-model.ts [--dry-run] [--production]
//
// Default: uses MONGODB_URL from .env
// --dry-run: logs actions without writing
// --production: uses MONGODB_PRODUCTION_URL

import crypto from 'node:crypto'
import { MongoClient, ObjectId } from 'mongodb'
import type { Db, Collection, Document } from 'mongodb'
import dotenv from 'dotenv'
import path from 'node:path'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const DRY_RUN = process.argv.includes('--dry-run')
const PRODUCTION = process.argv.includes('--production')

const MONGODB_URL = PRODUCTION
  ? process.env.MONGODB_PRODUCTION_URL
  : process.env.MONGODB_URL || process.env.DATABASE_URL

if (!MONGODB_URL) {
  console.error('No MongoDB URL found. Set MONGODB_URL or DATABASE_URL in .env')
  process.exit(1)
}

function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

type MigrationStats = {
  participantsFromMembers: number
  participantsFromAnonymous: number
  messagesUpdated: number
  statusEntriesUpdated: number
  readCursorsUpdated: number
  reactionsUpdated: number
  attachmentStatusUpdated: number
  attachmentReactionsUpdated: number
  callParticipantsUpdated: number
  trackingClicksUpdated: number
  mentionsUpdated: number
  errors: string[]
}

async function main() {
  const stats: MigrationStats = {
    participantsFromMembers: 0,
    participantsFromAnonymous: 0,
    messagesUpdated: 0,
    statusEntriesUpdated: 0,
    readCursorsUpdated: 0,
    reactionsUpdated: 0,
    attachmentStatusUpdated: 0,
    attachmentReactionsUpdated: 0,
    callParticipantsUpdated: 0,
    trackingClicksUpdated: 0,
    mentionsUpdated: 0,
    errors: [],
  }

  log(`Connecting to MongoDB... ${DRY_RUN ? '(DRY RUN)' : ''}`)
  const client = new MongoClient(MONGODB_URL!)
  await client.connect()
  const db = client.db()

  try {
    // Mappings: old ID -> new Participant ID
    const memberToParticipant = new Map<string, string>() // `${conversationId}:${userId}` -> participantId
    const anonToParticipant = new Map<string, string>() // anonymousParticipantId -> participantId

    // ========== PHASE 1: ConversationMember -> Participant ==========
    log('Phase 1: Migrating ConversationMembers to Participants...')
    const members = db.collection('ConversationMember')
    const users = db.collection('User')
    const participants = db.collection('Participant')

    const memberCount = await members.countDocuments()
    log(`  Found ${memberCount} ConversationMembers`)

    const memberCursor = members.find()
    let processed = 0

    for await (const member of memberCursor) {
      try {
        const user = await users.findOne({ _id: member.userId })
        const displayName = user?.displayName || user?.username || 'Unknown'
        const avatar = user?.avatar || null
        const language = user?.systemLanguage || 'en'

        const participantDoc = {
          _id: new ObjectId(),
          conversationId: member.conversationId,
          type: 'user',
          userId: member.userId,
          displayName,
          avatar,
          role: member.role || 'member',
          permissions: {
            canSendMessages: member.canSendMessage ?? true,
            canSendFiles: member.canSendFiles ?? true,
            canSendImages: member.canSendImages ?? true,
            canSendVideos: member.canSendVideos ?? true,
            canSendAudios: member.canSendAudios ?? true,
            canSendLocations: member.canSendLocations ?? true,
            canSendLinks: member.canSendLinks ?? true,
          },
          language,
          isActive: member.isActive ?? true,
          isOnline: false,
          lastActiveAt: new Date(),
          joinedAt: member.joinedAt || new Date(),
          leftAt: member.leftAt || null,
          bannedAt: null,
          nickname: member.nickname || null,
          anonymousSession: null,
          sessionTokenHash: null,
        }

        const key = `${member.conversationId.toString()}:${member.userId.toString()}`
        memberToParticipant.set(key, participantDoc._id.toString())

        if (!DRY_RUN) {
          await participants.insertOne(participantDoc)
        }
        stats.participantsFromMembers++
        processed++
        if (processed % 100 === 0) log(`  Processed ${processed}/${memberCount} members`)
      } catch (err) {
        stats.errors.push(`Member ${member._id}: ${err}`)
      }
    }
    log(`  Phase 1 complete: ${stats.participantsFromMembers} participants created from members`)

    // ========== PHASE 2: AnonymousParticipant -> Participant ==========
    log('Phase 2: Migrating AnonymousParticipants to Participants...')
    const anonymousParticipants = db.collection('AnonymousParticipant')
    const anonCount = await anonymousParticipants.countDocuments()
    log(`  Found ${anonCount} AnonymousParticipants`)

    const anonCursor = anonymousParticipants.find()
    processed = 0

    for await (const anon of anonCursor) {
      try {
        const tokenHash = anon.sessionToken ? hashSessionToken(anon.sessionToken) : null
        const displayName = [anon.firstName, anon.lastName].filter(Boolean).join(' ') || anon.username || 'Anonymous'

        const participantDoc = {
          _id: new ObjectId(),
          conversationId: anon.conversationId,
          type: 'anonymous',
          userId: null,
          displayName,
          avatar: null,
          role: 'member',
          permissions: {
            canSendMessages: anon.canSendMessages ?? true,
            canSendFiles: anon.canSendFiles ?? false,
            canSendImages: anon.canSendImages ?? true,
            canSendVideos: anon.canSendVideos ?? false,
            canSendAudios: anon.canSendAudios ?? false,
            canSendLocations: anon.canSendLocations ?? false,
            canSendLinks: anon.canSendLinks ?? false,
          },
          language: anon.language || 'fr',
          isActive: anon.isActive ?? true,
          isOnline: anon.isOnline ?? false,
          lastActiveAt: anon.lastActiveAt || new Date(),
          joinedAt: anon.joinedAt || new Date(),
          leftAt: anon.leftAt || null,
          bannedAt: null,
          nickname: null,
          sessionTokenHash: tokenHash,
          anonymousSession: {
            shareLinkId: anon.shareLinkId?.toString() || '',
            session: {
              sessionTokenHash: tokenHash || '',
              ipAddress: anon.ipAddress || null,
              country: anon.country || null,
              deviceFingerprint: anon.deviceFingerprint || null,
              connectedAt: anon.joinedAt || new Date(),
            },
            profile: {
              firstName: anon.firstName || '',
              lastName: anon.lastName || '',
              username: anon.username || '',
              email: anon.email || null,
              birthday: anon.birthday || null,
            },
            rights: null,
          },
        }

        anonToParticipant.set(anon._id.toString(), participantDoc._id.toString())

        if (!DRY_RUN) {
          await participants.insertOne(participantDoc)
        }
        stats.participantsFromAnonymous++
        processed++
        if (processed % 100 === 0) log(`  Processed ${processed}/${anonCount} anonymous`)
      } catch (err) {
        stats.errors.push(`Anonymous ${anon._id}: ${err}`)
      }
    }
    log(`  Phase 2 complete: ${stats.participantsFromAnonymous} participants created from anonymous`)

    // ========== PHASE 3: Rewrite Message.senderId ==========
    log('Phase 3: Rewriting Message sender IDs...')
    const messages = db.collection('Message')
    const msgCount = await messages.countDocuments()
    log(`  Found ${msgCount} messages`)

    const msgCursor = messages.find({}, { projection: { _id: 1, conversationId: 1, senderId: 1, anonymousSenderId: 1 } })
    const msgBulkOps: Document[] = []
    processed = 0

    for await (const msg of msgCursor) {
      try {
        let newSenderId: string | null = null

        if (msg.senderId) {
          // Registered user message - lookup participant by conversationId + userId
          const key = `${msg.conversationId.toString()}:${msg.senderId.toString()}`
          newSenderId = memberToParticipant.get(key) || null
        } else if (msg.anonymousSenderId) {
          // Anonymous message - lookup by old anonymous participant ID
          newSenderId = anonToParticipant.get(msg.anonymousSenderId.toString()) || null
        }

        if (newSenderId) {
          msgBulkOps.push({
            updateOne: {
              filter: { _id: msg._id },
              update: {
                $set: { senderId: new ObjectId(newSenderId) },
                $unset: { anonymousSenderId: '' },
              },
            },
          })
          stats.messagesUpdated++
        } else {
          stats.errors.push(`Message ${msg._id}: no participant found for sender`)
        }

        processed++
        if (processed % 1000 === 0) log(`  Processed ${processed}/${msgCount} messages`)

        // Flush bulk ops every 500
        if (msgBulkOps.length >= 500) {
          if (!DRY_RUN) await messages.bulkWrite(msgBulkOps)
          msgBulkOps.length = 0
        }
      } catch (err) {
        stats.errors.push(`Message ${msg._id}: ${err}`)
      }
    }
    if (msgBulkOps.length > 0 && !DRY_RUN) {
      await messages.bulkWrite(msgBulkOps)
    }
    log(`  Phase 3 complete: ${stats.messagesUpdated} messages updated`)

    // ========== PHASE 4-7: Rewrite all dual FK collections ==========
    const dualFkCollections = [
      { name: 'MessageStatusEntry', stat: 'statusEntriesUpdated' as const },
      { name: 'ConversationReadCursor', stat: 'readCursorsUpdated' as const },
      { name: 'Reaction', stat: 'reactionsUpdated' as const },
      { name: 'AttachmentStatusEntry', stat: 'attachmentStatusUpdated' as const },
      { name: 'AttachmentReaction', stat: 'attachmentReactionsUpdated' as const },
      { name: 'CallParticipant', stat: 'callParticipantsUpdated' as const },
      { name: 'TrackingLinkClick', stat: 'trackingClicksUpdated' as const },
    ]

    for (const { name, stat } of dualFkCollections) {
      log(`Phase: Rewriting ${name}...`)
      const collection = db.collection(name)
      const count = await collection.countDocuments()
      log(`  Found ${count} ${name} documents`)

      const cursor = collection.find({}, {
        projection: { _id: 1, conversationId: 1, userId: 1, anonymousId: 1, messageId: 1 },
      })
      const bulkOps: Document[] = []
      processed = 0

      for await (const doc of cursor) {
        try {
          let participantId: string | null = null

          if (doc.userId) {
            // Need conversationId to build the key
            let convId = doc.conversationId?.toString()
            if (!convId && doc.messageId) {
              // Fetch conversationId from the message
              const msg = await messages.findOne(
                { _id: doc.messageId },
                { projection: { conversationId: 1 } },
              )
              convId = msg?.conversationId?.toString()
            }
            if (convId) {
              const key = `${convId}:${doc.userId.toString()}`
              participantId = memberToParticipant.get(key) || null
            }
          } else if (doc.anonymousId) {
            participantId = anonToParticipant.get(doc.anonymousId.toString()) || null
          }

          if (participantId) {
            bulkOps.push({
              updateOne: {
                filter: { _id: doc._id },
                update: {
                  $set: { participantId: new ObjectId(participantId) },
                  $unset: { userId: '', anonymousId: '' },
                },
              },
            })
            stats[stat]++
          }

          processed++
          if (processed % 1000 === 0) log(`  Processed ${processed}/${count} ${name}`)

          if (bulkOps.length >= 500) {
            if (!DRY_RUN) await collection.bulkWrite(bulkOps)
            bulkOps.length = 0
          }
        } catch (err) {
          stats.errors.push(`${name} ${doc._id}: ${err}`)
        }
      }
      if (bulkOps.length > 0 && !DRY_RUN) {
        await collection.bulkWrite(bulkOps)
      }
      log(`  ${name} complete: ${stats[stat]} updated`)
    }

    // ========== Mention migration ==========
    log('Phase: Rewriting Mention.mentionedParticipantId...')
    const mentionsColl = db.collection('Mention')
    const mentionCount = await mentionsColl.countDocuments()
    const mentionCursor = mentionsColl.find({}, {
      projection: { _id: 1, conversationId: 1, mentionedUserId: 1, messageId: 1 },
    })
    const mentionOps: Document[] = []
    processed = 0

    for await (const doc of mentionCursor) {
      try {
        if (doc.mentionedUserId) {
          let convId = doc.conversationId?.toString()
          if (!convId && doc.messageId) {
            const msg = await messages.findOne(
              { _id: doc.messageId },
              { projection: { conversationId: 1 } },
            )
            convId = msg?.conversationId?.toString()
          }
          if (convId) {
            const key = `${convId}:${doc.mentionedUserId.toString()}`
            const participantId = memberToParticipant.get(key)
            if (participantId) {
              mentionOps.push({
                updateOne: {
                  filter: { _id: doc._id },
                  update: {
                    $set: { mentionedParticipantId: new ObjectId(participantId) },
                    $unset: { mentionedUserId: '' },
                  },
                },
              })
              stats.mentionsUpdated++
            }
          }
        }
        processed++
        if (mentionOps.length >= 500) {
          if (!DRY_RUN) await mentionsColl.bulkWrite(mentionOps)
          mentionOps.length = 0
        }
      } catch (err) {
        stats.errors.push(`Mention ${doc._id}: ${err}`)
      }
    }
    if (mentionOps.length > 0 && !DRY_RUN) {
      await mentionsColl.bulkWrite(mentionOps)
    }
    log(`  Mentions complete: ${stats.mentionsUpdated} updated`)

    // ========== PHASE 8: Cleanup ==========
    if (!DRY_RUN) {
      log('Phase 8: Dropping old collections...')
      try {
        await db.collection('ConversationMember').drop()
        log('  Dropped ConversationMember')
      } catch { log('  ConversationMember already dropped or not found') }

      try {
        await db.collection('AnonymousParticipant').drop()
        log('  Dropped AnonymousParticipant')
      } catch { log('  AnonymousParticipant already dropped or not found') }
    } else {
      log('Phase 8: Would drop ConversationMember and AnonymousParticipant (dry run)')
    }

    // ========== PHASE 9: Verification ==========
    log('Phase 9: Verification...')
    const participantCount = await participants.countDocuments()
    const expectedCount = stats.participantsFromMembers + stats.participantsFromAnonymous
    log(`  Participants created: ${participantCount} (expected: ${expectedCount})`)

    if (!DRY_RUN) {
      const msgsWithAnonymousSender = await messages.countDocuments({ anonymousSenderId: { $exists: true } })
      log(`  Messages with orphan anonymousSenderId: ${msgsWithAnonymousSender}`)

      const msgsWithoutSender = await messages.countDocuments({ senderId: { $exists: false } })
      log(`  Messages without senderId: ${msgsWithoutSender}`)
    }

    // ========== SUMMARY ==========
    log('========== MIGRATION SUMMARY ==========')
    log(`Participants from members:       ${stats.participantsFromMembers}`)
    log(`Participants from anonymous:     ${stats.participantsFromAnonymous}`)
    log(`Messages updated:                ${stats.messagesUpdated}`)
    log(`Status entries updated:          ${stats.statusEntriesUpdated}`)
    log(`Read cursors updated:            ${stats.readCursorsUpdated}`)
    log(`Reactions updated:               ${stats.reactionsUpdated}`)
    log(`Attachment status updated:       ${stats.attachmentStatusUpdated}`)
    log(`Attachment reactions updated:    ${stats.attachmentReactionsUpdated}`)
    log(`Call participants updated:       ${stats.callParticipantsUpdated}`)
    log(`Tracking clicks updated:         ${stats.trackingClicksUpdated}`)
    log(`Mentions updated:                ${stats.mentionsUpdated}`)
    log(`Errors:                          ${stats.errors.length}`)
    if (stats.errors.length > 0) {
      log('Errors:')
      stats.errors.slice(0, 20).forEach(e => log(`  - ${e}`))
      if (stats.errors.length > 20) log(`  ... and ${stats.errors.length - 20} more`)
    }
    log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
    log('========================================')
  } finally {
    await client.close()
  }
}

main().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
