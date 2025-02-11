import meta from './deno.json' with { type: 'json' }
import { parseArgs } from 'jsr:@std/cli@1/parse-args'
import { FHCatalogBuilder } from './FHCatalogBuilder.ts'
import { FHStructLoader } from './FHStructLoader.ts'

export type RunOptions = {
  _: (string | number)[]
  url?: string
  parallel?: string | number
}

export enum Command {
  CATALOG = 'catalog',
}

export async function main(options: RunOptions) {
  const [command, warPath] = options._

  switch (command) {
    case Command.CATALOG: {
      const builder = await FHCatalogBuilder.init(
        new FHStructLoader(warPath as string),
        options.url,
      )
      await builder.load(
        'War/Content/Blueprints/**/*.json',
        parseInt(options.parallel?.toString() || '') || 8,
      )
      const catalog = builder.getCatalog().sort((a, b) => {
        const aName = (a?.CodeName as string)?.toLowerCase()
        const bName = (b?.CodeName as string)?.toLowerCase()
        if (aName > bName) {
          return 1
        }
        if (aName < bName) {
          return -1
        }
        return 0
      })

      const encoder = new TextEncoder()
      await Deno.stdout.write(encoder.encode(JSON.stringify(catalog)))
      break
    }
    default: {
      return printUsage()
    }
  }
}

function printUsage() {
  console.log('')
  console.log('Usage: fig <command> <path-to-game-folder> [options]')
  console.log('Commands:')
  console.log('  catalog')
  console.log('')
  console.log('General Options:')
  console.log('  -p, --parallel   Number of files to process at once. Default to 4x # cpu cores.')
  console.log('  -u, --url        Base url')
  console.log('  -h, --help       Show this help message')
  console.log('  -v, --version    Show the version string')
}

if (import.meta.main) {
  const { help, version, ...args } = parseArgs(Deno.args, {
    boolean: ['help', 'version'],
    string: ['url', 'parallel'],
    default: {
      parallel: navigator.hardwareConcurrency * 4,
    },
    alias: {
      parallel: 'p',
      url: 'u',
      help: 'h',
      version: 'v',
    },
  })

  if (help || (args._.length < 2 && !version)) {
    printUsage()
    Deno.exit(0)
  } else if (version) {
    console.log(meta.version || 'unstable')
  }

  await main(args)
}
