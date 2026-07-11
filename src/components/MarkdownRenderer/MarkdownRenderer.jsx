/**
 * 统一 Markdown 渲染组件
 *
 * 负责：
 * - 将 Markdown 文本渲染为格式化 HTML
 * - 支持 GFM（表格、删除线、任务列表、自动链接）
 * - 代码块语法高亮（highlight.js）
 * - 全应用统一的 Markdown 展示样式
 *
 * 使用方式：
 * ```jsx
 * import MarkdownRenderer from '../components/MarkdownRenderer/MarkdownRenderer'
 * <MarkdownRenderer content={markdownText} />
 * ```
 *
 * @module components/MarkdownRenderer
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import './MarkdownRenderer.css'

const remarkPlugins = [remarkGfm]
const rehypePlugins = [rehypeHighlight]

/** 允许转交系统浏览器的链接协议（与主进程 navigationGuardService 白名单一致） */
const EXTERNAL_LINK_PATTERN = /^(https?:|mailto:)/i

/**
 * Markdown 链接组件：一律阻止窗口内导航，安全外链走 open-external-link IPC 转系统浏览器
 * 锚点 / 相对链接静默不动作（渲染的是外部内容，窗口不跟随任何链接）
 * @param {Object} props
 * @param {string} [props.href] - 链接地址
 * @param {import('react').ReactNode} props.children - 链接文本
 * @returns {JSX.Element}
 */
function MarkdownLink({ href, children }) {
  const handleClick = (event) => {
    event.preventDefault()
    if (href && EXTERNAL_LINK_PATTERN.test(href)) {
      // 可选链兜底非 Electron 环境（如组件测试的 jsdom）
      window.electronAPI?.openExternalLink?.(href)
    }
  }
  return (
    <a href={href} onClick={handleClick}>
      {children}
    </a>
  )
}

const markdownComponents = { a: MarkdownLink }

/**
 * 统一 Markdown 渲染器
 * @param {Object} props
 * @param {string} props.content - Markdown 文本内容
 * @param {string} [props.className] - 额外的 CSS 类名
 * @returns {JSX.Element}
 */
export default function MarkdownRenderer({ content, className = '' }) {
  if (!content) return null

  return (
    <div className={`md-renderer${className ? ` ${className}` : ''}`}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
