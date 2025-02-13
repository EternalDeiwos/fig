export interface JsonObject {
  [key: string | symbol]: JsonValue | undefined
}
export interface JsonArray extends Array<JsonValue> {}
export type JsonValue = string | number | boolean | JsonObject | JsonArray
export enum FHStructType {
  BLUEPRINT = 'BlueprintGeneratedClass',
  TABLE = 'DataTable',
  FACTORY = 'SpecializedFactoryComponent',
}

export class FHStruct {
  constructor(
    private path: string,
    private data: JsonValue,
    private type?: FHStructType | string,
    private superStruct?: FHStruct,
  ) {}

  getPath() {
    return this.path
  }

  getType() {
    return this.type
  }

  get(path: string | string[] = '') {
    const pathSegments = Array.isArray(path) ? path : FHStruct.segmentPath(path)

    let currentValue: JsonValue = this.data

    for (const segment of pathSegments) {
      if (typeof currentValue === 'object' && currentValue !== null) {
        if (Array.isArray(currentValue)) {
          // Handle array index
          const index = parseInt(segment, 10)
          if (isNaN(index) || index < 0 || index >= currentValue.length) {
            return undefined
          }
          currentValue = currentValue[index]
        } else {
          // Handle object property
          const nextValue = (currentValue as JsonObject)[segment]
          if (nextValue === undefined) {
            return undefined
          }
          currentValue = nextValue
        }
      } else {
        // If current value is not an object or array, we cannot navigate further
        return undefined
      }
    }

    return currentValue
  }

  extractValues(
    path: string[],
    properties: readonly (readonly string[])[],
    result: JsonObject = {},
  ): JsonObject | undefined {
    let currentValue: JsonValue = this.data

    for (const segment of path) {
      if (typeof currentValue === 'object' && currentValue !== null) {
        if (Array.isArray(currentValue)) {
          const index = parseInt(segment)
          if (isNaN(index)) {
            if (
              currentValue.length === 0 ||
              typeof currentValue[0] !== 'object' ||
              Array.isArray(currentValue[0]) ||
              !currentValue[0].Key
            ) {
              return undefined
            }

            const next = (currentValue as JsonObject[])
              .find((entry) => entry.Key === segment)?.Value

            if (next === undefined) {
              return undefined
            }

            currentValue = next
          } else if (
            index < 0 ||
            index >= currentValue.length
          ) {
            return undefined
          } else {
            currentValue = currentValue[index]
          }
        } else {
          const next = currentValue[segment]
          if (next === undefined) {
            return undefined
          }
          currentValue = next
        }
      } else {
        return undefined
      }
    }

    const superProperties = []
    for (const propertyPath of properties) {
      let value: JsonValue | undefined = currentValue

      for (const element of propertyPath) {
        value = ((value || {}) as JsonObject)[element]
      }

      if (value !== undefined) {
        result[propertyPath[0]] = value
      } else {
        superProperties.push(propertyPath)
      }
    }

    if (superProperties.length && this.superStruct) {
      this.superStruct.extractValues(path, superProperties, result)
    }

    return result
  }

  bundleValues(
    path: string[],
    properties: readonly (readonly string[])[],
    callback: (values: JsonObject | undefined) => void,
  ) {
    const values = this.extractValues(path, properties)
    if (values && Object.keys(values).length) {
      values.ObjectPath = this.getPath()
      callback(values)
    }
  }

  static segmentPath(path: string) {
    return path
      .split('.')
      .flatMap((segment) => segment.split(/[\[\]]/))
      .filter(Boolean)
  }

  static combineDetails(
    list: JsonArray,
    path = ['Text', 'SourceString'],
    separator = '\n',
  ) {
    return list
      .map((value) => {
        for (const element of path) {
          const next = ((value || {}) as JsonObject)[element]
          if (next === undefined) {
            return undefined
          }
          value = next
        }
        return value
      })
      .join(separator)
  }
}
