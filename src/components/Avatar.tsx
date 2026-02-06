import { useState, useEffect } from 'react';

interface AvatarProps {
  name: string | null | undefined;
  size?: number;
  className?: string;
}

/**
 * 获取用户名首字母
 * 例如："wangph" -> "WP", "John Doe" -> "JD"
 */
function getInitials(name: string): string {
  if (!name || name.length === 0) return '?';
  
  const parts = name.split(/[\s._]+/);
  if (parts.length === 1) {
    return name.substring(0, Math.min(2, name.length)).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * 头像组件
 * 
 * 显示逻辑：
 * 1. 如果 settings 中有自定义头像 -> 显示 <img>
 * 2. 否则 -> 显示首字母 div（灰色背景）
 * 
 * 注意：不使用 assignee.avatarUrl 避免 403/404 错误
 */
export function Avatar({ name, size = 24, className = '' }: AvatarProps) {
  const [customAvatar, setCustomAvatar] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);


  useEffect(() => {
    loadAvatar();
  }, [name]);

  const loadAvatar = async () => {
    setIsLoading(true);

    
    try {
      if (!name) {
        console.log('[Avatar] No name provided, showing initials');
        setCustomAvatar(null);
        setIsLoading(false);
        return;
      }

      const key = `avatar_${name}`;
      console.log('[Avatar] Looking for avatar with key:', key);
      
      // 尝试从 settings 获取自定义头像
      const result = await window.electronAPI.database.settings.get(key);
      
      console.log('[Avatar] Settings result:', { success: result.success, hasData: !!result.data });
      
      if (result.success && result.data) {
        let avatarData = result.data;
        console.log('[Avatar] Found avatar data, length:', avatarData.length);
        console.log('[Avatar] Data starts with:', avatarData.substring(0, 30));
        
        // 确保有 data:image 前缀
        if (!avatarData.startsWith('data:image/')) {
          console.log('[Avatar] Adding data:image/png;base64, prefix');
          avatarData = `data:image/png;base64,${avatarData}`;
        }
        
        setCustomAvatar(avatarData);
      } else {
        console.log('[Avatar] No custom avatar found for:', name);
        setCustomAvatar(null);
      }
    } catch (error) {
      console.error('[Avatar] Failed to load avatar:', error);
      setCustomAvatar(null);
    } finally {
      setIsLoading(false);
    }
  };

  // 加载中显示占位
  if (isLoading) {
    return (
      <div 
        className={`animate-pulse rounded-full bg-[#EBECF0] ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  // 有自定义头像 -> 渲染 img
  if (customAvatar) {
    return (
      <img
        src={customAvatar}
        alt={name || 'Unknown'}
        className={`rounded-full object-cover border border-[#DFE1E6] ${className}`}
        style={{ width: size, height: size }}
        title={name || 'Unknown'}
        onError={() => {
          console.error('[Avatar] Image failed to load:', name);
          // 加载失败时显示首字母
          setCustomAvatar(null);
        }}
      />
    );
  }

  // 没有自定义头像 -> 渲染首字母 div（灰色背景）
  const initials = name ? getInitials(name) : '?';
  
  return (
    <div
      className={`flex items-center justify-center rounded-full bg-[#EBECF0] text-[#5E6C84] font-semibold border border-[#DFE1E6] ${className}`}
      style={{ 
        width: size, 
        height: size,
        fontSize: size * 0.4,
      }}
      title={name || 'Unknown'}
    >
      {initials}
    </div>
  );
}

export default Avatar;
