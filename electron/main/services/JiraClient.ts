import axios, { AxiosInstance, AxiosResponse } from 'axios';
import https from 'https';

/**
 * Jira 客户端配置
 */
export interface JiraClientConfig {
  host: string;      // Jira 服务器地址，如 https://jira.company.com
  username: string;  // 用户名/邮箱
  password: string;  // 密码或 PAT (Personal Access Token)
}

/**
 * Jira 任务数据结构
 */
export interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    status: {
      name: string;
      id: string;
    };
    issuetype?: {
      name: string;
    };
    assignee?: {
      displayName: string;
      avatarUrls?: {
        '48x48': string;
      };
    };
    duedate?: string;
    priority?: {
      name: string;
      id: string;
    };
    updated: string;
    description?: string;
    sprint?: {
      name: string;
    };
    customfield_10016?: {
      name: string;
    };
    parent?: {
      key: string;
    };
    issuelinks?: Array<{
      outwardIssue?: {
        key: string;
        fields: {
          summary: string;
        };
      };
      inwardIssue?: {
        key: string;
        fields: {
          summary: string;
        };
      };
      type: {
        name: string;
      };
    }>;
  };
}

/**
 * Jira 搜索响应
 */
interface JiraSearchResponse {
  expand: string;
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

/**
 * 当前用户信息
 */
export interface JiraUserInfo {
  self: string;
  accountId: string;
  accountType: string;
  displayName: string;
  emailAddress?: string;
  avatarUrls?: Record<string, string>;
}

/**
 * 使用 TextDecoder 手动解码响应数据，修复中文乱码问题
 */
function decodeResponse(data: ArrayBuffer): any {
  const decoder = new TextDecoder('utf-8');
  const jsonStr = decoder.decode(data);
  return JSON.parse(jsonStr);
}

/**
 * Jira API 客户端
 * 使用 Axios 进行 HTTP 请求，支持 Basic Auth 和 SSL 忽略
 * 
 * 修复：强制使用 UTF-8 解码响应，避免中文乱码（Mojibake）
 */
export class JiraClient {
  private client: AxiosInstance;
  private config: JiraClientConfig;

  constructor(config: JiraClientConfig) {
    this.config = config;
    this.client = this.createAxiosClient();
  }

  /**
   * 创建配置好的 Axios 实例
   * 使用 responseType: 'arraybuffer' 并手动 UTF-8 解码，修复中文乱码
   */
  private createAxiosClient(): AxiosInstance {
    const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');

    const client = axios.create({
      baseURL: this.config.host,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false, // 忽略 SSL 证书错误，用于自托管服务器
      }),
      timeout: 30000, // 30 秒超时
      responseType: 'arraybuffer', // 关键修复：获取原始二进制数据
      // 不自动转换响应，我们手动解码
      transformResponse: [
        (data: ArrayBuffer) => {
          if (!data) return data;
          try {
            return decodeResponse(data);
          } catch (e) {
            console.error('[JiraClient] Failed to decode response:', e);
            return data;
          }
        }
      ],
    });

    return client;
  }

  /**
   * 更新配置（当设置改变时）
   */
  public updateConfig(config: JiraClientConfig): void {
    this.config = config;
    this.client = this.createAxiosClient();
  }

  /**
   * 测试连接并获取当前用户信息
   */
  public async testConnection(): Promise<{ success: true; user: JiraUserInfo } | { success: false; error: string }> {
    try {
      const response = await this.client.get('/rest/api/2/myself');
      return {
        success: true,
        user: response.data,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.errorMessages?.[0] 
          || error.response?.data?.message 
          || error.message;
        return { success: false, error: `连接失败: ${message}` };
      }
      return { success: false, error: `未知错误: ${String(error)}` };
    }
  }

  /**
   * 使用 JQL 搜索任务
   * @param jql JQL 查询语句
   * @param maxResults 最大返回数量
   * @param startAt 分页起始位置
   */
  public async searchIssues(
    jql: string, 
    maxResults: number = 100, 
    startAt: number = 0,
    fields: string[] = ['summary', 'status', 'assignee', 'duedate', 'priority', 'updated', 'description', 'issuetype']
  ): Promise<{ success: true; issues: JiraIssue[]; total: number } | { success: false; error: string }> {
    try {
      const response = await this.client.get('/rest/api/2/search', {
        params: {
          jql,
          maxResults,
          startAt,
          fields: fields.join(','),
        },
      });

      return {
        success: true,
        issues: response.data.issues,
        total: response.data.total,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.errorMessages?.[0] 
          || error.response?.data?.message 
          || error.message;
        return { success: false, error: `搜索失败: ${message}` };
      }
      return { success: false, error: `未知错误: ${String(error)}` };
    }
  }

  /**
   * 获取任务的可用状态转换
   */
  public async getTransitions(issueKey: string): Promise<{ success: true; transitions: Array<{ id: string; name: string }> } | { success: false; error: string }> {
    try {
      const response = await this.client.get(`/rest/api/2/issue/${issueKey}/transitions`);
      return {
        success: true,
        transitions: response.data.transitions.map((t: { id: string; name: string }) => ({
          id: t.id,
          name: t.name,
        })),
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.errorMessages?.[0] || error.message;
        return { success: false, error: message };
      }
      return { success: false, error: String(error) };
    }
  }

  /**
   * 执行状态转换
   */
  public async transitionIssue(issueKey: string, transitionId: string): Promise<{ success: true } | { success: false; error: string }> {
    try {
      await this.client.post(`/rest/api/2/issue/${issueKey}/transitions`, {
        transition: { id: transitionId },
      });
      return { success: true };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.errorMessages?.[0] || error.message;
        return { success: false, error: message };
      }
      return { success: false, error: String(error) };
    }
  }

  /**
   * 获取单个任务的详细信息
   */
  public async getIssue(issueKey: string): Promise<{ success: true; issue: JiraIssue } | { success: false; error: string }> {
    try {
      const response = await this.client.get(`/rest/api/2/issue/${issueKey}`);
      return {
        success: true,
        issue: response.data,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.errorMessages?.[0] || error.message;
        return { success: false, error: message };
      }
      return { success: false, error: String(error) };
    }
  }
}
