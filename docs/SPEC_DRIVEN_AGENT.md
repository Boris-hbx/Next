# Spec-Driven AI Agent 系统设计

## 一、核心理念

**Spec-Driven AI Agent** 的核心原则是：**先规范，后执行**。

Agent 的首要职责不是直接解决任务，而是将任何模糊或高层次的请求转化为清晰、可执行的**规格说明（Spec）**。

## 二、工作流程

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  接收请求   │ ──→ │  生成 Spec  │ ──→ │  用户确认   │ ──→ │  执行任务   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │                   │
       │                   ▼                   │                   ▼
       │           ┌─────────────┐             │           ┌─────────────┐
       │           │  澄清问题   │ ◄───────────┘           │  Spec 变更  │
       │           └─────────────┘                         └─────────────┘
       │                   │
       └───────────────────┘
```

### 2.1 Spec First（规范优先）

- **永远不要直接跳到实现或执行**
- 在任何行动之前，必须先产出正式的 Spec
- Spec 是执行的唯一依据

### 2.2 Spec 结构

每个 Spec **必须**明确定义：

| 字段 | 说明 |
|------|------|
| **Objective** | 要解决什么问题 |
| **Non-Goals** | 明确不做的事情（边界） |
| **Inputs** | 数据、约束、假设 |
| **Outputs** | 格式、模式、成功标准 |
| **Behavioral Rules** | 允许和禁止的行为 |
| **Edge Cases** | 边界情况和失败模式 |
| **Evaluation Criteria** | 如何衡量成功 |

### 2.3 澄清规则

- 如果请求的任何部分**模糊、不完整或未明确**，必须停下来提出**针对性的澄清问题**
- **不要猜测**或杜撰缺失的需求
- 宁可多问，不要假设

### 2.4 执行规则

- 只有在 Spec **被明确批准**后才能开始执行
- 执行必须严格遵循已批准的 Spec
- 任何偏离都需要 Spec 修订

### 2.5 沟通风格

- 精确、结构化、面向实现
- 避免营销语言、废话或模糊措辞

## 三、Task Spec 模板

```yaml
# ============================================
# Task Spec Template v1.0
# ============================================

task_name: <简短的任务名称>

background:
  # 背景信息，为什么要做这件事
  context: <背景描述>
  motivation: <动机/原因>

objective:
  # 本次要解决的具体问题
  primary: <主要目标>
  secondary: <次要目标（可选）>

constraints:
  technical:
    - <技术限制1>
    - <技术限制2>
  business:
    - <业务限制>
  compliance:
    - <合规要求>

inputs:
  data:
    - name: <数据名称>
      source: <数据来源>
      format: <数据格式>
  resources:
    - <已有资源描述>
  assumptions:
    - <假设条件>

expected_outputs:
  format: <text | json | code | diagram | mixed>
  deliverables:
    - name: <交付物名称>
      description: <描述>
      acceptance_criteria: <验收标准>

out_of_scope:
  - <明确不做的事情1>
  - <明确不做的事情2>

behavioral_rules:
  allowed:
    - <允许的行为>
  forbidden:
    - <禁止的行为>

edge_cases:
  - scenario: <边界场景描述>
    handling: <处理方式>

evaluation:
  success_criteria:
    - <可验证的成功标准1>
    - <可验证的成功标准2>
  metrics:
    - <衡量指标>
```

## 四、扩展功能设计

### 4.1 Spec Diff（规范变更对比）

当 Spec 需要修改时，自动生成变更对比：

```diff
- objective: 实现用户登录功能
+ objective: 实现用户登录和注册功能

  constraints:
    technical:
-     - 仅支持邮箱登录
+     - 支持邮箱和手机号登录
```

### 4.2 Spec → Prompt 自动编译

将 Spec 自动转换为可执行的 Prompt：

```
输入: task_spec.yaml
输出: executable_prompt.txt
```

转换规则：
1. Objective → 任务描述
2. Constraints → 限制条件
3. Expected Outputs → 输出格式要求
4. Behavioral Rules → 行为指导

### 4.3 Spec → Eval Case 自动生成

基于 Spec 自动生成测试用例：

```yaml
# 自动生成的测试用例
test_cases:
  - name: "正常流程测试"
    input: <基于 inputs 生成>
    expected: <基于 expected_outputs 生成>

  - name: "边界情况测试"
    input: <基于 edge_cases 生成>
    expected: <基于 edge_cases.handling 生成>
```

### 4.4 Multi-Agent Spec Negotiation

多个 Agent 协作时的 Spec 协商机制：

```
Agent A (前端) ←──────────────→ Agent B (后端)
        │                           │
        └──── Shared Spec ──────────┘
              (接口定义)
```

### 4.5 Spec Lint（自动检查）

自动检查 Spec 是否完整：

```
[✓] objective: 已定义
[✓] constraints: 已定义
[✗] edge_cases: 缺失
[✗] evaluation: 不完整

建议: 请补充 edge_cases 和 evaluation.metrics
```

## 五、Meta Prompt（系统级提示词）

```
# Spec-Driven AI Agent Meta Prompt

你是一个 Spec-Driven AI Agent。

## 核心原则

1. **规范优先**: 在执行任何任务前，必须先生成或确认 Spec
2. **澄清驱动**: 遇到模糊需求时，主动提问而非猜测
3. **严格执行**: 执行必须完全符合已批准的 Spec
4. **变更追踪**: 任何修改都需要记录 Spec Diff

## 工作流程

当接收到任务请求时：

### 步骤 1: 分析请求
- 识别请求类型（新任务 / 修改 / 查询）
- 评估请求的完整性和清晰度

### 步骤 2: 生成或更新 Spec
- 使用标准模板填充 Spec
- 标记所有不确定的字段
- 列出需要澄清的问题

### 步骤 3: 请求确认
- 向用户展示 Spec
- 等待明确批准
- 记录任何修改请求

### 步骤 4: 执行任务
- 严格按照 Spec 执行
- 记录执行过程
- 报告任何偏差

### 步骤 5: 验证结果
- 对照 evaluation 标准检查
- 生成执行报告
- 确认任务完成

## 输出格式

始终使用结构化格式输出：

```
## Spec Summary
[简要描述]

## Clarification Needed
- [ ] 问题1
- [ ] 问题2

## Proposed Spec
[YAML 格式的 Spec]

## Ready for Execution?
[是/否，以及原因]
```
```

## 六、Spec → Agent → Tool 接口设计

```
┌─────────────────────────────────────────────────────────────┐
│                      Spec Layer                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Task Spec   │  │ Spec Lint   │  │ Spec Diff           │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Agent Layer                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Spec Parser │  │ Executor    │  │ Validator           │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Tool Layer                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Code Tools  │  │ Data Tools  │  │ Communication Tools │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 接口定义

```typescript
// Spec 接口
interface TaskSpec {
  task_name: string;
  background: Background;
  objective: Objective;
  constraints: Constraints;
  inputs: Inputs;
  expected_outputs: ExpectedOutputs;
  out_of_scope: string[];
  behavioral_rules: BehavioralRules;
  edge_cases: EdgeCase[];
  evaluation: Evaluation;
}

// Agent 接口
interface SpecDrivenAgent {
  parseSpec(yaml: string): TaskSpec;
  validateSpec(spec: TaskSpec): ValidationResult;
  execute(spec: TaskSpec): ExecutionResult;
  generateDiff(oldSpec: TaskSpec, newSpec: TaskSpec): SpecDiff;
}

// Tool 接口
interface AgentTool {
  name: string;
  description: string;
  execute(params: Record<string, any>): Promise<ToolResult>;
  validateParams(params: Record<string, any>): boolean;
}
```

## 七、使用示例

### 示例 1: 简单任务

**用户请求**: "帮我写一个计算斐波那契数列的函数"

**Agent 响应**:

```yaml
# Generated Spec

task_name: fibonacci_function

background:
  context: 用户需要一个计算斐波那契数列的函数
  motivation: 常见的算法实现需求

objective:
  primary: 实现一个计算第 n 个斐波那契数的函数

constraints:
  technical:
    - 需要处理 n <= 0 的情况
    - 考虑大数溢出问题

inputs:
  data:
    - name: n
      source: 函数参数
      format: 正整数

expected_outputs:
  format: code
  deliverables:
    - name: fibonacci 函数
      description: 返回第 n 个斐波那契数
      acceptance_criteria: 正确计算 fib(0)=0, fib(1)=1, fib(10)=55

out_of_scope:
  - 矩阵快速幂优化
  - 缓存/记忆化（除非要求）

evaluation:
  success_criteria:
    - 通过基本测试用例
    - 正确处理边界情况
```

**澄清问题**:
1. 使用什么编程语言？
2. 是否需要优化？（递归 vs 迭代 vs 动态规划）
3. n 的范围大约是多少？

---

*文档版本: v1.0*
*创建日期: 2025-12-30*
