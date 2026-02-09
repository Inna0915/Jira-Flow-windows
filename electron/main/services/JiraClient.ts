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
 * 处理空响应（如 204 No Content）的情况
 */
function decodeResponse(data: ArrayBuffer): any {
  if (!data || data.byteLength === 0) {
    return null; // 空响应，返回 null
  }
  const decoder = new TextDecoder('utf-8');
  const jsonStr = decoder.decode(data);
  if (!jsonStr || jsonStr.trim() === '') {
    return null; // 空字符串，返回 null
  }
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

  /**
   * 更新 Issue 字段（故事点、截止日期等）
   * @param issueKey 任务 Key
   * @param fields 要更新的字段对象
   * @param storyPointsField Story Points 自定义字段 ID（如 customfield_10016）
   * @param dueDateField Due Date 字段 ID（默认 duedate，可配置为自定义字段）
   */
  public async updateIssue(
    issueKey: string,
    fields: { storyPoints?: number | null; dueDate?: string | null },
    storyPointsField?: string,
    dueDateField: string = 'duedate'
  ): Promise<{ success: true } | { success: false; error: string }> {
    try {
      const updateFields: Record<string, any> = {};
      
      // 更新故事点
      if (fields.storyPoints !== undefined) {
        const fieldId = storyPointsField || 'customfield_10016'; // 默认字段 ID
        updateFields[fieldId] = fields.storyPoints;
      }
      
      // 更新截止日期
      if (fields.dueDate !== undefined) {
        // Jira API: 空字符串表示清除日期，null 可能不被接受
        updateFields[dueDateField] = fields.dueDate === null ? '' : fields.dueDate;
      }
      
      if (Object.keys(updateFields).length === 0) {
        return { success: true }; // 没有要更新的字段
      }
      
      console.log('[JiraClient] Updating issue:', issueKey, 'fields:', JSON.stringify(updateFields));
      
      // 使用特殊配置处理可能返回 204 No Content 的 PUT 请求
      const response = await this.client.put(`/rest/api/2/issue/${issueKey}`, {
        fields: updateFields,
      }, {
        transformResponse: [(data: ArrayBuffer) => {
          // PUT 请求可能返回空响应，直接返回 null
          if (!data || data.byteLength === 0) return null;
          try {
            return decodeResponse(data);
          } catch (e) {
            // 解析失败也返回 null（可能是空响应或无效 JSON）
            return null;
          }
        }]
      });
      
      console.log('[JiraClient] Issue updated successfully:', issueKey, 'response:', response.status);
      return { success: true };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // 记录详细的错误信息
        const responseData = error.response?.data;
        console.error('[JiraClient] Update failed:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: responseData,
          errors: responseData?.errors,
          errorMessages: responseData?.errorMessages,
        });
        
        // 构建详细的错误消息
        let message = error.response?.data?.errorMessages?.[0];
        
        // 检查字段特定错误
        if (!message && responseData?.errors) {
          const fieldErrors = Object.entries(responseData.errors)
            .map(([field, err]) => `${field}: ${err}`)
            .join(', ');
          if (fieldErrors) {
            message = fieldErrors;
          }
        }
        
        // 默认错误消息
        if (!message) {
          message = error.message;
        }
        
        return { success: false, error: `更新失败: ${message}` };
      }
      return { success: false, error: `未知错误: ${String(error)}` };
    }
  }
}
