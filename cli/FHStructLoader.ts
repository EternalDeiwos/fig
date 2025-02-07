import { join } from '@std/path/join'
import { expandGlob } from '@std/fs'
import { FHStruct, FHStructType } from './FHStruct.ts'

export type SuperStructNode = {
  ObjectName: string
  ObjectPath: string
}

export type TypedRecord = {
  Type: string | FHStructType
  Name: string
  SuperStruct: SuperStructNode
}

export class NonBPError extends Error {}

export class FHStructLoader {
  constructor(private readonly basePath: string) {}

  async getStruct(
    path: string,
    type?: FHStructType | string,
    isBlueprint = true,
  ): Promise<FHStruct | undefined> {
    const reference = (path.startsWith(this.basePath) ? path.slice(this.basePath.length) : path)
      .replace(/\.json$/, '')
    const referenceFile = reference.replace(/(\.[0-9]+)?$/, '.json')
    const filePath = referenceFile.startsWith(this.basePath)
      ? referenceFile
      : join(this.basePath, referenceFile)
    const data: TypedRecord[] = JSON.parse(await Deno.readTextFile(filePath))

    let superStruct: FHStruct | undefined
    if (isBlueprint) {
      const blueprint = data.find((entry) => entry.Type === FHStructType.BLUEPRINT)

      if (!blueprint) {
        throw new NonBPError(`Cannot find blueprint in file: ${filePath}`)
      }

      if (type === undefined) {
        type = blueprint.Name
      } else if (type !== blueprint.Name) {
        throw new Error(
          `Blueprint (${blueprint.Name}) doesn't match specified type (${type}) in file: ${filePath}`,
        )
      }

      superStruct = await this.getStructFromReference(blueprint.SuperStruct)
    }

    const struct = data.find((entry) => entry.Type === type)

    if (!struct) {
      return undefined
    }

    return new FHStruct(reference, struct, type, superStruct)
  }

  async getStructFromReference(node: SuperStructNode): Promise<FHStruct | undefined> {
    if (node && node.ObjectName.startsWith(`${FHStructType.BLUEPRINT}'`)) {
      const type = node.ObjectName.slice(
        FHStructType.BLUEPRINT.length + 1,
        node.ObjectName.length - 1,
      )
      return await this.getStruct(node.ObjectPath, type)
    }
  }

  async globStructs(path: string) {
    const globbed = await Array.fromAsync(
      expandGlob(join(this.basePath, path), { includeDirs: true, followSymlinks: true }),
    )

    return Promise.all(
      globbed
        .filter(({ isFile, isDirectory, isSymlink }) => isFile && !isDirectory && !isSymlink)
        .map(({ path: filePath }) => {
          const encoder = new TextEncoder()
          Deno.stderr.write(encoder.encode(`Processing JSON file at: ${filePath}\n`))
          return this.getStruct(filePath).catch((err) => console.warn(err.message))
        }),
    )
  }
}
