const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('../database');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '')));

// --- DATABASE HELPERS ---
const runQuery = (query, params = []) => new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
        if (err) reject(err);
        else resolve(this);
    });
});

const allQuery = (query, params = []) => new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

const getOne = (query, params = []) => new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
    });
});

// ─── Ensure tables exist (safe for shared DB) ───────────────────────────────
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS event_rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        capacity INTEGER,
        price_per_day REAL,
        type TEXT,
        status TEXT DEFAULT 'Available'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_name TEXT,
        customer_name TEXT,
        customer_phone TEXT,
        room_id INTEGER,
        date_start TEXT,
        date_end TEXT,
        num_guests INTEGER,
        status TEXT DEFAULT 'Pending',
        total_price REAL,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(room_id) REFERENCES event_rooms(id)
    )`);

    // Add notes & created_at columns if upgrading an older DB
    db.run("ALTER TABLE reservations ADD COLUMN notes TEXT", () => {});
    db.run("ALTER TABLE reservations ADD COLUMN created_at TEXT DEFAULT (datetime('now'))", () => {});

    // ── Inquiries Table ───────────────────────────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS inquiries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ref_no TEXT UNIQUE,
        customer_name TEXT NOT NULL,
        customer_phone TEXT,
        customer_email TEXT,
        event_type TEXT,
        preferred_date TEXT,
        flexible_date INTEGER DEFAULT 0,
        num_guests INTEGER,
        preferred_room_id INTEGER,
        budget REAL,
        requirements TEXT,
        source TEXT DEFAULT 'Walk-in',
        status TEXT DEFAULT 'New',
        assigned_to TEXT,
        follow_up_date TEXT,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY(preferred_room_id) REFERENCES event_rooms(id)
    )`);

    // Seed event rooms if table is empty
    db.get("SELECT COUNT(*) as count FROM event_rooms", (err, row) => {
        if (!err && row.count === 0) {
            db.run("INSERT INTO event_rooms (name, capacity, price_per_day, type, status) VALUES ('Araliya Grand Banquet', 200, 50000.00, 'Banquet', 'Available')");
            db.run("INSERT INTO event_rooms (name, capacity, price_per_day, type, status) VALUES ('Sigiri Boardroom', 20, 15000.00, 'Meeting', 'Available')");
            db.run("INSERT INTO event_rooms (name, capacity, price_per_day, type, status) VALUES ('Samanala Rooftop Terrace', 100, 30000.00, 'Outdoor', 'Available')");
        }
    });
});

// ═══════════════════════════════════════════════════════════
// INQUIRIES API
// ═══════════════════════════════════════════════════════════

// Generate reference number
function generateRef() {
    const now = new Date();
    return `INQ-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// GET all inquiries
app.get('/api/inquiries', async (req, res) => {
    try {
        const rows = await allQuery(`
            SELECT i.*, e.name as room_name
            FROM inquiries i
            LEFT JOIN event_rooms e ON i.preferred_room_id = e.id
            ORDER BY i.created_at DESC
        `);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET single inquiry
app.get('/api/inquiries/:id', async (req, res) => {
    try {
        const row = await getOne(`
            SELECT i.*, e.name as room_name
            FROM inquiries i
            LEFT JOIN event_rooms e ON i.preferred_room_id = e.id
            WHERE i.id = ?
        `, [req.params.id]);
        if (!row) return res.status(404).json({ error: 'Not found' });
        res.json(row);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create inquiry
app.post('/api/inquiries', async (req, res) => {
    const { customer_name, customer_phone, customer_email, event_type, preferred_date,
            flexible_date, num_guests, preferred_room_id, budget, requirements,
            source, assigned_to, follow_up_date, notes } = req.body;
    if (!customer_name) return res.status(400).json({ error: 'Customer name is required' });
    if (!customer_phone && !customer_email) return res.status(400).json({ error: 'At least one contact method is required' });
    if (customer_phone && !/^\+?[0-9\s\-\(\)]{7,15}$/.test(customer_phone)) return res.status(400).json({ error: 'Invalid phone number format' });
    if (customer_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email)) return res.status(400).json({ error: 'Invalid email format' });
    if (budget && isNaN(budget)) return res.status(400).json({ error: 'Budget must be a number' });
    if (num_guests && isNaN(num_guests)) return res.status(400).json({ error: 'Guests must be a number' });
    try {
        const ref_no = generateRef();
        const result = await runQuery(`
            INSERT INTO inquiries
            (ref_no, customer_name, customer_phone, customer_email, event_type,
             preferred_date, flexible_date, num_guests, preferred_room_id,
             budget, requirements, source, status, assigned_to, follow_up_date, notes,
             created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'New',?,?,?,datetime('now'),datetime('now'))
        `, [ref_no, customer_name, customer_phone, customer_email, event_type,
            preferred_date, flexible_date ? 1 : 0, num_guests, preferred_room_id || null,
            budget, requirements, source || 'Walk-in', assigned_to, follow_up_date, notes]);
        const inquiry = await getOne(`SELECT i.*, e.name as room_name FROM inquiries i LEFT JOIN event_rooms e ON i.preferred_room_id = e.id WHERE i.id = ?`, [result.lastID]);
        res.status(201).json(inquiry);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT update inquiry
app.put('/api/inquiries/:id', async (req, res) => {
    const { customer_name, customer_phone, customer_email, event_type, preferred_date,
            flexible_date, num_guests, preferred_room_id, budget, requirements,
            source, status, assigned_to, follow_up_date, notes } = req.body;
    if (!customer_name) return res.status(400).json({ error: 'Customer name is required' });
    if (!customer_phone && !customer_email) return res.status(400).json({ error: 'At least one contact method is required' });
    if (customer_phone && !/^\+?[0-9\s\-\(\)]{7,15}$/.test(customer_phone)) return res.status(400).json({ error: 'Invalid phone number format' });
    if (customer_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email)) return res.status(400).json({ error: 'Invalid email format' });
    if (budget && isNaN(budget)) return res.status(400).json({ error: 'Budget must be a number' });
    if (num_guests && isNaN(num_guests)) return res.status(400).json({ error: 'Guests must be a number' });
    try {
        await runQuery(`
            UPDATE inquiries SET
            customer_name=?, customer_phone=?, customer_email=?, event_type=?,
            preferred_date=?, flexible_date=?, num_guests=?, preferred_room_id=?,
            budget=?, requirements=?, source=?, status=?, assigned_to=?,
            follow_up_date=?, notes=?, updated_at=datetime('now')
            WHERE id=?
        `, [customer_name, customer_phone, customer_email, event_type,
            preferred_date, flexible_date ? 1 : 0, num_guests, preferred_room_id || null,
            budget, requirements, source, status, assigned_to, follow_up_date, notes, req.params.id]);
        const inquiry = await getOne(`SELECT i.*, e.name as room_name FROM inquiries i LEFT JOIN event_rooms e ON i.preferred_room_id = e.id WHERE i.id = ?`, [req.params.id]);
        res.json(inquiry);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH status only
app.patch('/api/inquiries/:id/status', async (req, res) => {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status is required' });
    try {
        await runQuery("UPDATE inquiries SET status=?, updated_at=datetime('now') WHERE id=?", [status, req.params.id]);
        const inquiry = await getOne(`SELECT i.*, e.name as room_name FROM inquiries i LEFT JOIN event_rooms e ON i.preferred_room_id = e.id WHERE i.id = ?`, [req.params.id]);
        res.json(inquiry);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST convert inquiry → reservation
app.post('/api/inquiries/:id/convert', async (req, res) => {
    try {
        const inq = await getOne("SELECT * FROM inquiries WHERE id = ?", [req.params.id]);
        if (!inq) return res.status(404).json({ error: 'Inquiry not found' });

        const resResult = await runQuery(`
            INSERT INTO reservations (event_name, customer_name, customer_phone, room_id, date_start, num_guests, status, total_price, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?, ?, datetime('now'))
        `, [inq.event_type || 'Event', inq.customer_name, inq.customer_phone,
            inq.preferred_room_id || null, inq.preferred_date, inq.num_guests,
            inq.budget, inq.requirements]);

        await runQuery("UPDATE inquiries SET status='Converted', updated_at=datetime('now') WHERE id=?", [inq.id]);

        if (inq.preferred_room_id) {
            await runQuery("UPDATE event_rooms SET status='Booked' WHERE id=?", [inq.preferred_room_id]);
        }

        res.json({ success: true, reservation_id: resResult.lastID, message: 'Inquiry converted to reservation' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE inquiry
app.delete('/api/inquiries/:id', async (req, res) => {
    try {
        await runQuery("DELETE FROM inquiries WHERE id=?", [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});



// ═══════════════════════════════════════════════════════════
// EVENT ROOMS API
// ═══════════════════════════════════════════════════════════

// GET all rooms
app.get('/api/event-rooms', async (req, res) => {
    try {
        const rows = await allQuery("SELECT * FROM event_rooms ORDER BY id ASC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST create room
app.post('/api/event-rooms', async (req, res) => {
    const { name, capacity, price_per_day, type, status } = req.body;
    if (!name || !capacity || !price_per_day) {
        return res.status(400).json({ error: 'Name, capacity and price_per_day are required' });
    }
    if (isNaN(capacity) || capacity < 1) return res.status(400).json({ error: 'Capacity must be > 0' });
    if (isNaN(price_per_day) || price_per_day < 0) return res.status(400).json({ error: 'Price must be >= 0' });
    try {
        const result = await runQuery(
            "INSERT INTO event_rooms (name, capacity, price_per_day, type, status) VALUES (?, ?, ?, ?, ?)",
            [name, capacity, price_per_day, type || 'Banquet', status || 'Available']
        );
        const room = await getOne("SELECT * FROM event_rooms WHERE id = ?", [result.lastID]);
        res.status(201).json(room);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT update room
app.put('/api/event-rooms/:id', async (req, res) => {
    const { name, capacity, price_per_day, type, status } = req.body;
    if (!name || !capacity || !price_per_day) {
        return res.status(400).json({ error: 'Name, capacity and price_per_day are required' });
    }
    if (isNaN(capacity) || capacity < 1) return res.status(400).json({ error: 'Capacity must be > 0' });
    if (isNaN(price_per_day) || price_per_day < 0) return res.status(400).json({ error: 'Price must be >= 0' });
    try {
        await runQuery(
            "UPDATE event_rooms SET name=?, capacity=?, price_per_day=?, type=?, status=? WHERE id=?",
            [name, capacity, price_per_day, type, status, req.params.id]
        );
        const room = await getOne("SELECT * FROM event_rooms WHERE id = ?", [req.params.id]);
        res.json(room);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE room
app.delete('/api/event-rooms/:id', async (req, res) => {
    try {
        await runQuery("DELETE FROM event_rooms WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
// RESERVATIONS API
// ═══════════════════════════════════════════════════════════

// GET all reservations (with room name joined)
app.get('/api/reservations', async (req, res) => {
    try {
        const rows = await allQuery(`
            SELECT r.*, e.name as room_name, e.type as room_type, e.price_per_day
            FROM reservations r
            LEFT JOIN event_rooms e ON r.room_id = e.id
            ORDER BY r.date_start DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET single reservation
app.get('/api/reservations/:id', async (req, res) => {
    try {
        const row = await getOne(`
            SELECT r.*, e.name as room_name
            FROM reservations r
            LEFT JOIN event_rooms e ON r.room_id = e.id
            WHERE r.id = ?
        `, [req.params.id]);
        if (!row) return res.status(404).json({ error: 'Not found' });
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST create reservation + update room status
app.post('/api/reservations', async (req, res) => {
    const { event_name, customer_name, customer_phone, room_id, date_start, date_end, num_guests, status, total_price, notes } = req.body;
    if (!event_name || !customer_name || !date_start) {
        return res.status(400).json({ error: 'Event name, customer name and date_start are required' });
    }
    if (customer_phone && !/^\+?[0-9\s\-\(\)]{7,15}$/.test(customer_phone)) return res.status(400).json({ error: 'Invalid phone number format' });
    if (date_end && new Date(date_start) > new Date(date_end)) return res.status(400).json({ error: 'End date cannot be before start date' });
    if (num_guests && (isNaN(num_guests) || num_guests < 1)) return res.status(400).json({ error: 'Guests must be at least 1' });
    if (total_price && (isNaN(total_price) || total_price < 0)) return res.status(400).json({ error: 'Total price cannot be negative' });
    try {
        const result = await runQuery(
            `INSERT INTO reservations (event_name, customer_name, customer_phone, room_id, date_start, date_end, num_guests, status, total_price, notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [event_name, customer_name, customer_phone, room_id || null, date_start, date_end, num_guests, status || 'Pending', total_price, notes || null]
        );

        // If confirmed, mark room as booked
        if ((status === 'Confirmed') && room_id) {
            await runQuery("UPDATE event_rooms SET status = 'Booked' WHERE id = ?", [room_id]);
        }

        const row = await getOne(`
            SELECT r.*, e.name as room_name
            FROM reservations r LEFT JOIN event_rooms e ON r.room_id = e.id
            WHERE r.id = ?
        `, [result.lastID]);
        res.status(201).json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT update reservation status (confirm, cancel, etc.)
app.put('/api/reservations/:id', async (req, res) => {
    const { event_name, customer_name, customer_phone, room_id, date_start, date_end, num_guests, status, total_price, notes } = req.body;
    if (!event_name || !customer_name || !date_start) {
        return res.status(400).json({ error: 'Event name, customer name and date_start are required' });
    }
    if (customer_phone && !/^\+?[0-9\s\-\(\)]{7,15}$/.test(customer_phone)) return res.status(400).json({ error: 'Invalid phone number format' });
    if (date_end && new Date(date_start) > new Date(date_end)) return res.status(400).json({ error: 'End date cannot be before start date' });
    if (num_guests && (isNaN(num_guests) || num_guests < 1)) return res.status(400).json({ error: 'Guests must be at least 1' });
    if (total_price && (isNaN(total_price) || total_price < 0)) return res.status(400).json({ error: 'Total price cannot be negative' });
    try {
        // Get old record to see if room needs to be freed
        const old = await getOne("SELECT * FROM reservations WHERE id = ?", [req.params.id]);

        await runQuery(
            `UPDATE reservations SET event_name=?, customer_name=?, customer_phone=?, room_id=?, date_start=?, date_end=?, num_guests=?, status=?, total_price=?, notes=?
             WHERE id=?`,
            [event_name, customer_name, customer_phone, room_id, date_start, date_end, num_guests, status, total_price, notes, req.params.id]
        );

        // Sync room status based on reservation status changes
        if (old && old.room_id) {
            if (status === 'Confirmed') {
                await runQuery("UPDATE event_rooms SET status = 'Booked' WHERE id = ?", [old.room_id]);
            } else if (status === 'Cancelled') {
                // Check if any other confirmed reservations use this room
                const others = await allQuery(
                    "SELECT id FROM reservations WHERE room_id = ? AND status = 'Confirmed' AND id != ?",
                    [old.room_id, req.params.id]
                );
                if (others.length === 0) {
                    await runQuery("UPDATE event_rooms SET status = 'Available' WHERE id = ?", [old.room_id]);
                }
            }
        }

        const updated = await getOne(`
            SELECT r.*, e.name as room_name
            FROM reservations r LEFT JOIN event_rooms e ON r.room_id = e.id
            WHERE r.id = ?
        `, [req.params.id]);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH — quick status-only update
app.patch('/api/reservations/:id/status', async (req, res) => {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status is required' });
    try {
        const old = await getOne("SELECT * FROM reservations WHERE id = ?", [req.params.id]);
        await runQuery("UPDATE reservations SET status = ? WHERE id = ?", [status, req.params.id]);

        // Sync room status
        if (old && old.room_id) {
            if (status === 'Confirmed') {
                await runQuery("UPDATE event_rooms SET status = 'Booked' WHERE id = ?", [old.room_id]);
            } else if (status === 'Cancelled') {
                const others = await allQuery(
                    "SELECT id FROM reservations WHERE room_id = ? AND status = 'Confirmed' AND id != ?",
                    [old.room_id, req.params.id]
                );
                if (others.length === 0) {
                    await runQuery("UPDATE event_rooms SET status = 'Available' WHERE id = ?", [old.room_id]);
                }
            }
        }

        const updated = await getOne(`
            SELECT r.*, e.name as room_name
            FROM reservations r LEFT JOIN event_rooms e ON r.room_id = e.id
            WHERE r.id = ?
        `, [req.params.id]);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE reservation + free room
app.delete('/api/reservations/:id', async (req, res) => {
    try {
        const old = await getOne("SELECT * FROM reservations WHERE id = ?", [req.params.id]);
        await runQuery("DELETE FROM reservations WHERE id = ?", [req.params.id]);

        // Free the room if no other confirmed bookings for it
        if (old && old.room_id) {
            const others = await allQuery(
                "SELECT id FROM reservations WHERE room_id = ? AND status = 'Confirmed'",
                [old.room_id]
            );
            if (others.length === 0) {
                await runQuery("UPDATE event_rooms SET status = 'Available' WHERE id = ?", [old.room_id]);
            }
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
// CUSTOMERS API
// ═══════════════════════════════════════════════════════════

// GET all customers
app.get('/api/customers', async (req, res) => {
    try {
        const rows = await allQuery("SELECT * FROM customers ORDER BY name ASC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET single customer
app.get('/api/customers/:id', async (req, res) => {
    try {
        const row = await getOne("SELECT * FROM customers WHERE id = ?", [req.params.id]);
        if (!row) return res.status(404).json({ error: 'Not found' });
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST create customer
app.post('/api/customers', async (req, res) => {
    const { name, phone, email } = req.body;
    if (!name) return res.status(400).json({ error: 'Customer name is required' });
    if (!phone) return res.status(400).json({ error: 'Customer phone is required' });
    if (phone && !/^\+?[0-9\s\-\(\)]{7,15}$/.test(phone)) return res.status(400).json({ error: 'Invalid phone number format' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email format' });
    try {
        const result = await runQuery(
            "INSERT INTO customers (name, phone, email, loyalty_points, total_spent) VALUES (?, ?, ?, 0, 0)",
            [name, phone || '', email || '']
        );
        const customer = await getOne("SELECT * FROM customers WHERE id = ?", [result.lastID]);
        res.status(201).json(customer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT update customer
app.put('/api/customers/:id', async (req, res) => {
    const { name, phone, email } = req.body;
    if (!name) return res.status(400).json({ error: 'Customer name is required' });
    if (!phone) return res.status(400).json({ error: 'Customer phone is required' });
    if (phone && !/^\+?[0-9\s\-\(\)]{7,15}$/.test(phone)) return res.status(400).json({ error: 'Invalid phone number format' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email format' });
    try {
        await runQuery(
            "UPDATE customers SET name=?, phone=?, email=? WHERE id=?",
            [name, phone, email, req.params.id]
        );
        const customer = await getOne("SELECT * FROM customers WHERE id = ?", [req.params.id]);
        res.json(customer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE customer
app.delete('/api/customers/:id', async (req, res) => {
    try {
        await runQuery("DELETE FROM customers WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = 302;
app.listen(PORT, () => {
    console.log(`✅ Reservation Server running on http://localhost:${PORT}`);
});
