export interface Matrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export const IDENTITY_MATRIX: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

export function multiplyMatrices(left: Matrix, right: Matrix): Matrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  }
}

export function applyMatrix(matrix: Matrix, x: number, y: number): { x: number; y: number } {
  return {
    x: matrix.a * x + matrix.c * y + matrix.e,
    y: matrix.b * x + matrix.d * y + matrix.f,
  }
}

function numberList(value: string): number[] {
  return value
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite)
}

export function parseTransform(value: string | null): Matrix {
  if (!value) return { ...IDENTITY_MATRIX }
  const expression = /([a-zA-Z]+)\s*\(([^)]*)\)/g
  let result = { ...IDENTITY_MATRIX }
  let match: RegExpExecArray | null
  while ((match = expression.exec(value))) {
    const command = match[1]
    const values = numberList(match[2])
    let next = { ...IDENTITY_MATRIX }
    if (command === 'matrix' && values.length >= 6) {
      next = { a: values[0], b: values[1], c: values[2], d: values[3], e: values[4], f: values[5] }
    } else if (command === 'translate' && values.length >= 1) {
      next.e = values[0]
      next.f = values[1] ?? 0
    } else if (command === 'scale' && values.length >= 1) {
      next.a = values[0]
      next.d = values[1] ?? values[0]
    } else if (command === 'rotate' && values.length >= 1) {
      const radians = (values[0] * Math.PI) / 180
      const rotation: Matrix = {
        a: Math.cos(radians),
        b: Math.sin(radians),
        c: -Math.sin(radians),
        d: Math.cos(radians),
        e: 0,
        f: 0,
      }
      if (values.length >= 3) {
        next = multiplyMatrices(
          multiplyMatrices(
            { ...IDENTITY_MATRIX, e: values[1], f: values[2] },
            rotation,
          ),
          { ...IDENTITY_MATRIX, e: -values[1], f: -values[2] },
        )
      } else {
        next = rotation
      }
    } else if (command === 'skewX' && values.length >= 1) {
      next.c = Math.tan((values[0] * Math.PI) / 180)
    } else if (command === 'skewY' && values.length >= 1) {
      next.b = Math.tan((values[0] * Math.PI) / 180)
    }
    result = multiplyMatrices(result, next)
  }
  return result
}

export function cumulativeTransform(element: Element, stopAt: Element): Matrix {
  const chain: Element[] = []
  let current: Element | null = element
  while (current && current !== stopAt) {
    chain.push(current)
    current = current.parentElement
  }
  chain.reverse()
  return chain.reduce(
    (matrix, node) => multiplyMatrices(matrix, parseTransform(node.getAttribute('transform'))),
    { ...IDENTITY_MATRIX },
  )
}
