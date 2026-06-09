# Super English

个人英语训练网页应用，包含单词/短语练习、句子练习、导入、文件夹、标签、收藏、统计和 Supabase 同步。

## 本地运行

在项目目录启动静态服务：

```powershell
cd "D:\Super English"
python -m http.server 4175 --bind 0.0.0.0
```

电脑访问：

```text
http://127.0.0.1:4175/index.html
```

同一 Wi-Fi 下手机访问：

```text
http://你的电脑局域网IP:4175/index.html
```

不要混用 `file:///D:/Super English/index.html` 和 HTTP 地址，因为浏览器会把它们当成不同站点，本地数据和登录状态不会互通。

## Supabase 同步

第一次使用同步前，在 Supabase SQL Editor 中运行：

```text
supabase-schema.sql
```

然后在应用左侧同步面板填写：

- Project URL
- anon public key
- 邮箱
- 密码

数据仍保存在浏览器本地，点击同步或自动同步时会和 Supabase 互通。

## GitHub + Cloudflare Pages 部署

推荐流程：

1. 在 GitHub 创建一个空仓库，例如 `super-english`。
2. 不要勾选初始化 README、`.gitignore` 或 license，因为本地项目已经包含这些文件。
3. 把 GitHub 给出的仓库地址发给 Codex，例如：

```text
https://github.com/你的用户名/super-english.git
```

4. 本地推送到 GitHub 后，进入 Cloudflare Pages 创建项目。
5. 选择 `Connect to Git`，绑定这个 GitHub 仓库。
6. 构建设置使用静态站点配置：

```text
Framework preset: None
Build command: 留空
Build output directory: /
```

7. 部署完成后，会得到一个 `https://xxx.pages.dev` 地址。
8. 回到 Supabase，进入 Authentication 的 URL Configuration：

```text
Site URL: https://xxx.pages.dev
Redirect URLs: https://xxx.pages.dev/**
```

如果只给自己用，注册好自己的账号后，建议在 Supabase Auth 设置里关闭新用户注册。
