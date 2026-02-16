# 报告系统与日历组件 — 架构与提示词文档

## 一、整体架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                     Reports 页面 (src/pages/Reports.tsx)         │
│                                                                  │
│  ┌──────────────────┐    ┌────────────────────────────────────┐  │
│  │  CalendarSidebar  │    │         主内容区                    │  │
│  │                   │    │  ┌──────────────────────────────┐  │  │
│  │  · 日视图(日历)    │    │  │ 预计完成任务 (按截止日过滤)   │  │  │
│  │  · 月视图(12月)    │    │  └──────────────────────────────┘  │  │
│  │  · 季视图(Q1-Q4)  │    │  ┌──────────────────────────────┐  │  │
│  │  · 年视图(10年)    │    │  │ 已完成工作日志                │  │  │
│  │                   │    │  └──────────────────────────────┘  │  │
│  │  点击周数 → 周报   │    │                                    │  │
│  │  点击月份 → 月报   │    │  [查看周报] [查看月报] [查看季报]  │  │
│  │  点击季度 → 季报   │    │  [查看年报]                        │  │
│  │  点击年份 → 年报   │    │                                    │  │
│  └──────────────────┘    └────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │              ReportViewerDialog (弹窗)                        ││
│  │  周报: 单视图 (纯编辑器)                                      ││
│  │  月报/季报/年报: 分栏视图 (左侧层级导航 + 右侧编辑器)         ││
│  └──────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 数据流

```
工作日志 (t_work_logs)  ──┐
                          ├──▶ AI 生成报告 ──▶ 保存到 t_generated_reports
待完成任务 (t_tasks)    ──┘
```

---

## 二、日历组件 (CalendarSidebar)

文件：`src/components/CalendarSidebar.tsx`

### 2.1 四级视图切换

日历支持四级视图，通过点击标题逐级上钻：

| 视图 | 显示内容 | 点击标题 | 选择操作 |
|---|---|---|---|
| `days` | 当月日历网格 + 周数 + 农历 | → `months` | 点击日期 → 日视图；点击周数 → 打开周报 |
| `months` | 12 个月份格子 | → `quarters` | 点击月份 → 打开月报 |
| `quarters` | Q1-Q4 四个季度 | → `years` | 点击季度 → 打开季报 |
| `years` | 10 年范围 | (无) | 点击年份 → 打开年报 |

### 2.2 农历支持

使用 `lunar-javascript` 库（`Solar.fromDate(date).getLunar()`）：
- 优先显示节日（公历节日 + 农历节日）
- 其次显示节气
- 默认显示农历日期（如"初一"、"十五"）
- 标题栏显示干支年、农历月日

### 2.3 任务状态标记

日历通过两个 `Record<string, boolean>` 接收任务状态：

- `dayTaskStatus`: key 为 `YYYY-MM-DD`，日期格子显示绿色圆点
- `weekTaskStatus`: key 为 `{year}-W{weekNum}`，周数高亮为蓝色背景

数据来源（`Reports.tsx` 的 `loadTaskStatus()`）：
1. 加载全年工作日志 → 标记有日志的日期和周
2. 加载全年已保存的周报 → 标记有报告的周

### 2.4 Props 接口

```typescript
interface CalendarSidebarProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onSelectWeek: (weekStart: Date, weekEnd: Date) => void;
  onSelectMonth: (monthStart: Date, monthEnd: Date) => void;
  onSelectQuarter?: (quarterStart: Date, quarterEnd: Date) => void;
  onSelectYear?: (yearStart: Date, yearEnd: Date) => void;
  weekTaskStatus?: Record<string, boolean>;
  dayTaskStatus?: Record<string, boolean>;
}
```

---

## 三、报告查看器 (ReportViewerDialog)

文件：`src/components/ReportViewerDialog.tsx`

### 3.1 两种布局模式

| 报告类型 | 布局 | 左侧导航 | 右侧内容 |
|---|---|---|---|
| `weekly` | 单视图 (900px) | 无 | 纯文本编辑器 + 底部操作栏 |
| `monthly` | 分栏视图 (1200px) | 月度总览 + 包含周报列表 | 编辑器 + 模板选择 + 操作按钮 |
| `quarterly` | 分栏视图 (1200px) | 季度总览 + 包含月报列表 | 同上 |
| `yearly` | 分栏视图 (1200px) | 年度总览 + 包含季报列表 | 同上 |

### 3.2 层级关系

```
年报 (yearly)
 ├── 季报 (quarterly)    ← 年报的子项
 │    ├── 月报 (monthly) ← 季报的子项
 │    │    └── 周报 (weekly) ← 月报的子项
```

层级映射逻辑：

```typescript
// getHierarchyMode() 映射
'weekly'    → hierarchy: 'week'    → 无子项
'monthly'   → hierarchy: 'month'   → 子项类型: 'weekly'
'quarterly' → hierarchy: 'quarter' → 子项类型: 'monthly'
'yearly'    → hierarchy: 'year'    → 子项类型: 'monthly'
```

### 3.3 报告加载流程

```
打开弹窗
  │
  ▼
calculateDateRange(mode, currentDate)  ── 计算日期范围
  │  weekly:    周一 ~ 周日
  │  monthly:   月初 ~ 月末
  │  quarterly: 季初 ~ 季末
  │  yearly:    1月1日 ~ 12月31日
  │
  ▼
electronAPI.report.getHierarchyBundle({ hierarchy, startDate, endDate })
  │
  ▼
reportsDB.getBundle()  ── 数据库查询
  │  返回: { main: 父报告, children: 子报告列表 }
  │
  ▼
设置 report (父) + childReports (子) + editedContent
```

### 3.4 报告生成流程 (AI)

```
用户点击"使用 AI 生成"
  │
  ▼
1. 获取当前激活的 AI Profile
   electronAPI.ai.getActiveProfile()
  │
  ▼
2. 获取活动日期范围内的工作日志
   electronAPI.workLogs.getLogs(startDate, endDate)
  │
  ▼
3. 获取活动日期范围内的待完成任务
   electronAPI.task.getPendingByDueDate(startDate, endDate)
  │
  ▼
4. 组装最终 Prompt（见下方"提示词组装"章节）
  │
  ▼
5. 调用 AI 生成
   electronAPI.ai.generateReport(logs, systemPrompt, profileId)
  │
  ▼
6. 返回内容填入编辑器，用户可编辑后保存
```

### 3.5 报告保存

```typescript
electronAPI.report.save({
  id: report.id || uuidv4(),     // 新报告生成 UUID
  type: 'weekly' | 'monthly' | 'quarterly' | 'yearly',
  start_date: 'YYYY-MM-DD',
  end_date: 'YYYY-MM-DD',
  content: editedContent,
})
```

存入 `t_generated_reports` 表，使用 `INSERT OR REPLACE` 实现幂等保存。

---

## 四、AI 报告生成服务

文件：`electron/main/services/AIService.ts`

### 4.1 支持的 AI Provider

| Provider | Base URL | 默认模型 |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` |
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |
| Moonshot (Kimi) | `https://api.moonshot.cn/v1` | `kimi-k2-thinking-turbo` |
| Qwen (阿里云) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-turbo` |
| Custom | 自定义 | 自定义 |

所有 Provider 统一使用 OpenAI 兼容的 `/chat/completions` 接口。

### 4.2 生成报告核心逻辑

`AIService.generateReport()`（第 499 行）：

```typescript
// 1. 构建日志文本
const logsText = logs.map(log => {
  const prefix = log.source === 'JIRA' ? `[${log.task_key}]` : '[MANUAL]';
  return `- ${log.log_date}: ${prefix} ${log.summary}`;
}).join('\n');

// 2. 替换模板变量 {{logs}}
const finalPrompt = systemPrompt.replace(/{{logs}}/g, logsText);

// 3. 调用 AI API
POST /chat/completions
{
  model: profile.model,
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: finalPrompt }
  ],
  temperature: 0.7
}
```

### 4.3 Prompt 模板管理

- 存储位置：`settingsDB` 的 `ai_templates` key（JSON 序列化）
- 首次访问自动初始化为 `DEFAULT_PROMPT_TEMPLATES`
- 支持 CRUD 操作 + 重置为默认
- 每个模板有 `type` 字段绑定报告类型，弹窗中按类型过滤显示

---

## 五、提示词模板详解

### 5.1 最终 Prompt 组装结构

前端 `ReportViewerDialog` 在调用 AI 前会组装完整的 system prompt（第 379-392 行）：

```
你是一个专业的工作报告生成助手。请根据以下工作日志和待完成任务生成{报告类型名}。

【工作日志 - 已执行任务】
- 2025-01-13: [PRDAPD-704] 转库单功能开发 [EXECUTED 执行完成]
- 2025-01-14: [MANUAL] 参加需求评审会议 [EXECUTED 执行完成]
- ...（无日志时显示"本周无工作日志记录"）

【待完成任务 - 截止日在本周】
- PRDAPD-705: 出库单联调测试 [TESTING & REVIEW] (JIRA) (截止: 2025-01-17)
- LOCAL-001: 整理技术文档 [TO DO] (个人任务) (截止: 2025-01-19)
- ...（无任务时显示"本周无待完成任务"）

模板要求：
{用户选择的模板 content 内容}

请用中文输出，格式清晰，内容专业。
```

### 5.2 默认周报模板

```
你是一位敏捷开发任务整理专家。请根据以下原始内容生成结构化周报，严格遵循以下处理规则：

【数据清洗规则】
1. 删除每条记录开头的英文-数字任务编号（如 PRDAPD-704、WMS-123、Feature/PRDAPD-XXX 等）
2. 识别"主功能项-标识"格式（如"转库单-20240201"、"出库单-临时"），提取"-"前的文字作为主功能项用于归类合并，相同主功能项的任务合并为一条描述
3. 状态判定：内容包含"EXECUTED 执行完成" → 本周已完成；不包含 → 本周预计完成

【输出格式】
本周已完成
1. 主功能项：任务简述
2. 主功能项：任务简述
3. 主功能项：任务简述

本周预计完成
1. 主功能项：任务简述
2. 主功能项：任务简述
3. 主功能项：任务简述

【约束】
- 去除技术细节（如SQL、方法名、异常堆栈），保留业务含义
- 同一主功能项多行记录合并为一行，用顿号或"及"连接
- 严禁输出解释性文字，直接给出结果

待处理内容：{{logs}}
```

模板变量：`{{logs}}` — 被 `AIService.generateReport()` 替换为格式化的日志文本。

关键设计：
- 工作日志标记为 `[EXECUTED 执行完成]`，AI 据此判定为"已完成"
- 待完成任务不带此标记，AI 据此判定为"预计完成"
- 要求按"主功能项"归类合并，去除任务编号和技术细节

### 5.3 默认月报模板

```
你是一位敏捷开发任务整理专家。请根据以下原始内容生成月报，严格遵循以下处理规则：

【数据清洗规则】
1. 删除每条记录开头的英文-数字任务编号（如 PRDAPD-704、WMS-123 等）
2. 识别"主功能项-标识"格式（如"转库单-20240201"），提取"-"前文字作为主功能项用于归类合并
3. 状态处理：所有任务无论是否包含"EXECUTED 执行完成"均视为已完成，不区分预计完成

【输出格式】
本月已完成
1. 主功能项：任务简述
2. 主功能项：任务简述
3. 主功能项：任务简述

【约束】
- 去除技术细节，保留业务含义
- 相同主功能项合并描述
- 严禁输出"本月预计完成"部分
- 严禁输出解释性文字

待处理内容：
[{{logs}}]
```

与周报的关键区别：
- 所有任务统一视为"已完成"（月报回顾性质）
- 不输出"预计完成"部分
- 日志用 `[{{logs}}]` 包裹

### 5.4 默认季报模板

```
你是一个技术总监。请根据以下工作日志生成季度战略报告。

重点关注：
- 季度目标达成情况
- 关键成果与影响
- 团队能力提升
- 下季度战略规划

语气：战略高度、数据驱动。
```

角色定位：技术总监视角，侧重战略层面。

### 5.5 默认年报模板

```
你是一个CTO。请根据以下工作日志生成年度总结报告。

重点关注：
- 年度成就回顾
- 技术演进路径
- 团队成长总结
- 来年愿景与目标

语气：鼓舞人心、高瞻远瞩。
```

角色定位：CTO 视角，侧重年度全局总结与展望。

### 5.6 模板选择策略

弹窗打开时自动选择模板（`getDefaultTemplateForMode()`）：

```
1. 找 type 匹配且 isDefault=true 的模板
2. 找 type 匹配的第一个模板
3. 找任意 isDefault=true 的模板
4. 取第一个模板
```

模板下拉框按当前活动报告类型过滤：`templates.filter(t => !t.type || t.type === activeReport.type)`

---

## 六、数据库设计

### 6.1 报告表 (t_generated_reports)

```sql
CREATE TABLE t_generated_reports (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL CHECK(type IN ('weekly', 'monthly', 'quarterly', 'yearly')),
  start_date TEXT NOT NULL,    -- YYYY-MM-DD
  end_date   TEXT NOT NULL,    -- YYYY-MM-DD
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL  -- Unix timestamp (ms)
);

CREATE INDEX idx_reports_type_date ON t_generated_reports(type, start_date, end_date);
```

### 6.2 reportsDB 操作接口

| 方法 | 说明 |
|---|---|
| `save(report)` | INSERT OR REPLACE 保存报告 |
| `getByDateRange(type, start, end)` | 精确匹配 type + start_date + end_date |
| `getBundle(hierarchy, start, end)` | 获取层级包：父报告 + 子报告列表 |
| `getByTypeAndDateRange(type, start, end)` | 获取日期范围内指定类型的所有报告 |
| `delete(id)` | 删除单条报告 |

`getBundle()` 层级查询逻辑：

| hierarchy | 父类型 (mainType) | 子类型 (childType) |
|---|---|---|
| `year` | `yearly` | `monthly` |
| `quarter` | `quarterly` | `monthly` |
| `month` | `monthly` | `weekly` |

---

## 七、IPC 通信接口

### 7.1 报告相关

| IPC Channel | 方向 | 说明 |
|---|---|---|
| `report.save` | 前端 → 主进程 | 保存报告 |
| `report.getHierarchyBundle` | 前端 → 主进程 | 获取层级报告包 |
| `report.getByTypeAndRange` | 前端 → 主进程 | 按类型和日期范围查询 |

### 7.2 AI 相关

| IPC Channel | 方向 | 说明 |
|---|---|---|
| `ai:get-templates` | 前端 → 主进程 | 获取所有提示词模板 |
| `ai:save-templates` | 前端 → 主进程 | 批量保存模板 |
| `ai:add-template` | 前端 → 主进程 | 添加单个模板 |
| `ai:update-template` | 前端 → 主进程 | 更新模板 |
| `ai:delete-template` | 前端 → 主进程 | 删除模板 |
| `ai:reset-templates` | 前端 → 主进程 | 重置为默认模板 |
| `ai:generate-report` | 前端 → 主进程 | 调用 AI 生成报告 |
| `ai:get-active-profile` | 前端 → 主进程 | 获取当前激活的 AI 配置 |

### 7.3 数据源相关

| IPC Channel | 说明 |
|---|---|
| `workLogs.getLogs(start, end)` | 获取日期范围内的工作日志 |
| `task.getPendingByDueDate(start, end)` | 获取截止日在范围内的未完成任务 |

---

## 八、关键文件索引

| 文件 | 职责 |
|---|---|
| `src/pages/Reports.tsx` | 报告页面主容器：日历 + 日志列表 + 报告弹窗入口 |
| `src/components/CalendarSidebar.tsx` | 日历组件：四级视图、农历、任务状态标记 |
| `src/components/ReportViewerDialog.tsx` | 报告弹窗：层级导航、AI 生成、编辑保存 |
| `electron/main/services/AIService.ts` | AI 服务：Profile 管理、模板管理、报告生成 |
| `electron/main/ipc/ai.ts` | AI IPC 处理器 |
| `electron/main/db/schema.ts` | 数据库 schema + `reportsDB` 操作 |
