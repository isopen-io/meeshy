const REDACTED = '***';

const EMAIL_SHAPE = /^([^@\s]+)@([^@\s.]+)((?:\.[^@\s.]+)+)$/;
const PHONE_SHAPE = /^\+?[\d\s().-]+$/;

export function redactEmailForLog(email: string): string {
  const match = EMAIL_SHAPE.exec(email.trim().toLowerCase());
  if (!match) return REDACTED;
  const [, local, domainName, suffix] = match;
  const lastLabel = suffix.slice(suffix.lastIndexOf('.'));
  return `${local[0]}${REDACTED}@${domainName[0]}${REDACTED}${lastLabel}`;
}

export function redactPhoneForLog(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return REDACTED;
  return `${REDACTED}${digits.slice(-2)}`;
}

export function redactIdentifierForLog(identifier: string): string {
  if (identifier.includes('@')) return redactEmailForLog(identifier);
  if (PHONE_SHAPE.test(identifier.trim())) return redactPhoneForLog(identifier);
  return identifier;
}
