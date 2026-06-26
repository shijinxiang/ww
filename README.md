# 习概刷题网站

这是一个**纯静态**刷题网站，数据来自两份 Word 题库：`习概1-8.docx` 与 `习概9-17.docx`。不需要后端、不需要数据库，上传到 GitHub Pages 就能作为个人网站访问。

## 功能

- 共 18 个单元、379 道题。
- 支持单选题、多选题、判断题。
- 支持按单元、题型、错题、收藏筛选练习。
- 支持随机出题、原始顺序出题。
- 自动记录本机浏览器里的练习次数、正确率、错题本、收藏题。
- 支持题库关键词检索。
- 适配手机和电脑。

## 本地预览

直接双击 `index.html` 即可预览。也可以在项目目录运行：

```bash
python -m http.server 8000
```

然后打开：

```text
http://localhost:8000
```

## 部署到 GitHub 个人网站

### 方法一：个人主页仓库

1. 新建一个仓库，仓库名必须是：`你的GitHub用户名.github.io`。
2. 把本项目里的全部文件上传到仓库根目录。
3. 等待 GitHub Pages 自动发布。
4. 访问：`https://你的GitHub用户名.github.io/`。

### 方法二：普通项目仓库

1. 新建任意仓库，例如：`xi-gai-quiz`。
2. 把本项目里的全部文件上传到仓库根目录。
3. 进入仓库 `Settings` → `Pages`。
4. Source 选择 `Deploy from a branch`。
5. Branch 选择 `main`，目录选择 `/root`，保存。
6. 访问 GitHub Pages 页面给出的地址，通常是：`https://你的GitHub用户名.github.io/xi-gai-quiz/`。

## 目录结构

```text
.
├── index.html      # 页面结构
├── styles.css      # 样式
├── app.js          # 刷题逻辑
├── questions.js    # 题库数据
├── .nojekyll       # 避免 GitHub Pages 使用 Jekyll 处理
└── README.md       # 说明文档
```

## 说明

本项目所有记录都保存在浏览器 `localStorage` 中。如果换设备、换浏览器或清空浏览器数据，错题本与练习记录不会自动同步。
