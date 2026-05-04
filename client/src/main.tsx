import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Part = {
  id: string;
  sku: string;
  name: string;
  category: string;
  manufacturer?: string | null;
  mpn?: string | null;
  footprint?: string | null;
  value?: string | null;
  location?: string | null;
  quantity: number;
  minQuantity: number;
  unit: string;
  notes?: string | null;
};

type PartForm = Omit<Part, 'id'>;

const emptyPart: PartForm = {
  sku: '',
  name: '',
  category: 'Uncategorized',
  manufacturer: '',
  mpn: '',
  footprint: '',
  value: '',
  location: '',
  quantity: 0,
  minQuantity: 0,
  unit: 'pcs',
  notes: '',
};

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

function App() {
  const [parts, setParts] = useState<Part[]>([]);
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [form, setForm] = useState<PartForm>(emptyPart);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [movementQty, setMovementQty] = useState(1);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const selected = useMemo(() => parts.find((part) => part.id === selectedId) ?? null, [parts, selectedId]);
  const lowStockCount = parts.filter((part) => part.quantity <= part.minQuantity).length;
  const totalQuantity = parts.reduce((sum, part) => sum + part.quantity, 0);

  async function loadParts() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (lowStockOnly) qs.set('lowStock', 'true');
      setParts(await api<Part[]>(`/api/parts?${qs.toString()}`));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadParts();
  }, [lowStockOnly]);

  function updateField<K extends keyof PartForm>(key: K, value: PartForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function edit(part: Part) {
    setEditingId(part.id);
    setSelectedId(part.id);
    setForm({
      sku: part.sku,
      name: part.name,
      category: part.category,
      manufacturer: part.manufacturer ?? '',
      mpn: part.mpn ?? '',
      footprint: part.footprint ?? '',
      value: part.value ?? '',
      location: part.location ?? '',
      quantity: part.quantity,
      minQuantity: part.minQuantity,
      unit: part.unit,
      notes: part.notes ?? '',
    });
  }

  async function savePart(event: React.FormEvent) {
    event.preventDefault();
    try {
      const payload = JSON.stringify(form);
      if (editingId) {
        await api(`/api/parts/${editingId}`, { method: 'PUT', body: payload });
        setMessage('부품을 수정했습니다.');
      } else {
        await api('/api/parts', { method: 'POST', body: payload });
        setMessage('부품을 등록했습니다.');
      }
      setForm(emptyPart);
      setEditingId(null);
      await loadParts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '저장 실패');
    }
  }

  async function deletePart(id: string) {
    if (!confirm('이 부품을 삭제할까요? 재고 이력도 함께 삭제됩니다.')) return;
    try {
      await api(`/api/parts/${id}`, { method: 'DELETE' });
      setMessage('삭제했습니다.');
      if (selectedId === id) setSelectedId(null);
      await loadParts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '삭제 실패');
    }
  }

  async function moveStock(type: 'IN' | 'OUT' | 'ADJUST') {
    if (!selected) return;
    try {
      await api(`/api/parts/${selected.id}/movements`, {
        method: 'POST',
        body: JSON.stringify({ movementType: type, quantity: movementQty, memo: `${type} from dashboard` }),
      });
      setMessage('재고를 반영했습니다.');
      await loadParts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '재고 변경 실패');
    }
  }

  return (
    <main className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">PCB Inventory</p>
          <h1>PCB 재고관리</h1>
          <p>전자부품, PCB 자재, 보관 위치와 입출고를 한 화면에서 관리합니다.</p>
        </div>
        <div className="stats">
          <span><b>{parts.length}</b> 품목</span>
          <span><b>{totalQuantity}</b> 총수량</span>
          <span className={lowStockCount ? 'danger' : ''}><b>{lowStockCount}</b> 부족</span>
        </div>
      </header>

      <section className="toolbar card">
        <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void loadParts()} placeholder="SKU, 품명, 제조사, 위치 검색" />
        <button onClick={() => void loadParts()}>{loading ? '검색 중...' : '검색'}</button>
        <label className="check"><input type="checkbox" checked={lowStockOnly} onChange={(event) => setLowStockOnly(event.target.checked)} /> 부족 재고만</label>
      </section>

      {message && <div className="notice" onClick={() => setMessage('')}>{message}</div>}

      <div className="grid">
        <section className="card table-card">
          <h2>재고 목록</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>SKU</th><th>품명</th><th>분류</th><th>위치</th><th>수량</th><th></th></tr></thead>
              <tbody>
                {parts.map((part) => (
                  <tr key={part.id} className={part.quantity <= part.minQuantity ? 'low' : ''} onClick={() => setSelectedId(part.id)}>
                    <td>{part.sku}</td>
                    <td><b>{part.name}</b><small>{part.manufacturer} {part.mpn}</small></td>
                    <td>{part.category}</td>
                    <td>{part.location || '-'}</td>
                    <td>{part.quantity} {part.unit}<small>min {part.minQuantity}</small></td>
                    <td><button onClick={(event) => { event.stopPropagation(); edit(part); }}>수정</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="side">
          <section className="card">
            <h2>{editingId ? '부품 수정' : '부품 등록'}</h2>
            <form onSubmit={savePart} className="form">
              <input required placeholder="SKU" value={form.sku} onChange={(e) => updateField('sku', e.target.value)} />
              <input required placeholder="품명" value={form.name} onChange={(e) => updateField('name', e.target.value)} />
              <input placeholder="분류" value={form.category} onChange={(e) => updateField('category', e.target.value)} />
              <input placeholder="제조사" value={form.manufacturer ?? ''} onChange={(e) => updateField('manufacturer', e.target.value)} />
              <input placeholder="MPN" value={form.mpn ?? ''} onChange={(e) => updateField('mpn', e.target.value)} />
              <div className="two"><input placeholder="Footprint" value={form.footprint ?? ''} onChange={(e) => updateField('footprint', e.target.value)} /><input placeholder="Value" value={form.value ?? ''} onChange={(e) => updateField('value', e.target.value)} /></div>
              <div className="two"><input placeholder="위치" value={form.location ?? ''} onChange={(e) => updateField('location', e.target.value)} /><input placeholder="단위" value={form.unit} onChange={(e) => updateField('unit', e.target.value)} /></div>
              <div className="two"><input type="number" min="0" placeholder="수량" value={form.quantity} onChange={(e) => updateField('quantity', Number(e.target.value))} /><input type="number" min="0" placeholder="최소재고" value={form.minQuantity} onChange={(e) => updateField('minQuantity', Number(e.target.value))} /></div>
              <textarea placeholder="메모" value={form.notes ?? ''} onChange={(e) => updateField('notes', e.target.value)} />
              <button type="submit">{editingId ? '수정 저장' : '등록'}</button>
              {editingId && <button type="button" className="secondary" onClick={() => { setEditingId(null); setForm(emptyPart); }}>취소</button>}
            </form>
          </section>

          <section className="card">
            <h2>입출고</h2>
            {selected ? <>
              <p><b>{selected.name}</b><br /><small>{selected.sku} · 현재 {selected.quantity}{selected.unit}</small></p>
              <input type="number" min="1" value={movementQty} onChange={(e) => setMovementQty(Number(e.target.value))} />
              <div className="actions"><button onClick={() => void moveStock('IN')}>입고</button><button onClick={() => void moveStock('OUT')}>출고</button><button onClick={() => void moveStock('ADJUST')}>실사조정</button></div>
              <button className="danger-btn" onClick={() => void deletePart(selected.id)}>부품 삭제</button>
            </> : <p>목록에서 부품을 선택하세요.</p>}
          </section>
        </aside>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
