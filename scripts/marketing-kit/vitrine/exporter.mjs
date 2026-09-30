#!/usr/bin/env node
// Exporte les fixtures d'une langue (#8855).
//   node scripts/marketing-kit/vitrine/exporter.mjs --lang fr --maintenant 2026-09-30T12:00:00.000Z --sortie <fichier>
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { exporterVitrine } from './fixtures.mjs'

const { values } = parseArgs({
  options: { lang: { type: 'string', default: 'fr' }, maintenant: { type: 'string' }, sortie: { type: 'string' } },
})
const maintenant = values.maintenant ? new Date(values.maintenant) : new Date()
const json = `${JSON.stringify(exporterVitrine({ lang: values.lang, maintenant }), null, 1)}\n`
if (values.sortie) writeFileSync(values.sortie, json)
else process.stdout.write(json)
