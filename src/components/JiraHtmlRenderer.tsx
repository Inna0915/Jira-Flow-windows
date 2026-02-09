import parse, { Element, HTMLReactParserOptions } from 'html-react-parser';
import { JiraAuthImage } from './JiraAuthImage';

interface JiraHtmlRendererProps {
  html: string;
  className?: string;
}

/**
 * Jira HTML 渲染器
 * 
 * 安全渲染 Jira 返回的 HTML 描述内容，自动处理：
 * - 拦截 <img> 标签，使用 JiraAuthImage 进行认证加载
 * - 应用 Tailwind Typography 样式美化内容
 */
export function JiraHtmlRenderer({ html, className = '' }: JiraHtmlRendererProps) {
  if (!html) {
    return (
      <div className={`text-gray-400 text-sm italic ${className}`}>
        No description
      </div>
    );
  }

  const options: HTMLReactParserOptions = {
    replace: (domNode) => {
      // 拦截 img 标签，使用认证图片组件
      if (domNode instanceof Element && domNode.name === 'img') {
        const { src, alt, width, height, style, class: className } = domNode.attribs;
        
        // 解析内联样式
        const parsedStyle: React.CSSProperties = {};
        if (style) {
          style.split(';').forEach((rule) => {
            const [key, value] = rule.split(':').map(s => s.trim());
            if (key && value) {
              // 将 CSS 属性名转换为 camelCase
              const camelKey = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
              (parsedStyle as any)[camelKey] = value;
            }
          });
        }

        return (
          <JiraAuthImage
            src={src || ''}
            alt={alt || ''}
            width={width}
            height={height}
            style={parsedStyle}
            className={className}
          />
        );
      }

      // 拦截 a 标签，添加安全属性
      if (domNode instanceof Element && domNode.name === 'a') {
        const { href, title } = domNode.attribs;
        
        return (
          <a
            href={href}
            title={title}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 hover:underline"
            onClick={(e) => {
              // 如果是相对链接，阻止默认行为
              if (href && href.startsWith('/')) {
                e.preventDefault();
                // 可以选择在系统浏览器中打开
                if (window.electronAPI?.system?.openExternal) {
                  const jiraHost = ''; // 可以从配置中获取
                  window.electronAPI.system.openExternal(`${jiraHost}${href}`);
                }
              }
            }}
          >
            {domNode.children && parse(domNode.children as any)}
          </a>
        );
      }

      // 拦截 table 标签，添加响应式样式
      if (domNode instanceof Element && domNode.name === 'table') {
        return (
          <div className="overflow-x-auto my-4">
            <table className="min-w-full border-collapse border border-gray-300 text-sm">
              {domNode.children && parse(domNode.children as any)}
            </table>
          </div>
        );
      }

      // 拦截 td/th 标签，添加边框样式
      if (domNode instanceof Element && (domNode.name === 'td' || domNode.name === 'th')) {
        const Tag = domNode.name as 'td' | 'th';
        return (
          <Tag
            className={`border border-gray-300 px-3 py-2 ${
              domNode.name === 'th' ? 'bg-gray-50 font-semibold' : ''
            }`}
          >
            {domNode.children && parse(domNode.children as any)}
          </Tag>
        );
      }
    },
  };

  return (
    <div
      className={`text-sm text-[#172B4D] ${className}`}
    >
      {parse(html, options)}
    </div>
  );
}

export default JiraHtmlRenderer;
