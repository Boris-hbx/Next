# 鸿蒙手机试验田 - 应用模块
# HarmonyOS Lab - Apps Module
#
# 目录结构 / Directory Structure:
# apps/
# ├── __init__.py          # 应用注册和加载
# ├── base_app.py          # 应用基类
# ├── app_manager.py       # 应用管理器
# └── [app_name]/          # 具体应用目录
#     ├── __init__.py
#     ├── app.py           # 应用主逻辑
#     ├── config.json      # 应用配置
#     ├── icon.png         # 应用图标
#     └── views/           # 应用视图
#
# 使用示例 / Usage Example:
# from apps import AppManager
# manager = AppManager()
# manager.register_app('calculator', CalculatorApp)
# manager.launch_app('calculator')

APP_REGISTRY = {}

def register_app(app_id, app_class):
    """注册应用"""
    APP_REGISTRY[app_id] = app_class

def get_app(app_id):
    """获取应用"""
    return APP_REGISTRY.get(app_id)

def list_apps():
    """列出所有应用"""
    return list(APP_REGISTRY.keys())
