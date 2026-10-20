import type { CoercedType, ResolvedFieldType } from 'varlock/plugin-lib'
import { pascalCase, propertyName, rubyLiteral } from './naming'
import { resolveOptions } from './options'

type RubyType = { type: string }
export type SorbetField = ResolvedFieldType & { sorbetType?: string }

export function validateSorbetType(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^(?:::)?[A-Z][A-Za-z0-9_]*(?:::[A-Z][A-Za-z0-9_]*)*$/.test(value)
  ) {
    throw new Error('@sorbetType must be a Ruby class name, such as RealEnv or App::RealEnv')
  }
  return value
}

export function generateSorbetEnv(
  fields: SorbetField[],
  input: Record<string, unknown> = {},
): string {
  const options = resolveOptions(input)
  const enums: string[] = []
  const enumNames = new Map<string, string>()
  const properties = new Map<string, string>()
  const render = (coerced: CoercedType, name: string, key: string): RubyType => {
    switch (coerced) {
      case 'string':
        return { type: '::String' }
      case 'int':
        return { type: '::Integer' }
      case 'number':
        return { type: 'T.any(::Integer, ::Float)' }
      case 'boolean':
        return { type: 'T::Boolean' }
      case 'object':
        return { type: 'T::Hash[::String, T.untyped]' }
    }
    if ('enum' in coerced) {
      if (!coerced.enum.length) throw new Error(`Empty enum for ${key}`)
      if (!/^[A-Z][A-Za-z0-9]*$/.test(name) || name === options.structName || name === 'T') {
        throw new Error(`Invalid enum class ${name} for ${key}`)
      }
      if (enumNames.has(name))
        throw new Error(`Enum class ${name} collides for ${enumNames.get(name)} and ${key}`)
      enumNames.set(name, key)
      const members = new Map<string, string | number | boolean>()
      const lines = coerced.enum.map((value) => {
        let member = pascalCase(String(value))
        if (typeof value === 'number')
          member = `Value${value < 0 ? 'Negative' : ''}${String(Math.abs(value)).replace('.', 'Point')}`
        if (!/^[A-Z][A-Za-z0-9]*$/.test(member) || member === 'T')
          throw new Error(`Invalid enum member ${JSON.stringify(value)} for ${key}`)
        if (members.has(member))
          throw new Error(
            `Enum member ${member} collides for ${key}: ${JSON.stringify(members.get(member))} and ${JSON.stringify(value)}`,
          )
        members.set(member, value)
        return `      ${member} = new(${rubyLiteral(value)})`
      })
      enums.push(`  class ${name} < T::Enum\n    enums do\n${lines.join('\n')}\n    end\n  end`)
      return { type: name }
    }
    if ('arrayOf' in coerced) {
      const item = render(coerced.arrayOf, `${name}Item`, key)
      return {
        type: `T::Array[${item.type}]`,
      }
    }
    if ('recordOf' in coerced) {
      // JSON object keys remain strings, even when the schema constrains their spelling.
      const keyType = coerced.recordOf.keys
      if (
        keyType &&
        keyType !== 'string' &&
        !(
          typeof keyType === 'object' &&
          'enum' in keyType &&
          keyType.enum.every((v) => typeof v === 'string')
        )
      ) {
        throw new Error(`Record keys for ${key} must be strings or a string enum`)
      }
      const recordKey = keyType ? render(keyType, `${name}Key`, key) : { type: '::String' }
      const val = coerced.recordOf.values
        ? render(coerced.recordOf.values, `${name}Value`, key)
        : { type: 'T.untyped' }
      return {
        type: `T::Hash[${recordKey.type}, ${val.type}]`,
      }
    }
    throw new Error(`Unsupported type for ${key}`)
  }
  const rendered = fields.map((field) => {
    const name = propertyName(field.key, options.prefixesToRemove)
    if (properties.has(name))
      throw new Error(`Property ${name} collides for ${properties.get(name)} and ${field.key}`)
    properties.set(name, field.key)
    if (field.sorbetType !== undefined) {
      if (typeof field.coerced !== 'object' || !('enum' in field.coerced)) {
        throw new Error(`@sorbetType is only supported on enum fields: ${field.key}`)
      }
      return { field, name, ruby: { type: validateSorbetType(field.sorbetType) } }
    }
    return { field, name, ruby: render(field.coerced, pascalCase(name), field.key) }
  })
  rendered.sort((a, b) => {
    const section = Number(a.name.startsWith('dev_')) - Number(b.name.startsWith('dev_'))
    return section || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  })
  const props = rendered.map(({ field, name, ruby }) => {
    const docs = [
      field.docs.description,
      ...field.docs.docsLinks.map(
        (d) => `Docs: ${d.url}${d.description ? ` (${d.description})` : ''}`,
      ),
      field.docs.isDeprecated ? `Deprecated: ${field.docs.deprecationMessage ?? ''}` : undefined,
    ]
      .filter(Boolean)
      .flatMap((s) => s!.split(/\r\n|\r|\n/))
      // Schema comments may contain control characters; strip them before emitting Ruby.
      // eslint-disable-next-line no-control-regex
      .map((s) => `  # ${s.replace(/[\x00-\x1f\x7f]/g, ' ')}`)
    return [
      ...docs,
      `  const :${name}, ${field.isRequired ? ruby.type : `T.nilable(${ruby.type})`}`,
    ].join('\n')
  })
  return [
    '# typed: true',
    '# frozen_string_literal: true',
    '# rubocop:disable all',
    '# Generated by varlock-sorbet. Do not edit manually.',
    '',
    'require "sorbet-runtime"',
    '',
    `class ${options.structName} < T::Struct`,
    ...enums.sort().flatMap((e) => [e, '']),
    props
      .map((prop, index) => {
        const startsDevSection =
          index > 0 &&
          rendered[index].name.startsWith('dev_') &&
          !rendered[index - 1].name.startsWith('dev_')
        return index > 0 && (startsDevSection || prop.startsWith('  #')) ? `\n${prop}` : prop
      })
      .join('\n'),
    'end',
    '',
  ].join('\n')
}
