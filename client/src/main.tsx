import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import companyLogo from './assets/company-logo.svg';
import './styles.css';

type Part = { id: string; sku: string; name: string; category: string; manufacturer?: string | null; mpn?: string | null; footprint?: string | null; value?: string | null; location?: string | null; quantity: number; minQuantity: number; unit: string; notes?: string | null };
type PartForm = Omit<Part, 'id'>;
type Location = { id: string; code: string; rack: string; shelf?: string | null; bin?: string | null; note?: string | null };
type Bom = { id: string; name: string; revision: string; description?: string | null };
type BomItem = { id: string; partId: string; quantity: number; referenceDesignators?: string | null; note?: string | null; sku: string; name: string; stockQuantity: number; unit: string; location?: string | null };

type LocationForm = Omit<Location, 'id'>;
type BomForm = Omit<Bom, 'id'>;

const emptyPart: PartForm = { sku: '', name: '', category: 'Uncategorized', manufacturer: '', mpn: '', footprint: '', value: '', location: '', quantity: 0, minQuantity: 0, unit: 'pcs', notes: '' };
const emptyLocation: LocationForm = { code: '', rack: '', shelf: '', bin: '', note: '' };
const emptyBom: BomForm = { name: '', revision: 'A', description: '' };

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) }, ...options });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

function App() {
  const [parts, setParts] = useState<Part[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [boms, setBoms] = useState<Bom[]>([]);
  const [bomItems, setBomItems] = useState<BomItem[]>([]);
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [form, setForm] = useState<PartForm>(emptyPart);
  const [locationForm, setLocationForm] = useState<LocationForm>(emptyLocation);
  const [bomForm, setBomForm] = useState<BomForm>(emptyBom);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedBomId, setSelectedBomId] = useState<string | null>(null);
  const [bomPartId, setBomPartId] = useState('');
  const [bomQty, setBomQty] = useState(1);
  const [bomRefs, setBomRefs] = useState('');
  const [movementQty, setMovementQty] = useState(1);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState<'inventory' | 'locations' | 'boms'>('inventory');

  const selected = useMemo(() => parts.find((part) => part.id === selectedId) ?? null, [parts, selectedId]);
  const selectedBom = useMemo(() => boms.find((bom) => bom.id === selectedBomId) ?? null, [boms, selectedBomId]);
  const lowStockCount = parts.filter((part) => part.quantity <= part.minQuantity).length;
  const totalQuantity = parts.reduce((sum, part) => sum + part.quantity, 0);

  async function loadParts() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (lowStockOnly) qs.set('lowStock', 'true');
      setParts(await api<Part[]>(`/api/parts?${qs.toString()}`));
    } catch (error) { setMessage(error instanceof Error ? error.message : '불러오기 실패'); }
    finally { setLoading(false); }
  }
  async function loadLocations() { setLocations(await api<Location[]>('/api/locations')); }
  async function loadBoms() { const list = await api<Bom[]>('/api/boms'); setBoms(list); if (!selectedBomId && list[0]) setSelectedBomId(list[0].id); }
  async function loadBomItems(id = selectedBomId) { if (!id) { setBomItems([]); return; } setBomItems(await api<BomItem[]>(`/api/boms/${id}/items`)); }
  async function refreshAll() { await Promise.all([loadParts(), loadLocations(), loadBoms()]); }

  useEffect(() => { void refreshAll(); }, [lowStockOnly]);
  useEffect(() => { void loadBomItems(); }, [selectedBomId]);

  function updateField<K extends keyof PartForm>(key: K, value: PartForm[K]) { setForm((current) => ({ ...current, [key]: value })); }
  function edit(part: Part) {
    setEditingId(part.id); setSelectedId(part.id);
    setForm({ sku: part.sku, name: part.name, category: part.category, manufacturer: part.manufacturer ?? '', mpn: part.mpn ?? '', footprint: part.footprint ?? '', value: part.value ?? '', location: part.location ?? '', quantity: part.quantity, minQuantity: part.minQuantity, unit: part.unit, notes: part.notes ?? '' });
  }

  async function savePart(event: React.FormEvent) {
    event.preventDefault();
    try {
      const payload = JSON.stringify(form);
      if (editingId) { await api(`/api/parts/${editingId}`, { method: 'PUT', body: payload }); setMessage('부품을 수정했습니다.'); }
      else { await api('/api/parts', { method: 'POST', body: payload }); setMessage('부품을 등록했습니다.'); }
      setForm(emptyPart); setEditingId(null); await loadParts();
    } catch (error) { setMessage(error instanceof Error ? error.message : '저장 실패'); }
  }

  async function deletePart(id: string) {
    if (!confirm('이 부품을 삭제할까요? 재고 이력도 함께 삭제됩니다.')) return;
    try { await api(`/api/parts/${id}`, { method: 'DELETE' }); setMessage('삭제했습니다.'); if (selectedId === id) setSelectedId(null); await loadParts(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '삭제 실패'); }
  }

  async function moveStock(type: 'IN' | 'OUT' | 'ADJUST') {
    if (!selected) return;
    try { await api(`/api/parts/${selected.id}/movements`, { method: 'POST', body: JSON.stringify({ movementType: type, quantity: movementQty, memo: `${type} from dashboard` }) }); setMessage('재고를 반영했습니다.'); await loadParts(); await loadBomItems(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '재고 변경 실패'); }
  }

  async function saveLocation(event: React.FormEvent) {
    event.preventDefault();
    try { await api('/api/locations', { method: 'POST', body: JSON.stringify(locationForm) }); setLocationForm(emptyLocation); setMessage('위치/랙을 저장했습니다.'); await loadLocations(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '위치 저장 실패'); }
  }

  async function deleteLocation(id: string) {
    try { await api(`/api/locations/${id}`, { method: 'DELETE' }); await loadLocations(); setMessage('위치를 삭제했습니다.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : '위치 삭제 실패'); }
  }

  async function saveBom(event: React.FormEvent) {
    event.preventDefault();
    try { const saved = await api<Bom>('/api/boms', { method: 'POST', body: JSON.stringify(bomForm) }); setBomForm(emptyBom); setSelectedBomId(saved.id); setMessage('BOM을 저장했습니다.'); await loadBoms(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'BOM 저장 실패'); }
  }

  async function addBomItem(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedBomId || !bomPartId) return;
    try { await api(`/api/boms/${selectedBomId}/items`, { method: 'POST', body: JSON.stringify({ partId: bomPartId, quantity: bomQty, referenceDesignators: bomRefs }) }); setBomPartId(''); setBomQty(1); setBomRefs(''); setMessage('BOM 부품을 추가했습니다.'); await loadBomItems(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'BOM 부품 추가 실패'); }
  }

  async function deleteBomItem(id: string) {
    if (!selectedBomId) return;
    try { await api(`/api/boms/${selectedBomId}/items/${id}`, { method: 'DELETE' }); await loadBomItems(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'BOM 항목 삭제 실패'); }
  }

  async function importCsv(file?: File) {
    if (!file) return;
    try { const csv = await file.text(); const result = await api<{ upserted: number }>('/api/parts/import-csv', { method: 'POST', body: JSON.stringify({ csv }) }); setMessage(`CSV ${result.upserted}건 반영했습니다.`); await loadParts(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'CSV import 실패'); }
  }

  return (
    <main className="app">
      <header className="hero"><div className="brand"><img src={companyLogo} alt="죽동:이영일 로고" /><div><p className="eyebrow">PCB Design · Firmware</p><h1>PCB 재고관리 <span>[죽동:이영일]</span></h1><p>부품, 입출고, BOM, 위치/랙, CSV를 한 화면에서 관리합니다.</p></div></div><div className="stats"><span><b>{parts.length}</b> 품목</span><span><b>{totalQuantity}</b> 총수량</span><span className={lowStockCount ? 'danger' : ''}><b>{lowStockCount}</b> 부족</span></div></header>
      <nav className="main-tabs" role="tablist" aria-label="주요 화면"><button type="button" role="tab" aria-selected={activeMainTab === 'inventory'} className={activeMainTab === 'inventory' ? 'tab active' : 'tab'} onClick={() => setActiveMainTab('inventory')}>재고/부품</button><button type="button" role="tab" aria-selected={activeMainTab === 'locations'} className={activeMainTab === 'locations' ? 'tab active' : 'tab'} onClick={() => setActiveMainTab('locations')}>위치/랙</button><button type="button" role="tab" aria-selected={activeMainTab === 'boms'} className={activeMainTab === 'boms' ? 'tab active' : 'tab'} onClick={() => setActiveMainTab('boms')}>BOM 관리</button></nav>
      {message && <div className="notice" onClick={() => setMessage('')}>{message}</div>}

      {activeMainTab === 'inventory' && (
        <div role="tabpanel">
          <section className="toolbar card"><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void loadParts()} placeholder="SKU, 품명, 제조사, 위치 검색" /><button onClick={() => void loadParts()}>{loading ? '검색 중...' : '검색'}</button><a className="button-link" href="/api/parts/export.csv">CSV export</a><label className="file-button">CSV import<input type="file" accept=".csv,text/csv" onChange={(e) => void importCsv(e.target.files?.[0])} /></label><label className="check"><input type="checkbox" checked={lowStockOnly} onChange={(event) => setLowStockOnly(event.target.checked)} /> 부족 재고만</label></section>
          <div className="grid">
            <section className="card table-card"><h2>재고 목록</h2><div className="table-wrap"><table><thead><tr><th>SKU</th><th>품명</th><th>분류</th><th>위치</th><th>수량</th><th></th></tr></thead><tbody>{parts.map((part) => <tr key={part.id} className={part.quantity <= part.minQuantity ? 'low' : ''} onClick={() => setSelectedId(part.id)}><td title={part.sku}>{part.sku}</td><td><b>{part.name}</b><small>{part.manufacturer} {part.mpn}</small></td><td>{part.category}</td><td>{part.location || '-'}</td><td>{part.quantity} {part.unit}<small>min {part.minQuantity}</small></td><td><button onClick={(event) => { event.stopPropagation(); edit(part); }}>수정</button></td></tr>)}</tbody></table></div></section>
            <aside className="side"><section className="card"><h2>{editingId ? '부품 수정' : '부품 등록'}</h2><form onSubmit={savePart} className="form"><input required placeholder="SKU" value={form.sku} onChange={(e) => updateField('sku', e.target.value)} /><input required placeholder="품명" value={form.name} onChange={(e) => updateField('name', e.target.value)} /><input placeholder="분류" value={form.category} onChange={(e) => updateField('category', e.target.value)} /><input placeholder="제조사" value={form.manufacturer ?? ''} onChange={(e) => updateField('manufacturer', e.target.value)} /><input placeholder="MPN" value={form.mpn ?? ''} onChange={(e) => updateField('mpn', e.target.value)} /><div className="two"><input placeholder="Footprint" value={form.footprint ?? ''} onChange={(e) => updateField('footprint', e.target.value)} /><input placeholder="Value" value={form.value ?? ''} onChange={(e) => updateField('value', e.target.value)} /></div><div className="two"><select value={form.location ?? ''} onChange={(e) => updateField('location', e.target.value)}><option value="">위치 선택</option>{locations.map((loc) => <option key={loc.id} value={loc.code}>{loc.code}</option>)}</select><input placeholder="단위" value={form.unit} onChange={(e) => updateField('unit', e.target.value)} /></div><div className="two"><input type="number" min="0" placeholder="수량" value={form.quantity} onChange={(e) => updateField('quantity', Number(e.target.value))} /><input type="number" min="0" placeholder="최소재고" value={form.minQuantity} onChange={(e) => updateField('minQuantity', Number(e.target.value))} /></div><textarea placeholder="메모" value={form.notes ?? ''} onChange={(e) => updateField('notes', e.target.value)} /><button type="submit">{editingId ? '수정 저장' : '등록'}</button>{editingId && <button type="button" className="secondary" onClick={() => { setEditingId(null); setForm(emptyPart); }}>취소</button>}</form></section>
            <section className="card"><h2>입출고</h2>{selected ? <><p><b>{selected.name}</b><br /><small>{selected.sku} · 현재 {selected.quantity}{selected.unit}</small></p><input type="number" min="1" value={movementQty} onChange={(e) => setMovementQty(Number(e.target.value))} /><div className="actions"><button onClick={() => void moveStock('IN')}>입고</button><button onClick={() => void moveStock('OUT')}>출고</button><button onClick={() => void moveStock('ADJUST')}>실사조정</button></div><button className="danger-btn" onClick={() => void deletePart(selected.id)}>부품 삭제</button></> : <p>목록에서 부품을 선택하세요.</p>}</section></aside>
          </div>
        </div>
      )}

      {activeMainTab === 'locations' && (
        <section className="card tab-panel" role="tabpanel"><h2>위치/랙 관리</h2><form className="form compact" onSubmit={saveLocation}><div className="two"><input required placeholder="위치코드 예: A1-01" value={locationForm.code} onChange={(e) => setLocationForm({ ...locationForm, code: e.target.value })} /><input required placeholder="랙" value={locationForm.rack} onChange={(e) => setLocationForm({ ...locationForm, rack: e.target.value })} /></div><div className="two"><input placeholder="선반" value={locationForm.shelf ?? ''} onChange={(e) => setLocationForm({ ...locationForm, shelf: e.target.value })} /><input placeholder="칸" value={locationForm.bin ?? ''} onChange={(e) => setLocationForm({ ...locationForm, bin: e.target.value })} /></div><input placeholder="메모" value={locationForm.note ?? ''} onChange={(e) => setLocationForm({ ...locationForm, note: e.target.value })} /><button>위치 저장</button></form><div className="chips">{locations.map((loc) => <button key={loc.id} className="chip" onClick={() => setLocationForm({ code: loc.code, rack: loc.rack, shelf: loc.shelf ?? '', bin: loc.bin ?? '', note: loc.note ?? '' })}>{loc.code}<small>{loc.rack}-{loc.shelf}-{loc.bin}</small></button>)}</div>{locations.length > 0 && <button className="secondary tiny" onClick={() => void deleteLocation(locations[locations.length - 1].id)}>마지막 위치 삭제</button>}</section>
      )}

      {activeMainTab === 'boms' && (
        <section className="card tab-panel" role="tabpanel"><h2>BOM 관리</h2><form className="form compact" onSubmit={saveBom}><div className="two"><input required placeholder="BOM 이름" value={bomForm.name} onChange={(e) => setBomForm({ ...bomForm, name: e.target.value })} /><input required placeholder="Rev" value={bomForm.revision} onChange={(e) => setBomForm({ ...bomForm, revision: e.target.value })} /></div><input placeholder="설명" value={bomForm.description ?? ''} onChange={(e) => setBomForm({ ...bomForm, description: e.target.value })} /><button>BOM 저장</button></form><select value={selectedBomId ?? ''} onChange={(e) => setSelectedBomId(e.target.value)}><option value="">BOM 선택</option>{boms.map((bom) => <option key={bom.id} value={bom.id}>{bom.name} Rev.{bom.revision}</option>)}</select>{selectedBom && <form className="form compact" onSubmit={addBomItem}><select required value={bomPartId} onChange={(e) => setBomPartId(e.target.value)}><option value="">부품 선택</option>{parts.map((part) => <option key={part.id} value={part.id}>{part.sku} · {part.name}</option>)}</select><div className="two"><input type="number" step="0.001" min="0.001" value={bomQty} onChange={(e) => setBomQty(Number(e.target.value))} /><input placeholder="참조번호 R1,C1..." value={bomRefs} onChange={(e) => setBomRefs(e.target.value)} /></div><button>BOM에 추가</button></form>}<div className="bom-list">{bomItems.map((item) => <div key={item.id} className={item.stockQuantity < item.quantity ? 'bom-row shortage' : 'bom-row'}><span><b>{item.sku}</b> {item.name}<small>{item.referenceDesignators || '-'} · 위치 {item.location || '-'}</small></span><span>필요 {item.quantity} / 재고 {item.stockQuantity}{item.unit}</span><button className="secondary tiny" onClick={() => void deleteBomItem(item.id)}>삭제</button></div>)}</div></section>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
