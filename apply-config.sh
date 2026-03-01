#!/bin/bash

# 合并 xiaozhi 配置到 OpenClaw 配置文件

CONFIG_FILE="$HOME/.openclaw/openclaw.json"
CONFIG_PATCH="/home/hackers365/.openclaw/workspace/xiaozhi-integration/config-patch.json"

# 检查文件是否存在
if [ ! -f "$CONFIG_FILE" ]; then
  echo "错误: 配置文件不存在: $CONFIG_FILE"
  exit 1
fi

# 备份原配置
cp "$CONFIG_FILE" "$CONFIG_FILE.backup.$(date +%Y%m%d_%H%M%S)"
echo "已备份配置文件到: $CONFIG_FILE.backup.$(date +%Y%m%d_%H%M%S)"

# 使用 jq 合并配置（如果安装了 jq）
if command -v jq &> /dev/null; then
  echo "使用 jq 合并配置..."
  jq -s '.[0] * .[1]' "$CONFIG_FILE" "$CONFIG_PATCH" > "$CONFIG_FILE.tmp"
  mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
  echo "✅ 配置合并完成！"
else
  echo "警告: 未安装 jq，请手动合并配置"
  echo ""
  echo "请在 $CONFIG_FILE 中添加以下内容："
  cat "$CONFIG_PATCH"
  echo ""
  echo "或者运行: sudo apt-get install jq && ./apply-config.sh"
  exit 1
fi

echo ""
echo "配置内容已更新，请检查："
echo "cat $CONFIG_FILE"
