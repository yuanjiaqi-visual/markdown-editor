![image](file:///D:/14158/Documents/program/html/markdown/assets/522554e4-1b47-4bc8-bc7f-27ed05f4eb08.png)

# Markdown Editor

所见即所得 Markdown 桌面编辑器，类似 Typora 的交互体验。基于 Electron + Milkdown (ProseMirror) 构建。

## 功能

* **WYSIWYG 编辑**: 输入 Markdown 源码，光标离开后自动渲染

* **全语法支持**: 标题、粗体/斜体/删除线、列表、引用、表格、任务列表、数学公式 (LaTeX)、代码高亮

* **文件管理**: 打开/保存 .md 文件，与 .md 文件关联

* **浮动大纲**: 右侧面板显示标题树，点击跳转，当前位置高亮

* **图片粘贴**: 剪贴板图片自动保存到文档同目录的 assets/ 下

* **公式编辑**: 输入 $...$ 或 $...$ 自动渲染，点击弹出编辑窗

* **链接跳转**: Ctrl + 点击在浏览器中打开链接

* **图片编辑**: 点击图片可修改地址、描述、宽度

* **导出 PDF**

* **中文界面**

## 快捷键

| 快捷键          | 功能     |
| ------------ | ------ |
| Ctrl+N       | 新建     |
| Ctrl+O       | 打开     |
| Ctrl+S       | 保存     |
| Ctrl+Shift+S | 另存为    |
| Ctrl+Shift+E | 导出 PDF |
| Ctrl+Z       | 撤销     |
| Ctrl+Shift+Z | 重做     |
| Ctrl+B       | 加粗     |
| Ctrl+I       | 斜体     |
| Ctrl+D       | 删除线    |

## 开发

```bash
# 安装依赖
npm install

# 启动开发环境
npm run dev

# 构建
npm run build

# 打包 Windows 安装包
npm run dist
```

## 技术栈

| 层           | 技术                        |
| ----------- | ------------------------- |
| 桌面框架        | Electron                  |
| 编辑器         | Milkdown v7 (ProseMirror) |
| Markdown 解析 | remark + commonmark + gfm |
| 数学公式        | KaTeX + remark-math       |
| 代码高亮        | Prism (refractor)         |
| 语法          | TypeScript                |
| 打包          | electron-builder          |

## 项目结构

```
src/
├── main/           # Electron 主进程
│   ├── index.ts    # 窗口/菜单/单实例锁
│   ├── file.ts     # 文件读写/图片保存/PDF导出 IPC
│   └── preload.ts  # contextBridge API
└── renderer/       # 渲染进程 (UI)
    ├── index.html  # HTML 布局
    ├── index.ts    # 文件操作/工具栏/状态栏/粘贴/快捷键
    ├── types.d.ts  # 类型声明
    └── editor/
        ├── setup.ts   # Milkdown 配置与插件注册
        ├── math.ts    # LaTeX 公式支持
        └── style.css  # 编辑器样式
```

## License

MIT
