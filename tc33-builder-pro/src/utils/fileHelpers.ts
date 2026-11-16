export async function readFileBuffer(file: File): Promise<ArrayBuffer> {
  return await file.arrayBuffer()
}

export async function readJsonFile<T = unknown>(file: File): Promise<T> {
  const text = await file.text()
  return JSON.parse(text) as T
}
