# Sourced — BOM Manager Rebuild Spec

> Arbeitsgrundlage für Claude Code. Ziel: aus einem funktionalen aber manuellen BOM-Tool
> einen KI-gestützten Sourcing-Assistenten machen, der echte Arbeit abnimmt.

---

## 1. Ist-Zustand (was bereits funktioniert)

### Stack
- **Frontend/Backend**: Next.js auf Vercel
- **Datenbank**: Supabase (PostgreSQL + RLS)
- **Auth**: Supabase Auth (multi-user, RLS aktiviert)
- **Preis-APIs**: Nexar (strukturierte Bauteilpreise), Tavily (Web-Fallback)

### Schema (bereits vorhanden)
```
bm_parts        → Teilekatalog pro User (inkl. stock, drawer)
bm_projects     → Projekte pro User
bm_bom_items    → BOM-Einträge (project_id → part_id, qty, reference)
bm_suppliers    → Preisdaten pro Teil pro Shop (price, sku, stock, ai_generated)
bm_shops        → Shop-Verwaltung pro User
```

### Was heute geht
- CSV Import
- Manuelles Anlegen von Teilen, Projekten, BOMs
- Manuelle Zuordnung von bevorzugtem Shop pro Teil
- Nexar/Tavily werden aufgerufen, Ergebnis landet in bm_suppliers

### Was nicht gut ist
- Kein automatischer Lagerabgleich beim BOM-Import
- Kein KI-gestütztes Part-Matching (generische Beschreibung → konkreter MPN)
- Keine Bestelloptimierung (welcher Shop, Versandkosten, Bündelung)
- Kein AliExpress-Flagging nach Bauteiltyp
- Keine Reel-Empfehlung bei wiederkehrenden Standardbauteilen
- Nexar-Daten werden gecacht aber nicht ausgewertet

---

## 2. Ziel-Workflow (nach Rebuild)

```
1. BOM importieren (CSV / KiCad)
       →
2. KI matched Beschreibungen → konkrete MPNs
   (Claude API: "100R 0603 1%" → "RC0603FR-07100RL")
       →
3. Lagerabgleich automatisch
   Ergebnis: "12 auf Lager � 4 teilweise � 12 fehlen komplett"
       →
4. Nexar-Preisabfrage für fehlende Teile
   (nur was wirklich bestellt werden muss)
       →
5. KI-Bestellvorschlag
   "Alles bei Mouser (58,20→� + kostenloser Versand ab 50→�)
    oder Split: 14 Teile Mouser + 3 Teile LCSC spart 4,10→�"
       →
6. AliExpress-Check
   Passivbauteile (R, C, L, D): "Ali OK � Reel erwägen"
   ICs, aktive Bauteile: "Vertrauenswürdiger Shop empfohlen"
       →
7. Bestellliste exportieren
   - CSV pro Shop (direkt importierbar)
   - OpenPnP Pick & Place
       →
8. Nach Lieferung: Lagerbestand aktualisieren
```

---

## 3. Schema-Erweiterungen

Folgende ALTER TABLE / CREATE TABLE Statements gegen die bestehende Supabase-Instanz ausführen.

### 3a. Shops erweitern

```sql
ALTER TABLE bm_shops ADD COLUMN IF NOT EXISTS free_shipping_threshold numeric(10,2);
ALTER TABLE bm_shops ADD COLUMN IF NOT EXISTS shipping_cost numeric(10,2) DEFAULT 0;
ALTER TABLE bm_shops ADD COLUMN IF NOT EXISTS trusted boolean NOT NULL DEFAULT true;
ALTER TABLE bm_shops ADD COLUMN IF NOT EXISTS supports_csv_import boolean NOT NULL DEFAULT false;
ALTER TABLE bm_shops ADD COLUMN IF NOT EXISTS ali_ok boolean NOT NULL DEFAULT false;
-- ali_ok: true für Shops (AliExpress, LCSC) wo Passivbauteile unkritisch sind
```

### 3b. Parts erweitern

```sql
ALTER TABLE bm_parts ADD COLUMN IF NOT EXISTS part_type text;
-- Werte: 'passive', 'active', 'ic', 'connector', 'mechanical', 'module', 'other'
-- Wird beim KI-Part-Matching automatisch gesetzt

ALTER TABLE bm_parts ADD COLUMN IF NOT EXISTS reel_qty integer;
-- Wenn gesetzt: Teil wird als Reel-Artikel behandelt (z.B. 5000 Stück)

ALTER TABLE bm_parts ADD COLUMN IF NOT EXISTS used_in_projects integer NOT NULL DEFAULT 0;
-- Wird beim Speichern von BOM-Items hochgezählt → Basis für Reel-Empfehlung
```

### 3c. Suppliers/Preiscache erweitern

```sql
ALTER TABLE bm_suppliers ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE bm_suppliers ADD COLUMN IF NOT EXISTS moq integer DEFAULT 1;
-- minimum order quantity
ALTER TABLE bm_suppliers ADD COLUMN IF NOT EXISTS price_break_qty integer;
ALTER TABLE bm_suppliers ADD COLUMN IF NOT EXISTS price_break_price numeric(12,4);
-- z.B. Einzelpreis 0,10→�, ab 100 Stück 0,03→�
```

### 3d. Neue Tabellen: Bestelllisten

```sql
CREATE TABLE IF NOT EXISTS bm_order_lists (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id text,
  shop_id text REFERENCES bm_shops(id),
  name text,
  status text NOT NULL DEFAULT 'draft',
  -- draft | ordered | partial | received
  total_price numeric(12,4),
  currency text NOT NULL DEFAULT 'EUR',
  notes text,
  ordered_at timestamptz,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE bm_order_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own their order lists" ON bm_order_lists
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS bm_order_items (
  id text PRIMARY KEY,
  order_list_id text NOT NULL REFERENCES bm_order_lists(id) ON DELETE CASCADE,
  part_id text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(12,4),
  sku text,
  received_qty integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE bm_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own their order items" ON bm_order_items
  USING (
    order_list_id IN (
      SELECT id FROM bm_order_lists WHERE user_id = auth.uid()
    )
  );
```

### 3e. KI-Match-Log (für Transparenz / Korrekturen)

```sql
CREATE TABLE IF NOT EXISTS bm_ai_matches (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_input text NOT NULL,
  -- was aus der CSV kam: "100R 0603 1%"
  matched_mpn text,
  matched_manufacturer text,
  matched_part_id text REFERENCES bm_parts(id),
  confidence text,
  -- 'high' | 'medium' | 'low'
  confirmed boolean DEFAULT false,
  -- User hat bestätigt oder korrigiert
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE bm_ai_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own their ai matches" ON bm_ai_matches
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

---

## 4. KI-Features → Implementierungsdetails

### 4a. Part-Matching (Claude API)

**Wo:** `/api/ai/match-parts` (neue Route)

**Input:** Array von rohen BOM-Zeilen nach CSV-Import
```json
[
  { "id": "tmp_1", "raw": "100R 0603 1% 0.1W", "qty": 10, "ref": "R1,R2" },
  { "id": "tmp_2", "raw": "ATmega328P-AU", "qty": 1, "ref": "U1" }
]
```

**Prompt-Logik:**
```
System: Du bist ein Elektronik-Experte. Analysiere BOM-Einträge und 
        gib für jeden Eintrag zurück:
        - mpn: wahrscheinlichste Part Number
        - manufacturer: Hersteller
        - part_type: passive|active|ic|connector|mechanical|module|other
        - footprint: wenn erkennbar (0603, SOT-23, TQFP-32, ...)
        - confidence: high|medium|low
        - notes: kurze Begründung wenn low
        Antworte NUR mit JSON-Array.

User: [JSON-Array der BOM-Zeilen]
```

**Danach:** Für `confidence: high` direkt Nexar-Abfrage starten.
Für `medium` und `low` dem User zur Bestätigung vorlegen.

**UI:** 
- Import-Wizard mit Review-Step
- Grün = high confidence (auto-akzeptiert)
- Gelb = medium (1-Klick-Bestätigung)  
- Rot = low (manuelles Feld vorausgefüllt, User tippt)

---

### 4b. Bestelloptimierung (Claude API)

**Wo:** `/api/ai/optimize-order` (neue Route)

**Input:** Fehlende Teile mit Nexar-Preisdaten aus `bm_suppliers` + Shop-Konfiguration aus `bm_shops`

**Prompt-Logik:**
```
System: Du bist ein Einkaufsoptimierer für Elektronikbauteile.
        Berechne die günstigste Bestellkombination.
        Berücksichtige: Versandkosten, Mindestbestellmengen, Verfügbarkeit.
        Flagge Passivbauteile (passive) für AliExpress/LCSC als "ali_ok".
        Gib 2-3 Szenarien zurück: günstigste, schnellste, ein-Shop.

User: {
  "parts": [...],       // fehlende Teile mit Preisen je Shop
  "shops": [...],       // Shops mit free_shipping_threshold + shipping_cost
  "quantities": {...}   // benötigte Mengen
}
```

**Output:** Drei Szenarien mit Breakdown, Claude erklärt warum.

---

### 4c. Reel-Empfehlung

**Wo:** Läuft im Hintergrund nach jedem BOM-Import, kein separater API-Call nötig.

**Logik (serverseitig, kein KI-Call nötig):**
```typescript
// Pseudocode
const reelCandidates = await supabase
  .from('bm_parts')
  .select('*, bm_bom_items(count)')
  .eq('part_type', 'passive')
  .gt('used_in_projects', 2)  // in mehr als 2 Projekten verwendet
  .is('reel_qty', null)        // noch kein Reel konfiguriert

// Für jeden Kandidaten: Preis für 5000 Stück via Nexar abfragen
// Wenn Reel-Preis < 5x Einzelpreis � übliche Verwendungsmenge: Empfehlung ausgeben
```

**UI:** Kleine Banner-Karte in der Inventory-Ansicht:
> � "100Ω 0603 kommt in 5 Projekten vor. LCSC-Reel (5000 St.) für ~3,20→�?"

---

## 5. Neue UI-Seiten / Komponenten

### 5a. BOM Import Wizard (überarbeiten)
Bestehender CSV-Import → mehrstufiger Wizard:

```
Schritt 1: CSV hochladen + Spalten-Mapping
Schritt 2: KI-Part-Matching Review (Ampel-System)
Schritt 3: Lagerabgleich → "was fehlt"
Schritt 4: Nexar-Preisabfrage starten
Schritt 5: Bestellvorschlag anzeigen
```

### 5b. Bestellvorschlag-Ansicht (neu)
- Drei Tabs: "Günstigste", "Schnellste", "Ein Shop"
- Pro Tab: Aufschlüsselung nach Shop + Teile + Preise
- "Bestellliste erstellen"-Button → generiert bm_order_lists + bm_order_items
- CSV-Export pro Shop (Mouser-Format, Reichelt-Format)

### 5c. Inventory Dashboard (überarbeiten)
- Hauptansicht: Teile mit `stock < stock_min` hervorheben
- Filter: Typ (passive/ic/...), Shop, Lagerort (drawer)
- Reel-Empfehlungen als Sidebar-Karten
- "Lagerbestand aktualisieren nach Lieferung" → Bestellliste abharken

### 5d. Projekt-�bersicht (erweitern)
- BOM-Ampel: Grün = alles da, Gelb = teilweise, Rot = fehlt viel
- Direktlink: "Fehlende Teile bestellen"

---

## 6. API-Routes-�bersicht (Soll)

```
Bestehend (prüfen ob vorhanden):
GET/POST  /api/parts
GET/POST  /api/projects
GET/POST  /api/bom-items
GET/POST  /api/suppliers
GET/POST  /api/shops
POST      /api/nexar/search        → Nexar-Preisabfrage
POST      /api/tavily/search       → Tavily Web-Fallback

Neu:
POST      /api/ai/match-parts      → KI Part-Matching (Claude API)
POST      /api/ai/optimize-order   → KI Bestelloptimierung (Claude API)
POST      /api/bom/import          → CSV Import mit Match-Trigger
GET       /api/bom/gap-analysis    → Lagerabgleich für Projekt
POST      /api/orders              → Bestellliste erstellen
GET       /api/orders/:id/export   → CSV Export pro Shop
POST      /api/inventory/receive   → Lager aktualisieren nach Lieferung
```

---

## 7. Priorisierung

### Phase 1 → Sofortiger Mehrwert (anfangen hier)
- [x] `gap_analysis`: BOM gegen Lagerbestand prüfen, "was fehlt"-Liste
- [x] UI: Projekt-�bersicht mit Ampel-Status
- [x] Schema: Part-Type + Shop-Felder ergänzen (Abschnitt 3a + 3b)

### Phase 2 → KI-Part-Matching
- [ ] `/api/ai/match-parts` implementieren
- [ ] Import-Wizard als mehrstufigen Flow überarbeiten
- [ ] `bm_ai_matches` Tabelle + Confirm-UI

### Phase 3 → Bestelloptimierung
- [ ] `bm_order_lists` + `bm_order_items` Tabellen anlegen (Abschnitt 3d)
- [ ] `/api/ai/optimize-order` implementieren
- [ ] Bestellvorschlag-UI
- [ ] CSV-Export pro Shop

### Phase 4 → Inventory-Komfort
- [ ] Reel-Empfehlung Logik
- [ ] "Nach Lieferung einbuchen"-Flow
- [ ] Mindestbestand-Alerts

---

## 8. Technische Hinweise für Claude Code

### KI-Calls (Claude API)
```typescript
// Immer claude-sonnet-4-20250514 verwenden
// max_tokens: 2000 für Part-Matching, 1500 für Order-Optimization
// Antwort immer als JSON prompten, Strip markdown fences vor JSON.parse
// Bei Part-Matching: Batch-Grö�e max. 20 Teile pro API-Call
```

### Nexar-Integration (bereits vorhanden)
```typescript
// Bestehende Nexar-Route wiederverwenden
// Cache-TTL: 24h (updated_at in bm_suppliers prüfen)
// Falls Nexar kein Ergebnis: Tavily als Fallback
// Tavily-Query: "{MPN} {manufacturer} datasheet price"
```

### Supabase
```typescript
// Service Role Key NUR in API Routes, nie im Client
// Alle Queries mit .eq('user_id', session.user.id) absichern
// Bei neuen Tabellen: RLS nicht vergessen (siehe supabase_setup.sql als Vorlage)
```

### CSV-Export Format (Mouser)
```
Mouser Part Number,Quantity,Customer Part Number
638-RC0603FR-07100RL,10,R1
```

### CSV-Export Format (Reichelt)
```
Bestellnummer;Menge;Kommentar
RND 155-00052;10;R1 100R 0603
```

---

## 9. Offene Fragen / Entscheidungen

- [ ] **AliExpress-Bestellliste**: Da AliExpress keine offizielle API hat, nur als manuelle
      Liste exportieren (Artikelname + gesuchte Specs) mit Hinweis "bei AliExpress suchen"?
- [ ] **Reichelt**: Kein API. Bestellliste als CSV im Reichelt-Format exportieren
      (Bestellnummer;Menge), sodass der User direkt in "Merkzettel importieren" kann.
- [ ] **LCSC hinzufügen**: LCSC hat eine gute API und ist günstig für Passivbauteile.
      Als Standard-Shop für "passive + ali_ok" hinzufügen?
- [ ] **Preisanzeige**: Alle Preise in EUR normalisieren oder Originalwährung behalten?

