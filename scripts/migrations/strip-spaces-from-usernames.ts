// Retire les espaces des usernames legacy et rappelle leur identifiant aux
// personnes concernées.
//
// Pourquoi
// --------
// Le verrou Zod `^[a-zA-Z0-9_-]+$` est arrivé APRÈS l'inscription de quelques
// comptes ; deux d'entre eux portent un espace (`la lionne noire`,
// `vanel momo`). Un username avec espace casse la saisie d'une mention `@handle`
// et n'est plus reproductible par aucun chemin d'inscription.
//
// Comment une ligne est classée
// -----------------------------
// Toute ligne dont le username contient un caractère d'espacement est candidate.
// Le candidat est `username.replace(/\s+/g, '')`. Il n'est retenu que s'il
// satisfait TOUTES les vérifications : longueur 2–16, conforme à
// `usernamePatternSource`, et libre — aucun autre compte ne le porte, casse
// ignorée. Toute ligne qui échoue une vérification est RAPPORTÉE et SAUTÉE, jamais
// devinée. Le script est idempotent : au second passage, plus aucune ligne ne
// contient d'espace.
//
// Ce que le script n'écrit PAS
// ----------------------------
// `usernameHistory` reste intact. Le rate-limit de 30 jours de
// `PATCH /users/me/username` lit `usernameHistory[0].changedAt` : y déposer une
// entrée renverrait un 429 à ces personnes pendant un mois si elles voulaient se
// renommer elles-mêmes. Le champ n'est exposé à aucun client — la trace d'audit
// est le rapport ci-dessous.
//
// Le cache auth n'est pas invalidé : `authUserCacheKey` a un TTL de 60 s.
//
// Écriture explicite
// -----------------
// Le script NE MODIFIE RIEN par défaut : il faut `--apply`. Un `--dry-run` oublié
// sur un script qui écrit par défaut est irréversible ; l'inverse ne coûte qu'un
// second lancement.
//
// Usage:
//   npx tsx scripts/migrations/strip-spaces-from-usernames.ts [--apply] [--production]
//
// Default: inspecte et rapporte sans écrire, sur MONGODB_URL depuis .env
// --apply:      applique les renommages ET envoie le mail de rappel
// --production: utilise MONGODB_PRODUCTION_URL

import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv'
import path from 'node:path'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

/**
 * MIROIR de `usernamePatternSource` (packages/shared/types/api-schemas.ts).
 * Recopié et non importé : `scripts/` n'a pas de node_modules propre et
 * `@meeshy/shared` n'est pas résolvable depuis la racine (bun installe les
 * workspaces en mode isolé). La garde de dérive vit dans le test, qui lit
 * `api-schemas.ts` sur le disque et compare les deux littérales.
 */
export const USERNAME_PATTERN_SOURCE = '^[a-zA-Z0-9_-]+$'

const USERNAME_PATTERN = new RegExp(USERNAME_PATTERN_SOURCE)
const USERNAME_MIN_LENGTH = 2
const USERNAME_MAX_LENGTH = 16

export type UserRow = {
  _id: string
  username: string
  email: string | null
  firstName: string | null
  systemLanguage: string | null
}

export type Rename = {
  id: string
  from: string
  to: string
  email: string | null
  name: string
  language: string
}

export type Skip = {
  id: string
  username: string
  reason: 'too-short' | 'too-long' | 'still-invalid' | 'collision'
}

export type RenamePlan = {
  renames: readonly Rename[]
  skips: readonly Skip[]
}

/**
 * Décide, pour un jeu complet d'utilisateurs, lesquels renommer et lesquels
 * sauter. Pure : aucune I/O, donc testable sans base. Reçoit TOUTES les lignes —
 * les candidates comme les autres — pour détecter les collisions sans requête
 * supplémentaire.
 */
export function planRename(users: readonly UserRow[]): RenamePlan {
  const ownersByHandle = new Map<string, Set<string>>()
  for (const user of users) {
    const key = user.username.toLowerCase()
    const owners = ownersByHandle.get(key) ?? new Set<string>()
    owners.add(user._id)
    ownersByHandle.set(key, owners)
  }

  const renames: Rename[] = []
  const skips: Skip[] = []
  const seenIds = new Set<string>()

  for (const user of users) {
    if (!/\s/.test(user.username)) continue
    if (seenIds.has(user._id)) continue
    seenIds.add(user._id)

    const candidate = user.username.replace(/\s+/g, '')

    if (candidate.length < USERNAME_MIN_LENGTH) {
      skips.push({ id: user._id, username: user.username, reason: 'too-short' })
      continue
    }
    if (candidate.length > USERNAME_MAX_LENGTH) {
      skips.push({ id: user._id, username: user.username, reason: 'too-long' })
      continue
    }
    if (!USERNAME_PATTERN.test(candidate)) {
      skips.push({ id: user._id, username: user.username, reason: 'still-invalid' })
      continue
    }

    const owners = ownersByHandle.get(candidate.toLowerCase())
    const heldBySomeoneElse = owners !== undefined && [...owners].some((id) => id !== user._id)
    if (heldBySomeoneElse) {
      skips.push({ id: user._id, username: user.username, reason: 'collision' })
      continue
    }

    renames.push({
      id: user._id,
      from: user.username,
      to: candidate,
      email: user.email,
      name: user.firstName ?? user.username,
      language: user.systemLanguage ?? 'fr',
    })
  }

  return { renames, skips }
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
    const collection = client.db().collection('User')
    const docs = await collection
      .find({}, { projection: { username: 1, email: 1, firstName: 1, systemLanguage: 1 } })
      .toArray()

    const users: UserRow[] = docs.map((doc) => ({
      _id: String(doc._id),
      username: String(doc.username ?? ''),
      email: (doc.email as string | undefined) ?? null,
      firstName: (doc.firstName as string | undefined) ?? null,
      systemLanguage: (doc.systemLanguage as string | undefined) ?? null,
    }))

    const plan = planRename(users)

    log(`${users.length} comptes inspectés — ${plan.renames.length} à renommer, ${plan.skips.length} sautés`)
    for (const rename of plan.renames) {
      log(`  RENAME ${rename.id}  "${rename.from}" → "${rename.to}"  (${rename.email ?? 'aucun e-mail'}, ${rename.language})`)
    }
    for (const skip of plan.skips) {
      log(`  SKIP   ${skip.id}  "${skip.username}"  motif=${skip.reason}`)
    }

    if (!APPLY) {
      log('DRY-RUN — rien n\'a été écrit. Relancer avec --apply pour appliquer.')
      return
    }

    // Import dynamique : la résolution part du répertoire du fichier IMPORTÉ,
    // si bien qu'EmailService trouve son `@meeshy/shared` dans
    // services/gateway/node_modules. Un import statique depuis scripts/ échouerait.
    const { EmailService } = await import('../../services/gateway/src/services/EmailService.js')
    const emailService = new EmailService()

    for (const rename of plan.renames) {
      await collection.updateOne({ _id: new ObjectId(rename.id) }, { $set: { username: rename.to } })
      log(`  APPLIED ${rename.id}  "${rename.from}" → "${rename.to}"`)

      if (!rename.email) {
        log(`  MAIL SKIPPED ${rename.id} — aucune adresse e-mail`)
        continue
      }

      // Un échec d'envoi n'annule PAS le renommage : la base est déjà cohérente,
      // et le mail est un rappel, pas une confirmation. Il est signalé ici pour
      // renvoi manuel.
      try {
        const result = await emailService.sendUsernameReminderEmail({
          to: rename.email,
          name: rename.name,
          username: rename.to,
          language: rename.language,
        })
        log(`  MAIL ${result.success ? 'SENT' : 'FAILED'} ${rename.id} → ${rename.email}`)
      } catch (error) {
        log(`  MAIL FAILED ${rename.id} → ${rename.email} : ${error instanceof Error ? error.message : String(error)}`)
      }
    }
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
