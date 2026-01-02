# 鸿蒙手机试验田 - 脚本系统
# HarmonyOS Lab - Script System
#
# 目录结构 / Directory Structure:
# scripts/
# ├── __init__.py          # 脚本注册和执行
# ├── sandbox.py           # 脚本沙箱环境
# ├── api.py               # 脚本可用的API
# └── examples/            # 示例脚本
#     ├── hello.py
#     └── automation.py
#
# 脚本API / Script API:
# - device: 设备信息和控制
# - ui: UI操作（点击、滑动等）
# - apps: 应用管理
# - storage: 数据存储
# - network: 网络请求
# - notification: 通知系统
#
# 使用示例 / Usage Example:
# from scripts import ScriptRunner
# runner = ScriptRunner()
# runner.execute('''
#     device.vibrate()
#     ui.click(100, 200)
#     apps.launch('calculator')
# ''')

SCRIPT_REGISTRY = {}

class ScriptContext:
    """脚本执行上下文"""

    def __init__(self):
        self.device = DeviceAPI()
        self.ui = UIAPI()
        self.apps = AppsAPI()
        self.storage = StorageAPI()
        self.log = []

    def print(self, *args):
        """脚本打印函数"""
        message = ' '.join(str(a) for a in args)
        self.log.append(message)
        return message


class DeviceAPI:
    """设备API"""

    def get_info(self):
        return {'model': 'HarmonyOS Phone', 'os': 'HarmonyOS 4.0'}

    def vibrate(self, duration=100):
        return {'action': 'vibrate', 'duration': duration}

    def get_battery(self):
        return {'level': 85, 'charging': False}

    def get_network(self):
        return {'type': 'wifi', 'connected': True}


class UIAPI:
    """UI操作API"""

    def click(self, x, y):
        return {'action': 'click', 'x': x, 'y': y}

    def long_press(self, x, y, duration=500):
        return {'action': 'long_press', 'x': x, 'y': y, 'duration': duration}

    def swipe(self, start_x, start_y, end_x, end_y, duration=300):
        return {
            'action': 'swipe',
            'start': (start_x, start_y),
            'end': (end_x, end_y),
            'duration': duration
        }

    def scroll(self, direction='down', distance=100):
        return {'action': 'scroll', 'direction': direction, 'distance': distance}

    def input_text(self, text):
        return {'action': 'input', 'text': text}


class AppsAPI:
    """应用管理API"""

    def launch(self, app_id):
        return {'action': 'launch', 'app_id': app_id}

    def close(self, app_id):
        return {'action': 'close', 'app_id': app_id}

    def list_installed(self):
        return []

    def list_running(self):
        return []


class StorageAPI:
    """存储API"""

    def __init__(self):
        self._data = {}

    def set(self, key, value):
        self._data[key] = value
        return True

    def get(self, key, default=None):
        return self._data.get(key, default)

    def delete(self, key):
        if key in self._data:
            del self._data[key]
            return True
        return False

    def clear(self):
        self._data.clear()
        return True


def create_context():
    """创建脚本上下文"""
    return ScriptContext()

def execute_script(script_code, context=None):
    """执行脚本"""
    if context is None:
        context = create_context()

    # 创建安全的执行环境
    safe_globals = {
        'device': context.device,
        'ui': context.ui,
        'apps': context.apps,
        'storage': context.storage,
        'print': context.print,
    }

    try:
        exec(script_code, safe_globals)
        return {'success': True, 'log': context.log}
    except Exception as e:
        return {'success': False, 'error': str(e), 'log': context.log}
