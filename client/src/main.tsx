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
  const [bomPartSearch, setBomPartSearch] = useState('');
  const [bomQty, setBomQty] = useState(1);
  const [bomRefs, setBomRefs] = useState('');
  const [movementQty, setMovementQty] = useState(1);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState<'inventory' | 'locations' | 'boms'>('inventory');
  const [selectedLocationCode, setSelectedLocationCode] = useState<string | null>(null);
  const [locationParts, setLocationParts] = useState<Part[]>([]);
  const [locationPartsLoading, setLocationPartsLoading] = useState(false);

  const selected = useMemo(() => parts.find((part) => part.id === selectedId) ?? null, [parts, selectedId]);
  const selectedBom = useMemo(() => boms.find((bom) => bom.id === selectedBomId) ?? null, [boms, selectedBomId]);
  const filteredBomParts = useMemo(() => {
    const keyword = bomPartSearch.trim().toLowerCase();
    if (!keyword) return parts;
    return parts.filter((part) => [part.sku, part.name, part.category, part.manufacturer, part.mpn, part.location].some((value) => value?.toLowerCase().includes(keyword)));
  }, [bomPartSearch, parts]);
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

  async function selectLocation(loc: Location) {
    setLocationForm({ code: loc.code, rack: loc.rack, shelf: loc.shelf ?? '', bin: loc.bin ?? '', note: loc.note ?? '' });
    setSelectedLocationCode(loc.code);
    setLocationPartsLoading(true);
    try {
      const qs = new URLSearchParams({ search: loc.code });
      const list = await api<Part[]>(`/api/parts?${qs.toString()}`);
      setLocationParts(list.filter((part) => part.location === loc.code));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '위치 부품 불러오기 실패');
    } finally {
      setLocationPartsLoading(false);
    }
  }

  async function showLocationInInventory() {
    if (!selectedLocationCode) return;
    setSearch(selectedLocationCode);
    setActiveMainTab('inventory');
    setLoading(true);
    try {
      const qs = new URLSearchParams({ search: selectedLocationCode });
      if (lowStockOnly) qs.set('lowStock', 'true');
      setParts(await api<Part[]>(`/api/parts?${qs.toString()}`));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
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
      <nav className="main-tabs" role="tablist" aria-label="주요 화면"><button type="button" role="tab" aria-selected={activeMainTab === 'inventory'} className={activeMainTab === 'inventory' ? 'tab active' : 'tab'} data-tooltip="부품 목록을 검색하고, 새 부품 등록/수정과 입고·출고를 처리합니다." onClick={() => setActiveMainTab('inventory')}>재고/부품</button><button type="button" role="tab" aria-selected={activeMainTab === 'locations'} className={activeMainTab === 'locations' ? 'tab active' : 'tab'} data-tooltip="부품을 보관하는 랙, 선반, 칸 위치 코드를 만들고 관리합니다." onClick={() => setActiveMainTab('locations')}>위치/랙</button><button type="button" role="tab" aria-selected={activeMainTab === 'boms'} className={activeMainTab === 'boms' ? 'tab active' : 'tab'} data-tooltip="제품별 필요한 부품 목록과 수량, 참조번호를 구성합니다." onClick={() => setActiveMainTab('boms')}>BOM 관리</button></nav>
      {message && <div className="notice" onClick={() => setMessage('')}>{message}</div>}

      {activeMainTab === 'inventory' && (
        <div role="tabpanel">
          <section className="toolbar card"><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void loadParts()} placeholder="SKU, 품명, 제조사, 위치 검색" /><button onClick={() => void loadParts()}>{loading ? '검색 중...' : '검색'}</button><a className="button-link" href="/api/parts/export.csv">CSV export</a><label className="file-button">CSV import<input type="file" accept=".csv,text/csv" onChange={(e) => void importCsv(e.target.files?.[0])} /></label><label className="check"><input type="checkbox" checked={lowStockOnly} onChange={(event) => setLowStockOnly(event.target.checked)} /> 부족 재고만</label></section>
          <div className="grid">
            <section className="card table-card"><h2>재고 목록</h2><div className="table-wrap"><table><thead><tr><th className="hint" data-tooltip="Stock Keeping Unit: 재고 품목을 구분하는 고유 관리 코드입니다.">SKU</th><th>품명</th><th>분류</th><th>위치</th><th>수량</th><th></th></tr></thead><tbody>{parts.map((part) => <tr key={part.id} className={part.quantity <= part.minQuantity ? 'low' : ''} onClick={() => setSelectedId(part.id)}><td title={part.sku}>{part.sku}</td><td><b>{part.name}</b><small>{part.manufacturer} {part.mpn}</small></td><td>{part.category}</td><td>{part.location || '-'}</td><td>{part.quantity} {part.unit}<small>min {part.minQuantity}</small></td><td><button onClick={(event) => { event.stopPropagation(); edit(part); }}>수정</button></td></tr>)}</tbody></table></div></section>
            <aside className="side"><section className="card"><h2>{editingId ? '부품 수정' : '부품 등록'}</h2><form onSubmit={savePart} className="form"><label className="field">SKU<input required placeholder="예: R-0603-10K-001" title="Stock Keeping Unit: 재고 품목을 구분하는 고유 관리 코드입니다." value={form.sku} onChange={(e) => updateField('sku', e.target.value)} /></label><label className="field">품명<input required placeholder="부품 이름" value={form.name} onChange={(e) => updateField('name', e.target.value)} /></label><label className="field">분류<input placeholder="Resistor, Capacitor, IC..." value={form.category} onChange={(e) => updateField('category', e.target.value)} /></label><label className="field">제조사<input placeholder="제조사" value={form.manufacturer ?? ''} onChange={(e) => updateField('manufacturer', e.target.value)} /></label><label className="field">MPN<input placeholder="Manufacturer Part Number" value={form.mpn ?? ''} onChange={(e) => updateField('mpn', e.target.value)} /></label><div className="two"><label className="field">Footprint<input placeholder="0603, QFN-32..." value={form.footprint ?? ''} onChange={(e) => updateField('footprint', e.target.value)} /></label><label className="field">Value<input placeholder="10kΩ, 100nF..." value={form.value ?? ''} onChange={(e) => updateField('value', e.target.value)} /></label></div><div className="two"><label className="field">위치<select value={form.location ?? ''} onChange={(e) => updateField('location', e.target.value)}><option value="">위치 선택</option>{locations.map((loc) => <option key={loc.id} value={loc.code}>{loc.code}</option>)}</select></label><label className="field">단위<input placeholder="pcs" value={form.unit} onChange={(e) => updateField('unit', e.target.value)} /></label></div><div className="two"><label className="field">수량<input type="number" min="0" placeholder="현재 수량" value={form.quantity} onChange={(e) => updateField('quantity', Number(e.target.value))} /></label><label className="field">최소재고<input type="number" min="0" placeholder="부족 기준" value={form.minQuantity} onChange={(e) => updateField('minQuantity', Number(e.target.value))} /></label></div><label className="field">메모<textarea placeholder="메모" value={form.notes ?? ''} onChange={(e) => updateField('notes', e.target.value)} /></label><button type="submit">{editingId ? '수정 저장' : '등록'}</button>{editingId && <button type="button" className="secondary" onClick={() => { setEditingId(null); setForm(emptyPart); }}>취소</button>}</form></section>
            <section className="card"><h2>입출고</h2>{selected ? <><p><b>{selected.name}</b><br /><small>{selected.sku} · 현재 {selected.quantity}{selected.unit}</small></p><input type="number" min="1" value={movementQty} onChange={(e) => setMovementQty(Number(e.target.value))} /><div className="actions"><button onClick={() => void moveStock('IN')}>입고</button><button onClick={() => void moveStock('OUT')}>출고</button><button onClick={() => void moveStock('ADJUST')}>실사조정</button></div><button className="danger-btn" onClick={() => void deletePart(selected.id)}>부품 삭제</button></> : <p>목록에서 부품을 선택하세요.</p>}</section></aside>
          </div>
        </div>
      )}

      {activeMainTab === 'locations' && (
        <section className="card tab-panel" role="tabpanel"><h2>위치/랙 관리</h2><div className="location-layout"><aside className="location-list"><h3>위치 목록</h3>{locations.map((loc) => <button key={loc.id} className={selectedLocationCode === loc.code ? 'location-item selected' : 'location-item'} onClick={() => void selectLocation(loc)}><b>{loc.code}</b><small>{loc.rack}-{loc.shelf}-{loc.bin}</small></button>)}</aside><div className="location-detail"><form className="form compact" onSubmit={saveLocation}><div className="two"><label className="field">위치코드<input required placeholder="예: A1-01" value={locationForm.code} onChange={(e) => setLocationForm({ ...locationForm, code: e.target.value })} /></label><label className="field">랙<input required placeholder="랙" value={locationForm.rack} onChange={(e) => setLocationForm({ ...locationForm, rack: e.target.value })} /></label></div><div className="two"><label className="field">선반<input placeholder="선반" value={locationForm.shelf ?? ''} onChange={(e) => setLocationForm({ ...locationForm, shelf: e.target.value })} /></label><label className="field">칸<input placeholder="칸" value={locationForm.bin ?? ''} onChange={(e) => setLocationForm({ ...locationForm, bin: e.target.value })} /></label></div><label className="field">메모<input placeholder="메모" value={locationForm.note ?? ''} onChange={(e) => setLocationForm({ ...locationForm, note: e.target.value })} /></label><button>위치 저장</button></form>{locations.length > 0 && <button className="secondary tiny" onClick={() => void deleteLocation(locations[locations.length - 1].id)}>마지막 위치 삭제</button>}<div className="location-parts"><div className="section-head"><h3>{selectedLocationCode ? `${selectedLocationCode} 부품` : '위치별 부품'}</h3>{selectedLocationCode && <button className="secondary tiny" onClick={() => void showLocationInInventory()}>재고/부품에서 보기</button>}</div>{!selectedLocationCode && <p className="empty">왼쪽 위치 목록에서 위치를 선택하면 해당 위치의 부품이 표시됩니다.</p>}{selectedLocationCode && locationPartsLoading && <p className="empty">부품을 불러오는 중입니다.</p>}{selectedLocationCode && !locationPartsLoading && locationParts.length === 0 && <p className="empty">이 위치에 등록된 부품이 없습니다.</p>}{selectedLocationCode && !locationPartsLoading && locationParts.length > 0 && <div className="location-part-list">{locationParts.map((part) => <div key={part.id} className={part.quantity <= part.minQuantity ? 'location-part low' : 'location-part'}><span><b>{part.sku}</b>{part.name}<small>{part.manufacturer || '-'} {part.mpn || ''}</small></span><span>{part.quantity} {part.unit}<small>min {part.minQuantity}</small></span></div>)}</div>}</div></div></div></section>
      )}

      {activeMainTab === 'boms' && (
        <section className="card tab-panel" role="tabpanel"><h2>BOM 관리</h2><form className="form compact" onSubmit={saveBom}><div className="two"><label className="field">BOM 이름<input required placeholder="예: Demo Controller PCB" value={bomForm.name} onChange={(e) => setBomForm({ ...bomForm, name: e.target.value })} /></label><label className="field">Rev<input required placeholder="A" value={bomForm.revision} onChange={(e) => setBomForm({ ...bomForm, revision: e.target.value })} /></label></div><label className="field">설명<input placeholder="BOM 설명" value={bomForm.description ?? ''} onChange={(e) => setBomForm({ ...bomForm, description: e.target.value })} /></label><button>BOM 저장</button></form><label className="field">BOM 선택<select value={selectedBomId ?? ''} onChange={(e) => setSelectedBomId(e.target.value)}><option value="">BOM 선택</option>{boms.map((bom) => <option key={bom.id} value={bom.id}>{bom.name} Rev.{bom.revision}</option>)}</select></label>{selectedBom && <form className="form compact" onSubmit={addBomItem}><label className="field">부품 검색<input placeholder="SKU, 품명, 제조사, 위치 검색" value={bomPartSearch} onChange={(e) => { setBomPartSearch(e.target.value); setBomPartId(''); }} /></label><label className="field">부품<select required value={bomPartId} onChange={(e) => setBomPartId(e.target.value)}><option value="">{filteredBomParts.length ? '부품 선택' : '검색 결과 없음'}</option>{filteredBomParts.map((part) => <option key={part.id} value={part.id}>{part.sku} · {part.name}</option>)}</select></label><div className="two"><label className="field">수량<input type="number" step="0.001" min="0.001" value={bomQty} onChange={(e) => setBomQty(Number(e.target.value))} /></label><label className="field">참조번호<input placeholder="R1,C1..." value={bomRefs} onChange={(e) => setBomRefs(e.target.value)} /></label></div><button>BOM에 추가</button></form>}<div className="bom-list">{bomItems.map((item) => <div key={item.id} className={item.stockQuantity < item.quantity ? 'bom-row shortage' : 'bom-row'}><span><b>{item.sku}</b> {item.name}<small>{item.referenceDesignators || '-'} · 위치 {item.location || '-'}</small></span><span>필요 {item.quantity} / 재고 {item.stockQuantity}{item.unit}</span><button className="secondary tiny" onClick={() => void deleteBomItem(item.id)}>삭제</button></div>)}</div></section>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
