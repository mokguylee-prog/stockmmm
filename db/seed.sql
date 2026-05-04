INSERT INTO parts (sku, name, category, manufacturer, mpn, footprint, value, location, quantity, min_quantity, notes)
VALUES
  ('R-0603-10K-001', 'Resistor 10kΩ 1%', 'Resistor', 'Yageo', 'RC0603FR-0710KL', '0603', '10kΩ', 'A1-01', 500, 100, 'Common pull-up resistor'),
  ('C-0603-100N-001', 'Capacitor 100nF X7R', 'Capacitor', 'Murata', 'GRM188R71C104KA01D', '0603', '100nF', 'A1-02', 800, 150, 'Decoupling capacitor'),
  ('IC-QFN32-MCU-001', 'STM32 MCU', 'IC', 'STMicroelectronics', 'STM32G0B1KET6', 'QFN-32', NULL, 'B2-03', 24, 10, 'Main controller candidate')
ON CONFLICT (sku) DO NOTHING;
