# DNsearch-backend

DNsearch 后端服务：**Node.js + TypeScript + Express 5 + MySQL（mysql2 连接池，原生 SQL）**。

TypeScript 由 Node 直接执行（原生类型擦除，无需 tsx/nodemon），`tsc` 只用于类型检查与生产构建。

## 环境要求

- Node.js **>= 22.18**（当前开发环境 v26.13.0）
- MySQL **5.7+ / 8.x**

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（首次）
copy .env.example .env      # Windows
# cp .env.example .env      # macOS / Linux

# 3. 验证数据库连接
npm run db:check

# 4. 启动开发服务（文件变更自动重启）
npm run dev
```

启动后用健康检查确认：

```bash
curl http://localhost:3000/api/health
```

## 数据库连接：按环境自动切换

| 环境 | `NODE_ENV` | 实际连接 |
| --- | --- | --- |
| 开发 / 本地测试 | 其他值（默认 `development`） | `DB_HOST_DEV`（47.106.37.94） |
| 正式环境 | `production` | `DB_HOST_PROD`（127.0.0.1） |

切换只需改变量，不用改代码：

```bash
# 本地连远程测试库
npm run dev

# 正式环境连本机库
set NODE_ENV=production && npm start     # Windows
# NODE_ENV=production npm start          # macOS / Linux
```

## 接口

### GET /dragonnest/items

分页查询 `DragonNest.items`（当前 180,171 条），支持关键词搜索。

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `page` | 正整数 | `1` | 页码，从 1 开始 |
| `pageSize` | 正整数 | `20` | 每页条数，**上限 100**（超出按 100 返回） |
| `q` | 字符串 | 无 | 关键词，模糊匹配 `name_zh` / `description_zh` / `category_zh`，最长 50 字 |

```bash
# 第一页，每页 20 条
curl "http://localhost:3000/dragonnest/items?page=1&pageSize=20"

# 搜索「长剑」
curl "http://localhost:3000/dragonnest/items?q=长剑&page=1&pageSize=20"

# 搜索「武器」并翻到第 2 页
curl "http://localhost:3000/dragonnest/items?q=武器&page=2&pageSize=10"
```

响应：

```json
{
  "items": [
    {
      "item_id": 1,
      "name_zh": "新手用长剑",
      "description_zh": null,
      "item_type": 0,
      "category_zh": "武器",
      "item_category_type": null,
      "item_category_zh": null,
      "table_family": "base",
      "level_limit": 1,
      "need_job_class": "1",
      "rank": 0,
      "icon_index": 43,
      "icon_file": "icons/43.png",
      "source_table": "itemtable.dnt"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 2,
    "total": 180171,
    "totalPages": 90086,
    "hasPrev": false,
    "hasNext": true
  },
  "query": { "q": null },
  "tookMs": 126
}
```

出错时统一返回 `{"error":{"message":"..."}}`：

| 情况 | 状态码 | message |
| --- | --- | --- |
| `page` / `pageSize` 非正整数 | 400 | `page 必须是正整数` |
| `pageSize=0` | 400 | `pageSize 必须大于 0` |
| `q` 超过 50 字 | 400 | `q 最长 50 个字符` |
| 路由不存在 | 404 | `接口不存在：GET /xxx` |

**性能参考**（实测，远程测试库）：空关键词翻页 ~40-130ms；关键词搜索 ~220-380ms（`LIKE '%kw%'` 走全表扫描，180k 行量级下可接受；数据量再涨建议加全文索引或搜索引擎）。

### GET /api/health

服务与数据库探活。DB 正常返回 200 / `database.status: "up"`，连不上返回 503 / `"down"` 并附带原因。

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 开发模式，`node --watch` 热重启 |
| `npm run typecheck` | 只做类型检查，不产出文件 |
| `npm run build` | 编译到 `dist/` |
| `npm start` | 运行编译后的 `dist/index.js` |
| `npm run db:check` | 单独验证 MySQL 连接与版本 |

## 部署

生产环境用 Docker Compose + Nginx 部署，完整步骤（装 Docker、配安全组、HTTPS、升级回滚、排错）见 **[DEPLOY.md](DEPLOY.md)**。

```bash
cp deploy/env.production.example .env.production    # 填正式库密码
docker compose up -d --build
curl http://127.0.0.1:3000/api/health
```

## 目录结构

```
src/
├── index.ts                    # 入口：启动 HTTP、探活 DB、优雅退出
├── app.ts                      # 组装 Express 应用（中间件 + 路由）
├── config/
│   └── env.ts                  # 环境变量读取 + 按环境选择数据库地址
├── db/
│   └── pool.ts                 # mysql2 连接池 + select / mutate / 事务封装
├── repositories/
│   └── items.ts                # items 表的 SQL：分页 + 关键词搜索
├── middlewares/
│   └── error-handler.ts        # 访问日志、404、全局错误处理
├── routes/
│   ├── health.ts               # GET /api/health
│   └── dragonnest-items.ts     # GET /dragonnest/items
├── scripts/
│   └── check-db.ts             # 数据库连通性自检
└── utils/
    └── http-error.ts           # HttpError 及快捷构造器

Dockerfile                      # 多阶段构建（依赖 → 编译 → 运行时镜像）
docker-compose.yml              # 生产编排（host 网络 + 环境变量注入 + 日志轮转）
deploy/
├── env.production.example      # 生产环境变量模板
└── nginx-dnsearch.conf         # Nginx 反向代理配置
DEPLOY.md                       # 部署手册
```

## 数据库用法

`src/db/pool.ts` 暴露四个封装，业务代码里直接用，不要自己 `getConnection`：

```ts
import { select, mutate, withTransaction } from '../db/pool.ts';
import type { RowDataPacket } from 'mysql2/promise';

interface UserRow extends RowDataPacket {
  id: number;
  name: string;
}

// 查询（必须用 ? 占位符传参，禁止拼接 SQL）
const users = await select<UserRow>('SELECT id, name FROM users WHERE status = ? LIMIT ?', [1, 20]);

// 写入（返回 insertId / affectedRows）
const result = await mutate('INSERT INTO users (name) VALUES (?)', ['alice']);

// 事务：回调抛错自动回滚
await withTransaction(async (conn) => {
  await conn.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [100, 1]);
  await conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [100, 2]);
});
```

## 新增一个接口

1. `src/repositories/` 里写 SQL 函数；
2. `src/routes/` 里写 Router，做参数校验；
3. `src/app.ts` 里 `app.use('/xxx', xxxRouter)`；
4. 需要返回错误时 `throw badRequest('参数错误')`，全局错误处理器会转成 `400 {"error": {...}}`。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `development` | 决定连哪个库；`production` 时 5xx 错误只返回通用信息 |
| `HOST` | `0.0.0.0` | 监听地址；`127.0.0.1` 表示只允许本机访问（配合 Nginx 反代） |
| `PORT` | `3000` | HTTP 端口 |
| `DB_HOST_DEV` | `47.106.37.94` | **开发/测试**库地址 |
| `DB_HOST_PROD` | `127.0.0.1` | **正式**库地址 |
| `DB_PORT` | `3306` | MySQL 端口 |
| `DB_USER` | - | **必填**，账号 |
| `DB_PASSWORD` | 空 | 密码 |
| `DB_DATABASE` | - | **必填**，库名 `DragonNest` |
| `DB_POOL_SIZE` | `10` | 连接池上限 |

缺少必填项时服务会直接报错退出，并提示变量名。

## 约定与注意事项

- **只用参数化查询**：第二个参数传数组，避免 SQL 注入；`q` 里的 `%`、`_` 已做转义（`ESCAPE '!'`），不会被当通配符。
- 列名统一加反引号：`items.rank` 是 MySQL 8 保留字，不加引号会语法报错。
- `.env` 已在 `.gitignore` 中，**不要**把真实密码提交到仓库；部署环境用系统环境变量覆盖。
- 时间字段：mysql2 默认按本地时区解析 `DATETIME`，如需固定 UTC 在 `pool.ts` 的 `createPool` 中加 `timezone: 'Z'`。
- 关闭服务时按 `Ctrl+C`，会先关 HTTP 再释放连接池（10 秒兜底强制退出）。
