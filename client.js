window.__ModuleLoader__.load({
  id: 'local-knowledge-base',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const NS = 'knowledge-base'
    const API = '/api/knowledge-base'
    const INLINE_TEXT_LIMIT = 2 * 1024 * 1024
    const MAX_UPLOAD_BYTES = 256 * 1024 * 1024

    const zh = {
      'nav': '本地知识库',
      'eyebrow': '本地知识',
      'title': '本地知识库',
      'subtitle': '让智能体检索并引用这个目录中的文档。新增、编辑或删除文件后，下一次提问会自动使用最新内容。',
      'pathLabel': '目录',
      'changeDirectory': '更改目录',
      'directoryTitle': '更改知识库目录',
      'directoryPlaceholder': '例如：E:\\knowledge',
      'browse': '浏览…',
      'directoryHint': '切换后只改变读取位置，不会移动旧目录中的文件。',
      'directoryChanged': '知识库目录已切换到 {path}',
      'directoryRequired': '请填写目录路径。',
      'pickerUnavailable': '当前界面不支持目录选择器，请直接输入路径。',
      'fixedDirectory': '目录由启动配置固定，无法在这里更改。',
      'sourceLabel': '来源：{source}',
      'sourceDefault': '默认目录',
      'sourceSettings': '自定义目录',
      'sourceEnv': '环境变量 DSH_KB_DIR',
      'sourceConfig': '插件配置',
      'refresh': '刷新',
      'add': '新增文件',
      'addTitle': '新增文本文档',
      'fileName': '相对路径',
      'fileNameHint': '例如：制度/报销标准.md',
      'content': '内容',
      'chooseLocal': '从本地选择文件',
      'overwrite': '若已存在则覆盖',
      'save': '保存',
      'cancel': '取消',
      'searchPlaceholder': '筛选文件…',
      'dropTitle': '松开鼠标，导入到知识库',
      'dropHint': '支持 PDF 和文本文件；同名文件不会自动覆盖。',
      'dropBusy': '正在导入…',
      'dropped': '已导入 {count} 个文件',
      'dropFailed': '部分文件未导入',
      'dropNoFiles': '没有检测到可导入的文件。',
      'dropTooLarge': '{name} 超过 256 MB，已跳过。',
      'dropEmptyHint': '也可以把文件直接拖到页面任意位置。',
      'empty': '知识库还是空的。新增一个文档，或把文件复制到上面的目录。',
      'emptyFilter': '没有匹配的文件。',
      'files': '{count} 个文件',
      'searchable': '{count} 个可检索',
      'ragDefault': '新文件启用 RAG',
      'ragCount': '{count} 个 RAG 文件',
      'ragEnabled': '已为 {path} 启用 RAG',
      'ragDisabled': '已关闭 {path} 的 RAG',
      'ragToggle': '切换 RAG 向量检索',
      'ragHint': 'RAG 使用本地向量检索；关闭后仅用关键词检索。',
      'ragDropOn': '新文件将启用 RAG 向量检索。',
      'ragDropOff': '新文件仅使用关键词检索。',
      'totalSize': '共 {size}',
      'preview': '预览',
      'viewOriginal': '原文',
      'viewText': '文本',
      'viewRendered': '渲染',
      'viewSource': '源码',
      'selectFile': '选择左侧文件即可预览内容。',
      'delete': '删除',
      'confirmDelete': '确认删除',
      'notSearchable': '不可检索',
      'loading': '加载中…',
      'previewLoading': '正在读取…',
      'error': '操作失败',
      'pathRequired': '请填写相对路径。',
      'saved': '已保存 {path}',
      'deleted': '已删除 {path}',
      'copied': '已复制路径',
      'copyPath': '复制路径',
      'lines': '第 {from}–{to} 行，共 {total} 行',
      'truncated': '预览已截断',
      'fileTooLarge': '文件超过 256 MB，无法导入。',
      'deleteHint': '再次点击确认删除。',
    }

    const en = {
      'nav': 'Knowledge base',
      'eyebrow': 'Local knowledge',
      'title': 'Knowledge base',
      'subtitle': 'Let the agent search and cite documents in this folder. New, edited, and deleted files are picked up by the next question.',
      'pathLabel': 'Directory',
      'changeDirectory': 'Change directory',
      'directoryTitle': 'Change knowledge base directory',
      'directoryPlaceholder': 'e.g. E:\\knowledge',
      'browse': 'Browse…',
      'directoryHint': 'Switching only changes where documents are read; files in the old directory are not moved.',
      'directoryChanged': 'Knowledge base directory changed to {path}',
      'directoryRequired': 'Enter a directory path.',
      'pickerUnavailable': 'This UI has no directory picker; type the path instead.',
      'fixedDirectory': 'The directory is fixed by startup configuration and cannot be changed here.',
      'sourceLabel': 'Source: {source}',
      'sourceDefault': 'Default',
      'sourceSettings': 'Custom',
      'sourceEnv': 'DSH_KB_DIR environment variable',
      'sourceConfig': 'Plugin config',
      'refresh': 'Refresh',
      'add': 'Add file',
      'addTitle': 'Add a text document',
      'fileName': 'Relative path',
      'fileNameHint': 'e.g. policies/expense.md',
      'content': 'Content',
      'chooseLocal': 'Choose a local file',
      'overwrite': 'Overwrite if it exists',
      'save': 'Save',
      'cancel': 'Cancel',
      'searchPlaceholder': 'Filter files…',
      'dropTitle': 'Drop to import into the knowledge base',
      'dropHint': 'PDF and text files are supported; existing files are not overwritten automatically.',
      'dropBusy': 'Importing…',
      'dropped': 'Imported {count} file(s)',
      'dropFailed': 'Some files were not imported',
      'dropNoFiles': 'No importable files were detected.',
      'dropTooLarge': '{name} is larger than 256 MB and was skipped.',
      'dropEmptyHint': 'You can also drag files anywhere onto this page.',
      'empty': 'The knowledge base is empty. Add a document or copy files into the directory above.',
      'emptyFilter': 'No files match this filter.',
      'files': '{count} files',
      'searchable': '{count} searchable',
      'ragDefault': 'RAG for new files',
      'ragCount': '{count} RAG files',
      'ragEnabled': 'RAG enabled for {path}',
      'ragDisabled': 'RAG disabled for {path}',
      'ragToggle': 'Toggle RAG vector retrieval',
      'ragHint': 'RAG uses local vector retrieval; off keeps keyword retrieval only.',
      'ragDropOn': 'RAG vector retrieval will be enabled for new files.',
      'ragDropOff': 'New files will use keyword retrieval only.',
      'totalSize': '{size} total',
      'preview': 'Preview',
      'viewOriginal': 'Original',
      'viewText': 'Text',
      'viewRendered': 'Rendered',
      'viewSource': 'Source',
      'selectFile': 'Select a file on the left to preview it.',
      'delete': 'Delete',
      'confirmDelete': 'Confirm delete',
      'notSearchable': 'Not searchable',
      'loading': 'Loading…',
      'previewLoading': 'Reading…',
      'error': 'Operation failed',
      'pathRequired': 'Enter a relative path.',
      'saved': 'Saved {path}',
      'deleted': 'Deleted {path}',
      'copied': 'Path copied',
      'copyPath': 'Copy path',
      'lines': 'Lines {from}–{to} of {total}',
      'truncated': 'Preview truncated',
      'fileTooLarge': 'The file is larger than 256 MB and cannot be imported.',
      'deleteHint': 'Click again to confirm deletion.',
    }

    const css = `
.kb-page {
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
  padding: 28px 32px 56px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
}
.kb-drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 80%, transparent);
  pointer-events: none;
}
.kb-drop-card {
  max-width: 440px;
  padding: 30px 38px;
  border: 2px dashed var(--dsw-alias-brand-primary);
  border-radius: 18px;
  background: var(--dsw-alias-bg-overlay);
  box-shadow: 0 18px 50px color-mix(in srgb, var(--dsw-alias-bg-base) 42%, transparent);
  text-align: center;
}
.kb-drop-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  margin: 0 auto 14px;
  border-radius: 12px;
  color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent);
}
.kb-drop-title {
  font-size: 16px;
  font-weight: 650;
  line-height: 1.4;
}
.kb-drop-hint {
  margin-top: 7px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.55;
}
.kb-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}
.kb-eyebrow {
  margin-bottom: 6px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.kb-title {
  margin: 0;
  font-size: 21px;
  line-height: 1.25;
  font-weight: 650;
}
.kb-subtitle {
  margin: 8px 0 0;
  max-width: 760px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 1.55;
}
.kb-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.kb-btn {
  box-sizing: border-box;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  line-height: 30px;
  cursor: pointer;
  white-space: nowrap;
}
.kb-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.kb-btn:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}
.kb-btn:disabled { cursor: default; opacity: 0.55; }
.kb-btn-primary {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
  font-weight: 600;
}
.kb-btn-danger { color: var(--dsw-alias-state-error-primary); }
.kb-btn-icon { padding: 0 9px; }
.kb-path {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 20px;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.kb-path code {
  flex: 1 1 320px;
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
}
.kb-dir-form {
  margin-top: 12px;
  padding: 14px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
}
.kb-dir-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.kb-dir-row .kb-input { flex: 1; min-width: 0; }
.kb-hint {
  margin-top: 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 1.5;
}
.kb-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.kb-chip {
  padding: 3px 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 18px;
}
.kb-notice, .kb-error {
  margin-top: 14px;
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.45;
}
.kb-notice {
  border: 1px solid var(--dsw-alias-state-success-primary);
  color: var(--dsw-alias-state-success-primary);
}
.kb-error {
  border: 1px solid var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-state-error-primary);
}
.kb-form {
  margin-top: 18px;
  padding: 16px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
}
.kb-form-title {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
}
.kb-field { display: block; margin-bottom: 12px; }
.kb-label {
  display: block;
  margin-bottom: 6px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.kb-input, .kb-textarea {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
}
.kb-input { height: 34px; padding: 0 10px; }
.kb-textarea {
  min-height: 190px;
  padding: 10px;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  line-height: 1.5;
}
.kb-input:focus, .kb-textarea:focus {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -1px;
}
.kb-form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}
.kb-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.kb-file-pick {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-brand-primary);
  font-size: 12px;
  cursor: pointer;
}
.kb-file-pick input { display: none; }
.kb-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: 20px 0 10px;
}
.kb-rag-default { flex: none; white-space: nowrap; }
.kb-filter {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
}
.kb-filter:focus { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
.kb-body {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}
.kb-list {
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  overflow: hidden;
}
.kb-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  cursor: pointer;
}
.kb-row:last-child { border-bottom: 0; }
.kb-row:hover { background: var(--dsw-alias-bg-layer-2); }
.kb-row[data-active='true'] { background: var(--dsw-alias-bg-layer-2); }
.kb-file-icon {
  flex: none;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 7px;
  color: var(--dsw-alias-label-secondary);
}
.kb-row-main { flex: 1; min-width: 0; }
.kb-row-name {
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kb-row-meta {
  margin-top: 3px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.kb-badge {
  display: inline-block;
  margin-top: 5px;
  padding: 1px 6px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  color: var(--dsw-alias-state-warn-primary);
  font-size: 10px;
}
.kb-badge-pdf { color: var(--dsw-alias-brand-primary); }
.kb-row-actions { display: flex; align-items: center; gap: 6px; flex: none; }
.kb-row-delete {
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  line-height: 24px;
  padding: 0 7px;
  cursor: pointer;
}
.kb-row-delete:hover { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-border-l1); }
.kb-row-delete[data-confirm='true'] {
  border-color: var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-state-error-primary);
}
.kb-rag-btn {
  box-sizing: border-box;
  min-height: 24px;
  padding: 0 7px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 10px;
  font-weight: 600;
  line-height: 22px;
  letter-spacing: 0.03em;
  cursor: pointer;
}
.kb-rag-btn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.kb-rag-btn[data-active='true'] {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-bg-base);
}
.kb-rag-btn:disabled { cursor: default; opacity: 0.55; }
.kb-empty {
  padding: 42px 22px;
  border: 1px dashed var(--dsw-alias-border-l2);
  border-radius: 12px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 1.6;
  text-align: center;
}
.kb-preview {
  position: sticky;
  top: 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  overflow: hidden;
}
.kb-preview-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 13px 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.kb-preview-title {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
}
.kb-preview-sub { margin-top: 3px; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.kb-preview pre {
  margin: 0;
  padding: 14px;
  max-height: 560px;
  overflow: auto;
  color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.kb-preview-empty {
  padding: 46px 20px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.6;
  text-align: center;
}
.kb-preview-tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 4px;
  flex: none;
}
.kb-mode-btn {
  box-sizing: border-box;
  min-height: 26px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  line-height: 24px;
  cursor: pointer;
}
.kb-mode-btn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.kb-mode-btn[data-active='true'] {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-bg-base);
}
.kb-mode-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.kb-pdf-frame {
  display: block;
  width: 100%;
  height: 640px;
  border: 0;
  background: var(--dsw-alias-bg-layer-2);
}
.kb-markdown {
  max-height: 640px;
  overflow: auto;
  padding: 16px;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.kb-markdown h1, .kb-markdown h2, .kb-markdown h3,
.kb-markdown h4, .kb-markdown h5, .kb-markdown h6 {
  margin: 18px 0 8px;
  line-height: 1.35;
  font-weight: 650;
}
.kb-markdown h1 { font-size: 19px; }
.kb-markdown h2 { font-size: 17px; }
.kb-markdown h3 { font-size: 15px; }
.kb-markdown h4, .kb-markdown h5, .kb-markdown h6 { font-size: 13px; }
.kb-markdown > :first-child { margin-top: 0; }
.kb-markdown p { margin: 0 0 10px; }
.kb-markdown ul, .kb-markdown ol { margin: 0 0 10px; padding-left: 22px; }
.kb-markdown li { margin: 2px 0; }
.kb-markdown blockquote {
  margin: 0 0 10px;
  padding: 6px 12px;
  border-left: 3px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
}
.kb-markdown blockquote p { margin: 0; }
.kb-markdown hr { border: 0; border-top: 1px solid var(--dsw-alias-border-l1); margin: 16px 0; }
.kb-markdown a { color: var(--dsw-alias-brand-primary); }
.kb-markdown pre {
  margin: 0 0 12px;
  padding: 12px;
  max-height: none;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.kb-markdown code {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
}
.kb-markdown :not(pre) > code {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2);
}
.kb-pdf-page-title {
  margin: 14px 14px 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  font-weight: 600;
}
.kb-preview .kb-pdf-page-text {
  margin: 0;
  padding: 8px 14px 14px;
  max-height: none;
}
.kb-skeleton {
  height: 68px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: linear-gradient(90deg, var(--dsw-alias-bg-layer-1), var(--dsw-alias-bg-layer-2), var(--dsw-alias-bg-layer-1));
  background-size: 200% 100%;
  animation: kb-shimmer 1.4s linear infinite;
}
@keyframes kb-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@media (max-width: 980px) {
  .kb-body { grid-template-columns: minmax(0, 1fr); }
  .kb-preview { position: static; }
}
@media (max-width: 640px) {
  .kb-page { padding: 20px 16px 44px; }
  .kb-head { flex-direction: column; }
  .kb-head-actions { width: 100%; }
  .kb-head-actions .kb-btn { flex: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .kb-skeleton { animation: none; }
}
`

    function ensureStyles(ctx) {
      ctx.effect(() => {
        if (typeof document === 'undefined') return () => {}
        const style = document.createElement('style')
        style.dataset.plugin = 'local-knowledge-base'
        style.textContent = css
        document.head.appendChild(style)
        return () => style.remove()
      }, 'knowledge-base: styles')
    }

    function formatBytes(bytes) {
      if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    function formatDate(value) {
      if (!value) return ''
      try {
        return new Intl.DateTimeFormat(undefined, {
          year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        }).format(new Date(value))
      } catch {
        return new Date(value).toLocaleString()
      }
    }

    async function request(pathname, options = {}) {
      const response = await fetch(`${API}${pathname}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        ...options,
        headers: {
          ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(options.headers || {}),
        },
      })
      let payload
      try {
        payload = await response.json()
      } catch {
        throw new Error(`Server returned HTTP ${response.status}`)
      }
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `Request failed (HTTP ${response.status})`)
      }
      return payload
    }

    async function uploadBinary(file, relative, rag) {
      const response = await fetch(`${API}/upload?path=${encodeURIComponent(relative)}&overwrite=false&rag=${rag ? 'true' : 'false'}`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      })
      let payload
      try {
        payload = await response.json()
      } catch {
        throw new Error(`Server returned HTTP ${response.status}`)
      }
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `Upload failed (HTTP ${response.status})`)
      }
      return payload
    }

    function FileGlyph() {
      return h('svg', {
        viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, focusable: 'false',
      }, h('path', { d: 'M6 3h8l4 4v14H6z' }), h('path', { d: 'M14 3v5h5' }))
    }

    function KnowledgeBaseIcon(props) {
      const size = typeof props?.size === 'number' ? props.size : 22
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, focusable: 'false',
      },
        h('path', { d: 'M4.5 5.5A2.5 2.5 0 0 1 7 3h12v15H7a2.5 2.5 0 0 0 0 5h12' }),
        h('path', { d: 'M4.5 20.5A2.5 2.5 0 0 1 7 18h12' }),
        h('path', { d: 'M8 7.5h7M8 10.5h5' }),
      )
    }

    function isMarkdownPath(relativePath) {
      return /\.(md|markdown|mdx)$/i.test(relativePath)
    }

    function safeLink(raw) {
      const href = raw.trim()
      return /^(https?:\/\/|mailto:|\/|#)/i.test(href) ? href : null
    }

    function inlineMarkdown(text, keyPrefix) {
      const nodes = []
      const pattern = /(`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\)|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_)/g
      let last = 0
      let index = 0
      let match
      while ((match = pattern.exec(text)) !== null) {
        if (match.index > last) nodes.push(text.slice(last, match.index))
        const token = match[0]
        const key = `${keyPrefix}-${index++}`
        if (token.startsWith('`')) {
          nodes.push(h('code', { key }, token.slice(1, -1)))
        } else if (token.startsWith('[')) {
          const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)
          const href = link === null ? null : safeLink(link[2])
          if (link !== null && href !== null) {
            nodes.push(h('a', {
              key,
              href,
              target: href.startsWith('#') || href.startsWith('/') ? undefined : '_blank',
              rel: 'noreferrer',
            }, link[1]))
          } else {
            nodes.push(token)
          }
        } else if (token.startsWith('**') || token.startsWith('__')) {
          nodes.push(h('strong', { key }, token.slice(2, -2)))
        } else {
          nodes.push(h('em', { key }, token.slice(1, -1)))
        }
        last = pattern.lastIndex
      }
      if (last < text.length) nodes.push(text.slice(last))
      return nodes
    }

    function renderMarkdown(source) {
      const lines = source.replace(/\r\n?/g, '\n').split('\n')
      const blocks = []
      let index = 0
      let key = 0
      const blockStart = (line) => /^(#{1,6}\s|```|>\s?|\s*[-*+]\s+|\s*\d+[.)]\s+|(?:---|\*\*\*|___)\s*$)/.test(line)
      while (index < lines.length) {
        const line = lines[index]
        if (/^\s*$/.test(line)) {
          index += 1
          continue
        }
        const fence = /^\s*```[^\s`]*\s*$/.test(line)
        if (fence) {
          const code = []
          index += 1
          while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
            code.push(lines[index])
            index += 1
          }
          if (index < lines.length) index += 1
          blocks.push(h('pre', { key: `b${key++}` }, h('code', null, code.join('\n'))))
          continue
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line)
        if (heading !== null) {
          blocks.push(h(`h${heading[1].length}`, { key: `b${key++}` }, ...inlineMarkdown(heading[2], `h${key}`)))
          index += 1
          continue
        }
        if (/^(?:---|\*\*\*|___)\s*$/.test(line)) {
          blocks.push(h('hr', { key: `b${key++}` }))
          index += 1
          continue
        }
        if (/^>\s?/.test(line)) {
          const quote = []
          while (index < lines.length && /^>\s?/.test(lines[index])) {
            quote.push(lines[index].replace(/^>\s?/, ''))
            index += 1
          }
          blocks.push(h('blockquote', { key: `b${key++}` }, h('p', null, ...inlineMarkdown(quote.join(' '), `q${key}`))))
          continue
        }
        const unordered = /^\s*[-*+]\s+(.*)$/.exec(line)
        const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
        if (unordered !== null || ordered !== null) {
          const matcher = unordered !== null ? /^\s*[-*+]\s+(.*)$/ : /^\s*\d+[.)]\s+(.*)$/
          const items = []
          while (index < lines.length) {
            const item = matcher.exec(lines[index])
            if (item === null) break
            items.push(h('li', { key: `li${key++}` }, ...inlineMarkdown(item[1], `li${key}`)))
            index += 1
          }
          blocks.push(h(unordered !== null ? 'ul' : 'ol', { key: `b${key++}` }, items))
          continue
        }
        const paragraph = []
        while (index < lines.length && !/^\s*$/.test(lines[index]) && !blockStart(lines[index])) {
          paragraph.push(lines[index].trim())
          index += 1
        }
        if (paragraph.length === 0) {
          paragraph.push(line.trim())
          index += 1
        }
        blocks.push(h('p', { key: `b${key++}` }, ...inlineMarkdown(paragraph.join(' '), `p${key}`)))
      }
      return blocks
    }

    function renderPdfText(text) {
      return text.split(/(?=## 第 \d+ 页)/).map((section, index) => {
        const heading = /^## 第 (\d+) 页\n*/.exec(section)
        if (heading === null) return h('pre', { key: index }, section)
        return h('section', { key: index, className: 'kb-pdf-page' },
          h('h3', { className: 'kb-pdf-page-title' }, `第 ${heading[1]} 页`),
          h('pre', { className: 'kb-pdf-page-text' }, section.slice(heading[0].length)),
        )
      })
    }


    let boundTranslate = (key) => key
    let localeService = null
    let pickDirectoryService = null

    function KnowledgeBasePage() {
      const [, setLocaleVersion] = useState(0)
      const [snapshot, setSnapshot] = useState(null)
      const [loadError, setLoadError] = useState('')
      const [loading, setLoading] = useState(true)
      const [filter, setFilter] = useState('')
      const [selectedPath, setSelectedPath] = useState('')
      const [preview, setPreview] = useState(null)
      const [previewMode, setPreviewMode] = useState('text')
      const [previewLoading, setPreviewLoading] = useState(false)
      const [previewError, setPreviewError] = useState('')
      const [addOpen, setAddOpen] = useState(false)
      const [draftPath, setDraftPath] = useState('')
      const [draftContent, setDraftContent] = useState('')
      const [overwrite, setOverwrite] = useState(false)
      const [formError, setFormError] = useState('')
      const [busy, setBusy] = useState(false)
      const [ragDefault, setRagDefault] = useState(() => {
        try {
          return window.localStorage.getItem('local-knowledge-base:rag') !== 'false'
        } catch {
          return true
        }
      })
      const [notice, setNotice] = useState('')
      const [confirmPath, setConfirmPath] = useState('')
      const [dirOpen, setDirOpen] = useState(false)
      const [draftDirectory, setDraftDirectory] = useState('')
      const [dirError, setDirError] = useState('')
      const [dirBusy, setDirBusy] = useState(false)
      const [dragActive, setDragActive] = useState(false)
      const [dropBusy, setDropBusy] = useState(false)
      const [dropError, setDropError] = useState('')
      const selectedRef = useRef('')
      const confirmTimer = useRef(0)
      const uploadRef = useRef(null)

      const t = (key, params) => {
        let text = boundTranslate(key)
        if (params) {
          for (const [name, value] of Object.entries(params)) {
            text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value))
          }
        }
        return text
      }

      useEffect(() => localeService === null ? undefined : localeService.subscribe(() => setLocaleVersion((value) => value + 1)), [])

      useEffect(() => () => {
        if (confirmTimer.current !== 0) clearTimeout(confirmTimer.current)
      }, [])

      useEffect(() => {
        try {
          window.localStorage.setItem('local-knowledge-base:rag', ragDefault ? 'true' : 'false')
        } catch {
          // A private window may refuse storage; the default still applies this session.
        }
      }, [ragDefault])

      const loadState = useCallback(async (quiet) => {
        if (!quiet) setLoading(true)
        try {
          const data = await request('/state')
          setSnapshot(data)
          setLoadError('')
          if (selectedRef.current !== '' && !data.files.some((file) => file.path === selectedRef.current)) {
            selectedRef.current = ''
            setSelectedPath('')
            setPreview(null)
          }
        } catch (error) {
          setLoadError(error.message)
          if (!quiet) setSnapshot(null)
        } finally {
          if (!quiet) setLoading(false)
        }
      }, [])

      useEffect(() => {
        let alive = true
        let timer = 0
        let first = true
        const tick = async () => {
          if (!alive) return
          if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
            await loadState(!first)
          }
          first = false
          if (alive) timer = setTimeout(tick, 5000)
        }
        void tick()
        return () => {
          alive = false
          if (timer !== 0) clearTimeout(timer)
        }
      }, [loadState])

      const selectFile = useCallback(async (file, requestedMode) => {
        if (!file) return
        const mode = requestedMode || (file.kind === 'pdf' ? 'raw' : isMarkdownPath(file.path) ? 'rendered' : 'text')
        selectedRef.current = file.path
        setSelectedPath(file.path)
        setPreviewMode(mode)
        setPreview(null)
        setPreviewError('')
        if (file.kind === 'pdf' && mode === 'raw') {
          setPreview({ kind: 'pdf', url: `${API}/raw?path=${encodeURIComponent(file.path)}` })
          setPreviewLoading(false)
          return
        }
        setPreviewLoading(true)
        try {
          const data = await request(`/file?path=${encodeURIComponent(file.path)}`)
          if (selectedRef.current === file.path) setPreview({ ...data, kind: 'text' })
        } catch (error) {
          if (selectedRef.current === file.path) setPreviewError(error.message)
        } finally {
          if (selectedRef.current === file.path) setPreviewLoading(false)
        }
      }, [])

      const files = snapshot?.files ?? []
      const filtered = useMemo(() => {
        const query = filter.trim().toLowerCase()
        if (query === '') return files
        return files.filter((file) => file.path.toLowerCase().includes(query))
      }, [files, filter])
      const selectedFile = files.find((file) => file.path === selectedPath)
      const stats = snapshot?.stats

      const resetForm = useCallback(() => {
        setDraftPath('')
        setDraftContent('')
        setOverwrite(false)
        setFormError('')
        if (uploadRef.current) uploadRef.current.value = ''
      }, [])

      const closeForm = useCallback(() => {
        setAddOpen(false)
        resetForm()
      }, [resetForm])

      const chooseLocal = useCallback(async (event) => {
        const file = event.target.files?.[0]
        if (!file) return
        if (file.name.toLowerCase().endsWith('.pdf') || file.size > INLINE_TEXT_LIMIT) {
          if (file.size > MAX_UPLOAD_BYTES) {
            setFormError(t('fileTooLarge'))
            return
          }
          setBusy(true)
          setFormError('')
          try {
            await uploadBinary(file, file.name, ragDefault)
            setAddOpen(false)
            resetForm()
            setNotice(t('dropped', { count: 1 }))
            await loadState(true)
          } catch (error) {
            setFormError(error.message)
          } finally {
            setBusy(false)
          }
          return
        }
        try {
          const text = await file.text()
          setDraftPath(file.name)
          setDraftContent(text)
          setFormError('')
        } catch (error) {
          setFormError(error.message)
        }
      }, [loadState, resetForm, ragDefault])

      const saveDraft = useCallback(async () => {
        const relative = draftPath.trim()
        if (relative === '') {
          setFormError(t('pathRequired'))
          return
        }
        setBusy(true)
        setFormError('')
        setDropError('')
        try {
          const result = await request('/files', {
            method: 'POST',
            body: JSON.stringify({ path: relative, content: draftContent, overwrite, rag: ragDefault }),
          })
          const createdPath = result?.file?.path || relative
          closeForm()
          setNotice(t('saved', { path: createdPath }))
          const data = await request('/state')
          setSnapshot(data)
          const created = data.files.find((file) => file.path === createdPath)
          if (created) await selectFile(created)
        } catch (error) {
          setFormError(error.message)
        } finally {
          setBusy(false)
        }
      }, [draftPath, draftContent, overwrite, closeForm, selectFile, ragDefault])

      const deleteSelected = useCallback(async (file) => {
        if (confirmPath !== file.path) {
          setConfirmPath(file.path)
          if (confirmTimer.current !== 0) clearTimeout(confirmTimer.current)
          confirmTimer.current = setTimeout(() => setConfirmPath(''), 4000)
          return
        }
        if (confirmTimer.current !== 0) clearTimeout(confirmTimer.current)
        setConfirmPath('')
        setBusy(true)
        try {
          await request('/delete', {
            method: 'POST',
            body: JSON.stringify({ path: file.path }),
          })
          setNotice(t('deleted', { path: file.path }))
          if (selectedRef.current === file.path) {
            selectedRef.current = ''
            setSelectedPath('')
            setPreview(null)
          }
          const data = await request('/state')
          setSnapshot(data)
        } catch (error) {
          setLoadError(error.message)
        } finally {
          setBusy(false)
        }
      }, [confirmPath])

      const toggleRag = useCallback(async (file) => {
        setBusy(true)
        try {
          await request('/rag', {
            method: 'POST',
            body: JSON.stringify({ path: file.path, rag: !file.rag }),
          })
          await loadState(true)
          setNotice(t(file.rag ? 'ragDisabled' : 'ragEnabled', { path: file.path }))
        } catch (error) {
          setLoadError(error.message)
        } finally {
          setBusy(false)
        }
      }, [loadState])

      const copyDirectory = useCallback(async () => {
        if (!snapshot?.directory) return
        try {
          await navigator.clipboard.writeText(snapshot.directory)
          setNotice(t('copied'))
        } catch {
          // Clipboard access can be denied; the path stays selectable.
        }
      }, [snapshot])

      const openDirectoryEditor = useCallback(() => {
        setDraftDirectory(snapshot?.directory ?? '')
        setDirError('')
        setDirOpen(true)
      }, [snapshot])

      const browseDirectory = useCallback(async () => {
        if (pickDirectoryService === null) {
          setDirError(t('pickerUnavailable'))
          return
        }
        try {
          const picked = await pickDirectoryService()
          if (typeof picked === 'string' && picked !== '') {
            setDraftDirectory(picked)
            setDirError('')
          }
        } catch (error) {
          setDirError(error.message)
        }
      }, [])

      const saveDirectory = useCallback(async () => {
        const next = draftDirectory.trim()
        if (next === '') {
          setDirError(t('directoryRequired'))
          return
        }
        setDirBusy(true)
        setDirError('')
        try {
          const data = await request('/directory', {
            method: 'POST',
            body: JSON.stringify({ directory: next }),
          })
          setSnapshot(data)
          setDirOpen(false)
          setFilter('')
          setNotice(t('directoryChanged', { path: data.directory }))
          selectedRef.current = ''
          setSelectedPath('')
          setPreview(null)
          setPreviewError('')
        } catch (error) {
          setDirError(error.message)
        } finally {
          setDirBusy(false)
        }
      }, [draftDirectory])

      const isFileDrag = (event) => Array.from(event.dataTransfer?.types ?? []).includes('Files')

      const onDragEnter = (event) => {
        if (!isFileDrag(event)) return
        event.preventDefault()
        setDragActive(true)
      }

      const onDragOver = (event) => {
        if (!isFileDrag(event)) return
        event.preventDefault()
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
        setDragActive(true)
      }

      const onDragLeave = (event) => {
        const next = event.relatedTarget
        try {
          if (next && event.currentTarget.contains(next)) return
        } catch {
          // A non-Node related target means the pointer left the document.
        }
        setDragActive(false)
      }

      const onDrop = async (event) => {
        const dropped = Array.from(event.dataTransfer?.files ?? [])
        if (!isFileDrag(event) && dropped.length === 0) return
        event.preventDefault()
        if (dropBusy) return
        setDragActive(false)
        if (dropped.length === 0) {
          setDropError(t('dropNoFiles'))
          return
        }
        setDropBusy(true)
        setDropError('')
        setNotice('')
        let imported = 0
        const failures = []
        try {
          for (const file of dropped) {
            const relative = (file.webkitRelativePath || file.name).replace(/\\/g, '/')
            if (file.size > MAX_UPLOAD_BYTES) {
              failures.push(t('dropTooLarge', { name: relative }))
              continue
            }
            try {
              if (file.name.toLowerCase().endsWith('.pdf') || file.size > INLINE_TEXT_LIMIT) {
                await uploadBinary(file, relative, ragDefault)
              } else {
                const content = await file.text()
                await request('/files', {
                  method: 'POST',
                  body: JSON.stringify({ path: relative, content, overwrite: false, rag: ragDefault }),
                })
              }
              imported += 1
            } catch (error) {
              failures.push(`${relative}: ${error.message}`)
            }
          }
          await loadState(true)
          if (imported > 0) {
            setNotice(t('dropped', { count: imported }))
          }
          if (failures.length > 0) {
            setDropError(`${t('dropFailed')}: ${failures.slice(0, 6).join('; ')}${failures.length > 6 ? '…' : ''}`)
          }
        } finally {
          setDropBusy(false)
        }
      }

      const header = h('header', { className: 'kb-head' },
        h('div', null,
          h('div', { className: 'kb-eyebrow' }, t('eyebrow')),
          h('h1', { className: 'kb-title' }, t('title')),
          h('p', { className: 'kb-subtitle' }, t('subtitle')),
        ),
        h('div', { className: 'kb-head-actions' },
          h('button', {
            type: 'button', className: 'kb-btn', disabled: busy,
            onClick: () => void loadState(false),
          }, t('refresh')),
          h('button', {
            type: 'button', className: 'kb-btn kb-btn-primary',
            onClick: () => { setAddOpen((value) => !value); setNotice(''); setDropError('') },
          }, t('add')),
        ),
      )

      const pathRow = h('div', { className: 'kb-path' },
        h('span', null, t('pathLabel')),
        h('code', null, snapshot?.directory ?? '…'),
        h('button', {
          type: 'button', className: 'kb-btn kb-btn-icon', disabled: !snapshot?.directory,
          title: t('copyPath'), 'aria-label': t('copyPath'),
          onClick: () => void copyDirectory(),
        }, h('svg', {
          viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none',
          stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
          'aria-hidden': true,
        }, h('rect', { x: 8, y: 8, width: 11, height: 11, rx: 2 }), h('path', { d: 'M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3' }))),
        snapshot?.canChangeDirectory
          ? h('button', {
            type: 'button', className: 'kb-btn', disabled: dirBusy,
            onClick: openDirectoryEditor,
          }, t('changeDirectory'))
          : null,
      )

      const sourceNameKey = { config: 'sourceConfig', env: 'sourceEnv', settings: 'sourceSettings' }[snapshot?.directorySource] || 'sourceDefault'

      const statsRow = stats ? h('div', { className: 'kb-meta' },
        h('span', { className: 'kb-chip' }, t('files', { count: stats.files })),
        h('span', { className: 'kb-chip' }, t('searchable', { count: stats.searchable })),
        h('span', { className: 'kb-chip' }, t('ragCount', { count: stats.rag ?? 0 })),
        h('span', { className: 'kb-chip' }, t('totalSize', { size: formatBytes(stats.bytes) })),
        h('span', { className: 'kb-chip', title: snapshot?.canChangeDirectory ? '' : t('fixedDirectory') }, t('sourceLabel', { source: t(sourceNameKey) })),
      ) : null

      const directoryForm = dirOpen ? h('section', { className: 'kb-dir-form' },
        h('h2', { className: 'kb-form-title' }, t('directoryTitle')),
        h('div', { className: 'kb-dir-row' },
          h('input', {
            className: 'kb-input', value: draftDirectory,
            placeholder: t('directoryPlaceholder'),
            onChange: (event) => setDraftDirectory(event.target.value),
            onKeyDown: (event) => { if (event.key === 'Enter') void saveDirectory() },
          }),
          h('button', {
            type: 'button', className: 'kb-btn', disabled: dirBusy,
            onClick: () => void browseDirectory(),
          }, t('browse')),
        ),
        h('div', { className: 'kb-hint' }, t('directoryHint')),
        dirError !== '' ? h('div', { className: 'kb-error' }, dirError) : null,
        h('div', { className: 'kb-form-row', style: { marginTop: 12 } },
          h('span', { className: 'kb-hint' }, ''),
          h('div', { className: 'kb-inline' },
            h('button', {
              type: 'button', className: 'kb-btn', disabled: dirBusy,
              onClick: () => { setDirOpen(false); setDirError('') },
            }, t('cancel')),
            h('button', {
              type: 'button', className: 'kb-btn kb-btn-primary', disabled: dirBusy,
              onClick: () => void saveDirectory(),
            }, t('save')),
          ),
        ),
      ) : null

      const form = addOpen ? h('section', { className: 'kb-form' },
        h('h2', { className: 'kb-form-title' }, t('addTitle')),
        h('label', { className: 'kb-field' },
          h('span', { className: 'kb-label' }, t('fileName')),
          h('input', {
            className: 'kb-input', value: draftPath,
            placeholder: t('fileNameHint'),
            onChange: (event) => setDraftPath(event.target.value),
          }),
        ),
        h('div', { className: 'kb-field' },
          h('label', { className: 'kb-file-pick' },
            h('input', {
              ref: uploadRef, type: 'file',
              accept: '.pdf,.md,.markdown,.mdx,.txt,.json,.csv,.yaml,.yml,.html,.htm,.xml,.log,.js,.ts,.py,.ps1,.sql',
              onChange: (event) => void chooseLocal(event),
            }),
            h(FileGlyph),
            t('chooseLocal'),
          ),
        ),
        h('label', { className: 'kb-field' },
          h('span', { className: 'kb-label' }, t('content')),
          h('textarea', {
            className: 'kb-textarea', value: draftContent,
            onChange: (event) => setDraftContent(event.target.value),
          }),
        ),
        formError !== '' ? h('div', { className: 'kb-error' }, formError) : null,
        h('div', { className: 'kb-hint' }, t(ragDefault ? 'ragDropOn' : 'ragDropOff')),
        h('div', { className: 'kb-form-row' },
          h('label', { className: 'kb-inline' },
            h('input', {
              type: 'checkbox', checked: overwrite,
              onChange: (event) => setOverwrite(event.target.checked),
            }),
            t('overwrite'),
          ),
          h('div', { className: 'kb-inline' },
            h('button', { type: 'button', className: 'kb-btn', onClick: closeForm }, t('cancel')),
            h('button', {
              type: 'button', className: 'kb-btn kb-btn-primary', disabled: busy,
              onClick: () => void saveDraft(),
            }, t('save')),
          ),
        ),
      ) : null

      const toolbar = h('div', { className: 'kb-toolbar' },
        h('input', {
          className: 'kb-filter', value: filter,
          placeholder: t('searchPlaceholder'),
          onChange: (event) => setFilter(event.target.value),
        }),
        h('label', { className: 'kb-inline kb-rag-default', title: t('ragHint') },
          h('input', {
            type: 'checkbox', checked: ragDefault,
            onChange: (event) => setRagDefault(event.target.checked),
          }),
          t('ragDefault'),
        ),
        h('button', {
          type: 'button', className: 'kb-btn', disabled: busy,
          onClick: () => { setNotice(''); void loadState(false) },
        }, t('refresh')),
      )

      let list
      if (loading && snapshot === null) {
        list = h('div', { className: 'kb-list', 'aria-label': t('loading') },
          h('div', { className: 'kb-skeleton' }),
          h('div', { className: 'kb-skeleton' }),
          h('div', { className: 'kb-skeleton' }),
        )
      } else if (filtered.length === 0) {
        list = h('div', { className: 'kb-empty' }, files.length === 0 ? `${t('empty')} ${t('dropEmptyHint')}` : t('emptyFilter'))
      } else {
        list = h('div', { className: 'kb-list' }, filtered.map((file) => h('div', {
          key: file.path,
          className: 'kb-row',
          'data-active': file.path === selectedPath ? 'true' : 'false',
          role: 'button',
          tabIndex: 0,
          onClick: () => void selectFile(file),
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              void selectFile(file)
            }
          },
        },
          h('span', { className: 'kb-file-icon' }, h(FileGlyph)),
          h('div', { className: 'kb-row-main' },
            h('div', { className: 'kb-row-name' }, file.name),
            h('div', { className: 'kb-row-meta' }, `${file.path} · ${formatBytes(file.size)} · ${formatDate(file.modifiedAt)}`),
            file.kind === 'pdf' ? h('span', { className: 'kb-badge kb-badge-pdf' }, 'PDF') : null,
            file.searchable ? null : h('span', { className: 'kb-badge' }, t('notSearchable')),
          ),
          h('div', { className: 'kb-row-actions' },
            file.searchable ? h('button', {
              type: 'button',
              className: 'kb-rag-btn',
              'data-active': file.rag ? 'true' : 'false',
              title: t('ragToggle'),
              disabled: busy,
              onClick: (event) => {
                event.stopPropagation()
                void toggleRag(file)
              },
            }, 'RAG') : null,
            h('button', {
              type: 'button',
              className: 'kb-row-delete',
              'data-confirm': confirmPath === file.path ? 'true' : 'false',
              title: confirmPath === file.path ? t('deleteHint') : t('delete'),
              disabled: busy,
              onClick: (event) => {
                event.stopPropagation()
                void deleteSelected(file)
              },
            }, confirmPath === file.path ? t('confirmDelete') : t('delete')),
          ),
        )))
      }

      let previewPanel
      if (!selectedFile) {
        previewPanel = h('aside', { className: 'kb-preview' },
          h('div', { className: 'kb-preview-head' }, h('div', { className: 'kb-preview-title' }, t('preview'))),
          h('div', { className: 'kb-preview-empty' }, t('selectFile')),
        )
      } else {
        const pdf = selectedFile.kind === 'pdf'
        const markdown = isMarkdownPath(selectedFile.path)
        const modeButton = (mode, labelKey) => h('button', {
          type: 'button',
          className: 'kb-mode-btn',
          'data-active': previewMode === mode ? 'true' : 'false',
          onClick: () => void selectFile(selectedFile, mode),
        }, t(labelKey))
        const range = preview?.kind === 'text'
          ? t('lines', { from: preview.offset, to: preview.offset + preview.content.split('\n').length - 1, total: preview.totalLines })
          : ''
        let previewBody
        if (previewLoading) {
          previewBody = h('div', { className: 'kb-preview-empty' }, t('previewLoading'))
        } else if (previewError !== '') {
          previewBody = h('div', { className: 'kb-error', style: { margin: 14 } }, previewError)
        } else if (preview?.kind === 'pdf') {
          previewBody = h('iframe', {
            className: 'kb-pdf-frame',
            src: preview.url,
            title: selectedFile.path,
          })
        } else if (preview !== null) {
          let content
          if (markdown && previewMode === 'rendered') {
            content = h('div', { className: 'kb-markdown' }, renderMarkdown(preview.content))
          } else if (pdf && previewMode === 'text') {
            content = h('div', { className: 'kb-pdf-text' }, renderPdfText(preview.content))
          } else {
            content = h('pre', null, preview.content)
          }
          previewBody = h('div', null,
            range !== '' ? h('div', { className: 'kb-preview-sub', style: { padding: '10px 14px 0' } }, range) : null,
            content,
            preview.truncated ? h('div', { className: 'kb-preview-sub', style: { padding: '0 14px 12px' } }, t('truncated')) : null,
          )
        } else {
          previewBody = h('div', { className: 'kb-preview-empty' }, t('previewLoading'))
        }
        previewPanel = h('aside', { className: 'kb-preview' },
          h('div', { className: 'kb-preview-head' },
            h('div', null,
              h('div', { className: 'kb-preview-title' }, selectedFile.path),
              h('div', { className: 'kb-preview-sub' }, `${formatBytes(selectedFile.size)} · ${formatDate(selectedFile.modifiedAt)}`),
            ),
            pdf || markdown ? h('div', { className: 'kb-preview-tools' },
              pdf ? modeButton('raw', 'viewOriginal') : null,
              pdf ? modeButton('text', 'viewText') : null,
              markdown ? modeButton('rendered', 'viewRendered') : null,
              markdown ? modeButton('source', 'viewSource') : null,
            ) : null,
          ),
          previewBody,
        )
      }

      const dropOverlay = dragActive || dropBusy ? h('div', { className: 'kb-drop-overlay' },
        h('div', { className: 'kb-drop-card' },
          h('div', { className: 'kb-drop-icon' },
            h('svg', {
              viewBox: '0 0 24 24', width: 26, height: 26, fill: 'none',
              stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
              'aria-hidden': true,
            },
              h('path', { d: 'M12 3v11' }),
              h('path', { d: 'M8 10l4 4 4-4' }),
              h('path', { d: 'M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3' }),
            ),
          ),
          h('div', { className: 'kb-drop-title' }, dropBusy ? t('dropBusy') : t('dropTitle')),
          dropBusy ? null : h('div', { className: 'kb-drop-hint' },
            h('div', null, t('dropHint')),
            h('div', { style: { marginTop: 6 } }, t(ragDefault ? 'ragDropOn' : 'ragDropOff')),
          ),
        ),
      ) : null

      return h('div', {
        className: 'kb-page',
        'data-dragging': dragActive ? 'true' : 'false',
        onDragEnter,
        onDragOver,
        onDragLeave,
        onDrop,
      },
        header,
        pathRow,
        directoryForm,
        statsRow,
        loadError !== '' ? h('div', { className: 'kb-error' }, `${t('error')}: ${loadError}`) : null,
        dropError !== '' ? h('div', { className: 'kb-error' }, dropError) : null,
        notice !== '' ? h('div', { className: 'kb-notice' }, notice) : null,
        form,
        toolbar,
        h('div', { className: 'kb-body' },
          list,
          previewPanel,
        ),
        dropOverlay,
      )
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'knowledge-base: dictionaries')
      boundTranslate = ctx.locale.bind(NS)
      localeService = ctx.locale
      const workspaceUi = ctx.get('uiWorkspace')
      if (workspaceUi && typeof workspaceUi.pickDirectory === 'function') {
        pickDirectoryService = () => workspaceUi.pickDirectory()
      }
      ensureStyles(ctx)

      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: 'knowledge-base',
      }, KnowledgeBasePage))

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: 'knowledge-base',
        order: 20,
        label: () => boundTranslate('nav'),
        locale: NS,
      }, KnowledgeBaseIcon))
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    }
  },
})
