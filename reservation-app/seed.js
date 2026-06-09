/**
 * IMPERIAL RESERVATIONS — Database Seeder
 * Run: node reservation-app/seed.js
 * Inserts realistic dummy data for all tables.
 */

const db = require('../database');

const run  = (sql, params = []) => new Promise((res, rej) => db.run(sql, params, function(e) { e ? rej(e) : res(this); }));
const get  = (sql, params = []) => new Promise((res, rej) => db.get(sql, params, (e, r) => e ? rej(e) : res(r)));
const all  = (sql, params = []) => new Promise((res, rej) => db.all(sql, params, (e, r) => e ? rej(e) : res(r)));

const log  = (msg) => console.log(`\x1b[36m  ✔  ${msg}\x1b[0m`);
const warn = (msg) => console.log(`\x1b[33m  ⚠  ${msg}\x1b[0m`);

async function seed() {
    console.log('\n\x1b[1m\x1b[35m═══════════════════════════════════════════════\x1b[0m');
    console.log('\x1b[1m\x1b[35m  IMPERIAL RESERVATIONS — Database Seeder\x1b[0m');
    console.log('\x1b[1m\x1b[35m═══════════════════════════════════════════════\x1b[0m\n');

    // ── Ensure tables exist ────────────────────────────────────────────────────
    await run(`CREATE TABLE IF NOT EXISTS event_rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT, capacity INTEGER, price_per_day REAL, type TEXT,
        status TEXT DEFAULT 'Available'
    )`);
    await run(`CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_name TEXT, customer_name TEXT, customer_phone TEXT, room_id INTEGER,
        date_start TEXT, date_end TEXT, num_guests INTEGER, status TEXT DEFAULT 'Pending',
        total_price REAL, notes TEXT, created_at TEXT DEFAULT (datetime('now'))
    )`);
    await run(`CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT, phone TEXT, email TEXT,
        loyalty_points INTEGER DEFAULT 0, total_spent REAL DEFAULT 0
    )`);
    await run(`CREATE TABLE IF NOT EXISTS inquiries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ref_no TEXT UNIQUE, customer_name TEXT NOT NULL, customer_phone TEXT,
        customer_email TEXT, event_type TEXT, preferred_date TEXT,
        flexible_date INTEGER DEFAULT 0, num_guests INTEGER, preferred_room_id INTEGER,
        budget REAL, requirements TEXT, source TEXT DEFAULT 'Walk-in',
        status TEXT DEFAULT 'New', assigned_to TEXT, follow_up_date TEXT,
        notes TEXT, created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    )`);
    await run("ALTER TABLE reservations ADD COLUMN notes TEXT", () => {}).catch(() => {});
    await run("ALTER TABLE reservations ADD COLUMN created_at TEXT DEFAULT (datetime('now'))", () => {}).catch(() => {});

    // ── 1. EVENT ROOMS ─────────────────────────────────────────────────────────
    const roomCount = (await get("SELECT COUNT(*) as c FROM event_rooms")).c;
    if (roomCount === 0) {
        const rooms = [
            ['Araliya Grand Banquet',     400,  85000, 'Banquet',    'Available'],
            ['Nelum Crystal Ballroom',    250,  65000, 'Banquet',    'Booked'],
            ['Sigiri Boardroom',           20,  18000, 'Meeting',    'Available'],
            ['Diyawanna Conference Hall',  80,  35000, 'Conference', 'Available'],
            ['Samanala Rooftop Terrace',  120,  42000, 'Outdoor',    'Available'],
            ['Mihintale Pavilion',        300,  70000, 'Banquet',    'Booked'],
            ['Kandyan Meeting Suite',      30,  22000, 'Meeting',    'Maintenance'],
            ['Beira Lake Amphitheatre',   500, 110000, 'Outdoor',    'Available'],
        ];
        for (const [name, cap, price, type, status] of rooms) {
            await run("INSERT INTO event_rooms (name, capacity, price_per_day, type, status) VALUES (?,?,?,?,?)",
                [name, cap, price, type, status]);
        }
        log(`Inserted ${rooms.length} event rooms`);
    } else {
        warn(`Event rooms already exist (${roomCount} rows) — skipping`);
    }

    // Fetch room IDs
    const rooms = await all("SELECT id, name FROM event_rooms");
    const roomId = (name) => (rooms.find(r => r.name.includes(name)) || rooms[0]).id;

    // ── 2. CUSTOMERS ──────────────────────────────────────────────────────────
    const custCount = (await get("SELECT COUNT(*) as c FROM customers")).c;
    if (custCount < 5) {
        const customers = [
            ['Kamal Perera',       '+94 77 123 4567', 'kamal.perera@gmail.com',       850,  125000],
            ['Nimal Fernando',     '+94 71 987 6543', 'nimal.fernando@yahoo.com',      420,   78000],
            ['Srimali Jayawardena','+94 76 456 7890', 'srimali.j@hotmail.com',        1200,  240000],
            ['Roshan Silva',       '+94 72 321 0987', 'roshan.silva@gmail.com',         150,   35000],
            ['Dilani Wickramasinghe','+94 70 654 3210','dilani.w@gmail.com',            600,  112000],
            ['Ashan Bandara',      '+94 75 789 0123', 'ashan.bandara@outlook.com',      320,   64000],
            ['Malsha Gunasekara',  '+94 77 234 5678', 'malsha.g@gmail.com',             980,  185000],
            ['Tharaka Ranasinghe', '+94 71 345 6789', 'tharaka.r@gmail.com',            110,   22000],
            ['Priyanka Dissanayake','+94 76 890 1234','priyanka.d@hotmail.com',         450,   90000],
            ['Chamara Senanayake', '+94 72 567 8901', 'chamara.s@gmail.com',            740,  148000],
        ];
        for (const [name, phone, email, pts, spent] of customers) {
            await run("INSERT INTO customers (name, phone, email, loyalty_points, total_spent) VALUES (?,?,?,?,?)",
                [name, phone, email, pts, spent]);
        }
        log(`Inserted ${customers.length} customers`);
    } else {
        warn(`Customers already exist (${custCount} rows) — skipping`);
    }

    // ── 3. RESERVATIONS ────────────────────────────────────────────────────────
    const resCount = (await get("SELECT COUNT(*) as c FROM reservations")).c;
    if (resCount < 5) {
        const reservations = [
            ['Kamal & Dilani Wedding',      'Kamal Perera',         '+94 77 123 4567', 'Araliya Grand Banquet', '2026-07-12', '2026-07-13', 350, 'Confirmed', 170000, 'Full flower decoration required'],
            ['Silva Family Anniversary',    'Roshan Silva',          '+94 72 321 0987', 'Nelum Crystal Ballroom',   '2026-07-18', '2026-07-18', 120, 'Confirmed', 78000,  'Cake cutting at 8PM'],
            ['Tech Corp Annual Gala',       'Nimal Fernando',        '+94 71 987 6543', 'Araliya Grand Banquet', '2026-08-05', '2026-08-05', 280, 'Pending',   145000, 'Projector and PA system needed'],
            ['Dilani Birthday Bash',        'Dilani Wickramasinghe', '+94 70 654 3210', 'Samanala Rooftop Terrace',     '2026-07-25', '2026-07-25',  80, 'Confirmed',  56000, 'Outdoor setup with fairy lights'],
            ['Ashan & Malsha Engagement',  'Ashan Bandara',          '+94 75 789 0123', 'Nelum Crystal Ballroom',   '2026-08-14', '2026-08-14', 150, 'Pending',   95000,  null],
            ['MAS Holdings Conference',    'Chamara Senanayake',     '+94 72 567 8901', 'Diyawanna Conference Hall', '2026-08-20', '2026-08-21',  60, 'Confirmed', 70000,  '2 days conference with lunch'],
            ['Perera Family Reunion',      'Kamal Perera',           '+94 77 123 4567', 'Mihintale Pavilion',   '2026-09-01', '2026-09-01', 200, 'Cancelled', 85000,  'Cancelled - date conflict'],
            ['Gunasekara Product Launch',  'Malsha Gunasekara',      '+94 77 234 5678', 'Beira Lake Amphitheatre','2026-09-10','2026-09-10',400,'Confirmed', 220000, 'Stage setup and media backdrop'],
            ['Ranasinghe Birthday Dinner', 'Tharaka Ranasinghe',     '+94 71 345 6789', 'Sigiri Boardroom', '2026-07-30','2026-07-30',  18, 'Pending',  35000,  null],
            ['Jayawardena Wedding',        'Srimali Jayawardena',    '+94 76 456 7890', 'Araliya Grand Banquet', '2026-10-05', '2026-10-06', 380, 'Confirmed', 250000, 'Two-day event with full catering'],
        ];
        for (const [name, cust, phone, room, ds, de, guests, status, price, notes] of reservations) {
            const rid = roomId(room.split(' ').slice(0,2).join(' '));
            await run(`INSERT INTO reservations (event_name, customer_name, customer_phone, room_id, date_start, date_end, num_guests, status, total_price, notes, created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))`,
                [name, cust, phone, rid, ds, de, guests, status, price, notes]);
        }
        log(`Inserted ${reservations.length} reservations`);
    } else {
        warn(`Reservations already exist (${resCount} rows) — skipping`);
    }

    // ── 4. INQUIRIES ───────────────────────────────────────────────────────────
    const inqCount = (await get("SELECT COUNT(*) as c FROM inquiries")).c;
    if (inqCount < 5) {
        const today = new Date();
        const dt = (offsetDays) => {
            const d = new Date(today);
            d.setDate(d.getDate() + offsetDays);
            return d.toISOString().split('T')[0];
        };

        const inquiries = [
            {
                ref_no: 'INQ-20260609-1001',
                customer_name: 'Prabhath Mendis', customer_phone: '+94 77 111 2222',
                customer_email: 'prabhath.m@gmail.com', event_type: 'Wedding',
                preferred_date: dt(45), flexible_date: 0, num_guests: 300,
                room: 'Araliya Grand Banquet', budget: 180000,
                requirements: 'Full flower decoration, multi-course dinner, live band',
                source: 'Referral', status: 'New', assigned_to: 'Suresh K.',
                follow_up_date: dt(2),
                notes: 'Referred by Kamal Perera. High-value lead.'
            },
            {
                ref_no: 'INQ-20260609-1002',
                customer_name: 'Lanka Pharma Ltd', customer_phone: '+94 11 456 7890',
                customer_email: 'events@lankapharma.lk', event_type: 'Corporate Event',
                preferred_date: dt(30), flexible_date: 1, num_guests: 150,
                room: 'Diyawanna Conference Hall', budget: 95000,
                requirements: 'Branded stage backdrop, 4 breakout rooms, lunch buffet for 2 days',
                source: 'Email', status: 'In Progress', assigned_to: 'Nirosha P.',
                follow_up_date: dt(1),
                notes: 'Annual partner summit. Repeat client from last year.'
            },
            {
                ref_no: 'INQ-20260609-1003',
                customer_name: 'Rashmi Fernando', customer_phone: '+94 76 333 4444',
                customer_email: 'rashmi.f@yahoo.com', event_type: 'Birthday Party',
                preferred_date: dt(20), flexible_date: 1, num_guests: 80,
                room: 'Samanala Rooftop Terrace', budget: 55000,
                requirements: 'Outdoor fairy light setup, DJ, customised birthday cake',
                source: 'Social Media', status: 'Quoted', assigned_to: 'Suresh K.',
                follow_up_date: dt(-1),
                notes: 'Quote sent on 08/06. Awaiting confirmation.'
            },
            {
                ref_no: 'INQ-20260609-1004',
                customer_name: 'Thilini Samarakoon', customer_phone: '+94 70 555 6666',
                customer_email: 'thilini.s@gmail.com', event_type: 'Anniversary',
                preferred_date: dt(60), flexible_date: 0, num_guests: 50,
                room: 'Nelum Crystal Ballroom', budget: 45000,
                requirements: '25th silver anniversary, intimate dinner setup, floral centrepieces',
                source: 'Walk-in', status: 'New', assigned_to: null,
                follow_up_date: dt(4),
                notes: null
            },
            {
                ref_no: 'INQ-20260609-1005',
                customer_name: 'Ceylinco Insurance', customer_phone: '+94 11 789 0123',
                customer_email: 'hr@ceylinco.lk', event_type: 'Conference',
                preferred_date: dt(15), flexible_date: 0, num_guests: 200,
                room: 'Beira Lake Amphitheatre', budget: 160000,
                requirements: 'Large projection screen, simultaneous translation booths, VIP lounge',
                source: 'Phone Call', status: 'Converted', assigned_to: 'Nirosha P.',
                follow_up_date: dt(10),
                notes: 'Converted to reservation on 09/06. Pending deposit.'
            },
            {
                ref_no: 'INQ-20260609-1006',
                customer_name: 'Dushan Kulathunga', customer_phone: '+94 72 777 8888',
                customer_email: 'dushan.k@outlook.com', event_type: 'Product Launch',
                preferred_date: dt(35), flexible_date: 1, num_guests: 120,
                room: 'Araliya Grand Banquet', budget: 120000,
                requirements: 'LED backdrop, media wall, cocktail reception, product display area',
                source: 'Website', status: 'In Progress', assigned_to: 'Suresh K.',
                follow_up_date: dt(3),
                notes: 'Startup product launch. Needs marketing support package.'
            },
            {
                ref_no: 'INQ-20260609-1007',
                customer_name: 'Chamindi Weerasinghe', customer_phone: '+94 75 999 0000',
                customer_email: 'chamindi.w@gmail.com', event_type: 'Wedding',
                preferred_date: dt(90), flexible_date: 1, num_guests: 250,
                room: 'Mihintale Pavilion', budget: 200000,
                requirements: 'Traditional Sri Lankan wedding setup, poruwa ceremony, full catering',
                source: 'Referral', status: 'Rejected', assigned_to: 'Nirosha P.',
                follow_up_date: null,
                notes: 'Budget mismatch. Venue not available on preferred dates.'
            },
            {
                ref_no: 'INQ-20260609-1008',
                customer_name: 'Sampath Bank PLC', customer_phone: '+94 11 230 4567',
                customer_email: 'csr@sampath.lk', event_type: 'Gala Dinner',
                preferred_date: dt(50), flexible_date: 0, num_guests: 300,
                room: 'Araliya Grand Banquet', budget: 175000,
                requirements: 'Black-tie gala, 5-course dinner, live orchestra, award ceremony',
                source: 'Email', status: 'Quoted', assigned_to: 'Suresh K.',
                follow_up_date: dt(-2),
                notes: 'OVERDUE FOLLOW-UP. Quote was sent 5 days ago.'
            },
        ];

        for (const inq of inquiries) {
            const rid = inq.room ? roomId(inq.room) : null;
            await run(`INSERT INTO inquiries
                (ref_no, customer_name, customer_phone, customer_email, event_type,
                 preferred_date, flexible_date, num_guests, preferred_room_id,
                 budget, requirements, source, status, assigned_to, follow_up_date,
                 notes, created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
                [inq.ref_no, inq.customer_name, inq.customer_phone, inq.customer_email,
                 inq.event_type, inq.preferred_date, inq.flexible_date, inq.num_guests,
                 rid, inq.budget, inq.requirements, inq.source, inq.status,
                 inq.assigned_to, inq.follow_up_date, inq.notes]);
        }
        log(`Inserted ${inquiries.length} inquiries`);
    } else {
        warn(`Inquiries already exist (${inqCount} rows) — skipping`);
    }

    // ── Summary ────────────────────────────────────────────────────────────────
    const summary = {
        'Event Rooms':   (await get("SELECT COUNT(*) as c FROM event_rooms")).c,
        'Customers':     (await get("SELECT COUNT(*) as c FROM customers")).c,
        'Reservations':  (await get("SELECT COUNT(*) as c FROM reservations")).c,
        'Inquiries':     (await get("SELECT COUNT(*) as c FROM inquiries")).c,
    };

    console.log('\n\x1b[1m\x1b[32m  ✅  Seeding complete!\x1b[0m');
    console.log('\x1b[2m  ─────────────────────────────────────\x1b[0m');
    for (const [table, count] of Object.entries(summary)) {
        console.log(`\x1b[32m     ${table.padEnd(16)}: ${count} records\x1b[0m`);
    }
    console.log('\x1b[2m  ─────────────────────────────────────\x1b[0m');
    console.log('\n  👉  Visit \x1b[4mhttp://localhost:302\x1b[0m to see the data\n');
    db.close();
}

seed().catch(err => {
    console.error('\x1b[31m  ✖  Seed error:\x1b[0m', err.message);
    db.close();
});
