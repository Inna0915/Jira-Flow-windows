import fs from 'fs/promises';
import path from 'path';

/**
 * 任务数据结构（简化版）
 */
export interface ObsidianTask {
  key: string;
  summary: string;
  status: string;
  issuetype?: string | null;
  description?: string;
  dueDate?: string | null;
}

/**
 * Obsidian 集成服务
 * 
 * 功能：
 * 1. 将 Jira 任务同步为本地 Markdown 文件
 * 2. 支持 YAML Frontmatter
 * 3. 文件存在时只更新状态字段
 */
export class ObsidianService {
  private vaultPath: string;
  private jiraHost: string;

  constructor(vaultPath: string, jiraHost: string) {
    this.vaultPath = vaultPath;
    this.jiraHost = jiraHost;
  }

  /**
   * 同步任务到 Obsidian
   * @param task 任务数据
   * @returns 同步结果
   */
  public async syncTask(task: ObsidianTask): Promise<{
    success: boolean;
    isNew: boolean;
    filePath: string;
    message?: string;
  }> {
    try {
      // 1. 生成文件名
      const filename = this.generateFilename(task);
      const filePath = path.join(this.vaultPath, filename);

      // 2. 检查文件是否存在
      const exists = await this.fileExists(filePath);

      if (exists) {
        // 3A. 更新现有文件（只修改 status 字段）
        await this.updateExistingFile(filePath, task);
        return {
          success: true,
          isNew: false,
          filePath,
        };
      } else {
        // 3B. 创建新文件
        await this.createNewFile(filePath, task);
        return {
          success: true,
          isNew: true,
          filePath,
        };
      }
    } catch (error) {
      console.error('[ObsidianService] Failed to sync task:', error);
      return {
        success: false,
        isNew: false,
        filePath: '',
        message: String(error),
      };
    }
  }

  /**
   * 生成安全的文件名
   * 格式: [PROJ-123] Task Summary.md
   */
  private generateFilename(task: ObsidianTask): string {
    // 清理摘要中的非法字符
    const sanitizedSummary = this.sanitizeFilename(task.summary);
    return `[${task.key}] ${sanitizedSummary}.md`;
  }

  /**
   * 清理文件名中的非法字符
   * Windows 非法字符: / \ : * ? " < > |
   */
  private sanitizeFilename(input: string): string {
    // 替换非法字符为空格或空字符串
    return input
      .replace(/[\\/:*?"<>|]/g, ' ') // 替换为空格
      .replace(/\s+/g, ' ')          // 合并多个空格
      .trim()                         // 去除首尾空格
      .substring(0, 100);             // 限制长度
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 创建新文件
   */
  private async createNewFile(filePath: string, task: ObsidianTask): Promise<void> {
    const content = this.generateMarkdownContent(task);
    await fs.writeFile(filePath, content, 'utf-8');
    console.log(`[ObsidianService] Created new file: ${path.basename(filePath)}`);
  }

  /**
   * 更新现有文件（只修改 status 字段）
   */
  private async updateExistingFile(filePath: string, task: ObsidianTask): Promise<void> {
    // 读取现有内容
    const content = await fs.readFile(filePath, 'utf-8');
    
    // 使用正则替换 frontmatter 中的 status 字段
    const updatedContent = this.replaceStatusInFrontmatter(content, task.status);
    
    await fs.writeFile(filePath, updatedContent, 'utf-8');
    console.log(`[ObsidianService] Updated existing file: ${path.basename(filePath)}`);
  }

  /**
   * 生成 Markdown 内容（新文件）
   */
  private generateMarkdownContent(task: ObsidianTask): string {
    const jiraLink = `${this.jiraHost}/browse/${task.key}`;
    const today = new Date().toISOString().split('T')[0];
    
    // YAML Frontmatter
    const frontmatter = `---
key: ${task.key}
type: ${task.issuetype || 'Task'}
status: ${task.status}
link: ${jiraLink}
created: ${today}
---

`;

    // 正文
    const body = `# ${task.summary}

${task.description || ''}

## Links

- [Jira Issue](${jiraLink})
`;

    return frontmatter + body;
  }

  /**
   * 替换 frontmatter 中的 status 字段
   * 只修改 `status: ...` 这一行，不影响其他内容
   */
  private replaceStatusInFrontmatter(content: string, newStatus: string): string {
    // 匹配 frontmatter 中的 status 行
    // 正则: 匹配以 status: 开头的行（支持各种格式：status: value, status:"value", status: 'value'）
    const statusRegex = /^(status:\s*).+$/m;
    
    if (statusRegex.test(content)) {
      return content.replace(statusRegex, `$1${newStatus}`);
    }
    
    // 如果找不到 status 字段，在第一个 --- 之后添加
    const firstSeparator = content.indexOf('---');
    if (firstSeparator !== -1) {
      const insertPosition = content.indexOf('\n', firstSeparator) + 1;
      return content.slice(0, insertPosition) + `status: ${newStatus}\n` + content.slice(insertPosition);
    }
    
    // 如果没有 frontmatter，在开头添加
    return `---
status: ${newStatus}
---

${content}`;
  }
}

/**
 * 创建 ObsidianService 实例（工厂函数）
 */
export function createObsidianService(vaultPath: string, jiraHost: string): ObsidianService {
  return new ObsidianService(vaultPath, jiraHost);
}
