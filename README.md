# local-knowledge-base

A local-first RAG knowledge base for **DeepSeek Harness (DSH)**. Drag documents into a folder, choose per-file vector retrieval, preview the original PDF/Markdown, and let the agent answer with citations.

**本地优先的 DSH 知识库插件**：把文件拖进目录，即可在对话中检索、阅读并引用；支持 PDF 解析、文件级 RAG 开关，以及一个专用的「知识库问答」智能体模式。

> A community plugin. Not affiliated with DeepSeek. MIT licensed.

## Install

The plugin is published on npm as **`local-knowledge-base`**.

Profile CLI (no prompts, nothing to confirm):

```sh
dsh plugin --profile web add local-knowledge-base
```

Replace `web` with your profile name. Restart `dsh` once — a newly added bundle is not applied to a running process — then open **本地知识库 / Knowledge base** in the left sidebar.

From the DSH Web UI instead:

1. Open **Plugins → Add plugin**.
2. Enter `local-knowledge-base`.
3. Install and enable the bundle.
4. Refresh the page if the sidebar icon does not appear.

Or ask the agent to install it with `plugin_manager`:

```text
install_bundle target: local-knowledge-base
```

### Pin a version

```sh
dsh plugin --profile web add local-knowledge-base@1.0.2
```

The explicit pin matters: pnpm holds back very recent releases, so a bare `add` can resolve to an older version.

### Add to Discover

The package ships a format-1 market index. Add one of these URLs under **Plugins → Discover → Manage index sources**:

```text
https://unpkg.com/local-knowledge-base@1.0.2/market-index.json
```

```text
https://cdn.jsdelivr.net/npm/local-knowledge-base@1.0.2/market-index.json
```

The bundle installs two rows:

- `knowledge-base` — the Host/Client plugin and the `knowledge_base` tool.
- `preset-knowledge-qa` — the **知识库问答** Agent Preset.

## Features

- **Drag-and-drop import** — drop one or many files anywhere on the knowledge-base page. Large PDFs stream to the Host instead of being read into browser memory.
- **PDF text extraction** — uses `pdfjs-dist`; the extracted text is cached under `%DSH_HOME%\knowledge-base-cache`, so later searches are fast.
- **Per-file RAG** — every searchable file has a `RAG` toggle. RAG files use local TF-IDF vector cosine retrieval; non-RAG files use BM25 keyword retrieval. Results are merged and tagged `[RAG]` or `[keyword]`.
- **Agent tool** — registers `knowledge_base` with `list`, `search`, `read`, `add`, `import`, and `delete` actions. Search results include `path`, line range, snippet, and retrieval mode.
- **Dedicated agent mode** — the bundle also installs the **知识库问答 / Knowledge Q&A** Agent Preset. In that mode the agent must search the library first, cite `path:startLine-endLine`, and must not invent an answer when nothing matches.
- **Persistent folder** — documents stay in the configured folder between sessions; there is no need to re-import them each time.
- **Live updates** — the directory is rescanned on every call; files added, edited, or deleted are reflected on the next search.
- **Preview keeps format** — PDFs are served as the original file through a range-capable `/raw` route and rendered by the browser's PDF viewer; Markdown is rendered with headings, lists, code blocks, and links, with a source toggle.
- **Custom directory** — change the folder from the management page; the choice is saved under `%DSH_HOME%\knowledge-base-settings.json`. `DSH_KB_DIR` or the plugin row's `config.directory` takes precedence.
- **Local only** — no cloud embedding service, no file upload to a third party. The Host reads files from disk.

## Use

### Manage files

Open **本地知识库 / Knowledge base** in the sidebar:

- Drop files onto the page.
- Toggle **新文件启用 RAG / RAG for new files** before dropping.
- Use the row-level `RAG` button to change one file later.
- Add, preview, filter, and delete files from the same page.
- Change the directory with **更改目录 / Change directory**.

Default directory:

```text
%DSH_HOME%\knowledge-base
```

On Windows this is usually `C:\Users\<name>\.dsh\knowledge-base`.

### Ask questions

Start a new session and select the **知识库问答** preset, then ask normally:

```text
根据知识库解释反向传播和梯度下降的区别。
```

```text
知识库里有哪些关于动态规划的内容？
```

The agent calls `knowledge_base` automatically. No per-session import is needed.

## Supported files

- Text: `.md`, `.markdown`, `.mdx`, `.txt`, `.rst`, `.json`, `.jsonl`, `.csv`, `.tsv`, `.yaml`, `.yml`, `.toml`, `.ini`, `.log`, `.html`, `.xml`, and common source-code extensions.
- PDF: `.pdf` (text layer required; scanned image-only PDFs need OCR).
- Limits: 32 MB per text file, 256 MB per PDF.
- DOCX, images, and other binary formats are not indexed yet.

## RAG details

RAG means retrieval-augmented generation. This plugin owns the retrieval layer; the selected DSH model performs the generation.

- **RAG files**: chunks are tokenized into terms (latin words + CJK bigrams), weighted by TF-IDF, and ranked by cosine similarity.
- **Non-RAG files**: BM25 keyword ranking.
- **Merged results**: each result carries `retrieval: 'rag' | 'keyword'`.
- **No external embeddings**: the current vectorizer is local and lexical, not a neural embedding model. It is lightweight and private, but it does not provide deep semantic matching. A future version can add an OpenAI-compatible or Ollama embedding backend.
- **File-level setting**: `%DSH_HOME%\knowledge-base-rag.json`, grouped by knowledge-base directory.

## Privacy and security

- Files never leave the machine unless you explicitly send their content to a model in a conversation.
- The management API is same-origin and refuses `Origin`/`Sec-Fetch-Site` cross-site requests.
- `path` values are resolved inside the configured knowledge-base directory; traversal is rejected.
- PDFs are served inline with `X-Content-Type-Options: nosniff`; the raw route supports byte ranges for the browser PDF viewer.
- The plugin does not execute uploaded files.

## Requirements

- DSH `0.2.x` (the Web UI profile).
- Node.js 20 or newer on the DSH host, for the bundled `pdfjs-dist@4`.
- Desktop or `dsh web`; the browser half mounts into `@deepseek-ai/dsh-client-ui-layout`.

## Development

```
index.js         Host plugin: scanning, chunking, PDF extraction, retrieval, tools, HTTP API
client.js        Web UI: sidebar panel, drag/drop, preview, RAG toggles
cordis.patch.yml Bundle rows: the plugin and the Knowledge Q&A preset
locale/          Plugin Manager title/description
icon.svg         Bundle icon
```

The Host requires `pdfjs-dist@4.10.38` or a compatible 4.x release. It is declared as a dependency and installed with the package.

If you develop against a local checkout, link it into a profile instead of installing from npm:

```sh
dsh plugin --profile web add link:/absolute/path/to/local-knowledge-base
```

## License

MIT — see [LICENSE](LICENSE). `pdfjs-dist` is distributed under the Apache-2.0 license; see its package for details.
