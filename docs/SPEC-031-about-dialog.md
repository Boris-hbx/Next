# SPEC-031: About 关于页面

> 起草日期: 2026-01-12
> 状态: 已完成

## 概述

设计一个精致的"关于"弹窗，展示应用信息、设计者、版本号和联系方式。整体风格：**极简主义 + 毛玻璃质感 + 微动效**。

## 视觉设计

### 整体布局

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│                    ┌─────────┐                      │
│                    │  LOGO   │                      │
│                    │  图标    │                      │
│                    └─────────┘                      │
│                                                     │
│                      Next                           │
│              Focus on the Right Thing               │
│                                                     │
│                    ─────────                        │
│                                                     │
│              Version 1.0.0 · 2026.1.11              │
│                                                     │
│    ┌─────────────────────────────────────────┐     │
│    │  ▸ 优先级泳道设计                          │     │
│    │  ▸ 三种时间维度：今日/本周/月度             │     │
│    │  ▸ 拖拽排序与跨泳道移动                    │     │
│    │  ▸ 任务进度追踪                           │     │
│    │  ▸ 每日例行打卡                           │     │
│    │  ▸ 彗星粒子动效                           │     │
│    │  ▸ 底部呼吸线动画                         │     │
│    │  ▸ 多时区时钟                             │     │
│    │  ▸ 深色/浅色主题                          │     │
│    └─────────────────────────────────────────┘     │
│                                                     │
│    ─────────────────────────────────────────────   │
│                                                     │
│                 © 2026 Boris Huai                   │
│                                                     │
│                     [ 关闭 ]                        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 设计元素

#### 1. 毛玻璃遮罩层
```css
.about-overlay {
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(8px);
}
```

#### 2. 弹窗容器
```css
.about-dialog {
    background: rgba(255, 255, 255, 0.95);
    border-radius: 20px;
    box-shadow:
        0 25px 50px rgba(0, 0, 0, 0.15),
        0 0 0 1px rgba(255, 255, 255, 0.1);
    max-width: 420px;
    padding: 48px 40px;
}

/* 深色模式 */
[data-theme="dark"] .about-dialog {
    background: rgba(30, 30, 35, 0.95);
    box-shadow:
        0 25px 50px rgba(0, 0, 0, 0.4),
        0 0 0 1px rgba(255, 255, 255, 0.05);
}
```

#### 3. Logo 区域
- 应用图标：64x64px，圆角 16px
- 悬浮时微微上浮 + 光晕效果
```css
.about-logo {
    width: 64px;
    height: 64px;
    border-radius: 16px;
    transition: all 0.3s ease;
}

.about-logo:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 24px rgba(102, 126, 234, 0.3);
}
```

#### 4. 应用名称
```css
.about-title {
    font-size: 28px;
    font-weight: 700;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    letter-spacing: -0.5px;
}

.about-tagline {
    font-size: 14px;
    color: #6b7280;
    letter-spacing: 0.5px;
    margin-top: 4px;
}
```

#### 5. 分隔线
```css
.about-divider {
    width: 40px;
    height: 3px;
    background: linear-gradient(90deg, #667eea, #764ba2);
    border-radius: 2px;
    margin: 24px auto;
}
```

#### 6. 版本号（含日期）
```css
.about-version {
    display: inline-block;
    padding: 6px 16px;
    background: rgba(102, 126, 234, 0.1);
    border-radius: 20px;
    font-size: 13px;
    font-weight: 500;
    color: #667eea;
    cursor: pointer;
    transition: all 0.2s ease;
}

.about-version:hover {
    background: rgba(102, 126, 234, 0.15);
}
```

#### 7. 功能特性列表
```css
.about-features {
    background: rgba(0, 0, 0, 0.02);
    border-radius: 12px;
    padding: 16px 20px;
    margin: 24px 0;
    text-align: left;
}

[data-theme="dark"] .about-features {
    background: rgba(255, 255, 255, 0.03);
}

.about-features ul {
    list-style: none;
    margin: 0;
    padding: 0;
}

.about-features li {
    font-size: 13px;
    color: #6b7280;
    padding: 6px 0;
    display: flex;
    align-items: center;
    gap: 8px;
}

.about-features li::before {
    content: "▸";
    color: #667eea;
    font-size: 10px;
}

[data-theme="dark"] .about-features li {
    color: #9ca3af;
}
```

#### 8. 版权信息
```css
.about-copyright {
    font-size: 12px;
    color: #9ca3af;
    margin-top: 20px;
    letter-spacing: 0.3px;
}
```

#### 9. 关闭按钮
```css
.about-close-btn {
    padding: 10px 32px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: none;
    border-radius: 10px;
    color: white;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
}

.about-close-btn:hover {
    transform: scale(1.02);
    box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
}
```

### 入场动画

```css
/* 遮罩层淡入 */
.about-overlay {
    animation: fadeIn 0.2s ease;
}

/* 弹窗缩放 + 上移 */
.about-dialog {
    animation: slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes slideUp {
    from {
        opacity: 0;
        transform: scale(0.95) translateY(20px);
    }
    to {
        opacity: 1;
        transform: scale(1) translateY(0);
    }
}
```

## 信息内容

| 字段 | 内容 |
|------|------|
| 应用名称 | Next |
| Tagline | Focus on the Right Thing |
| 版本号 | Version 1.0.0 · 2026.1.11 |
| 版权 | © 2026 Boris Huai |

### v1.0.0 功能特性

- 优先级泳道设计
- 三种时间维度：今日 / 本周 / 月度
- 拖拽排序与跨泳道移动
- 任务进度追踪
- 每日例行打卡
- 彗星粒子动效
- 底部呼吸线动画
- 多时区时钟
- 深色 / 浅色主题

## 入口位置

在顶部标题栏区域，鼠标悬停在 "Next" 标题上时显示可点击状态，点击打开 About 弹窗。

```
┌──────────────────────────────────────────────────┐
│  ☰   Next ← 点击这里           [Today ▼]    🔍  │
└──────────────────────────────────────────────────┘
```

## 交互细节

1. **打开方式**
   - 点击顶部标题 "Next"

2. **关闭方式**
   - 点击 "关闭" 按钮
   - 点击遮罩层
   - 按 ESC 键

3. **复制版本号**
   - 点击版本号可复制到剪贴板
   - 显示 "已复制" 提示

## 技术实现

### HTML 结构
```html
<div class="about-overlay" id="about-overlay" style="display:none;" onclick="closeAbout()">
    <div class="about-dialog" onclick="event.stopPropagation()">
        <img class="about-logo" src="/assets/icons/icon.png" alt="Next">
        <h1 class="about-title">Next</h1>
        <p class="about-tagline">Focus on the Right Thing</p>

        <div class="about-divider"></div>

        <span class="about-version" onclick="copyVersion()" title="点击复制版本号">
            Version 1.0.0 · 2026.1.11
        </span>

        <div class="about-features">
            <ul>
                <li>优先级泳道设计</li>
                <li>三种时间维度：今日 / 本周 / 月度</li>
                <li>拖拽排序与跨泳道移动</li>
                <li>任务进度追踪</li>
                <li>每日例行打卡</li>
                <li>彗星粒子动效</li>
                <li>底部呼吸线动画</li>
                <li>多时区时钟</li>
                <li>深色 / 浅色主题</li>
            </ul>
        </div>

        <div class="about-copyright">© 2026 Boris Huai</div>

        <button class="about-close-btn" onclick="closeAbout()">关闭</button>
    </div>
</div>
```

### JavaScript
```javascript
function openAbout() {
    document.getElementById('about-overlay').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeAbout() {
    document.getElementById('about-overlay').style.display = 'none';
    document.body.style.overflow = '';
}

function copyVersion() {
    navigator.clipboard.writeText('Next v1.0.0 (2026.1.11)');
    showToast('版本号已复制');
}

// ESC 关闭
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && document.getElementById('about-overlay').style.display !== 'none') {
        closeAbout();
    }
});
```

## 文件修改

- `frontend/templates/todo.html` - 添加 About 弹窗 HTML + CSS + JS
- `frontend/index.html` - 同步更新

## 设计参考

- Apple 系统偏好设置的关于弹窗
- Notion 的简约设计风格
- Linear 的渐变和动效处理
