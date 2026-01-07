# Spec: 名言文件可编辑功能

## 目标
将名言（quotes）存储在独立文件中，打包到 exe，用户可以在运行后自行编辑。

## 当前问题
1. `quotes.txt` 存在于源码 `data/` 目录，但没有打包进 exe
2. 用户无法编辑名言内容
3. Todo 数据在每次运行时丢失（需要一并修复）

## 解决方案

### 数据目录策略
- **打包时**: 将默认 `data/quotes.txt` 打包到 exe 内部
- **首次运行**: 检测用户数据目录，如果 `quotes.txt` 不存在，从内部复制一份
- **后续运行**: 读取用户数据目录的 `quotes.txt`，用户可自由编辑

### 目录结构
```
dist/
├── Next.exe
└── data/                    # 用户数据目录（exe 同级）
    ├── todos.json           # 任务数据（自动创建）
    └── quotes.txt           # 名言文件（首次运行时复制）
```

## 修改清单

### 1. 修改 `Next.spec` - 打包默认数据文件
```python
datas = [
    # 前端模板
    (os.path.join(PROJECT_ROOT, 'frontend', 'templates'), 'frontend/templates'),
    # 静态资源
    (os.path.join(PROJECT_ROOT, 'assets'), 'assets'),
    # 默认数据文件（打包到内部，首次运行时复制到用户目录）
    (os.path.join(PROJECT_ROOT, 'data', 'quotes.txt'), 'data_default'),
]
```

### 2. 修改 `backend/app.py` - 初始化用户数据目录
```python
def init_user_data():
    """初始化用户数据目录，首次运行时复制默认文件"""
    os.makedirs(DATA_DIR, exist_ok=True)

    # 复制默认 quotes.txt（如果用户目录没有）
    if not os.path.exists(QUOTES_FILE):
        default_quotes = os.path.join(BASE_DIR, 'data_default', 'quotes.txt')
        if os.path.exists(default_quotes):
            import shutil
            shutil.copy(default_quotes, QUOTES_FILE)
        else:
            # 创建默认内容
            with open(QUOTES_FILE, 'w', encoding='utf-8') as f:
                f.write("Focus on the right thing.\n专注于重要的事情。\n")

# 在应用启动时调用
init_user_data()
```

### 3. 文件格式
`data/quotes.txt`:
- 每行一条名言
- 支持中英文
- 空行自动忽略
- 用户可用任意文本编辑器修改

### 4. 验收步骤
1. 运行 `dist/Next.exe`
2. 检查 `dist/data/` 目录是否自动创建
3. 检查 `dist/data/quotes.txt` 是否存在
4. 用记事本编辑 `quotes.txt`，添加一条名言
5. 刷新页面，查看新名言是否出现
6. 添加几个 Todo，关闭程序
7. 重新打开，确认 Todo 数据保留

## 实施步骤
1. [x] 修改 Next.spec 打包 quotes.txt
2. [x] 修改 app.py 添加 init_user_data()
3. [ ] 测试数据持久化
4. [x] 重新构建 exe
5. [ ] 验收测试

---

## 已知限制：Taskbar 图标问题

### 问题描述
使用 Chrome/Edge App 模式时，taskbar 显示的是浏览器图标而非应用图标。

### 原因
`--app` 模式本质上还是启动浏览器进程，Windows taskbar 显示的是浏览器的图标。

### 解决方案（未来改进）
1. **使用 pywebview** - 创建真正的原生窗口，图标完全可控
2. **创建快捷方式** - 提供 .lnk 文件，用户 pin 快捷方式而非 exe

### 临时方案
用户可手动创建快捷方式：
1. 右键 `Next.exe` → 创建快捷方式
2. 右键快捷方式 → 属性 → 更改图标 → 选择 `assets/icons/next.ico`
3. 将快捷方式 pin 到 taskbar
