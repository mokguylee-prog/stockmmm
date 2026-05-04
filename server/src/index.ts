import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { query, pool } from './db.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json());

const partSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1).default('Uncategorized'),
  manufacturer: z.string().optional().nullable(),
  mpn: z.string().optional().nullable(),
  footprint: z.string().optional().nullable(),
  value: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  quantity: z.coerce.number().int().min(0).default(0),
  minQuantity: z.coerce.number().int().min(0).default(0),
  unit: z.string().min(1).default('pcs'),
  notes: z.string().optional().nullable(),
});

const movementSchema = z.object({
  movementType: z.enum(['IN', 'OUT', 'ADJUST']),
  quantity: z.coerce.number().int().positive(),
  memo: z.string().optional().nullable(),
});

function mapPart(row: any) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    manufacturer: row.manufacturer,
    mpn: row.mpn,
    footprint: row.footprint,
    value: row.value,
    location: row.location,
    quantity: row.quantity,
    minQuantity: row.min_quantity,
    unit: row.unit,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'pcb-inventory-api' });
});

app.get('/api/parts', async (req, res, next) => {
  try {
    const search = String(req.query.search ?? '').trim();
    const lowStock = req.query.lowStock === 'true';
    const params: unknown[] = [];
    const where: string[] = [];

    if (search) {
      params.push(`%${search}%`);
      where.push(`(sku ILIKE $${params.length} OR name ILIKE $${params.length} OR category ILIKE $${params.length} OR manufacturer ILIKE $${params.length} OR mpn ILIKE $${params.length} OR location ILIKE $${params.length})`);
    }
    if (lowStock) where.push('quantity <= min_quantity');

    const sql = `SELECT * FROM parts ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY category, sku`;
    const result = await query(sql, params);
    res.json(result.rows.map(mapPart));
  } catch (error) {
    next(error);
  }
});

app.post('/api/parts', async (req, res, next) => {
  try {
    const part = partSchema.parse(req.body);
    const result = await query(
      `INSERT INTO parts (sku, name, category, manufacturer, mpn, footprint, value, location, quantity, min_quantity, unit, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [part.sku, part.name, part.category, part.manufacturer, part.mpn, part.footprint, part.value, part.location, part.quantity, part.minQuantity, part.unit, part.notes],
    );
    res.status(201).json(mapPart(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.put('/api/parts/:id', async (req, res, next) => {
  try {
    const part = partSchema.parse(req.body);
    const result = await query(
      `UPDATE parts
       SET sku=$1, name=$2, category=$3, manufacturer=$4, mpn=$5, footprint=$6, value=$7, location=$8, quantity=$9, min_quantity=$10, unit=$11, notes=$12
       WHERE id=$13
       RETURNING *`,
      [part.sku, part.name, part.category, part.manufacturer, part.mpn, part.footprint, part.value, part.location, part.quantity, part.minQuantity, part.unit, part.notes, req.params.id],
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Part not found' });
    res.json(mapPart(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/parts/:id', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM parts WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Part not found' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post('/api/parts/:id/movements', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const movement = movementSchema.parse(req.body);
    await client.query('BEGIN');
    const partResult = await client.query('SELECT quantity FROM parts WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!partResult.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Part not found' });
    }

    const current = Number(partResult.rows[0].quantity);
    const nextQty = movement.movementType === 'IN'
      ? current + movement.quantity
      : movement.movementType === 'OUT'
        ? current - movement.quantity
        : movement.quantity;

    if (nextQty < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Stock cannot be negative' });
    }

    const movementResult = await client.query(
      `INSERT INTO stock_movements (part_id, movement_type, quantity, memo) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, movement.movementType, movement.quantity, movement.memo],
    );
    const partUpdate = await client.query('UPDATE parts SET quantity=$1 WHERE id=$2 RETURNING *', [nextQty, req.params.id]);
    await client.query('COMMIT');
    res.status(201).json({ movement: movementResult.rows[0], part: mapPart(partUpdate.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

app.get('/api/movements', async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT sm.*, p.sku, p.name
       FROM stock_movements sm
       JOIN parts p ON p.id = sm.part_id
       ORDER BY sm.created_at DESC
       LIMIT 100`,
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: error.flatten() });
  const message = error instanceof Error ? error.message : 'Unknown error';
  if (message.includes('duplicate key')) return res.status(409).json({ error: 'SKU already exists' });
  console.error(error);
  res.status(500).json({ error: message });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`PCB inventory API listening on http://127.0.0.1:${port}`);
});
