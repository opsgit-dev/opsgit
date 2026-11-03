const encoder = new TextEncoder();

/**
 * MurmurHash3 x86 32-bit. Dependency free, stable across JS runtimes, and
 * with good avalanche so that "flag_a:user" and "flag_b:user" bucket
 * independently. Not for anything security related.
 */
export function murmur3(input: string, seed = 0): number {
  const bytes = encoder.encode(input);
  const len = bytes.length;
  const nblocks = len >>> 2;
  let h1 = seed >>> 0;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;

  for (let i = 0; i < nblocks; i++) {
    const o = i * 4;
    let k1 = bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24);
    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, c2);
    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = (Math.imul(h1, 5) + 0xe6546b64) >>> 0;
  }

  let k1 = 0;
  const tail = nblocks * 4;
  switch (len & 3) {
    case 3:
      k1 ^= bytes[tail + 2] << 16;
    // falls through
    case 2:
      k1 ^= bytes[tail + 1] << 8;
    // falls through
    case 1:
      k1 ^= bytes[tail];
      k1 = Math.imul(k1, c1);
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = Math.imul(k1, c2);
      h1 ^= k1;
  }

  h1 ^= len;
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35);
  h1 ^= h1 >>> 16;
  return h1 >>> 0;
}

/**
 * Deterministic bucket in [0, 100) with two decimals of resolution.
 * The same flag key and bucket value always land in the same bucket,
 * and different flags bucket the same user independently.
 */
export function bucket(flagKey: string, bucketValue: string): number {
  return (murmur3(`${flagKey}:${bucketValue}`) % 10000) / 100;
}
