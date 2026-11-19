import type { Prisma } from '@meeshy/shared/prisma/client';
import { unsetOrNull } from './utils/prisma-unset';

export const W = {
  isActive: true,
  AND: [unsetOrNull('deletedAt'), unsetOrNull('deactivatedAt')],
} as const satisfies Prisma.UserWhereInput;
