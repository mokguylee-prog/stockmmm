INSERT INTO locations (code, rack, shelf, bin, note)
VALUES
  ('A1-01', 'A', '1', '01', 'Resistor drawer'),
  ('A1-02', 'A', '1', '02', 'Capacitor drawer'),
  ('B2-03', 'B', '2', '03', 'IC tray')
ON CONFLICT (code) DO NOTHING;

INSERT INTO parts (sku, name, category, manufacturer, mpn, footprint, value, location, quantity, min_quantity, notes)
VALUES
  ('R-0603-10K-001', 'Resistor 10kΩ 1%', 'Resistor', 'Yageo', 'RC0603FR-0710KL', '0603', '10kΩ', 'A1-01', 500, 100, 'Common pull-up resistor'),
  ('C-0603-100N-001', 'Capacitor 100nF X7R', 'Capacitor', 'Murata', 'GRM188R71C104KA01D', '0603', '100nF', 'A1-02', 800, 150, 'Decoupling capacitor'),
  ('IC-QFN32-MCU-001', 'STM32 MCU', 'IC', 'STMicroelectronics', 'STM32G0B1KET6', 'QFN-32', NULL, 'B2-03', 24, 10, 'Main controller candidate')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO boms (name, revision, description)
VALUES ('Demo Controller PCB', 'A', 'Sample BOM for validation')
ON CONFLICT (name, revision) DO NOTHING;

INSERT INTO bom_items (bom_id, part_id, quantity, reference_designators, note)
SELECT b.id, p.id, x.qty, x.refs, x.note
FROM boms b
JOIN (VALUES
  ('Demo Controller PCB', 'A', 'R-0603-10K-001', 4.000, 'R1,R2,R3,R4', 'Pull-up network'),
  ('Demo Controller PCB', 'A', 'C-0603-100N-001', 8.000, 'C1-C8', 'Decoupling'),
  ('Demo Controller PCB', 'A', 'IC-QFN32-MCU-001', 1.000, 'U1', 'Main MCU')
) AS x(bom_name, rev, sku, qty, refs, note) ON x.bom_name = b.name AND x.rev = b.revision
JOIN parts p ON p.sku = x.sku
ON CONFLICT (bom_id, part_id) DO NOTHING;
