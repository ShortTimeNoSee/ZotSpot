import StyleDictionary from 'style-dictionary'
import { writeFile, mkdir } from 'node:fs/promises'

const dictionary = new StyleDictionary({ source: ['packages/tokens/tokens.json'] })
await dictionary.buildAllPlatforms()
const tokens = JSON.parse(await (await import('node:fs/promises')).readFile('packages/tokens/tokens.json', 'utf8'))
const flatten = (node, path = []) => Object.entries(node).flatMap(([key, value]) => value && typeof value === 'object' && 'value' in value ? [[...path, key, value.value]] : flatten(value, [...path, key]))
const values = flatten(tokens)
await mkdir('apps/web/src/styles', { recursive: true })
await writeFile('apps/web/src/styles/tokens.css', `:root {\n${values.map(parts => `  --${parts.slice(0, -1).join('-').replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}: ${parts.at(-1)};`).join('\n')}\n}\n`)
await mkdir('packages/transit-engine/src/constants', { recursive: true })
await writeFile('packages/transit-engine/src/constants/tokens.ts', `export const tokens = ${JSON.stringify(tokens, null, 2)} as const\n`)
