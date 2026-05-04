import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { query, pool } from './db.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

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

const locationSchema = z.object({
  code: z.string().min(1),
  rack: z.string().min(1),
  shelf: z.string().optional().nullable(),
  bin: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

const bomSchema = z.object({
  name: z.string().min(1),
  revision: z.string().min(1).default('A'),
  description: z.string().optional().nullable(),
});

const bomItemSchema = z.object({
  partId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  referenceDesignators: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
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

function mapLocation(row: any) {
  return { id: row.id, code: row.code, rack: row.rack, shelf: row.shelf, bin: row.bin, note: row.note };
}

function mapBom(row: any) {
  return { id: row.id, name: row.name, revision: row.revision, description: row.description };
}

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows: Record<string, unknown>[]) {
  const headers = ['sku', 'name', 'category', 'manufacturer', 'mpn', 'footprint', 'value', 'location', 'quantity', 'minQuantity', 'unit', 'notes'];
  return [headers.join(','), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))].join('\n');
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  const [headers = [], ...body] = rows;
  return body.map((values) => Object.fromEntries(headers.map((header, index) => [header.trim(), values[index]?.trim() ?? ''])));
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'pcb-inventory-api' }));

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
  } catch (error) { next(error); }
});

app.get('/api/parts/export.csv', async (_req, res, next) => {
  try {
    const result = await query('SELECT * FROM parts ORDER BY category, sku');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="pcb-parts.csv"');
    res.send(toCsv(result.rows.map(mapPart)));
  } catch (error) { next(error); }
});

app.post('/api/parts/import-csv', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const csv = z.object({ csv: z.string().min(1) }).parse(req.body).csv;
    const rows = parseCsv(csv);
    let upserted = 0;
    await client.query('BEGIN');
    for (const row of rows) {
      const part = partSchema.parse({
        sku: row.sku,
        name: row.name,
        category: row.category || 'Uncategorized',
        manufacturer: row.manufacturer || null,
        mpn: row.mpn || null,
        footprint: row.footprint || null,
        value: row.value || null,
        location: row.location || null,
        quantity: Number(row.quantity || 0),
        minQuantity: Number(row.minQuantity || row.min_quantity || 0),
        unit: row.unit || 'pcs',
        notes: row.notes || null,
      });
      await client.query(
        `INSERT INTO parts (sku, name, category, manufacturer, mpn, footprint, value, location, quantity, min_quantity, unit, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (sku) DO UPDATE SET
           name=EXCLUDED.name, category=EXCLUDED.category, manufacturer=EXCLUDED.manufacturer, mpn=EXCLUDED.mpn,
           footprint=EXCLUDED.footprint, value=EXCLUDED.value, location=EXCLUDED.location, quantity=EXCLUDED.quantity,
           min_quantity=EXCLUDED.min_quantity, unit=EXCLUDED.unit, notes=EXCLUDED.notes`,
        [part.sku, part.name, part.category, part.manufacturer, part.mpn, part.footprint, part.value, part.location, part.quantity, part.minQuantity, part.unit, part.notes],
      );
      upserted += 1;
    }
    await client.query('COMMIT');
    res.json({ upserted });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally { client.release(); }
});

app.post('/api/parts', async (req, res, next) => {
  try {
    const part = partSchema.parse(req.body);
    const result = await query(
      `INSERT INTO parts (sku, name, category, manufacturer, mpn, footprint, value, location, quantity, min_quantity, unit, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [part.sku, part.name, part.category, part.manufacturer, part.mpn, part.footprint, part.value, part.location, part.quantity, part.minQuantity, part.unit, part.notes],
    );
    res.status(201).json(mapPart(result.rows[0]));
  } catch (error) { next(error); }
});

app.put('/api/parts/:id', async (req, res, next) => {
  try {
    const part = partSchema.parse(req.body);
    const result = await query(
      `UPDATE parts SET sku=$1, name=$2, category=$3, manufacturer=$4, mpn=$5, footprint=$6, value=$7, location=$8, quantity=$9, min_quantity=$10, unit=$11, notes=$12 WHERE id=$13 RETURNING *`,
      [part.sku, part.name, part.category, part.manufacturer, part.mpn, part.footprint, part.value, part.location, part.quantity, part.minQuantity, part.unit, part.notes, req.params.id],
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Part not found' });
    res.json(mapPart(result.rows[0]));
  } catch (error) { next(error); }
});

app.delete('/api/parts/:id', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM parts WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Part not found' });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.post('/api/parts/:id/movements', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const movement = movementSchema.parse(req.body);
    await client.query('BEGIN');
    const partResult = await client.query('SELECT quantity FROM parts WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!partResult.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Part not found' }); }
    const current = Number(partResult.rows[0].quantity);
    const nextQty = movement.movementType === 'IN' ? current + movement.quantity : movement.movementType === 'OUT' ? current - movement.quantity : movement.quantity;
    if (nextQty < 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Stock cannot be negative' }); }
    const movementResult = await client.query('INSERT INTO stock_movements (part_id, movement_type, quantity, memo) VALUES ($1,$2,$3,$4) RETURNING *', [req.params.id, movement.movementType, movement.quantity, movement.memo]);
    const partUpdate = await client.query('UPDATE parts SET quantity=$1 WHERE id=$2 RETURNING *', [nextQty, req.params.id]);
    await client.query('COMMIT');
    res.status(201).json({ movement: movementResult.rows[0], part: mapPart(partUpdate.rows[0]) });
  } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
});

app.get('/api/movements', async (_req, res, next) => {
  try {
    const result = await query('SELECT sm.*, p.sku, p.name FROM stock_movements sm JOIN parts p ON p.id = sm.part_id ORDER BY sm.created_at DESC LIMIT 100');
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.get('/api/locations', async (_req, res, next) => {
  try {
    const result = await query('SELECT * FROM locations ORDER BY rack, shelf, bin, code');
    res.json(result.rows.map(mapLocation));
  } catch (error) { next(error); }
});

app.post('/api/locations', async (req, res, next) => {
  try {
    const loc = locationSchema.parse(req.body);
    const result = await query('INSERT INTO locations (code, rack, shelf, bin, note) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (code) DO UPDATE SET rack=EXCLUDED.rack, shelf=EXCLUDED.shelf, bin=EXCLUDED.bin, note=EXCLUDED.note RETURNING *', [loc.code, loc.rack, loc.shelf, loc.bin, loc.note]);
    res.status(201).json(mapLocation(result.rows[0]));
  } catch (error) { next(error); }
});

app.delete('/api/locations/:id', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM locations WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Location not found' });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.get('/api/boms', async (_req, res, next) => {
  try {
    const result = await query('SELECT * FROM boms ORDER BY name, revision');
    res.json(result.rows.map(mapBom));
  } catch (error) { next(error); }
});

app.post('/api/boms', async (req, res, next) => {
  try {
    const bom = bomSchema.parse(req.body);
    const result = await query('INSERT INTO boms (name, revision, description) VALUES ($1,$2,$3) ON CONFLICT (name, revision) DO UPDATE SET description=EXCLUDED.description RETURNING *', [bom.name, bom.revision, bom.description]);
    res.status(201).json(mapBom(result.rows[0]));
  } catch (error) { next(error); }
});

app.get('/api/boms/:id/items', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT bi.*, p.sku, p.name, p.quantity AS stock_quantity, p.unit, p.location
       FROM bom_items bi JOIN parts p ON p.id = bi.part_id
       WHERE bi.bom_id=$1 ORDER BY p.sku`,
      [req.params.id],
    );
    res.json(result.rows.map((row: any) => ({
      id: row.id,
      bomId: row.bom_id,
      partId: row.part_id,
      quantity: Number(row.quantity),
      referenceDesignators: row.reference_designators,
      note: row.note,
      sku: row.sku,
      name: row.name,
      stockQuantity: row.stock_quantity,
      unit: row.unit,
      location: row.location,
    })));
  } catch (error) { next(error); }
});

app.post('/api/boms/:id/items', async (req, res, next) => {
  try {
    const item = bomItemSchema.parse(req.body);
    const result = await query(
      `INSERT INTO bom_items (bom_id, part_id, quantity, reference_designators, note) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (bom_id, part_id) DO UPDATE SET quantity=EXCLUDED.quantity, reference_designators=EXCLUDED.reference_designators, note=EXCLUDED.note RETURNING *`,
      [req.params.id, item.partId, item.quantity, item.referenceDesignators, item.note],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

app.delete('/api/boms/:bomId/items/:itemId', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM bom_items WHERE bom_id=$1 AND id=$2 RETURNING id', [req.params.bomId, req.params.itemId]);
    if (!result.rows[0]) return res.status(404).json({ error: 'BOM item not found' });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: error.flatten() });
  const message = error instanceof Error ? error.message : 'Unknown error';
  if (message.includes('duplicate key')) return res.status(409).json({ error: 'Duplicate value' });
  console.error(error);
  res.status(500).json({ error: message });
});

app.listen(port, '127.0.0.1', () => console.log(`PCB inventory API listening on http://127.0.0.1:${port}`));
