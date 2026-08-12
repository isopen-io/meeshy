// Répare `TrackingLink.createdBy` : ramène les lignes keyées par `Participant.id`
// vers le `User.id` que la colonne signifie partout ailleurs.
//
// Pourquoi
// --------
// `TrackingLink.createdBy` est un `User.id` — le schéma le dit (« Utilisateur qui
// a créé le lien (null si anonyme) ») et `routes/tracking-links/tracking.ts` le lit
// comme tel : il y compare `userId` pour lister « mes liens », calculer les stats,
// et AUTORISER l'accès (`createdBy !== userId` ⇒ 403).
//
// Le chemin d'ENVOI d'un message y écrivait `Message.senderId`, qui est un
// `Participant.id` — un espace d'ids disjoint. Un lien créé en tapant `[[url]]`
// dans un message n'apparaît donc jamais dans la liste de son auteur, ne compte
// dans aucune de ses stats, et son auteur se voit REFUSER l'accès à son propre
// lien. Le code a été corrigé (`MessageProcessor` résout désormais le `User.id`
// derrière le participant), mais le correctif ne vaut que pour les liens à venir :
// ce script aligne ceux déjà écrits.
//
// Comment une ligne est classée
// -----------------------------
// L'id porté est cherché dans `Participant`. S'il y correspond un document, la
// ligne est keyée participant et doit être réécrite avec le `userId` de ce
// participant. Sinon elle est déjà keyée utilisateur et n'est pas touchée. Les
// deux espaces sont disjoints (deux collections, des ObjectId distincts), donc le
// classement est déterministe — et le script est idempotent : un second passage ne
// trouve plus aucun participant à réécrire.
//
// Ce que ce script ne fait JAMAIS : supprimer
// -------------------------------------------
// Contrairement à `repair-mention-user-ids.ts`, qui supprime la ligne redondante
// quand une réécriture entre en collision avec l'unicité, ce script ne supprime
// rien. Un `TrackingLink` porte un `token` qui EST une URL publique (`/l/<token>`)
// possiblement déjà partagée, et `TrackingLinkClick` référence la ligne : la
// détruire casserait un lien vivant et perdrait son historique de clics. Une
// collision sur l'unicité applicative `(targetId, createdBy)` est donc SIGNALÉE et
// la ligne laissée intacte — un lien mal attribué reste préférable à un lien mort.
//
// Un participant ANONYME (aucun `userId`) est signalé et laissé intact lui aussi :
// le remettre à `null` serait plus fidèle au schéma, mais détruirait la seule
// trace de provenance que la ligne porte, pour un gain nul — aucun `User.id` ne
// pouvant égaler un `Participant.id`, le lien est déjà sans propriétaire effectif.
//
// Écriture explicite
// -----------------
// Ce script NE MODIFIE RIEN par défaut : il faut `--apply`. Un `--dry-run` oublié
// sur un script qui écrit par défaut est irréversible ; l'inverse ne coûte qu'un
// second lancement.
//
// Usage:
//   npx tsx scripts/migrations/repair-tracking-link-created-by.ts [--apply] [--production]
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
  unowned: number
  alreadyUserKeyed: number
  rewritten: number
  collisionLeftAsIs: number
  anonymousParticipant: number
  errors: string[]
}

async function main() {
  const stats: RepairStats = {
    scanned: 0,
    unowned: 0,
    alreadyUserKeyed: 0,
    rewritten: 0,
    collisionLeftAsIs: 0,
    anonymousParticipant: 0,
    errors: [],
  }

  log(`Connecting to MongoDB... ${APPLY ? '(APPLY)' : '(inspection only — pass --apply to write)'}`)
  const client = new MongoClient(MONGODB_URL!)
  await client.connect()
  const db = client.db()

  try {
    const links = db.collection('TrackingLink')
    const participants = db.collection('Participant')

    const total = await links.countDocuments()
    log(`Scanning ${total} TrackingLink documents...`)

    // ---- Passe 1 : collecter, sans rien décider encore.
    //
    // Seules des CLÉS sont retenues en mémoire, pas les documents : la collection
    // peut être volumineuse et rien ici n'a besoin du reste de la ligne.
    const docs: { id: ObjectId; createdBy: ObjectId; targetId: string | null }[] = []

    const cursor = links.find({}, { projection: { _id: 1, createdBy: 1, targetId: 1 } })
    for await (const doc of cursor) {
      stats.scanned++
      const currentId = doc.createdBy
      // `null` est une valeur LÉGITIME : le lien d'un partageur anonyme n'a pas
      // de propriétaire, et le schéma le prévoit.
      if (!currentId) {
        stats.unowned++
        continue
      }
      try {
        docs.push({
          id: doc._id,
          createdBy: typeof currentId === 'string' ? new ObjectId(currentId) : currentId,
          targetId: doc.targetId ? doc.targetId.toString() : null,
        })
      } catch (err) {
        stats.errors.push(`TrackingLink ${doc._id}: ${err}`)
      }
      if (stats.scanned % 1000 === 0) log(`  Scanned ${stats.scanned}/${total}`)
    }

    // Les participants sont résolus par lots : une requête par document ferait de
    // ce script une tempête de round-trips sur une collection volumineuse.
    const BATCH = 500
    const participantUserById = new Map<string, string | null>()
    const distinctIds = [...new Map(docs.map(d => [d.createdBy.toString(), d.createdBy])).values()]
    for (let i = 0; i < distinctIds.length; i += BATCH) {
      const slice = distinctIds.slice(i, i + BATCH)
      const found = await participants
        .find({ _id: { $in: slice } }, { projection: { userId: 1 } })
        .toArray()
      for (const p of found) {
        participantUserById.set(p._id.toString(), p.userId ? p.userId.toString() : null)
      }
    }

    // L'unicité applicative `(targetId, createdBy)` est portée par un index unique
    // PARTIEL (cf. schema.prisma) : elle ne s'applique QU'AUX liens à cible interne.
    // Les couples déjà pris sont relevés avant toute réécriture — une ligne déjà
    // keyée utilisateur peut apparaître après celle qu'elle rendrait illégale, et
    // l'ordre du curseur n'est pas un contrat.
    const takenTargetOwner = new Set<string>()
    for (const doc of docs) {
      if (doc.targetId === null) continue
      if (participantUserById.has(doc.createdBy.toString())) continue
      takenTargetOwner.add(`${doc.targetId}:${doc.createdBy.toString()}`)
    }

    // ---- Passe 2 : composer les écritures.
    const ops: AnyBulkWriteOperation<Document>[] = []
    for (const doc of docs) {
      const key = doc.createdBy.toString()
      if (!participantUserById.has(key)) {
        // Aucun participant ne porte cet id : la ligne est déjà keyée utilisateur.
        stats.alreadyUserKeyed++
        continue
      }
      const targetUserId = participantUserById.get(key)
      if (!targetUserId) {
        stats.anonymousParticipant++
        continue
      }
      if (doc.targetId !== null) {
        const ownerKey = `${doc.targetId}:${targetUserId}`
        if (takenTargetOwner.has(ownerKey)) {
          // Réécrire violerait l'unicité `(targetId, createdBy)`. On ne supprime
          // pas : le token est une URL publique et `TrackingLinkClick` référence
          // la ligne.
          stats.collisionLeftAsIs++
          continue
        }
        takenTargetOwner.add(ownerKey)
      }
      stats.rewritten++
      ops.push({
        updateOne: {
          filter: { _id: doc.id },
          update: { $set: { createdBy: new ObjectId(targetUserId) } },
        },
      })
    }

    if (ops.length > 0 && APPLY) {
      await links.bulkWrite(ops, { ordered: false })
    }

    log('')
    log('=== Repair summary ===')
    log(`  Scanned:                    ${stats.scanned}`)
    log(`  Unowned (createdBy null):   ${stats.unowned}`)
    log(`  Already user-keyed:         ${stats.alreadyUserKeyed}`)
    log(`  Rewritten to User.id:       ${stats.rewritten}`)
    log(`  Collisions (left as-is):    ${stats.collisionLeftAsIs}`)
    log(`  Anonymous (left as-is):     ${stats.anonymousParticipant}`)
    log(`  Errors:                     ${stats.errors.length}`)
    for (const err of stats.errors.slice(0, 20)) log(`    ${err}`)
    if (!APPLY && stats.rewritten > 0) {
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
