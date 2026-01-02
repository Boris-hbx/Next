# Outlook 日历集成配置指南

本文档说明如何配置 Microsoft Graph API 以连接 Outlook 日历。

---

## 前置条件

- 拥有 Microsoft 账户（个人账户或工作/学校账户均可）
- 能够访问 Azure Portal

---

## 第一部分：在 Azure Portal 注册应用

### 步骤 1：登录 Azure Portal

1. 打开浏览器访问：https://portal.azure.com
2. 使用你的 Microsoft 账户登录

### 步骤 2：进入应用注册页面

1. 在顶部搜索栏输入 **"App registrations"** 或 **"应用注册"**
2. 点击进入 **"应用注册"** 服务

### 步骤 3：创建新应用

1. 点击页面顶部的 **"+ 新注册"** 按钮
2. 填写注册表单：

| 字段 | 值 |
|------|-----|
| **名称** | `Work Engine Calendar`（可自定义） |
| **支持的账户类型** | 选择 **"任何组织目录中的账户和个人 Microsoft 账户"** |
| **重定向 URI - 平台** | 选择 **Web** |
| **重定向 URI - URL** | `http://localhost:3000/api/calendar/outlook/callback` |

3. 点击 **"注册"** 按钮

### 步骤 4：获取 Application (client) ID

注册成功后会自动跳转到应用概述页面：

1. 在 **"概要"** / **"Essentials"** 区域找到 **"应用程序(客户端) ID"**
2. 点击复制按钮，保存这个 ID

```
示例格式：12345678-1234-1234-1234-123456789abc
```

**请记录下来：**
```
Application (client) ID: ________________________________
```

### 步骤 5：创建客户端密码 (Client Secret)

1. 在左侧菜单点击 **"证书和密码"** / **"Certificates & secrets"**
2. 在 **"客户端密码"** 区域点击 **"+ 新建客户端密码"**
3. 填写：
   - **说明**: `work-engine`（可自定义）
   - **过期时间**: 建议选择 **24 个月**
4. 点击 **"添加"**
5. **重要！** 立即复制 **"值"** 列中的密码（只显示一次，离开页面后无法再查看）

**请记录下来：**
```
Client Secret: ________________________________
```

### 步骤 6：配置 API 权限

1. 在左侧菜单点击 **"API 权限"** / **"API permissions"**
2. 点击 **"+ 添加权限"**
3. 选择 **"Microsoft Graph"**
4. 选择 **"委托的权限"** / **"Delegated permissions"**
5. 搜索并勾选以下权限：
   - `User.Read` - 读取用户基本信息
   - `Calendars.Read` - 读取日历
6. 点击 **"添加权限"**

添加完成后，权限列表应显示：
- `User.Read` - 已授予
- `Calendars.Read` - 已授予

---

## 第二部分：在应用中配置

### 步骤 1：启动应用

确保后端服务已启动：
```bash
cd C:\Project\boris-workspace\work-engine\backend
python app.py
```

### 步骤 2：打开日程管理工具

1. 在浏览器访问：http://localhost:3000/toolbox
2. 找到 **"日程管理"** 工具并打开

### 步骤 3：配置 Microsoft Graph API

1. 在左侧边栏找到 **"Outlook 集成"** 区域
2. 点击右上角的 **⚙️** 设置按钮
3. 在弹出的配置窗口中填写：

| 字段 | 值 |
|------|-----|
| **Application (client) ID** | 填入步骤 4 记录的 ID |
| **Client Secret** | 填入步骤 5 记录的密码 |
| **Tenant ID** | 留空（使用默认值 `common`） |

4. 点击 **"保存配置"**

### 步骤 4：登录 Microsoft 账户

1. 点击 **"登录 Microsoft"** 按钮
2. 在弹出的窗口中使用你的 Microsoft 账户登录
3. 同意授权应用访问你的日历
4. 授权成功后窗口会自动关闭

### 步骤 5：同步日历

1. 登录成功后，点击 **"同步日程"** 按钮
2. 应用会自动获取你未来 30 天的 Outlook 日历事件

---

## 常见问题

### Q: 提示 "AADSTS50011: The redirect URI specified in the request does not match"
**A:** 回到 Azure Portal，检查重定向 URI 是否正确设置为：
```
http://localhost:3000/api/calendar/outlook/callback
```

### Q: 提示需要管理员同意
**A:** 如果使用的是工作/学校账户，可能需要 IT 管理员批准。可以：
1. 联系管理员授权
2. 或使用个人 Microsoft 账户

### Q: Client Secret 过期了怎么办？
**A:** 回到 Azure Portal → 应用注册 → 你的应用 → 证书和密码，创建新的密码，然后在应用中更新配置。

### Q: 如何退出登录？
**A:** 在 Outlook 集成区域点击 **"退出登录"** 按钮。

---

## 配置信息记录

在此记录你的配置信息（请妥善保管，不要泄露）：

```
Application (client) ID:
Client Secret:
Tenant ID: common
重定向 URI: http://localhost:3000/api/calendar/outlook/callback
```

---

## 技术说明

本功能使用 Microsoft Graph API 通过 OAuth 2.0 授权码流程访问 Outlook 日历。

相关文件：
- 后端认证模块：`backend/ms_graph.py`
- API 端点：`backend/app.py` (行 3510-3659)
- 前端 UI：`frontend/templates/toolbox.html`

依赖库：
- `msal` - Microsoft Authentication Library
- `requests` - HTTP 请求库
