/**
 * Publie le pack de stickers D'EXEMPLE « exemple-meeshy » (#10157, demande
 * porteur 2026-10-11) contre une passerelle, par le VRAI circuit : proposition
 * multipart puis publication par un modérateur. Idempotent ; refuse toute
 * passerelle qui n'est ni le staging ni une machine locale.
 *
 * FAÇADE MINCE : la logique vit dans `src/services/packs/samplePackPublisher.ts`.
 *
 * Le pack est signé « Meeshy », identité RÉSERVÉE au compte officiel (#16274) :
 * il se propose donc depuis le compte désigné par `MEESHY_OFFICIAL_ACCOUNT_ID`
 * de la passerelle — « Meeshy Sama » (`meeshy`, BIGBOSS). Tout autre compte
 * reçoit 403 PUBLISHER_RESERVED.
 *
 * Les identifiants viennent de l'environnement, ne sont jamais affichés et ne
 * vivent jamais dans le dépôt :
 *   OFFICIAL_USER / OFFICIAL_PASSWORD     le compte officiel, qui propose
 *   ADMIN_USER / ADMIN_PASSWORD           un compte qui a `canModerateContent` (défaut : le compte officiel, BIGBOSS)
 *
 * Usage :
 *   cd services/gateway
 *   BASE_URL=https://gate.staging.meeshy.me OFFICIAL_USER=… OFFICIAL_PASSWORD=… bunx tsx scripts/publish-sample-sticker-pack.ts
 */
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { publishSampleStickerPack, type Credentials } from '../src/services/packs/samplePackPublisher';

// Les WebP du pack d'exemple vivent avec la passerelle depuis que les `MeeStickers` du SDK sont passés en
// `.lottie` (94e9d51898) : une soumission de pack n'accepte que des images, et ces quatre-là en restent.
const MEE_STICKERS = resolve(__dirname, '../assets/sample-sticker-pack');

function credentials(userKey: string, passwordKey: string, fallback?: readonly [string, string]): Credentials {
  const username = process.env[userKey] ?? (fallback ? process.env[fallback[0]] : undefined);
  const password = process.env[passwordKey] ?? (fallback ? process.env[fallback[1]] : undefined);
  if (!username || !password) throw new Error(`Identifiants manquants : ${userKey} / ${passwordKey}${fallback ? ` (ou ${fallback.join(' / ')})` : ''}.`);
  return { username, password };
}

async function main(): Promise<void> {
  const baseUrl = process.env.BASE_URL;
  if (!baseUrl) throw new Error('BASE_URL manquante (ex. https://gate.staging.meeshy.me).');
  const outcome = await publishSampleStickerPack({
    baseUrl,
    fetch,
    readAsset: (file) => readFile(join(MEE_STICKERS, file)),
    submitter: credentials('OFFICIAL_USER', 'OFFICIAL_PASSWORD'),
    reviewer: credentials('ADMIN_USER', 'ADMIN_PASSWORD', ['OFFICIAL_USER', 'OFFICIAL_PASSWORD']),
  });
  console.log(outcome === 'published' ? '✓ Pack « exemple-meeshy » proposé et publié.' : '✓ Pack « exemple-meeshy » déjà publié : rien à faire.');
}

main().catch((error: unknown) => {
  console.error('Échec de la publication :', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
