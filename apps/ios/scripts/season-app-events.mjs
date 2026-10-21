#!/usr/bin/env node
/**
 * Réécrit le bloc `store.app_events` d'`apps/ios/andp.yml` depuis le calendrier des saisons (#10016, #10235).
 *
 *   node apps/ios/scripts/season-app-events.mjs [--yaml export.yaml | --calendar calendar.json] [--count 3] [--now AAAA-MM-JJ] [--write]
 *
 *  --yaml      le fichier téléchargé depuis l'admin web (« Exporter store.app_events »,
 *              `GET /api/v1/admin/game/seasons/app-events.yaml`) — pris tel quel ;
 *  --calendar  la réponse de `GET /api/v1/me/game/seasons/calendar` (enveloppe ou `data`) — les
 *              événements sont recalculés par la loi partagée ;
 *  (aucun)     le calendrier constant (saison 1 au 2026-12-21, saisons de 56 jours).
 *  --write     écrit `apps/ios/andp.yml` (sinon affiche le bloc) : on commite, on ouvre la PR,
 *              puis `andp store plan` / `andp store apply` / `andp store submit-events`.
 *
 * Exige `packages/shared` construit (`pnpm --filter @meeshy/shared build`). Les visuels des événements
 * (`fastlane/metadata/app_events/<key>/<locale>/event_card|event_details_page`) se fournissent à la main.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const law = await import(pathToFileURL(resolve(root, 'packages/shared/dist/utils/game/season-app-events.js')).href);
const scheduleLaw = await import(pathToFileURL(resolve(root, 'packages/shared/dist/utils/game/season-schedule.js')).href);

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const count = Number.parseInt(flag('--count') ?? '3', 10);
const today = flag('--now') ?? new Date().toISOString().slice(0, 10);

let block;
if (flag('--yaml')) {
  block = readFileSync(flag('--yaml'), 'utf8')
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join('\n');
} else {
  const raw = flag('--calendar') ? JSON.parse(readFileSync(flag('--calendar'), 'utf8')) : null;
  const schedule = scheduleLaw.normalizeSeasonSchedule(raw?.data ?? raw ?? scheduleLaw.DEFAULT_SEASON_SCHEDULE);
  const events = law.upcomingSeasonAppEvents(schedule, { dayKey: today, minuteOfDay: 0 }, count);
  const faults = events.flatMap((ev) => law.validateAppEvent(ev).map((f) => `${ev.key}: ${f}`));
  if (faults.length > 0) {
    console.error(`Événements hors des règles d'Apple :\n${faults.join('\n')}`);
    process.exit(1);
  }
  block = law.seasonAppEventsYaml(events);
}

if (!args.includes('--write')) {
  process.stdout.write(block);
} else {
  const file = resolve(root, 'apps/ios/andp.yml');
  writeFileSync(file, law.replaceAppEventsBlock(readFileSync(file, 'utf8'), block));
  console.log(`apps/ios/andp.yml : store.app_events réécrit (${(block.match(/- key:/g) ?? []).length} événement(s)).`);
}
