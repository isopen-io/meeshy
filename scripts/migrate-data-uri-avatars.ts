import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const UPLOAD_PATH = process.env.UPLOAD_PATH || '/app/uploads';
const PUBLIC_URL = process.env.PUBLIC_URL || process.env.BACKEND_URL || 'http://localhost:3000';

function dataUriToBuffer(dataUri: string): { buffer: Buffer; ext: string; mimeType: string } {
  const match = dataUri.match(/^data:(image\/(\w+));base64,(.+)$/);
  if (!match) throw new Error('Invalid data URI');
  return {
    buffer: Buffer.from(match[3], 'base64'),
    ext: match[2] === 'jpeg' ? 'jpg' : match[2],
    mimeType: match[1],
  };
}

function buildUrl(filePath: string): string {
  return `${PUBLIC_URL}/api/v1/attachments/file/${encodeURIComponent(filePath)}`;
}

async function migrateModel(modelName: string, findMany: () => Promise<{ id: string; avatar: string | null }[]>, update: (id: string, avatar: string) => Promise<void>) {
  const records = await findMany();
  const dataUriRecords = records.filter(r => r.avatar?.startsWith('data:'));

  if (dataUriRecords.length === 0) {
    console.log(`[${modelName}] No data URI avatars found.`);
    return;
  }

  console.log(`[${modelName}] Found ${dataUriRecords.length} data URI avatar(s) to migrate.`);

  for (const record of dataUriRecords) {
    try {
      const { buffer, ext } = dataUriToBuffer(record.avatar!);
      const dirPath = path.join(UPLOAD_PATH, 'avatars', modelName.toLowerCase());
      fs.mkdirSync(dirPath, { recursive: true });

      const fileName = `${record.id}.${ext}`;
      const filePath = path.join('avatars', modelName.toLowerCase(), fileName);
      const fullPath = path.join(UPLOAD_PATH, filePath);

      fs.writeFileSync(fullPath, buffer);
      const url = buildUrl(filePath);

      await update(record.id, url);
      console.log(`  [OK] ${record.id} -> ${url} (${buffer.length} bytes)`);
    } catch (err) {
      console.error(`  [FAIL] ${record.id}: ${err}`);
    }
  }
}

async function main() {
  console.log('=== Migration Data URI Avatars ===');
  console.log(`UPLOAD_PATH: ${UPLOAD_PATH}`);
  console.log(`PUBLIC_URL: ${PUBLIC_URL}`);
  console.log('');

  await migrateModel('User',
    () => prisma.user.findMany({ where: { avatar: { startsWith: 'data:' } }, select: { id: true, avatar: true } }),
    (id, avatar) => prisma.user.update({ where: { id }, data: { avatar } }).then(() => {})
  );

  await migrateModel('Conversation',
    () => prisma.conversation.findMany({ where: { avatar: { startsWith: 'data:' } }, select: { id: true, avatar: true } }),
    (id, avatar) => prisma.conversation.update({ where: { id }, data: { avatar } }).then(() => {})
  );

  await migrateModel('ConversationMember',
    () => prisma.conversationMember.findMany({ where: { avatar: { startsWith: 'data:' } }, select: { id: true, avatar: true } }),
    (id, avatar) => prisma.conversationMember.update({ where: { id }, data: { avatar } }).then(() => {})
  );

  await migrateModel('Community',
    () => prisma.community.findMany({ where: { avatar: { startsWith: 'data:' } }, select: { id: true, avatar: true } }),
    (id, avatar) => prisma.community.update({ where: { id }, data: { avatar } }).then(() => {})
  );

  console.log('\n=== Migration Complete ===');
  await prisma.$disconnect();
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1); });
