# Obsidian Web Clipper Enhanced

An enhanced version of [Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper) with native **Feishu / Lark** document support. Clip web pages, Feishu docs, and wiki pages directly into Obsidian as well-formatted Markdown.

[中文说明](#中文说明)

## Features

All original Obsidian Web Clipper features, plus:

- **Feishu / Lark document clipping** via Open API
  - Supports `/docx/` documents and `/wiki/` pages
  - Structured block-to-markdown conversion (headings, lists, tables, code blocks, callouts, etc.)
  - Embedded spreadsheet content rendered as markdown tables
  - Document comments included as a dedicated section
  - Board / whiteboard preview images
  - OAuth 2.0 user authorization (device flow)
- **Encrypted credential storage** — App Secret is encrypted with AES-GCM 256-bit before being saved to browser sync storage
- **Stable extension ID** for easy team deployment (fixed `key` in manifest)

## Installation

### From source (recommended)

1. Clone this repository:
   ```bash
   git clone https://github.com/huiqimao/obsidian-clipper-enhanced.git
   cd obsidian-clipper-enhanced
   ```

2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

3. Load in Chrome / Edge / Arc / Brave:
   - Navigate to `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked** and select the `dist` directory

4. Load in Firefox:
   - Navigate to `about:debugging#/runtime/this-firefox`
   - Click **Load Temporary Add-on**
   - Select `dist_firefox/manifest.json`

### From release

Download the latest `.zip` from the [Releases](https://github.com/huiqimao/obsidian-clipper-enhanced/releases) page, extract it, and load unpacked as above.

## Feishu / Lark Setup

To clip Feishu documents, you need to configure a Feishu Open Platform app:

### Step 1: Create a Feishu App

1. Go to [Feishu Open Platform](https://open.feishu.cn/app) (or [Lark Developer](https://open.larksuite.com/app))
2. Click **Create Custom App**
3. Note down the **App ID** and **App Secret**

### Step 2: Configure App Permissions

In your app settings, go to **Permissions & Scopes** and enable:

| Scope | Description |
| --- | --- |
| `docx:document:readonly` | Read document content |
| `docs:document.comment:read` | Read document comments |
| `sheets:spreadsheet:read` | Read embedded spreadsheet values |
| `wiki:wiki:readonly` | Access wiki pages |

### Step 3: Add Redirect URI

Go to **Security Settings > Redirect URLs** and add:

```
https://adeilbhoblklgdlegpdlkmjbmgmpblif.chromiumapp.org/
```

> This URI is fixed for all installations of this extension. You can also find it in the extension's Feishu settings panel.

### Step 4: Configure the Extension

1. Open the extension settings (click the gear icon)
2. Go to **Feishu / Lark** section
3. Enter your **App ID** (must start with `cli_`) and **App Secret**
4. The extension validates both fields before saving — a red message appears if the format looks wrong
5. Click **Authorize** and sign in with your Feishu account

> **Security note:** Your App Secret is encrypted with AES-GCM 256-bit (Web Crypto API) before being written to browser storage. The encryption key is derived from the extension's own installation ID, so the ciphertext is unreadable to other extensions or casual storage inspection.

### Step 5: Clip a Document

Navigate to any Feishu document (`/docx/...`) or wiki page (`/wiki/...`) and click the clipper icon. The extension will:

1. Fetch the document content via the Feishu Open API
2. Convert it to well-formatted Markdown
3. Send it to Obsidian

## Supported Feishu Block Types

| Category | Types |
| --- | --- |
| Text | Paragraphs, Headings (h1-h9), Bold, Italic, Strikethrough, Inline code, Links |
| Lists | Bullet lists, Ordered lists, Todo / checkbox items (with nesting) |
| Code | Fenced code blocks with language detection (75 languages) |
| Quotes | Block quotes, Quote containers, Callouts (NOTE/TIP/WARNING/IMPORTANT) |
| Tables | Native tables with merged cell support, Embedded spreadsheets |
| Media | Images, Board / whiteboard previews, File attachments |
| Embeds | Bitable (database), Sheets, iframes, Jira issues, Diagrams, Mindnotes |
| Structure | Grid columns, OKR blocks, Agenda items, Synced blocks |
| Meta | Dividers, Comments (appended as numbered section) |

## Development

```bash
npm install       # Install dependencies
npm run build     # Build for all platforms (dist/, dist_firefox/, dist_safari/)
npm test          # Run tests
npm run test:watch # Run tests in watch mode
```

## Third-party Libraries

- [webextension-polyfill](https://github.com/mozilla/webextension-polyfill) for browser compatibility
- [defuddle](https://github.com/kepano/defuddle) for content extraction and Markdown conversion
- [dayjs](https://github.com/iamkun/dayjs) for date parsing and formatting
- [lz-string](https://github.com/pieroxy/lz-string) for template compression
- [lucide](https://github.com/lucide-icons/lucide) for icons
- [dompurify](https://github.com/cure53/DOMPurify) for HTML sanitization

## License

Based on [Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper). See [LICENSE](LICENSE) for details.

---

# 中文说明

# Obsidian Web Clipper 增强版

基于 [Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper) 的增强版本，原生支持**飞书/Lark**文档。可以将网页、飞书文档和知识库页面直接剪藏到 Obsidian 中，保持良好的 Markdown 格式。

## 功能特性

包含原版 Obsidian Web Clipper 的所有功能，另外新增：

- **飞书/Lark 文档剪藏**（通过开放 API）
  - 支持 `/docx/` 文档和 `/wiki/` 知识库页面
  - 结构化的块到 Markdown 转换（标题、列表、表格、代码块、高亮块等）
  - 嵌入式电子表格内容渲染为 Markdown 表格
  - 文档评论作为独立章节收录
  - 画板/白板预览图
  - OAuth 2.0 用户授权（设备流程）
- **凭证加密存储** — App Secret 在写入浏览器同步存储前，使用 AES-GCM 256 位加密
- **固定的扩展 ID**，方便团队统一部署

## 安装方法

### 从源码安装（推荐）

1. 克隆仓库：
   ```bash
   git clone https://github.com/huiqimao/obsidian-clipper-enhanced.git
   cd obsidian-clipper-enhanced
   ```

2. 安装依赖并构建：
   ```bash
   npm install
   npm run build
   ```

3. 在 Chrome / Edge / Arc / Brave 中加载：
   - 打开 `chrome://extensions`
   - 开启**开发者模式**
   - 点击**加载已解压的扩展程序**，选择 `dist` 目录

4. 在 Firefox 中加载：
   - 打开 `about:debugging#/runtime/this-firefox`
   - 点击**临时加载附加组件**
   - 选择 `dist_firefox/manifest.json`

### 从 Release 安装

从 [Releases](https://github.com/huiqimao/obsidian-clipper-enhanced/releases) 页面下载最新的 `.zip` 文件，解压后按上述方式加载。

## 飞书/Lark 配置

要剪藏飞书文档，需要配置飞书开放平台应用：

### 第一步：创建飞书应用

1. 访问[飞书开放平台](https://open.feishu.cn/app)（或 [Lark Developer](https://open.larksuite.com/app)）
2. 点击**创建企业自建应用**
3. 记录 **App ID** 和 **App Secret**

### 第二步：配置应用权限

在应用设置中，进入**权限管理**，开启以下权限：

| 权限 | 说明 |
| --- | --- |
| `docx:document:readonly` | 查看新版文档 |
| `docs:document.comment:read` | 获取云文档中的评论 |
| `sheets:spreadsheet:read` | 查看电子表格 |
| `wiki:wiki:readonly` | 查看知识库 |

### 第三步：添加重定向 URI

进入**安全设置 > 重定向 URL**，添加：

```
https://adeilbhoblklgdlegpdlkmjbmgmpblif.chromiumapp.org/
```

> 此 URI 对所有安装此扩展的用户通用。也可以在扩展的飞书设置面板中查看。

### 第四步：配置扩展

1. 打开扩展设置（点击齿轮图标）
2. 进入 **Feishu / Lark** 部分
3. 输入 **App ID**（须以 `cli_` 开头）和 **App Secret**
4. 扩展会在保存前自动校验格式，格式有误时会显示红色提示
5. 点击 **Authorize** 并使用飞书账号登录授权

> **安全说明：** App Secret 在写入浏览器存储前，会使用 AES-GCM 256 位（Web Crypto API）加密。加密密钥来源于扩展自身的安装 ID，其他扩展或直接查看存储内容均无法读取明文。

### 第五步：剪藏文档

打开任意飞书文档（`/docx/...`）或知识库页面（`/wiki/...`），点击剪藏图标。扩展会：

1. 通过飞书开放 API 获取文档内容
2. 转换为格式良好的 Markdown
3. 发送到 Obsidian

## 支持的飞书块类型

| 类别 | 类型 |
| --- | --- |
| 文本 | 段落、标题（h1-h9）、加粗、斜体、删除线、行内代码、链接 |
| 列表 | 无序列表、有序列表、待办事项（支持嵌套） |
| 代码 | 围栏代码块，自动识别语言（75种） |
| 引用 | 块引用、引用容器、高亮块（NOTE/TIP/WARNING/IMPORTANT） |
| 表格 | 原生表格（支持合并单元格）、嵌入式电子表格 |
| 媒体 | 图片、画板/白板预览、文件附件 |
| 嵌入 | 多维表格、电子表格、iframe、Jira 问题、流程图、思维笔记 |
| 结构 | 分栏、OKR、议程、同步块 |
| 其他 | 分割线、评论（作为编号列表附在文末） |

## 开发

```bash
npm install        # 安装依赖
npm run build      # 构建所有平台（dist/、dist_firefox/、dist_safari/）
npm test           # 运行测试
npm run test:watch # 监听模式运行测试
```
