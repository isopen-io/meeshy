"""Vecteurs du format client-v1 (#10789), écrits par OpenSSL : une implémentation
indépendante de CommonCrypto/CryptoKit (Swift) et de WebCrypto (TypeScript).
Usage : python3 generate-with-openssl.py > client-v1.vectors.json"""
import json, subprocess, math, sys
def run(args, data):
    return subprocess.run(args, input=data, capture_output=True, check=True).stdout
def padded(n):
    return 541 if n <= 0 else max(541, math.floor(math.pow(1.05, math.ceil(math.log(n)/math.log(1.05)))))
def vector(name, aes, mac, iv, pt, note):
    p = padded(len(pt))
    ct = run(['openssl','enc','-aes-256-cbc','-K',aes,'-iv',iv], pt + b'\0'*(p-len(pt)))
    ivct = bytes.fromhex(iv) + ct
    tag = run(['openssl','dgst','-sha256','-mac','HMAC','-macopt','hexkey:'+mac,'-binary'], ivct)
    blob = ivct + tag
    digest = run(['openssl','dgst','-sha256','-binary'], blob)
    return {"name": name, "note": note, "key": aes+mac, "iv": iv, "plaintext": pt.hex(), "size": len(pt), "paddedSize": p, "blob": blob.hex(), "digest": digest.hex()}
nist_key='603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4'
nist_iv='000102030405060708090a0b0c0d0e0f'
nist_pt=bytes.fromhex('6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710')
mac1=bytes(range(32)).hex()
out = {
 "format": "client-v1",
 "generatedBy": "OpenSSL 3.6.3 (openssl enc -aes-256-cbc, openssl dgst -sha256 -mac HMAC), an implementation independent of CommonCrypto/CryptoKit and WebCrypto",
 "layout": "blob = IV(16) || AES-256-CBC-PKCS7(key[0..32], IV, plaintext || zeros to paddedSize) || HMAC-SHA256(key[32..64], IV || ciphertext); digest = SHA-256(blob)",
 "vectors": [
  vector("nist-sp800-38a-f25", nist_key, mac1, nist_iv, nist_pt, "AES key and IV of NIST SP 800-38A F.2.5 (CBC-AES256.Encrypt): the first 64 ciphertext bytes are the published F.2.5 ciphertext"),
  vector("short-text", 'aa'*32, 'bb'*32, 'cc'*16, b'Meeshy', "6 bytes, padded to the 541-byte floor"),
  vector("bucket-1234", '11'*32, '22'*32, '33'*16, bytes(i % 251 for i in range(1234)), "1234 bytes, Signal-iOS spot check: padded to 1240"),
  vector("full-pkcs7-block", '44'*32, '55'*32, '66'*16, bytes((i * 7) % 256 for i in range(3292)), "3292 bytes padded to 3456, a multiple of 16: PKCS7 appends a whole block"),
  vector("beyond-64-kib", '77'*32, '88'*32, '99'*16, bytes((i * 13) % 256 for i in range(70000)), "70000 bytes padded to 71178: crosses the 64 KiB streaming chunk"),
 ]
}
json.dump(out, sys.stdout, indent=2)
