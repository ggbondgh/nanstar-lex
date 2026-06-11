# NanStar Lex

南星词轨，个人英语词句训练网页应用。属于 `南星 Nathan` 个人品牌体系，由 `ZN Cosmos` 出品。

当前能力包含单词/短语练习、句子练习、导入、文件夹、标签、收藏、统计和 Supabase 同步。

## 内置书库

内置书库位于“内置书库”页面，分为单词词书和句子词书。加入后会单独进入内置库，不会混入个人导入文件夹。

单词词书由 [ECDICT](https://github.com/skywind3000/ECDICT) 的开源数据生成，遵循 MIT License。

已生成的词书包括中考、高考、CET-4、CET-6、考研、IELTS、TOEFL 和 GRE。词书只作为学习辅助词表，不表示官方完整题库。

句子词书由 [Tatoeba](https://tatoeba.org/) 英中句子对筛选生成，遵循 CC-BY 2.0 FR。当前内置高频基础句、日常口语句、旅行场景句、工作沟通句和写作连接句。每条句子保留 Tatoeba 英文句子 ID 和中文句子 ID，详见 `data/sentence-packs/NOTICE.md`。

重新生成单词词书资产：

```powershell
cd "D:\Super English"
node tools\build-word-packs.js
```

重新生成句子词书资产：

```powershell
cd "D:\Super English"
python tools\build-sentence-packs.py
```

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

## Android APK 自用包

项目已接入 Capacitor，Android 包名为：

```text
com.zncosmos.nanstarlex
```

自用 APK 推荐从 GitHub Actions 下载：

1. 打开 GitHub 仓库的 `Actions` 页面。
2. 选择 `Android APK` workflow。
3. 打开最新一次成功运行。
4. 在 `Artifacts` 下载 `nanstar-lex-debug-apk`。
5. 解压后把 `app-debug.apk` 发到安卓手机安装。

后续升级时，只要包名和签名不变，直接安装新版 APK 会覆盖旧版。仓库内保留了自用调试签名 `android/app/nanstar-debug.keystore`，GitHub Actions 会用同一签名并自动递增 `versionCode`，适合自用测试。

如果要在本机打包，需要先安装 Android Studio 或至少配置 Java 21 与 Android SDK，然后运行：

```powershell
cd "D:\Super English"
npm install
npm run android:debug
```

生成位置：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

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

1. 在 GitHub 创建一个空仓库，推荐命名为 `nanstar-lex`。
2. 不要勾选初始化 README、`.gitignore` 或 license，因为本地项目已经包含这些文件。
3. 把 GitHub 给出的仓库地址发给 Codex，例如：

```text
https://github.com/你的用户名/nanstar-lex.git
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
