# 鸿蒙手机试验田 - 插件系统
# HarmonyOS Lab - Plugin System
#
# 目录结构 / Directory Structure:
# plugins/
# ├── __init__.py          # 插件注册和加载
# ├── base_plugin.py       # 插件基类
# ├── plugin_manager.py    # 插件管理器
# └── [plugin_name]/       # 具体插件目录
#     ├── __init__.py
#     ├── plugin.py        # 插件主逻辑
#     ├── config.json      # 插件配置
#     └── hooks/           # 钩子函数
#
# 插件类型 / Plugin Types:
# - system: 系统级插件（状态栏、通知等）
# - ui: UI增强插件（主题、动画等）
# - service: 后台服务插件
# - bridge: 与外部系统桥接
#
# 使用示例 / Usage Example:
# from plugins import PluginManager
# manager = PluginManager()
# manager.load_plugin('notification')
# manager.activate_plugin('notification')

PLUGIN_REGISTRY = {}
HOOKS = {}

def register_plugin(plugin_id, plugin_class):
    """注册插件"""
    PLUGIN_REGISTRY[plugin_id] = plugin_class

def get_plugin(plugin_id):
    """获取插件"""
    return PLUGIN_REGISTRY.get(plugin_id)

def list_plugins():
    """列出所有插件"""
    return list(PLUGIN_REGISTRY.keys())

def register_hook(hook_name, callback):
    """注册钩子"""
    if hook_name not in HOOKS:
        HOOKS[hook_name] = []
    HOOKS[hook_name].append(callback)

def trigger_hook(hook_name, *args, **kwargs):
    """触发钩子"""
    results = []
    for callback in HOOKS.get(hook_name, []):
        result = callback(*args, **kwargs)
        results.append(result)
    return results


class BasePlugin:
    """插件基类"""

    plugin_id = None
    name = "未命名插件"
    version = "1.0.0"
    plugin_type = "service"  # system, ui, service, bridge

    def __init__(self, context=None):
        self.context = context or {}
        self.is_active = False

    def on_load(self):
        """插件加载时调用"""
        pass

    def on_activate(self):
        """插件激活时调用"""
        self.is_active = True

    def on_deactivate(self):
        """插件停用时调用"""
        self.is_active = False

    def on_unload(self):
        """插件卸载时调用"""
        pass
