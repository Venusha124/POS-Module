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

    // 9. System Settings
    db.run(`CREATE TABLE IF NOT EXISTS system_settings (
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

    // Seed Data (if empty)
    db.get("SELECT COUNT(*) as count FROM categories", (err, row) => {
        if (row.count === 0) {
            console.log("Seeding initial data...");
            
            // Seed Categories
            const stmt = db.prepare("INSERT INTO categories VALUES (?, ?, ?)");
            stmt.run('desserts', 'Desserts', '🍰');
            stmt.run('drinks', 'Drinks', '🍹');
            stmt.run('fast_foods', 'Fast Foods', '🍔');
            stmt.finalize();

            // Seed Dishes
            const stmt2 = db.prepare("INSERT INTO dishes (name, category_id, price, image) VALUES (?, ?, ?, ?)");
            stmt2.run('Cheese Syrniki Pancakes', 'desserts', 8.00, 'https://images.unsplash.com/photo-1554520735-0a1429b1317c?auto=format&fit=crop&w=200&q=80');
            stmt2.run('Apple Stuffed Pancake', 'desserts', 10.00, 'https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&w=200&q=80');
            stmt2.run('Terracotta Bowl', 'desserts', 12.00, 'https://images.unsplash.com/photo-1511690656952-34342bb7c2f2?auto=format&fit=crop&w=200&q=80');
            stmt2.run('Croissant Dessert', 'desserts', 15.00, 'https://images.unsplash.com/photo-1555507036-ab1e4006a2a0?auto=format&fit=crop&w=200&q=80');
            stmt2.run('Granola Banana & Berry', 'desserts', 10.00, 'https://images.unsplash.com/photo-1495214783159-3503fd1b572d?auto=format&fit=crop&w=200&q=80');
            stmt2.run('Vanilla Cherry Cupcake', 'desserts', 8.00, 'https://images.unsplash.com/photo-1550617931-e17a7b70dce2?auto=format&fit=crop&w=200&q=80');
            stmt2.run('Belgian Waffles', 'desserts', 20.00, 'https://images.unsplash.com/photo-1562376552-0d160a2f9fa4?auto=format&fit=crop&w=200&q=80');
            stmt2.run('Granola with Yoghurt', 'desserts', 15.00, 'https://images.unsplash.com/photo-1484723091791-00d759ce4342?auto=format&fit=crop&w=200&q=80');
            stmt2.run('Muesli Bowl', 'desserts', 10.00, 'https://images.unsplash.com/photo-1517686469429-8bdb88b9f907?auto=format&fit=crop&w=200&q=80');
            stmt2.run('Waffles with Ice-cream', 'desserts', 10.00, 'https://images.unsplash.com/photo-1584589167171-541ce45f1eea?auto=format&fit=crop&w=200&q=80');
            stmt2.run('Classic Burger', 'fast_foods', 15.00, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=200&q=80');
            stmt2.run('Spicy Chicken Wings', 'fast_foods', 12.00, 'https://images.unsplash.com/photo-1569058242253-1df3ad1cbcc4?auto=format&fit=crop&w=200&q=80');
            stmt2.run('Fresh Lemonade', 'drinks', 5.00, 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=200&q=80');
            stmt2.run('Iced Latte', 'drinks', 6.00, 'https://images.unsplash.com/photo-1461023058943-07cb1ce8db1b?auto=format&fit=crop&w=200&q=80');
            stmt2.finalize();

            // Seed Admin User
            db.run("INSERT INTO users (username, password, role, name) VALUES ('admin', '1234', 'admin', 'Admin User')");
            db.run("INSERT INTO users (username, password, role, name) VALUES ('kitchen', '1234', 'kitchen', 'Kitchen Staff')");
            db.run("INSERT INTO users (username, password, role, name) VALUES ('cashier', '1234', 'cashier', 'Front Desk Cashier')");
            
            // Seed Inventory
            db.run("INSERT INTO inventory (name, stock_qty, unit, low_stock_threshold) VALUES ('Burger Buns', 100, 'pcs', 20)");
            db.run("INSERT INTO inventory (name, stock_qty, unit, low_stock_threshold) VALUES ('Beef Patty', 100, 'pcs', 20)");
            
            // Link Burger to Inventory
            db.run("INSERT INTO dish_ingredients (dish_id, inventory_id, qty_required) VALUES (2, 1, 1)"); // 1 Bun
            db.run("INSERT INTO dish_ingredients (dish_id, inventory_id, qty_required) VALUES (2, 2, 1)"); // 1 Patty
            
            // Seed Restaurant Tables
            for (let i=1; i<=10; i++) {
                db.run("INSERT INTO restaurant_tables (name, status, seats) VALUES (?, 'Available', 4)", [`Table ${i}`]);
            }

            // Seed System Settings
            db.run("INSERT INTO system_settings (key, value) VALUES ('tax_percentage', '10')");
            db.run("INSERT INTO system_settings (key, value) VALUES ('currency', '$')");
            db.run("INSERT INTO system_settings (key, value) VALUES ('restaurant_name', 'TASTY OF ASCENDIA')");

            // Seed Customers
            db.run("INSERT INTO customers (name, phone, email, loyalty_points, total_spent) VALUES ('John Doe', '123-456-7890', 'john@example.com', 150, 450.00)");
            db.run("INSERT INTO customers (name, phone, email, loyalty_points, total_spent) VALUES ('Jane Smith', '987-654-3210', 'jane@example.com', 85, 210.50)");
            db.run("INSERT INTO customers (name, phone, email, loyalty_points, total_spent) VALUES ('Robert Brown', '555-0199', 'robert@example.com', 20, 55.00)");
        }
    });
});

module.exports = db;
