/**
 * Local knowledge-base plugin.
 *
 * The directory is the single source of truth: every tool call rescans it and
 * compares file metadata with a small in-memory chunk cache. Files copied into
 * the directory, edited, or deleted therefore become visible on the next call
 * without a manual reindex step. The same operations back the browser panel, so
 * the agent and the UI always work on identical data.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { once } from 'node:events'
import { createRequire } from 'node:module'

export const name = 'knowledge-base'
export const inject = ['tools']

const ROUTE = '/api/knowledge-base'
const MAX_TEXT_FILE_BYTES = 32 * 1024 * 1024
const MAX_BINARY_BYTES = 256 * 1024 * 1024
const MAX_BODY_BYTES = 36 * 1024 * 1024
const MAX_TOOL_TEXT = 24000
const PREVIEW_LINES = 400
const MAX_READ_LINES = 400
const CHUNK_TARGET = 1100
const CHUNK_OVERLAP = 160
const MAX_CHUNKS_PER_FILE = 4000
const PDF_EXTENSION = '.pdf'
const MIME_TYPES = new Map([
  ['.pdf', 'application/pdf'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.markdown', 'text/markdown; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.text', 'text/plain; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.csv', 'text/csv; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
])

const TEXT_EXTENSIONS = new Set([
  '.md', '.markdown', '.mdx', '.txt', '.text', '.rst', '.log',
  '.json', '.jsonl', '.csv', '.tsv', '.yaml', '.yml', '.toml', '.ini', '.conf',
  '.html', '.htm', '.xml', '.svg', '.css', '.scss', '.less',
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.vue', '.svelte',
  '.py', '.ps1', '.sh', '.bash', '.bat', '.cmd', '.sql',
  '.java', '.kt', '.kts', '.go', '.rs', '.c', '.h', '.cc', '.cpp', '.hpp', '.cs',
  '.rb', '.php', '.lua', '.swift', '.dart', '.r', '.tex',
])

const PLAIN_NAMES = new Set(['readme', 'license', 'changelog', 'authors', 'notice'])

function defaultDirectory() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(home, 'knowledge-base')
}

function isPdf(relativePath) {
  return path.extname(relativePath).toLowerCase() === PDF_EXTENSION
}

function mimeFor(relativePath) {
  return MIME_TYPES.get(path.extname(relativePath).toLowerCase()) || 'application/octet-stream'
}

function isSearchable(relativePath) {
  if (isPdf(relativePath)) return true
  const base = path.basename(relativePath).toLowerCase()
  if (path.extname(base) === '') return PLAIN_NAMES.has(base)
  return TEXT_EXTENSIONS.has(path.extname(base))
}

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8')
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function errorMessage(error) {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

function clampInteger(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(number)))
}

/** Build a newline-delimited chunk list with source line ranges. */
function buildChunks(relativePath, text) {
  const lines = text.split('\n')
  const chunks = []
  let buffer = []
  let bufferStart = 1
  let bufferHeading = ''
  let bufferLength = 0
  let heading = ''

  const flush = (endLine) => {
    if (buffer.length === 0) return
    const body = buffer.join('\n')
    if (body.trim().length === 0) return
    if (chunks.length >= MAX_CHUNKS_PER_FILE) return
    chunks.push({
      path: relativePath,
      startLine: bufferStart,
      endLine: Math.max(bufferStart, endLine),
      heading: bufferHeading,
      text: body,
    })
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const headingMatch = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line.trim())
    if (headingMatch) heading = headingMatch[2].trim()

    // A single very long line (minified JSON, a one-line article) is split
    // into fixed pieces so it can still be retrieved.
    if (line.length > CHUNK_TARGET) {
      flush(index)
      buffer = []
      bufferLength = 0
      for (let offset = 0; offset < line.length; offset += CHUNK_TARGET) {
        if (chunks.length >= MAX_CHUNKS_PER_FILE) break
        chunks.push({
          path: relativePath,
          startLine: index + 1,
          endLine: index + 1,
          heading,
          text: line.slice(offset, offset + CHUNK_TARGET),
        })
      }
      continue
    }

    if (buffer.length > 0 && bufferLength + line.length + 1 > CHUNK_TARGET) {
      flush(index)
      const overlap = []
      let overlapLength = 0
      for (let cursor = buffer.length - 1; cursor >= 0; cursor -= 1) {
        const candidate = buffer[cursor]
        if (overlap.length > 0 && overlapLength + candidate.length > CHUNK_OVERLAP) break
        overlap.unshift(candidate)
        overlapLength += candidate.length + 1
      }
      buffer = overlap
      bufferLength = overlapLength
      bufferStart = index + 2 - overlap.length
      bufferHeading = heading
    }

    if (buffer.length === 0) {
      bufferStart = index + 1
      bufferHeading = heading
    }
    buffer.push(line)
    bufferLength += line.length + 1
  }
  flush(lines.length)
  return chunks
}

/** Latin words plus CJK bigrams; enough for mixed Chinese/English retrieval. */
function tokenize(text) {
  const lower = text.toLowerCase()
  const tokens = []
  const latin = lower.match(/[a-z0-9][a-z0-9_-]*/g)
  if (latin) tokens.push(...latin)
  const cjk = lower.match(/[\u3400-\u9fff]+/g)
  if (cjk) {
    for (const run of cjk) {
      if (run.length === 1) {
        tokens.push(run)
      } else {
        for (let index = 0; index < run.length - 1; index += 1) {
          tokens.push(run.slice(index, index + 2))
        }
        if (run.length <= 6) tokens.push(run)
      }
    }
  }
  return tokens
}

function countTokens(tokens) {
  const counts = new Map()
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1)
  return counts
}

function snippetFor(text, query) {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length === 0) return ''
  const lower = clean.toLowerCase()
  const needle = query.trim().toLowerCase()
  let index = needle.length > 0 ? lower.indexOf(needle) : -1
  if (index < 0) {
    for (const token of tokenize(query)) {
      index = lower.indexOf(token)
      if (index >= 0) break
    }
  }
  if (index < 0) index = 0
  const start = Math.max(0, index - 90)
  const end = Math.min(clean.length, index + 280)
  return `${start > 0 ? '…' : ''}${clean.slice(start, end)}${end < clean.length ? '…' : ''}`
}

function rankChunks(chunks, query, limit) {
  const queryTokens = [...new Set(tokenize(query))]
  const documentCount = chunks.length
  if (documentCount === 0 || queryTokens.length === 0) return []

  const prepared = chunks.map((chunk) => {
    const counts = countTokens(tokenize(chunk.text))
    let length = 0
    for (const value of counts.values()) length += value
    return { chunk, counts, length }
  })
  const averageLength = prepared.reduce((sum, item) => sum + item.length, 0) / Math.max(1, prepared.length)
  const documentFrequency = new Map()
  for (const token of queryTokens) {
    let frequency = 0
    for (const item of prepared) if (item.counts.has(token)) frequency += 1
    documentFrequency.set(token, frequency)
  }

  const needle = query.trim().toLowerCase()
  const ranked = []
  for (const item of prepared) {
    let score = 0
    for (const token of queryTokens) {
      const frequency = item.counts.get(token) || 0
      if (frequency === 0) continue
      const df = documentFrequency.get(token) || 0
      const inverse = Math.log(1 + (documentCount - df + 0.5) / (df + 0.5))
      const normalizer = 1.2 * (1 - 0.75 + (0.75 * item.length) / Math.max(1, averageLength))
      score += inverse * ((frequency * 2.2) / (frequency + normalizer))
    }
    if (score <= 0) continue
    const lower = item.chunk.text.toLowerCase()
    if (needle.length > 0 && lower.includes(needle)) score += 3
    if (needle.length > 0 && item.chunk.path.toLowerCase().includes(needle)) score += 2
    ranked.push({ ...item.chunk, score: Math.round(score * 100) / 100 })
  }
  ranked.sort((left, right) => right.score - left.score)

  const selected = []
  const perPath = new Map()
  for (const item of ranked) {
    const count = perPath.get(item.path) || 0
    if (count >= 3) continue
    perPath.set(item.path, count + 1)
    selected.push(item)
    if (selected.length >= limit) break
  }
  return selected
}

/**
 * Local RAG retrieval: TF-IDF vector cosine similarity over chunk terms.
 * No embedding service is required; files marked RAG use this path, while
 * other files keep the BM25 keyword path.
 */
function rankChunksVector(chunks, query, limit) {
  const queryTokens = [...new Set(tokenize(query))]
  if (chunks.length === 0 || queryTokens.length === 0) return []

  const prepared = chunks.map((chunk) => {
    const counts = countTokens(tokenize(chunk.text))
    return { chunk, counts }
  })
  const documentCount = prepared.length
  const documentFrequency = new Map()
  for (const item of prepared) {
    for (const token of item.counts.keys()) {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1)
    }
  }
  const idf = (token) => Math.log((documentCount + 1) / ((documentFrequency.get(token) || 0) + 1)) + 1
  const queryCounts = countTokens(queryTokens)
  const queryWeights = new Map()
  let queryNormSquared = 0
  for (const [token, frequency] of queryCounts) {
    const weight = frequency * idf(token)
    queryWeights.set(token, weight)
    queryNormSquared += weight * weight
  }
  const queryNorm = Math.sqrt(queryNormSquared) || 1
  const needle = query.trim().toLowerCase()
  const ranked = []

  for (const item of prepared) {
    let dot = 0
    for (const [token, queryWeight] of queryWeights) {
      const frequency = item.counts.get(token) || 0
      if (frequency > 0) dot += queryWeight * frequency * idf(token)
    }
    if (dot <= 0) continue
    let documentNormSquared = 0
    for (const [token, frequency] of item.counts) {
      const weight = frequency * idf(token)
      documentNormSquared += weight * weight
    }
    const documentNorm = Math.sqrt(documentNormSquared) || 1
    let score = dot / (documentNorm * queryNorm)
    if (needle.length > 0 && item.chunk.text.toLowerCase().includes(needle)) score += 0.15
    if (needle.length > 0 && item.chunk.path.toLowerCase().includes(needle)) score += 0.05
    ranked.push({ ...item.chunk, score: Math.round(score * 10000) / 10000 })
  }
  ranked.sort((left, right) => right.score - left.score)

  const selected = []
  const perPath = new Map()
  for (const item of ranked) {
    const count = perPath.get(item.path) || 0
    if (count >= 3) continue
    perPath.set(item.path, count + 1)
    selected.push(item)
    if (selected.length >= limit) break
  }
  return selected
}

export function apply(ctx, config = {}) {
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const settingsFile = path.join(dshHome, 'knowledge-base-settings.json')
  const ragFile = path.join(dshHome, 'knowledge-base-rag.json')
  const configuredByConfig = typeof config?.directory === 'string' && config.directory.trim() !== ''
  const configuredByEnv = typeof process.env.DSH_KB_DIR === 'string' && process.env.DSH_KB_DIR.trim() !== ''
  const fixedDirectory = configuredByConfig
    ? config.directory.trim()
    : configuredByEnv
      ? process.env.DSH_KB_DIR.trim()
      : ''

  function readSettings() {
    try {
      const parsed = JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
      return typeof parsed?.directory === 'string' && parsed.directory.trim() !== ''
        ? parsed.directory.trim()
        : null
    } catch {
      return null
    }
  }

  function saveSettings(directory) {
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true })
    fs.writeFileSync(settingsFile, `${JSON.stringify({ directory }, null, 2)}\n`, 'utf8')
  }

  function readRagStore() {
    try {
      const parsed = JSON.parse(fs.readFileSync(ragFile, 'utf8'))
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
      const store = {}
      for (const [key, value] of Object.entries(parsed)) {
        if (!Array.isArray(value)) continue
        store[key] = value.filter((item) => typeof item === 'string')
      }
      return store
    } catch {
      return {}
    }
  }

  function saveRagStore() {
    fs.mkdirSync(path.dirname(ragFile), { recursive: true })
    fs.writeFileSync(ragFile, `${JSON.stringify(ragStores, null, 2)}\n`, 'utf8')
  }

  let ragStores = readRagStore()

  function prepareDirectory(target) {
    fs.mkdirSync(target, { recursive: true })
    const stat = fs.statSync(target)
    if (!stat.isDirectory()) throw new Error(`Knowledge base path is not a directory: ${target}`)
    return target
  }

  const savedDirectory = fixedDirectory === '' ? readSettings() : null
  let directorySource = configuredByConfig
    ? 'config'
    : configuredByEnv
      ? 'env'
      : savedDirectory !== null
        ? 'settings'
        : 'default'
  let root = prepareDirectory(path.resolve(fixedDirectory || savedDirectory || defaultDirectory()))

  function setDirectory(nextDirectory) {
    if (directorySource === 'config') {
      throw new Error('The knowledge base directory is fixed by the plugin row config. Remove `config.directory` to change it here.')
    }
    if (directorySource === 'env') {
      throw new Error('The knowledge base directory is fixed by the DSH_KB_DIR environment variable. Unset it to change it here.')
    }
    if (typeof nextDirectory !== 'string' || nextDirectory.trim() === '') {
      throw new Error('`directory` must be a non-empty path')
    }
    const input = nextDirectory.trim().replace(/^~(?=$|[\\/])/, os.homedir())
    const target = prepareDirectory(path.isAbsolute(input) ? path.resolve(input) : path.resolve(dshHome, input))
    saveSettings(target)
    root = target
    directorySource = 'settings'
    cache.clear()
    return target
  }

  /** relative path -> { mtimeMs, size, chunks } */
  const cache = new Map()
  const pdfJobs = new Map()
  const pdfCacheDir = path.join(dshHome, 'knowledge-base-cache')

  function ragPaths() {
    const value = ragStores[root]
    return Array.isArray(value) ? value : []
  }

  function isRagEnabled(relativePath) {
    return ragPaths().includes(relativePath)
  }

  function setRagEnabled(relativePath, enabled) {
    if (typeof relativePath !== 'string' || relativePath.trim() === '') {
      throw new Error('`path` must be a non-empty relative path')
    }
    const current = new Set(ragPaths())
    if (enabled) current.add(relativePath)
    else current.delete(relativePath)
    if (current.size === 0) delete ragStores[root]
    else ragStores[root] = [...current].sort()
    saveRagStore()
    return enabled
  }

  let pdfjsModule = null

  function loadPdfjs() {
    if (pdfjsModule !== null) return pdfjsModule
    // pdfjs-dist ships an ESM-only build since 4.x, so it is imported once and
    // shared. Text extraction never renders, so the DOM stubs stay for builds
    // that still probe the rendering globals on load.
    if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = class DOMMatrixStub {}
    if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = class Path2DStub {}
    const require = createRequire(import.meta.url)
    pdfjsModule = (async () => {
      try {
        return await import('pdfjs-dist/legacy/build/pdf.mjs')
      } catch (error) {
        // Node without ESM resolution support: fall back to the CJS build used
        // by pdfjs-dist 3.x, which this package still accepts.
        try {
          return require('pdfjs-dist/legacy/build/pdf.js')
        } catch {
          throw error
        }
      }
    })()
    return pdfjsModule
  }

  async function extractPdfText(file) {
    if (file.size > MAX_BINARY_BYTES) {
      throw new Error(`${file.path} is larger than the ${formatBytes(MAX_BINARY_BYTES)} PDF limit`)
    }
    const cacheKey = crypto
      .createHash('sha1')
      .update(`${path.resolve(root, file.path)}\0${file.size}\0${file.modifiedAt}`)
      .digest('hex')
    const cacheFile = path.join(pdfCacheDir, `${cacheKey}.txt`)
    try {
      return await fsp.readFile(cacheFile, 'utf8')
    } catch {
      // No cache yet.
    }
    const existing = pdfJobs.get(cacheKey)
    if (existing !== undefined) return existing
    const job = (async () => {
      const pdfjs = await loadPdfjs()
      const data = await fsp.readFile(resolveEntry(file.path))
      const document = await pdfjs.getDocument({
        data: new Uint8Array(data),
        useSystemFonts: true,
        disableFontFace: true,
        isEvalSupported: false,
        verbosity: 0,
      }).promise
      const parts = []
      try {
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          const page = await document.getPage(pageNumber)
          try {
            const content = await page.getTextContent()
            const text = content.items
              .map((item) => (typeof item.str === 'string' ? item.str : ''))
              .join(' ')
              .replace(/[ \t]+/g, ' ')
              .trim()
            if (text !== '') parts.push(`\n\n## 第 ${pageNumber} 页\n\n${text}`)
          } finally {
            page.cleanup()
          }
        }
      } finally {
        await document.destroy()
      }
      const output = parts.join('')
      try {
        await fsp.mkdir(pdfCacheDir, { recursive: true })
        await fsp.writeFile(cacheFile, output, 'utf8')
      } catch {
        // A read-only cache directory must not make the document unreadable.
      }
      return output
    })()
    pdfJobs.set(cacheKey, job)
    try {
      return await job
    } finally {
      pdfJobs.delete(cacheKey)
    }
  }

  const toRelative = (absolutePath) => path.relative(root, absolutePath).split(path.sep).join('/')

  function resolveEntry(relativePath) {
    if (typeof relativePath !== 'string' || relativePath.trim() === '') {
      throw new Error('`path` must be a non-empty relative path')
    }
    if (relativePath.includes('\0')) throw new Error('`path` contains an invalid character')
    if (process.platform === 'win32' && relativePath.includes(':')) throw new Error('`path` contains a reserved Windows character')
    if (path.isAbsolute(relativePath)) throw new Error('`path` must be relative to the knowledge base directory')
    const absolutePath = path.resolve(root, relativePath)
    const relative = path.relative(root, absolutePath)
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('`path` must stay inside the knowledge base directory')
    }
    return absolutePath
  }

  async function scanFiles() {
    const files = []
    async function walk(directory) {
      let entries
      try {
        entries = await fsp.readdir(directory, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const absolutePath = path.join(directory, entry.name)
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules') continue
          await walk(absolutePath)
          continue
        }
        if (!entry.isFile()) continue
        try {
          const stat = await fsp.stat(absolutePath)
          const relativePath = toRelative(absolutePath)
          files.push({
            path: relativePath,
            name: entry.name,
            size: stat.size,
            modifiedAt: stat.mtimeMs,
            searchable: isSearchable(relativePath),
            kind: isPdf(relativePath) ? 'pdf' : (isSearchable(relativePath) ? 'text' : 'binary'),
            rag: isRagEnabled(relativePath),
          })
        } catch {
          // A file removed while the directory is walked is simply absent.
        }
      }
    }
    await walk(root)
    files.sort((left, right) => left.path.localeCompare(right.path))
    return files
  }

  async function readSource(file) {
    if (isPdf(file.path)) return extractPdfText(file)
    if (!file.searchable) {
      throw new Error(`Unsupported file type for Q&A: ${file.path}. Supported formats include .md, .txt, .json, .csv, .html, .pdf, and source code.`)
    }
    if (file.size > MAX_TEXT_FILE_BYTES) {
      throw new Error(`${file.path} is larger than the ${formatBytes(MAX_TEXT_FILE_BYTES)} text-file limit`)
    }
    const source = await fsp.readFile(resolveEntry(file.path))
    for (let index = 0; index < Math.min(source.length, 8192); index += 1) {
      if (source[index] === 0) throw new Error(`${file.path} looks like a binary file and cannot be indexed`)
    }
    return source.toString('utf8').replace(/^\uFEFF/, '')
  }

  async function loadIndex() {
    const files = await scanFiles()
    const chunks = []
    for (const file of files) {
      if (!file.searchable) continue
      let cached = cache.get(file.path)
      if (cached === undefined || cached.mtimeMs !== file.modifiedAt || cached.size !== file.size) {
        try {
          const text = await readSource(file)
          cached = {
            mtimeMs: file.modifiedAt,
            size: file.size,
            chunks: buildChunks(file.path, text.replace(/\r\n?/g, '\n')),
          }
        } catch (error) {
          cached = { mtimeMs: file.modifiedAt, size: file.size, chunks: [], error: errorMessage(error) }
        }
        cache.set(file.path, cached)
      }
      if (cached.chunks) chunks.push(...cached.chunks)
    }
    return { files, chunks }
  }

  function fileSummary(files) {
    const searchable = files.filter((file) => file.searchable)
    return {
      files: files.length,
      searchable: searchable.length,
      rag: files.filter((file) => file.rag).length,
      bytes: files.reduce((sum, file) => sum + file.size, 0),
      updatedAt: files.reduce((latest, file) => Math.max(latest, file.modifiedAt), 0),
    }
  }

  async function statePayload() {
    const files = await scanFiles()
    return {
      ok: true,
      directory: root,
      directorySource,
      canChangeDirectory: directorySource !== 'config' && directorySource !== 'env',
      files,
      stats: fileSummary(files),
      supportedExtensions: [...TEXT_EXTENSIONS, PDF_EXTENSION].sort(),
      maxFileBytes: MAX_BINARY_BYTES,
      maxTextFileBytes: MAX_TEXT_FILE_BYTES,
    }
  }

  async function addFile(relativePath, content, overwrite, rag = true) {
    if (typeof content !== 'string') throw new Error('`content` must be a string')
    const absolutePath = resolveEntry(relativePath)
    const relative = toRelative(absolutePath)
    if (isPdf(relative)) throw new Error('PDF files must be dragged in or copied into the directory, not pasted as text')
    if (byteLength(content) > MAX_TEXT_FILE_BYTES) {
      throw new Error(`File content is larger than the ${formatBytes(MAX_TEXT_FILE_BYTES)} text-file limit`)
    }
    if (!isSearchable(relative)) {
      throw new Error(`Unsupported file extension: ${path.extname(relative) || '(none)'}. Use a text document such as .md or .txt.`)
    }
    let exists = false
    try {
      const stat = await fsp.stat(absolutePath)
      if (!stat.isFile()) throw new Error(`${relative} is a directory`)
      exists = true
    } catch (error) {
      if (error instanceof Error && error.message.endsWith('is a directory')) throw error
    }
    if (exists && overwrite !== true) {
      throw new Error(`File already exists: ${relative}. Set overwrite to replace it.`)
    }
    await fsp.mkdir(path.dirname(absolutePath), { recursive: true })
    await fsp.writeFile(absolutePath, content, 'utf8')
    cache.delete(relative)
    setRagEnabled(relative, rag !== false)
    const stat = await fsp.stat(absolutePath)
    return { path: relative, name: path.basename(relative), size: stat.size, modifiedAt: stat.mtimeMs, searchable: true, rag: rag !== false }
  }

  async function importFile(sourcePath, relativePath, overwrite, rag = true) {
    if (typeof sourcePath !== 'string' || sourcePath.trim() === '') {
      throw new Error('`sourcePath` must name an existing file')
    }
    const source = path.resolve(sourcePath)
    const stat = await fsp.stat(source)
    if (!stat.isFile()) throw new Error(`${sourcePath} is not a file`)
    if (stat.size > MAX_BINARY_BYTES) throw new Error(`Source is larger than the ${formatBytes(MAX_BINARY_BYTES)} limit`)
    const relative = relativePath && relativePath.trim() !== '' ? relativePath : path.basename(source)
    const destination = resolveEntry(relative)
    const normalized = toRelative(destination)
    if (!isSearchable(normalized)) {
      throw new Error(`Unsupported file extension: ${path.extname(normalized) || '(none)'}. Use a text document such as .md or .txt, or a .pdf.`)
    }
    if (!isPdf(normalized) && stat.size > MAX_TEXT_FILE_BYTES) {
      throw new Error(`Text file is larger than the ${formatBytes(MAX_TEXT_FILE_BYTES)} limit`)
    }
    if (overwrite !== true && fs.existsSync(destination)) {
      throw new Error(`File already exists: ${normalized}. Set overwrite to replace it.`)
    }
    await fsp.mkdir(path.dirname(destination), { recursive: true })
    await fsp.copyFile(source, destination)
    cache.delete(normalized)
    setRagEnabled(normalized, rag !== false)
    const copied = await fsp.stat(destination)
    return { path: normalized, name: path.basename(normalized), size: copied.size, modifiedAt: copied.mtimeMs, searchable: true, rag: rag !== false }
  }

  async function uploadFile(request, relativePath, overwrite, rag = true) {
    const absolutePath = resolveEntry(relativePath)
    const relative = toRelative(absolutePath)
    if (!isSearchable(relative)) {
      throw new Error(`Unsupported file extension: ${path.extname(relative) || '(none)'}. Use a text document such as .md or .txt, or a .pdf.`)
    }
    let exists = false
    try {
      const stat = await fsp.stat(absolutePath)
      if (!stat.isFile()) throw new Error(`${relative} is a directory`)
      exists = true
    } catch (error) {
      if (error instanceof Error && error.message.endsWith('is a directory')) throw error
    }
    if (exists && overwrite !== true) {
      throw new Error(`File already exists: ${relative}. Set overwrite to replace it.`)
    }
    await fsp.mkdir(path.dirname(absolutePath), { recursive: true })
    const temporary = `${absolutePath}.upload-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const stream = fs.createWriteStream(temporary, { flags: 'wx' })
    let total = 0
    try {
      for await (const chunk of request) {
        total += chunk.length
        if (total > MAX_BINARY_BYTES) throw new Error(`File is larger than the ${formatBytes(MAX_BINARY_BYTES)} limit`)
        if (!stream.write(chunk)) await once(stream, 'drain')
      }
      await new Promise((resolve, reject) => {
        stream.once('error', reject)
        stream.end(resolve)
      })
      if (!isPdf(relative) && total > MAX_TEXT_FILE_BYTES) {
        throw new Error(`Text file is larger than the ${formatBytes(MAX_TEXT_FILE_BYTES)} limit`)
      }
      if (exists) await fsp.rm(absolutePath, { force: true })
      await fsp.rename(temporary, absolutePath)
    } catch (error) {
      stream.destroy()
      await fsp.rm(temporary, { force: true }).catch(() => {})
      throw error
    }
    cache.delete(relative)
    setRagEnabled(relative, rag !== false)
    const stat = await fsp.stat(absolutePath)
    return { path: relative, name: path.basename(relative), size: stat.size, modifiedAt: stat.mtimeMs, searchable: true, rag: rag !== false }
  }

  async function deleteFile(relativePath) {
    const absolutePath = resolveEntry(relativePath)
    const relative = toRelative(absolutePath)
    const stat = await fsp.stat(absolutePath)
    if (!stat.isFile()) throw new Error(`${relative} is not a file`)
    await fsp.unlink(absolutePath)
    cache.delete(relative)
    setRagEnabled(relative, false)
    return { path: relative, deleted: true }
  }

  async function readFile(relativePath, offset, limit) {
    const absolutePath = resolveEntry(relativePath)
    const relative = toRelative(absolutePath)
    const stat = await fsp.stat(absolutePath)
    if (!stat.isFile()) throw new Error(`${relative} is not a file`)
    let text
    if (isPdf(relative)) {
      text = (await extractPdfText({ path: relative, size: stat.size, modifiedAt: stat.mtimeMs })).replace(/\r\n?/g, '\n')
    } else {
      if (stat.size > MAX_TEXT_FILE_BYTES) throw new Error(`${relative} is larger than the ${formatBytes(MAX_TEXT_FILE_BYTES)} text-file limit`)
      const source = await fsp.readFile(absolutePath)
      for (let index = 0; index < Math.min(source.length, 8192); index += 1) {
        if (source[index] === 0) throw new Error(`${relative} looks like a binary file and cannot be shown`)
      }
      text = source.toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
    }
    const lines = text.split('\n')
    const first = clampInteger(offset, 1, 1, Math.max(1, lines.length))
    const count = clampInteger(limit, PREVIEW_LINES, 1, MAX_READ_LINES)
    const selected = lines.slice(first - 1, first - 1 + count)
    let body = selected.join('\n')
    let truncated = first - 1 + selected.length < lines.length
    if (body.length > MAX_TOOL_TEXT) {
      body = body.slice(0, MAX_TOOL_TEXT)
      truncated = true
    }
    return {
      path: relative,
      offset: first,
      limit: count,
      totalLines: lines.length,
      content: body,
      truncated,
    }
  }

  async function search(query, limit) {
    const trimmed = typeof query === 'string' ? query.trim() : ''
    if (trimmed === '') throw new Error('`query` must be a non-empty string')
    const { chunks } = await loadIndex()
    const count = clampInteger(limit, 6, 1, 20)
    const ragChunks = chunks.filter((chunk) => isRagEnabled(chunk.path))
    const keywordChunks = chunks.filter((chunk) => !isRagEnabled(chunk.path))
    const normalize = (items, retrieval) => {
      if (items.length === 0) return []
      const maximum = Math.max(...items.map((item) => item.score), 0.0001)
      return items.map((item) => ({
        ...item,
        score: Math.round((item.score / maximum) * 1000) / 1000,
        retrieval,
      }))
    }
    const ragResults = normalize(rankChunksVector(ragChunks, trimmed, count * 2), 'rag')
    const keywordResults = normalize(rankChunks(keywordChunks, trimmed, count * 2), 'keyword')
    const merged = [...ragResults, ...keywordResults]
      .sort((left, right) => right.score - left.score || (left.retrieval === 'rag' ? -1 : 1))
      .slice(0, count)
    return {
      query: trimmed,
      totalChunks: chunks.length,
      ragChunks: ragChunks.length,
      keywordChunks: keywordChunks.length,
      results: merged.map((item) => ({
        path: item.path,
        startLine: item.startLine,
        endLine: item.endLine,
        heading: item.heading || '',
        score: item.score,
        retrieval: item.retrieval,
        snippet: snippetFor(item.text, trimmed),
      })),
    }
  }

  function searchText(payload) {
    const header = `Knowledge base search: "${payload.query}"\nDirectory: ${root}\nIndexed passages: ${payload.totalChunks} (RAG ${payload.ragChunks}, keyword ${payload.keywordChunks})\nMatches: ${payload.results.length}`
    if (payload.results.length === 0) {
      return `${header}\n\nNo matching passage found. Call knowledge_base with action "list" to inspect available documents, or answer that the knowledge base has no matching material.`
    }
    const rows = payload.results.map((result, index) => {
      const heading = result.heading ? ` — ${result.heading}` : ''
      return `${index + 1}. [${result.retrieval === 'rag' ? 'RAG' : 'keyword'}] ${result.path}:${result.startLine}-${result.endLine}${heading} (score ${result.score})\n   ${result.snippet}`
    })
    return `${header}\n\n${rows.join('\n\n')}\n\nRead a result with action "read" and cite it as path:startLine-endLine.`
  }

  function listText(files) {
    const summary = fileSummary(files)
    const header = `Knowledge base: ${root}\n${summary.files} file(s), ${summary.searchable} searchable, ${summary.rag} RAG, ${formatBytes(summary.bytes)} total`
    if (files.length === 0) return `${header}\n\nThe directory is empty. Add a document in the sidebar, or call action "add" / "import".`
    const visible = files.slice(0, 60).map((file) => {
      const flags = `${file.rag ? ' [RAG]' : ''}${file.searchable ? '' : ' [not searchable]'}`
      return `- ${file.path} (${formatBytes(file.size)}, ${new Date(file.modifiedAt).toISOString()})${flags}`
    })
    const more = files.length > visible.length ? `\n… ${files.length - visible.length} more file(s) omitted` : ''
    return `${header}\n\n${visible.join('\n')}${more}`
  }

  function readText(payload) {
    const last = payload.offset + payload.content.split('\n').length - 1
    const numbered = payload.content
      .split('\n')
      .map((line, index) => `${payload.offset + index}\t${line}`)
      .join('\n')
    return `Knowledge base file: ${payload.path}\nLines ${payload.offset}-${Math.min(last, payload.totalLines)} of ${payload.totalLines}${payload.truncated ? ' (truncated)' : ''}\n\n${numbered}`
  }

  async function executeTool(args) {
    const action = typeof args?.action === 'string' ? args.action.toLowerCase() : ''
    switch (action) {
      case 'list': {
        const files = await scanFiles()
        return {
          text: listText(files),
          action,
          directory: root,
          files,
          stats: fileSummary(files),
        }
      }
      case 'search': {
        const payload = await search(args.query, args.limit)
        return {
          text: searchText(payload),
          action,
          ...payload,
        }
      }
      case 'read': {
        const payload = await readFile(args.path, args.offset, args.limit)
        return {
          text: readText(payload),
          action,
          ...payload,
        }
      }
      case 'add': {
        const file = await addFile(args.path, args.content, args.overwrite === true, args.rag !== false)
        return {
          text: `Added ${file.path} (${formatBytes(file.size)}). ${file.rag ? 'RAG retrieval enabled.' : 'Keyword retrieval only.'}`,
          action,
          file,
        }
      }
      case 'import': {
        const file = await importFile(args.sourcePath, args.path, args.overwrite === true, args.rag !== false)
        return {
          text: `Imported ${file.path} (${formatBytes(file.size)}). ${file.rag ? 'RAG retrieval enabled.' : 'Keyword retrieval only.'}`,
          action,
          file,
        }
      }
      case 'delete': {
        const result = await deleteFile(args.path)
        return {
          text: `Deleted ${result.path}. It is no longer searchable.`,
          action,
          path: result.path,
          deleted: true,
        }
      }
      default:
        throw new Error('`action` must be one of: list, search, read, add, import, delete')
    }
  }

  ctx.effect(() => ctx.tools.register({
    name: 'knowledge_base',
    description: 'Search, read, add, import, or delete documents in the local knowledge base. Use this before answering questions that may be covered by local or internal documents. Files marked RAG use local vector retrieval; other files use keyword retrieval. The directory is rescanned on every call, so new, edited, and deleted files are reflected immediately. Search first, then read the best relative path and cite it as path:startLine-endLine.',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['list', 'search', 'read', 'add', 'import', 'delete'],
        description: 'Operation to perform. Use search for questions, read for a cited passage, list to inspect files, add/import to ingest a document, delete to remove one.',
      },
      query: {
        type: 'string',
        description: 'Search words or a natural-language question. Required for action "search"; Chinese and English are both supported.',
      },
      path: {
        type: 'string',
        description: 'Relative path inside the knowledge base, using forward slashes. Required for read/delete and for add; optional target path for import.',
      },
      sourcePath: {
        type: 'string',
        description: 'Absolute path of an existing local text file to copy into the knowledge base. Required for action "import".',
      },
      content: {
        type: 'string',
        description: 'Full UTF-8 text to write. Required for action "add".',
      },
      overwrite: {
        type: 'boolean',
        description: 'Replace an existing file for add/import. Defaults to false, which fails rather than overwriting.',
      },
      rag: {
        type: 'boolean',
        description: 'For add/import, enable local vector RAG retrieval for this file. Defaults to true; false keeps keyword retrieval only. Use the sidebar toggle to change it later.',
      },
      offset: {
        type: 'integer',
        description: '1-based first line for action "read". Defaults to 1.',
      },
      limit: {
        type: 'integer',
        description: 'Maximum results for search (1-20, default 6) or lines for read (1-400, default 400).',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        required: ['text'],
        properties: {
          text: { type: 'string' },
          action: { type: 'string' },
        },
      },
      render(_args, value) {
        const text = value && typeof value.text === 'string' ? value.text : JSON.stringify(value, null, 2)
        return [{ type: 'text', text }]
      },
    },
    execute: executeTool,
  }), 'knowledge-base: tool')

  function sendJson(res, status, payload) {
    const body = JSON.stringify(payload)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(body),
    })
    res.end(body)
  }

  async function sendRaw(request, response, relativePath) {
    const absolutePath = resolveEntry(relativePath)
    const stat = await fsp.stat(absolutePath)
    if (!stat.isFile()) throw new Error(`${relativePath} is not a file`)
    const total = stat.size
    const encodedName = encodeURIComponent(path.basename(absolutePath)).replace(/'/g, '%27')
    const headers = {
      'content-type': mimeFor(relativePath),
      'content-disposition': `inline; filename*=UTF-8''${encodedName}`,
      'accept-ranges': 'bytes',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    }
    const range = request.headers.range
    if (typeof range === 'string' && range !== '') {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
      let start = 0
      let end = total - 1
      if (match === null) {
        response.writeHead(416, { 'content-range': `bytes */${total}` })
        response.end()
        return
      }
      if (match[1] === '') {
        const suffix = Number(match[2])
        if (!Number.isFinite(suffix) || suffix <= 0) {
          response.writeHead(416, { 'content-range': `bytes */${total}` })
          response.end()
          return
        }
        start = Math.max(0, total - suffix)
      } else {
        start = Number(match[1])
      }
      if (match[2] !== '') end = Number(match[2])
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= total || end < start) {
        response.writeHead(416, { 'content-range': `bytes */${total}` })
        response.end()
        return
      }
      end = Math.min(end, total - 1)
      response.writeHead(206, {
        ...headers,
        'content-range': `bytes ${start}-${end}/${total}`,
        'content-length': end - start + 1,
      })
      if (request.method === 'HEAD') {
        response.end()
        return
      }
      const stream = fs.createReadStream(absolutePath, { start, end })
      stream.on('error', () => response.destroy())
      stream.pipe(response)
      return
    }
    response.writeHead(200, { ...headers, 'content-length': total })
    if (request.method === 'HEAD') {
      response.end()
      return
    }
    const stream = fs.createReadStream(absolutePath)
    stream.on('error', () => response.destroy())
    stream.pipe(response)
  }

  function sameOrigin(request) {
    const origin = request.headers.origin
    if (origin === undefined) return true
    try {
      return new URL(origin).host === request.headers.host
    } catch {
      return false
    }
  }

  async function readBody(request) {
    const declared = Number(request.headers['content-length'] || 0)
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Error('Request body is too large')
    const chunks = []
    let total = 0
    for await (const chunk of request) {
      total += chunk.length
      if (total > MAX_BODY_BYTES) throw new Error('Request body is too large')
      chunks.push(chunk)
    }
    const text = Buffer.concat(chunks).toString('utf8')
    try {
      return JSON.parse(text)
    } catch {
      throw new Error('Request body must be JSON')
    }
  }

  async function handleHttp(request, response) {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const suffix = url.pathname.slice(ROUTE.length)
    if (!sameOrigin(request)) {
      sendJson(response, 403, { ok: false, error: 'Cross-origin request refused' })
      return
    }
    if (request.headers['sec-fetch-site'] === 'cross-site') {
      sendJson(response, 403, { ok: false, error: 'Cross-site request refused' })
      return
    }
    try {
      if ((request.method === 'GET' || request.method === 'HEAD') && (suffix === '' || suffix === '/state')) {
        sendJson(response, 200, await statePayload())
        return
      }
      if ((request.method === 'GET' || request.method === 'HEAD') && suffix === '/raw') {
        await sendRaw(request, response, url.searchParams.get('path') || '')
        return
      }
      if ((request.method === 'GET' || request.method === 'HEAD') && suffix === '/file') {
        const relativePath = url.searchParams.get('path') || ''
        const offset = url.searchParams.get('offset')
        const limit = url.searchParams.get('limit')
        const payload = await readFile(relativePath, offset === null ? 1 : Number(offset), limit === null ? PREVIEW_LINES : Number(limit))
        sendJson(response, 200, { ok: true, ...payload })
        return
      }
      if (request.method === 'POST' && suffix === '/files') {
        const body = await readBody(request)
        const file = await addFile(body?.path, body?.content, body?.overwrite === true, body?.rag !== false)
        sendJson(response, 200, { ok: true, file })
        return
      }
      if (request.method === 'POST' && suffix === '/upload') {
        const relativePath = url.searchParams.get('path') || ''
        const rag = url.searchParams.get('rag') !== 'false'
        const file = await uploadFile(request, relativePath, url.searchParams.get('overwrite') === 'true', rag)
        sendJson(response, 200, { ok: true, file })
        return
      }
      if (request.method === 'POST' && suffix === '/rag') {
        const body = await readBody(request)
        const absolutePath = resolveEntry(body?.path)
        const relative = toRelative(absolutePath)
        const stat = await fsp.stat(absolutePath)
        if (!stat.isFile()) throw new Error(`${relative} is not a file`)
        setRagEnabled(relative, body?.rag === true)
        sendJson(response, 200, { ok: true, path: relative, rag: body?.rag === true })
        return
      }
      if (request.method === 'POST' && suffix === '/delete') {
        const body = await readBody(request)
        const result = await deleteFile(body?.path)
        sendJson(response, 200, { ok: true, ...result })
        return
      }
      if (request.method === 'POST' && suffix === '/directory') {
        const body = await readBody(request)
        setDirectory(body?.directory)
        sendJson(response, 200, await statePayload())
        return
      }
      sendJson(response, 404, { ok: false, error: 'Not found' })
    } catch (error) {
      sendJson(response, 400, { ok: false, error: errorMessage(error) })
    }
  }

  ctx.inject(['webServer'], (scoped) => {
    scoped.effect(() => scoped.webServer.register({
      kind: 'prefix',
      path: ROUTE,
      handler: (request, response) => handleHttp(request, response),
    }), 'knowledge-base: HTTP routes')
  })

  ctx.inject(['systemPrompt'], (scoped) => {
    scoped.effect(() => scoped.systemPrompt.section({
      name: 'knowledge-base',
      order: 35,
      text: () => `Local knowledge base: "${root}" holds documents the user expects you to use. For any question that could be answered by local or internal documents, call the \`knowledge_base\` tool with action \`search\` first, then \`read\` the best relative path. Cite each claim as \`path:startLine-endLine\`. Files marked RAG use local vector retrieval; other files use keyword retrieval. Do not invent content when search returns nothing; say the knowledge base has no matching document. Files added, edited, or deleted are reflected on the next call, so search again instead of relying on earlier results.`,
    }), 'knowledge-base: prompt section')
  })
}
