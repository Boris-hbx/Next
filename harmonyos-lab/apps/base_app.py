# 鸿蒙手机试验田 - 应用基类
# HarmonyOS Lab - Base App Class

class BaseApp:
    """
    应用基类 - 所有应用都应该继承此类

    属性:
        app_id: 应用唯一标识
        name: 应用名称
        icon: 应用图标
        version: 应用版本

    方法:
        on_create(): 应用创建时调用
        on_start(): 应用启动时调用
        on_pause(): 应用暂停时调用
        on_resume(): 应用恢复时调用
        on_destroy(): 应用销毁时调用
        render(): 渲染应用界面
        handle_event(event): 处理事件
    """

    app_id = None
    name = "未命名应用"
    icon = "📱"
    version = "1.0.0"

    def __init__(self, context=None):
        self.context = context or {}
        self.state = {}
        self.is_running = False

    def on_create(self):
        """应用创建时调用"""
        pass

    def on_start(self):
        """应用启动时调用"""
        self.is_running = True

    def on_pause(self):
        """应用暂停时调用"""
        pass

    def on_resume(self):
        """应用恢复时调用"""
        pass

    def on_destroy(self):
        """应用销毁时调用"""
        self.is_running = False

    def render(self):
        """
        渲染应用界面
        返回: HTML字符串或组件树
        """
        return f'<div class="app-container">{self.name}</div>'

    def handle_event(self, event_type, event_data=None):
        """
        处理事件

        参数:
            event_type: 事件类型 (click, input, scroll, etc.)
            event_data: 事件数据
        """
        pass

    def set_state(self, key, value):
        """设置状态"""
        self.state[key] = value

    def get_state(self, key, default=None):
        """获取状态"""
        return self.state.get(key, default)

    def to_dict(self):
        """转换为字典（用于序列化）"""
        return {
            'app_id': self.app_id,
            'name': self.name,
            'icon': self.icon,
            'version': self.version,
            'state': self.state,
            'is_running': self.is_running
        }
