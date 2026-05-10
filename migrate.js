const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'pos_data.db');
const db = new sqlite3.Database(dbPath);

db.run("ALTER TABLE orders ADD COLUMN payment_method TEXT", (err) => {
    if (err) {
        if (err.message.includes('duplicate column name')) {
            console.log("Column already exists.");
        } else {
            console.error("Error adding column:", err.message);
        }
    } else {
        console.log("payment_method column added successfully.");
    }
    db.close();
});
