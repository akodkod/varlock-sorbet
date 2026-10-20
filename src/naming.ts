export function snakeCase(value: string): string {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .toLowerCase()
}

export function pascalCase(value: string): string {
  return snakeCase(value)
    .split('_')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('')
}

const reservedProperties = new Set([
  'class',
  'object_id',
  '__id__',
  '__send__',
  'send',
  'public_send',
  'initialize',
  'serialize',
  'deserialize',
  'to_hash',
  'to_h',
  'inspect',
  'pretty_inspect',
  'hash',
  'eql',
  'freeze',
  'frozen',
  'dup',
  'clone',
  'method',
  'methods',
  'respond_to',
  'instance_eval',
  'instance_exec',
  'instance_variables',
  'singleton_class',
  'nil',
  'then',
  'itself',
  'with',
])

export function propertyName(key: string, prefixes: string[]): string {
  const prefix = prefixes.find((p) => key.toUpperCase().startsWith(p))
  const name = (prefix ? key.slice(prefix.length) : key).toLowerCase()
  if (!/^[a-z_][a-z0-9_]*$/.test(name) || reservedProperties.has(name)) {
    throw new Error(`Environment key ${key} produces invalid or reserved Ruby property ${name}`)
  }
  return name
}

// JSON escaping plus Ruby interpolation escaping makes arbitrary schema strings safe.
export function rubyLiteral(value: string | number | boolean): string {
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new Error('Enum numbers must be finite')
  return JSON.stringify(value).replace(/#(?=[{@$])/g, '\\#')
}
