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
        // Match Varlock's field type resolution: ignore environment/value overrides
        // and use the first decorator in schema definition precedence order.
        const decorator = graph.configSchema[field.key].defsForTypeGeneration
          .flatMap(({ itemDef }) => itemDef.decorators ?? [])
          .find((decorator) => decorator.name === 'sorbetType')
        return {
          ...field,
          sorbetType: decorator ? validateSorbetType(await decorator.resolve()) : undefined,
        }
      }),
    )
    return generateSorbetEnv(sorbetFields, options)
  },
} satisfies CodeGeneratorDef)
