import type { RowDataPacket } from 'mysql2/promise';
import { select } from '../db/pool.ts';

/** items 表一行。字段与 DragonNest.items 保持一致。 */
export interface ItemRow extends RowDataPacket {
  item_id: number;
  name_zh: string | null;
  description_zh: string | null;
  item_type: number | null;
  category_zh: string | null;
  item_category_type: number | null;
  item_category_zh: string | null;
  table_family: string;
  level_limit: number | null;
  need_job_class: string | null;
  rank: number | null;
  icon_index: number | null;
  icon_file: string | null;
  source_table: string;
}

interface CountRow extends RowDataPacket {
  total: number | string;
}

/** 显式列出字段，避免表结构变动时接口输出跟着漂移。全部加反引号，避开保留字（如 rank）。 */
const ITEM_COLUMNS = [
  'item_id',
  'name_zh',
  'description_zh',
  'item_type',
  'category_zh',
  'item_category_type',
  'item_category_zh',
  'table_family',
  'level_limit',
  'need_job_class',
  'rank',
  'icon_index',
  'icon_file',
  'source_table',
]
  .map((column) => `\`${column}\``)
  .join(', ');

/** 关键词参与模糊匹配的列。 */
const SEARCH_COLUMNS = ['name_zh', 'description_zh', 'category_zh'] as const;

export interface ItemQuery {
  page: number;
  pageSize: number;
  /** 已 trim 过的关键词；null 表示不过滤。 */
  keyword: string | null;
}

export interface ItemPage {
  items: ItemRow[];
  total: number;
}

/**
 * 转义 LIKE 的通配符，避免用户输入 `%`、`_` 时把整表查出来。
 * 用 '!' 作为转义符（SQL 里显式声明 ESCAPE '!'），不受 NO_BACKSLASH_ESCAPES 影响。
 */
function escapeLike(value: string): string {
  return value.replace(/[!%_]/g, (char) => `!${char}`);
}

/** 分页查询 items，keyword 非空时按名称/描述/分类模糊搜索。 */
export async function findItems({ page, pageSize, keyword }: ItemQuery): Promise<ItemPage> {
  let whereSql = '';
  const whereParams: unknown[] = [];

  if (keyword) {
    const conditions = SEARCH_COLUMNS.map((column) => `\`${column}\` LIKE ? ESCAPE '!'`);
    whereSql = `WHERE (${conditions.join(' OR ')})`;

    const pattern = `%${escapeLike(keyword)}%`;
    whereParams.push(...SEARCH_COLUMNS.map(() => pattern));
  }

  const offset = (page - 1) * pageSize;

  const [items, countRows] = await Promise.all([
    select<ItemRow>(
      `SELECT ${ITEM_COLUMNS} FROM items ${whereSql} ORDER BY item_id ASC LIMIT ? OFFSET ?`,
      [...whereParams, pageSize, offset],
    ),
    select<CountRow>(`SELECT COUNT(*) AS total FROM items ${whereSql}`, whereParams),
  ]);

  return { items, total: Number(countRows[0]?.total ?? 0) };
}
