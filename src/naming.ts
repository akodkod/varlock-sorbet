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

// Include Object's public/protected methods: Sorbet rejects these as prop names.
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
  'to_s',
  'to_enum',
  'enum_for',
  'display',
  'extend',
  'tap',
  'yield_self',
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
  'public_method',
  'public_methods',
  'private_methods',
  'protected_methods',
  'respond_to',
  'instance_eval',
  'instance_exec',
  'instance_variables',
  'instance_variable_get',
  'instance_variable_set',
  'remove_instance_variable',
  'singleton_class',
  'singleton_method',
  'singleton_methods',
  'define_singleton_method',
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

// Escape JSON strings and Ruby interpolation so schema strings are safe to emit.
export function rubyLiteral(value: string | number | boolean): string {
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new Error('Enum numbers must be finite')
  return JSON.stringify(value).replace(/#(?=[{@$])/g, '\\#')
}
