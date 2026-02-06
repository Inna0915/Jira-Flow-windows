/**
 * GitHub-style Identicon 生成器
 * 基于用户名生成像素化头像
 */

/**
 * 将字符串转换为哈希数字
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为 32bit 整数
  }
  return Math.abs(hash);
}

/**
 * 从哈希生成颜色
 */
function getColorFromHash(hash: number): string {
  const colors = [
    '#e57373', '#f06292', '#ba68c8', '#9575cd', '#7986cb',
    '#64b5f6', '#4fc3f7', '#4dd0e1', '#4db6ac', '#81c784',
    '#aed581', '#dce775', '#fff176', '#ffd54f', '#ffb74d',
    '#ff8a65', '#a1887f', '#90a4ae',
  ];
  return colors[hash % colors.length];
}

/**
 * 生成 5x5 的 Identicon SVG
 */
export function generateIdenticon(name: string, size: number = 40): string {
  const hash = hashString(name || 'Unknown');
  const color = getColorFromHash(hash);
  
  // 生成 5x5 网格图案（对称）
  const cells: boolean[] = [];
  for (let i = 0; i < 15; i++) {
    cells.push(((hash >> i) & 1) === 1);
  }
  
  // 构建 SVG
  const cellSize = size / 5;
  let rects = '';
  
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      // 对称：使用左侧单元格决定右侧
      const sourceCol = col < 3 ? col : 4 - col;
      const index = row * 3 + sourceCol;
      
      if (cells[index]) {
        rects += `<rect x="${col * cellSize}" y="${row * cellSize}" width="${cellSize}" height="${cellSize}" fill="${color}"/>`;
      }
    }
  }
  
  return `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${rects}</svg>`)}`;
}

/**
 * 获取用户头像（自定义或 Identicon）
 */
export async function getUserAvatar(
  assigneeName: string | null | undefined,
  customAvatarStorage: { get: (key: string) => Promise<string | null> }
): Promise<string> {
  if (!assigneeName) {
    return generateIdenticon('Unknown');
  }
  
  // 1. 尝试获取自定义头像
  const customAvatar = await customAvatarStorage.get(`avatar_${assigneeName}`);
  if (customAvatar) {
    return customAvatar;
  }
  
  // 2. 生成 Identicon
  return generateIdenticon(assigneeName);
}
