# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec file for Flask backend (used by Electron)

import os

block_cipher = None

# 项目根目录
PROJECT_ROOT = os.path.dirname(os.path.abspath(SPEC))

# 需要打包的数据文件
datas = [
    # 前端模板
    (os.path.join(PROJECT_ROOT, 'frontend', 'templates'), 'frontend/templates'),
    # 静态资源
    (os.path.join(PROJECT_ROOT, 'assets'), 'assets'),
    # 默认数据文件
    (os.path.join(PROJECT_ROOT, 'data', 'quotes.txt'), 'data_default'),
]

a = Analysis(
    [os.path.join(PROJECT_ROOT, 'backend', 'app.py')],
    pathex=[PROJECT_ROOT],
    binaries=[],
    datas=datas,
    hiddenimports=[
        'flask',
        'jinja2',
        'werkzeug',
        'werkzeug.serving',
        'markupsafe',
        'itsdangerous',
        'click',
        'blinker',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        '_tkinter',
        'matplotlib',
        'numpy',
        'pandas',
        'scipy',
        'PIL',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='flask-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # 隐藏控制台窗口
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
