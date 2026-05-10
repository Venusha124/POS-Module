const db = require('./database');

const tables = [
    'order_items',
    'orders',
    'dish_ingredients',
    'dishes',
    'categories',
    'inventory',
    'restaurant_tables',
    'audit_logs',
    'customers',
    'settings',
    'users'
];

db.serialize(() => {
    db.run("BEGIN TRANSACTION");
    
    tables.forEach(table => {
        db.run(`DELETE FROM ${table}`);
        db.run(`DELETE FROM sqlite_sequence WHERE name='${table}'`);
    });

    // Re-seed essential data or leave it to database.js
    console.log("Database truncated successfully.");
    
    db.run("COMMIT", (err) => {
        if (err) {
            console.error("Truncate failed:", err);
        } else {
            console.log("Transaction committed.");
            console.log("NOTE: Restart the server to trigger re-seeding if needed, or run the app to see a fresh start.");
        }
        process.exit();
    });
});
