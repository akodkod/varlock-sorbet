import { plugin, type CodeGeneratorDef } from 'varlock/plugin-lib'
import { generateSorbetEnv, validateSorbetType } from './generator'

plugin.name = 'sorbet'
plugin.registerItemDecorator({
  name: 'sorbetType',
  inert: true,
  process: (value) => {
    if (!value.isStatic) throw new Error('@sorbetType must be a static Ruby class name')
    validateSorbetType(value.staticValue)
  },
})
plugin.registerCodeGenerator({
  decoratorName: 'generateSorbetEnv',
  knownOptions: ['structName', 'prefixesToRemove'],
  generate: async ({ graph, fields, options }) => {
    const sorbetFields = await Promise.all(
      fields.map(async (field) => {
        const decorator = graph.configSchema[field.key].getDec('sorbetType')
        return {
          ...field,
          sorbetType: decorator ? validateSorbetType(await decorator.resolve()) : undefined,
        }
      }),
    )
    return generateSorbetEnv(sorbetFields, options)
  },
} satisfies CodeGeneratorDef)
