# 每个项目如何接入 Obsidian

推荐做法：把这个目录作为唯一 Obsidian 仓库，然后在 `10 Projects` 下面为每个项目建一个入口笔记。

## 新项目接入步骤

1. 在 `10 Projects` 下创建项目文件夹
2. 用 `80 Templates/项目模板.md` 创建项目入口笔记
3. 在项目入口笔记里填写真实项目路径
4. 把入口笔记链接到 `10 Projects/_Index/项目索引.md`

## 示例

如果项目在：

`/Users/bgdesigner/Documents/MyApp`

可以创建：

`10 Projects/MyApp/MyApp.md`

并在笔记中写：

```md
路径：/Users/bgdesigner/Documents/MyApp
```

## 为什么推荐这种方式

- Obsidian 配置只维护一份
- 所有项目笔记可以互相链接
- 搜索、标签、关系图都在同一个知识库里
- 不会在每个代码项目里塞一份 `.obsidian` 配置

## 如果一定要在项目目录里打开 Obsidian

也可以把某个项目文件夹单独作为 Obsidian 仓库打开，但那样每个项目都需要自己的 `.obsidian` 配置。除非项目笔记必须跟代码放在一起，否则不建议这么做。
