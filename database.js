const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'pos_data.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // 1. Users Table (Roles: admin, cashier, kitchen)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT,
        name TEXT
    )`);

    // 2. Categories
    db.run(`CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT,
        icon TEXT
    )`);

    // 3. Dishes
    db.run(`CREATE TABLE IF NOT EXISTS dishes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        category_id TEXT,
        price REAL,
        image TEXT,
        FOREIGN KEY(category_id) REFERENCES categories(id)
    )`);

    // 4. Inventory (Ingredients)
    db.run(`CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        stock_qty REAL,
        unit TEXT,
        low_stock_threshold REAL,
        expiry_date TEXT
    )`);

    // 5. Dish Ingredients (Many-to-Many mapping)
    db.run(`CREATE TABLE IF NOT EXISTS dish_ingredients (
        dish_id INTEGER,
        inventory_id INTEGER,
        qty_required REAL,
        FOREIGN KEY(dish_id) REFERENCES dishes(id),
        FOREIGN KEY(inventory_id) REFERENCES inventory(id)
    )`);

    // 6. Orders
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        total REAL,
        date TEXT,
        status TEXT, -- Pending, Preparing, Ready, Completed
        order_type TEXT, -- Dine In, Takeaway
        payment_method TEXT, -- Cash, Card, Online
        cashier_id INTEGER,
        customer_id INTEGER,
        FOREIGN KEY(cashier_id) REFERENCES users(id),
        FOREIGN KEY(customer_id) REFERENCES customers(id)
    )`, (err) => {
        if (!err) {
            // Check if customer_id column exists, if not add it
            db.run("ALTER TABLE orders ADD COLUMN customer_id INTEGER", (err) => {
                if (err && !err.message.includes("duplicate column name")) console.error(err);
            });
            db.run("ALTER TABLE orders ADD COLUMN table_id INTEGER", (err) => {
                if (err && !err.message.includes("duplicate column name")) console.error(err);
            });
        }
    });

    // 7. Order Items
    db.run(`CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT,
        dish_id INTEGER,
        qty INTEGER,
        price_at_time REAL,
        FOREIGN KEY(order_id) REFERENCES orders(id),
        FOREIGN KEY(dish_id) REFERENCES dishes(id)
    )`);

    // 8. Restaurant Tables
    db.run(`CREATE TABLE IF NOT EXISTS restaurant_tables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        status TEXT DEFAULT 'Available',
        seats INTEGER
    )`);

    // 9. System Settings (Unified)
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);

    // 10. Audit Logs
    db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT,
        target_type TEXT,
        target_id TEXT,
        details TEXT,
        timestamp TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // 10. Customers Table
    db.run(`CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        phone TEXT,
        email TEXT,
        loyalty_points INTEGER DEFAULT 0,
        total_spent REAL DEFAULT 0.0
    )`);

    // 11. Event Rooms
    db.run(`CREATE TABLE IF NOT EXISTS event_rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        capacity INTEGER,
        price_per_day REAL,
        type TEXT,
        status TEXT
    )`);

    // 12. Reservations
    db.run(`CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_name TEXT,
        customer_name TEXT,
        customer_phone TEXT,
        room_id INTEGER,
        date_start TEXT,
        date_end TEXT,
        num_guests INTEGER,
        status TEXT,
        total_price REAL,
        FOREIGN KEY(room_id) REFERENCES event_rooms(id)
    )`);

    // Seed Data (if empty)
    db.get("SELECT COUNT(*) as count FROM categories", (err, row) => {
        if (row.count === 0) {
            console.log("Seeding initial data...");
            
            // Seed Categories (Sri Lankan Menu)
            const stmt = db.prepare("INSERT INTO categories VALUES (?, ?, ?)");
            stmt.run('breakfast', 'Breakfast', '🍳');
            stmt.run('lunch',     'Lunch',     '🍱');
            stmt.run('dinner',    'Dinner',    '🌙');
            stmt.run('desserts',  'Desserts',  '🍮');
            stmt.run('drinks',    'Drinks',    '🥤');
            stmt.finalize();

            // Seed Dishes (Sri Lankan Menu)
            const stmt2 = db.prepare("INSERT INTO dishes (name, category_id, price, image) VALUES (?, ?, ?, ?)");
            // Breakfast
            stmt2.run('String Hoppers with coconut sambol and dhal curry', 'breakfast',  350, 'assets/images/menu/sl_breakfast.png');
            stmt2.run('Hoppers with egg and spicy sambol',                 'breakfast',  250, 'assets/images/menu/sl_breakfast.png');
            stmt2.run('Milk Rice served with lunu miris',                  'breakfast',  200, 'assets/images/menu/sl_breakfast.png');
            stmt2.run('Pol Roti with katta sambol',                        'breakfast',  180, 'assets/images/menu/sl_breakfast.png');
            stmt2.run('Pittu with coconut milk and curry',                 'breakfast',  300, 'assets/images/menu/sl_breakfast.png');
            stmt2.run('Ulundu Vadai with chutney',                         'breakfast',  220, 'assets/images/menu/sl_breakfast.png');
            // Lunch
            stmt2.run('Rice and Curry (chicken, fish, dhal, beetroot & mallung)', 'lunch',  650, 'assets/images/menu/sl_lunch.png');
            stmt2.run('Lamprais wrapped in banana leaf',                   'lunch',      850, 'assets/images/menu/sl_lunch.png');
            stmt2.run('Kottu Roti with chicken, cheese, or seafood',       'lunch',      750, 'assets/images/menu/sl_lunch.png');
            stmt2.run('Devilled Chicken with fried rice',                  'lunch',      900, 'assets/images/menu/sl_lunch.png');
            stmt2.run('Parippu Curry with steamed rice',                   'lunch',      450, 'assets/images/menu/sl_lunch.png');
            stmt2.run('Fish Ambul Thiyal',                                 'lunch',      700, 'assets/images/menu/sl_lunch.png');
            // Dinner
            stmt2.run('Chicken Kottu',                                     'dinner',     750, 'assets/images/menu/sl_dinner.png');
            stmt2.run('Seafood Nasi Goreng',                               'dinner',     950, 'assets/images/menu/sl_dinner.png');
            stmt2.run('Chicken Fried Rice',                                'dinner',     700, 'assets/images/menu/sl_dinner.png');
            stmt2.run('Cheese Roti with curry sauce',                      'dinner',     550, 'assets/images/menu/sl_dinner.png');
            stmt2.run('String Hoppers with chicken curry',                 'dinner',     600, 'assets/images/menu/sl_dinner.png');
            stmt2.run('Vegetable Curry with rice',                         'dinner',     500, 'assets/images/menu/sl_dinner.png');
            // Desserts
            stmt2.run('Watalappan',                                        'desserts',   350, 'assets/images/menu/sl_desserts.png');
            stmt2.run('Curd and Treacle',                                  'desserts',   280, 'assets/images/menu/sl_desserts.png');
            stmt2.run('Kokis',                                             'desserts',   200, 'assets/images/menu/sl_desserts.png');
            stmt2.run('Kevum',                                             'desserts',   220, 'assets/images/menu/sl_desserts.png');
            stmt2.run('Aasmi',                                             'desserts',   200, 'assets/images/menu/sl_desserts.png');
            stmt2.run('Fruit Salad with Ice Cream',                        'desserts',   380, 'assets/images/menu/sl_desserts.png');
            // Drinks
            stmt2.run('Ceylon Tea',                                        'drinks',     150, 'assets/images/menu/sl_drinks.png');
            stmt2.run('King Coconut',                                      'drinks',     200, 'assets/images/menu/sl_drinks.png');
            stmt2.run('Faluda',                                            'drinks',     320, 'assets/images/menu/sl_drinks.png');
            stmt2.run('Wood Apple Juice',                                  'drinks',     280, 'assets/images/menu/sl_drinks.png');
            stmt2.run('Avocado Juice',                                     'drinks',     300, 'assets/images/menu/sl_drinks.png');
            stmt2.run('Lime Juice',                                        'drinks',     200, 'assets/images/menu/sl_drinks.png');
            stmt2.finalize();

            // Seed Admin User
            db.run("INSERT INTO users (username, password, role, name) VALUES ('admin', '1234', 'admin', 'Admin User')");
            db.run("INSERT INTO users (username, password, role, name) VALUES ('kitchen', '1234', 'kitchen', 'Kitchen Staff')");
            db.run("INSERT INTO users (username, password, role, name) VALUES ('cashier', '1234', 'cashier', 'Front Desk Cashier')");
            
            // Seed Inventory
            db.run("INSERT INTO inventory (name, stock_qty, unit, low_stock_threshold) VALUES ('Burger Buns', 100, 'pcs', 20)");
            db.run("INSERT INTO inventory (name, stock_qty, unit, low_stock_threshold) VALUES ('Beef Patty', 100, 'pcs', 20)");
            
            // No dish_ingredients pre-seeded for the new menu (can be added via Inventory module)
            
            // Seed Restaurant Tables
            for (let i=1; i<=10; i++) {
                db.run("INSERT INTO restaurant_tables (name, status, seats) VALUES (?, 'Available', 4)", [`Table ${i}`]);
            }

            // Seed System Settings (LKR)
            db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('tax_rate', '10')");
            db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('currency_symbol', 'Rs.')");
            db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('business_name', 'TASTY OF ASCENDIA')");

            // Seed Customers
            db.run("INSERT INTO customers (name, phone, email, loyalty_points, total_spent) VALUES ('John Doe', '123-456-7890', 'john@example.com', 150, 450.00)");
            db.run("INSERT INTO customers (name, phone, email, loyalty_points, total_spent) VALUES ('Jane Smith', '987-654-3210', 'jane@example.com', 85, 210.50)");
            db.run("INSERT INTO customers (name, phone, email, loyalty_points, total_spent) VALUES ('Robert Brown', '555-0199', 'robert@example.com', 20, 55.00)");

            // Seed Event Rooms
            db.run("INSERT INTO event_rooms (name, capacity, price_per_day, type, status) VALUES ('Grand Banquet Hall', 200, 50000.00, 'Banquet', 'Available')");
            db.run("INSERT INTO event_rooms (name, capacity, price_per_day, type, status) VALUES ('Executive Meeting Room', 20, 15000.00, 'Meeting', 'Available')");
            db.run("INSERT INTO event_rooms (name, capacity, price_per_day, type, status) VALUES ('Rooftop Terrace', 100, 30000.00, 'Outdoor', 'Available')");
        }
    });
});

module.exports = db;
