# 拾穗 Study · Word 导出接口与选项

本文档面向前端。后端已实现 `POST /api/export/mistakes` 与 `POST /api/export/english`，由 Lead 挂载到：

```js
app.use('/api/export', exportRouter);
```

两个接口都要求登录（由全局鉴权负责），返回 `.docx` 二进制。

---

## 1. 接口约定

### 1.1 错题导出

```http
POST /api/export/mistakes
Content-Type: application/json

{
  "ids": ["mistake-id-1", "mistake-id-2"],
  "options": { ... }
}
```

### 1.2 英语佳句导出

```http
POST /api/export/english
Content-Type: application/json

{
  "ids": ["sentence-id-1", "sentence-id-2"],
  "options": { ... }
}
```

### 1.3 返回

成功时：

```http
HTTP/1.1 200 OK
Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
Content-Disposition: attachment; filename="shisui-mistakes-2026-10-24.docx"; filename*=UTF-8''%E6%8B%BE%E7%A9%97-%E9%94%99%E9%A2%98%E9%9B%86-2026-10-24.docx
Content-Length: 123456
```

- 日期取服务器本地日期，格式 `YYYY-MM-DD`。
- 错题 ASCII 文件名：`shisui-mistakes-YYYY-MM-DD.docx`；中文名：`拾穗-错题集-YYYY-MM-DD.docx`。
- 英语 ASCII 文件名：`shisui-english-YYYY-MM-DD.docx`；中文名：`拾穗-英语佳句-YYYY-MM-DD.docx`。
- `title` 只影响文档内标题，不改变下载文件名。

失败时返回项目统一的 JSON 错误结构：

```json
{ "error": "一次最多导出 200 条内容", "code": "TOO_MANY_IDS" }
```

### 1.4 规则

- `ids` 必须是字符串数组，数组最多 **200** 条，重复项会去重。
- 不存在的 id 会跳过。
- `status === 'trashed'` 的记录会跳过；`active`、`pending` 都可导出。
- 如果最终没有任何可导出内容，返回 `400`。
- 单张图片读取失败会跳过该图并继续导出，不会让整份文档失败。

### 1.5 前端保存示例

```js
async function downloadMistakes(ids, options) {
  const res = await fetch('/api/export/mistakes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, options }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || '导出失败');
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const utf8Name = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const fileName = utf8Name
    ? decodeURIComponent(utf8Name[1])
    : `shisui-mistakes-${new Date().toISOString().slice(0, 10)}.docx`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
```

> 同源请求会自动携带登录 Cookie，不需要额外 token 头。

---

## 2. 错题导出 options

### 2.1 完整结构

```json
{
  "title": "错题集",
  "subtitle": "把每一道错题，变成下一次的得分点",

  "includeCover": true,
  "includeOverview": true,
  "includeAnswer": true,
  "includeAnalysis": true,
  "includeMeta": true,
  "includeFigures": true,
  "includeKnowledgePoints": true,
  "includeSource": true,
  "includeErrorReason": true,
  "includeTags": false,
  "includeChapter": true,

  "answerPlacement": "after",
  "includeBlankSpace": false,
  "blankSpace": "medium",

  "groupBy": "subject",
  "sortBy": "created",

  "fontFamily": "宋体",
  "fontSize": 12,
  "headingSize": 16,
  "lineSpacing": 1.5,
  "pageSize": "A4",
  "margin": "normal",
  "showPageNumbers": true,
  "showDate": true,
  "numbered": true,
  "coverStyle": "simple",
  "watermarkText": ""
}
```

### 2.2 通用排版项（两个接口都支持）

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `title` | string | `错题集` / `英语佳句` | 文档主标题，最长 80 字 |
| `subtitle` | string | 各接口默认副标题 | 为空字符串时不显示副标题 |
| `includeCover` | boolean | `true` | 是否生成封面 |
| `includeOverview` | boolean | `true` | 是否生成总览页 |
| `fontFamily` | string | `宋体` | 中文字体：`宋体`、`仿宋`、`楷体`、`微软雅黑`、`黑体` |
| `fontSize` | number | `12` | 正文字号（pt），范围 8–24 |
| `headingSize` | number | `16` | 标题基准字号（pt），范围 10–36 |
| `lineSpacing` | number | `1.5` | 行距倍数，范围 1–3 |
| `pageSize` | string | `A4` | `A4` 或 `B5` |
| `margin` | string | `normal` | `normal` / `narrow` / `wide` |
| `showPageNumbers` | boolean | `true` | 页脚“第 X 页 / 共 Y 页” |
| `showDate` | boolean | `true` | 封面 / 总览 / 页脚中的日期 |
| `numbered` | boolean | `true` | 是否给具体题目 / 佳句编号 |
| `coverStyle` | string | `simple` | `simple`（细线留白）或 `classic`（双线框） |
| `watermarkText` | string | `""` | 页眉浅色提示文字（不是斜向水印），最长 40 字 |

字体映射：

| 前端显示 | 实际 Word 字体 |
| --- | --- |
| 宋体 | `SimSun` |
| 仿宋 | `FangSong` |
| 楷体 | `KaiTi` |
| 微软雅黑 | `Microsoft YaHei` |
| 黑体 | `SimHei` |

中文字体会同时写入 `w:eastAsia`；西文默认 `Times New Roman`，封面和组标题的英文会使用 `Georgia` 作标题字体。

页边距：

| 值 | 上/下 | 左/右 |
| --- | --- | --- |
| `normal` | 25.4 mm | 25.4 mm |
| `narrow` | 12.7 mm | 12.7 mm |
| `wide` | 31.75 mm | 38.1 mm |

### 2.3 错题专属项

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `includeAnswer` | boolean | `true` | 是否输出答案 |
| `includeAnalysis` | boolean | `true` | 是否输出解析 |
| `includeMeta` | boolean | `true` | 是否输出难度、创建日期、科目等元信息 |
| `includeFigures` | boolean | `true` | 是否输出 `figures` 配图；题目 `images` 始终输出 |
| `includeKnowledgePoints` | boolean | `true` | 是否输出知识点 |
| `includeSource` | boolean | `true` | 是否输出来源 |
| `includeErrorReason` | boolean | `true` | 是否输出错因 |
| `includeTags` | boolean | `false` | 是否输出标签 |
| `includeChapter` | boolean | `true` | 是否输出章节 |
| `answerPlacement` | string | `after` | `after`：每题后；`end`：统一放文末“参考答案”页 |
| `includeBlankSpace` | boolean | `false` | 是否在题目后插入重做空间 |
| `blankSpace` | string | `medium` | `small` / `medium` / `large`，约 76 / 118 / 176 pt 高的浅色虚线框 |
| `groupBy` | string | `subject` | `subject` / `source` / `difficulty` / `none` |
| `sortBy` | string | `created` | `created` / `difficulty` / `subject` |

分组与排序细节：

- `groupBy: "subject"`：按语文、数学、英语、物理、化学、生物、政治、历史、地理、其他的顺序，未知科目追加。
- `groupBy: "source"`：按来源名称排序；“未标注来源”放最后。
- `groupBy: "difficulty"`：按难度 1→5 分组，标题自动带“很基础 … 压轴”标签。
- `sortBy: "created"`：创建时间从早到晚。
- `sortBy: "difficulty"`：难度从低到高，同难度按创建时间。
- `sortBy: "subject"`：按上面的科目顺序，再按创建时间。
- 编号是全文连续编号；`numbered: false` 只去掉题号，不影响分组标题。

`answerPlacement`：

- `after`：题目 → 图片 → 重做空间（可选）→ 答案/解析。
- `end`：题目 → 图片 → 重做空间（可选）；全部题目结束后另起一页输出统一“参考答案”。没有答案或解析时不会产生空白参考答案页。

答案和解析会放在浅绿色、左侧带强调线的框内；重做空间是浅色虚线表格，不是单纯的空段落。

### 2.4 错题导出示例

```json
{
  "ids": ["c1d2e3f4-1111-4222-8333-444455556666", "a1b2c3d4-7777-4888-9999-000011112222"],
  "options": {
    "title": "高三数学错题精选",
    "subtitle": "函数、导数与解析几何",
    "includeCover": true,
    "includeOverview": true,
    "includeAnswer": true,
    "includeAnalysis": true,
    "includeMeta": true,
    "includeFigures": true,
    "includeKnowledgePoints": true,
    "includeSource": true,
    "includeErrorReason": true,
    "includeTags": true,
    "includeChapter": true,
    "answerPlacement": "end",
    "includeBlankSpace": true,
    "blankSpace": "large",
    "groupBy": "difficulty",
    "sortBy": "difficulty",
    "fontFamily": "楷体",
    "fontSize": 12,
    "headingSize": 17,
    "lineSpacing": 1.6,
    "pageSize": "A4",
    "margin": "normal",
    "showPageNumbers": true,
    "showDate": true,
    "numbered": true,
    "coverStyle": "classic",
    "watermarkText": "拾穗 Study · 内部资料"
  }
}
```

---

## 3. 英语佳句导出 options

### 3.1 完整结构

```json
{
  "title": "英语佳句",
  "subtitle": "在好句子里，遇见更好的表达",

  "includeCover": true,
  "includeOverview": true,
  "includeTranslation": true,
  "includeUsage": true,
  "includeExample": true,
  "includeExampleTranslation": true,
  "includeSummary": false,
  "includeTags": false,
  "includeSource": true,

  "groupBy": "theme",
  "themeOrder": [],
  "itemOrder": [],
  "layout": "cards",
  "includeThemeIntro": false,
  "quoteMarks": true,

  "fontFamily": "宋体",
  "fontSize": 12,
  "headingSize": 16,
  "lineSpacing": 1.5,
  "pageSize": "A4",
  "margin": "normal",
  "showPageNumbers": true,
  "showDate": true,
  "numbered": true,
  "coverStyle": "simple",
  "watermarkText": ""
}
```

通用排版项与错题接口完全一致（见 2.2）。

### 3.2 英语佳句专属项

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `includeTranslation` | boolean | `true` | 中文翻译 |
| `includeUsage` | boolean | `true` | 用法说明 |
| `includeExample` | boolean | `true` | 英文例句 |
| `includeExampleTranslation` | boolean | `true` | 例句翻译 |
| `includeSummary` | boolean | `false` | 摘要 |
| `includeTags` | boolean | `false` | 标签 |
| `includeSource` | boolean | `true` | 来源 |
| `groupBy` | string | `theme` | `theme` / `date` / `none` |
| `themeOrder` | string[] | `[]` | 自定义主题顺序；未列出的主题按出现顺序追加 |
| `itemOrder` | string[] | `[]` | 自定义篇目顺序（佳句 id）；未列出的按请求 ids 顺序追加 |
| `layout` | string | `cards` | `cards` 浅底卡片；`list` 分隔线清单 |
| `includeThemeIntro` | boolean | `false` | 每个分组下生成一句数量/主题说明 |
| `quoteMarks` | boolean | `true` | 英文句子自动加中文弯引号 `“…”`；已带引号时不重复 |

分组与排序细节：

- `groupBy: "theme"`：按 `themeOrder` 排在前面，未列出的主题按在数据中首次出现的顺序追加；空主题归入“未分类”。
- `groupBy: "date"`：按创建日期分组，日期新的在前；同一天内保留 `itemOrder` / 请求顺序。
- `groupBy: "none"`：不显示分组标题，全文连续排版。
- 英语编号在每个分组内从 `01` 重新开始；`numbered: false` 时不显示编号。
- 卡片式每组内编号、主题说明、卡片间距统一；清单式用分隔线区分篇目。

### 3.3 英语佳句导出示例

```json
{
  "ids": ["s-1111", "s-2222", "s-3333"],
  "options": {
    "title": "高考英语读后续写·佳句摘抄",
    "subtitle": "人物、环境与观点表达",
    "includeCover": true,
    "includeOverview": true,
    "includeTranslation": true,
    "includeUsage": true,
    "includeExample": true,
    "includeExampleTranslation": true,
    "includeSummary": true,
    "includeTags": true,
    "includeSource": true,
    "groupBy": "theme",
    "themeOrder": ["人物描写", "环境描写", "观点表达", "过渡衔接"],
    "itemOrder": ["s-3333", "s-1111", "s-2222"],
    "layout": "cards",
    "includeThemeIntro": true,
    "quoteMarks": true,
    "fontFamily": "宋体",
    "fontSize": 12,
    "headingSize": 16,
    "lineSpacing": 1.5,
    "pageSize": "A4",
    "margin": "normal",
    "showPageNumbers": true,
    "showDate": true,
    "numbered": true,
    "coverStyle": "simple",
    "watermarkText": "拾穗 Study"
  }
}
```

---

## 4. Markdown 与 LaTeX 的处理

AI 生成的题目、答案、解析通常是 Markdown + LaTeX。导出时会做轻量转换，不会把原始标记直接印进 Word。

支持：

- 标题：`#` 到 `######`
- 无序列表：`-`、`*`、`+`
- 有序列表：`1.`、`1)`
- 粗体：`**文字**`、`__文字__`
- 斜体：`*文字*`、`_文字_`
- 行内代码：反引号
- 引用：`>`
- 围栏代码块：三反引号
- 链接：`[文字](url)`（只保留文字，不生成可点击链接）
- 表格：GFM 管道表格
- 分隔线：`---`、`***`
- 换行：段落换行、`<br>`

LaTeX 支持：

- 去掉 `$`、`$$`、`\(`、`\)`、`\[`、`\]`
- 分数：`\frac{a}{b}` → `a/b`；分母为多字符时自动加括号，如 `1/(2a)`
- 根号：`\sqrt{x}` → `√(x)`，`\sqrt[3]{x}` → `∛(x)`
- 常用希腊字母与运算符：`\alpha`、`\beta`、`\theta`、`\pi`、`\Delta`、`\times`、`\cdot`、`\div`、`\le`、`\ge`、`\ne`、`\pm`、`\infty`、`\rightarrow`、`\Rightarrow`、`\angle`、`\triangle`、`\perp`、`\parallel`
- 常用函数名：`\sin`、`\cos`、`\tan`、`\ln`、`\log`、`\lim` 等
- `\text{}`、`\mathrm{}` 等外壳会去掉，只保留内容
- 上下标尽量转成 Unicode：`x^2` → `x²`，`v_0` → `v₀`

已知限制：不是完整 TeX 引擎。复杂矩阵、多行对齐、化学式宏包等会被降级为可读文本；不会报错，但排版精度有限。

---

## 5. 图片处理

- 题目图片来自 `images`，按 `config.uploadDir` 读取；URL 只取 basename，防止路径穿越。
- `includeFigures: true` 时追加 `figures` 配图，按 URL 去重。
- 支持 JPEG / PNG / GIF / BMP，按页面可用宽度等比缩放，居中，带图注。
- 图片元数据宽高缺失时用 `image-size` 读取文件头；仍失败时用 480×320 兜底。
- **WebP 无法被当前 `docx` 版本嵌入**：会跳过该图，并在服务端控制台输出 `[export] docx 不支持 webp...` 提示；导出本身继续。
- 图片文件不存在或格式无法识别时跳过单图，不影响整份文档。
- `figureHints` 的 bbox 目前不用于裁剪，导出的是原图；图注优先使用 `caption` / `name`，没有时自动编号“图 N”。

---

## 6. 已知限制

1. 一次最多 200 条，避免单次生成过大文档。
2. `watermarkText` 是页眉浅色文字，不是 Word 的斜向水印对象。
3. 封面也计入总页数，因此封面后第一页的页码从“第 2 页”开始；封面页本身不显示页脚。
4. 高级 LaTeX 结构（矩阵、cases 对齐、化学宏包）会降级为纯文本。
5. Markdown 链接只保留显示文字，不生成 Word 超链接；外链图片只显示占位文字，实际图片请使用数据层的 `images` / `figures`。
6. WebP 需要先在服务端转成 PNG/JPEG 才能进入 Word；当前不引入新依赖，所以选择跳过并提示。
