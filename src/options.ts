export const defaultPrefixes = ['PUBLIC_', 'VITE_', 'NUXT_PUBLIC_', 'NEXT_PUBLIC_', 'REACT_APP_']

export interface Options {
  structName: string
  prefixesToRemove: string[]
}

export function resolveOptions(input: Record<string, unknown> = {}): Options {
  const constant = (key: string, fallback: string) => {
    const value = input[key] ?? fallback
    if (typeof value !== 'string' || !/^[A-Z][A-Za-z0-9_]*$/.test(value)) {
      throw new Error(`${key} must be a simple Ruby constant name`)
    }
    if (
      [
        'ENV',
        'T',
        'JSON',
        'Typed',
        'Object',
        'String',
        'Integer',
        'Float',
        'Hash',
        'Array',
        'StandardError',
        'RuntimeError',
        'TypeError',
      ].includes(value)
    ) {
      throw new Error(`${key}: ${value} conflicts with a Ruby runtime constant`)
    }
    return value
  }
  const structName = constant('structName', 'EnvSchema')
  const raw = input.prefixesToRemove ?? defaultPrefixes
  const prefixes = typeof raw === 'string' ? raw.split(',') : raw
  if (!Array.isArray(prefixes) || prefixes.some((p) => typeof p !== 'string')) {
    throw new Error('prefixesToRemove must be an array of strings or a comma-separated string')
  }
  return {
    structName,
    prefixesToRemove: [
      ...new Set(prefixes.map((p: string) => p.trim().toUpperCase()).filter(Boolean)),
    ].sort((a, b) => b.length - a.length || a.localeCompare(b)),
  }
}
