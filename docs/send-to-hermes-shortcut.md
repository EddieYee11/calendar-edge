# `Send to Hermes` Shortcut 设计说明

这个项目里的 Hermes 快捷输入，不会直接耦合 Discord / iMessage / 微信。

CalendarEdge 只做一件事：

- 把你在面板里输入的自然语言文本，通过下面这条命令交给系统快捷指令

```bash
shortcuts run "Send to Hermes" --input-path -
```

这意味着：

- 快捷指令名称必须固定为 `Send to Hermes`
- CalendarEdge 只负责传纯文本
- 最终发到哪里，由你的 Shortcut 决定
- 未来如果 Hermes 从 Discord 迁到 iMessage 或微信，只需要改 Shortcut，不需要改 App

## v1 推荐链路

```text
CalendarEdge -> Shortcuts -> AppleScript / UI Automation -> Discord Hermes 对话
```

这是当前最稳的落地方式，因为：

- CalendarEdge 不需要直接集成 Discord API
- 未来切换目标聊天软件时，App 无需改动
- Shortcut 可以继续叠加你自己的个人工作流

## 你需要创建的 Shortcut

在 macOS 的“快捷指令”里新建一个 Shortcut，名称必须精确写成：

```text
Send to Hermes
```

推荐用下面这 3 个动作：

1. `接收快捷指令输入`
2. `运行 Shell 脚本`
3. 可选：`显示通知`（只在你想调试时打开）

## `运行 Shell 脚本` 的配置

- Shell：`/bin/zsh`
- 传递输入：`作为 stdin`
- 脚本内容：

```bash
set -euo pipefail

INPUT="$(/bin/cat)"

if [ -z "$(printf '%s' "$INPUT" | tr -d '[:space:]')" ]; then
  echo "No message received for Hermes." >&2
  exit 1
fi

/usr/bin/osascript "/ABSOLUTE/PATH/TO/calendar-edge/scripts/send-to-hermes-discord.applescript" "$INPUT"
```

把上面路径替换成你本机仓库里的真实路径，例如：

```text
/Users/your-name/path/to/calendar-edge/scripts/send-to-hermes-discord.applescript
```

## 配套 AppleScript

仓库里已经放好了一个可直接复用的脚本：

- [scripts/send-to-hermes-discord.applescript](../scripts/send-to-hermes-discord.applescript)

这个脚本会做这些事：

- 激活 Discord
- 打开 Quick Switcher
- 搜索 `@Hermes`
- 进入 Hermes 对话
- 粘贴消息
- 回车发送

你最可能需要改的一行是：

```applescript
property hermesQuickSwitcherQuery : "@Hermes"
```

如果你的 Hermes 对话不是这个名字，或者 Quick Switcher 里搜索结果不唯一，就把它换成一个更稳定、能唯一命中的查询词。

## 首次运行需要的系统权限

第一次跑通时，macOS 大概率会弹权限框。请允许这些权限：

- `Shortcuts` / `快捷指令`
- `System Events`
- 对 `Discord` 的自动化控制
- 运行宿主的“辅助功能”权限

如果没有这些权限，Shortcut 很可能会失败在“发送按键”这一步。

## 为什么现在不直接接 Discord / iMessage / 微信

这是当前版本的刻意取舍：

- Discord / 微信桌面端直连，通常会落到不稳定的 UI 自动化或私有实现
- iMessage 虽然更系统化，但你现在的 Hermes 主链路并不在那里
- 用 Shortcut 做中转，能把 App 和聊天软件彻底解耦

## 以后如果要改到 iMessage / 微信

CalendarEdge 这一层不用动。

你只需要把 `Send to Hermes` 这个 Shortcut 的最后几步换掉：

- Discord 版：打开 Discord，搜索 Hermes，对话里发送
- iMessage 版：打开 Messages，把文本发给固定联系人
- 微信版：打开微信，定位聊天窗口，再做发送

也就是说，App 永远只负责“交出文本”，目标聊天软件完全由 Shortcut 决定。
