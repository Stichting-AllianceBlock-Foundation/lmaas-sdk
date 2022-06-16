import { BigNumber as BigNumberJS } from 'bignumber.js';

const BONE = new BigNumberJS(10).pow(18);
const BPOW_PRECISION = BONE.idiv(new BigNumberJS(10).pow(10));

export function btoi(a: any) {
  return a.idiv(BONE);
}

export function bfloor(a: any) {
  return btoi(a).times(BONE);
}

export function bsubSign(a: any, b: any) {
  if (a.gte(b)) {
    const res = a.minus(b);
    const bool = false;
    return {
      res,
      bool,
    };
  } else {
    const res = b.minus(a);
    const bool = true;
    return {
      res,
      bool,
    };
  }
}

export function bmul(a: any, b: any) {
  const c0 = a.times(b);
  const c1 = c0.plus(BONE.div(new BigNumberJS(2)));
  const c2 = c1.idiv(BONE);
  return c2;
}

export function bmulExact(a: any, b: any) {
  const c0 = a.times(b);
  const c1 = c0.plus(BONE.div(new BigNumberJS(2)));
  const c2 = c1.div(BONE);
  return c2;
}

export function bdiv(a: any, b: any) {
  const c0 = a.times(BONE);
  const c1 = c0.plus(b.div(new BigNumberJS(2)));
  const c2 = c1.idiv(b);
  return c2;
}

export function bpowi(a: any, n: any) {
  let z = !n.modulo(new BigNumberJS(2)).eq(new BigNumberJS(0)) ? a : BONE;

  for (n = n.idiv(new BigNumberJS(2)); !n.eq(new BigNumberJS(0)); n = n.idiv(new BigNumberJS(2))) {
    a = bmul(a, a);
    if (!n.modulo(new BigNumberJS(2)).eq(new BigNumberJS(0))) {
      z = bmul(z, a);
    }
  }
  return z;
}

export function bpowApprox(base: any, exp: any, precision: any) {
  const a = exp;
  const { res: x, bool: xneg } = bsubSign(base, BONE);
  let term = BONE;

  let sum = term;
  let negative = false;
  for (let i = 1; term.gte(precision); i++) {
    const bigK = new BigNumberJS(i).times(BONE);
    const { res: c, bool: cneg } = bsubSign(a, bigK.minus(BONE));
    term = bmul(term, bmul(c, x));
    term = bdiv(term, bigK);
    if (term.eq(new BigNumberJS(0))) break;

    if (xneg) negative = !negative;
    if (cneg) negative = !negative;
    if (negative) {
      sum = sum.minus(term);
    } else {
      sum = sum.plus(term);
    }
  }
  return sum;
}

export function bpow(base: any, exp: any) {
  const whole = bfloor(exp);
  const remain = exp.minus(whole);
  const wholePow = bpowi(base, btoi(whole));
  if (remain.eq(new BigNumberJS(0))) {
    return wholePow;
  }

  const partialResult = bpowApprox(base, remain, BPOW_PRECISION);
  return bmul(wholePow, partialResult);
}
export function toWei(val: any) {
  return scale(bnum(val.toString()), 18).integerValue();
}

export function scale(input: any, decimalPlaces: any) {
  const scalePow = new BigNumberJS(decimalPlaces.toString());
  const scaleMul = new BigNumberJS(10).pow(scalePow);
  return input.times(scaleMul);
}

export function bnum(val: any) {
  const number = typeof val === 'string' ? val : val ? val.toString() : '0';
  return new BigNumberJS(number);
}

export function bmin(firstNumber: any, secondNumber: any) {
  if (firstNumber.gte(secondNumber)) {
    return secondNumber;
  }
  return firstNumber;
}
