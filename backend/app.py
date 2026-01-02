from flask import Flask, render_template, redirect, url_for, request, jsonify, flash, send_from_directory, session
import os
import sys
import io
import secrets
import re
import random
import json
import uuid
from datetime import datetime, timedelta
from functools import wraps

# 修复 Windows 控制台中文编码问题
if sys.platform == 'win32':
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
    except:
        pass  # 忽略如果已经设置过

# Get the project root directory (parent of backend/)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

app = Flask(__name__,
            template_folder=os.path.join(BASE_DIR, 'frontend', 'templates'),
            static_folder=os.path.join(BASE_DIR, 'assets'),
            static_url_path='/assets')
app.secret_key = os.environ.get('FLASK_SECRET_KEY', secrets.token_hex(16))

# Data file paths
DATA_DIR = os.path.join(BASE_DIR, 'data')
BACKUP_DIR = os.path.join(BASE_DIR, 'backups')
PRIVATE_DATA_DIR = os.path.join(BASE_DIR, 'private-data')
EXPENSES_DIR = os.path.join(PRIVATE_DATA_DIR, 'expenses')
TODOLIST_FILE = os.path.join(DATA_DIR, 'todolist.txt')
MOTIVATION_FILE = os.path.join(DATA_DIR, 'motivation.txt')
QUOTES_FILE = os.path.join(DATA_DIR, 'quotes.txt')
BUBBLES_FILE = os.path.join(DATA_DIR, 'bubbles.json')
TODOS_FILE = os.path.join(DATA_DIR, 'todos.json')
PROMPTS_FILE = os.path.join(DATA_DIR, 'prompts.json')
PROMPT_TODO_FILE = os.path.join(DATA_DIR, 'prompt-todo.json')
EXPENSES_FILE = os.path.join(PRIVATE_DATA_DIR, 'expenses.json')
PPT_FILE = os.path.join(DATA_DIR, 'ppt.json')
PPT_DIR = os.path.join(BASE_DIR, 'ppt')
USERS_FILE = os.path.join(PRIVATE_DATA_DIR, 'users.json')

# Ensure backup directory exists
os.makedirs(BACKUP_DIR, exist_ok=True)
os.makedirs(EXPENSES_DIR, exist_ok=True)

# Config file (separate folder for sensitive settings)
CONFIG_DIR = os.path.join(BASE_DIR, 'config')
CONFIG_FILE = os.path.join(CONFIG_DIR, 'config.json')

# ============ Device Detection & Platform Routing ============

def is_mobile():
    """Detect if request is from a mobile device"""
    # Check for manual override in session
    if 'platform' in session:
        return session['platform'] == 'mobile'

    # Check User-Agent
    user_agent = request.headers.get('User-Agent', '').lower()
    mobile_keywords = ['iphone', 'android', 'mobile', 'ipod', 'blackberry', 'windows phone']
    return any(keyword in user_agent for keyword in mobile_keywords)

def get_platform():
    """Get current platform: 'mobile' or 'desktop'"""
    return 'mobile' if is_mobile() else 'desktop'

def platform_template(template_name):
    """Get the correct template path based on platform"""
    platform = get_platform()
    platform_path = f"{platform}/{template_name}"

    # Check if platform-specific template exists
    template_full_path = os.path.join(app.template_folder, platform_path)
    if os.path.exists(template_full_path):
        return platform_path

    # Fall back to original template location
    return template_name

def render_platform_template(template_name, **context):
    """Render template with platform awareness"""
    context['platform'] = get_platform()
    context['is_mobile'] = is_mobile()
    return render_template(platform_template(template_name), **context)

# ============ Config ============

def read_config():
    """Read config from config.json"""
    if not os.path.exists(CONFIG_FILE):
        return {"prompt_delete_password": "8888"}
    try:
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return {"prompt_delete_password": "8888"}

# ============ 多租户用户管理 ============

def simple_encrypt_pin(pin):
    """简单加密PIN码 - 基于位移和混淆"""
    if not pin or len(pin) != 4 or not pin.isdigit():
        return None
    # 简单加密：每位数字+3后取模10，然后反转
    encrypted = ''.join(str((int(d) + 3) % 10) for d in pin)
    return encrypted[::-1]  # 反转

def simple_decrypt_pin(encrypted):
    """解密PIN码"""
    if not encrypted or len(encrypted) != 4:
        return None
    # 解密：反转，然后每位数字-3后取模10
    reversed_pin = encrypted[::-1]
    return ''.join(str((int(d) - 3) % 10) for d in reversed_pin)

def verify_pin(input_pin, stored_encrypted):
    """验证PIN码"""
    return simple_encrypt_pin(input_pin) == stored_encrypted

def read_users():
    """读取所有用户"""
    if not os.path.exists(USERS_FILE):
        # 创建默认管理员账户
        default_users = [{
            "id": str(uuid.uuid4())[:8],
            "username": "admin",
            "display_name": "管理员",
            "pin": simple_encrypt_pin("0000"),
            "role": "admin",
            "created_at": datetime.now().isoformat()
        }]
        save_users(default_users)
        return default_users
    try:
        with open(USERS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return []

def save_users(users):
    """保存用户数据"""
    with open(USERS_FILE, 'w', encoding='utf-8') as f:
        json.dump(users, f, ensure_ascii=False, indent=2)

def get_current_user():
    """获取当前登录用户"""
    user_id = session.get('user_id')
    if not user_id:
        return None
    users = read_users()
    for user in users:
        if user['id'] == user_id:
            return user
    return None

def login_required(f):
    """登录验证装饰器"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('user_id'):
            if request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return jsonify({'success': False, 'error': '请先登录', 'redirect': '/login'}), 401
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return decorated_function

def normalize_content(content):
    """Clean up content: normalize line endings and remove excessive blank lines"""
    content = content.replace('\r\n', '\n').replace('\r', '\n')
    content = re.sub(r'\n{3,}', '\n\n', content)
    return content.strip() + '\n'

def read_quotes():
    """Read all quotes from quotes.txt"""
    if not os.path.exists(QUOTES_FILE):
        return ["今天也要加油！"]
    try:
        with open(QUOTES_FILE, 'r', encoding='utf-8') as f:
            quotes = [line.strip() for line in f.readlines() if line.strip()]
        return quotes if quotes else ["今天也要加油！"]
    except:
        return ["今天也要加油！"]

def get_random_quote():
    """Get a random quote"""
    quotes = read_quotes()
    return random.choice(quotes)

def parse_todolist():
    """Parse todolist.txt and return structured data"""
    if not os.path.exists(TODOLIST_FILE):
        return {"today": "", "this_week": "", "next_30_days": ""}

    try:
        with open(TODOLIST_FILE, 'r', encoding='utf-8') as f:
            content = f.read()

        today_header = "-------------------Today-------------------"
        week_header = "-------------------This Week-------------------"
        month_header = "-------------------The next 30 days-------------------"

        sections = {"today": "", "this_week": "", "next_30_days": ""}

        if today_header in content:
            parts = content.split(today_header, 1)
            if len(parts) > 1:
                remaining = parts[1]
                if week_header in remaining:
                    today_part, remaining = remaining.split(week_header, 1)
                    sections["today"] = today_part.strip()
                    if month_header in remaining:
                        week_part, month_part = remaining.split(month_header, 1)
                        sections["this_week"] = week_part.strip()
                        sections["next_30_days"] = month_part.strip()
                    else:
                        sections["this_week"] = remaining.strip()
                else:
                    sections["today"] = remaining.strip()

        return sections

    except Exception as e:
        print(f"Error parsing todolist.txt: {e}")
        return {"today": "", "this_week": "", "next_30_days": ""}

def parse_motivation():
    """Parse motivation.txt and return structured data by categories"""
    if not os.path.exists(MOTIVATION_FILE):
        return {"leader": "", "family": "", "mindset": "", "health": ""}

    try:
        with open(MOTIVATION_FILE, 'r', encoding='utf-8') as f:
            content = f.read()

        leader_header = "-------------------精神领袖-------------------"
        family_header = "-------------------家庭责任-------------------"
        mindset_header = "-------------------心态修炼-------------------"
        health_header = "-------------------健康人生-------------------"

        sections = {"leader": "", "family": "", "mindset": "", "health": ""}

        if leader_header in content:
            parts = content.split(leader_header, 1)
            if len(parts) > 1:
                remaining = parts[1]
                if family_header in remaining:
                    leader_part, remaining = remaining.split(family_header, 1)
                    sections["leader"] = leader_part.strip()
                    if mindset_header in remaining:
                        family_part, remaining = remaining.split(mindset_header, 1)
                        sections["family"] = family_part.strip()
                        if health_header in remaining:
                            mindset_part, health_part = remaining.split(health_header, 1)
                            sections["mindset"] = mindset_part.strip()
                            sections["health"] = health_part.strip()
                        else:
                            sections["mindset"] = remaining.strip()
                    else:
                        sections["family"] = remaining.strip()
                else:
                    sections["leader"] = remaining.strip()

        return sections

    except Exception as e:
        print(f"Error parsing motivation.txt: {e}")
        return {"leader": "", "family": "", "mindset": "", "health": ""}

@app.route('/sw.js')
def service_worker():
    """Serve service worker from root path"""
    return send_from_directory(os.path.join(BASE_DIR, 'assets'), 'sw.js', mimetype='application/javascript')

@app.route('/manifest.json')
def manifest():
    """Serve PWA manifest from root path"""
    return send_from_directory(os.path.join(BASE_DIR, 'assets'), 'manifest.json', mimetype='application/json')

@app.route('/PrtSc/<path:filename>')
def prtsc_files(filename):
    """Serve files from PrtSc folder (screenshots for reference)"""
    return send_from_directory(os.path.join(BASE_DIR, 'PrtSc'), filename)

# ============ 登录/登出路由 ============

@app.route('/login')
def login_page():
    """登录页面"""
    if session.get('user_id'):
        return redirect(url_for('main'))
    return render_platform_template('login.html', current_page='login')

@app.route('/api/auth/login', methods=['POST'])
def api_login():
    """登录API"""
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        pin = data.get('pin', '').strip()

        if not username or not pin:
            return jsonify({'success': False, 'error': '请输入用户名和PIN码'})

        if len(pin) != 4 or not pin.isdigit():
            return jsonify({'success': False, 'error': 'PIN码必须是4位数字'})

        users = read_users()
        for user in users:
            if user['username'] == username and verify_pin(pin, user['pin']):
                session['user_id'] = user['id']
                session['username'] = user['username']
                session['display_name'] = user.get('display_name', username)
                return jsonify({
                    'success': True,
                    'user': {
                        'id': user['id'],
                        'username': user['username'],
                        'display_name': user.get('display_name', username)
                    }
                })

        return jsonify({'success': False, 'error': '用户名或PIN码错误'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/auth/logout', methods=['POST'])
def api_logout():
    """登出API"""
    session.clear()
    return jsonify({'success': True})

@app.route('/api/auth/status')
def api_auth_status():
    """获取当前登录状态"""
    user = get_current_user()
    if user:
        return jsonify({
            'logged_in': True,
            'user': {
                'id': user['id'],
                'username': user['username'],
                'display_name': user.get('display_name', user['username'])
            }
        })
    return jsonify({'logged_in': False})

@app.route('/api/users', methods=['GET'])
@login_required
def api_get_users():
    """获取所有用户（仅管理员）"""
    current = get_current_user()
    if current.get('role') != 'admin':
        return jsonify({'success': False, 'error': '权限不足'}), 403

    users = read_users()
    # 不返回PIN码
    safe_users = [{k: v for k, v in u.items() if k != 'pin'} for u in users]
    return jsonify({'users': safe_users})

@app.route('/api/users', methods=['POST'])
@login_required
def api_create_user():
    """创建新用户（仅管理员）"""
    current = get_current_user()
    if current.get('role') != 'admin':
        return jsonify({'success': False, 'error': '权限不足'}), 403

    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        display_name = data.get('display_name', '').strip() or username
        pin = data.get('pin', '').strip()

        if not username or not pin:
            return jsonify({'success': False, 'error': '用户名和PIN码不能为空'})

        if len(pin) != 4 or not pin.isdigit():
            return jsonify({'success': False, 'error': 'PIN码必须是4位数字'})

        users = read_users()
        if any(u['username'] == username for u in users):
            return jsonify({'success': False, 'error': '用户名已存在'})

        new_user = {
            'id': str(uuid.uuid4())[:8],
            'username': username,
            'display_name': display_name,
            'pin': simple_encrypt_pin(pin),
            'role': 'user',
            'created_at': datetime.now().isoformat()
        }
        users.append(new_user)
        save_users(users)

        return jsonify({'success': True, 'user': {k: v for k, v in new_user.items() if k != 'pin'}})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/users/<user_id>', methods=['DELETE'])
@login_required
def api_delete_user(user_id):
    """删除用户（仅管理员）"""
    current = get_current_user()
    if current.get('role') != 'admin':
        return jsonify({'success': False, 'error': '权限不足'}), 403

    if current['id'] == user_id:
        return jsonify({'success': False, 'error': '不能删除自己'})

    users = read_users()
    users = [u for u in users if u['id'] != user_id]
    save_users(users)
    return jsonify({'success': True})

@app.route('/api/users/<user_id>/pin', methods=['PUT'])
@login_required
def api_change_pin(user_id):
    """修改PIN码"""
    current = get_current_user()
    # 只能修改自己的PIN码，或者管理员可以修改任何人的
    if current['id'] != user_id and current.get('role') != 'admin':
        return jsonify({'success': False, 'error': '权限不足'}), 403

    try:
        data = request.get_json()
        new_pin = data.get('new_pin', '').strip()

        if len(new_pin) != 4 or not new_pin.isdigit():
            return jsonify({'success': False, 'error': 'PIN码必须是4位数字'})

        users = read_users()
        for user in users:
            if user['id'] == user_id:
                user['pin'] = simple_encrypt_pin(new_pin)
                save_users(users)
                return jsonify({'success': True})

        return jsonify({'success': False, 'error': '用户不存在'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/')
def index():
    """Redirect to main dashboard"""
    return redirect(url_for('main'))

@app.route('/main')
def main():
    """Render main dashboard"""
    quote = get_random_quote()
    return render_platform_template('main.html', quote=quote, current_page='main')

@app.route('/todo')
def todo():
    """Render Todo page"""
    todo_data = parse_todolist()
    quote = get_random_quote()
    return render_platform_template('todo.html', todo=todo_data, quote=quote, current_page='todo')

@app.route('/motivation')
def motivation():
    """Render Motivation page"""
    motivation_data = parse_motivation()
    quote = get_random_quote()
    return render_platform_template('motivation.html', motivation=motivation_data, quote=quote, current_page='motivation')

@app.route('/bubble')
def bubble():
    """Redirect to toolbox (deprecated route)"""
    return redirect(url_for('toolbox'))

@app.route('/toolbox')
def toolbox():
    """Render Toolbox page - collection of tools"""
    quote = get_random_quote()
    return render_platform_template('toolbox.html', quote=quote, current_page='toolbox')

@app.route('/prompts')
def prompts():
    """Render Prompt Log page"""
    quote = get_random_quote()
    return render_platform_template('prompts.html', quote=quote, current_page='prompts')

@app.route('/prompt-todo')
def prompt_todo():
    """Render Prompt Todo page"""
    quote = get_random_quote()
    return render_platform_template('prompt_todo.html', quote=quote, current_page='prompt_todo')

@app.route('/aichat')
def aichat():
    """Render AI Chat page"""
    quote = get_random_quote()
    return render_platform_template('aichat.html', quote=quote, current_page='aichat')

@app.route('/game')
def game():
    """Render Game page - 松开你的大脑"""
    quote = get_random_quote()
    return render_platform_template('game.html', quote=quote, current_page='game')

@app.route('/zen')
def zen():
    """Render Zen page - 发呆时光"""
    quote = get_random_quote()
    return render_platform_template('zen.html', quote=quote, current_page='zen')

@app.route('/leader')
def leader():
    """Render Leader page - 领袖培训班"""
    quote = get_random_quote()
    return render_platform_template('leader.html', quote=quote, current_page='leader')

@app.route('/english')
def english():
    """Render English page - 英文学习天地"""
    quote = get_random_quote()
    return render_platform_template('english.html', quote=quote, current_page='english')

@app.route('/learning')
def learning():
    """Render Learning page - 学习总结"""
    quote = get_random_quote()
    return render_platform_template('learning.html', quote=quote, current_page='learning')

@app.route('/version')
def version():
    """Render Version Management page - 版本管理"""
    quote = get_random_quote()
    return render_platform_template('version.html', quote=quote, current_page='version')

@app.route('/breakout')
def breakout():
    """Render Breakout game page - 打砖块游戏"""
    return render_template('breakout.html')

@app.route('/spider-mobile')
def spider_mobile():
    """Render mobile spider game page"""
    return render_template('spider_mobile.html')

# ============ Platform Switch API ============

@app.route('/api/platform/switch', methods=['POST'])
def switch_platform():
    """Switch between mobile and desktop platform"""
    data = request.get_json()
    platform = data.get('platform', 'auto')

    if platform == 'auto':
        session.pop('platform', None)
    elif platform in ['mobile', 'desktop']:
        session['platform'] = platform
    else:
        return jsonify({'success': False, 'error': 'Invalid platform'}), 400

    return jsonify({'success': True, 'platform': get_platform()})

@app.route('/api/platform/current')
def current_platform():
    """Get current platform"""
    return jsonify({
        'platform': get_platform(),
        'is_mobile': is_mobile(),
        'override': session.get('platform')
    })

# ============ Quotes API ============

@app.route('/api/quote/random')
def random_quote():
    """Get a random quote via API"""
    return jsonify({'quote': get_random_quote()})

@app.route('/api/quotes', methods=['GET'])
def get_all_quotes():
    """Get all quotes"""
    return jsonify({'quotes': read_quotes()})

@app.route('/api/quotes', methods=['POST'])
def save_quotes():
    """Save all quotes"""
    try:
        data = request.get_json()
        quotes = data.get('quotes', [])
        content = '\n'.join(quotes)
        with open(QUOTES_FILE, 'w', encoding='utf-8') as f:
            f.write(content)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# ============ Weather API ============

# 天气缓存（避免频繁请求）
_weather_cache = {
    'data': None,
    'timestamp': 0
}
WEATHER_CACHE_DURATION = 600  # 10分钟缓存

@app.route('/api/weather')
def get_weather():
    """获取天气信息（使用 wttr.in 免费API）"""
    import time
    import urllib.request
    import urllib.error

    # 检查缓存
    current_time = time.time()
    if _weather_cache['data'] and (current_time - _weather_cache['timestamp']) < WEATHER_CACHE_DURATION:
        return jsonify(_weather_cache['data'])

    try:
        # 使用 wttr.in API 获取天气（默认滑铁卢）
        city = request.args.get('city', 'Waterloo,Ontario')
        url = f'https://wttr.in/{city}?format=j1'

        req = urllib.request.Request(url, headers={'User-Agent': 'curl/7.68.0'})
        with urllib.request.urlopen(req, timeout=5) as response:
            weather_data = json.loads(response.read().decode('utf-8'))

        current = weather_data.get('current_condition', [{}])[0]

        # 解析天气代码
        weather_code = int(current.get('weatherCode', 113))

        # 天气类型映射
        if weather_code in [113]:  # 晴天
            weather_type = 'sunny'
            icon = '☀️'
        elif weather_code in [116, 119, 122]:  # 多云/阴天
            weather_type = 'cloudy'
            icon = '☁️'
        elif weather_code in [176, 263, 266, 293, 296, 299, 302, 305, 308, 311, 314, 353, 356, 359]:  # 雨
            weather_type = 'rainy'
            icon = '🌧️'
        elif weather_code in [179, 182, 185, 227, 230, 317, 320, 323, 326, 329, 332, 335, 338, 350, 362, 365, 368, 371, 374, 377, 392, 395]:  # 雪
            weather_type = 'snowy'
            icon = '❄️'
        elif weather_code in [200, 386, 389]:  # 雷暴
            weather_type = 'stormy'
            icon = '⛈️'
        else:
            weather_type = 'cloudy'
            icon = '☁️'

        result = {
            'success': True,
            'weather_type': weather_type,
            'icon': icon,
            'temp_c': current.get('temp_C', '--'),
            'temp_f': current.get('temp_F', '--'),
            'humidity': current.get('humidity', '--'),
            'description': current.get('weatherDesc', [{}])[0].get('value', ''),
            'city': city,
            'cached': False
        }

        # 更新缓存
        _weather_cache['data'] = result
        _weather_cache['timestamp'] = current_time

        return jsonify(result)

    except Exception as e:
        # 如果有缓存，返回缓存数据
        if _weather_cache['data']:
            cached_result = _weather_cache['data'].copy()
            cached_result['cached'] = True
            return jsonify(cached_result)

        return jsonify({
            'success': False,
            'error': str(e),
            'weather_type': 'cloudy',
            'icon': '☁️',
            'temp_c': '--',
            'description': '无法获取天气'
        })

@app.route('/save_section/<section>', methods=['POST'])
def save_section(section):
    """Save a single section of the todo list via AJAX"""
    today_header = "-------------------Today-------------------"
    week_header = "-------------------This Week-------------------"
    month_header = "-------------------The next 30 days-------------------"

    section_map = {
        'today': 'today',
        'week': 'this_week',
        'month': 'next_30_days'
    }

    if section not in section_map:
        return jsonify({'success': False, 'error': 'Invalid section'})

    try:
        data = request.get_json()
        new_content = data.get('content', '').strip()

        sections = parse_todolist()
        sections[section_map[section]] = new_content

        file_content = f"{today_header}\n{sections['today']}\n\n{week_header}\n{sections['this_week']}\n\n{month_header}\n{sections['next_30_days']}\n"
        file_content = normalize_content(file_content)

        with open(TODOLIST_FILE, 'w', encoding='utf-8') as f:
            f.write(file_content)

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/save_motivation/<section>', methods=['POST'])
def save_motivation_section(section):
    """Save a single section of motivation via AJAX"""
    leader_header = "-------------------精神领袖-------------------"
    family_header = "-------------------家庭责任-------------------"
    mindset_header = "-------------------心态修炼-------------------"
    health_header = "-------------------健康人生-------------------"

    section_map = {
        'leader': 'leader',
        'family': 'family',
        'mindset': 'mindset',
        'health': 'health'
    }

    if section not in section_map:
        return jsonify({'success': False, 'error': 'Invalid section'})

    try:
        data = request.get_json()
        new_content = data.get('content', '').strip()

        sections = parse_motivation()
        sections[section_map[section]] = new_content

        file_content = f"{leader_header}\n{sections['leader']}\n\n{family_header}\n{sections['family']}\n\n{mindset_header}\n{sections['mindset']}\n\n{health_header}\n{sections['health']}\n"
        file_content = normalize_content(file_content)

        with open(MOTIVATION_FILE, 'w', encoding='utf-8') as f:
            f.write(file_content)

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# ============ Todo Items with Quadrants ============

def read_todos():
    """Read all todo items from todos.json"""
    if not os.path.exists(TODOS_FILE):
        return {"items": []}
    try:
        with open(TODOS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return {"items": []}

def save_todos(data):
    """Save all todo items to todos.json"""
    with open(TODOS_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

@app.route('/api/todos', methods=['GET'])
def get_todos():
    """Get all todo items, optionally filtered by tab"""
    tab = request.args.get('tab', None)
    data = read_todos()
    items = data.get('items', [])

    if tab:
        items = [item for item in items if item.get('tab') == tab]

    # Sort: incomplete first, then by created_at
    items.sort(key=lambda x: (x.get('completed', False), x.get('created_at', '')))

    return jsonify({'items': items})

@app.route('/api/todos', methods=['POST'])
def create_todo():
    """Create a new todo item"""
    try:
        req_data = request.get_json()
        now = datetime.now().isoformat()

        item = {
            'id': str(uuid.uuid4())[:8],
            'text': req_data.get('text', ''),
            'tab': req_data.get('tab', 'today'),
            'quadrant': req_data.get('quadrant', 'important-not-urgent'),
            'tags': req_data.get('tags', []),  # F401: Task labels support
            'completed': False,
            'completed_at': None,
            'created_at': now,
            'updated_at': now
        }

        data = read_todos()
        data['items'].append(item)
        save_todos(data)

        return jsonify({'success': True, 'item': item})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/todos/<item_id>', methods=['PUT'])
def update_todo(item_id):
    """Update a todo item (text, quadrant, tab, tags, completed status)"""
    try:
        req_data = request.get_json()
        data = read_todos()

        for i, item in enumerate(data['items']):
            if item['id'] == item_id:
                # Update fields if provided
                if 'text' in req_data:
                    data['items'][i]['text'] = req_data['text']
                if 'quadrant' in req_data:
                    data['items'][i]['quadrant'] = req_data['quadrant']
                if 'tab' in req_data:
                    data['items'][i]['tab'] = req_data['tab']
                if 'tags' in req_data:  # F401: Task labels support
                    data['items'][i]['tags'] = req_data['tags']
                if 'completed' in req_data:
                    data['items'][i]['completed'] = req_data['completed']
                    if req_data['completed']:
                        data['items'][i]['completed_at'] = datetime.now().isoformat()
                    else:
                        data['items'][i]['completed_at'] = None

                data['items'][i]['updated_at'] = datetime.now().isoformat()
                save_todos(data)
                return jsonify({'success': True, 'item': data['items'][i]})

        return jsonify({'success': False, 'error': 'Not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/todos/<item_id>', methods=['DELETE'])
def delete_todo(item_id):
    """Delete a todo item"""
    try:
        data = read_todos()
        data['items'] = [item for item in data['items'] if item['id'] != item_id]
        save_todos(data)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/todos/batch', methods=['PUT'])
def batch_update_todos():
    """Batch update multiple todo items (for reordering after drag)"""
    try:
        req_data = request.get_json()
        updates = req_data.get('updates', [])

        data = read_todos()
        now = datetime.now().isoformat()

        for update in updates:
            item_id = update.get('id')
            for i, item in enumerate(data['items']):
                if item['id'] == item_id:
                    if 'quadrant' in update:
                        data['items'][i]['quadrant'] = update['quadrant']
                    if 'tab' in update:
                        data['items'][i]['tab'] = update['tab']
                    data['items'][i]['updated_at'] = now
                    break

        save_todos(data)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# ============ Bubble Chart Version Control ============

def read_bubbles():
    """Read all bubble charts from bubbles.json"""
    if not os.path.exists(BUBBLES_FILE):
        return []
    try:
        with open(BUBBLES_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return []

def save_bubbles(bubbles):
    """Save all bubble charts to bubbles.json"""
    with open(BUBBLES_FILE, 'w', encoding='utf-8') as f:
        json.dump(bubbles, f, ensure_ascii=False, indent=2)

def find_bubble(bubble_id):
    """Find a bubble chart by ID"""
    bubbles = read_bubbles()
    for b in bubbles:
        if b['id'] == bubble_id:
            return b
    return None

@app.route('/api/bubbles', methods=['GET'])
def get_bubbles():
    """Get all saved bubble charts (list view)"""
    bubbles = read_bubbles()
    # Return simplified list for sidebar
    result = [{
        'id': b['id'],
        'title': b['title'],
        'description': b.get('description', ''),
        'created_at': b['created_at'],
        'updated_at': b['updated_at']
    } for b in bubbles]
    # Sort by updated_at descending
    result.sort(key=lambda x: x['updated_at'], reverse=True)
    return jsonify({'bubbles': result})

@app.route('/api/bubbles/<bubble_id>', methods=['GET'])
def get_bubble(bubble_id):
    """Get a specific bubble chart by ID"""
    bubble = find_bubble(bubble_id)
    if bubble:
        return jsonify({'success': True, 'bubble': bubble})
    return jsonify({'success': False, 'error': 'Not found'}), 404

@app.route('/api/bubbles', methods=['POST'])
def create_bubble():
    """Create a new bubble chart"""
    try:
        data = request.get_json()
        now = datetime.now().isoformat()
        bubble = {
            'id': str(uuid.uuid4())[:8],
            'title': data.get('title', '未命名图表'),
            'description': data.get('description', ''),
            'x_label': data.get('x_label', '投入成本'),
            'y_label': data.get('y_label', '恢复效果'),
            'data': data.get('data', []),
            'created_at': now,
            'updated_at': now
        }
        bubbles = read_bubbles()
        bubbles.append(bubble)
        save_bubbles(bubbles)
        return jsonify({'success': True, 'bubble': bubble})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/bubbles/<bubble_id>', methods=['PUT'])
def update_bubble(bubble_id):
    """Update an existing bubble chart"""
    try:
        data = request.get_json()
        bubbles = read_bubbles()
        for i, b in enumerate(bubbles):
            if b['id'] == bubble_id:
                bubbles[i]['title'] = data.get('title', b['title'])
                bubbles[i]['description'] = data.get('description', b.get('description', ''))
                bubbles[i]['x_label'] = data.get('x_label', b['x_label'])
                bubbles[i]['y_label'] = data.get('y_label', b['y_label'])
                bubbles[i]['data'] = data.get('data', b['data'])
                bubbles[i]['updated_at'] = datetime.now().isoformat()
                save_bubbles(bubbles)
                return jsonify({'success': True, 'bubble': bubbles[i]})
        return jsonify({'success': False, 'error': 'Not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/bubbles/<bubble_id>', methods=['DELETE'])
def delete_bubble(bubble_id):
    """Delete a bubble chart"""
    try:
        bubbles = read_bubbles()
        bubbles = [b for b in bubbles if b['id'] != bubble_id]
        save_bubbles(bubbles)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/bubbles/<bubble_id>/duplicate', methods=['POST'])
def duplicate_bubble(bubble_id):
    """Duplicate a bubble chart"""
    try:
        bubble = find_bubble(bubble_id)
        if not bubble:
            return jsonify({'success': False, 'error': 'Not found'}), 404

        now = datetime.now().isoformat()
        new_bubble = {
            'id': str(uuid.uuid4())[:8],
            'title': bubble['title'] + ' (副本)',
            'description': bubble.get('description', ''),
            'x_label': bubble['x_label'],
            'y_label': bubble['y_label'],
            'data': bubble['data'].copy(),
            'created_at': now,
            'updated_at': now
        }
        bubbles = read_bubbles()
        bubbles.append(new_bubble)
        save_bubbles(bubbles)
        return jsonify({'success': True, 'bubble': new_bubble})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# ============ Prompt Log ============

def read_prompts():
    """Read all prompts from prompts.json"""
    if not os.path.exists(PROMPTS_FILE):
        return []
    try:
        with open(PROMPTS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return []

def save_prompts(prompts):
    """Save all prompts to prompts.json"""
    with open(PROMPTS_FILE, 'w', encoding='utf-8') as f:
        json.dump(prompts, f, ensure_ascii=False, indent=2)

@app.route('/api/prompts', methods=['GET'])
def get_prompts():
    """Get all prompts"""
    prompts = read_prompts()
    # Sort by created_at descending (newest first)
    prompts.sort(key=lambda x: x.get('created_at', ''), reverse=True)
    return jsonify({'prompts': prompts})

@app.route('/api/prompts', methods=['POST'])
def create_prompt():
    """Create a new prompt log entry"""
    try:
        data = request.get_json()
        now = datetime.now().isoformat()
        prompt = {
            'id': str(uuid.uuid4())[:8],
            'content': data.get('content', ''),
            'tags': data.get('tags', []),
            'created_at': now
        }
        prompts = read_prompts()
        prompts.append(prompt)
        save_prompts(prompts)
        return jsonify({'success': True, 'prompt': prompt})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/prompts/<prompt_id>', methods=['PUT'])
def update_prompt(prompt_id):
    """Update a prompt entry"""
    try:
        data = request.get_json()
        prompts = read_prompts()
        for i, p in enumerate(prompts):
            if p['id'] == prompt_id:
                if 'content' in data:
                    prompts[i]['content'] = data['content']
                if 'tags' in data:
                    prompts[i]['tags'] = data['tags']
                save_prompts(prompts)
                return jsonify({'success': True, 'prompt': prompts[i]})
        return jsonify({'success': False, 'error': 'Not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/prompts/<prompt_id>', methods=['DELETE'])
def delete_prompt(prompt_id):
    """Delete a prompt entry (requires password)"""
    try:
        data = request.get_json() or {}
        password = data.get('password', '')

        # Read config for password
        config = read_config()
        correct_password = config.get('prompt_delete_password', '8888')

        if password != correct_password:
            return jsonify({'success': False, 'error': '密码错误'}), 403

        prompts = read_prompts()
        prompts = [p for p in prompts if p['id'] != prompt_id]
        save_prompts(prompts)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# ============ Prompt Todo ============

def sanitize_content(content):
    """Sanitize content to avoid JSON parsing issues"""
    if not content:
        return content
    # Replace problematic Chinese quotes with safe alternatives
    replacements = {
        '"': '「',  # Chinese left double quote
        '"': '」',  # Chinese right double quote
        ''': '『',  # Chinese left single quote
        ''': '』',  # Chinese right single quote
    }
    for old, new in replacements.items():
        content = content.replace(old, new)
    return content

# ============ 文件锁机制 ============
import threading
import time

# 全局文件锁（进程内线程安全）
_prompt_todo_lock = threading.Lock()
LOCK_FILE = PROMPT_TODO_FILE + '.lock'
LOCK_TIMEOUT = 10  # 秒

def _acquire_file_lock():
    """
    获取文件锁（跨进程安全）
    使用 .lock 文件实现简单的锁机制
    """
    start_time = time.time()
    while True:
        try:
            # 尝试创建锁文件（原子操作）
            fd = os.open(LOCK_FILE, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode())
            os.close(fd)
            return True
        except FileExistsError:
            # 锁文件已存在，检查是否过期
            try:
                lock_age = time.time() - os.path.getmtime(LOCK_FILE)
                if lock_age > LOCK_TIMEOUT:
                    # 锁已过期，强制释放
                    os.remove(LOCK_FILE)
                    print(f"[LOCK] 强制释放过期锁 (已存在 {lock_age:.1f}s)")
                    continue
            except:
                pass

            # 等待重试
            if time.time() - start_time > LOCK_TIMEOUT:
                print("[LOCK] 获取锁超时")
                return False
            time.sleep(0.1)
        except Exception as e:
            print(f"[LOCK] 获取锁失败: {e}")
            return False

def _release_file_lock():
    """释放文件锁"""
    try:
        if os.path.exists(LOCK_FILE):
            os.remove(LOCK_FILE)
    except Exception as e:
        print(f"[LOCK] 释放锁失败: {e}")

def read_prompt_todos():
    """
    读取 prompt-todo.json，带自动恢复机制和文件锁

    防护层级：
    1. 文件锁保护（防止并发读写冲突）
    2. 主文件读取失败 → 尝试从 .backup 恢复
    3. 备份也失败 → 返回 None（阻止后续写入）
    """
    backup_file = PROMPT_TODO_FILE + '.backup'

    with _prompt_todo_lock:  # 线程锁
        if not _acquire_file_lock():  # 进程锁
            print("[ERROR] 无法获取文件锁")
            return None

        try:
            # 第一层：尝试读取主文件
            if os.path.exists(PROMPT_TODO_FILE):
                try:
                    with open(PROMPT_TODO_FILE, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        if isinstance(data, list):
                            return data
                except Exception as e:
                    print(f"[ERROR] 主文件读取失败: {e}")

            # 第二层：主文件失败，尝试从备份恢复
            if os.path.exists(backup_file):
                try:
                    with open(backup_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        if isinstance(data, list):
                            print(f"[RECOVERY] 从备份文件恢复了 {len(data)} 条数据")
                            # 恢复成功，同时修复主文件
                            try:
                                with open(PROMPT_TODO_FILE, 'w', encoding='utf-8') as fw:
                                    json.dump(data, fw, ensure_ascii=False, indent=2)
                                print("[RECOVERY] 主文件已修复")
                            except:
                                pass
                            return data
                except Exception as e:
                    print(f"[ERROR] 备份文件也读取失败: {e}")

            # 两个文件都不存在 = 空列表（正常情况）
            if not os.path.exists(PROMPT_TODO_FILE) and not os.path.exists(backup_file):
                return []

            # 文件存在但都无法读取 = 返回 None（阻止写入）
            print("[CRITICAL] 所有数据文件都无法读取，拒绝后续写入操作")
            return None

        finally:
            _release_file_lock()

def save_prompt_todos(todos, operation='unknown'):
    """
    保存 prompt-todo.json，带多重保护和文件锁

    防护层级：
    1. 文件锁保护（防止并发写入冲突）
    2. 数据校验：防止意外清空
    3. 原子写入：先写临时文件，成功后再替换
    4. 多级备份：保留 .backup 和 .backup2

    参数:
        todos: 要保存的数据
        operation: 操作类型 ('add', 'update', 'delete', 'unknown')
    """
    import shutil
    import tempfile

    backup_file = PROMPT_TODO_FILE + '.backup'
    backup_file2 = PROMPT_TODO_FILE + '.backup2'

    with _prompt_todo_lock:  # 线程锁
        if not _acquire_file_lock():  # 进程锁
            print("[ERROR] 无法获取文件锁，保存被阻止")
            return False

        try:
            # 第一层：数据完整性校验
            if os.path.exists(PROMPT_TODO_FILE):
                try:
                    with open(PROMPT_TODO_FILE, 'r', encoding='utf-8') as f:
                        old_data = json.load(f)
                        old_count = len(old_data) if isinstance(old_data, list) else 0
                except:
                    old_count = 0

                new_count = len(todos) if todos else 0

                # 危险操作检测：数据量骤降（除非是显式删除操作）
                if operation != 'delete' and old_count > 0 and new_count < old_count * 0.5:
                    print(f"[BLOCKED] 危险操作被阻止！原有 {old_count} 条，尝试写入 {new_count} 条")
                    print(f"[BLOCKED] 如需批量删除，请使用 delete 操作")
                    return False

            # 第二层：多级备份（backup2 <- backup <- 主文件）
            try:
                if os.path.exists(backup_file):
                    shutil.copy2(backup_file, backup_file2)
                if os.path.exists(PROMPT_TODO_FILE):
                    shutil.copy2(PROMPT_TODO_FILE, backup_file)
            except Exception as e:
                print(f"[WARNING] 备份创建失败: {e}")

            # 第三层：原子写入（写临时文件 → 验证 → 替换）
            try:
                # 写入临时文件
                dir_name = os.path.dirname(PROMPT_TODO_FILE)
                with tempfile.NamedTemporaryFile(mode='w', suffix='.json', dir=dir_name,
                                                  delete=False, encoding='utf-8') as tf:
                    temp_path = tf.name
                    json.dump(todos, tf, ensure_ascii=False, indent=2)

                # 验证临时文件可读
                with open(temp_path, 'r', encoding='utf-8') as f:
                    verify_data = json.load(f)
                    if len(verify_data) != len(todos):
                        raise Exception("写入验证失败：数据不一致")

                # 验证通过，替换主文件
                if os.path.exists(PROMPT_TODO_FILE):
                    os.remove(PROMPT_TODO_FILE)
                os.rename(temp_path, PROMPT_TODO_FILE)

                print(f"[SAVED] 成功保存 {len(todos)} 条数据 (操作: {operation})")
                return True

            except Exception as e:
                print(f"[ERROR] 保存失败: {e}")
                # 清理临时文件
                if 'temp_path' in locals() and os.path.exists(temp_path):
                    try:
                        os.remove(temp_path)
                    except:
                        pass
                return False

        finally:
            _release_file_lock()

@app.route('/api/prompt-todos', methods=['GET'])
def get_prompt_todos():
    """Get all prompt todos"""
    todos = read_prompt_todos()
    if todos is None:
        return jsonify({'todos': [], 'error': 'Failed to read data file'}), 500
    return jsonify({'todos': todos})

@app.route('/api/prompt-todos', methods=['POST'])
def create_prompt_todo():
    """Create a new prompt todo"""
    try:
        data = request.get_json()
        now = datetime.now().isoformat()
        todo = {
            'id': str(uuid.uuid4())[:8],
            'content': sanitize_content(data.get('content', '')),
            'status': data.get('status', '待执行'),  # 待执行, 待修改完善
            'created_at': now
        }
        todos = read_prompt_todos()
        # 关键修复：如果读取失败，拒绝添加以防止数据丢失
        if todos is None:
            return jsonify({'success': False, 'error': '无法读取数据文件，请检查 prompt-todo.json 格式是否正确'}), 500
        todos.append(todo)
        if not save_prompt_todos(todos, operation='add'):
            return jsonify({'success': False, 'error': '保存失败，请重试'}), 500
        return jsonify({'success': True, 'todo': todo})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/prompt-todos/<todo_id>', methods=['PUT'])
def update_prompt_todo(todo_id):
    """Update a prompt todo (content or status)"""
    try:
        data = request.get_json()
        todos = read_prompt_todos()
        if todos is None:
            return jsonify({'success': False, 'error': '无法读取数据文件'}), 500
        for i, t in enumerate(todos):
            if t['id'] == todo_id:
                if 'content' in data:
                    todos[i]['content'] = sanitize_content(data['content'])
                if 'status' in data:
                    todos[i]['status'] = data['status']
                if not save_prompt_todos(todos, operation='update'):
                    return jsonify({'success': False, 'error': '保存失败'}), 500
                return jsonify({'success': True, 'todo': todos[i]})
        return jsonify({'success': False, 'error': 'Not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/prompt-todos/<todo_id>', methods=['DELETE'])
def delete_prompt_todo(todo_id):
    """Delete a prompt todo"""
    try:
        todos = read_prompt_todos()
        if todos is None:
            return jsonify({'success': False, 'error': '无法读取数据文件'}), 500
        todos = [t for t in todos if t['id'] != todo_id]
        if not save_prompt_todos(todos, operation='delete'):
            return jsonify({'success': False, 'error': '保存失败'}), 500
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/prompt-todos/<todo_id>/complete', methods=['POST'])
def complete_prompt_todo(todo_id):
    """Mark a prompt todo as complete and move it to prompts.json"""
    try:
        data = request.get_json() or {}
        tags = data.get('tags', [])

        todos = read_prompt_todos()
        if todos is None:
            return jsonify({'success': False, 'error': '无法读取数据文件'}), 500
        completed_todo = None

        for t in todos:
            if t['id'] == todo_id:
                completed_todo = t
                break

        if not completed_todo:
            return jsonify({'success': False, 'error': 'Not found'}), 404

        # Remove from todos
        todos = [t for t in todos if t['id'] != todo_id]
        if not save_prompt_todos(todos, operation='delete'):
            return jsonify({'success': False, 'error': '保存失败'}), 500

        # Add to prompts
        now = datetime.now().isoformat()
        prompt = {
            'id': str(uuid.uuid4())[:8],
            'content': completed_todo['content'],
            'tags': tags,
            'created_at': now
        }
        prompts = read_prompts()
        prompts.append(prompt)
        save_prompts(prompts)

        return jsonify({'success': True, 'prompt': prompt})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# ============ Acceptance API ============

ACCEPTANCE_FILE = os.path.join(BASE_DIR, 'docs', 'PENDING_ACCEPTANCE.md')

def parse_acceptance_items():
    """Parse PENDING_ACCEPTANCE.md and extract acceptance items"""
    items = []
    try:
        with open(ACCEPTANCE_FILE, 'r', encoding='utf-8') as f:
            content = f.read()

        # Split by ### acc- headers instead of --- (which conflicts with table separators)
        # Use regex to split by ### acc-XXX: pattern
        pattern = r'(### acc-\d+:[^\n]+)'
        parts = re.split(pattern, content)

        # Process pairs: header + content
        i = 1  # Start from 1, skip content before first header
        while i < len(parts) - 1:
            header = parts[i]
            body = parts[i + 1] if i + 1 < len(parts) else ''

            # Parse header: ### acc-001: 待验收机制
            match = re.match(r'### (acc-\d+):\s*(.+)', header.strip())
            if match:
                item = {
                    'id': match.group(1),
                    'title': match.group(2).strip(),
                    'fields': {},
                    'status': '⏳ 待验收'
                }

                # Parse table rows in body
                for line in body.split('\n'):
                    stripped_line = line.strip()
                    if stripped_line.startswith('| **') and '|' in stripped_line[1:]:
                        table_parts = stripped_line.split('|')
                        if len(table_parts) >= 3:
                            field_name = table_parts[1].strip().replace('**', '')
                            field_value = table_parts[2].strip()
                            item['fields'][field_name] = field_value

                            if field_name == '状态':
                                item['status'] = field_value

                items.append(item)

            i += 2

    except Exception as e:
        print(f"Error parsing acceptance file: {e}")

    return items

def update_acceptance_status(item_id, new_status):
    """Update the status of an acceptance item in the markdown file"""
    try:
        with open(ACCEPTANCE_FILE, 'r', encoding='utf-8') as f:
            content = f.read()

        # Find the section for this item and update its status
        # Pattern: ### acc-XXX: ... then find | **状态** | ... |
        pattern = rf'(### {item_id}:.*?)\| \*\*状态\*\* \| [^|]+ \|'
        replacement = rf'\1| **状态** | {new_status} |'

        new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

        with open(ACCEPTANCE_FILE, 'w', encoding='utf-8') as f:
            f.write(new_content)

        return True
    except Exception as e:
        print(f"Error updating acceptance status: {e}")
        return False

@app.route('/api/acceptance', methods=['GET'])
def get_acceptance_items():
    """Get all acceptance items from PENDING_ACCEPTANCE.md"""
    try:
        items = parse_acceptance_items()
        # Separate pending and completed items
        pending = [i for i in items if '待验收' in i['status']]
        completed = [i for i in items if '已验收' in i['status'] or '已通过' in i['status']]
        return jsonify({
            'success': True,
            'pending': pending,
            'completed': completed,
            'total': len(items)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/acceptance/<item_id>', methods=['PUT'])
def update_acceptance_item(item_id):
    """Update an acceptance item's status"""
    try:
        data = request.get_json()
        action = data.get('action')  # 'approve' or 'reject'
        note = data.get('note', '')

        if action == 'approve':
            new_status = '✅ 已验收'
        elif action == 'reject':
            new_status = f'❌ 有问题'
        else:
            return jsonify({'success': False, 'error': 'Invalid action'})

        if update_acceptance_status(item_id, new_status):
            return jsonify({'success': True, 'new_status': new_status})
        else:
            return jsonify({'success': False, 'error': 'Failed to update file'})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# ============ Prompt Optimization API ============

@app.route('/api/prompt/optimize', methods=['POST'])
def optimize_prompt():
    """Use AI to optimize a prompt for better clarity and structure"""
    import requests

    try:
        data = request.get_json()
        content = data.get('content', '').strip()
        selected_model = data.get('model', 'deepseek')  # 用户选择的模型

        if not content:
            return jsonify({'success': False, 'error': '内容不能为空'})

        if len(content) < 10:
            return jsonify({'success': False, 'error': '内容太短，无法优化'})

        # Read config
        config = read_config()

        # System prompt for optimization
        system_prompt = """你是一个专业的 Prompt 优化专家。用户会给你一段开发任务描述，请你帮助优化它，使其更加清晰、结构化、易于执行。

优化规则：
1. 保持用户原意，不要添加用户没有提到的需求
2. 使用结构化格式：包含【功能名称】、【功能描述】、【验收标准】等
3. 验收标准要具体、可量化
4. 如果原文已经很清晰，只需适当润色
5. 保持简洁，不要过度展开
6. 直接返回优化后的内容，不需要解释或额外说明

优化后的格式示例：
【功能名称】: 简短名称
【功能描述】: 详细描述
【验收标准】:
1. 具体条件1
2. 具体条件2
【技术约束】: （如有）
"""

        user_message = f'请优化以下 Prompt：\n\n{content}'

        # 根据选择的模型调用不同的 API
        if selected_model == 'doubao':
            # 豆包模型（火山引擎）
            doubao_api_key = config.get('doubao_api_key', '')
            doubao_endpoint_id = config.get('doubao_endpoint_id', '')

            if not doubao_api_key or not doubao_endpoint_id:
                return jsonify({
                    'success': False,
                    'error': '豆包模型未配置，请在 config/config.json 中配置 doubao_api_key 和 doubao_endpoint_id'
                })

            headers = {
                'Authorization': f'Bearer {doubao_api_key}',
                'Content-Type': 'application/json'
            }

            payload = {
                'model': doubao_endpoint_id,
                'messages': [
                    {'role': 'system', 'content': system_prompt},
                    {'role': 'user', 'content': user_message}
                ],
                'max_tokens': 2000,
                'temperature': 0.7
            }

            response = requests.post(
                'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
                headers=headers,
                json=payload,
                timeout=30
            )

        else:
            # DeepSeek 或 OpenAI（兼容 OpenAI API 格式）
            ai_config = config.get('ai_models', {})
            model_config = ai_config.get(selected_model, {})

            # 如果选择的模型未配置，尝试回退到其他模型
            if not model_config.get('enabled') or not model_config.get('api_key'):
                # 尝试回退
                for fallback in ['deepseek', 'openai']:
                    if fallback != selected_model:
                        cfg = ai_config.get(fallback, {})
                        if cfg.get('enabled') and cfg.get('api_key'):
                            model_config = cfg
                            break

            if not model_config.get('api_key'):
                return jsonify({
                    'success': False,
                    'error': f'{selected_model} 模型未配置，请在 config/config.json 中配置 api_key 并设置 enabled: true'
                })

            headers = {
                'Authorization': f'Bearer {model_config["api_key"]}',
                'Content-Type': 'application/json'
            }

            payload = {
                'model': model_config.get('model', 'deepseek-chat'),
                'messages': [
                    {'role': 'system', 'content': system_prompt},
                    {'role': 'user', 'content': user_message}
                ],
                'max_tokens': 2000,
                'temperature': 0.7
            }

            api_base = model_config.get('api_base', 'https://api.deepseek.com/v1')
            response = requests.post(
                f'{api_base}/chat/completions',
                headers=headers,
                json=payload,
                timeout=30
            )

        # 处理响应
        if response.status_code == 200:
            result = response.json()
            optimized = result['choices'][0]['message']['content'].strip()
            return jsonify({'success': True, 'optimized': optimized, 'model_used': selected_model})
        else:
            try:
                error_msg = response.json().get('error', {}).get('message', f'HTTP {response.status_code}')
            except:
                error_msg = f'HTTP {response.status_code}'
            return jsonify({'success': False, 'error': f'AI 服务调用失败: {error_msg}'})

    except requests.exceptions.Timeout:
        return jsonify({'success': False, 'error': 'AI 服务响应超时，请稍后重试'})
    except requests.exceptions.RequestException as e:
        return jsonify({'success': False, 'error': f'网络请求失败: {str(e)}'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# ============ AI Chat API ============

import requests

@app.route('/api/chat', methods=['POST'])
def chat():
    """Send message to AI model and get response"""
    try:
        data = request.get_json()
        model_type = data.get('model', 'openai')  # 'openai' or 'deepseek'
        messages = data.get('messages', [])

        if not messages:
            return jsonify({'success': False, 'error': 'No messages provided'})

        config = read_config()
        ai_config = config.get('ai_models', {}).get(model_type, {})

        api_key = ai_config.get('api_key', '')
        api_base = ai_config.get('api_base', '')
        model_name = ai_config.get('model', '')
        enabled = ai_config.get('enabled', False)

        if not enabled or not api_key:
            return jsonify({
                'success': False,
                'error': f'{model_type} 未配置或未启用，请在 config/config.json 中配置 api_key 并设置 enabled: true'
            })

        # Call OpenAI-compatible API (both OpenAI and DeepSeek use this format)
        headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }

        payload = {
            'model': model_name,
            'messages': messages,
            'temperature': 0.7,
            'max_tokens': 2000
        }

        response = requests.post(
            f'{api_base}/chat/completions',
            headers=headers,
            json=payload,
            timeout=60
        )

        if response.status_code != 200:
            error_msg = response.json().get('error', {}).get('message', response.text)
            return jsonify({'success': False, 'error': f'API错误: {error_msg}'})

        result = response.json()
        assistant_message = result['choices'][0]['message']['content']

        return jsonify({
            'success': True,
            'message': assistant_message,
            'model': model_name
        })

    except requests.exceptions.Timeout:
        return jsonify({'success': False, 'error': 'API请求超时，请重试'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/chat/models', methods=['GET'])
def get_chat_models():
    """Get available AI models and their status"""
    config = read_config()
    ai_models = config.get('ai_models', {})

    models_status = {}
    for model_type, model_config in ai_models.items():
        models_status[model_type] = {
            'enabled': model_config.get('enabled', False),
            'configured': bool(model_config.get('api_key', ''))
        }

    return jsonify({'models': models_status})

@app.route('/api/chat/config', methods=['POST'])
def save_chat_config():
    """Save API key for a specific model"""
    try:
        data = request.get_json()
        model_type = data.get('model', '')
        api_key = data.get('api_key', '')

        if not model_type:
            return jsonify({'success': False, 'error': 'Model type required'})

        config = read_config()
        if 'ai_models' not in config:
            config['ai_models'] = {}
        if model_type not in config['ai_models']:
            config['ai_models'][model_type] = {}

        config['ai_models'][model_type]['api_key'] = api_key
        config['ai_models'][model_type]['enabled'] = bool(api_key)

        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# ============ Data Export/Import API ============

@app.route('/api/export', methods=['GET'])
def export_data():
    """Export all user data as JSON"""
    try:
        export_data = {
            'version': '2.0',
            'exported_at': datetime.now().isoformat(),
            'todos': read_todos(),
            'bubbles': read_bubbles(),
            'prompts': read_prompts(),
            'prompt_todos': read_prompt_todos()
        }
        return jsonify(export_data)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/export/csv', methods=['GET'])
def export_todos_csv():
    """Export todos as CSV"""
    try:
        data = read_todos()
        todos = data.get('items', [])
        csv_lines = ['ID,Text,Tab,Quadrant,Completed,Created At,Completed At']
        for todo in todos:
            line = ','.join([
                todo.get('id', ''),
                '"' + todo.get('text', '').replace('"', '""') + '"',
                todo.get('tab', ''),
                todo.get('quadrant', ''),
                str(todo.get('completed', False)),
                todo.get('created_at', ''),
                todo.get('completed_at', '') or ''
            ])
            csv_lines.append(line)
        csv_content = '\n'.join(csv_lines)
        return csv_content, 200, {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename=todos_export.csv'
        }
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/import', methods=['POST'])
def import_data():
    """Import data from JSON backup"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'})

        imported = {'todos': 0, 'bubbles': 0}

        # Import todos (merge, don't replace)
        if 'todos' in data and isinstance(data['todos'], list):
            existing_todos = read_todos()
            existing_ids = {t['id'] for t in existing_todos}
            new_todos = [t for t in data['todos'] if t.get('id') not in existing_ids]
            if new_todos:
                existing_todos.extend(new_todos)
                save_todos(existing_todos)
                imported['todos'] = len(new_todos)

        # Import bubbles (merge, don't replace)
        if 'bubbles' in data and isinstance(data['bubbles'], list):
            existing_bubbles = read_bubbles()
            existing_ids = {b['id'] for b in existing_bubbles}
            new_bubbles = [b for b in data['bubbles'] if b.get('id') not in existing_ids]
            if new_bubbles:
                existing_bubbles.extend(new_bubbles)
                save_bubbles(existing_bubbles)
                imported['bubbles'] = len(new_bubbles)

        return jsonify({
            'success': True,
            'imported': imported,
            'message': f"导入成功: {imported['todos']} 个任务, {imported['bubbles']} 个气泡图"
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# ============ Tags API ============

@app.route('/api/tags', methods=['GET'])
def get_all_tags():
    """Get all unique tags from todos (F401)"""
    try:
        todos = read_todos()
        all_tags = set()
        for item in todos.get('items', []):
            for tag in item.get('tags', []):
                all_tags.add(tag)
        return jsonify({'tags': sorted(list(all_tags))})
    except Exception as e:
        return jsonify({'tags': [], 'error': str(e)})

# ============ Statistics API ============

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get task statistics"""
    try:
        data = read_todos()
        todos = data.get('items', [])
        now = datetime.now()
        today = now.date()

        stats = {
            'total': len(todos),
            'completed': len([t for t in todos if t.get('completed')]),
            'pending': len([t for t in todos if not t.get('completed')]),
            'today': {
                'total': len([t for t in todos if t.get('tab') == 'today']),
                'completed': len([t for t in todos if t.get('tab') == 'today' and t.get('completed')]),
                'pending': len([t for t in todos if t.get('tab') == 'today' and not t.get('completed')])
            },
            'week': {
                'total': len([t for t in todos if t.get('tab') == 'week']),
                'completed': len([t for t in todos if t.get('tab') == 'week' and t.get('completed')]),
                'pending': len([t for t in todos if t.get('tab') == 'week' and not t.get('completed')])
            },
            'month': {
                'total': len([t for t in todos if t.get('tab') == 'month']),
                'completed': len([t for t in todos if t.get('tab') == 'month' and t.get('completed')]),
                'pending': len([t for t in todos if t.get('tab') == 'month' and not t.get('completed')])
            },
            'by_quadrant': {
                'important-urgent': len([t for t in todos if t.get('quadrant') == 'important-urgent' and not t.get('completed')]),
                'important-not-urgent': len([t for t in todos if t.get('quadrant') == 'important-not-urgent' and not t.get('completed')]),
                'not-important-urgent': len([t for t in todos if t.get('quadrant') == 'not-important-urgent' and not t.get('completed')]),
                'not-important-not-urgent': len([t for t in todos if t.get('quadrant') == 'not-important-not-urgent' and not t.get('completed')])
            },
            'completed_today': 0
        }

        # Count completed today
        for t in todos:
            if t.get('completed') and t.get('completed_at'):
                try:
                    completed_date = datetime.fromisoformat(t['completed_at']).date()
                    if completed_date == today:
                        stats['completed_today'] += 1
                except:
                    pass

        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============ Project Stats API ============

import subprocess

@app.route('/api/project/stats')
def project_stats():
    """Get project statistics"""
    try:
        stats = {
            'code': {
                'python': 0,
                'html': 0,
                'css': 0,
                'javascript': 0,
                'total': 0
            },
            'git': {
                'commits': 0,
                'authors': []
            },
            'features': {
                'core': [
                    'Todo Management (Four Quadrant)',
                    'Prompt Log',
                    'Prompt Tasks',
                    'Bubble Charts',
                    'Motivation Quotes',
                    'Games'
                ],
                'games': [
                    'Spider (Territory Capture)',
                    'Breakout (Brick Breaker)',
                    'Zen (Relaxation)',
                    'Tower Defense'
                ],
                'tower_defense': [
                    '7 Tower Types',
                    '7 City Maps',
                    'Skill System',
                    'Achievement System',
                    'Talent Tree',
                    'Daily Challenges',
                    'Endless Mode'
                ]
            },
            'version': '2.0',
            'last_updated': datetime.now().isoformat()
        }

        # Count lines of code
        try:
            for ext, key in [('.py', 'python'), ('.html', 'html'), ('.css', 'css'), ('.js', 'javascript')]:
                count = 0
                for root, dirs, files in os.walk(BASE_DIR):
                    # Skip virtual environments and cache
                    dirs[:] = [d for d in dirs if d not in ['venv', 'env', '__pycache__', 'node_modules', '.git']]
                    for f in files:
                        if f.endswith(ext):
                            try:
                                with open(os.path.join(root, f), 'r', encoding='utf-8', errors='ignore') as file:
                                    count += sum(1 for _ in file)
                            except:
                                pass
                stats['code'][key] = count
            stats['code']['total'] = sum([
                stats['code']['python'],
                stats['code']['html'],
                stats['code']['css'],
                stats['code']['javascript']
            ])
        except Exception as e:
            print(f"Code counting error: {e}")

        # Get git stats
        try:
            result = subprocess.run(
                ['git', 'rev-list', '--count', 'HEAD'],
                capture_output=True, text=True, cwd=BASE_DIR
            )
            if result.returncode == 0:
                stats['git']['commits'] = int(result.stdout.strip())

            result = subprocess.run(
                ['git', 'shortlog', '-sn', '--all'],
                capture_output=True, text=True, cwd=BASE_DIR
            )
            if result.returncode == 0:
                for line in result.stdout.strip().split('\n'):
                    if line.strip():
                        parts = line.strip().split('\t')
                        if len(parts) == 2:
                            stats['git']['authors'].append({
                                'name': parts[1],
                                'commits': int(parts[0].strip())
                            })
        except Exception as e:
            print(f"Git stats error: {e}")

        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/stats')
def stats_page():
    """Project statistics page"""
    return render_platform_template('stats.html')

# ============ Backup/Restore (Checkout) API ============

import shutil
import zipfile

# Files to backup
BACKUP_FILES = {
    'todos.json': TODOS_FILE,
    'prompts.json': PROMPTS_FILE,
    'prompt-todo.json': PROMPT_TODO_FILE,
    'bubbles.json': BUBBLES_FILE,
    'quotes.txt': QUOTES_FILE,
    'motivation.txt': MOTIVATION_FILE,
    'todolist.txt': TODOLIST_FILE
}

@app.route('/api/backup/create', methods=['POST'])
def create_backup():
    """Create a new backup of all data files"""
    try:
        # Generate backup name with timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        data = request.get_json() or {}
        description = data.get('description', '')

        backup_name = f"backup_{timestamp}"
        backup_path = os.path.join(BACKUP_DIR, backup_name)
        os.makedirs(backup_path, exist_ok=True)

        # Copy all data files
        backed_up = []
        for filename, filepath in BACKUP_FILES.items():
            if os.path.exists(filepath):
                dest = os.path.join(backup_path, filename)
                shutil.copy2(filepath, dest)
                backed_up.append(filename)

        # Create metadata file
        metadata = {
            'created_at': datetime.now().isoformat(),
            'description': description,
            'files': backed_up
        }
        with open(os.path.join(backup_path, 'metadata.json'), 'w', encoding='utf-8') as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)

        return jsonify({
            'success': True,
            'backup_name': backup_name,
            'files_backed_up': len(backed_up),
            'created_at': metadata['created_at']
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/backup/list')
def list_backups():
    """List all available backups"""
    try:
        backups = []
        if os.path.exists(BACKUP_DIR):
            for name in os.listdir(BACKUP_DIR):
                backup_path = os.path.join(BACKUP_DIR, name)
                if os.path.isdir(backup_path):
                    metadata_file = os.path.join(backup_path, 'metadata.json')
                    metadata = {}
                    if os.path.exists(metadata_file):
                        with open(metadata_file, 'r', encoding='utf-8') as f:
                            metadata = json.load(f)

                    # Get folder size
                    size = sum(os.path.getsize(os.path.join(backup_path, f))
                              for f in os.listdir(backup_path))

                    backups.append({
                        'name': name,
                        'created_at': metadata.get('created_at', ''),
                        'description': metadata.get('description', ''),
                        'files': metadata.get('files', []),
                        'size': size
                    })

        # Sort by creation time (newest first)
        backups.sort(key=lambda x: x['created_at'], reverse=True)
        return jsonify({'success': True, 'backups': backups})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/backup/restore/<backup_name>', methods=['POST'])
def restore_backup(backup_name):
    """Restore data from a specific backup"""
    try:
        backup_path = os.path.join(BACKUP_DIR, backup_name)
        if not os.path.exists(backup_path):
            return jsonify({'success': False, 'error': 'Backup not found'}), 404

        # First, create an auto-backup of current state
        auto_timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        auto_backup_path = os.path.join(BACKUP_DIR, f"auto_before_restore_{auto_timestamp}")
        os.makedirs(auto_backup_path, exist_ok=True)

        # Backup current files
        for filename, filepath in BACKUP_FILES.items():
            if os.path.exists(filepath):
                shutil.copy2(filepath, os.path.join(auto_backup_path, filename))

        # Auto-backup metadata
        auto_metadata = {
            'created_at': datetime.now().isoformat(),
            'description': f'Auto-backup before restoring from {backup_name}',
            'files': [f for f in BACKUP_FILES.keys() if os.path.exists(BACKUP_FILES[f])]
        }
        with open(os.path.join(auto_backup_path, 'metadata.json'), 'w', encoding='utf-8') as f:
            json.dump(auto_metadata, f, ensure_ascii=False, indent=2)

        # Restore files from backup
        restored = []
        for filename, filepath in BACKUP_FILES.items():
            backup_file = os.path.join(backup_path, filename)
            if os.path.exists(backup_file):
                shutil.copy2(backup_file, filepath)
                restored.append(filename)

        return jsonify({
            'success': True,
            'restored_files': restored,
            'auto_backup': f"auto_before_restore_{auto_timestamp}"
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/backup/delete/<backup_name>', methods=['DELETE'])
def delete_backup(backup_name):
    """Delete a specific backup"""
    try:
        # Don't allow deleting auto backups unless explicitly requested
        data = request.get_json() or {}
        force = data.get('force', False)

        if backup_name.startswith('auto_') and not force:
            return jsonify({
                'success': False,
                'error': 'Auto-backups require force=true to delete'
            }), 400

        backup_path = os.path.join(BACKUP_DIR, backup_name)
        if not os.path.exists(backup_path):
            return jsonify({'success': False, 'error': 'Backup not found'}), 404

        shutil.rmtree(backup_path)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/backup/preview/<backup_name>/<filename>')
def preview_backup_file(backup_name, filename):
    """Preview a specific file from a backup"""
    try:
        backup_path = os.path.join(BACKUP_DIR, backup_name)
        file_path = os.path.join(backup_path, filename)

        if not os.path.exists(file_path):
            return jsonify({'success': False, 'error': 'File not found'}), 404

        # Security check - ensure filename is in allowed list
        if filename not in BACKUP_FILES:
            return jsonify({'success': False, 'error': 'Invalid filename'}), 400

        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Truncate if too large
        if len(content) > 10000:
            content = content[:10000] + '\n... (truncated)'

        return jsonify({
            'success': True,
            'filename': filename,
            'content': content,
            'size': os.path.getsize(file_path)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/backup')
def backup_page():
    """Backup management page"""
    return render_platform_template('backup.html')

# ============ Expense Reimbursement (报销小能手) API ============

COMMON_LOCATIONS = [
    '滑铁卢', '多伦多', '金士顿', '渥太华',
    '温哥华', '蒙特利尔', '埃德蒙顿'
]

# 报销类别系统
EXPENSE_CATEGORIES = {
    '差旅费': {
        'keywords': ['出差', '差旅', '外出', '拜访', '考察'],
        'sub_categories': ['交通', '住宿', '餐饮', '其他']
    },
    '会议费': {
        'keywords': ['会议', '论坛', '峰会', '研讨'],
        'sub_categories': ['场地', '茶歇', '资料', '其他']
    },
    '培训费': {
        'keywords': ['培训', '学习', '课程', '考试', '认证'],
        'sub_categories': ['课程', '教材', '证书', '其他']
    },
    '办公费': {
        'keywords': ['办公', '文具', '设备', '耗材', '采购'],
        'sub_categories': ['文具', '设备', '耗材', '其他']
    },
    '招待费': {
        'keywords': ['招待', '宴请', '接待', '礼品', '商务'],
        'sub_categories': ['餐饮', '礼品', '其他']
    },
    '其他费用': {
        'keywords': [],
        'sub_categories': ['其他']
    }
}

# 报销模板
EXPENSE_TEMPLATES = {
    '出差': {
        'category': '差旅费',
        'sub_categories': ['交通', '住宿', '餐饮'],
        'event_prefix': '出差-',
        'notes_template': '出差事由：\n交通方式：\n住宿安排：'
    },
    '会议': {
        'category': '会议费',
        'sub_categories': ['场地', '茶歇'],
        'event_prefix': '会议-',
        'notes_template': '会议名称：\n参会人数：\n会议地点：'
    },
    '培训': {
        'category': '培训费',
        'sub_categories': ['课程', '教材'],
        'event_prefix': '培训-',
        'notes_template': '培训名称：\n培训机构：\n培训时长：'
    },
    '办公': {
        'category': '办公费',
        'sub_categories': ['文具', '设备'],
        'event_prefix': '采购-',
        'notes_template': '采购物品：\n采购数量：\n用途说明：'
    },
    '招待': {
        'category': '招待费',
        'sub_categories': ['餐饮'],
        'event_prefix': '招待-',
        'notes_template': '招待对象：\n招待事由：\n参与人员：'
    }
}

def guess_expense_category(event_name, location=''):
    """根据事件名称智能推荐报销类别"""
    text = (event_name + ' ' + location).lower()
    for category, info in EXPENSE_CATEGORIES.items():
        for keyword in info['keywords']:
            if keyword in text:
                return category
    return '其他费用'

def generate_expense_summary(expense):
    """生成报销说明文本"""
    category = expense.get('category', '其他费用')
    event = expense.get('event', '未命名')
    location = expense.get('location', '')
    start_date = expense.get('start_date', '')
    end_date = expense.get('end_date', '')
    sub_categories = expense.get('sub_categories', [])
    files = expense.get('files', [])

    # 格式化日期
    date_str = ''
    if start_date:
        date_str = start_date
        if end_date and end_date != start_date:
            date_str += f' 至 {end_date}'

    # 格式化地点
    location_str = f'赴{location}' if location else ''

    # 格式化费用明细
    detail_str = '、'.join([s + '费' for s in sub_categories]) if sub_categories else '相关费用'

    summary = f'''【报销类别】{category}
【报销事由】{date_str}{location_str}{event}
【费用明细】{detail_str}
【凭证数量】{len(files)}份'''

    return summary

def read_expenses():
    """Read all expenses from expenses.json"""
    if not os.path.exists(EXPENSES_FILE):
        return []
    try:
        with open(EXPENSES_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return []

def save_expenses(expenses):
    """Save all expenses to expenses.json"""
    os.makedirs(os.path.dirname(EXPENSES_FILE), exist_ok=True)
    with open(EXPENSES_FILE, 'w', encoding='utf-8') as f:
        json.dump(expenses, f, ensure_ascii=False, indent=2)

def get_expense_folder_name(expense):
    """Generate folder name for expense: 报销事件_地点_起止时间_报销凭证"""
    event = expense.get('event', '未命名').replace(' ', '_').replace('/', '-')
    location = expense.get('location', '未知').replace(' ', '_')
    start = expense.get('start_date', '').replace('-', '')
    end = expense.get('end_date', '').replace('-', '')
    return f"{event}_{location}_{start}-{end}_报销凭证"

@app.route('/api/expenses', methods=['GET'])
def get_expenses():
    """Get all expense items with categories and templates"""
    expenses = read_expenses()
    # Sort by created_at descending
    expenses.sort(key=lambda x: x.get('created_at', ''), reverse=True)
    return jsonify({
        'expenses': expenses,
        'common_locations': COMMON_LOCATIONS,
        'categories': EXPENSE_CATEGORIES,
        'templates': EXPENSE_TEMPLATES
    })

@app.route('/api/expenses', methods=['POST'])
def create_expense():
    """Create a new expense item"""
    try:
        data = request.get_json()
        now = datetime.now().isoformat()

        # 智能推荐类别
        event = data.get('event', '')
        location = data.get('location', '')
        suggested_category = guess_expense_category(event, location)

        expense = {
            'id': str(uuid.uuid4())[:8],
            'event': event,
            'location': location,
            'start_date': data.get('start_date', ''),
            'end_date': data.get('end_date', ''),
            'category': data.get('category', suggested_category),
            'sub_categories': data.get('sub_categories', []),
            'template_used': data.get('template_used', ''),
            'files': [],
            'notes': data.get('notes', ''),
            'created_at': now,
            'updated_at': now
        }

        # Create folder for this expense
        folder_name = get_expense_folder_name(expense)
        folder_path = os.path.join(EXPENSES_DIR, expense['id'] + '_' + folder_name)
        os.makedirs(folder_path, exist_ok=True)
        expense['folder_path'] = folder_path
        expense['folder_name'] = folder_name

        expenses = read_expenses()
        expenses.append(expense)
        save_expenses(expenses)

        return jsonify({'success': True, 'expense': expense})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/expenses/<expense_id>', methods=['GET'])
def get_expense(expense_id):
    """Get a specific expense by ID"""
    expenses = read_expenses()
    for exp in expenses:
        if exp['id'] == expense_id:
            return jsonify({'success': True, 'expense': exp})
    return jsonify({'success': False, 'error': 'Not found'}), 404

@app.route('/api/expenses/<expense_id>', methods=['PUT'])
def update_expense(expense_id):
    """Update an expense item"""
    try:
        data = request.get_json()
        expenses = read_expenses()

        for i, exp in enumerate(expenses):
            if exp['id'] == expense_id:
                # Update fields
                if 'event' in data:
                    expenses[i]['event'] = data['event']
                if 'location' in data:
                    expenses[i]['location'] = data['location']
                if 'start_date' in data:
                    expenses[i]['start_date'] = data['start_date']
                if 'end_date' in data:
                    expenses[i]['end_date'] = data['end_date']
                if 'notes' in data:
                    expenses[i]['notes'] = data['notes']
                # 新增字段支持
                if 'category' in data:
                    expenses[i]['category'] = data['category']
                if 'sub_categories' in data:
                    expenses[i]['sub_categories'] = data['sub_categories']
                if 'template_used' in data:
                    expenses[i]['template_used'] = data['template_used']

                expenses[i]['updated_at'] = datetime.now().isoformat()

                # Update folder name if needed
                new_folder_name = get_expense_folder_name(expenses[i])
                if expenses[i].get('folder_name') != new_folder_name:
                    old_path = expenses[i].get('folder_path', '')
                    new_path = os.path.join(EXPENSES_DIR, expense_id + '_' + new_folder_name)
                    if old_path and os.path.exists(old_path):
                        os.rename(old_path, new_path)
                    expenses[i]['folder_path'] = new_path
                    expenses[i]['folder_name'] = new_folder_name

                save_expenses(expenses)
                return jsonify({'success': True, 'expense': expenses[i]})

        return jsonify({'success': False, 'error': 'Not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/expenses/<expense_id>/summary', methods=['GET'])
def get_expense_summary(expense_id):
    """生成报销说明文本"""
    expenses = read_expenses()
    for exp in expenses:
        if exp['id'] == expense_id:
            summary = generate_expense_summary(exp)
            return jsonify({'success': True, 'summary': summary})
    return jsonify({'success': False, 'error': 'Not found'}), 404

@app.route('/api/expenses/guess-category', methods=['POST'])
def guess_category():
    """根据事件名称推荐类别"""
    data = request.get_json()
    event = data.get('event', '')
    location = data.get('location', '')
    category = guess_expense_category(event, location)
    return jsonify({'success': True, 'category': category})

@app.route('/api/expenses/<expense_id>', methods=['DELETE'])
def delete_expense(expense_id):
    """Delete an expense item and its files"""
    try:
        expenses = read_expenses()
        expense_to_delete = None

        for exp in expenses:
            if exp['id'] == expense_id:
                expense_to_delete = exp
                break

        if not expense_to_delete:
            return jsonify({'success': False, 'error': 'Not found'}), 404

        # Delete the folder
        folder_path = expense_to_delete.get('folder_path', '')
        if folder_path and os.path.exists(folder_path):
            shutil.rmtree(folder_path)

        # Remove from list
        expenses = [e for e in expenses if e['id'] != expense_id]
        save_expenses(expenses)

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/expenses/<expense_id>/upload', methods=['POST'])
def upload_expense_file(expense_id):
    """Upload a file to an expense item"""
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400

        expenses = read_expenses()
        expense = None
        expense_idx = -1

        for i, exp in enumerate(expenses):
            if exp['id'] == expense_id:
                expense = exp
                expense_idx = i
                break

        if not expense:
            return jsonify({'success': False, 'error': 'Expense not found'}), 404

        # Ensure folder exists
        folder_path = expense.get('folder_path', '')
        if not folder_path:
            folder_name = get_expense_folder_name(expense)
            folder_path = os.path.join(EXPENSES_DIR, expense_id + '_' + folder_name)
            os.makedirs(folder_path, exist_ok=True)
            expenses[expense_idx]['folder_path'] = folder_path
            expenses[expense_idx]['folder_name'] = folder_name

        # Save file
        filename = file.filename
        # Make filename safe
        safe_filename = "".join(c for c in filename if c.isalnum() or c in '._- ').strip()
        if not safe_filename:
            safe_filename = f"file_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        file_path = os.path.join(folder_path, safe_filename)

        # Handle duplicate filenames
        base, ext = os.path.splitext(safe_filename)
        counter = 1
        while os.path.exists(file_path):
            safe_filename = f"{base}_{counter}{ext}"
            file_path = os.path.join(folder_path, safe_filename)
            counter += 1

        file.save(file_path)

        # Analyze file
        file_info = analyze_expense_file(file_path, safe_filename)

        # Add to expense files list
        if 'files' not in expenses[expense_idx]:
            expenses[expense_idx]['files'] = []
        expenses[expense_idx]['files'].append(file_info)
        expenses[expense_idx]['updated_at'] = datetime.now().isoformat()

        save_expenses(expenses)

        return jsonify({'success': True, 'file': file_info})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

def analyze_expense_file(file_path, filename):
    """Analyze expense file and extract useful info"""
    file_size = os.path.getsize(file_path)
    ext = os.path.splitext(filename)[1].lower()

    file_info = {
        'id': str(uuid.uuid4())[:8],
        'filename': filename,
        'path': file_path,
        'size': file_size,
        'size_readable': format_file_size(file_size),
        'type': ext[1:] if ext else 'unknown',
        'uploaded_at': datetime.now().isoformat(),
        'analysis': {}
    }

    # Basic analysis based on file type
    if ext in ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']:
        file_info['analysis']['category'] = '图片凭证'
        file_info['analysis']['suggestion'] = '收据/发票截图'
    elif ext == '.pdf':
        file_info['analysis']['category'] = 'PDF文档'
        file_info['analysis']['suggestion'] = '发票或报销单'
    elif ext in ['.doc', '.docx']:
        file_info['analysis']['category'] = 'Word文档'
        file_info['analysis']['suggestion'] = '报销申请表'
    elif ext in ['.xls', '.xlsx', '.csv']:
        file_info['analysis']['category'] = '表格文件'
        file_info['analysis']['suggestion'] = '费用明细表'
    else:
        file_info['analysis']['category'] = '其他文件'
        file_info['analysis']['suggestion'] = '请确认文件内容'

    return file_info

def format_file_size(size):
    """Format file size in human readable format"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"

@app.route('/api/expenses/<expense_id>/files/<file_id>', methods=['DELETE'])
def delete_expense_file(expense_id, file_id):
    """Delete a file from an expense item"""
    try:
        expenses = read_expenses()

        for i, exp in enumerate(expenses):
            if exp['id'] == expense_id:
                files = exp.get('files', [])
                file_to_delete = None

                for f in files:
                    if f['id'] == file_id:
                        file_to_delete = f
                        break

                if not file_to_delete:
                    return jsonify({'success': False, 'error': 'File not found'}), 404

                # Delete physical file
                file_path = file_to_delete.get('path', '')
                if file_path and os.path.exists(file_path):
                    os.remove(file_path)

                # Remove from list
                expenses[i]['files'] = [f for f in files if f['id'] != file_id]
                expenses[i]['updated_at'] = datetime.now().isoformat()
                save_expenses(expenses)

                return jsonify({'success': True})

        return jsonify({'success': False, 'error': 'Expense not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/expenses/locations')
def get_expense_locations():
    """Get common locations and recent locations from expenses"""
    expenses = read_expenses()

    # Count location usage
    location_counts = {}
    for exp in expenses:
        loc = exp.get('location', '')
        if loc:
            location_counts[loc] = location_counts.get(loc, 0) + 1

    # Sort by usage
    recent_locations = sorted(location_counts.keys(),
                             key=lambda x: location_counts[x],
                             reverse=True)[:10]

    return jsonify({
        'common_locations': COMMON_LOCATIONS,
        'recent_locations': recent_locations
    })

@app.route('/api/expenses/<expense_id>/file/<file_id>/view')
def view_expense_file(expense_id, file_id):
    """Serve an expense file for viewing"""
    expenses = read_expenses()

    for exp in expenses:
        if exp['id'] == expense_id:
            for f in exp.get('files', []):
                if f['id'] == file_id:
                    file_path = f.get('path', '')
                    if file_path and os.path.exists(file_path):
                        return send_from_directory(
                            os.path.dirname(file_path),
                            os.path.basename(file_path)
                        )

    return jsonify({'success': False, 'error': 'File not found'}), 404

# ============ PPT Generator API ============

def read_ppts():
    """Read all PPT data from ppt.json"""
    if not os.path.exists(PPT_FILE):
        return []
    try:
        with open(PPT_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return []

def save_ppts(ppts):
    """Save PPT data to ppt.json"""
    with open(PPT_FILE, 'w', encoding='utf-8') as f:
        json.dump(ppts, f, ensure_ascii=False, indent=2)

def find_ppt(ppt_id):
    """Find a PPT by ID"""
    ppts = read_ppts()
    for p in ppts:
        if p['id'] == ppt_id:
            return p
    return None

@app.route('/api/ppt', methods=['GET'])
def get_ppts():
    """Get all saved PPTs (list view)"""
    ppts = read_ppts()
    # Return simplified list for sidebar
    result = [{
        'id': p['id'],
        'title': p['title'],
        'template': p.get('template', 'dark-statement'),
        'created_at': p['created_at'],
        'updated_at': p['updated_at']
    } for p in ppts]
    # Sort by updated_at descending
    result.sort(key=lambda x: x['updated_at'], reverse=True)
    return jsonify({'ppts': result})

@app.route('/api/ppt/<ppt_id>', methods=['GET'])
def get_ppt(ppt_id):
    """Get a specific PPT by ID"""
    ppt = find_ppt(ppt_id)
    if ppt:
        return jsonify({'success': True, 'ppt': ppt})
    return jsonify({'success': False, 'error': 'Not found'}), 404

@app.route('/api/ppt', methods=['POST'])
def create_ppt():
    """Create a new PPT"""
    try:
        data = request.get_json()
        now = datetime.now().isoformat()
        ppt = {
            'id': str(uuid.uuid4())[:8],
            'title': data.get('title', '未命名 PPT'),
            'template': data.get('template', 'dark-statement'),
            'main_title': data.get('main_title', ''),
            'subtitle': data.get('subtitle', ''),
            'content_blocks': data.get('content_blocks', []),
            'footer': data.get('footer', ''),
            'created_at': now,
            'updated_at': now
        }
        ppts = read_ppts()
        ppts.append(ppt)
        save_ppts(ppts)
        return jsonify({'success': True, 'ppt': ppt})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/ppt/<ppt_id>', methods=['PUT'])
def update_ppt(ppt_id):
    """Update an existing PPT"""
    try:
        data = request.get_json()
        ppts = read_ppts()
        for i, p in enumerate(ppts):
            if p['id'] == ppt_id:
                ppts[i]['title'] = data.get('title', p['title'])
                ppts[i]['template'] = data.get('template', p.get('template', 'dark-statement'))
                ppts[i]['main_title'] = data.get('main_title', p.get('main_title', ''))
                ppts[i]['subtitle'] = data.get('subtitle', p.get('subtitle', ''))
                ppts[i]['content_blocks'] = data.get('content_blocks', p.get('content_blocks', []))
                ppts[i]['footer'] = data.get('footer', p.get('footer', ''))
                ppts[i]['updated_at'] = datetime.now().isoformat()
                save_ppts(ppts)
                return jsonify({'success': True, 'ppt': ppts[i]})
        return jsonify({'success': False, 'error': 'Not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/ppt/<ppt_id>', methods=['DELETE'])
def delete_ppt(ppt_id):
    """Delete a PPT"""
    try:
        ppts = read_ppts()
        ppts = [p for p in ppts if p['id'] != ppt_id]
        save_ppts(ppts)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/ppt/<ppt_id>/export', methods=['GET'])
def export_ppt(ppt_id):
    """Export PPT as HTML"""
    ppt = find_ppt(ppt_id)
    if not ppt:
        return jsonify({'success': False, 'error': 'Not found'}), 404

    # Generate HTML based on template
    html = generate_ppt_html(ppt)
    return jsonify({'success': True, 'html': html})

def generate_ppt_html(ppt):
    """Generate HTML for a PPT based on its template"""
    template = ppt.get('template', 'dark-statement')
    main_title = ppt.get('main_title', '')
    subtitle = ppt.get('subtitle', '')
    content_blocks = ppt.get('content_blocks', [])
    footer = ppt.get('footer', '')

    # Build content blocks HTML
    blocks_html = ''
    for block in content_blocks:
        block_title = block.get('title', '')
        block_type = block.get('type', 'text')
        block_content = block.get('content', '')

        if block_type == 'highlight':
            blocks_html += f'''
            <div class="highlight-box">
                <h3>{block_title}</h3>
                <p>{block_content}</p>
            </div>
            '''
        elif block_type == 'list':
            items = block_content.split('\\n') if block_content else []
            items_html = ''.join([f'<li>{item.strip()}</li>' for item in items if item.strip()])
            blocks_html += f'''
            <div class="list-block">
                <h3>{block_title}</h3>
                <ul>{items_html}</ul>
            </div>
            '''
        else:
            blocks_html += f'''
            <div class="text-block">
                <h3>{block_title}</h3>
                <p>{block_content}</p>
            </div>
            '''

    # Generate full HTML
    html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{ppt.get('title', 'PPT')}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: #fff;
        }}
        .slide {{
            width: 1280px;
            height: 720px;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            padding: 50px 60px;
            display: flex;
            flex-direction: column;
        }}
        .header {{ margin-bottom: 40px; }}
        .main-title {{
            font-size: 42px;
            font-weight: 700;
            background: linear-gradient(90deg, #fff 0%, #4facfe 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 12px;
        }}
        .subtitle {{
            font-size: 18px;
            color: rgba(255,255,255,0.6);
        }}
        .content {{ flex: 1; display: flex; flex-direction: column; gap: 20px; }}
        .highlight-box {{
            background: rgba(233, 69, 96, 0.15);
            border-left: 4px solid #e94560;
            padding: 20px 24px;
            border-radius: 0 8px 8px 0;
        }}
        .highlight-box h3 {{ color: #e94560; font-size: 16px; margin-bottom: 8px; }}
        .highlight-box p {{ color: #fff; font-size: 18px; line-height: 1.6; }}
        .text-block h3 {{ color: #4facfe; font-size: 16px; margin-bottom: 8px; }}
        .text-block p {{ color: rgba(255,255,255,0.85); font-size: 16px; line-height: 1.6; }}
        .list-block h3 {{ color: #4facfe; font-size: 16px; margin-bottom: 8px; }}
        .list-block ul {{ list-style: none; }}
        .list-block li {{
            color: rgba(255,255,255,0.85);
            font-size: 15px;
            line-height: 1.8;
            padding-left: 20px;
            position: relative;
        }}
        .list-block li::before {{
            content: '•';
            position: absolute;
            left: 0;
            color: #4facfe;
        }}
        .footer {{
            margin-top: auto;
            padding-top: 20px;
            border-top: 1px solid rgba(255,255,255,0.1);
            font-size: 14px;
            color: rgba(255,255,255,0.5);
            font-style: italic;
        }}
    </style>
</head>
<body>
    <div class="slide">
        <div class="header">
            <h1 class="main-title">{main_title}</h1>
            <p class="subtitle">{subtitle}</p>
        </div>
        <div class="content">
            {blocks_html}
        </div>
        <div class="footer">{footer}</div>
    </div>
</body>
</html>'''
    return html

# ============ PPT翻译工具 API ============

PPT_TRANSLATOR_DIR = os.path.join(PRIVATE_DATA_DIR, 'ppt-translator')
os.makedirs(PPT_TRANSLATOR_DIR, exist_ok=True)

@app.route('/api/ppt-translator/upload', methods=['POST'])
def ppt_translator_upload():
    """上传PPT/PDF文件并转换为图片"""
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': '没有上传文件'})

    file = request.files['file']
    if not file.filename:
        return jsonify({'success': False, 'error': '文件名为空'})

    filename = file.filename.lower()
    file_id = uuid.uuid4().hex[:8]
    upload_dir = os.path.join(PPT_TRANSLATOR_DIR, file_id)
    os.makedirs(upload_dir, exist_ok=True)

    try:
        if filename.endswith('.pdf'):
            # 处理PDF文件
            file_path = os.path.join(upload_dir, 'source.pdf')
            file.save(file_path)
            pages = convert_pdf_to_images(file_path, upload_dir)
        elif filename.endswith(('.pptx', '.ppt')):
            # 处理PPT文件 - 暂时返回提示需要先转PDF
            return jsonify({
                'success': False,
                'error': '暂不支持直接上传PPT，请先将PPT导出为PDF再上传'
            })
        else:
            return jsonify({'success': False, 'error': '不支持的文件格式'})

        if not pages:
            return jsonify({'success': False, 'error': '无法解析文件'})

        return jsonify({
            'success': True,
            'file_id': file_id,
            'pages': pages,
            'total': len(pages)
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

def convert_pdf_to_images(pdf_path, output_dir):
    """将PDF转换为图片（base64格式）"""
    pages = []

    try:
        # 尝试使用 PyMuPDF (fitz)
        import fitz  # PyMuPDF
        doc = fitz.open(pdf_path)

        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            # 设置缩放比例以获得更好的质量
            zoom = 2.0
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat)

            # 转换为base64
            img_data = pix.tobytes("png")
            import base64
            b64_data = base64.b64encode(img_data).decode('utf-8')
            pages.append(f"data:image/png;base64,{b64_data}")

        doc.close()
        return pages

    except ImportError:
        # 如果没有 PyMuPDF，尝试使用 pdf2image
        try:
            from pdf2image import convert_from_path
            import io
            import base64

            images = convert_from_path(pdf_path, dpi=150)

            for img in images:
                buffer = io.BytesIO()
                img.save(buffer, format='PNG')
                b64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')
                pages.append(f"data:image/png;base64,{b64_data}")

            return pages

        except ImportError:
            # 都没有的话返回空
            return []

@app.route('/api/ppt-translator/test-api', methods=['POST'])
def ppt_translator_test_api():
    """测试 API Key 是否有效"""
    import urllib.request
    import urllib.error

    data = request.get_json()
    provider = data.get('provider', 'deepseek')
    api_key = data.get('api_key', '')

    if not api_key:
        return jsonify({'success': False, 'error': '请提供 API Key'})

    try:
        if provider == 'deepseek':
            api_url = 'https://api.deepseek.com/v1/chat/completions'
            model = 'deepseek-chat'
        else:
            api_url = 'https://api.openai.com/v1/chat/completions'
            model = 'gpt-4o-mini'

        # 发送一个简单的测试请求
        request_data = json.dumps({
            "model": model,
            "messages": [{"role": "user", "content": "Hi"}],
            "max_tokens": 5
        }).encode('utf-8')

        req = urllib.request.Request(
            api_url,
            data=request_data,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {api_key}'
            }
        )

        with urllib.request.urlopen(req, timeout=15) as response:
            result = json.loads(response.read().decode('utf-8'))
            # 如果能成功获取响应，说明 API Key 有效
            if result.get('choices'):
                return jsonify({'success': True})
            else:
                return jsonify({'success': False, 'error': '响应异常'})

    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8') if e.fp else ''
        if e.code == 401:
            return jsonify({'success': False, 'error': 'API Key 无效或已过期'})
        elif e.code == 403:
            return jsonify({'success': False, 'error': '访问被拒绝，请检查 API Key 权限'})
        elif e.code == 429:
            return jsonify({'success': False, 'error': '请求过于频繁，请稍后再试'})
        else:
            return jsonify({'success': False, 'error': f'HTTP 错误 {e.code}'})
    except urllib.error.URLError as e:
        return jsonify({'success': False, 'error': f'网络错误: {str(e.reason)}'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/ppt-translator/settings', methods=['POST'])
def ppt_translator_settings():
    """保存翻译设置"""
    data = request.get_json()

    # 读取现有配置并更新
    config = read_config()

    # DeepSeek 配置
    deepseek_key = data.get('deepseek_api_key', '')
    if deepseek_key:
        config['deepseek_api_key'] = deepseek_key

    # 豆包配置
    doubao_key = data.get('doubao_api_key', '')
    doubao_endpoint = data.get('doubao_endpoint_id', '')
    if doubao_key:
        config['doubao_api_key'] = doubao_key
    if doubao_endpoint:
        config['doubao_endpoint_id'] = doubao_endpoint

    # 保存配置
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)

    return jsonify({'success': True})

def ocr_with_ocrspace(image_base64):
    """使用免费的 OCR.space API 识别图片文字"""
    import urllib.request
    import urllib.parse

    # OCR.space 免费 API
    # 免费额度: 25000次/月
    api_url = 'https://api.ocr.space/parse/image'

    # 移除 data:image/png;base64, 前缀
    if ',' in image_base64:
        image_base64 = image_base64.split(',')[1]

    # 构建表单数据
    payload = {
        'apikey': 'helloworld',  # OCR.space 免费 API key
        'base64Image': f'data:image/png;base64,{image_base64}',
        'language': 'chs',  # 中文简体 + 英文
        'isOverlayRequired': 'false',
        'detectOrientation': 'true',
        'scale': 'true',
        'OCREngine': '2'  # Engine 2 更适合中文
    }

    data = urllib.parse.urlencode(payload).encode('utf-8')

    req = urllib.request.Request(api_url, data=data)
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')

    with urllib.request.urlopen(req, timeout=30) as response:
        result = json.loads(response.read().decode('utf-8'))

        if result.get('IsErroredOnProcessing'):
            error_msg = result.get('ErrorMessage', ['OCR识别失败'])[0]
            return None, error_msg

        parsed_results = result.get('ParsedResults', [])
        if not parsed_results:
            return None, '未识别到文字'

        text = parsed_results[0].get('ParsedText', '').strip()
        if not text:
            return None, '未识别到文字'

        return text, None

def translate_with_deepseek(text, target_lang, api_key):
    """使用 DeepSeek 翻译文字"""
    import urllib.request

    lang_names = {'zh': '中文', 'en': 'English', 'ja': '日本語', 'ko': '한국어'}
    target_lang_name = lang_names.get(target_lang, '中文')

    prompt = f"""请将以下文字翻译成{target_lang_name}，只返回翻译结果，不要包含任何解释：

{text}"""

    request_data = json.dumps({
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 1000
    }).encode('utf-8')

    req = urllib.request.Request(
        'https://api.deepseek.com/v1/chat/completions',
        data=request_data,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_key}'
        }
    )

    with urllib.request.urlopen(req, timeout=30) as response:
        result = json.loads(response.read().decode('utf-8'))
        return result.get('choices', [{}])[0].get('message', {}).get('content', '').strip()

def translate_with_doubao(text, target_lang, api_key, endpoint_id):
    """使用豆包(火山引擎)翻译文字"""
    import urllib.request

    lang_names = {'zh': '中文', 'en': 'English', 'ja': '日本語', 'ko': '한국어'}
    target_lang_name = lang_names.get(target_lang, '中文')

    prompt = f"""请将以下文字翻译成{target_lang_name}，只返回翻译结果，不要包含任何解释：

{text}"""

    # 火山引擎豆包 API
    api_url = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

    request_data = json.dumps({
        "model": endpoint_id,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 1000
    }).encode('utf-8')

    req = urllib.request.Request(
        api_url,
        data=request_data,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_key}'
        }
    )

    with urllib.request.urlopen(req, timeout=30) as response:
        result = json.loads(response.read().decode('utf-8'))
        return result.get('choices', [{}])[0].get('message', {}).get('content', '').strip()

def ocr_with_doubao_vision(image_base64, api_key, endpoint_id):
    """使用豆包多模态模型识别图片文字"""
    import urllib.request

    api_url = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

    # 确保 base64 格式正确
    if not image_base64.startswith('data:'):
        image_base64 = f'data:image/png;base64,{image_base64}'

    request_data = json.dumps({
        "model": endpoint_id,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "请识别这张图片中的所有文字，只返回识别出的文字内容，不要添加任何解释或格式。"},
                    {"type": "image_url", "image_url": {"url": image_base64}}
                ]
            }
        ],
        "max_tokens": 1000
    }).encode('utf-8')

    req = urllib.request.Request(
        api_url,
        data=request_data,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_key}'
        }
    )

    with urllib.request.urlopen(req, timeout=30) as response:
        result = json.loads(response.read().decode('utf-8'))
        text = result.get('choices', [{}])[0].get('message', {}).get('content', '').strip()
        return text, None

def ocr_translate_with_doubao_vision(image_base64, target_lang, api_key, endpoint_id):
    """使用豆包多模态模型一步完成 OCR + 翻译"""
    import urllib.request

    lang_names = {'zh': '中文', 'en': 'English', 'ja': '日本語', 'ko': '한국어'}
    target_lang_name = lang_names.get(target_lang, '中文')

    api_url = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

    if not image_base64.startswith('data:'):
        image_base64 = f'data:image/png;base64,{image_base64}'

    prompt = f"""请完成以下任务：
1. 识别图片中的所有文字
2. 将识别出的文字翻译成{target_lang_name}

请按以下格式返回：
【原文】
(识别出的原文)

【译文】
(翻译后的文字)"""

    request_data = json.dumps({
        "model": endpoint_id,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": image_base64}}
                ]
            }
        ],
        "max_tokens": 2000
    }).encode('utf-8')

    req = urllib.request.Request(
        api_url,
        data=request_data,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_key}'
        }
    )

    with urllib.request.urlopen(req, timeout=60) as response:
        result = json.loads(response.read().decode('utf-8'))
        content = result.get('choices', [{}])[0].get('message', {}).get('content', '').strip()

        # 解析原文和译文
        original = ''
        translation = ''

        if '【原文】' in content and '【译文】' in content:
            parts = content.split('【译文】')
            original = parts[0].replace('【原文】', '').strip()
            translation = parts[1].strip() if len(parts) > 1 else ''
        else:
            translation = content

        return original, translation

@app.route('/api/ppt-translator/ocr', methods=['POST'])
def ppt_translator_ocr_only():
    """OCR识别截图 - 支持免费OCR.space或豆包多模态"""
    data = request.get_json()
    image_data = data.get('image', '')
    model = data.get('model', 'free')  # 'free' 或 'doubao'

    if not image_data:
        return jsonify({'success': False, 'error': '没有图片数据'})

    try:
        if model == 'doubao':
            # 使用豆包多模态模型
            config = read_config()
            api_key = config.get('doubao_api_key')
            endpoint_id = config.get('doubao_endpoint_id')

            if not api_key or not endpoint_id:
                return jsonify({
                    'success': False,
                    'error': '未配置豆包 API，请在设置中配置'
                })

            ocr_text, ocr_error = ocr_with_doubao_vision(image_data, api_key, endpoint_id)
        else:
            # 使用免费 OCR.space
            ocr_text, ocr_error = ocr_with_ocrspace(image_data)

        if ocr_error:
            return jsonify({
                'success': False,
                'error': ocr_error
            })

        return jsonify({
            'success': True,
            'text': ocr_text
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/api/ppt-translator/translate', methods=['POST'])
def ppt_translator_translate_only():
    """翻译文字 - 支持 DeepSeek 和豆包"""
    data = request.get_json()
    text = data.get('text', '').strip()
    model = data.get('model', 'deepseek')  # 'deepseek' 或 'doubao'
    target_lang = data.get('target_lang', 'zh')

    if not text:
        return jsonify({'success': False, 'error': '没有要翻译的文字'})

    try:
        config = read_config()

        if model == 'doubao':
            # 使用豆包模型
            api_key = config.get('doubao_api_key')
            endpoint_id = config.get('doubao_endpoint_id', 'ep-20241201000000-xxxxx')

            if not api_key:
                return jsonify({
                    'success': False,
                    'error': '未配置豆包 API Key，请在设置中配置'
                })

            translation = translate_with_doubao(text, target_lang, api_key, endpoint_id)
        else:
            # 使用 DeepSeek 模型
            api_key = config.get('deepseek_api_key')

            if not api_key:
                return jsonify({
                    'success': False,
                    'error': '未配置 DeepSeek API密钥，请点击右上角⚙️设置'
                })

            translation = translate_with_deepseek(text, target_lang, api_key)

        return jsonify({
            'success': True,
            'translation': translation
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/api/ppt-translator/doubao-direct', methods=['POST'])
def ppt_translator_doubao_direct():
    """豆包直接翻译图片 - 一步完成 OCR + 翻译"""
    data = request.get_json()
    image_data = data.get('image', '')
    target_lang = data.get('target_lang', 'zh')

    if not image_data:
        return jsonify({'success': False, 'error': '没有图片数据'})

    try:
        config = read_config()
        api_key = config.get('doubao_api_key')
        endpoint_id = config.get('doubao_endpoint_id')

        if not api_key or not endpoint_id:
            return jsonify({
                'success': False,
                'error': '未配置豆包 API，请在设置中配置'
            })

        original, translation = ocr_translate_with_doubao_vision(
            image_data, target_lang, api_key, endpoint_id
        )

        return jsonify({
            'success': True,
            'original_text': original,
            'translation': translation
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/api/ppt-translator/ocr-translate', methods=['POST'])
def ppt_translator_ocr_and_translate():
    """OCR识别并翻译截图 - 一步完成（保留兼容）"""
    data = request.get_json()
    image_data = data.get('image', '')

    if not image_data:
        return jsonify({'success': False, 'error': '没有图片数据'})

    try:
        config = read_config()
        api_key = config.get('deepseek_api_key')
        target_lang = config.get('translator_target_lang', 'zh')

        if not api_key:
            return jsonify({
                'success': False,
                'error': '未配置 DeepSeek API密钥',
                'translation': ''
            })

        ocr_text, ocr_error = ocr_with_ocrspace(image_data)

        if ocr_error:
            return jsonify({
                'success': False,
                'error': f'OCR识别失败: {ocr_error}',
                'translation': ''
            })

        translation = translate_with_deepseek(ocr_text, target_lang, api_key)

        return jsonify({
            'success': True,
            'original_text': ocr_text,
            'translation': translation
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'translation': ''
        })

@app.route('/api/ppt-translator/export', methods=['POST'])
def ppt_translator_export():
    """导出翻译后的PDF"""
    data = request.get_json()
    translations = data.get('translations', [])
    pages = data.get('pages', [])

    if not pages:
        return jsonify({'success': False, 'error': '没有页面数据'})

    try:
        from io import BytesIO
        import base64

        # 尝试使用 reportlab 或 PIL 创建PDF
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.pdfgen import canvas
            from reportlab.lib.utils import ImageReader
            from PIL import Image

            buffer = BytesIO()
            c = canvas.Canvas(buffer, pagesize=A4)
            width, height = A4

            for i, page_data in enumerate(pages):
                # 解码base64图片
                if page_data.startswith('data:image'):
                    img_data = page_data.split(',')[1]
                else:
                    img_data = page_data

                img_bytes = base64.b64decode(img_data)
                img = Image.open(BytesIO(img_bytes))

                # 计算缩放比例
                img_width, img_height = img.size
                scale = min(width / img_width, height / img_height) * 0.95
                new_width = img_width * scale
                new_height = img_height * scale

                # 居中绘制
                x = (width - new_width) / 2
                y = (height - new_height) / 2

                c.drawImage(ImageReader(img), x, y, width=new_width, height=new_height)

                # 添加翻译文本覆盖
                page_translations = [t for t in translations if t.get('page') == i + 1]
                for t in page_translations:
                    tx = x + (t['x'] / img_width) * new_width
                    ty = height - (y + (t['y'] / img_height) * new_height) - 20
                    c.setFont("Helvetica", 10)
                    c.drawString(tx, ty, t.get('text', '')[:50])

                c.showPage()

            c.save()
            buffer.seek(0)

            from flask import Response
            return Response(
                buffer.getvalue(),
                mimetype='application/pdf',
                headers={'Content-Disposition': 'attachment;filename=translated.pdf'}
            )

        except ImportError:
            return jsonify({
                'success': False,
                'error': '缺少必要的库（reportlab/PIL），无法导出PDF'
            })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


# ============ 鸿蒙手机试验田 API ============

HARMONYOS_LAB_FILE = os.path.join(DATA_DIR, 'harmonyos-lab.json')
HARMONYOS_LAB_DIR = os.path.join(BASE_DIR, 'harmonyos-lab')

def read_harmonyos_lab_data():
    """读取鸿蒙试验田数据"""
    if not os.path.exists(HARMONYOS_LAB_FILE):
        return {
            "runtime": {"currentApp": None, "runningApps": []},
            "installedApps": [],
            "history": [],
            "logs": []
        }
    try:
        with open(HARMONYOS_LAB_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return {"installedApps": [], "logs": []}

def write_harmonyos_lab_data(data):
    """保存鸿蒙试验田数据"""
    with open(HARMONYOS_LAB_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

@app.route('/api/harmonyos-lab/data', methods=['GET'])
def get_harmonyos_lab_data():
    """获取鸿蒙试验田数据"""
    data = read_harmonyos_lab_data()
    return jsonify(data)

@app.route('/api/harmonyos-lab/data', methods=['POST'])
def save_harmonyos_lab_data():
    """保存鸿蒙试验田数据"""
    data = request.get_json()
    existing = read_harmonyos_lab_data()
    existing.update(data)
    write_harmonyos_lab_data(existing)
    return jsonify({'success': True})

@app.route('/api/harmonyos-lab/run-script', methods=['POST'])
def run_harmonyos_lab_script():
    """运行脚本"""
    data = request.get_json()
    script = data.get('script', '')

    if not script.strip():
        return jsonify({'success': False, 'error': '脚本内容为空'})

    try:
        # 导入脚本执行模块
        import sys
        sys.path.insert(0, HARMONYOS_LAB_DIR)

        from scripts import execute_script
        result = execute_script(script)

        return jsonify(result)

    except ImportError as e:
        # 如果模块未找到，使用简化的执行方式
        log = []

        def safe_print(*args):
            log.append(' '.join(str(a) for a in args))

        safe_globals = {
            'print': safe_print,
            'device': {'get_info': lambda: {'model': 'HarmonyOS Phone'}},
            'ui': {'click': lambda x, y: f'click({x}, {y})'},
        }

        try:
            exec(script, safe_globals)
            return jsonify({'success': True, 'log': log})
        except Exception as ex:
            return jsonify({'success': False, 'error': str(ex), 'log': log})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/harmonyos-lab/apps', methods=['GET'])
def list_harmonyos_lab_apps():
    """列出所有应用"""
    data = read_harmonyos_lab_data()
    return jsonify({'apps': data.get('installedApps', [])})

@app.route('/api/harmonyos-lab/apps', methods=['POST'])
def create_harmonyos_lab_app():
    """创建新应用"""
    app_data = request.get_json()
    data = read_harmonyos_lab_data()

    new_app = {
        'id': app_data.get('id', f'app_{int(datetime.now().timestamp() * 1000)}'),
        'name': app_data.get('name', '未命名应用'),
        'icon': app_data.get('icon', '📱'),
        'version': app_data.get('version', '1.0.0'),
        'content': app_data.get('content', ''),
        'created_at': datetime.now().isoformat()
    }

    data['installedApps'].append(new_app)
    write_harmonyos_lab_data(data)

    return jsonify({'success': True, 'app': new_app})

@app.route('/api/harmonyos-lab/apps/<app_id>', methods=['DELETE'])
def delete_harmonyos_lab_app(app_id):
    """删除应用"""
    data = read_harmonyos_lab_data()
    data['installedApps'] = [a for a in data.get('installedApps', []) if a.get('id') != app_id]
    write_harmonyos_lab_data(data)
    return jsonify({'success': True})

@app.route('/api/harmonyos-lab/config', methods=['GET'])
def get_harmonyos_lab_config():
    """获取配置"""
    config_path = os.path.join(HARMONYOS_LAB_DIR, 'config.json')
    if os.path.exists(config_path):
        with open(config_path, 'r', encoding='utf-8') as f:
            return jsonify(json.load(f))
    return jsonify({})

@app.route('/api/harmonyos-lab/config', methods=['POST'])
def save_harmonyos_lab_config():
    """保存配置"""
    config = request.get_json()
    config_path = os.path.join(HARMONYOS_LAB_DIR, 'config.json')
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    return jsonify({'success': True})


# ============ 日程管理 ============

CALENDAR_FILE = os.path.join(DATA_DIR, 'calendar.json')

def read_calendar_events():
    """读取日程数据"""
    if not os.path.exists(CALENDAR_FILE):
        return []
    try:
        with open(CALENDAR_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data.get('events', [])
    except:
        return []

def save_calendar_events(events):
    """保存日程数据"""
    with open(CALENDAR_FILE, 'w', encoding='utf-8') as f:
        json.dump({'events': events}, f, ensure_ascii=False, indent=2)

@app.route('/api/calendar/events', methods=['GET'])
def get_calendar_events():
    """获取所有日程"""
    events = read_calendar_events()
    return jsonify({'events': events})

@app.route('/api/calendar/events', methods=['POST'])
def create_calendar_event():
    """创建日程"""
    try:
        data = request.get_json()
        events = read_calendar_events()

        new_event = {
            'id': str(uuid.uuid4())[:8],
            'title': data.get('title', ''),
            'date': data.get('date', ''),
            'start': data.get('start', ''),
            'end': data.get('end', ''),
            'notes': data.get('notes', ''),
            'source': 'local',
            'created_at': datetime.now().isoformat()
        }

        events.append(new_event)
        save_calendar_events(events)

        return jsonify({'success': True, 'event': new_event})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/calendar/events/<event_id>', methods=['DELETE'])
def delete_calendar_event(event_id):
    """删除日程"""
    events = read_calendar_events()
    events = [e for e in events if e['id'] != event_id]
    save_calendar_events(events)
    return jsonify({'success': True})

@app.route('/api/calendar/outlook/sync', methods=['POST'])
def sync_outlook_calendar():
    """同步Outlook日历 - 使用 Microsoft Graph API"""
    try:
        import ms_graph

        # 检查是否已配置
        if not ms_graph.is_configured():
            return jsonify({
                'success': False,
                'error': 'need_config',
                'message': '需要先配置 Microsoft Graph API'
            })

        # 检查是否已登录
        if not ms_graph.is_authenticated():
            return jsonify({
                'success': False,
                'error': 'need_auth',
                'message': '需要先登录 Microsoft 账户'
            })

        # 获取日历事件
        events = ms_graph.get_calendar_events(days=30)
        return jsonify({'success': True, 'events': events, 'count': len(events)})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/calendar/outlook/config', methods=['GET'])
def get_outlook_config():
    """获取 Outlook 配置状态"""
    try:
        import ms_graph

        is_configured = ms_graph.is_configured()
        is_authenticated = ms_graph.is_authenticated() if is_configured else False
        user_info = ms_graph.get_user_info() if is_authenticated else None

        return jsonify({
            'success': True,
            'configured': is_configured,
            'authenticated': is_authenticated,
            'user': user_info
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/calendar/outlook/config', methods=['POST'])
def save_outlook_config():
    """保存 Microsoft Graph API 配置"""
    try:
        import ms_graph

        data = request.get_json()
        client_id = data.get('client_id', '').strip()
        client_secret = data.get('client_secret', '').strip()
        tenant_id = data.get('tenant_id', 'common').strip() or 'common'

        if not client_id:
            return jsonify({'success': False, 'error': '请输入 Application (client) ID'})

        ms_graph.save_config(client_id, client_secret, tenant_id)

        return jsonify({'success': True, 'message': '配置已保存'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/calendar/outlook/auth', methods=['GET'])
def get_outlook_auth_url():
    """获取 Microsoft 登录授权 URL"""
    try:
        import ms_graph

        if not ms_graph.is_configured():
            return jsonify({'success': False, 'error': '请先配置 Microsoft Graph API'})

        auth_url = ms_graph.get_auth_url()
        return jsonify({'success': True, 'auth_url': auth_url})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/calendar/outlook/callback', methods=['GET'])
def outlook_auth_callback():
    """Microsoft OAuth 回调"""
    try:
        import ms_graph

        code = request.args.get('code')
        error = request.args.get('error')

        if error:
            error_desc = request.args.get('error_description', error)
            return f'''
            <html>
            <head><title>授权失败</title></head>
            <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                <h2 style="color: #e74c3c;">授权失败</h2>
                <p>{error_desc}</p>
                <p><a href="/toolbox">返回工具箱</a></p>
                <script>setTimeout(function(){{ window.close(); }}, 3000);</script>
            </body>
            </html>
            '''

        if not code:
            return "缺少授权码", 400

        # 使用授权码获取令牌
        ms_graph.acquire_token_by_auth_code(code)
        user_info = ms_graph.get_user_info()
        user_name = user_info.get('name', '') if user_info else ''

        return f'''
        <html>
        <head><title>授权成功</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h2 style="color: #27ae60;">✓ 授权成功</h2>
            <p>已登录为: <strong>{user_name}</strong></p>
            <p>窗口将自动关闭...</p>
            <script>
                if (window.opener) {{
                    window.opener.postMessage({{ type: 'outlook_auth_success' }}, '*');
                }}
                setTimeout(function(){{ window.close(); }}, 2000);
            </script>
        </body>
        </html>
        '''
    except Exception as e:
        return f'''
        <html>
        <head><title>授权失败</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h2 style="color: #e74c3c;">授权失败</h2>
            <p>{str(e)}</p>
            <p><a href="/toolbox">返回工具箱</a></p>
        </body>
        </html>
        '''

@app.route('/api/calendar/outlook/logout', methods=['POST'])
def outlook_logout():
    """登出 Microsoft 账户"""
    try:
        import ms_graph
        ms_graph.logout()
        return jsonify({'success': True, 'message': '已登出'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return jsonify({
        'status': 'ok',
        'timestamp': datetime.now().isoformat()
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000, debug=True)
