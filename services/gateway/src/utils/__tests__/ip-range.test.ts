import { isIpInRange, parseIpv4 } from '../ip-range';

describe('parseIpv4', () => {
  it('parses a dotted quad to its uint32 value', () => {
    expect(parseIpv4('0.0.0.0')).toBe(0);
    expect(parseIpv4('255.255.255.255')).toBe(0xffffffff);
    expect(parseIpv4('192.168.1.1')).toBe((192 << 24) + (168 << 16) + (1 << 8) + 1 >>> 0);
  });

  it('tolerates the IPv4-mapped IPv6 prefix Node emits behind a proxy', () => {
    expect(parseIpv4('::ffff:192.168.1.1')).toBe(parseIpv4('192.168.1.1'));
  });

  it('rejects malformed input as null (octet overflow, missing octets, garbage, IPv6)', () => {
    expect(parseIpv4('192.168.1.256')).toBeNull();
    expect(parseIpv4('192.168.1')).toBeNull();
    expect(parseIpv4('garbage')).toBeNull();
    expect(parseIpv4('2001:db8::1')).toBeNull();
    expect(parseIpv4('')).toBeNull();
    expect(parseIpv4('1.2.3.4, 5.6.7.8')).toBeNull();
  });
});

describe('isIpInRange — CIDR', () => {
  it('admits an IP inside the block', () => {
    expect(isIpInRange('192.168.1.5', '192.168.1.0/24')).toBe(true);
    expect(isIpInRange('192.168.1.255', '192.168.1.0/24')).toBe(true);
  });

  // The security regression: the old string-prefix implementation returned true here.
  it('does NOT admit a neighbouring block that merely shares a string prefix', () => {
    expect(isIpInRange('192.168.10.5', '192.168.1.0/24')).toBe(false);
    expect(isIpInRange('192.168.100.5', '192.168.1.0/24')).toBe(false);
    expect(isIpInRange('192.168.2.5', '192.168.1.0/24')).toBe(false);
  });

  // The old Math.floor(prefix / 8) truncated /25 to /24, widening the block.
  it('honours a non-byte-aligned prefix (/25 is 128 hosts, not 256)', () => {
    expect(isIpInRange('192.168.1.127', '192.168.1.0/25')).toBe(true);
    expect(isIpInRange('192.168.1.128', '192.168.1.0/25')).toBe(false);
    expect(isIpInRange('192.168.1.200', '192.168.1.0/25')).toBe(false);
  });

  it('handles the extremes /32 (single host) and /0 (all)', () => {
    expect(isIpInRange('10.0.0.1', '10.0.0.1/32')).toBe(true);
    expect(isIpInRange('10.0.0.2', '10.0.0.1/32')).toBe(false);
    expect(isIpInRange('8.8.8.8', '0.0.0.0/0')).toBe(true);
  });

  it('fails closed on a malformed CIDR', () => {
    expect(isIpInRange('192.168.1.5', '192.168.1.0/33')).toBe(false);
    expect(isIpInRange('192.168.1.5', '192.168.1.0/-1')).toBe(false);
    expect(isIpInRange('192.168.1.5', 'garbage/24')).toBe(false);
  });
});

describe('isIpInRange — dash range', () => {
  // The old lexicographic compare rejected .9 because '9' > '1'.
  it('admits an IP whose last octet sorts lexicographically after the bound', () => {
    expect(isIpInRange('192.168.1.9', '192.168.1.1-192.168.1.100')).toBe(true);
    expect(isIpInRange('192.168.1.19', '192.168.1.1-192.168.1.100')).toBe(true);
    expect(isIpInRange('192.168.1.90', '192.168.1.1-192.168.1.100')).toBe(true);
  });

  it('respects the inclusive bounds', () => {
    expect(isIpInRange('192.168.1.1', '192.168.1.1-192.168.1.100')).toBe(true);
    expect(isIpInRange('192.168.1.100', '192.168.1.1-192.168.1.100')).toBe(true);
    expect(isIpInRange('192.168.1.101', '192.168.1.1-192.168.1.100')).toBe(false);
    expect(isIpInRange('192.168.0.255', '192.168.1.1-192.168.1.100')).toBe(false);
  });

  it('fails closed on a malformed range endpoint', () => {
    expect(isIpInRange('192.168.1.5', '192.168.1.1-garbage')).toBe(false);
  });
});

describe('isIpInRange — exact', () => {
  it('matches only the exact IP', () => {
    expect(isIpInRange('192.168.1.5', '192.168.1.5')).toBe(true);
    expect(isIpInRange('192.168.1.6', '192.168.1.5')).toBe(false);
  });

  it('fails closed when the client IP itself is malformed', () => {
    expect(isIpInRange('not-an-ip', '192.168.1.0/24')).toBe(false);
    expect(isIpInRange('127.0.0.1', '192.168.1.5')).toBe(false);
  });
});
