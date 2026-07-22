# 小红书浏览器采集插件

这是一个纯浏览器扩展，不安装本地服务，不创建定时任务，不使用 LaunchAgent。

## 安装

在 Chrome 或 Edge 扩展管理页开启开发者模式，加载这个目录：

`/Users/bgdesigner/Documents/Obsidian小红书笔记知识库/10 Projects/小红书浏览器采集插件/extension`

## 第一次使用

1. 点击扩展按钮。
2. 点“选择收件箱”。
3. 选择这个文件夹：

   `/Users/bgdesigner/Documents/Obsidian小红书笔记知识库/90 Assets/XHS References/浏览器采集收件箱`

## 保存位置

图片会保存到：

`90 Assets/XHS References/浏览器采集收件箱/YYYY-MM-DD/`

只保存图片文件，不生成 `.md` 或 `.json` 元数据文件。

## 设计原则

- 不启动后台服务。
- 不安装自动化任务。
- 不改变 Codex 工作目录。
- 不创建 symlink。
- 失败时只影响浏览器扩展本身，不会让 Codex 任务变成长时间运行状态。
