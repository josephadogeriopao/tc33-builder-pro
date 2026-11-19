import type { InputFile } from '../shared/types'

export async function readFileBuffer(file: InputFile): Promise<ArrayBuffer> {
  return await file.arrayBuffer()
}

export async function readJsonFile<T = unknown>(file: InputFile): Promise<T> {
  const text = await file.text()
  return JSON.parse(text) as T
}
