# Microsoft Graph API 配置和工具模块
import os
import json
import msal
import requests
from datetime import datetime, timedelta

# Microsoft Graph API 配置
# 用户需要在 Azure AD 中注册应用并填入以下信息
MS_GRAPH_CONFIG = {
    'client_id': os.environ.get('MS_GRAPH_CLIENT_ID', ''),
    'client_secret': os.environ.get('MS_GRAPH_CLIENT_SECRET', ''),  # 可选，用于机密客户端
    'tenant_id': os.environ.get('MS_GRAPH_TENANT_ID', 'common'),  # 'common' 支持个人和工作账户
    'redirect_uri': os.environ.get('MS_GRAPH_REDIRECT_URI', 'http://localhost:3000/api/calendar/outlook/callback'),
    'scopes': ['User.Read', 'Calendars.Read'],
    'authority': None,  # 将在初始化时设置
    'graph_endpoint': 'https://graph.microsoft.com/v1.0'
}

# 配置文件路径
CONFIG_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'ms_graph_config.json')
TOKEN_CACHE_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'private-data', 'ms_graph_token_cache.json')

def load_config():
    """加载配置文件"""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
                MS_GRAPH_CONFIG['client_id'] = config.get('client_id', MS_GRAPH_CONFIG['client_id'])
                MS_GRAPH_CONFIG['client_secret'] = config.get('client_secret', MS_GRAPH_CONFIG['client_secret'])
                MS_GRAPH_CONFIG['tenant_id'] = config.get('tenant_id', MS_GRAPH_CONFIG['tenant_id'])
                if config.get('redirect_uri'):
                    MS_GRAPH_CONFIG['redirect_uri'] = config['redirect_uri']
        except Exception as e:
            print(f"加载 MS Graph 配置失败: {e}")

    # 设置 authority
    MS_GRAPH_CONFIG['authority'] = f"https://login.microsoftonline.com/{MS_GRAPH_CONFIG['tenant_id']}"

def save_config(client_id, client_secret='', tenant_id='common', redirect_uri=None):
    """保存配置到文件"""
    config = {
        'client_id': client_id,
        'client_secret': client_secret,
        'tenant_id': tenant_id
    }
    if redirect_uri:
        config['redirect_uri'] = redirect_uri

    os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2)

    # 重新加载配置
    load_config()

def is_configured():
    """检查是否已配置"""
    load_config()
    return bool(MS_GRAPH_CONFIG['client_id'])

def get_msal_app():
    """创建 MSAL 公共客户端应用"""
    load_config()

    if not MS_GRAPH_CONFIG['client_id']:
        raise ValueError("未配置 Microsoft Graph API Client ID")

    # 加载令牌缓存
    cache = msal.SerializableTokenCache()
    if os.path.exists(TOKEN_CACHE_FILE):
        try:
            with open(TOKEN_CACHE_FILE, 'r') as f:
                cache.deserialize(f.read())
        except:
            pass

    # 创建公共客户端应用（用于桌面/移动应用，使用设备代码流或交互式流）
    app = msal.PublicClientApplication(
        MS_GRAPH_CONFIG['client_id'],
        authority=MS_GRAPH_CONFIG['authority'],
        token_cache=cache
    )

    return app, cache

def save_token_cache(cache):
    """保存令牌缓存"""
    if cache.has_state_changed:
        os.makedirs(os.path.dirname(TOKEN_CACHE_FILE), exist_ok=True)
        with open(TOKEN_CACHE_FILE, 'w') as f:
            f.write(cache.serialize())

def get_auth_url():
    """获取授权 URL（用于 Web 应用授权码流程）"""
    load_config()

    if not MS_GRAPH_CONFIG['client_id']:
        raise ValueError("未配置 Microsoft Graph API Client ID")

    # 使用机密客户端进行授权码流程
    app = msal.ConfidentialClientApplication(
        MS_GRAPH_CONFIG['client_id'],
        authority=MS_GRAPH_CONFIG['authority'],
        client_credential=MS_GRAPH_CONFIG['client_secret'] if MS_GRAPH_CONFIG['client_secret'] else None
    )

    auth_url = app.get_authorization_request_url(
        scopes=MS_GRAPH_CONFIG['scopes'],
        redirect_uri=MS_GRAPH_CONFIG['redirect_uri']
    )

    return auth_url

def acquire_token_by_auth_code(auth_code):
    """使用授权码获取令牌"""
    load_config()

    # 加载令牌缓存
    cache = msal.SerializableTokenCache()
    if os.path.exists(TOKEN_CACHE_FILE):
        try:
            with open(TOKEN_CACHE_FILE, 'r') as f:
                cache.deserialize(f.read())
        except:
            pass

    app = msal.ConfidentialClientApplication(
        MS_GRAPH_CONFIG['client_id'],
        authority=MS_GRAPH_CONFIG['authority'],
        client_credential=MS_GRAPH_CONFIG['client_secret'] if MS_GRAPH_CONFIG['client_secret'] else None,
        token_cache=cache
    )

    result = app.acquire_token_by_authorization_code(
        auth_code,
        scopes=MS_GRAPH_CONFIG['scopes'],
        redirect_uri=MS_GRAPH_CONFIG['redirect_uri']
    )

    if 'access_token' in result:
        save_token_cache(cache)
        return result
    else:
        raise Exception(result.get('error_description', '获取令牌失败'))

def get_access_token():
    """获取访问令牌（优先从缓存获取）"""
    load_config()

    # 加载令牌缓存
    cache = msal.SerializableTokenCache()
    if os.path.exists(TOKEN_CACHE_FILE):
        try:
            with open(TOKEN_CACHE_FILE, 'r') as f:
                cache.deserialize(f.read())
        except:
            pass

    app = msal.ConfidentialClientApplication(
        MS_GRAPH_CONFIG['client_id'],
        authority=MS_GRAPH_CONFIG['authority'],
        client_credential=MS_GRAPH_CONFIG['client_secret'] if MS_GRAPH_CONFIG['client_secret'] else None,
        token_cache=cache
    )

    accounts = app.get_accounts()
    if accounts:
        # 尝试静默获取令牌
        result = app.acquire_token_silent(MS_GRAPH_CONFIG['scopes'], account=accounts[0])
        if result and 'access_token' in result:
            save_token_cache(cache)
            return result['access_token']

    return None

def is_authenticated():
    """检查是否已认证"""
    return get_access_token() is not None

def logout():
    """登出（清除令牌缓存）"""
    if os.path.exists(TOKEN_CACHE_FILE):
        os.remove(TOKEN_CACHE_FILE)

def get_calendar_events(days=30):
    """获取日历事件"""
    access_token = get_access_token()
    if not access_token:
        raise Exception("未登录，请先完成 Microsoft 账户授权")

    # 设置时间范围
    now = datetime.utcnow()
    start_time = now.strftime('%Y-%m-%dT%H:%M:%SZ')
    end_time = (now + timedelta(days=days)).strftime('%Y-%m-%dT%H:%M:%SZ')

    # 调用 Graph API
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }

    url = f"{MS_GRAPH_CONFIG['graph_endpoint']}/me/calendarview"
    params = {
        'startDateTime': start_time,
        'endDateTime': end_time,
        '$orderby': 'start/dateTime',
        '$top': 100
    }

    response = requests.get(url, headers=headers, params=params)

    if response.status_code == 200:
        data = response.json()
        events = []

        for item in data.get('value', []):
            try:
                start_dt = datetime.fromisoformat(item['start']['dateTime'].replace('Z', '+00:00'))
                end_dt = datetime.fromisoformat(item['end']['dateTime'].replace('Z', '+00:00'))

                events.append({
                    'id': f"outlook_{hash(item['id'])}",
                    'outlook_id': item['id'],
                    'title': item.get('subject', '(无标题)'),
                    'date': start_dt.strftime('%Y-%m-%d'),
                    'start': start_dt.strftime('%H:%M'),
                    'end': end_dt.strftime('%H:%M'),
                    'notes': item.get('bodyPreview', '')[:200],
                    'source': 'outlook',
                    'location': item.get('location', {}).get('displayName', ''),
                    'isAllDay': item.get('isAllDay', False)
                })
            except Exception as e:
                continue

        return events
    elif response.status_code == 401:
        # 令牌过期，清除缓存
        logout()
        raise Exception("登录已过期，请重新授权")
    else:
        raise Exception(f"获取日历失败: {response.status_code} - {response.text}")

def get_user_info():
    """获取用户信息"""
    access_token = get_access_token()
    if not access_token:
        return None

    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }

    response = requests.get(f"{MS_GRAPH_CONFIG['graph_endpoint']}/me", headers=headers)

    if response.status_code == 200:
        data = response.json()
        return {
            'name': data.get('displayName', ''),
            'email': data.get('mail') or data.get('userPrincipalName', '')
        }
    return None

# 初始化时加载配置
load_config()
