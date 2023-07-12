const BONE = BigInt(10) ** BigInt(18);

function idiv(a: bigint, b: bigint) {
  return a / b - (a % b < 0 ? 1n : 0n);
}

export function btoi(a: bigint) {
  return idiv(a, BONE);
}

export function bfloor(a: bigint) {
  return btoi(a) * BONE;
}

export function bsubSign(a: bigint, b: bigint) {
  if (a >= b) {
    const res = a - b;
    const bool = false;
    return { res, bool };
  } else {
    const res = b - a;
    const bool = true;
    return { res, bool };
  }
}

export function bmul(a: bigint, b: bigint) {
  const c0 = a * b;
  const c1 = c0 + idiv(BONE, 2n);
  const c2 = idiv(c1, BONE);
  return c2;
}

export function bmulExact(a: bigint, b: bigint) {
  const c0 = a * b;
  const c1 = c0 + idiv(BONE, 2n);
  const c2 = c1 / BONE;
  return c2;
}

export function bdiv(a: bigint, b: bigint) {
  const c0 = a * BONE;
  const c1 = c0 + idiv(b, 2n);
  const c2 = idiv(c1, b);
  return c2;
}

export function bpowi(a: bigint, n: bigint) {
  let z = n % 2n !== 0n ? a : BONE;

  for (n = idiv(n, 2n); n !== 0n; n = idiv(n, 2n)) {
    a = bmul(a, a);
    if (n % 2n !== 0n) {
      z = bmul(z, a);
    }
  }
  return z;
}

export function scale(input: bigint, decimalPlaces: bigint) {
  const scaleMul = 10n ** decimalPlaces;
  return input * scaleMul;
}

export function bmin(firstNumber: bigint, secondNumber: bigint) {
  return firstNumber >= secondNumber ? secondNumber : firstNumber;
}
