const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./database');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '/'))); // Serve static files from root

// --- DATABASE HELPERS (PROMISES) ---
const runQuery = (query, params = []) => new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
        if (err) reject(err);
        else resolve(this);
    });
});

const getQuery = (query, params = []) => new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
    });
});

const allQuery = (query, params = []) => new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

// --- VALIDATION HELPER ---
const validate = (fields, data) => {
    const errors = [];
    fields.forEach(field => {
        if (data[field] === undefined || data[field] === null || data[field] === '') {
            errors.push(`${field} is required`);
        }
    });
    return errors;
};

// --- AUDIT LOG HELPER ---
const addAuditLog = async (userId, action, targetType, targetId, details) => {
    try {
        await runQuery(
            "INSERT INTO audit_logs (user_id, action, target_type, target_id, details, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
            [userId, action, targetType, targetId, details, new Date().toISOString()]
        );
    } catch (err) {
        console.error("Audit log failed:", err);
    }
};

// --- AUTH/RBAC MIDDLEWARE ---
const authorize = (roles = []) => {
    return (req, res, next) => {
        const userId = req.headers['x-user-id'];
        const userRole = req.headers['x-user-role'];

        if (!userId) {
            return res.status(401).json({ error: "Authentication required" });
        }

        if (roles.length > 0 && !roles.includes(userRole)) {
            return res.status(403).json({ error: "Forbidden: Insufficient permissions" });
        }

        next();
    };
};

// Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const errors = validate(['username', 'password'], req.body);
    if (errors.length > 0) return res.status(400).json({ error: errors.join(', ') });

    try {
        const user = await getQuery("SELECT id, username, role, name FROM users WHERE username = ? AND password = ?", [username, password]);
        if (!user) return res.status(401).json({ error: "Invalid username or password" });
        res.json({ user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- USER MANAGEMENT API ---

// Get all users
app.get('/api/users', async (req, res) => {
    try {
        const rows = await allQuery("SELECT id, username, role, name FROM users");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create user
app.post('/api/users', async (req, res) => {
    const { username, password, role, name } = req.body;
    const errors = validate(['username', 'password', 'role', 'name'], req.body);
    if (errors.length > 0) return res.status(400).json({ error: errors.join(', ') });
    
    if (username.length < 3) return res.status(400).json({ error: "Username must be at least 3 characters" });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
    if (!['admin', 'cashier', 'kitchen'].includes(role)) return res.status(400).json({ error: "Invalid role" });

    try {
        const existing = await getQuery("SELECT id FROM users WHERE username = ?", [username]);
        if (existing) return res.status(400).json({ error: "Username already exists" });
        
        const result = await runQuery("INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)", 
            [username, password, role, name]);
        res.json({ id: result.lastID, username, role, name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update user
app.put('/api/users/:id', async (req, res) => {
    const { role, name, password } = req.body;
    const errors = validate(['role', 'name'], req.body);
    if (errors.length > 0) return res.status(400).json({ error: errors.join(', ') });
    if (!['admin', 'cashier', 'kitchen'].includes(role)) return res.status(400).json({ error: "Invalid role" });
    if (password && password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
    
    try {
        let query = "UPDATE users SET role = ?, name = ? WHERE id = ?";
        let params = [role, name, req.params.id];
        
        if (password) {
            query = "UPDATE users SET role = ?, name = ?, password = ? WHERE id = ?";
            params = [role, name, password, req.params.id];
        }
        
        const result = await runQuery(query, params);
        if (result.changes === 0) return res.status(404).json({ error: "User not found" });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- MENU & CATEGORIES API ---
app.get('/api/categories', async (req, res) => {
    try {
        const rows = await allQuery("SELECT * FROM categories");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- DISHES API ---
app.get('/api/dishes', async (req, res) => {
    try {
        const rows = await allQuery("SELECT * FROM dishes");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/dishes', authorize(['admin']), async (req, res) => {
    const { name, category_id, price, image } = req.body;
    const errors = validate(['name', 'category_id', 'price'], req.body);
    if (errors.length > 0) return res.status(400).json({ error: errors.join(', ') });
    if (parseFloat(price) <= 0) return res.status(400).json({ error: "Price must be a positive number" });

    try {
        const result = await runQuery("INSERT INTO dishes (name, category_id, price, image) VALUES (?, ?, ?, ?)", [name, category_id, price, image]);
        await addAuditLog(req.headers['x-user-id'], 'CREATE', 'DISH', result.lastID, `Created dish ${name} ($${price})`);
        res.json({ id: result.lastID, name, category_id, price, image });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/dishes/:id', authorize(['admin']), async (req, res) => {
    const { name, category_id, price, image } = req.body;
    const errors = validate(['name', 'category_id', 'price'], req.body);
    if (errors.length > 0) return res.status(400).json({ error: errors.join(', ') });
    if (parseFloat(price) <= 0) return res.status(400).json({ error: "Price must be a positive number" });

    try {
        const result = await runQuery("UPDATE dishes SET name = ?, category_id = ?, price = ?, image = ? WHERE id = ?", [name, category_id, price, image, req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: "Dish not found" });
        await addAuditLog(req.headers['x-user-id'], 'UPDATE', 'DISH', req.params.id, `Updated dish ${name} ($${price})`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/dishes/:id', authorize(['admin']), async (req, res) => {
    try {
        await runQuery("DELETE FROM dishes WHERE id = ?", [req.params.id]);
        await addAuditLog(req.headers['x-user-id'], 'DELETE', 'DISH', req.params.id, `Deleted dish ID ${req.params.id}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Place Order
app.post('/api/orders', async (req, res) => {
    const { items, total, orderType, paymentMethod, customer_id, table_id } = req.body;
    const errors = validate(['items', 'total', 'orderType', 'paymentMethod'], req.body);
    
    if (errors.length > 0) return res.status(400).json({ error: errors.join(', ') });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Order must contain items" });
    if (parseFloat(total) <= 0) return res.status(400).json({ error: "Total must be a positive number" });

    const orderId = 'ORD-' + Math.floor(1000 + Math.random() * 9000);
    const date = new Date().toISOString();

    try {
        await runQuery("BEGIN TRANSACTION");

        // 1. Stock Validation Check
        const totalIngredientsNeeded = {};

        for (const item of items) {
            const ingredients = await allQuery("SELECT di.inventory_id, i.name, i.stock_qty, di.qty_required FROM dish_ingredients di JOIN inventory i ON di.inventory_id = i.id WHERE di.dish_id = ?", [item.dish.id]);
            
            for (const ing of ingredients) {
                const needed = ing.qty_required * item.qty;
                if (!totalIngredientsNeeded[ing.inventory_id]) {
                    totalIngredientsNeeded[ing.inventory_id] = {
                        name: ing.name,
                        currentStock: ing.stock_qty,
                        needed: 0
                    };
                }
                totalIngredientsNeeded[ing.inventory_id].needed += needed;
            }
        }

        // Validate aggregate stock
        for (const id in totalIngredientsNeeded) {
            const ing = totalIngredientsNeeded[id];
            if (ing.currentStock < ing.needed) {
                await runQuery("ROLLBACK");
                return res.status(400).json({ error: `Insufficient stock for ${ing.name}. Total needed: ${ing.needed}, available: ${ing.currentStock}.` });
            }
        }

        // 2. Insert Order
        await runQuery("INSERT INTO orders (id, total, date, status, order_type, payment_method, customer_id, table_id) VALUES (?, ?, ?, 'Preparing', ?, ?, ?, ?)", 
            [orderId, total, date, orderType, paymentMethod, customer_id, table_id]);

        // 3. Process Items & Update Inventory
        for (const item of items) {
            await runQuery("INSERT INTO order_items (order_id, dish_id, qty, price_at_time) VALUES (?, ?, ?, ?)",
                [orderId, item.dish.id, item.qty, item.dish.price]);
                
            const ingredients = await allQuery("SELECT inventory_id, qty_required FROM dish_ingredients WHERE dish_id = ?", [item.dish.id]);
            for (const ing of ingredients) {
                await runQuery("UPDATE inventory SET stock_qty = stock_qty - ? WHERE id = ?", [ing.qty_required * item.qty, ing.inventory_id]);
            }
        }

        // 4. Update Customer Loyalty & Total Spent
        if (customer_id) {
            // Points: 1 point per $1 spent (rounded)
            const pointsToAdd = Math.round(total);
            await runQuery("UPDATE customers SET loyalty_points = loyalty_points + ?, total_spent = total_spent + ? WHERE id = ?", 
                [pointsToAdd, total, customer_id]);
        }

        // 5. Update Table Status if Dine-In
        if (orderType === 'Dine In' && table_id) {
            await runQuery("UPDATE restaurant_tables SET status = 'Occupied' WHERE id = ?", [table_id]);
        }

        // 6. Audit Log
        await addAuditLog(req.headers['x-user-id'], 'CREATE', 'ORDER', orderId, `Placed ${orderType} order for ${total}`);

        await runQuery("COMMIT");

        const newOrder = { id: orderId, total, date, status: 'Preparing', order_type: orderType, items };
        io.emit('new_order', newOrder);
        res.json(newOrder);

    } catch (err) {
        await runQuery("ROLLBACK");
        console.error("Order processing error:", err);
        res.status(500).json({ error: "Failed to process order: " + err.message });
    }
});

// Get Orders
app.get('/api/orders', async (req, res) => {
    try {
        const orders = await allQuery("SELECT * FROM orders ORDER BY date DESC");
        if (orders.length === 0) return res.json([]);

        const query = `
            SELECT oi.*, d.name as dish_name 
            FROM order_items oi 
            LEFT JOIN dishes d ON oi.dish_id = d.id
        `;
        const items = await allQuery(query);
        
        // Map items to orders
        orders.forEach(order => {
            order.items = items.filter(i => i.order_id === order.id).map(i => ({
                dish: { id: i.dish_id, name: i.dish_name || 'Deleted Dish', price: i.price_at_time },
                qty: i.qty
            }));
        });
        
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cancel Order & Refund (Admin Only)
app.post('/api/orders/:id/cancel', authorize(['admin']), async (req, res) => {
    try {
        const orderId = req.params.id;
        const { reason } = req.body;
        
        if (!reason) return res.status(400).json({ error: "Cancellation reason is required" });

        const order = await getQuery("SELECT * FROM orders WHERE id = ?", [orderId]);
        if (!order) return res.status(404).json({ error: "Order not found" });
        if (order.status === 'Cancelled') return res.status(400).json({ error: "Order already cancelled" });

        await runQuery("BEGIN TRANSACTION");

        // 1. Get Order Items
        const items = await allQuery("SELECT * FROM order_items WHERE order_id = ?", [orderId]);

        // 2. Restore Inventory Stock
        for (const item of items) {
            const ingredients = await allQuery("SELECT inventory_id, qty_required FROM dish_ingredients WHERE dish_id = ?", [item.dish_id]);
            for (const ing of ingredients) {
                await runQuery("UPDATE inventory SET stock_qty = stock_qty + ? WHERE id = ?", [ing.qty_required * item.qty, ing.inventory_id]);
            }
        }

        // 3. Reverse Loyalty Points
        if (order.customer_id) {
            const pointsToSubtract = Math.round(order.total);
            await runQuery("UPDATE customers SET loyalty_points = loyalty_points - ?, total_spent = total_spent - ? WHERE id = ?", 
                [pointsToSubtract, order.total, order.customer_id]);
        }

        // 4. Update Order Status
        await runQuery("UPDATE orders SET status = 'Cancelled' WHERE id = ?", [orderId]);

        // 5. Audit Log
        await addAuditLog(req.headers['x-user-id'], 'CANCEL', 'ORDER', orderId, `Cancelled order ${orderId}. Reason: ${reason} (Total: $${order.total})`);

        await runQuery("COMMIT");
        
        io.emit('order_updated', { id: orderId, status: 'Cancelled' });
        res.json({ success: true });

    } catch (err) {
        await runQuery("ROLLBACK");
        console.error("Cancellation error:", err);
        res.status(500).json({ error: "Failed to cancel order: " + err.message });
    }
});

// Update Order Status (For KDS)
app.patch('/api/orders/:id/status', async (req, res) => {
    const { status } = req.body;
    try {
        await runQuery("UPDATE orders SET status = ? WHERE id = ?", [status, req.params.id]);
        await addAuditLog(req.headers['x-user-id'], 'UPDATE_STATUS', 'ORDER', req.params.id, `Order ${req.params.id} marked as ${status}`);
        io.emit('order_updated', { id: req.params.id, status });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Table Status
app.patch('/api/tables/:id/status', async (req, res) => {
    const { status } = req.body;
    try {
        await runQuery("UPDATE restaurant_tables SET status = ? WHERE id = ?", [status, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- System Settings ---
app.get('/api/settings', async (req, res) => {
    try {
        const rows = await allQuery("SELECT * FROM system_settings");
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Audit Logs (Admin Only)
app.get('/api/audit-logs', authorize(['admin']), async (req, res) => {
    try {
        const logs = await allQuery("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 100");
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/settings', authorize(['admin']), async (req, res) => {
    const settings = req.body;
    try {
        for (const [key, value] of Object.entries(settings)) {
            await runQuery("INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)", [key, value]);
        }
        await addAuditLog(req.headers['x-user-id'], 'UPDATE', 'SETTINGS', 'global', `Updated settings: ${JSON.stringify(settings)}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- INVENTORY API ---
app.get('/api/inventory', async (req, res) => {
    try {
        const rows = await allQuery("SELECT * FROM inventory");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/inventory', authorize(['admin']), async (req, res) => {
    const { name, stock_qty, unit, low_stock_threshold, expiry_date } = req.body;
    const errors = validate(['name', 'stock_qty', 'unit', 'low_stock_threshold'], req.body);
    if (errors.length > 0) return res.status(400).json({ error: errors.join(', ') });
    
    if (parseFloat(stock_qty) < 0) return res.status(400).json({ error: "Stock quantity cannot be negative" });
    if (parseFloat(low_stock_threshold) < 0) return res.status(400).json({ error: "Threshold cannot be negative" });

    try {
        const result = await runQuery("INSERT INTO inventory (name, stock_qty, unit, low_stock_threshold, expiry_date) VALUES (?, ?, ?, ?, ?)", 
            [name, stock_qty, unit, low_stock_threshold, expiry_date]);
        await addAuditLog(req.headers['x-user-id'], 'CREATE', 'INVENTORY', result.lastID, `Added inventory ${name} (${stock_qty} ${unit})`);
        res.json({ id: result.lastID, name, stock_qty, unit, low_stock_threshold, expiry_date });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/inventory/:id', authorize(['admin']), async (req, res) => {
    const { name, stock_qty, unit, low_stock_threshold, expiry_date } = req.body;
    const errors = validate(['name', 'stock_qty', 'unit', 'low_stock_threshold'], req.body);
    if (errors.length > 0) return res.status(400).json({ error: errors.join(', ') });

    if (parseFloat(stock_qty) < 0) return res.status(400).json({ error: "Stock quantity cannot be negative" });
    if (parseFloat(low_stock_threshold) < 0) return res.status(400).json({ error: "Threshold cannot be negative" });

    try {
        const result = await runQuery("UPDATE inventory SET name=?, stock_qty=?, unit=?, low_stock_threshold=?, expiry_date=? WHERE id=?", 
            [name, stock_qty, unit, low_stock_threshold, expiry_date, req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: "Inventory item not found" });
        await addAuditLog(req.headers['x-user-id'], 'UPDATE', 'INVENTORY', req.params.id, `Updated inventory ${name} to ${stock_qty} ${unit}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/inventory/:id', authorize(['admin']), async (req, res) => {
    try {
        await runQuery("DELETE FROM inventory WHERE id = ?", [req.params.id]);
        await addAuditLog(req.headers['x-user-id'], 'DELETE', 'INVENTORY', req.params.id, `Deleted inventory ID ${req.params.id}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- TABLES API ---
app.get('/api/tables', async (req, res) => {
    try {
        const rows = await allQuery("SELECT * FROM restaurant_tables");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tables', authorize(['admin']), async (req, res) => {
    const { name, seats } = req.body;
    const errors = validate(['name', 'seats'], req.body);
    if (errors.length > 0) return res.status(400).json({ error: errors.join(', ') });
    if (parseInt(seats) <= 0) return res.status(400).json({ error: "Seats must be a positive number" });

    try {
        const result = await runQuery("INSERT INTO restaurant_tables (name, status, seats) VALUES (?, 'Available', ?)", [name, seats]);
        await addAuditLog(req.headers['x-user-id'], 'CREATE', 'TABLE', result.lastID, `Created table ${name} (${seats} seats)`);
        res.json({ id: result.lastID, name, status: 'Available', seats });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tables/:id', authorize(['admin']), async (req, res) => {
    const { name, status, seats } = req.body;
    const errors = validate(['name', 'status', 'seats'], req.body);
    if (errors.length > 0) return res.status(400).json({ error: errors.join(', ') });
    if (parseInt(seats) <= 0) return res.status(400).json({ error: "Seats must be a positive number" });
    if (!['Available', 'Occupied', 'Reserved'].includes(status)) return res.status(400).json({ error: "Invalid status" });

    try {
        const result = await runQuery("UPDATE restaurant_tables SET name=?, status=?, seats=? WHERE id=?", [name, status, seats, req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: "Table not found" });
        await addAuditLog(req.headers['x-user-id'], 'UPDATE', 'TABLE', req.params.id, `Updated table ${name} to ${status}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.patch('/api/tables/:id/status', async (req, res) => {
    const { status } = req.body;
    if (!['Available', 'Occupied', 'Reserved'].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
    }

    try {
        const result = await runQuery("UPDATE restaurant_tables SET status=? WHERE id=?", [status, req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: "Table not found" });
        await addAuditLog(req.headers['x-user-id'], 'UPDATE_STATUS', 'TABLE', req.params.id, `Changed table status to ${status}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- USERS API (Admin Only)
app.get('/api/users', authorize(['admin']), async (req, res) => {
    try {
        const users = await allQuery("SELECT id, username, role, name FROM users");
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', authorize(['admin']), async (req, res) => {
    const { username, password, role, name } = req.body;
    const errors = validate(['username', 'password', 'role', 'name'], req.body);
    if (errors.length > 0) return res.status(400).json({ error: errors.join(', ') });

    try {
        const result = await runQuery("INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)", [username, password, role, name]);
        await addAuditLog(req.headers['x-user-id'], 'CREATE', 'USER', result.lastID, `Created user ${username} with role ${role}`);
        res.json({ id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', authorize(['admin']), async (req, res) => {
    try {
        await runQuery("DELETE FROM users WHERE id = ?", [req.params.id]);
        await addAuditLog(req.headers['x-user-id'], 'DELETE', 'USER', req.params.id, `Deleted user ID ${req.params.id}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/customers', async (req, res) => {
    try {
        const rows = await allQuery("SELECT * FROM customers");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/customers', authorize(['admin', 'cashier']), async (req, res) => {
    const { name, phone, email } = req.body;
    const errors = validate(['name', 'phone'], req.body);
    if (errors.length > 0) return res.status(400).json({ error: errors.join(', ') });

    try {
        const result = await runQuery("INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)", [name, phone, email]);
        res.json({ id: result.lastID, name, phone, email, loyalty_points: 0, total_spent: 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/customers/:id', authorize(['admin', 'cashier']), async (req, res) => {
    const { name, phone, email, loyalty_points, total_spent } = req.body;
    const errors = validate(['name', 'phone'], req.body);
    if (errors.length > 0) return res.status(400).json({ error: errors.join(', ') });

    try {
        const result = await runQuery("UPDATE customers SET name=?, phone=?, email=?, loyalty_points=?, total_spent=? WHERE id=?", 
            [name, phone, email, loyalty_points, total_spent, req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: "Customer not found" });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/customers/:id', authorize(['admin']), async (req, res) => {
    try {
        await runQuery("DELETE FROM customers WHERE id = ?", [req.params.id]);
        await addAuditLog(req.headers['x-user-id'], 'DELETE', 'CUSTOMER', req.params.id, `Deleted customer ID ${req.params.id}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/tables/:id', authorize(['admin']), async (req, res) => {
    try {
        await runQuery("DELETE FROM restaurant_tables WHERE id = ?", [req.params.id]);
        await addAuditLog(req.headers['x-user-id'], 'DELETE', 'TABLE', req.params.id, `Deleted table ID ${req.params.id}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ANALYTICS API (Admin Only)
app.get('/api/analytics', authorize(['admin']), async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Basic Stats
        const totalStats = await getQuery("SELECT COUNT(*) as count, SUM(total) as revenue FROM orders");
        const todayStats = await getQuery("SELECT COUNT(*) as count, SUM(total) as revenue FROM orders WHERE date LIKE ?", [`${today}%`]);
        
        // Popularity Matrix (Top 5 Best Sellers)
        const popularity = await allQuery(`
            SELECT d.name, SUM(oi.qty) as units_sold, SUM(oi.qty * oi.price_at_time) as revenue
            FROM order_items oi
            JOIN dishes d ON oi.dish_id = d.id
            GROUP BY oi.dish_id
            ORDER BY units_sold DESC
            LIMIT 5
        `);

        // Peak Hours (Orders by Hour)
        const peakHours = await allQuery(`
            SELECT strftime('%H', date) as hour, COUNT(*) as count
            FROM orders
            GROUP BY hour
            ORDER BY hour ASC
        `);

        // Sales Trends (This Week vs Last Week)
        const weeklyTrends = await allQuery(`
            SELECT date, SUM(total) as revenue
            FROM orders
            WHERE date >= date('now', '-14 days')
            GROUP BY date(date)
            ORDER BY date DESC
        `);

        // Low Stock Alerts
        const lowStock = await allQuery("SELECT * FROM inventory WHERE stock_qty <= low_stock_threshold");

        res.json({
            totalOrders: totalStats.count || 0,
            totalRevenue: totalStats.revenue || 0,
            todayRevenue: todayStats.revenue || 0,
            popularity,
            peakHours,
            weeklyTrends,
            lowStockAlerts: lowStock
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- SETTINGS API ---
const defaultSettings = {
    business_name: 'Tasty Station',
    business_address: '123 Culinary Ave, Foodville',
    business_phone: '+1 555-123-4567',
    business_email: 'info@tastystation.com',
    tax_rate: '10',
    currency_symbol: '$',
    receipt_footer: 'Thank you for dining with us!',
    allow_discounts: 'true',
    low_stock_threshold: '10',
    order_prefix: 'ORD'
};

app.get('/api/settings', async (req, res) => {
    try {
        // Ensure table exists
        await runQuery(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
        // Seed defaults if empty
        const existing = await allQuery("SELECT key FROM settings");
        if (existing.length === 0) {
            for (const [key, value] of Object.entries(defaultSettings)) {
                await runQuery("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [key, value]);
            }
        }
        const rows = await allQuery("SELECT key, value FROM settings");
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/settings', authorize(['admin']), async (req, res) => {
    try {
        await runQuery(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
        const updates = req.body;
        for (const [key, value] of Object.entries(updates)) {
            await runQuery("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, String(value)]);
        }
        await addAuditLog(req.headers['x-user-id'], 'UPDATE', 'SETTINGS', 'all', 'Updated system settings');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- AUDIT API ---
app.post('/api/audit', async (req, res) => {
    const { action, entity_type, entity_id, details } = req.body;
    try {
        const userId = req.headers['x-user-id'] || 1;
        await addAuditLog(userId, action, entity_type, entity_id, details);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- SOCKET.IO ---
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
