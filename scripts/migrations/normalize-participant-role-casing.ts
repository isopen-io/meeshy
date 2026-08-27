// Normalise la casse de `Participant.role` vers les minuscules — la SEULE
// casse que le schéma déclare (`@default("member")`) et que les gardes
// comparent (`hasMinimumMemberRole`, `role === 'admin'` dans
// `routes/conversations/participants.ts`).
//
// Pourquoi
// --------
// Avant #3875, `AuthService.register` et `InitService.addUserToMeeshyConversation`
// écrivaient `'MEMBER'` / `'ADMIN'` / `'CREATOR'` (majuscules) — un « ADMIN » du
// salon global n'était administrateur nulle part, aucune garde ne le
// reconnaissant. Le code écrivain est corrigé ; ce script répare les lignes
// DÉJÀ en base, écrites par l'ancien code.
//
// Comment une ligne est classée
// -----------------------------
// Le candidat de remplacement est `role.trim().toLowerCase()`. Il n'est retenu
// que s'il fait PARTIE des quatre rôles reconnus
// (`creator`/`admin`/`moderator`/`member`) — un rôle inconnu (typo, valeur
// legacy jamais vue) est RAPPORTÉ et SAUTÉ, jamais deviné.
//
// La ligne est ensuite candidate dès que la valeur STOCKÉE diffère de ce
// candidat — jamais « dès que sa forme rognée n'est pas canonique », qui
// laissait `' member '` en base sous prétexte qu'il se replie bien. Un `role`
// ABSENT est laissé tel quel : il relève du défaut du schéma
// (`@default("member")`), et le matérialiser serait une écriture que personne
// n'a demandée.
//
// Le script est IDEMPOTENT : au second passage, la valeur stockée EST son
// candidat, donc `planNormalize` ne trouve plus rien à faire.
//
// Écriture explicite
// -------------------
// Le script NE MODIFIE RIEN par défaut : il faut `--apply`. Sans ce drapeau, il
// se contente de COMPTER et de lister les lignes concernées (dry-run).
//
// Usage:
//   npx tsx scripts/migrations/normalize-participant-role-casing.ts [--apply] [--production]
//
// Default (dry-run): inspecte et rapporte le compte de lignes affectées, sans
//   écrire, sur MONGODB_URL/DATABASE_URL depuis .env (base locale/dev).
//   `--dry-run` est accepté mais inutile : c'est le comportement par défaut,
//   et SEUL `--apply` écrit.
// --apply:      applique la normalisation en base.
// --production: utilise MONGODB_PRODUCTION_URL au lieu de MONGODB_URL.
//
// ⚠️ Ne JAMAIS lancer --apply --production sans confirmation humaine séparée —
// voir le commentaire de clôture de l'issue #3875 pour la commande exacte et
// le compte de lignes mesuré en dry-run local.

import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv'
import path from 'node:path'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

/**
 * MIROIR de `Object.values(MemberRole)` (packages/shared/types/role-types.ts).
 * Recopié et non importé : `scripts/` n'a pas de node_modules propre et
 * `@meeshy/shared` n'est pas résolvable depuis la racine (bun installe les
 * workspaces en mode isolé). La garde de dérive vit dans le test, qui lit
 * `role-types.ts` sur le disque et compare les deux listes.
 */
export const CANONICAL_MEMBER_ROLES = ['creator', 'admin', 'moderator', 'member'] as const
export type CanonicalMemberRole = (typeof CANONICAL_MEMBER_ROLES)[number]

const isCanonical = (value: string): value is CanonicalMemberRole =>
  (CANONICAL_MEMBER_ROLES as readonly string[]).includes(value)

export type ParticipantRow = {
  _id: string
  role: string | null | undefined
}

export type RoleFix = {
  id: string
  from: string
  to: CanonicalMemberRole
}

export type RoleSkip = {
  id: string
  role: string
  reason: 'unrecognized-role'
}

export type NormalizePlan = {
  fixes: readonly RoleFix[]
  skips: readonly RoleSkip[]
}

/**
 * Décide, pour un jeu complet de participations, lesquelles normaliser et
 * lesquelles sauter. Pure : aucune I/O, donc testable sans base.
 */
export function planNormalize(participants: readonly ParticipantRow[]): NormalizePlan {
  const fixes: RoleFix[] = []
  const skips: RoleSkip[] = []

  for (const participant of participants) {
    // Un `role` ABSENT relève du défaut du schéma (`@default("member")`) : le
    // MATÉRIALISER serait une écriture que personne n'a demandée.
    if (participant.role == null) continue

    const candidate = participant.role.trim().toLowerCase()
    if (!isCanonical(candidate)) {
      skips.push({ id: participant._id, role: participant.role, reason: 'unrecognized-role' })
      continue
    }

    // Comparé à la valeur STOCKÉE, jamais à sa forme rognée — c'est ce qui rend
    // le script idempotent au second passage ET ce qui rattrape `' member '`.
    // Classer sur le rognage faisait sortir cette ligne par « déjà canonique »
    // alors que la BASE porte encore ses espaces : `hasMinimumMemberRole` y
    // indexe `MEMBER_ROLE_HIERARCHY[' member ']` → `undefined` → niveau 0, donc
    // un membre RÉTROGRADÉ sous `member`, en silence, et le `role: { in: [...] }`
    // de `participants.ts` ne le reconnaît pas davantage. Une ligne qui
    // s'écrivait déjà exactement `'member'` ne produit, elle, aucun fix.
    if (participant.role === candidate) continue

    fixes.push({ id: participant._id, from: participant.role, to: candidate })
  }

  return { fixes, skips }
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

async function main() {
  const APPLY = process.argv.includes('--apply')
  const PRODUCTION = process.argv.includes('--production')

  const MONGODB_URL = PRODUCTION
    ? process.env.MONGODB_PRODUCTION_URL
    : process.env.MONGODB_URL || process.env.DATABASE_URL

  if (!MONGODB_URL) {
    console.error('No MongoDB URL found. Set MONGODB_URL or DATABASE_URL in .env')
    process.exit(1)
  }

  const client = new MongoClient(MONGODB_URL)
  await client.connect()
  log(`Connected (${PRODUCTION ? 'PRODUCTION' : 'local'}, ${APPLY ? 'APPLY' : 'DRY-RUN'})`)

  try {
    const collection = client.db().collection('Participant')

    // `Participant` porte une ligne par (conversation, identité) : la
    // collection entière ne tient pas en mémoire sur une base de production, et
    // ce script n'a encore JAMAIS tourné — un `find({})` y serait découvert le
    // jour du dry-run, c'est-à-dire au pire moment. Seules les lignes
    // CANDIDATES sont ramenées : `$nin` sur les quatre valeurs canoniques
    // laisse passer toute autre casse (`'ADMIN'`), tout espacement fautif
    // (`' member '`) et les lignes SANS `role` (un champ absent n'égale aucune
    // valeur), que `planNormalize` sait déjà laisser tranquilles.
    //
    // Le TOTAL reste rapporté — il vient d'un `countDocuments`, qui ne ramène
    // rien : un rapport de dry-run qui ne dit pas sur quelle population il a
    // travaillé n'est pas un rapport.
    const total = await collection.countDocuments({})
    const docs = await collection
      .find({ role: { $nin: [...CANONICAL_MEMBER_ROLES] } }, { projection: { role: 1 } })
      .toArray()

    const participants: ParticipantRow[] = docs.map((doc) => ({
      _id: String(doc._id),
      role: (doc.role as string | undefined) ?? null,
    }))

    const plan = planNormalize(participants)

    log(`${total} participations en base, ${participants.length} candidates — ${plan.fixes.length} à normaliser, ${plan.skips.length} sautées`)
    for (const fix of plan.fixes) {
      log(`  FIX  ${fix.id}  "${fix.from}" → "${fix.to}"`)
    }
    for (const skip of plan.skips) {
      log(`  SKIP ${skip.id}  "${skip.role}"  motif=${skip.reason}`)
    }

    if (!APPLY) {
      log(`DRY-RUN — rien n'a été écrit. ${plan.fixes.length} ligne(s) seraient normalisées. Relancer avec --apply pour appliquer.`)
      return
    }

    for (const fix of plan.fixes) {
      await collection.updateOne({ _id: new ObjectId(fix.id) }, { $set: { role: fix.to } })
      log(`  APPLIED ${fix.id}  "${fix.from}" → "${fix.to}"`)
    }
    log(`${plan.fixes.length} ligne(s) normalisée(s).`)
  } finally {
    await client.close()
    log('Disconnected')
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
