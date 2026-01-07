"""
Next - Focus on the Right Thing
精简版：只保留 Todo 核心功能
"""
from flask import Flask, render_template, redirect, url_for, request, jsonify, send_from_directory, session
import os
import sys
import io
import secrets
import json
import uuid
from datetime import datetime

# 生产模式检测
IS_PRODUCTION = getattr(sys, 'frozen', False)

# 修复 Windows 控制台中文编码问题
if sys.platform == 'win32':
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
    except:
        pass

# ============ 路径配置 ============

def get_base_dir():
    """获取项目根目录，支持 PyInstaller 打包"""
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    else:
        return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def get_data_dir():
    """获取数据目录（用户可写入的目录）"""
    if getattr(sys, 'frozen', False):
        # 生产模式：使用 %LOCALAPPDATA%\Next
        if sys.platform == 'win32':
            appdata = os.environ.get('LOCALAPPDATA', os.path.expanduser('~'))
            return os.path.join(appdata, 'Next')
        else:
            return os.path.join(os.path.expanduser('~'), '.next')
    else:
        return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

BASE_DIR = get_base_dir()
USER_DATA_DIR = get_data_dir()

# ============ Flask 应用初始化 ============

app = Flask(__name__,
            template_folder=os.path.join(BASE_DIR, 'frontend', 'templates'),
            static_folder=os.path.join(BASE_DIR, 'assets'),
            static_url_path='/assets')
app.secret_key = os.environ.get('FLASK_SECRET_KEY', secrets.token_hex(16))

# 生产模式标志已在顶部定义

@app.context_processor
def inject_globals():
    """向所有模板注入全局变量"""
    return {
        'is_production': IS_PRODUCTION,
        'is_dev': not IS_PRODUCTION
    }

# ============ 数据文件配置 ============

DATA_DIR = os.path.join(USER_DATA_DIR, 'data')
TODOS_FILE = os.path.join(DATA_DIR, 'todos.json')
QUOTES_FILE = os.path.join(DATA_DIR, 'quotes.txt')

def init_user_data():
    """初始化用户数据目录，首次运行时复制默认文件"""
    import shutil
    os.makedirs(DATA_DIR, exist_ok=True)

    # 写入调试日志（在 exe 所在目录创建）
    if IS_PRODUCTION:
        log_file = os.path.join(USER_DATA_DIR, 'debug.log')
        with open(log_file, 'w', encoding='utf-8') as f:
            f.write(f"USER_DATA_DIR: {USER_DATA_DIR}\n")
            f.write(f"DATA_DIR: {DATA_DIR}\n")
            f.write(f"TODOS_FILE: {TODOS_FILE}\n")
            f.write(f"QUOTES_FILE: {QUOTES_FILE}\n")
            f.write(f"sys.executable: {sys.executable}\n")
            f.write(f"BASE_DIR: {BASE_DIR}\n")

    # 复制默认 quotes.txt（如果用户目录没有）
    if not os.path.exists(QUOTES_FILE):
        # 打包后的默认文件位置
        default_quotes = os.path.join(BASE_DIR, 'data_default', 'quotes.txt')
        if os.path.exists(default_quotes):
            shutil.copy(default_quotes, QUOTES_FILE)
        else:
            # 开发模式或文件不存在时，创建默认内容
            default_content = """Focus on the right thing.
专注于重要的事情。
今天的努力是明天的收获。
Done is better than perfect.
先完成，再完美。
Keep it simple, stupid.
保持简单，别想太多。
Code is poetry.
代码如诗。
"""
            with open(QUOTES_FILE, 'w', encoding='utf-8') as f:
                f.write(default_content)

# 初始化用户数据目录
init_user_data()

# ============ 平台检测 ============

def is_mobile():
    """检测是否为移动设备"""
    if 'platform' in session:
        return session['platform'] == 'mobile'
    user_agent = request.headers.get('User-Agent', '').lower()
    mobile_keywords = ['iphone', 'android', 'mobile', 'ipod', 'blackberry', 'windows phone']
    return any(keyword in user_agent for keyword in mobile_keywords)

def get_platform():
    """获取当前平台"""
    return 'mobile' if is_mobile() else 'desktop'

def platform_template(template_name):
    """根据平台获取模板路径"""
    platform = get_platform()
    platform_path = f"{platform}/{template_name}"
    template_full_path = os.path.join(app.template_folder, platform_path)
    if os.path.exists(template_full_path):
        return platform_path
    return template_name

def render_platform_template(template_name, **kwargs):
    """渲染平台特定模板"""
    kwargs['platform'] = get_platform()
    return render_template(platform_template(template_name), **kwargs)

# ============ PWA 支持 ============

@app.route('/sw.js')
def service_worker():
    return send_from_directory(app.static_folder, 'sw.js')

@app.route('/manifest.json')
def manifest():
    return send_from_directory(app.static_folder, 'manifest.json')

# ============ 页面路由 ============

@app.route('/')
def index():
    """首页重定向"""
    return redirect(url_for('todo'))

@app.route('/todo')
def todo():
    """Todo 页面"""
    return render_platform_template('todo.html', current_page='todo', quote=get_random_quote())

@app.route('/main')
def main():
    """主页重定向到 Todo"""
    return redirect(url_for('todo'))

# ============ 平台切换 API ============

@app.route('/api/platform/switch', methods=['POST'])
def switch_platform():
    """切换平台"""
    try:
        data = request.get_json()
        platform = data.get('platform', 'desktop')
        if platform in ['mobile', 'desktop']:
            session['platform'] = platform
            return jsonify({'success': True, 'platform': platform})
        return jsonify({'success': False, 'error': 'Invalid platform'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/platform/current')
def current_platform():
    """获取当前平台"""
    return jsonify({
        'platform': get_platform(),
        'is_mobile': is_mobile()
    })

# ============ Todo 数据操作 ============

def read_todos():
    """读取所有 Todo"""
    if not os.path.exists(TODOS_FILE):
        return {"items": []}
    try:
        with open(TODOS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return {"items": []}

def save_todos(data):
    """保存所有 Todo"""
    with open(TODOS_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# ============ Todo API ============

@app.route('/api/todos', methods=['GET'])
def get_todos():
    """获取所有 Todo"""
    tab = request.args.get('tab', None)
    data = read_todos()
    items = data.get('items', [])

    if tab:
        items = [item for item in items if item.get('tab') == tab]

    items.sort(key=lambda x: (x.get('completed', False), x.get('created_at', '')))
    return jsonify({'items': items})

@app.route('/api/todos', methods=['POST'])
def create_todo():
    """创建新 Todo"""
    try:
        req_data = request.get_json()
        now = datetime.now().isoformat()

        item = {
            'id': str(uuid.uuid4())[:8],
            'text': req_data.get('text', ''),
            'content': req_data.get('content', ''),          # 详细内容
            'tab': req_data.get('tab', 'today'),
            'quadrant': req_data.get('quadrant', 'important-not-urgent'),
            'tags': req_data.get('tags', []),
            'assignee': req_data.get('assignee', ''),        # 相关人
            'due_date': req_data.get('due_date', None),      # 计划完成时间
            'progress': req_data.get('progress', 0),         # 完成度 0-100
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

def format_changelog_value(field, val):
    """格式化变更日志的值"""
    if val is None or val == '':
        return '(空)'

    labels = {
        'tab': {'today': 'Today', 'week': 'This Week', 'month': 'Next 30 Days'},
        'quadrant': {
            'important-urgent': '🔥优先处理',
            'important-not-urgent': '🎯就等你翻牌子了',
            'not-important-urgent': '📥待分类',
            'not-important-not-urgent': '⚡短平快'
        },
        'completed': {True: '已完成', False: '未完成'}
    }

    if field in labels and val in labels[field]:
        return labels[field][val]
    if field == 'progress':
        return f'{val}%'
    if field == 'tags':
        return ', '.join(val) if val else '(空)'
    return str(val)

def record_changelog(item, field, old_val, new_val, now):
    """记录变更日志"""
    field_names = {
        'tab': '时间段', 'quadrant': '象限', 'progress': '进度',
        'completed': '状态', 'assignee': '相关人',
        'due_date': '计划完成', 'tags': '标签'
    }

    changelog = item.get('changelog', [])
    changelog.append({
        'time': now,
        'field': field,
        'from': old_val,
        'to': new_val,
        'label': f"{field_names.get(field, field)}: {format_changelog_value(field, old_val)} → {format_changelog_value(field, new_val)}"
    })

    # 限制记录数量（保留最近 50 条）
    if len(changelog) > 50:
        changelog = changelog[-50:]

    return changelog

@app.route('/api/todos/<item_id>', methods=['PUT'])
def update_todo(item_id):
    """更新 Todo"""
    try:
        req_data = request.get_json()
        data = read_todos()
        now = datetime.now().isoformat()

        # 需要记录变更的字段
        tracked_fields = ['tab', 'quadrant', 'progress', 'completed', 'assignee', 'due_date', 'tags']

        for i, item in enumerate(data['items']):
            if item['id'] == item_id:
                changelog = item.get('changelog', [])

                # 记录 tracked_fields 的变更
                for field in tracked_fields:
                    if field in req_data:
                        old_val = item.get(field)
                        new_val = req_data[field]
                        if old_val != new_val:
                            changelog = record_changelog(item, field, old_val, new_val, now)
                            item['changelog'] = changelog

                # 更新字段
                if 'text' in req_data:
                    data['items'][i]['text'] = req_data['text']
                if 'content' in req_data:
                    data['items'][i]['content'] = req_data['content']
                if 'quadrant' in req_data:
                    data['items'][i]['quadrant'] = req_data['quadrant']
                if 'tab' in req_data:
                    data['items'][i]['tab'] = req_data['tab']
                if 'tags' in req_data:
                    data['items'][i]['tags'] = req_data['tags']
                if 'completed' in req_data:
                    data['items'][i]['completed'] = req_data['completed']
                    if req_data['completed']:
                        data['items'][i]['completed_at'] = now
                        data['items'][i]['progress'] = 100
                    else:
                        data['items'][i]['completed_at'] = None
                if 'assignee' in req_data:
                    data['items'][i]['assignee'] = req_data['assignee']
                if 'due_date' in req_data:
                    data['items'][i]['due_date'] = req_data['due_date']
                if 'progress' in req_data:
                    data['items'][i]['progress'] = req_data['progress']
                    if req_data['progress'] >= 100:
                        data['items'][i]['completed'] = True
                        data['items'][i]['completed_at'] = now

                data['items'][i]['updated_at'] = now
                save_todos(data)
                return jsonify({'success': True, 'item': data['items'][i]})

        return jsonify({'success': False, 'error': 'Not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/todos/<item_id>', methods=['DELETE'])
def delete_todo(item_id):
    """软删除 Todo（移入回收站）"""
    try:
        data = read_todos()
        now = datetime.now().isoformat()
        for item in data['items']:
            if item['id'] == item_id:
                item['deleted'] = True
                item['deleted_at'] = now
                break
        save_todos(data)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/todos/<item_id>/restore', methods=['POST'])
def restore_todo(item_id):
    """恢复已删除的 Todo"""
    try:
        data = read_todos()
        for item in data['items']:
            if item['id'] == item_id:
                item['deleted'] = False
                item.pop('deleted_at', None)
                break
        save_todos(data)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/todos/<item_id>/permanent', methods=['DELETE'])
def permanent_delete_todo(item_id):
    """永久删除 Todo"""
    try:
        data = read_todos()
        data['items'] = [item for item in data['items'] if item['id'] != item_id]
        save_todos(data)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/todos/batch', methods=['PUT'])
def batch_update_todos():
    """批量更新 Todo（拖拽排序）"""
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

# ============ 名言功能 ============

import random

def get_random_quote():
    """获取随机名言"""
    default_quotes = [
        "Focus on the right thing.",
        "专注于重要的事情。",
        "Done is better than perfect.",
        "先完成，再完美。"
    ]
    try:
        if os.path.exists(QUOTES_FILE):
            with open(QUOTES_FILE, 'r', encoding='utf-8') as f:
                quotes = [q.strip() for q in f.readlines() if q.strip()]
                if quotes:
                    return random.choice(quotes)
    except:
        pass
    return random.choice(default_quotes)

@app.route('/api/quote/random')
def random_quote():
    """获取随机名言 API"""
    return jsonify({'quote': get_random_quote()})

# ============ 每日例行任务 ============

ROUTINES_FILE = os.path.join(DATA_DIR, 'routines.json')

def read_routines():
    """读取例行任务"""
    if os.path.exists(ROUTINES_FILE):
        with open(ROUTINES_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # 检查是否需要重置今日完成状态（新的一天）
            today = datetime.now().strftime('%Y-%m-%d')
            if data.get('last_reset_date') != today:
                for item in data.get('items', []):
                    item['completed_today'] = False
                data['last_reset_date'] = today
                save_routines(data)
            return data
    return {'items': [], 'last_reset_date': datetime.now().strftime('%Y-%m-%d')}

def save_routines(data):
    """保存例行任务"""
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(ROUTINES_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

@app.route('/api/routines', methods=['GET'])
def get_routines():
    """获取例行任务列表"""
    data = read_routines()
    return jsonify({'success': True, 'items': data.get('items', [])})

@app.route('/api/routines', methods=['POST'])
def add_routine():
    """添加例行任务"""
    try:
        req_data = request.get_json()
        text = req_data.get('text', '').strip()
        if not text:
            return jsonify({'success': False, 'error': '任务内容不能为空'})

        data = read_routines()
        new_item = {
            'id': str(uuid.uuid4())[:8],
            'text': text,
            'completed_today': False,
            'created_at': datetime.now().isoformat()
        }
        data['items'].append(new_item)
        save_routines(data)
        return jsonify({'success': True, 'item': new_item})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/routines/<item_id>/toggle', methods=['POST'])
def toggle_routine(item_id):
    """切换例行任务完成状态"""
    try:
        data = read_routines()
        for item in data['items']:
            if item['id'] == item_id:
                item['completed_today'] = not item.get('completed_today', False)
                break
        save_routines(data)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/routines/<item_id>', methods=['DELETE'])
def delete_routine(item_id):
    """删除例行任务"""
    try:
        data = read_routines()
        data['items'] = [item for item in data['items'] if item['id'] != item_id]
        save_routines(data)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# ============ 健康检查 ============

@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'data_dir': DATA_DIR,
        'todos_file': TODOS_FILE,
        'todos_exists': os.path.exists(TODOS_FILE),
        'quotes_file': QUOTES_FILE,
        'quotes_exists': os.path.exists(QUOTES_FILE),
        'is_production': IS_PRODUCTION
    })

# ============ 空 API（兼容旧前端） ============

@app.route('/api/auth/status')
def auth_status():
    """认证状态（已禁用）"""
    return jsonify({'logged_in': False})

@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    """登出（已禁用）"""
    return jsonify({'success': True})

@app.route('/api/weather')
def weather():
    """天气（已禁用）"""
    return jsonify({
        'icon': '☀️',
        'temp_c': '--',
        'description': 'N/A',
        'weather_type': 'sunny'
    })

# ============ 启动入口 ============

if __name__ == '__main__':
    # 从环境变量获取端口（Electron 会设置）
    port = int(os.environ.get('FLASK_PORT', 2026))

    # 检查是否由 Electron 启动
    is_electron = os.environ.get('ELECTRON_DEV') == '1' or IS_PRODUCTION

    if is_electron or IS_PRODUCTION:
        # Electron 模式：纯 Flask 服务器，不启动浏览器
        print(f"[Flask] Starting server on http://127.0.0.1:{port}")
        from werkzeug.serving import run_simple
        run_simple('127.0.0.1', port, app, use_reloader=False, use_debugger=False, threaded=True)
    else:
        # 独立开发模式（不通过 Electron）
        port = 2026
        print(f"[DEV] Starting Next on http://localhost:{port}")
        app.run(host='0.0.0.0', port=port, debug=True)
