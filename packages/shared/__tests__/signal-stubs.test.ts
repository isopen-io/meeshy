/**
 * Tests for Signal Protocol Stubs
 */
import { describe, it, expect, vi } from 'vitest';
import {
  ProtocolAddress,
  Uuid,
  PrivateKey,
  PublicKey,
  IdentityKeyPair,
  PreKeyRecord,
  SignedPreKeyRecord,
  KyberPreKeyRecord,
  KEMKeyPair,
  SessionRecord,
  SenderKeyRecord,
  PreKeySignalMessage,
  SignalMessageClass,
  CiphertextMessage,
  SenderKeyDistributionMessage,
  processPreKeyBundle,
  signalEncrypt,
  signalDecrypt,
  signalDecryptPreKey,
  groupEncrypt,
  groupDecrypt,
  processSenderKeyDistributionMessage,
} from '../encryption/signal/signal-stubs';

describe('ProtocolAddress', () => {
  it('should create address with name and deviceId', () => {
    const address = new ProtocolAddress('user-123', 1);
    expect(address.name()).toBe('user-123');
    expect(address.deviceId()).toBe(1);
  });

  it('should create address with static new method', () => {
    const address = ProtocolAddress.new('user-456', 2);
    expect(address.name()).toBe('user-456');
    expect(address.deviceId()).toBe(2);
  });
});

describe('Uuid', () => {
  it('should create UUID with value', () => {
    const uuid = new Uuid('550e8400-e29b-41d4-a716-446655440000');
    expect(uuid.toString()).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('should create UUID with static fromString method', () => {
    const uuid = Uuid.fromString('test-uuid');
    expect(uuid.toString()).toBe('test-uuid');
  });
});

describe('PrivateKey', () => {
  it('should generate random private key', () => {
    const key = PrivateKey.generate();
    const serialized = key.serialize();
    expect(serialized).toBeInstanceOf(Uint8Array);
    expect(serialized.length).toBe(32);
  });

  it('should deserialize private key', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]);
    const key = PrivateKey.deserialize(data);
    expect(key.serialize()).toEqual(data);
  });

  it('should get public key from private key', () => {
    const privateKey = PrivateKey.generate();
    const publicKey = privateKey.getPublicKey();
    expect(publicKey).toBeInstanceOf(PublicKey);
  });

  it('should sign message', () => {
    const privateKey = PrivateKey.generate();
    const message = new Uint8Array([1, 2, 3]);
    const signature = privateKey.sign(message);
    expect(signature).toBeInstanceOf(Uint8Array);
    expect(signature.length).toBe(64);
  });
});

describe('PublicKey', () => {
  it('should serialize public key', () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const key = new PublicKey(data);
    expect(key.serialize()).toEqual(data);
  });

  it('should deserialize public key', () => {
    const data = new Uint8Array([5, 6, 7, 8]);
    const key = PublicKey.deserialize(data);
    expect(key.serialize()).toEqual(data);
  });

  it('should verify signature (stub returns true)', () => {
    const key = new PublicKey(new Uint8Array(32));
    const result = key.verify(new Uint8Array([1, 2, 3]), new Uint8Array(64));
    expect(result).toBe(true);
  });
});

describe('IdentityKeyPair', () => {
  it('should generate identity key pair', () => {
    const keyPair = IdentityKeyPair.generate();
    expect(keyPair.publicKey).toBeInstanceOf(PublicKey);
    expect(keyPair.privateKey).toBeInstanceOf(PrivateKey);
  });

  it('should serialize key pair', () => {
    const keyPair = IdentityKeyPair.generate();
    const serialized = keyPair.serialize();
    expect(serialized).toBeInstanceOf(Uint8Array);
  });
});

describe('PreKeyRecord', () => {
  it('should create pre-key record', () => {
    const publicKey = new PublicKey(new Uint8Array(32));
    const privateKey = new PrivateKey(new Uint8Array(32));
    const record = PreKeyRecord.new(123, publicKey, privateKey);

    expect(record.id()).toBe(123);
    expect(record.publicKey()).toBe(publicKey);
    expect(record.privateKey()).toBe(privateKey);
  });

  it('should serialize pre-key record', () => {
    const record = PreKeyRecord.new(
      1,
      new PublicKey(new Uint8Array(32)),
      new PrivateKey(new Uint8Array(32))
    );
    expect(record.serialize()).toBeInstanceOf(Uint8Array);
  });

  it('should deserialize pre-key record', () => {
    const record = PreKeyRecord.deserialize(new Uint8Array(0));
    expect(record.id()).toBe(1);
  });
});

describe('SignedPreKeyRecord', () => {
  it('should create signed pre-key record', () => {
    const timestamp = Date.now();
    const publicKey = new PublicKey(new Uint8Array(32));
    const privateKey = new PrivateKey(new Uint8Array(32));
    const signature = new Uint8Array(64);

    const record = SignedPreKeyRecord.new(456, timestamp, publicKey, privateKey, signature);

    expect(record.id()).toBe(456);
    expect(record.timestamp()).toBe(timestamp);
    expect(record.publicKey()).toBe(publicKey);
    expect(record.privateKey()).toBe(privateKey);
    expect(record.signature()).toBe(signature);
  });

  it('should serialize signed pre-key record', () => {
    const record = SignedPreKeyRecord.new(
      1,
      Date.now(),
      new PublicKey(new Uint8Array(32)),
      new PrivateKey(new Uint8Array(32)),
      new Uint8Array(64)
    );
    expect(record.serialize()).toBeInstanceOf(Uint8Array);
  });

  it('should deserialize signed pre-key record', () => {
    const record = SignedPreKeyRecord.deserialize(new Uint8Array(0));
    expect(record.id()).toBe(1);
  });
});

describe('KyberPreKeyRecord', () => {
  it('should create Kyber pre-key record', () => {
    const timestamp = Date.now();
    const publicKey = new Uint8Array(32);
    const secretKey = new Uint8Array(32);
    const signature = new Uint8Array(64);

    const record = new KyberPreKeyRecord(789, timestamp, publicKey, secretKey, signature);

    expect(record.id()).toBe(789);
    expect(record.timestamp()).toBe(timestamp);
    expect(record.publicKey()).toBe(publicKey);
    expect(record.secretKey()).toBe(secretKey);
    expect(record.signature()).toBe(signature);
  });

  it('should serialize Kyber pre-key record', () => {
    const record = new KyberPreKeyRecord(
      1,
      Date.now(),
      new Uint8Array(32),
      new Uint8Array(32),
      new Uint8Array(64)
    );
    expect(record.serialize()).toBeInstanceOf(Uint8Array);
  });

  it('should deserialize Kyber pre-key record', () => {
    const record = KyberPreKeyRecord.deserialize(new Uint8Array(0));
    expect(record.id()).toBe(1);
  });
});

describe('KEMKeyPair', () => {
  it('should generate KEM key pair', () => {
    const keyPair = KEMKeyPair.generate();
    expect(keyPair.getPublicKey()).toBeInstanceOf(Uint8Array);
    expect(keyPair.getSecretKey()).toBeInstanceOf(Uint8Array);
  });

  it('should create with specific keys', () => {
    const publicKey = new Uint8Array([1, 2, 3]);
    const secretKey = new Uint8Array([4, 5, 6]);
    const keyPair = new KEMKeyPair(publicKey, secretKey);

    expect(keyPair.getPublicKey()).toBe(publicKey);
    expect(keyPair.getSecretKey()).toBe(secretKey);
  });
});

describe('SessionRecord', () => {
  it('should create session record', () => {
    const data = new Uint8Array([1, 2, 3]);
    const record = new SessionRecord(data);
    expect(record.serialize()).toBe(data);
  });

  it('should create empty session record', () => {
    const record = new SessionRecord();
    expect(record.serialize()).toEqual(new Uint8Array(0));
  });

  it('should deserialize session record', () => {
    const data = new Uint8Array([4, 5, 6]);
    const record = SessionRecord.deserialize(data);
    expect(record.serialize()).toEqual(data);
  });
});

describe('SenderKeyRecord', () => {
  it('should create sender key record', () => {
    const data = new Uint8Array([7, 8, 9]);
    const record = new SenderKeyRecord(data);
    expect(record.serialize()).toBe(data);
  });

  it('should create empty sender key record', () => {
    const record = new SenderKeyRecord();
    expect(record.serialize()).toEqual(new Uint8Array(0));
  });

  it('should deserialize sender key record', () => {
    const data = new Uint8Array([10, 11, 12]);
    const record = SenderKeyRecord.deserialize(data);
    expect(record.serialize()).toEqual(data);
  });
});

describe('PreKeySignalMessage', () => {
  it('should create pre-key signal message', () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const message = new PreKeySignalMessage(data);
    expect(message.serialize()).toBe(data);
  });

  it('should deserialize pre-key signal message', () => {
    const data = new Uint8Array([5, 6, 7, 8]);
    const message = PreKeySignalMessage.deserialize(data);
    expect(message.serialize()).toEqual(data);
  });
});

describe('SignalMessageClass', () => {
  it('should create signal message', () => {
    const data = new Uint8Array([9, 10, 11, 12]);
    const message = new SignalMessageClass(data);
    expect(message.serialize()).toBe(data);
  });

  it('should deserialize signal message', () => {
    const data = new Uint8Array([13, 14, 15, 16]);
    const message = SignalMessageClass.deserialize(data);
    expect(message.serialize()).toEqual(data);
  });
});

describe('CiphertextMessage', () => {
  it('should create ciphertext message', () => {
    const data = new Uint8Array([17, 18, 19, 20]);
    const message = new CiphertextMessage(data);
    expect(message.serialize()).toBe(data);
    expect(message.type()).toBe(2); // default type
  });

  it('should create ciphertext message with custom type', () => {
    const data = new Uint8Array([21, 22, 23, 24]);
    const message = new CiphertextMessage(data, 3);
    expect(message.type()).toBe(3);
  });
});

describe('SenderKeyDistributionMessage', () => {
  it('should create sender key distribution message', () => {
    const distributionId = new Uuid('test-uuid');
    const message = new SenderKeyDistributionMessage(distributionId, 12345, 0);

    expect(message.distributionId()).toBe(distributionId);
    expect(message.chainId()).toBe(12345);
    expect(message.iteration()).toBe(0);
  });

  it('should serialize sender key distribution message', () => {
    const message = new SenderKeyDistributionMessage(new Uuid('test'), 1, 0);
    expect(message.serialize()).toBeInstanceOf(Uint8Array);
  });
});

describe('Stub functions', () => {
  it('should process pre-key bundle (stub)', async () => {
    const address = ProtocolAddress.new('user', 1);
    await expect(processPreKeyBundle({} as any, address, {} as any, {} as any)).resolves.toBeUndefined();
  });

  it('should encrypt with signal (stub)', async () => {
    const address = ProtocolAddress.new('user', 1);
    const result = await signalEncrypt(new Uint8Array(0), address, {} as any, {} as any);
    expect(result).toBeInstanceOf(CiphertextMessage);
  });

  it('should decrypt with signal (stub)', async () => {
    const address = ProtocolAddress.new('user', 1);
    const message = new SignalMessageClass(new Uint8Array(0));
    const result = await signalDecrypt(message, address, {} as any, {} as any);
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('should decrypt pre-key with signal (stub)', async () => {
    const address = ProtocolAddress.new('user', 1);
    const message = new PreKeySignalMessage(new Uint8Array(0));
    const result = await signalDecryptPreKey(message, address, {} as any, {} as any, {} as any, {} as any, {} as any);
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('should encrypt group message (stub)', async () => {
    const address = ProtocolAddress.new('group', 1);
    const distributionId = new Uuid('test');
    const result = await groupEncrypt(new Uint8Array(0), address, distributionId, {} as any);
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('should decrypt group message (stub)', async () => {
    const address = ProtocolAddress.new('group', 1);
    const distributionId = new Uuid('test');
    const result = await groupDecrypt(new Uint8Array(0), address, distributionId, {} as any);
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('should process sender key distribution message (stub)', async () => {
    const address = ProtocolAddress.new('sender', 1);
    const message = new SenderKeyDistributionMessage(new Uuid('test'), 1, 0);
    await expect(processSenderKeyDistributionMessage(address, message, {} as any)).resolves.toBeUndefined();
  });
});
