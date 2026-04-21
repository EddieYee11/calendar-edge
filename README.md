# CalendarEdge

一个更轻量、更私人定制的 SlidePad 替代方案。

CalendarEdge 是一个 macOS 侧边滑出日历面板：当鼠标停留在屏幕右侧边缘时，面板会从右侧滑入，展示今日日程、接下来几天的安排，以及未完成的提醒事项，帮助你快速回答一个问题：

> 我现在和接下来该做什么？

## 项目背景

我平时会用 SlidePad 充当“快捷换出日历”的工具，但它对我来说有两个明显问题：

1. 价格偏高
2. 它本质上是一个微型浏览器，系统资源和内存占用相对更重

于是我冒出了一个想法：

既然我已经订阅了 Claude 和 ChatGPT，为什么不直接用它们来帮我写一个更轻量、也更适合我自己工作流的版本？

这个项目就是在这样的背景下，通过持续的 vibe coding 一步一步做出来的。它也是我的第一个开源项目。

## 设计目标

- 比浏览器壳方案更轻量
- 比通用效率工具更聚焦
- 不做“管理系统”，只做“扫视型查询工具”
- 以 macOS 原生日历和提醒事项为数据源
- 保持足够强的私人定制空间，后续可以继续按自己的需求演进

## 当前功能

- 屏幕右侧边缘悬停触发面板
- 右侧滑入 / 自动收起
- 展示今日日程、下一件事、未来几天概览
- 展示未完成提醒事项，并支持勾选完成
- 点击事项后跳回 Calendar / Reminders
- 识别会议链接并支持直接加入
- 使用 macOS 原生 `EventKit` 读取 Calendar / Reminders 数据

## 技术方案

这个项目不是 Electron、Tauri 或其他浏览器壳应用。

当前活跃实现采用的是：

- 原生层：Objective-C + AppKit + WebKit + EventKit
- 前端层：React 18 + Vite 5
- 打包方式：`clang` + shell 脚本

核心思路是：

- 用原生 `NSPanel` 负责边缘触发、窗口管理和系统能力
- 用 `WKWebView` 承载信息展示界面
- 用 `EventKit` 直接读取 macOS 本地日历和提醒事项

这样既能保留较强的 UI 可塑性，也能把运行时开销控制在比浏览器壳更低的范围内。

## 当前活跃路径

这个仓库里保留了一些历史实验文件，但当前真正生效的主链路是：

- 原生入口：`native/CalendarEdgeObjC/main_webview.m`
- Web 入口：`src/main.jsx`
- 主界面：`src/App.jsx`
- 样式：`src/styles.css`
- 构建脚本：`scripts/build-calendar-edge-app.sh`

## 运行环境

- macOS
- Node.js / npm
- Xcode Command Line Tools（提供 `clang`）

## 构建

```bash
npm install
./scripts/build-calendar-edge-app.sh
```

构建脚本会完成这些事情：

- 构建 React 前端到 `dist/`
- 编译原生可执行文件
- 组装 `build/CalendarEdge.app`
- 安装一份可直接运行的副本到 `~/Applications/CalendarEdge.app`

## 启动

```bash
open -na ~/Applications/CalendarEdge.app
```

启动后，把鼠标移到屏幕最右侧边缘并短暂停留，即可唤出面板。

## 权限说明

应用可能会请求以下权限：

- 日历权限
- 提醒事项权限
- Automation 权限

其中 Automation 权限用于通过 AppleScript 将事件定位到 Apple Calendar。

## 已知限制

- 仅支持 macOS
- 暂无开机自启
- 暂无菜单栏入口
- 暂未实现深浅色主题切换
- 仓库中仍保留部分历史实验代码，后续会继续整理

## 为什么开源

我希望把这次“用 AI 帮自己做一个真正会用的工具”的过程公开出来。

这个仓库不只是一个成品，也是一份记录：

- 一个真实个人需求如何被拆解
- 一个轻量桌面工具如何从想法变成可运行应用
- AI 辅助开发如何用于做出更私人定制的软件

如果它刚好也能帮到同样想做轻量日历面板、想替代重型浏览器壳工具，或者第一次尝试开源项目的人，那就更好了。

## 贡献

欢迎提 Issue 或 PR。

如果你想从当前主实现开始阅读，建议优先看：

- `native/CalendarEdgeObjC/main_webview.m`
- `src/App.jsx`
- `src/styles.css`
- `scripts/build-calendar-edge-app.sh`

## License

MIT
