import { Router } from 'express';
import { findItems } from '../repositories/items.ts';
import { badRequest } from '../utils/http-error.ts';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_KEYWORD_LENGTH = 50;

function readPositiveInt(raw: unknown, field: string, fallback: number): number {
  if (raw === undefined) return fallback;

  if (typeof raw !== 'string' || !/^\d+$/.test(raw.trim())) {
    throw badRequest(`${field} 必须是正整数`);
  }

  const value = Number(raw.trim());
  if (!Number.isSafeInteger(value) || value < 1) {
    throw badRequest(`${field} 必须大于 0`);
  }
  return value;
}

function readKeyword(raw: unknown): string | null {
  if (raw === undefined) return null;

  if (typeof raw !== 'string') {
    throw badRequest('q 只能传一个字符串');
  }

  const keyword = raw.trim();
  if (keyword.length > MAX_KEYWORD_LENGTH) {
    throw badRequest(`q 最长 ${MAX_KEYWORD_LENGTH} 个字符`);
  }
  return keyword.length > 0 ? keyword : null;
}

export const dragonNestRouter: Router = Router();

/**
 * GET /dragonnest/items
 * 分页查询 items 表，支持关键词搜索。
 *
 * 查询参数：
 *   page     页码，从 1 开始（默认 1）
 *   pageSize 每页条数（默认 20，最大 100）
 *   q        关键词，模糊匹配 name_zh / description_zh / category_zh
 */
dragonNestRouter.get('/items', async (req, res) => {
  const page = readPositiveInt(req.query.page, 'page', 1);
  const requestedSize = readPositiveInt(req.query.pageSize, 'pageSize', DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(requestedSize, MAX_PAGE_SIZE);
  const keyword = readKeyword(req.query.q);

  const startedAt = process.hrtime.bigint();
  const { items, total } = await findItems({ page, pageSize, keyword });
  const tookMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

  const totalPages = Math.ceil(total / pageSize);

  res.json({
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages,
    },
    query: { q: keyword },
    tookMs: Math.round(tookMs),
  });
});
