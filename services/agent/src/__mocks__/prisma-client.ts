/* eslint-disable @typescript-eslint/no-explicit-any */

export class PrismaClient {
  [key: string]: any;
  constructor(..._args: unknown[]) {}
}

export type UserRole =
  | 'BIGBOSS'
  | 'ADMIN'
  | 'MODERATOR'
  | 'AUDIT'
  | 'ANALYST'
  | 'USER'
  | 'AGENT';
