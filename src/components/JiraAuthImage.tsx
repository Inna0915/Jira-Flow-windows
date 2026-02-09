import { useState, useEffect } from 'react';
import { Loader2, ImageOff, X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface JiraAuthImageProps {
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  width?: string | number;
  height?: string | number;
}

/**
 * Jira 认证图片组件
 * 
 * 自动通过 Electron IPC 获取带认证的图片，
 * 处理相对路径和绝对路径，转换为 Base64 显示
 * 点击可放大查看
 */
export function JiraAuthImage({
  src,
  alt = '',
  className = '',
  style = {},
  width,
  height,
}: JiraAuthImageProps) {
  const [imgData, setImgData] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function fetchImage() {
      if (!src) {
        setError(true);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(false);

        const result = await window.electronAPI.jira.getAttachment(src);

        if (!isMounted) return;

        if (result.success) {
          const dataUrl = `data:${result.mimeType};base64,${result.base64}`;
          setImgData(dataUrl);
        } else {
          console.error('[JiraAuthImage] Failed to fetch image:', result.error);
          setError(true);
        }
      } catch (err) {
        if (!isMounted) return;
        console.error('[JiraAuthImage] Error fetching image:', err);
        setError(true);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchImage();

    return () => {
      isMounted = false;
    };
  }, [src]);

  // 合并样式
  const mergedStyle: React.CSSProperties = {
    ...style,
    width: width || style.width,
    height: height || style.height,
    maxWidth: '100%',
  };

  // 加载中显示骨架屏 (使用 span 避免在 p 标签内嵌套 div)
  if (loading) {
    return (
      <span
        className={`inline-flex items-center justify-center bg-gray-100 rounded ${className}`}
        style={mergedStyle}
      >
        <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
      </span>
    );
  }

  // 错误状态 (使用 span 避免在 p 标签内嵌套 div)
  if (error || !imgData) {
    return (
      <span
        className={`inline-flex flex-col items-center justify-center bg-gray-50 border border-dashed border-gray-300 rounded p-2 ${className}`}
        style={mergedStyle}
        title={alt || 'Failed to load image'}
      >
        <ImageOff className="w-5 h-5 text-gray-400 mb-1" />
        <span className="text-[10px] text-gray-400">Failed to load</span>
      </span>
    );
  }

  // 正常显示图片 - 单击打开大图
  return (
    <>
      <img
        src={imgData}
        alt={alt}
        className={`max-w-full h-auto cursor-zoom-in hover:opacity-90 transition-opacity ${className}`}
        style={mergedStyle}
        loading="lazy"
        onClick={() => setIsOpen(true)}
      />
      
      {/* 全屏查看模态框 */}
      {isOpen && createPortal(
        <div 
          className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center"
          onClick={() => setIsOpen(false)}
        >
          {/* 关闭按钮 */}
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
            onClick={() => setIsOpen(false)}
          >
            <X className="w-6 h-6" />
          </button>
          
          {/* 大图 */}
          <img
            src={imgData}
            alt={alt}
            className="max-w-[95vw] max-h-[95vh] object-contain cursor-zoom-out"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          />
          
          {/* 提示文字 */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
            点击图片或背景关闭
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export default JiraAuthImage;
