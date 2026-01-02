#!/bin/bash
# ==============================================================================
# Git Hooks 安装脚本
# 运行: bash scripts/install-hooks.sh
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
HOOKS_SOURCE="$SCRIPT_DIR/git-hooks"
HOOKS_TARGET="$PROJECT_ROOT/.git/hooks"

echo "==================================="
echo "  安装 Git Hooks"
echo "==================================="

# 检查是否在 git 仓库中
if [ ! -d "$PROJECT_ROOT/.git" ]; then
    echo "错误: 不在 Git 仓库中"
    exit 1
fi

# 复制 hooks
for hook in pre-commit pre-push; do
    if [ -f "$HOOKS_SOURCE/$hook" ]; then
        cp "$HOOKS_SOURCE/$hook" "$HOOKS_TARGET/$hook"
        chmod +x "$HOOKS_TARGET/$hook"
        echo "✓ 已安装: $hook"
    else
        echo "✗ 未找到: $hook"
    fi
done

echo ""
echo "==================================="
echo "  安装完成！"
echo "==================================="
echo ""
echo "已启用的保护机制:"
echo "  - pre-commit: 提交前检查敏感文件"
echo "  - pre-push: 推送前最终安全检查"
echo ""
