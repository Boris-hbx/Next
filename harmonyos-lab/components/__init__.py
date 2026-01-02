# 鸿蒙手机试验田 - UI组件库
# HarmonyOS Lab - UI Components Library
#
# 目录结构 / Directory Structure:
# components/
# ├── __init__.py          # 组件注册和导出
# ├── base.py              # 基础组件类
# ├── button.py            # 按钮组件
# ├── input.py             # 输入框组件
# ├── list.py              # 列表组件
# ├── card.py              # 卡片组件
# ├── modal.py             # 弹窗组件
# ├── navigation.py        # 导航组件
# └── [custom]/            # 自定义组件
#
# 使用示例 / Usage Example:
# from components import Button, Input, Card
# button = Button(text="点击", on_click=handle_click)

COMPONENT_REGISTRY = {}

def register_component(name, component_class):
    """注册组件"""
    COMPONENT_REGISTRY[name] = component_class

def get_component(name):
    """获取组件"""
    return COMPONENT_REGISTRY.get(name)

def list_components():
    """列出所有组件"""
    return list(COMPONENT_REGISTRY.keys())


class BaseComponent:
    """组件基类"""

    def __init__(self, **props):
        self.props = props
        self.children = []
        self.style = props.get('style', {})
        self.class_name = props.get('className', '')

    def add_child(self, child):
        self.children.append(child)
        return self

    def render(self):
        """渲染组件，返回HTML"""
        return '<div></div>'

    def to_dict(self):
        return {
            'type': self.__class__.__name__,
            'props': self.props,
            'children': [c.to_dict() if hasattr(c, 'to_dict') else c for c in self.children]
        }
