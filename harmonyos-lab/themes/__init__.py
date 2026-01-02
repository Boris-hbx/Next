# 鸿蒙手机试验田 - 主题系统
# HarmonyOS Lab - Theme System
#
# 目录结构 / Directory Structure:
# themes/
# ├── __init__.py          # 主题注册和切换
# ├── default/             # 默认主题
# │   ├── theme.json       # 主题配置
# │   ├── colors.css       # 颜色变量
# │   └── styles.css       # 样式覆盖
# ├── dark/                # 暗色主题
# └── [custom]/            # 自定义主题
#
# 主题配置示例 / Theme Config Example:
# {
#   "name": "Default",
#   "colors": {
#     "primary": "#007AFF",
#     "background": "#FFFFFF",
#     "text": "#000000"
#   },
#   "fonts": {
#     "family": "HarmonyOS Sans",
#     "size": { "small": 12, "medium": 14, "large": 16 }
#   }
# }

THEME_REGISTRY = {}
CURRENT_THEME = 'default'

# 默认主题配置
DEFAULT_THEME = {
    'name': 'Default',
    'colors': {
        'primary': '#007AFF',
        'secondary': '#5856D6',
        'success': '#34C759',
        'warning': '#FF9500',
        'error': '#FF3B30',
        'background': '#F2F2F7',
        'surface': '#FFFFFF',
        'text': '#000000',
        'textSecondary': '#8E8E93',
        'border': '#C6C6C8'
    },
    'fonts': {
        'family': 'HarmonyOS Sans, -apple-system, sans-serif',
        'size': {
            'xs': 10,
            'sm': 12,
            'md': 14,
            'lg': 16,
            'xl': 20,
            'xxl': 24
        }
    },
    'spacing': {
        'xs': 4,
        'sm': 8,
        'md': 16,
        'lg': 24,
        'xl': 32
    },
    'borderRadius': {
        'sm': 4,
        'md': 8,
        'lg': 16,
        'full': 9999
    }
}

THEME_REGISTRY['default'] = DEFAULT_THEME

def register_theme(theme_id, theme_config):
    """注册主题"""
    THEME_REGISTRY[theme_id] = theme_config

def get_theme(theme_id=None):
    """获取主题"""
    return THEME_REGISTRY.get(theme_id or CURRENT_THEME, DEFAULT_THEME)

def set_theme(theme_id):
    """设置当前主题"""
    global CURRENT_THEME
    if theme_id in THEME_REGISTRY:
        CURRENT_THEME = theme_id
        return True
    return False

def list_themes():
    """列出所有主题"""
    return list(THEME_REGISTRY.keys())

def get_color(color_name):
    """获取当前主题的颜色"""
    theme = get_theme()
    return theme.get('colors', {}).get(color_name)

def generate_css_variables(theme_id=None):
    """生成CSS变量"""
    theme = get_theme(theme_id)
    css_vars = [':root {']

    for color_name, color_value in theme.get('colors', {}).items():
        css_vars.append(f'  --color-{color_name}: {color_value};')

    for size_name, size_value in theme.get('fonts', {}).get('size', {}).items():
        css_vars.append(f'  --font-size-{size_name}: {size_value}px;')

    for space_name, space_value in theme.get('spacing', {}).items():
        css_vars.append(f'  --spacing-{space_name}: {space_value}px;')

    css_vars.append('}')
    return '\n'.join(css_vars)
