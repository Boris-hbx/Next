# Spec: 简化 Next 应用

## 目标
精简 Next 应用，只保留核心功能和视觉效果。

## 保留的功能

### 核心功能
| 功能 | 说明 |
|------|------|
| Todo 四象限 | 任务管理，支持拖拽、添加、编辑、删除 |
| 时区时钟 | 左侧栏底部显示多城市时间 |
| 名言 Quote | Todo 页面 "My Task" 旁边的激励语 |

### 视觉效果（必须保留）
| 效果 | 位置 | 说明 |
|------|------|------|
| 顶部黑条 | 页面顶部 | 深色导航条 |
| 小球动画 | 顶部黑条 + 左侧栏 | 彗星尾巴效果的小球 |
| B 转圈 Logo | 顶部左侧 | 带旋转光圈的 B 标志 |
| 小宠物 | 侧边栏边缘 | 可交互的小宠物 |

#### 小球运动逻辑（保留，不修改）
- **运动区域**: L形区域（顶栏全宽 + 左侧栏）
- **彗星尾巴**: 每个小球拖着渐变尾巴，长度可配置
- **鼠标排斥**: 鼠标靠近时小球会逃开
  - 感应半径: 180px
  - 排斥力度: 12
  - 最大速度: 10
  - 摩擦力: 0.97
- **恐惧爆炸**: 被逼到角落时颤抖，持续受压会爆炸成碎片
- **汇合重生**: 碎片会在一段时间后汇合成新小球
- **闪电生成**: 小球数量不足时从 Logo 螺旋飞出新小球
- **颜色**: 6种颜色循环 `['#60a5fa', '#34d399', '#f87171', '#fbbf24', '#a78bfa', '#f472b6']`
- **数量**: 默认6个，存储在 `localStorage.particleCount`

#### 小宠物运动逻辑（保留，不修改）
- **位置**: 侧边栏右边缘，可上下移动
- **跟随鼠标**: 鼠标在左侧100px范围内时跟随
  - 远距离: 疯狂冲刺（30%剩余距离/帧）
  - 近距离(<20px): 温柔靠近（10%剩余距离/帧）
- **返回中心**: 鼠标离开后600ms，缓慢回到屏幕中央（4%/帧）
- **避让导航**: 经过导航按钮区域时会变瘦
- **点击切换**: 点击小宠物切换侧边栏展开/收起
- **状态类**: `active`(跟随中), `excited`(冲刺中), `slim`(瘦身避让), `at-sidebar`/`at-edge`(位置)

### 删除的功能
| 功能 | 位置 |
|------|------|
| 主页 Dashboard | `/main` |
| 工具箱 | `/toolbox` |
| Prompt 管理 | `/prompt-todo`, `/prompts` |
| 版本管理 | `/version` |
| 游戏中心 | `/game` |
| AI 聊天 | `/aichat` |
| 学习总结 | `/learning` |
| 气泡图 | `/bubble` |
| 激励页面 | `/motivation` |
| **小鱼动画** | 顶部/侧边栏 |
| **番茄时钟按钮** | 右下角 |
| **天气按钮** | 右下角 |

## Bug 修复

### Quote 名言不显示
**问题**: Todo 页面 "My Task" 旁边的名言文字为空
**原因**:
1. `data/quotes.txt` 文件不存在
2. `todo` 路由没有传入 `quote` 变量

**修复**:
1. 创建 `data/quotes.txt` 文件，添加默认名言
2. 添加 `/api/quote/random` API
3. 修改 `todo` 路由传入随机名言

## 修改清单

### 1. 后端 `backend/app.py`

#### 添加名言功能
```python
QUOTES_FILE = os.path.join(DATA_DIR, 'quotes.txt')

def get_random_quote():
    """获取随机名言"""
    default_quotes = [
        "Focus on the right thing.",
        "专注于重要的事情。",
        "今天的努力是明天的收获。",
        "把大象装进冰箱需要三步。"
    ]
    try:
        if os.path.exists(QUOTES_FILE):
            with open(QUOTES_FILE, 'r', encoding='utf-8') as f:
                quotes = [q.strip() for q in f.readlines() if q.strip()]
                if quotes:
                    import random
                    return random.choice(quotes)
    except:
        pass
    import random
    return random.choice(default_quotes)

@app.route('/api/quote/random')
def random_quote():
    return jsonify({'quote': get_random_quote()})
```

#### 修改 todo 路由
```python
@app.route('/todo')
def todo():
    return render_platform_template('todo.html',
                                    current_page='todo',
                                    quote=get_random_quote())
```

### 2. 创建数据文件 `data/quotes.txt`
- 格式：每行一条名言
- 数量：50条
- 用户可自行编辑此文件添加/修改名言
- 示例内容：
```
Focus on the right thing.
专注于重要的事情。
今天的努力是明天的收获。
不积跬步，无以至千里。
Done is better than perfect.
先完成，再完美。
...（共50条）
```

### 3. 前端 `base.html` 简化导航

删除多余导航项，只保留 Todo：
```html
<div class="nav-links">
    <a href="/todo" class="nav-link active">Todo</a>
</div>
```

### 4. 删除右下角按钮

在 `base.html` 或 `todo.html` 中找到并删除：
- 番茄时钟按钮
- 天气按钮

### 5. 保留的效果（不要修改）
- 顶部黑条和小球动画
- B Logo 转圈效果
- 左侧栏小宠物
- 小鱼动画
- 时区时钟

## 实施步骤

1. [x] 创建 spec 文档
2. [ ] 创建 `data/quotes.txt` 名言文件
3. [ ] 修改 `app.py` 添加名言功能
4. [ ] 简化 `base.html` 导航
5. [ ] 删除右下角按钮
6. [ ] 测试功能
7. [ ] 重新构建 Next.exe
