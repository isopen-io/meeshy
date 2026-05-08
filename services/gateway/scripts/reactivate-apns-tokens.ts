/**
 * One-shot recovery script: clean up APNs tokens damaged by the production/sandbox
 * environment mismatch. Tokens that were issued by iOS debug builds (sandbox)
 * but sent to api.push.apple.com (production) accumulated `BadDeviceToken`
 * failures and got deactivated. Once the gateway routes by apnsEnvironment
 * (this fix), those tokens are useless: they were sandbox tokens routed to
 * prod, deactivated by Apple's response. Delete them so the iOS app's next
 * `/register-device-token` call inserts a fresh row with the correct
 * `apnsEnvironment="development"`.
 *
 * Run AFTER the gateway has been deployed with the dual-client routing.
 *
 * Usage:
 *   cd services/gateway
 *   pnpm tsx scripts/reactivate-apns-tokens.ts
 */
import { PrismaClient } from '@meeshy/shared/prisma/client';

async function main() {
  const prisma = new PrismaClient();

  try {
    // Find tokens deactivated specifically due to BadDeviceToken — those are
    // the sandbox-vs-prod mismatch victims. Other deactivation reasons
    // (NotRegistered, MismatchSenderId, etc.) reflect genuinely-revoked tokens
    // and should NOT be touched.
    const damaged = await prisma.pushToken.findMany({
      where: {
        type: { in: ['apns', 'voip'] },
        isActive: false,
        lastError: { contains: 'BadDeviceToken' },
      },
      select: { id: true, userId: true, type: true, lastError: true },
    });

    console.log(`Found ${damaged.length} APNs/VoIP tokens deactivated by BadDeviceToken`);

    if (damaged.length === 0) {
      return;
    }

    // Delete the rows. The iOS app re-registers on every cold launch, so
    // legitimate users will repopulate the table within minutes — with the
    // correct apnsEnvironment field this time.
    const deleted = await prisma.pushToken.deleteMany({
      where: {
        id: { in: damaged.map(t => t.id) },
      },
    });

    console.log(`Deleted ${deleted.count} damaged token rows.`);
    console.log('Affected users will re-register on next app launch.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
