# 🖥️ Electron Web Browser

基于 Electron 框架的轻量网页浏览器，集成桌面悬浮歌词功能，专为配合 [无缝循环播放器](https://github.com/Miku39sukida/SeamlessBGMPlayer) 使用而设计。
> 版本：**1.6**
> License：MIT
> 配合使用：[无缝循环播放器](https://github.com/Miku39sukida/SeamlessBGMPlayer)

---

## ✨ 功能特性

### 🌐 轻量网页浏览
- **简洁界面**：无多余工具栏，专注浏览体验
- **多标签页**：支持打开多个网页
- **下载管理**：内置下载管理器，支持断点续传
- **全屏模式**：F11 切换全屏
- **网站图标**：自动加载网页 favicon 作为窗口图标，每个网站显示对应品牌图标

### 🎤 桌面悬浮歌词
- **透明置顶窗口**：无边框、透明背景、始终置顶显示
- **卡拉OK模式**：逐字高亮已唱/正在唱/未唱歌词
- **双语显示**：支持原文+译文同步显示
- **自由拖动**：鼠标拖动调整位置，自动保存位置
- **自动跟随关闭**：关闭播放器页面时自动关闭悬浮歌词
- **F12 调试**：悬浮歌词窗口内按 F12 打开开发者工具

### ⚙️ 歌词设置
- **主字体自定义**：选择系统已安装的字体（如原神 SDK_SC_Web、Teyvat Black 等）
- **回退字体**：主字体缺失字符时自动使用回退字体（如提瓦特字体仅含英文，回退字体用于显示中文）
- **大字体支持**：自动处理 5MB+ 大字体文件加载（ArrayBuffer + Blob 双模式）
- **字体名智能匹配**：支持中文、日文、以数字开头的字体名（如 851手書き雑）
- **字体列表优化**：单列布局、字体预览、语种标签、长名截断、模糊搜索
- **颜色调整**：自定义歌词颜色和阴影颜色
- **字号调节**：支持多档字号选择
- **卡拉OK模式开关**：一键切换逐字高亮模式

---

## 🚀 快速开始

### 依赖
- **Node.js 18+**
- **npm**

### 安装 & 启动

```bash
# 1. 克隆或解压项目后进入目录
git clone https://github.com/Miku39sukida/Electron-Web-Browser.git
cd Electron-Web-Browser

# 2. 安装依赖
npm install

# 3. 启动应用
npm start
```

### 一键启动（Windows）
双击 `start.vbs` 脚本，自动检查 Node.js/npm 是否安装，未安装则提示并打开安装终端。

---

## 📁 目录结构

```
Electron-Web-Browser/
├── main.js             # Electron 主进程（窗口管理、IPC通信、API）
├── preload.js          # 预加载脚本（渲染进程与主进程通信桥接）
├── index.html          # 主窗口页面（浏览器界面）
├── desktop-lyric.html  # 悬浮歌词窗口
├── lyric-settings.html # 歌词设置窗口
├── downloads.html      # 下载管理页面
├── package.json        # npm 依赖配置
├── start.vbs           # Windows 一键启动脚本
└── icon/               # 应用图标
```

---

## ⌨️ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+L` | 切换悬浮歌词交互模式（点击歌词区域也可切换） |
| `F11` | 切换全屏模式 |
| `Ctrl+T` | 新建标签页 |
| `Ctrl+W` | 关闭当前标签页 |
| `Ctrl+F5` | 强制刷新当前页面（忽略缓存） |
| `F12` | 悬浮歌词窗口内打开/关闭开发者工具（调试用） |

## 🖱️ 右键菜单

网页区域右键点击可打开菜单，包含以下功能：
- **返回 / 前进**：页面导航
- **刷新 / 强制刷新**：重新加载页面
- **复制 / 粘贴 / 剪切**：文本操作
- **全选**：选中页面全部内容
- **查看页面源码**：打开当前页面源代码
- **在新标签页中打开链接**：链接相关操作

---

## 🎵 使用场景

1. **配合无缝循环播放器**：打开播放器网页后，点击"悬浮歌词"按钮，歌词会在桌面置顶显示
2. **单独使用**：作为轻量浏览器使用，支持网页浏览和下载
3. **卡拉OK模式**：播放包含 LRC 逐字时间戳的歌曲时，开启卡拉OK模式体验逐字高亮

---

## 🧱 技术栈

| 层 | 技术选型 |
|----|----------|
| 框架 | Electron 32 |
| 前端 | 原生 HTML/CSS/JavaScript |
| 字体读取 | Windows 注册表 (reg.exe) |
| 存储 | localStorage + 文件系统 |

---

## 📋 更新日志

### v1.6
- **卡拉OK高亮层换行错位修复（CSS Grid 重叠方案）**：
  - 根因：旧方案用 `position: absolute` + `width: auto`（shrink-to-fit）定位高亮层，脱离文档流的宽度计算与底层 rest 层（正常 inline flow）不一致，导致两层换行点不同步，长文本换行时高亮文字偏移
  - 修复：`.lyric-karaoke-line` 改为 `display: inline-grid; grid-template-areas: "lyric"`，rest 和 highlight 层占据同一 grid cell。cell 宽度由 rest 内容决定（正常 CJK 换行），highlight 层 `width: 100%` 强制同宽 → 两层换行点 100% 一致
  - highlight 层添加 `position: relative`（grid item 默认非 positioning context，需显式设置才能让 `z-index` 生效）
  - `.ks` 之间的 `\u200B`（零宽空格字符）替换为 `<wbr>`（HTML5 Word Break Opportunity 标签），换行点更可靠
  - 主歌词和译文部分均做了同样修改
- **卡拉OK未唱字符高亮泄漏修复**：
  - 根因：`.ks` 的 `clip-path: inset(-3px calc(100% - var(--p) - 3px) -3px -3px)` 在 `--p: 0%`（未唱）时，left=-3px + right=calc(100%-3px) 产生 6px 宽可见条，导致每个未唱字符左侧残留 2-3 像素高亮
  - 修复：改用 `padding: 0 3px; margin: 0 -3px` 扩大 border-box 覆盖描边（替代负 inset），clip-path 简化为 `inset(-3px calc(100% - var(--p)) -3px 0)`。`--p: 0%` 时 right=100% 完全不可见，`--p: 100%` 时 padding 覆盖描边，头尾 2-3 像素也完整高亮
  - 主歌词和译文部分均做了同样修改

### v1.5
- **卡拉OK模式切换文字消失/变描边色修复**：
  - 根因1：`.lyric-karaoke-line` 的 `-webkit-text-fill-color: transparent` 为全局规则，无作用域限定，关闭卡拉OK后 DOM 残留元素仍透明填充，仅 body 的 8 方向 text-shadow 描边可见
  - 根因2：切换卡拉OK按钮仅改 `isKaraokeMode` 标志，未重新渲染 DOM 结构，开→关时仍是透明填充的卡拉OK span，关→开时仍是普通 textContent 无动画行
  - 修复方案：
    - CSS 作用域限定：渐变填充 + `background-clip:text` + 透明 fill 全部放入 `.lyric-main.karaoke-mode .lyric-karaoke-line` 选择器下，非卡拉OK模式不受影响
    - 缓存最后一次歌词 payload：`lastLyricPayload` 在每次 `onLyricUpdate` 时保存
    - 卡拉OK按钮切换后立即调用 `updateLyric(lastLyricPayload...)` 重新生成正确的 DOM 结构
    - `applySettingsWithoutFont` 在检测到卡拉OK class 存在性与预期不一致时，仅在 payload.text 非空且非空行时重渲染，防止空歌词清空显示
- **卡拉OK动画渲染方案优化**：原 `background-clip: text` + `linear-gradient(calc...)` 在 Electron 透明窗口渲染不稳定，渐变背景经常不显示，只剩描边。改为**双层叠加方案**：底层 `.karaoke-rest`（未唱文字+未唱描边，`z-index:1`）、顶层 `.karaoke-highlight`（已唱文字+已唱描边+发光，`z-index:2`，用 `clip-path: inset(0 calc(100% - var(--progress, 0%)) 0 0)` 从左到右裁剪）。每层独立填充色和描边色，彻底规避 `background-clip:text` 兼容问题
- **修复设置变更后桌面歌词消失**：`applySettingsWithoutFont` 在模式不一致时调用 `updateLyric` 会用空 payload 清空歌词。修复为仅在 `lastLyricPayload.text` 非空且非 `(空行)` 时触发重渲染；模式未变时只更新 CSS 变量，无需重写 DOM
- **卡拉OK四层颜色配置（已唱/未唱独立文字色+描边色）**：
  - 新增 4 个设置项：`textColor` 已唱文字颜色（原「文字颜色」改名）、`highlightStrokeColor` 已唱描边颜色（原「描边颜色」改名）、`restColor` 未唱文字颜色（新增，默认 `#999999`）、`restStrokeColor` 未唱描边颜色（新增，默认 `#000000`）
  - `lyric-settings.html` 设置面板：颜色块从 2 个改为 4 个，分别独立的预览样例（带相同描边模拟桌面效果）
  - `main.js` 默认配置、`loadSettings` 合并 defaults、desktop-lyric 的 `lyricSettings` 默认值、`applySettingsWithoutFont` 全部同步更新
- **CSS 变量作用域修复**：颜色变量写入位置从 `document.documentElement`（`<html>`）改为 `document.body`。原 body CSS 规则中定义了同名默认值，从 html 继承的值会被 body 自身规则覆盖，导致用户设置永远不生效
- **主进程 `saveLyricSettings` 与 `loadSettings` 默认值同步**：新增 `restColor` / `restStrokeColor` / `highlightStrokeColor` 三个字段的默认值与旧 `strokeColor` 字段清理，防止旧 settings.json 迁移时字段缺失

### v1.4
- **桌面歌词主进程后台推送优化**：主进程 60fps 推送逻辑增加 `loopEndS` 参数缓存，与渲染端歌词结束拍设置同步，确保窗口最小化时歌词位置估算与前台一致
- **回退字重匹配修复**：回退字体注册时使用与主字体相同的字重（`primaryLoaded ? primaryWeight : '400'`），避免浏览器因字重不一致对回退字体合成加粗效果
- **窗口重开歌词恢复修复**：桌面歌词窗口关闭后重新打开时不显示歌词（仅换歌才显示）的问题修复；在 `ready-to-show` 和 `did-finish-load` 事件中检查缓存的歌词数据并恢复 60fps 后台推送，同时重置 `prevEstimatedTime`/`lastPushedIdx` 避免旧索引导致歌词位置跳跃

### v1.3
- **网站图标支持**：自动加载网页 favicon 作为 Electron 窗口图标，打开 B站、百度等网站时窗口图标自动更新为对应网站品牌图标
- **Favicon 下载优化**：使用 Electron 原生 `net.fetch()` 下载 favicon，保存为临时文件后通过 `nativeImage.createFromPath()` 加载，兼容 Windows 系统图标格式
- **搜索建议功能**：主页搜索框新增实时搜索建议，调用百度 sugrec API 获取关键词联想词，支持键盘导航（↑↓选择、Enter确认、Escape关闭），关键词高亮显示，300ms 防抖避免过快请求
- **搜索引擎保存**：修复搜索引擎选择保存逻辑，关闭应用后重新打开自动恢复上次选择的搜索引擎（百度、Bing、B站等）
- **下载功能修复**：修复下载处理器初始化时序问题，确保默认 session 的 `will-download` 事件正确注册；关闭"下载前询问"时自动下载到设置目录并加入下载列表；开启时弹出保存对话框，取消也会记录到列表
- **BV号直达**：地址栏支持直接输入B站视频BV号（如 BV1xx411x7xx），自动跳转到对应视频页面

### v1.3
- **桌面歌词零延迟推送**：主进程 Node.js `setInterval(16ms)` 始终以 60fps 推送桌面歌词，渲染端通过 rAF 每帧同步音频时间 `{audioTime, wallClock}`，主进程用墙钟时间插值估算当前音频位置；窗口最小化时主进程继续推送，彻底绕过 Chromium 对渲染进程定时器的节流（`backgroundThrottling: false` 无法阻止节流，且会导致 `visibilitychange` 不触发）
- **移除 visibilitychange 依赖**：不再依赖 `visibilitychange` 事件切换推送模式（Electron 文档明确 `backgroundThrottling: false` 时 Page Visibility API 不报告隐藏状态），改为 `cache-lyric-data` IPC 有歌词时自动启动主进程推送、无歌词时自动停止
- **移除渲染端直接推送**：渲染端 `setLyricText` 不再发送 `updateDesktopLyric`，桌面歌词完全由主进程统一驱动，避免双源冲突
- **停止播放清空歌词**：新增 `clear-desktop-lyric` IPC，停止播放时自动清空桌面歌词文本并停止后台推送

### v1.2
- **大字体加载修复**：改用 ArrayBuffer 直接传递字体数据，Blob URL 作为回退方案，彻底解决 5MB+ 大字体文件（如提瓦特通用文、851手書き雑）加载失败显示默认黑体的问题
- **字重匹配修复**：移除 `applySettings()` 中硬编码的 `fontWeight: '900'`，改为动态使用已加载字体的实际字重，修复浏览器因字重不匹配而忽略自定义字体的问题
- **字体名引号修复**：新增 `quoteFontFamily()` 函数，自动为以数字开头或含特殊字符的字体名添加引号（如 `851tegakizatsu` → `'851tegakizatsu'`），避免 CSS `font-family` 解析失败
- **回退字重逻辑修复**：用 `primaryLoaded` 标志替代 `chain.length` 判断，仅在主字体加载失败时才使用回退字体的字重，避免回退字重错误覆盖主字重
- **字体就绪机制**：新增 `fontsReady` 标志和 `pendingLyricUpdate` 队列，确保字体加载完成后再显示歌词，初始化超时 2 秒后强制解锁
- **F12 开发者工具**：悬浮歌词窗口内按 F12 可打开/关闭 DevTools，方便实时调试字体加载
- **字体列表优化**：网格布局改为单列列表，长字体名自动截断，添加字体预览和语种标签（KR/SC/TC/JP），支持简化名搜索
- **字体名简化**：自动去除字重后缀（Regular/Bold/Light 等）和 `&` 后缀，显示更简洁的字体名
- **字体查找增强**：多级查找策略（精确匹配 → 子串匹配 → 去字重匹配 → 文件名匹配），支持通过字体文件名查找自定义字体
- **自定义协议加载**：使用 `font-asset://` 协议流式读取字体文件，无大小限制
- **竞态条件修复**：`did-finish-load` 延迟从 100ms 调整为 500ms，避免与 HTML 端 `loadSettings()` 的初始加载冲突

### v1.1
- **回退字体支持**：主字体与回退字体使用相同的 @font-face 加载逻辑，字符缺失时自动回退
- **中文字体乱码修复**：改用 Windows 注册表 (reg.exe) 读取字体列表，彻底解决中文字体名乱码导致字体加载失败的问题
- **大字体加载优化**：统一使用 file:// URL 加载字体，支持任意大小的字体文件（无5MB限制）
- **Ctrl+F5 强制刷新**：新增快捷键，忽略缓存强制刷新当前页面
- **右键菜单**：网页区域右键可打开上下文菜单（刷新、复制粘贴、查看源码等）
- **字体加载竞态修复**：添加 token 机制，防止快速切换设置时旧字体覆盖新字体

### v1.0
- **初始版本**：轻量网页浏览器 + 桌面悬浮歌词 + 歌词设置
- **系统字体读取**：支持选择电脑已安装的所有字体
- **卡拉OK模式**：逐字高亮歌词，实时同步播放进度
- **自动跟随关闭**：关闭播放器窗口时悬浮歌词自动关闭

---

## 📜 License
MIT